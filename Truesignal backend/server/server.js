require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { z } = require("zod");

// --- ENVIRONMENT VARIABLES ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const PORT = process.env.PORT || 4000;
const YAHOO_API_URL = process.env.YAHOO_API_URL || "http://localhost:8000";

if (!OPENAI_API_KEY) throw new Error("Missing OpenAI API key. Please set OPENAI_API_KEY in your .env file.");
if (!MONGODB_URI) throw new Error("Missing MongoDB URI. Please set MONGODB_URI in your .env file.");
if (!FRONTEND_ORIGIN) throw new Error("Missing FRONTEND_ORIGIN. Example: https://your-frontend.app");
if (!YAHOO_API_URL) throw new Error("Missing YAHOO_API_URL. Example: http://localhost:8000");

// --- DATABASE SETUP ---
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on("error", (err) => { console.error("MongoDB connection error:", err); process.exit(1); });
db.once("open", () => { console.log("Connected to MongoDB"); });

// --- SCHEMAS & MODELS ---
const WatchlistSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  symbols: [{ type: String }]
});
const Watchlist = mongoose.model("Watchlist", WatchlistSchema);

const FeedbackSchema = new mongoose.Schema({
  user: { type: String, default: "anonymous" },
  message: { type: String, required: true },
  rating: { type: Number, default: null },
  labelType: { type: String, default: null },
  targetField: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
});
const Feedback = mongoose.model("Feedback", FeedbackSchema);

const SearchLogSchema = new mongoose.Schema({
  userId: { type: String, default: "anonymous" },
  query: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String }
});
const SearchLog = mongoose.model("SearchLog", SearchLogSchema);

const NextActionsSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  ticker: { type: String, required: true, index: true },
  actions: [
    {
      id: { type: String, required: true },
      label: { type: String, required: true },
      checked: { type: Boolean, default: false }
    }
  ]
});
const NextActions = mongoose.model("NextActions", NextActionsSchema);

// --- APP SETUP ---
const app = express();
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: false,
  methods: ["GET", "POST", "DELETE", "OPTIONS", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options(/.*/, cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use(helmet());
app.use(compression());
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

// --- IN-MEMORY CACHE FOR DEDUPLICATION (5 min) ---
const aiAnalysisCache = new Map(); // key: sha256 of aiInputs, value: { result, expiresAt }

// --- DEBUG HELPERS ---
function nowMs() { return Date.now(); }
function durMs(t0) { return `${(Date.now() - t0).toFixed(1)}ms`; }
function dbg(tag, data) {
  try {
    console.log(`[AI-ANALYSIS] ${tag}`, data);
  } catch {
    console.log(`[AI-ANALYSIS] ${tag}`, String(data));
  }
}

// --- ZOD SCHEMA FOR AI OUTPUT (v1.1.0) ---
const SignalSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.coerce.number(), z.null()]).optional().default("N/A"),
  state: z.string().optional().default("neutral"),
  comment: z.string().optional().default(""),
  asOf: z.string().optional()
});

const FinancialAnalysisV1 = z.object({
  schemaVersion: z.literal("1.1.0").or(z.string().startsWith("1.")),
  ticker: z.string().optional().default(""),
  decision: z.object({
    ratingLabel: z.string(),
    ratingScore: z.coerce.number(),
    timeHorizon: z.string(),
    riskReward: z.string()
  }),
  entryExit: z.object({
    lastPrice: z.coerce.number(),
    entry: z.coerce.number(),
    stop: z.coerce.number(),
    takeProfits: z.array(z.coerce.number()).min(1).max(3),
    positionSizePct: z.coerce.number(),
    deltasFromLast: z.object({
      entryPct: z.coerce.number(),
      stopPct: z.coerce.number(),
      tp1Pct: z.coerce.number(),
      tp2Pct: z.coerce.number().optional().default(0)
    })
  }),
  risk: z.object({
    riskScore: z.coerce.number(),
    invalidation: z.array(z.string()).optional().default([]),
    volatilityNote: z.string().optional().default("")
  }),
  signalsTop: z.array(SignalSchema).min(1).max(5),
  signalsMore: z.object({
    trend: z.array(SignalSchema).optional(),
    momentum: z.array(SignalSchema).optional(),
    volatility: z.array(SignalSchema).optional(),
    volume: z.array(SignalSchema).optional(),
    others: z.array(SignalSchema).optional()
  }).optional().default({}),
  catalysts: z.array(z.object({
    type: z.string(),
    date: z.string().optional().default(""),
    direction: z.string().optional(),
    note: z.string().optional().default("")
  })).optional().default([]),
  scenarios: z.array(z.object({
    name: z.string(),
    prob: z.coerce.number(),
    target: z.coerce.number(),
    triggers: z.array(z.string()).optional().default([])
  })).min(1).max(3),
  nextActions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    checked: z.boolean()
  })).optional().default([]),
  rationale: z.array(z.string()).max(5).optional().default([]),

  // NEW: structured AI news for the UI
  newsDigest: z.array(z.object({
    title: z.string(),
    date: z.string().optional().default(""),
    sentiment: z.string().optional().default("neutral"),
    source: z.string().optional().default(""),
    url: z.string().optional().default("")
  })).optional().default([]),

  dataFreshness: z.object({
    priceAt: z.string().optional().default(""),
    newsWindow: z.object({
      from: z.string().optional(),
      to: z.string().optional()
    }).optional().default({}),
    metricsAsOf: z.string().optional().default("")
  }),
  legacy: z.object({
    summaryText: z.string().optional().default(""),
    newsSummaryText: z.string().optional().default("")
  }).optional()
});

// --- PRE-VALIDATION SANITIZER (coerce bad types, inject required defaults) ---
function defaultScenariosFromFacts(facts) {
  const last = Number(facts?.qt?.p ?? 0) || 0;
  const atr  = Number(facts?.px?.atr ?? 0) || 0;

  // Simple targets if we lack rich fundamentals
  const base = last ? Number((last + Math.max(atr, last * 0.01)).toFixed(2)) : 0; // +ATR or +1%
  const bull = last ? Number((last + Math.max(2 * atr, last * 0.025)).toFixed(2)) : 0; // +2*ATR or +2.5%
  const bear = last ? Number((last - Math.max(atr, last * 0.01)).toFixed(2)) : 0; // -ATR or -1%

  // Probabilities sum to ~1
  return [
    { name: "Base", prob: 0.6,  target: base, triggers: ["Maintain guidance"] },
    { name: "Bull", prob: 0.25, target: bull, triggers: ["Beat & raise"] },
    { name: "Bear", prob: 0.15, target: bear, triggers: ["Miss or macro shock"] },
  ];
}

/** Coerce common model mistakes into schema-valid shape before Zod validation. */
function sanitizeBeforeValidate(parsed, facts) {
  if (!parsed || typeof parsed !== "object") return parsed;

  // --- helpers ---
  const toStr = (v, fallback = "") => {
    if (v === undefined || v === null) return fallback;
    try { return String(v); } catch { return fallback; }
  };
  const toNum = (v, fallback = 0) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const ensureArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  const normSignalItem = (item) => {
    // Accept string/number and upgrade into a {name,value,state,comment} object
    if (typeof item === "string" || typeof item === "number" || item == null) {
      return { name: toStr(item, "-"), value: "N/A", state: "neutral", comment: "" };
    }
    return {
      name: toStr(item.name, "-"),
      value: (item.value === null || item.value === undefined)
        ? "N/A"
        : (typeof item.value === "number" ? item.value : toStr(item.value, "N/A")),
      state: toStr(item.state, "neutral"),
      comment: toStr(item.comment, ""),
      asOf: item.asOf ? toStr(item.asOf, "") : undefined
    };
  };

  // 1) schemaVersion MUST be string "1.1.0"
  parsed.schemaVersion = "1.1.0";

  // 2) decision: enforce strings + number
  parsed.decision = obj(parsed.decision);
  parsed.decision.ratingLabel  = toStr(parsed.decision.ratingLabel, "Hold");
  parsed.decision.timeHorizon  = toStr(parsed.decision.timeHorizon, "12 months");
  parsed.decision.riskReward   = toStr(parsed.decision.riskReward, "Balanced");
  parsed.decision.ratingScore  = toNum(parsed.decision.ratingScore, 50);

  // 3) entryExit: numbers + takeProfits two nums + deltas numbers
  parsed.entryExit = obj(parsed.entryExit);
  parsed.entryExit.lastPrice   = toNum(parsed.entryExit.lastPrice, toNum(facts?.qt?.p, 0));
  parsed.entryExit.entry       = toNum(parsed.entryExit.entry, parsed.entryExit.lastPrice);
  parsed.entryExit.stop        = toNum(parsed.entryExit.stop, toNum(facts?.px?.atr, 0) ? parsed.entryExit.lastPrice - toNum(facts?.px?.atr, 0) : parsed.entryExit.lastPrice);
  let tps = ensureArray(parsed.entryExit.takeProfits).map((x) => toNum(x, parsed.entryExit.lastPrice));
  tps = tps.slice(0, 2);
  if (tps.length === 0) tps = [parsed.entryExit.lastPrice, parsed.entryExit.lastPrice];
  if (tps.length === 1) tps.push(tps[0]);
  parsed.entryExit.takeProfits = tps;
  parsed.entryExit.positionSizePct = toNum(parsed.entryExit.positionSizePct, 10);
  parsed.entryExit.deltasFromLast = obj(parsed.entryExit.deltasFromLast);
  parsed.entryExit.deltasFromLast.entryPct = toNum(parsed.entryExit.deltasFromLast.entryPct, 0);
  parsed.entryExit.deltasFromLast.stopPct  = toNum(parsed.entryExit.deltasFromLast.stopPct, 0);
  parsed.entryExit.deltasFromLast.tp1Pct   = toNum(parsed.entryExit.deltasFromLast.tp1Pct, 0);
  parsed.entryExit.deltasFromLast.tp2Pct   = toNum(parsed.entryExit.deltasFromLast.tp2Pct, 0);

  // 4) risk: invalidation array of strings; volatilityNote string; riskScore number
  parsed.risk = obj(parsed.risk);
  parsed.risk.riskScore = toNum(parsed.risk.riskScore, 50);
  parsed.risk.invalidation = ensureArray(parsed.risk.invalidation).map((x) => toStr(x, ""));
  parsed.risk.volatilityNote = toStr(parsed.risk.volatilityNote, "");

  // 5) signalsTop: must be exactly 3 objects (not strings)
  let st = ensureArray(parsed.signalsTop).map(normSignalItem);
  st = st.slice(0, 3);
  while (st.length < 3) st.push({ name: "-", value: "N/A", state: "neutral", comment: "" });
  parsed.signalsTop = st;

  // 6) signalsMore.*: each category must be an array of signal objects
  parsed.signalsMore = obj(parsed.signalsMore);
  ["trend", "momentum", "volatility", "volume", "others"].forEach((k) => {
    if (parsed.signalsMore[k] !== undefined) {
      parsed.signalsMore[k] = ensureArray(parsed.signalsMore[k]).map(normSignalItem);
    }
  });

  // 7) catalysts: array of objects with string fields
  parsed.catalysts = ensureArray(parsed.catalysts).map((c) => {
    if (typeof c === "string" || typeof c === "number" || c == null) {
      return { type: toStr(c, "event"), date: "", direction: undefined, note: "" };
    }
    return {
      type: toStr(c.type, "event"),
      date: toStr(c.date, ""),
      direction: c.direction !== undefined ? toStr(c.direction, "") : undefined,
      note: toStr(c.note, "")
    };
    });

  // 8) scenarios: ensure 1..3, coerce types
  let sc = ensureArray(parsed.scenarios).map((s) => {
    if (typeof s === "string" || typeof s === "number" || s == null) {
      return { name: toStr(s, "Base"), prob: 0.6, target: toNum(parsed?.entryExit?.takeProfits?.[0], parsed?.entryExit?.entry || 0), triggers: [] };
    }
    return {
      name: toStr(s.name, "Base"),
      prob: toNum(s.prob, 0.6),
      target: toNum(s.target, toNum(parsed?.entryExit?.takeProfits?.[0], parsed?.entryExit?.entry || 0)),
      triggers: ensureArray(s.triggers).map((x) => toStr(x, ""))
    };
  });
  if (sc.length < 1) sc = defaultScenariosFromFacts(facts);
  sc = sc.slice(0, 3);
  parsed.scenarios = sc;

  // 9) nextActions: array of objects {id,label,checked}
  parsed.nextActions = ensureArray(parsed.nextActions).map((a) => {
    if (typeof a === "string" || typeof a === "number" || a == null) {
      return { id: uuidv4(), label: toStr(a, ""), checked: false };
    }
    return { id: toStr(a.id || uuidv4()), label: toStr(a.label, ""), checked: !!a.checked };
  });

  // 10) rationale: array of strings (truncate to 5)
  parsed.rationale = ensureArray(parsed.rationale).map((x) => toStr(x, "")).filter(Boolean).slice(0, 5);

  // 11) dataFreshness: strings; newsWindow optional object with string fields
  parsed.dataFreshness = obj(parsed.dataFreshness);
  parsed.dataFreshness.priceAt = toStr(parsed.dataFreshness.priceAt, "");
  parsed.dataFreshness.metricsAsOf = toStr(parsed.dataFreshness.metricsAsOf, "");
  if (parsed.dataFreshness.newsWindow !== undefined) {
    const nw = obj(parsed.dataFreshness.newsWindow);
    parsed.dataFreshness.newsWindow = {
      from: nw.from !== undefined ? toStr(nw.from, "") : undefined,
      to:   nw.to   !== undefined ? toStr(nw.to,   "") : undefined
    };
  }

  // 12) legacy: strings
  if (parsed.legacy !== undefined) {
    parsed.legacy = obj(parsed.legacy);
    parsed.legacy.summaryText = toStr(parsed.legacy.summaryText, "");
    parsed.legacy.newsSummaryText = toStr(parsed.legacy.newsSummaryText, "");
  }

  // 13) ticker string (optional in schema, but normalize anyway)
  parsed.ticker = toStr(parsed.ticker, "");

  return parsed;
}

function makeAiFromFacts(facts) {
  const last = facts?.qt?.p ?? null;
  const tp1 = last != null ? Number((last * 1.05).toFixed(2)) : 0;
  const tp2 = last != null ? Number((last * 1.10).toFixed(2)) : 0;
  const stop = last != null ? Number((last * 0.95).toFixed(2)) : 0;

  const catalysts = Array.isArray(facts?.cat)
    ? facts.cat.map(c => ({
        type: c?.type || "event",
        date: c?.date || new Date().toISOString(),
        direction: "neutral",
        note: c?.note || ""
      }))
    : [];

  // Build newsDigest from facts.news (compact facts) or leave empty
  let newsDigest = [];
  if (Array.isArray(facts?.news) && facts.news.length) {
    // facts.news items look like { t, num }
    const mapped = facts.news.map(n => ({
      title: n?.t || "",
      date: facts?.freshness?.priceAt || "",
      sentiment: /\b(beat|surge|record|up|growth|raise|raised)\b/i.test(n?.t || "") ? "positive"
               : /\b(miss|down|loss|lawsuit|probe|cut|cuts|slump|drop)\b/i.test(n?.t || "") ? "negative"
               : "neutral",
      source: "",
      url: ""
    }));
    // run through summarizeNews for dedupe/cleanup
    newsDigest = summarizeNews(mapped);
  }

  return {
    schemaVersion: "1.1.0",
    ticker: facts?.tkr ?? "",
    decision: {
      ratingLabel: "Hold",
      ratingScore: 50,
      timeHorizon: "12 months",
      riskReward: "Balanced"
    },
    entryExit: {
      lastPrice: Number(last ?? 0),
      entry: Number(last ?? 0),
      stop: Number(stop),
      takeProfits: [tp1, tp2],
      positionSizePct: 10,
      deltasFromLast: { entryPct: 0, stopPct: 0, tp1Pct: 0, tp2Pct: 0 }
    },
    risk: { riskScore: 50, invalidation: [], volatilityNote: "" },
    signalsTop: [
      { name: "Trend",    value: (facts?.trend?.above200 ? "Above 200SMA" : "Mixed"), state: "neutral", comment: "" },
      { name: "Momentum", value: String(facts?.px?.r5d ?? "N/A"),                      state: "neutral", comment: "" },
      { name: "Volume",   value: String(facts?.vol?.z  ?? "N/A"),                      state: "neutral", comment: "" }
    ],
    signalsMore: {},
    catalysts,
    scenarios: [
      { name: "Base", prob: 0.6,  target: tp1, triggers: ["Maintain guidance"] },
      { name: "Bull", prob: 0.25, target: tp2, triggers: ["Beat & raise"] },
      { name: "Bear", prob: 0.15, target: stop, triggers: ["Miss or macro shock"] }
    ],
    nextActions: [],
    rationale: [],
    newsDigest, // ← NEW
    dataFreshness: {
      priceAt: facts?.freshness?.priceAt || new Date().toISOString(),
      newsWindow: {},
      metricsAsOf: facts?.freshness?.metricsAsOf || new Date().toISOString()
    },
    legacy: { summaryText: "Fallback summary.", newsSummaryText: "Fallback news." }
  };
}


// --- SMALL HELPERS ---
const cryptoHash = (obj) =>
  crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");

const roundNum = (n, d = 2) =>
  typeof n === "number" && isFinite(n) ? Number(n.toFixed(d)) : n;

// --- YAHOO API HELPERS ---
async function yahooApi(path, params = {}, method = "GET", body = null, timeoutMs = 12000) {
  let url = `${YAHOO_API_URL}${path}`;
  if (method === "GET" && params && Object.keys(params).length) {
    const usp = new URLSearchParams(params);
    url += `?${usp.toString()}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Yahoo API error: request timed out");
    throw e;
  }
  clearTimeout(timer);
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Yahoo API error ${resp.status}: ${detail || "Upstream failure"}`);
  }
  return await resp.json();
}

// --- NEWS DIGEST (extractive, tiny) ---
function summarizeNews(arr) {
  const items = Array.isArray(arr) ? arr.slice(0, 20) : [];
  const norm = (s) => String(s || "").toLowerCase().replace(/[\W_]+/g, " ").trim();

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length < b.length) [a, b] = [b, a];
    if (b.length === 0) return a.length;
    const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
    for (let i = 0; i < a.length; i++) {
      const cur = [i + 1];
      for (let j = 0; j < b.length; j++) {
        const ins = prev[j + 1] + 1;
        const del = cur[j] + 1;
        const sub = prev[j] + (a[i] === b[j] ? 0 : 1);
        cur.push(Math.min(ins, del, sub));
      }
      prev.splice(0, prev.length, ...cur);
    }
    return prev[prev.length - 1];
  }

  const seen = [];
  const out = [];
  for (const n of items) {
    const title = (n.title || n.headline || "").trim();
    if (!title) continue;

    const key = norm(title);
    let dup = false;
    for (const s of seen) {
      const dist = levenshtein(key, s) / Math.max(1, Math.max(key.length, s.length));
      if (dist < 0.15) { dup = true; break; }
    }
    if (dup) continue;
    seen.push(key);

    // Sentiment from title keywords
    const t = title.toLowerCase();
    let sentiment = "neutral";
    if (/\b(beat|beats|surge|record|up|growth|raise|raised)\b/.test(t)) sentiment = "positive";
    if (/\b(miss|misses|down|loss|lawsuit|probe|cut|cuts|slump|drop)\b/.test(t)) {
      sentiment = (sentiment === "positive") ? "mixed" : "negative";
    }

    const source = n.source || n.publisher || "";
    const date   = n.date || n.published_at || n.time || "";
    const url    = n.url || n.link || "";
    const nums   = (title.match(/([+-]?\d+(?:\.\d+)?%|\$[0-9,]+)/g) || []).slice(0, 3);

    out.push({ title, date, sentiment, source, url, nums });
    if (out.length >= 8) break;
  }
  return out;
}

// --- DERIVED FACTS BUILDER (ULTRA-COMPACT) ---
async function buildDerivedFacts(ticker, timeframe = "1d", newsDays = 30, detailLevel = "std") {
  const [
    quoteObj,
    history,
    fundamentals,
    analyst,
    calendar,
    newsObj
  ] = await Promise.all([
    yahooApi("/quote", { symbols: ticker }),
    yahooApi("/history", { ticker, interval: timeframe, range_: `${Math.max(newsDays, 60)}d` }),
    yahooApi("/fundamentals", { ticker }),
    yahooApi("/analyst", { ticker }),
    yahooApi("/calendar", { ticker }),
    yahooApi("/news", { ticker, max_articles: 12 })
  ]);

  const quote = quoteObj[ticker] || {};
  const candles = history?.indicators?.quote?.[0] || {};
  const closes  = Array.isArray(candles.close)  ? candles.close.filter(n => typeof n === "number")  : [];
  const volumes = Array.isArray(candles.volume) ? candles.volume.filter(n => typeof n === "number") : [];
  const highs   = Array.isArray(candles.high)   ? candles.high.filter(n => typeof n === "number")   : [];
  const lows    = Array.isArray(candles.low)    ? candles.low.filter(n => typeof n === "number")    : [];

  // helpers
  const mean = (a)=>a.length? a.reduce((x,y)=>x+y,0)/a.length : null;
  const std  = (a)=>{ if(!a.length) return null; const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); };
  const pct  = (num,den)=> (den? ( (num-den)/den )*100 : null);
  const sma  = (a,p)=> a.length>=p ? mean(a.slice(-p)) : null;

  // core stats
  const last = closes.at(-1) ?? null;
  const atr = (()=>{
    if(!highs.length || !lows.length || !closes.length) return null;
    const tr = highs.map((h,i)=> {
      const prevC = closes[i-1] ?? h;
      return Math.max(h - lows[i], Math.abs(h - prevC), Math.abs(lows[i] - prevC));
    });
    return Number(mean(tr.slice(-20))?.toFixed(2) ?? null);
  })();

  const sma20  = sma(closes,20);
  const sma50  = sma(closes,50);
  const sma200 = sma(closes,200);

  const avgVol = mean(volumes.slice(-20));
  const currVol = volumes.at(-1) ?? null;
  const volZ = (()=>{
    const s = std(volumes.slice(-20));
    if(!s || !avgVol || currVol==null) return null;
    return Number(((currVol - avgVol)/s).toFixed(2));
  })();

  // 52w window
  const window252 = Math.min(closes.length, 252);
  const hi52 = window252 ? Math.max(...closes.slice(-window252), ...(highs.slice(-window252) || [])) : null;
  const lo52 = window252 ? Math.min(...closes.slice(-window252), ...(lows.slice(-window252) || []))  : null;

  // skinny fundamentals
  const f = fundamentals || {};
  const skinnyF = {
    pe: f?.peRatio ?? null,
    ps: f?.psRatio ?? null,
    pb: f?.pbRatio ?? null,
    fcfM: typeof f?.freeCashFlowMargin === "number" ? Number(f.freeCashFlowMargin.toFixed(2)) : null,
    debtEq: f?.debtToEquity ?? null,
    roe: f?.roe ?? null,
    revYoy: f?.revenueGrowthYoy ?? null,
    epsYoy: f?.epsGrowthYoy ?? null
  };

  // skinny analyst
  const an = analyst || {};
  const skinnyAn = {
    buy:  an?.buy ?? null,
    hold: an?.hold ?? null,
    sell: an?.sell ?? null,
    tgtMean: an?.targetMean ?? null,
    impliedPct: (last && an?.targetMean) ? Number((((an.targetMean - last)/last)*100).toFixed(2)) : null
  };

  // minimal catalysts
  const cat = [];
  if (calendar?.earnings?.earningsDate) cat.push({ type:"earnings", date: calendar.earnings.earningsDate, note:"" });
  if (calendar?.dividends?.exDividendDate) cat.push({ type:"dividend", date: calendar.dividends.exDividendDate, note:"" });

  // news: 3 short items, no URLs
  const rawNews = Array.isArray(newsObj?.news) ? newsObj.news : [];
  const news = rawNews.slice(0, 3).map(n => {
    const t = (n.title || "").trim();
    const short = t.split(/\s+/).slice(0, 8).join(" ");
    const nums = (t.match(/[\d,.]+%?/g) || []).map(x=>x.replace(/,/g,"")).slice(0,3);
    return { t: short + (t.split(/\s+/).length>8?"…":""), num: nums };
  });

  const facts = {
    tkr: ticker,
    qt: {
      p: last!=null ? Number(last.toFixed(2)) : null,
      chg: (quote?.regularMarketChange!=null) ? Number(quote.regularMarketChange.toFixed(2)) : null,
      chgPct: (quote?.regularMarketChangePercent!=null) ? Number(quote.regularMarketChangePercent.toFixed(2)) : null,
      beta: (quote?.beta!=null) ? Number(Number(quote.beta).toFixed(2)) : null
    },
    px: {
      mean: (closes.length? Number(mean(closes).toFixed(2)) : null),
      std: (closes.length? Number(std(closes).toFixed(2)) : null),
      min: (closes.length? Number(Math.min(...closes).toFixed(2)) : null),
      max: (closes.length? Number(Math.max(...closes).toFixed(2)) : null),
      atr,
      r5d: (closes.length>=6? Number(pct(closes.at(-1), closes.at(-6)).toFixed(2)) : null),
      r20d: (closes.length>=21? Number(pct(closes.at(-1), closes.at(-21)).toFixed(2)) : null),
      rsi: (()=>{
        const period=14; if(closes.length<period+1) return null;
        let g=0,l=0;
        for(let i=closes.length-period;i<closes.length;i++){ const d=closes[i]-closes[i-1]; d>0? g+=d : l-=d; }
        if(g+l===0) return 50; return Number((100*g/(g+l)).toFixed(1));
      })()
    },
    trend: {
      sma20: sma20!=null? Number(sma20.toFixed(2)) : null,
      sma50: sma50!=null? Number(sma50.toFixed(2)) : null,
      sma200:sma200!=null? Number(sma200.toFixed(2)) : null,
      above50: (last!=null && sma50!=null) ? last>sma50 : null,
      above200:(last!=null && sma200!=null)? last>sma200: null
    },
    vol: { z: volZ, spike: (volZ!=null ? volZ>2 : null) },
    range: {
      hi52: hi52!=null? Number(hi52.toFixed(2)):null,
      lo52: lo52!=null? Number(lo52.toFixed(2)):null,
      pctFromHi: (last!=null && hi52) ? Number((((last-hi52)/hi52)*100).toFixed(2)) : null,
      pctFromLo: (last!=null && lo52) ? Number((((last-lo52)/lo52)*100).toFixed(2)) : null
    },
    sr: {
      sup: lows.length ? Array.from(new Set(
        [Math.min(...lows.slice(-120)), mean(lows.slice(-60))].map(x=> x!=null? Number(x.toFixed(2)) : null)
      )).filter(Boolean).slice(0,2) : [],
      res: highs.length ? Array.from(new Set(
        [Math.max(...highs.slice(-120)), mean(highs.slice(-60))].map(x=> x!=null? Number(x.toFixed(2)) : null)
      )).filter(Boolean).slice(0,2) : []
    },
    f: skinnyF,
    an: skinnyAn,
    cat,
    news,
    freshness: {
      priceAt: quote?.regularMarketTime ? new Date(quote.regularMarketTime*1000).toISOString() : new Date().toISOString(),
      metricsAsOf: new Date().toISOString()
    }
  };

  // enforce small payload
  const MAX_BYTES = (detailLevel === "low" ? 8*1024 : 12*1024);
  let s = JSON.stringify(facts);
  if (s.length > MAX_BYTES) { facts.news = facts.news.slice(0,2); s = JSON.stringify(facts); }
  if (s.length > MAX_BYTES) { delete facts.px.std; s = JSON.stringify(facts); }
  if (s.length > MAX_BYTES) { facts.sr.sup = facts.sr.sup.slice(0,1); facts.sr.res = facts.sr.res.slice(0,1); }
  return facts;
}



// --- OPENAI CALL with deep debug + sanitize-before-validate ---
async function callOpenAIFinancialAnalysis(facts, aiInputs, schema, prevInvalid = null) {
const schemaOutline = `
Output JSON keys:
- schemaVersion:"1.1.0"
- ticker
- decision { ratingLabel, ratingScore, timeHorizon, riskReward }
- entryExit { lastPrice, entry, stop, takeProfits[2], positionSizePct, deltasFromLast { entryPct, stopPct, tp1Pct, tp2Pct } }
- risk { riskScore, invalidation[], volatilityNote }
- signalsTop[3], signalsMore { trend?, momentum?, volatility?, volume?, others? }
- catalysts[{ type, date, direction?, note }]
- scenarios[1..3] { name, prob, target, triggers[] }
- nextActions[{ id, label, checked }]
- rationale (max 3)
- dataFreshness { priceAt, newsWindow {from?, to?}, metricsAsOf }
- legacy { summaryText, newsSummaryText } (optional)
Rules:
- STRICT JSON ONLY. No text outside JSON.
- Types must match exactly. "schemaVersion" MUST be a string equal to "1.1.0".
- "scenarios" MUST have 1–3 items (use Base/Bull/Bear if unsure).
- Prices numeric; percents numeric (no "%" symbol).
- If unknown: still output a safe default that satisfies the schema.
- For legacy.summaryText: Write a concise, professional, and insightful 3-6 sentence summary of the company, its business, recent performance, and outlook, using the facts provided. This summary will be shown as an "AI-Generated Overview" to users.
`.trim();

const systemPrompt = `You are a precise financial analyst. Emit ONLY valid JSON per outline.\n${schemaOutline}`;
const userPrompt = [
  `User query: ${JSON.stringify(aiInputs.userQuery || "")}`,
  `Objective: ${JSON.stringify(aiInputs.objective || "general")}`,
  `Detail: ${JSON.stringify(aiInputs.detailLevel || "std")}`,
  `Timeframe: ${JSON.stringify(aiInputs.timeframe || "D")}`,
  `Facts:${JSON.stringify(facts)}`,
  `INSTRUCTIONS: For the legacy.summaryText field, generate a clear, professional, and insightful 3-6 sentence overview of the company, its business, recent performance, and outlook, using the facts provided.`
].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
  if (prevInvalid) {
    const errs = Array.isArray(prevInvalid.errors) ? prevInvalid.errors : [];
    messages.push({
      role: "user",
      content: `Your last JSON failed validation: ${errs.map(e=>e.message).join("; ")}. Raw output: ${prevInvalid.raw?.slice(0,1200) || ""}. Fix STRUCTURE ONLY and re-emit valid JSON.`
    });
  }

  const body = {
    model: "gpt-4o",
    messages,
    temperature: prevInvalid ? 0.0 : 0.2,
    max_tokens: 5000,
    response_format: { type: "json_object" }
  };

  const T = nowMs();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const latency = Date.now() - T;

  if (!r.ok) {
    const errText = await r.text().catch(()=> "");
    const e = new Error(`OpenAI error: ${r.status} ${errText || "Upstream failure"}`);
    e.latency = latency;
    throw e;
  }
  const json = await r.json();
  const content = json?.choices?.[0]?.message?.content || "";
  const usage = json?.usage || {};

  dbg("AI_RAW_LEN", { bytes: content.length, latencyMs: latency });

  if (!content) {
    const e = new Error("AI did not return any content.");
    e.latency = latency;
    throw e;
  }

  // Parse → repair → sanitize → validate
  const { jsonrepair } = require("jsonrepair");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    try { parsed = JSON.parse(jsonrepair(content)); }
    catch (parseErr) {
      const e = new Error("AI did not return valid JSON after repair.");
      e.rawContent = content;
      e.latency = latency;
      throw e;
    }
  }

  // << crucial debug: show problematic fields BEFORE validation >>
  const pre = {
    typeof_schemaVersion: typeof parsed?.schemaVersion,
    scenarios_len: Array.isArray(parsed?.scenarios) ? parsed.scenarios.length : null,
    signalsTop_len: Array.isArray(parsed?.signalsTop) ? parsed.signalsTop.length : null
  };
  dbg("AI_PRE_SANITIZE", pre);

  // Sanitize before Zod
  parsed = sanitizeBeforeValidate(parsed, facts);

  const post = {
    typeof_schemaVersion: typeof parsed?.schemaVersion,
    schemaVersion_val: parsed?.schemaVersion,
    scenarios_len: Array.isArray(parsed?.scenarios) ? parsed.scenarios.length : null,
    signalsTop_len: Array.isArray(parsed?.signalsTop) ? parsed.signalsTop.length : null
  };
  dbg("AI_POST_SANITIZE", post);

  const result = schema.safeParse(parsed);
  if (result.success) {
    dbg("AI_VALIDATE_OK", { tookParseSanitizeValidate: durMs(T) });
    return {
      aiAnalysis: result.data,
      tokens: usage,
      latency,
      repaired: !!prevInvalid,
      promptChars: userPrompt.length
    };
  }

  // One guided retry
  if (!prevInvalid) {
    dbg("AI_VALIDATE_FAIL", {
  issues: result.error.issues.map(i => ({
    path: (i.path || []).map(p => String(p)).join("."),
    code: i.code,
    expected: i.expected,
    message: i.message
  }))
});
    return await callOpenAIFinancialAnalysis(facts, aiInputs, schema, {
      errors: result.error.issues || [],
      raw: content
    });
  }

  // Final failure: attach rich context so the route can log it
  const e = new Error("AI output invalid after repair attempt.");
  e.validationErrors = result.error.issues || [];
  e.rawContent = content;
  e.latency = latency;
  throw e;
}


// --- AI-DRIVEN COMPANY ANALYSIS (ADVANCED, NOW USING DERIVED FACTS) ---
app.post("/api/ai-analysis/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const {
    userQuery = "",
    timeframe = "1d",
    newsDays = 14,
    detailLevel = "low",
    objective = "general",
    userId = null
  } = req.body || {};

  const T0 = nowMs();
  dbg("REQUEST", { ticker, userQuery, timeframe, newsDays, detailLevel, objective });

  try {
    // Symbol resolution
    const tSearch = nowMs();
    const searchResults = await yahooApi("/search", { query: ticker });
    const canonicalTicker = searchResults?.results?.[0]?.symbol;
    dbg("SEARCH_OK", { canonicalTicker, took: durMs(tSearch) });
    if (!canonicalTicker) throw new Error("No matching company or ticker found.");

    // Build compact facts (timed)
    const tFacts = nowMs();
    const facts = await buildDerivedFacts(canonicalTicker, timeframe, newsDays, detailLevel);
    dbg("FACTS_OK", {
      took: durMs(tFacts),
      keys: Object.keys(facts || {}),
      pxKeys: Object.keys((facts && facts.px) || {}),
      trendKeys: Object.keys((facts && facts.trend) || {})
    });

    // AI call (timed + deep debug handled inside the function)
    const tAI = nowMs();
    const aiResult = await callOpenAIFinancialAnalysis(
      facts,
      { userQuery, timeframe, detailLevel, objective },
      FinancialAnalysisV1
    );
    dbg("AI_OK", { took: durMs(tAI), latency: aiResult.latency, repaired: aiResult.repaired, promptChars: aiResult.promptChars });

    // Merge NextActions for this user if present
    if (userId) {
      const key = { userId, ticker: canonicalTicker };
      let doc = await NextActions.findOne(key);
      if (!doc && aiResult.aiAnalysis?.nextActions?.length) {
        await NextActions.create({ ...key, actions: aiResult.aiAnalysis.nextActions });
      } else if (doc) {
        // Preserve user's saved state
        aiResult.aiAnalysis.nextActions = doc.actions;
      }
    }

    // Attach quote/profile/fundamentals/analyst (timed)
    const tSide = nowMs();
    const [quoteObj, profile, fundamentals, analyst] = await Promise.all([
      yahooApi("/quote", { symbols: canonicalTicker }),
      yahooApi("/profile", { ticker: canonicalTicker }).catch(() => ({})),
      yahooApi("/fundamentals", { ticker: canonicalTicker }).catch(() => ({})),
      yahooApi("/analyst", { ticker: canonicalTicker }).catch(() => ({}))
    ]);
    dbg("SIDE_OK", { took: durMs(tSide) });

    const result = {
      aiAnalysis: {
        ...aiResult.aiAnalysis,
        quote: quoteObj?.[canonicalTicker] || {},
        profile: profile || {},
        fundamentals: fundamentals || {},
        analyst: analyst || {}
      },
      tokens: aiResult.tokens,
      latency: aiResult.latency,
      promptChars: aiResult.promptChars,
      repairAttempted: aiResult.repaired || false,
      cached: false
    };

    dbg("RESPONSE_OK", { tookTotal: durMs(T0) });
    return res.json(result);
  } catch (err) {
    // If our inner function attached rich context, log it.
    dbg("FAILURE", {
      message: err?.message,
      tookTotal: durMs(T0),
      validationErrors: err?.validationErrors || null,
      // show only a snippet to avoid log bloat
      rawContentSnippet: typeof err?.rawContent === "string" ? err.rawContent.slice(0, 600) : null,
      stackTop: (err?.stack || "").split("\n").slice(0, 3)
    });
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
});


// --- NEXT ACTIONS ENDPOINTS (interactive checklist, per userId+ticker) ---
app.get("/api/next-actions/:userId/:ticker", async (req, res) => {
  try {
    const { userId, ticker } = req.params;
    if (!userId || !ticker) return res.status(400).json({ error: "Missing userId or ticker" });
    let actionsDoc = await NextActions.findOne({ userId, ticker });
    if (!actionsDoc) {
      return res.json({ actions: [] });
    }
    res.json({ actions: actionsDoc.actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/next-actions/:userId/:ticker", async (req, res) => {
  try {
    const { userId, ticker } = req.params;
    const { actions } = req.body;
    if (!userId || !ticker) return res.status(400).json({ error: "Missing userId or ticker" });
    if (!Array.isArray(actions)) return res.status(400).json({ error: "Missing or invalid actions array" });
    let actionsDoc = await NextActions.findOne({ userId, ticker });
    if (!actionsDoc) {
      actionsDoc = await NextActions.create({ userId, ticker, actions });
    } else {
      actionsDoc.actions = actions;
      await actionsDoc.save();
    }
    res.json({ actions: actionsDoc.actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/next-actions/:userId/:ticker", async (req, res) => {
  try {
    const { userId, ticker } = req.params;
    const { label } = req.body;
    if (!userId || !ticker || !label) return res.status(400).json({ error: "Missing userId, ticker, or label" });
    let actionsDoc = await NextActions.findOne({ userId, ticker });
    const newAction = { id: uuidv4(), label, checked: false };
    if (!actionsDoc) {
      actionsDoc = await NextActions.create({ userId, ticker, actions: [newAction] });
    } else {
      actionsDoc.actions.push(newAction);
      await actionsDoc.save();
    }
    res.json({ actions: actionsDoc.actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DERIVED FACTS ENDPOINT (compact JSON for AI) ---
app.get("/api/derived/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    const { timeframe = "1d", newsDays = 30 } = req.query;
    const facts = await buildDerivedFacts(ticker, timeframe, newsDays);
    res.json(facts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/next-actions/:userId/:ticker/:actionId", async (req, res) => {
  try {
    const { userId, ticker, actionId } = req.params;
    if (!userId || !ticker || !actionId) return res.status(400).json({ error: "Missing userId, ticker, or actionId" });
    let actionsDoc = await NextActions.findOne({ userId, ticker });
    if (actionsDoc) {
      actionsDoc.actions = actionsDoc.actions.filter(a => a.id !== actionId);
      await actionsDoc.save();
    }
    res.json({ actions: actionsDoc ? actionsDoc.actions : [] });
  } catch (err) {
    res.json({ aiAnalysis: null, error: err.message });
  }
});

app.post("/api/deep-search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.json({ results: [] });
    }

    // Call Yahoo's search endpoint
    const searchResults = await yahooApi("/search", { query: query.trim() });

    // Defensive: If Yahoo returns nothing or error
    if (!searchResults || !Array.isArray(searchResults.results)) {
      return res.json({ results: [] });
    }

    // Enrich with company profile (limit to 10 for speed)
    const enriched = Array.isArray(searchResults.results)
      ? await Promise.all(
          searchResults.results.slice(0, 10).map(async (item) => {
            try {
              const profile = await yahooApi("/profile", { ticker: item.symbol });
              return { ...item, profile };
            } catch (e) {
              return { ...item, profile: null };
            }
          })
        )
      : [];

    res.json({ results: Array.isArray(enriched) ? enriched : [] });
  } catch (err) {
    // Always return a results array, never just an error
    res.json({ results: [] });
  }
});
// --- Company Search (legacy, not used with deep search) ---
app.get("/api/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Missing query" });
    const data = await yahooApi("/search", { query: q });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get company profile
app.get("/api/profile/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await yahooApi("/profile", { ticker: symbol });
    res.set("Cache-Control", "public, max-age=10");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get quote
app.get("/api/quote/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await yahooApi("/quote", { symbols: symbol });
    res.set("Cache-Control", "public, max-age=10");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get fundamentals
app.get("/api/fundamentals/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await yahooApi("/fundamentals", { ticker: symbol });
    res.set("Cache-Control", "public, max-age=10");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get analyst
app.get("/api/analyst/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await yahooApi("/analyst", { ticker: symbol });
    res.set("Cache-Control", "public, max-age=10");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get company news (raw from Python service)
app.get("/api/news/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { max_articles = 10 } = req.query;
    const data = await yahooApi("/news", { ticker: symbol, max_articles });
    res.set("Cache-Control", "public, max-age=30");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: Get AI-digested news (deduped, sentiment, numbers)
app.get("/api/news-digest/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const raw = await yahooApi("/news", { ticker: symbol, max_articles: 20 });

    // Python returns { news: [...] }; older shapes might be an array
    const items = Array.isArray(raw?.news) ? raw.news : (Array.isArray(raw) ? raw : []);
    const digest = summarizeNews(items);

    res.set("Cache-Control", "public, max-age=60");
    res.json({ ticker: symbol, newsDigest: digest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get history (candles)
app.get("/api/history/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    let { interval = "1d", range_ = "1y" } = req.query;
    const data = await yahooApi("/history", { ticker: symbol, interval, range_ });
    res.set("Cache-Control", "public, max-age=30");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WATCHLIST ENDPOINTS (real, per user) ---
app.get("/api/watchlist/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    let watchlist = await Watchlist.findOne({ userId });
    if (!watchlist) {
      watchlist = await Watchlist.create({ userId, symbols: [] });
    }
    res.json({ watchlist: watchlist.symbols });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy /api/company to FastAPI /company
app.get("/api/company", async (req, res) => {
  try {
    // Forward all query params to FastAPI
    const usp = new URLSearchParams(req.query).toString();
    const url = `${YAHOO_API_URL}/company?${usp}`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: detail || "Upstream error" });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/watchlist/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { symbol } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });
    let watchlist = await Watchlist.findOne({ userId });
    if (!watchlist) {
      watchlist = await Watchlist.create({ userId, symbols: [symbol] });
    } else if (!watchlist.symbols.includes(symbol)) {
      watchlist.symbols.push(symbol);
      await watchlist.save();
    }
    res.json({ watchlist: watchlist.symbols });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/watchlist/:userId/:symbol", async (req, res) => {
  try {
    const { userId, symbol } = req.params;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });
    let watchlist = await Watchlist.findOne({ userId });
    if (watchlist && watchlist.symbols.includes(symbol)) {
      watchlist.symbols = watchlist.symbols.filter((s) => s !== symbol);
      await watchlist.save();
    }
    res.json({ watchlist: watchlist ? watchlist.symbols : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FEEDBACK ENDPOINTS (real, stored in DB) ---
app.post("/api/feedback", async (req, res) => {
  try {
    const { user, message, rating, labelType, targetField } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Missing or invalid feedback message" });
    }
    const feedback = await Feedback.create({
      user: user || "anonymous",
      message: message.trim(),
      rating: typeof rating === "number" ? rating : null,
      labelType: labelType || null,
      targetField: targetField || null,
      timestamp: new Date()
    });
    res.json({ success: true, feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/feedbacks", async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ timestamp: -1 }).limit(100);
    res.json({ feedbacks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SEARCH LOGS (analytics) ---
app.get("/api/search-logs", async (req, res) => {
  try {
    const logs = await SearchLog.find().sort({ timestamp: -1 }).limit(100);
    res.json({ searchLogs: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- HEALTH CHECK ---
app.get("/", (req, res) => {
  res.send("TrueSignalAI Backend is running.");
});

// --- ERROR HANDLING ---
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || "Internal server error" });
});

// --- 404 HANDLER ---
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`TrueSignalAI backend running on port ${PORT}`);
});