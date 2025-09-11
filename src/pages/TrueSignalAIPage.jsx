import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Search, TrendingUp, BarChart2, AlertTriangle, DollarSign, PieChart, ArrowRight, Clock, Target, Shield, Zap, Download, Share2, ChevronDown, Bell, Info, ExternalLink, Bookmark, Eye, Filter, ChevronUp, Calendar, Percent, Briefcase, Signal
} from "lucide-react";
// NOTE: no aliasing of useRef; keep it single-source to avoid subtle ref mixups
import { createChart, CrosshairMode, CandlestickSeries } from "lightweight-charts";

function addCandlestickSeriesCompat(chart, options) {
  if (!chart || typeof chart !== "object") {
    throw new Error("Invalid chart instance passed to addCandlestickSeriesCompat");
  }

  // v3/v4
  if (typeof chart.addCandlestickSeries === "function") {
    return chart.addCandlestickSeries(options);
  }

  // v5 unified API — pass the constructor, NOT a string
  if (typeof chart.addSeries === "function") {
    return chart.addSeries(CandlestickSeries, options);
  }

  if (typeof chart.addCandlestick === "function") return chart.addCandlestick(options);
  if (typeof chart.addCandleSeries === "function") return chart.addCandleSeries(options);

  throw new Error("No candlestick-series method found on chart instance. Check your lightweight-charts version/import.");
}

// Backend API base URL (adjust if deployed elsewhere)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

// Helper: fetch JSON with error handling
async function fetchAPI(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errMsg = "API error";
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  return await res.json();
}

// NEW: fetch AI-digested, deduped news with sentiment & numbers
async function fetchNewsDigest(symbol) {
  if (!symbol) return { ticker: "", newsDigest: [] };
  return await fetchAPI(`${API_BASE}/api/news-digest/${encodeURIComponent(symbol)}`);
}

// Helper: get or generate userId (persisted in localStorage)
function getUserId() {
  let userId = localStorage.getItem("tsai_userId");
  if (!userId) {
    userId = "user_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("tsai_userId", userId);
  }
  return userId;
}

// Helper: robust logo extraction or fallback to initial
function getCompanyLogo(company) {
  const profile = company.profile || {};
  const logo =
    profile.logo ||
    profile.logo_url ||
    profile.image ||
    company.logo ||
    company.logo_url ||
    company.image;

  if (logo && typeof logo === "string" && logo.trim() !== "") {
    return logo;
  }
  return null;
}

function formatNumber(num) {
  if (num && typeof num === "object") {
    if (typeof num.fmt === "string") return num.fmt;
    if (typeof num.raw === "number") num = num.raw;
    else return "N/A";
  }
  if (!num && num !== 0) return "N/A";
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1) + "B";
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

// --- NEW: normalize AI payloads (v1.1.0 or legacy) + fallback builder ---
function toNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function normalizeAi(ai, selectedCompany) {
  const toNum = (v, fb = null) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const toStr = (v, fb = "") => (v === undefined || v === null ? fb : String(v));
  const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

  const entryExit = ai?.entryExit || {};
  const last = toNum(entryExit.lastPrice);
  const tps = arr(entryExit.takeProfits).map((x) => toNum(x)).filter((x) => x != null);
  const tp1 = tps[0] ?? null;
  const tp2 = tps[1] ?? null;

  const quoteObj = ai?.quote || {};
  const quote = {
    regularMarketPrice: last ?? quoteObj.regularMarketPrice ?? null,
    regularMarketChange: quoteObj.regularMarketChange ?? null,
    regularMarketChangePercent: quoteObj.regularMarketChangePercent ?? null,
  };

  const profile = ai?.profile || selectedCompany?.profile || {};

  const decision = ai?.decision || {};
  const score = toNum(decision.ratingScore);
  const conf = score != null ? Math.max(0, Math.min(100, Math.round(score))) : "N/A";
  let upside = "N/A";
  if (last != null && tp1 != null && last > 0) {
    const pct = ((tp1 - last) / last) * 100;
    upside = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }
  const recommendation = {
    rating: toStr(decision.ratingLabel, "N/A"),
    targetPrice: tp1 != null ? `$${tp1}` : "N/A",
    upside,
    confidence: conf,
    timeHorizon: toStr(decision.timeHorizon, "12 months"),
    analystCount: 0,
    analystRatings: { buy: 0, hold: 0, sell: 0 },
  };

  const fundamentals = ai?.fundamentals || {};
  const summaryDetail = fundamentals.summaryDetail || {};
  const defaultKeyStatistics = fundamentals.defaultKeyStatistics || {};
  const financialData = fundamentals.financialData || {};

  const overview = {
    marketCap:
      summaryDetail.marketCap
        ? `$${formatNumber(summaryDetail.marketCap)}`
        : defaultKeyStatistics.marketCap
        ? `$${formatNumber(defaultKeyStatistics.marketCap)}`
        : "N/A",
    peRatio:
      formatNumber(
        summaryDetail.trailingPE ||
        summaryDetail.forwardPE ||
        defaultKeyStatistics.trailingPE ||
        defaultKeyStatistics.forwardPE ||
        financialData.trailingPE ||
        financialData.forwardPE
      ) || "N/A",
    dividend: (() => {
      const dy = summaryDetail.dividendYield || financialData.dividendYield;
      let raw = dy;
      if (dy && typeof dy === "object") raw = dy.raw;
      if (raw) return `${(raw * 100).toFixed(2)}%`;
      return "N/A";
    })(),
    beta:
      formatNumber(
        summaryDetail.beta ||
        defaultKeyStatistics.beta ||
        financialData.beta
      ) || "N/A",
    yearHigh:
      summaryDetail.fiftyTwoWeekHigh
        ? `$${formatNumber(summaryDetail.fiftyTwoWeekHigh)}`
        : defaultKeyStatistics.fiftyTwoWeekHigh
        ? `$${formatNumber(defaultKeyStatistics.fiftyTwoWeekHigh)}`
        : "N/A",
    yearLow:
      summaryDetail.fiftyTwoWeekLow
        ? `$${formatNumber(summaryDetail.fiftyTwoWeekLow)}`
        : defaultKeyStatistics.fiftyTwoWeekLow
        ? `$${formatNumber(defaultKeyStatistics.fiftyTwoWeekLow)}`
        : "N/A",
    avgVolume: (() => {
      const v =
        summaryDetail.averageDailyVolume10Day ||
        summaryDetail.averageVolume ||
        defaultKeyStatistics.averageDailyVolume10Day;
      return v ? formatNumber(v) : "N/A";
    })(),
    eps: (() => {
      const e =
        summaryDetail.trailingEps ||
        financialData.trailingEps ||
        defaultKeyStatistics.trailingEps;
      return e ? `$${formatNumber(e)}` : "N/A";
    })(),
    priceToSales:
      formatNumber(
        summaryDetail.priceToSalesTrailing12Months ||
        financialData.priceToSalesTrailing12Months ||
        defaultKeyStatistics.priceToSalesTrailing12Months
      ) || "N/A",
    priceToBook:
      formatNumber(
        summaryDetail.priceToBook ||
        financialData.priceToBook ||
        defaultKeyStatistics.priceToBook
      ) || "N/A",
    debtToEquity:
      formatNumber(
        financialData.debtToEquity ||
        defaultKeyStatistics.debtToEquity
      ) || "N/A",
    quickRatio:
      formatNumber(
        financialData.quickRatio ||
        defaultKeyStatistics.quickRatio
      ) || "N/A",
    roe:
      formatNumber(
        financialData.returnOnEquity ||
        defaultKeyStatistics.returnOnEquity
      ) || "N/A",
  };

  let newsDigest = ai?.newsDigest;
  if (!Array.isArray(newsDigest) || newsDigest.length === 0) {
    newsDigest = (ai?.catalysts || []).map((c) => ({
      title: `${toStr(c?.type, "Catalyst").toUpperCase()}${c?.note ? ` – ${c.note}` : ""}`,
      date: toStr(c?.date, ai?.dataFreshness?.priceAt || ""),
      sentiment: toStr(c?.direction, "neutral").toLowerCase(),
      source: "",
    }));
  }

  const scenarios = arr(ai?.scenarios).map((s) => ({
    name: toStr(s?.name, "Scenario"),
    prob: toNum(s?.prob, 0),
    target: toNum(s?.target, null),
    triggers: arr(s?.triggers).map((x) => toStr(x, "")),
  }));
  const plan = {
    entry: toNum(entryExit.entry, last ?? null),
    stop: toNum(entryExit.stop, null),
    tp1,
    tp2,
    positionSizePct: toNum(entryExit.positionSizePct, 10),
    scenarios,
    rationale: arr(ai?.rationale).map((x) => toStr(x, "")),
  };

  const riskBlock = ai?.risk || {};
  const signalsTop = arr(ai?.signalsTop).map((g) => ({
    name: toStr(g?.name, "-"),
    value: g?.value ?? "N/A",
    state: toStr(g?.state, "neutral"),
    comment: toStr(g?.comment, ""),
  }));
  const risk = {
    riskScore: toNum(riskBlock.riskScore, 50),
    invalidation: arr(riskBlock.invalidation).map((x) => toStr(x, "")),
    volatilityNote: toStr(riskBlock.volatilityNote, ""),
    signalsTop,
  };

  return {
    quote,
    profile,
    overview,
    recommendation,
    newsDigest,
    plan,
    risk,
    legacy: ai?.legacy || {},
  };
}

// Build a minimal AI-like object from /api/derived facts when OpenAI fails
function makeAiFromFacts(facts) {
  const last = facts?.qt?.p ?? null;
  const tp1 = last != null ? Number((last * 1.05).toFixed(2)) : null;
  const tp2 = last != null ? Number((last * 1.10).toFixed(2)) : null;
  const stop = last != null ? Number((last * 0.95).toFixed(2)) : null;

  return {
    schemaVersion: "1.1.0",
    decision: { ratingLabel: "Hold", ratingScore: 50, timeHorizon: "12 months", riskReward: "Balanced" },
    entryExit: {
      lastPrice: last ?? 0,
      entry: last ?? 0,
      stop: stop ?? 0,
      takeProfits: [tp1 ?? 0, tp2 ?? 0],
      positionSizePct: 10,
      deltasFromLast: { entryPct: 0, stopPct: 0, tp1Pct: 0, tp2Pct: 0 },
    },
    risk: { riskScore: 50, invalidation: [], volatilityNote: "" },
    signalsTop: [
      { name: "Trend", value: facts?.trend?.above200 ? "Above 200SMA" : "Mixed", state: "neutral", comment: "" },
      { name: "Momentum", value: facts?.px?.r5d ?? "N/A", state: "neutral", comment: "" },
      { name: "Volume", value: facts?.vol?.z ?? "N/A", state: "neutral", comment: "" },
    ],
    catalysts: facts?.cat || [],
    scenarios: [
      { name: "Base", prob: 0.6, target: tp1 ?? 0, triggers: ["Maintain guidance"] },
      { name: "Bull", prob: 0.25, target: tp2 ?? 0, triggers: ["Beat & raise"] },
      { name: "Bear", prob: 0.15, target: stop ?? 0, triggers: ["Miss or macro shock"] },
    ],
    nextActions: [],
    rationale: [],
    dataFreshness: {
      priceAt: facts?.freshness?.priceAt || new Date().toISOString(),
      metricsAsOf: facts?.freshness?.metricsAsOf || new Date().toISOString(),
    },
    legacy: { summaryText: "Autofallback summary.", newsSummaryText: "Autofallback news." },
  };
}

const riskFactors = [
  { factor: "Regulatory Changes", impact: "High", description: "Potential antitrust legislation in US and EU markets could impact business operations and growth strategy." },
  { factor: "Supply Chain Disruptions", impact: "Medium", description: "Ongoing semiconductor shortages affecting production capacity and product availability in key markets." },
  { factor: "Competition", impact: "Medium", description: "Increasing market share from emerging competitors in key segments, particularly in services and wearables." },
  { factor: "Currency Fluctuations", impact: "Low", description: "Exposure to foreign exchange risk in international markets, particularly in emerging economies." },
  { factor: "Product Cycle", impact: "Medium", description: "Upcoming product refresh cycle may impact short-term performance and inventory management." },
  { factor: "Talent Retention", impact: "Medium", description: "Increasing competition for technical talent in AI and machine learning specialties." }
];


function TradingViewChart({
  candleData,
  plan,
  timeRange,
  symbol,
  theme = "light"
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);

// Map our candleData to TradingView format
const mappedCandles = useMemo(() => {
  if (!Array.isArray(candleData) || candleData.length === 0) return [];

  // normalize epoch to seconds and validate
  const toSec = (t) => {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    // handle accidental ms
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  };

  const mapped = candleData.map(row => ({
    time: toSec(row.time ?? row.timestamp), // <- do not parse row.date
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
  }))
  .filter(r =>
    Number.isFinite(r.time) &&
    Number.isFinite(r.open) &&
    Number.isFinite(r.high) &&
    Number.isFinite(r.low) &&
    Number.isFinite(r.close)
  )
  .sort((a, b) => a.time - b.time);

  // de-dup identical timestamps (can happen with mixed sources)
  const dedup = [];
  let last = -Infinity;
  for (const r of mapped) {
    if (r.time !== last) dedup.push(r);
    last = r.time;
  }
  return dedup;
}, [candleData]);


  // Overlay lines for entry/stop/tp1/tp2
  const overlayLines = useMemo(() => {
    const lines = [];
    if (plan?.entry != null) lines.push({ value: plan.entry, label: "Entry", color: "#6366f1" });
    if (plan?.stop != null) lines.push({ value: plan.stop, label: "Stop", color: "#ef4444" });
    if (plan?.tp1 != null) lines.push({ value: plan.tp1, label: "TP1", color: "#22c55e" });
    if (plan?.tp2 != null) lines.push({ value: plan.tp2, label: "TP2", color: "#16a34a" });
    return lines;
  }, [plan]);

  // Scenario lines (dashed)
  const scenarioLines = useMemo(() => {
    if (!plan?.scenarios) return [];
    return plan.scenarios
      .filter((s) => s.target != null)
      .map((s) => ({
        value: s.target,
        label: s.name,
        color: "#f59e42",
        dash: true,
      }));
  }, [plan]);

useEffect(() => {
  // Guard: only run in browser and when container exists
  const el = chartContainerRef.current;
  if (!el) return;

  // Clean any previous chart
  if (chartInstanceRef.current) {
    try { chartInstanceRef.current.remove?.(); } catch {}
    chartInstanceRef.current = null;
    seriesRef.current = null;
    linesRef.current = [];
  }

  // If container is collapsed (0 width), wait for it to size via ResizeObserver
  const makeChart = () => {
    const width = el.offsetWidth || el.clientWidth || 0;
    const height = 320;

    const chart = createChart(el, {
      width: Math.max(1, width),
      height,
      layout: {
        background: { color: theme === "dark" ? "#18181b" : "#ffffff" },
        textColor: theme === "dark" ? "#e5e7eb" : "#18181b",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: theme === "dark" ? "#27272a" : "#f3f4f6" },
        horzLines: { color: theme === "dark" ? "#27272a" : "#f3f4f6" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#e5e7eb",
      },
      rightPriceScale: { borderColor: "#e5e7eb" },
      localization: {
        priceFormatter: (price) => (Number.isFinite(price) ? `$${price.toFixed(2)}` : ""),
      },
    });

    chartInstanceRef.current = chart;

    // Candles
    let candleSeries;
    try {
      candleSeries = addCandlestickSeriesCompat(chart, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
    } catch (e) {
      console.error("Failed to add candlestick series. Chart keys:", Object.keys(chart || {}));
      throw e; // surface error
    }
    seriesRef.current = candleSeries;

if (Array.isArray(mappedCandles) && mappedCandles.length > 0) {
  candleSeries.setData(mappedCandles); // already normalized & sorted
  chart.timeScale().fitContent();
}


    // Overlay lines
    linesRef.current = [];
[...overlayLines, ...scenarioLines].forEach((line) => {
  const price = Number(line.value);
  if (!Number.isFinite(price)) return; // skip bad values
  const priceLine = candleSeries.createPriceLine({
    price,
    color: line.color,
    lineWidth: 2,
    lineStyle: line.dash ? 2 : 0,
    axisLabelVisible: true,
    title: line.label,
  });
  linesRef.current.push(priceLine);
});
  };

  // If width is zero, observe until it’s non-zero
  if ((el.offsetWidth || el.clientWidth || 0) === 0) {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 0;
      if (w > 0) {
        ro.disconnect();
        makeChart();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }

  makeChart();

  // Resize handler
  const handleResize = () => {
    if (!chartInstanceRef.current || !chartContainerRef.current) return;
    chartInstanceRef.current.applyOptions({
      width: chartContainerRef.current.offsetWidth || chartContainerRef.current.clientWidth || 0,
    });
  };
  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
    try { chartInstanceRef.current?.remove?.(); } catch {}
    chartInstanceRef.current = null;
    seriesRef.current = null;
    linesRef.current = [];
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [mappedCandles, overlayLines, scenarioLines, theme]);


  return (
    <div className="relative bg-gray-50 rounded-lg p-4 flex flex-col items-center justify-center border border-gray-100">
      <div ref={chartContainerRef} style={{ width: "100%", minHeight: 320 }} />
      {/* Overlay legend */}
      <div className="absolute right-4 top-4 bg-white bg-opacity-80 rounded shadow px-3 py-2 text-xs space-y-1 border border-gray-200">
        {overlayLines.map((o, i) => (
          <div key={i} className="flex items-center space-x-2">
            <span className="inline-block w-3 h-1 rounded" style={{ background: o.color }} />
            <span>{o.label}: <span className="font-semibold">${o.value}</span></span>
          </div>
        ))}
        {scenarioLines.map((s, i) => (
          <div key={i + overlayLines.length} className="flex items-center space-x-2">
            <span className="inline-block w-3 h-1 rounded" style={{ background: s.color, borderBottom: "1px dashed #f59e42" }} />
            <span>{s.label}: <span className="font-semibold">${s.value}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MAIN UI COMPONENT ---
function AIFinancialAdvisor({
  searchQuery,
  setSearchQuery,
  handleSearch,
  isLoading,
  companyResults,
  selectedCompany,
  handleSelectCompany,
  analysisData,
  chartData,
  activeTab,
  setActiveTab,
  showAllMetrics,
  setShowAllMetrics,
  savedWatchlist,
  toggleWatchlist,
  timeRange,
  setTimeRange,
  getSentimentColor,
  recentNews,
  keyMetrics,
  riskFactors,
  error,
  aiAnalysis,
  aiAnalysisLoading,
  aiTelemetry,
  skipAIAnalysis,
  setSkipAIAnalysis
}) {
  // News "View All" toggle
  const [showAllNews, setShowAllNews] = useState(false);

  // NEW: AI-digested news for the selected company
  const [newsDigest, setNewsDigest] = useState([]);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        // prefer explicit ticker from selectedCompany, fall back to analysisData if any
        const sym =
          selectedCompany?.ticker ||
          analysisData?.profile?.symbol ||
          analysisData?.ticker ||
          null;

        if (!sym) {
          setNewsDigest([]);
          return;
        }

        const res = await fetchNewsDigest(sym);
        if (!alive) return;

        const digest = Array.isArray(res?.newsDigest) ? res.newsDigest : [];
        setNewsDigest(digest);
      } catch {
        if (!alive) return;
        setNewsDigest([]);
      }
    }

    if (selectedCompany) {
      run();
    } else {
      setNewsDigest([]);
    }

    return () => {
      alive = false;
    };
  }, [selectedCompany, analysisData]);

  // Hide tabs if no AI data (skipAIAnalysis)
  const tabs = useMemo(() => {
    const base = ["overview", "charts"];
    if (!skipAIAnalysis) {
      base.push("trading plan", "risk analysis");
    }
    return base;
  }, [skipAIAnalysis]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="fixed w-full bg-white shadow-sm z-50">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <a href="/" className="flex items-center group">
              <Signal className="h-8 w-8 text-blue-600 group-hover:text-blue-700 transition-colors" />
              <span className="ml-2 text-xl font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                TrueSignalAI
              </span>
            </a>
            <div className="flex items-center space-x-8">
              <a
                href="/"
                className="text-gray-600 hover:text-blue-600 font-medium transition-colors"
              >
                Home
              </a>
              <a
                href="/ai"
                className="text-blue-600 font-medium hover:text-blue-700"
              >
                AI Advisor
              </a>
              <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white font-medium transition-colors flex items-center space-x-1.5 text-sm">
                <Download className="h-4 w-4" />
                <span>Export</span>
              </button>
              {/* NEW: Toggle AI Analysis */}
              <button
                className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  skipAIAnalysis
                    ? "bg-gray-200 border-gray-400 text-gray-700"
                    : "bg-green-100 border-green-400 text-green-700"
                }`}
                onClick={() => setSkipAIAnalysis((v) => !v)}
                title="Toggle AI analysis on company select"
              >
                <Zap className="h-4 w-4" />
                <span>{skipAIAnalysis ? "Skip AI Analysis" : "AI Analysis On"}</span>
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main className="container mx-auto py-4 px-4">
        {/* Search Section */}
        <section className="mb-6 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 w-full max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold mb-3 flex items-center justify-center">
              <Search className="h-5 w-5 mr-2 text-indigo-600" />
              Deep Company Search
            </h2>
            <form onSubmit={handleSearch} className="flex gap-2 items-center justify-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a company (e.g., Apple, AAPL, Tech sector, 'best AI stocks')"
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              <button
                type="submit"
                className={`px-5 py-2 rounded-lg transition-colors flex items-center space-x-1 font-medium
    ${isLoading ? "bg-indigo-300 cursor-not-allowed text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                disabled={isLoading}
              >
                {isLoading ? <span className="animate-pulse">Searching...</span> : <span>Search</span>}
              </button>
            </form>
            {error && (
              <div className="mt-3 text-red-600 text-sm text-center">{error}</div>
            )}
            {Array.isArray(companyResults) && companyResults.length > 0 && !selectedCompany && (
  <div className="mt-4">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-base font-medium">Results</h3>
      <span className="text-sm text-gray-500">{companyResults.length} companies found</span>
    </div>
    <div className="space-y-2">
      {Array.isArray(companyResults) && companyResults.length > 0
  ? companyResults.filter(Boolean).map((company) => (
      <div
        key={(company?.ticker || "") + (company?.idx || "")}
        className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-center"
        onClick={() => handleSelectCompany(company)}
      >
        {company.logo ? (
          <img
            src={company.logo}
            alt={`${company.name} logo`}
            className="w-8 h-8 rounded-full mr-3 object-cover bg-gray-100"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full mr-3 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-base uppercase">
            {company.name?.[0] || company.ticker?.[0] || "?"}
          </div>
        )}
        <div className="flex-1">
          <h4 className="font-medium">{company.name}</h4>
          <p className="text-sm text-gray-600">{company.sector}</p>
          <p className="text-xs text-gray-500 mt-1">{company.rationale}</p>
        </div>
        <div className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-medium text-sm">
          {company.ticker}
        </div>
      </div>
    ))
  : null}
    </div>
  </div>
)}
          </div>
        </section>

        {/* Analysis Results */}
             {selectedCompany && analysisData && (
          <>
                        {/* Company Header + News Digest */}
            <section className="mb-5">
              <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    {selectedCompany.logo ? (
                      <img
                        src={selectedCompany.logo}
                        alt={`${selectedCompany.name} logo`}
                        className="w-10 h-10 rounded-full mr-3 object-cover bg-gray-100"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full mr-3 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-lg uppercase">
                        {selectedCompany.name?.[0] || selectedCompany.ticker?.[0] || "?"}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-xl font-bold">{selectedCompany.name}</h2>
                        <button
                          onClick={toggleWatchlist}
                          className={`p-1 rounded-full transition-colors ${savedWatchlist ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-gray-500'}`}
                          title={savedWatchlist ? "Remove from watchlist" : "Add to watchlist"}
                        >
                          <Bookmark className="h-4 w-4" fill={savedWatchlist ? "currentColor" : "none"} />
                        </button>
                      </div>
                      <div className="flex items-center space-x-3 mt-1">
                        <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-medium text-sm">
                          {selectedCompany.ticker}
                        </span>
                        <span className="text-gray-600 text-sm">{selectedCompany.sector}</span>
                        {analysisData.profile && analysisData.profile.weburl && (
                          <a
                            href={analysisData.profile.weburl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            <span>Company Website</span>
                          </a>
                        )}
                      </div>
                      {analysisData.profile && analysisData.profile.description && (
                        <div className="text-xs text-gray-500 mt-2 max-w-xl">
                          {analysisData.profile.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {analysisData.quote && (analysisData.quote.regularMarketPrice !== null && analysisData.quote.regularMarketPrice !== undefined)
                        ? `$${formatNumber(analysisData.quote.regularMarketPrice)}`
                        : "N/A"}
                    </div>
                    <div
                      className={`flex items-center justify-end space-x-1 ${
                        analysisData.quote && analysisData.quote.regularMarketChange > 0
                          ? "text-green-600"
                          : analysisData.quote && analysisData.quote.regularMarketChange < 0
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      <span className="text-sm">
                        {analysisData.quote && analysisData.quote.regularMarketChangePercent != null
                          ? `${(analysisData.quote.regularMarketChangePercent * 100).toFixed(2)}%`
                          : "0.00%"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* NEW: News Digest */}
                {Array.isArray(newsDigest) && newsDigest.length > 0 && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                        <Bell className="h-4 w-4 mr-2 text-indigo-600" />
                        News Digest
                      </h3>
                      <button
                        className="text-xs text-indigo-600 hover:text-indigo-700"
                        onClick={() => setShowAllNews((v) => !v)}
                      >
                        {showAllNews ? "Show less" : "View all"}
                      </button>
                    </div>

                    <ul className="space-y-2">
                      {(showAllNews ? newsDigest : newsDigest.slice(0, 5)).map((n, idx) => (
                        <li key={idx} className="flex items-start justify-between">
                          <div className="flex items-start">
                            <span
                              className={`mt-1 mr-2 inline-block w-2 h-2 rounded-full ${
                                n.sentiment === "positive"
                                  ? "bg-green-500"
                                  : n.sentiment === "negative"
                                  ? "bg-red-500"
                                  : n.sentiment === "mixed"
                                  ? "bg-yellow-500"
                                  : "bg-gray-400"
                              }`}
                              title={n.sentiment}
                            />
                            <div>
                              <a
                                href={n.url || "#"}
                                target={n.url ? "_blank" : undefined}
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-gray-900 hover:text-indigo-700"
                              >
                                {n.title}
                              </a>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {n.source ? `${n.source} • ` : ""}
                                {n.date ? new Date(n.date).toLocaleString() : ""}
                                {Array.isArray(n.nums) && n.nums.length > 0 && (
                                  <span className="ml-2 text-[11px] text-gray-600">
                                    {n.nums.slice(0, 3).join("  •  ")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {n.url ? (
                            <a
                              href={n.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center"
                              title="Open article"
                            >
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>


            {/* Navigation Tabs */}
            <div className="mb-5 bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <div className="flex border-b min-w-max">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    className={`px-6 py-3 font-medium text-sm uppercase tracking-wider whitespace-nowrap ${
                      activeTab === tab
                        ? "border-b-2 border-indigo-600 text-indigo-600"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Main Content Area */}
              <div className="lg:col-span-2 space-y-5">
                {/* Overview Tab */}
                {activeTab === "overview" && (
                  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold">Company Overview</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(analysisData.overview)
                        .slice(0, showAllMetrics ? undefined : 8)
                        .map(([key, value]) => (
                          <div key={key} className="bg-gray-50 p-3 rounded-lg">
                            <div className="text-gray-500 text-sm capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</div>
                            <div className="font-semibold text-lg">{value}</div>
                          </div>
                        ))}
                    </div>

                    {Object.keys(analysisData.overview).length > 8 && (
                      <button
                        onClick={() => setShowAllMetrics(!showAllMetrics)}
                        className="mt-3 text-indigo-600 hover:text-indigo-700 text-sm flex items-center mx-auto"
                      >
                        {showAllMetrics ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-1" />
                            <span>Show Less</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1" />
                            <span>Show All Metrics</span>
                          </>
                        )}
                      </button>
                    )}

<div className="mt-5 pt-4 border-t border-gray-100">
  <h4 className="font-medium mb-2 flex items-center">
    <Zap className="h-4 w-4 mr-1.5 text-indigo-600" />
    AI-Generated Summary
  </h4>
  {aiAnalysisLoading ? (
    <p className="text-gray-500 text-sm animate-pulse">Generating summary...</p>
  ) : (
    <p className="text-gray-700 leading-relaxed text-sm">
      {
        (aiAnalysis && aiAnalysis.legacy && aiAnalysis.legacy.summaryText && aiAnalysis.legacy.summaryText.trim() && aiAnalysis.legacy.summaryText.trim().toLowerCase() !== "fallback summary." && aiAnalysis.legacy.summaryText.trim().toLowerCase() !== "autofallback summary.")
          ? aiAnalysis.legacy.summaryText
          : (analysisData && analysisData.legacy && analysisData.legacy.summaryText && analysisData.legacy.summaryText.trim() && analysisData.legacy.summaryText.trim().toLowerCase() !== "fallback summary." && analysisData.legacy.summaryText.trim().toLowerCase() !== "autofallback summary.")
            ? analysisData.legacy.summaryText
            : (analysisData.profile && analysisData.profile.description)
              ? analysisData.profile.description
              : "No AI summary available for this company."
      }
    </p>
  )}
</div>
                  </div>
                )}

                {/* Charts Tab */}
                {activeTab === "charts" && (
                  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold flex items-center">
                        <BarChart2 className="h-5 w-5 mr-2 text-indigo-600" />
                        Technical Analysis
                      </h3>

                      <div className="flex bg-gray-100 rounded-lg p-0.5">
                        {["1D", "1W", "1M", "3M", "1Y", "5Y"].map((range) => (
                          <button
                            key={range}
                            className={`px-3 py-1 text-xs font-medium rounded-md ${
                              timeRange === range
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                            }`}
                            onClick={() => setTimeRange(range)}
                          >
                            {range}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* TradingView Chart */}
                    <TradingViewChart
                      candleData={chartData.candleData}
                      plan={analysisData.plan}
                      timeRange={timeRange}
                      symbol={selectedCompany.ticker}
                      theme="light"
                    />
                  </div>
                )}

                {/* Trading Plan Tab */}
{activeTab === "trading plan" && (
  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
    <h3 className="text-lg font-semibold mb-4 flex items-center">
      <Target className="h-5 w-5 mr-2 text-indigo-600" />
      AI-Generated Trading Plan
    </h3>
    <div className="mb-6">
      <TradingViewChart
        candleData={chartData.candleData}
        plan={analysisData.plan}
        timeRange={timeRange}
        symbol={selectedCompany.ticker}
        theme="light"
      />
    </div>
    {!analysisData?.plan ? (
      <div className="text-gray-500 text-sm">No plan available.</div>
    ) : (
      <>
        {/* Core Levels */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-gray-50 rounded p-3">
            <div className="text-xs text-gray-500">Entry</div>
            <div className="font-semibold text-lg">{analysisData.plan.entry != null ? `$${analysisData.plan.entry}` : "N/A"}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-xs text-gray-500">Stop</div>
            <div className="font-semibold text-lg">{analysisData.plan.stop != null ? `$${analysisData.plan.stop}` : "N/A"}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-xs text-gray-500">TP1</div>
            <div className="font-semibold text-lg">{analysisData.plan.tp1 != null ? `$${analysisData.plan.tp1}` : "N/A"}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-xs text-gray-500">TP2</div>
            <div className="font-semibold text-lg">{analysisData.plan.tp2 != null ? `$${analysisData.plan.tp2}` : "N/A"}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-xs text-gray-500">Position Size</div>
            <div className="font-semibold text-lg">{analysisData.plan.positionSizePct != null ? `${analysisData.plan.positionSizePct}%` : "N/A"}</div>
          </div>
        </div>

        {/* Scenarios */}
        <div className="mb-4">
          <h4 className="font-medium mb-2">Scenarios</h4>
          <div className="space-y-2">
            {(analysisData.plan.scenarios || []).map((s, i) => {
              const pct = Math.max(0, Math.min(100, Math.round((Number(s.prob) || 0) * 100)));
              return (
                <div key={i} className="p-3 border border-gray-100 rounded bg-gray-50">
                  <div className="flex justify-between text-sm">
                    <div className="font-medium">{s.name || `Scenario ${i + 1}`}</div>
                    <div className="text-gray-600">Probability: {pct}%</div>
                  </div>
                  {s.target != null && (
                    <div className="text-xs text-gray-600 mt-0.5">Target: ${s.target}</div>
                  )}
                  <div className="w-full bg-white h-2 rounded mt-2 overflow-hidden border border-gray-200">
                    <div className="h-2 bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                  {(s.triggers || []).length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-xs text-gray-700">
                      {s.triggers.map((t, idx) => <li key={idx}>{t}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rationale */}
        {(analysisData.plan.rationale || []).length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Rationale</h4>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              {analysisData.plan.rationale.map((r, idx) => <li key={idx}>{r}</li>)}
            </ul>
          </div>
        )}
      </>
    )}
  </div>
)}

                {/* Risk Analysis Tab */}
{activeTab === "risk analysis" && (
  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
    <h3 className="text-lg font-semibold mb-4 flex items-center">
      <Shield className="h-5 w-5 mr-2 text-indigo-600" />
      Risk Analysis
    </h3>

    {!analysisData?.risk ? (
      <div className="text-gray-500 text-sm">No risk data available.</div>
    ) : (
      <>
        {/* Risk Score */}
        <div className="mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Risk Score</span>
            <span className="font-semibold">{Number(analysisData.risk.riskScore ?? 0)}</span>
          </div>
          <div className="w-full bg-gray-100 h-2 rounded mt-2 overflow-hidden">
            <div
              className={`h-2 ${Number(analysisData.risk.riskScore) > 66 ? "bg-red-500" : Number(analysisData.risk.riskScore) > 33 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${Math.max(0, Math.min(100, Number(analysisData.risk.riskScore) || 0))}%` }}
            />
          </div>
          {analysisData.risk.volatilityNote && (
            <div className="text-xs text-gray-600 mt-2">
              <span className="font-semibold">Volatility:</span> {analysisData.risk.volatilityNote}
            </div>
          )}
        </div>

        {/* Invalidation Levels */}
        {(analysisData.risk.invalidation || []).length > 0 && (
          <div className="mb-4">
            <h4 className="font-medium mb-2">Invalidation</h4>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              {analysisData.risk.invalidation.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        {/* Top Signals */}
        {(analysisData.risk.signalsTop || []).length > 0 && (
          <div className="mb-4">
            <h4 className="font-medium mb-2">Signals</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {analysisData.risk.signalsTop.map((s, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded p-3">
                  <div className="text-xs text-gray-500">{s.name}</div>
                  <div className="font-semibold">{typeof s.value === "number" ? s.value : String(s.value)}</div>
                  <div className="text-xs text-gray-600 mt-1">{s.comment}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Static risk factors you already had */}
        {(riskFactors || []).length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Contextual Factors</h4>
            <div className="space-y-2">
              {riskFactors.map((rf, idx) => (
                <div key={idx} className="border border-gray-100 rounded p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{rf.factor}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      rf.impact === "High" ? "bg-red-50 text-red-700 border border-red-100"
                      : rf.impact === "Medium" ? "bg-amber-50 text-amber-700 border border-amber-100"
                      : "bg-green-50 text-green-700 border border-green-100"
                    }`}>{rf.impact}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{rf.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )}
  </div>
)}
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* AI Recommendation */}
                <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                  <h3 className="text-lg font-semibold mb-3">{skipAIAnalysis ? "Recommendation" : "AI Recommendation"}</h3>
                  <div className={`text-center p-3 rounded-lg mb-3 ${
                    analysisData.recommendation.rating.includes("Buy") ? "bg-green-50 text-green-800 border border-green-100" :
                      analysisData.recommendation.rating.includes("Sell") ? "bg-red-50 text-red-800 border border-red-100" : "bg-amber-50 text-amber-800 border border-amber-100"
                  }`}>
                    <div className="text-xl font-bold mb-1">{analysisData.recommendation.rating}</div>
                    <div className="text-sm">Confidence: {analysisData.recommendation.confidence}%</div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-sm">Target Price</span>
                      <span className="font-semibold">{analysisData.recommendation.targetPrice}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-sm">Potential Upside</span>
                      <span className="font-semibold text-green-600">{analysisData.recommendation.upside}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-sm">Time Horizon</span>
                      <span className="font-semibold">{analysisData.recommendation.timeHorizon}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-sm">Analyst Consensus</h4>
                      <span className="text-xs text-gray-500">{analysisData.recommendation.analystCount} analysts</span>
                    </div>
                    <div className="flex h-7 rounded-full overflow-hidden">
                      <div
                        className="bg-green-500"
                        style={{ width: `${(analysisData.recommendation.analystRatings.buy / (analysisData.recommendation.analystCount || 1)) * 100}%` }}
                        title="Buy"
                      ></div>
                      <div
                        className="bg-amber-500"
                        style={{ width: `${(analysisData.recommendation.analystRatings.hold / (analysisData.recommendation.analystCount || 1)) * 100}%` }}
                        title="Hold"
                      ></div>
                      <div
                        className="bg-red-500"
                        style={{ width: `${(analysisData.recommendation.analystRatings.sell / (analysisData.recommendation.analystCount || 1)) * 100}%` }}
                        title="Sell"
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs mt-1 text-gray-600">
                      <span>Buy ({analysisData.recommendation.analystRatings.buy})</span>
                      <span>Hold ({analysisData.recommendation.analystRatings.hold})</span>
                      <span>Sell ({analysisData.recommendation.analystRatings.sell})</span>
                    </div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                  <h3 className="text-base font-semibold mb-3">Key Metrics</h3>
                  <div className="space-y-3">
                    {keyMetrics.slice(0, 6).map((metric, index) => (
                      <div key={index} className="flex justify-between items-center group">
                        <div className="relative">
                          <span className="text-gray-600 text-sm group-hover:text-gray-900 transition-colors">{metric.name}</span>
                          <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block">
                            <div className="bg-gray-800 text-white text-xs rounded py-1 px-2 max-w-[200px]">
                              {metric.description}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <span className="font-medium text-sm mr-1">{metric.value}</span>
                          {metric.trend === "up" ? (
                            <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <TrendingUp className="h-3.5 w-3.5 text-red-600 transform rotate-180" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent News */}
                <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base font-semibold">Recent News</h3>
                    {recentNews.length > 4 && (
                      <button
                        className="text-indigo-600 hover:text-indigo-700 text-xs"
                        onClick={() => setShowAllNews((v) => !v)}
                      >
                        {showAllNews ? "Show Less" : "View All"}
                      </button>
                    )}
                  </div>
<div className="space-y-3">
  {recentNews.length === 0 ? (
    <div className="text-gray-400 text-xs">No recent news found.</div>
  ) : (
    (showAllNews ? recentNews : recentNews.slice(0, 4)).map((news, index) => (
      <div key={index} className="border-b border-gray-100 last:border-0 pb-2.5 last:pb-0">
        <h4 className={`font-medium text-sm ${getSentimentColor(news.sentiment)}`}>
          {news.url ? (
            <a href={news.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {news.title}
            </a>
          ) : (
            news.title
          )}
        </h4>
        <div className="flex justify-between mt-1">
          <span className="text-gray-500 text-xs">{news.date}</span>
          <span className="text-gray-500 text-xs">{news.source}</span>
        </div>
        {news.summary && (
          <div className="text-xs text-gray-600 mt-1">{news.summary}</div>
        )}
      </div>
    ))
  )}
</div>
                </div>

                {/* AI Insights */}
{!skipAIAnalysis && (
  <div className="bg-indigo-50 rounded-xl shadow-sm p-5 border border-indigo-100">
    <div className="flex items-center mb-3">
      <Zap className="h-5 w-5 text-indigo-600 mr-2" />
      <h3 className="text-base font-semibold text-indigo-800">AI News Digest</h3>
    </div>
    <div className="text-indigo-700 text-sm">
      {aiAnalysisLoading
        ? "Loading AI insights..."
        : aiAnalysis && aiAnalysis.legacy && aiAnalysis.legacy.newsSummaryText
        ? aiAnalysis.legacy.newsSummaryText
        : "No AI insights available."}
    </div>
  </div>
)}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// --- MAIN PAGE EXPORT ---
export default function TrueSignalAIPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [companyResults, setCompanyResults] = useState([]);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [savedWatchlist, setSavedWatchlist] = useState(false);
  const [timeRange, setTimeRange] = useState("1M");
  const [recentNews, setRecentNews] = useState([]);
  const [keyMetrics, setKeyMetrics] = useState([]);
  const [error, setError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [chartData, setChartData] = useState({ priceHistory: [], volumeData: [], candleData: [] });
  const [aiTelemetry, setAiTelemetry] = useState(null);

  // NEW: Toggle to skip AI analysis
  const [skipAIAnalysis, setSkipAIAnalysis] = useState(false);

  const userId = useMemo(getUserId, []);
  const debounceRef = useRef();

  useEffect(() => {
    let ignore = false;
    async function loadWatchlist() {
      try {
        const data = await fetchAPI(`${API_BASE}/api/watchlist/${userId}`);
        if (!ignore) setWatchlist(data.watchlist || []);
      } catch {
        if (!ignore) setWatchlist([]);
      }
    }
    loadWatchlist();
    return () => { ignore = true; };
  }, [userId]);

  useEffect(() => {
    if (selectedCompany?.ticker) {
      setSavedWatchlist(watchlist.includes(selectedCompany.ticker));
    } else {
      setSavedWatchlist(false);
    }
  }, [selectedCompany, watchlist]);

  const searchCompanies = useCallback(async (query) => {
    setIsLoading(true);
    setError(null);
    setCompanyResults([]);
    setSelectedCompany(null);
    setAnalysisData(null);
    setRecentNews([]);
    setKeyMetrics([]);
    setAiAnalysis(null);
    setAiTelemetry(null);

    try {
      const url = `${API_BASE}/api/deep-search`;
      const data = await fetchAPI(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setCompanyResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setError("Failed to fetch companies. Please try again.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setCompanyResults([]);
      setSelectedCompany(null);
      setAnalysisData(null);
      setRecentNews([]);
      setKeyMetrics([]);
      setAiAnalysis(null);
      setAiTelemetry(null);
      setError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchCompanies(searchQuery);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const analyzeCompany = useCallback(async (company) => {
    setIsLoading(true);
    setError(null);
    setAnalysisData(null);
    setRecentNews([]);
    setKeyMetrics([]);
    setAiAnalysis(null);
    setAiTelemetry(null);
    setAiAnalysisLoading(true);

    const applyNormalized = (aiObj) => {
      const norm = normalizeAi(aiObj, company);
      const metrics = aiObj?.fundamentals?.defaultKeyStatistics || {};
      const sidebarMetrics = [
        {
          name: "Revenue Growth (YoY)",
          value: metrics.revenueGrowth
            ? `${(
                typeof metrics.revenueGrowth === "object"
                  ? metrics.revenueGrowth.raw * 100
                  : metrics.revenueGrowth * 100
              ).toFixed(1)}%`
            : "N/A",
          trend:
            (typeof metrics.revenueGrowth === "object"
              ? metrics.revenueGrowth.raw
              : metrics.revenueGrowth) > 0
              ? "up"
              : "down",
          description: "Year-over-year revenue growth rate",
        },
        {
          name: "Profit Margin",
          value: metrics.profitMargins
            ? `${(
                typeof metrics.profitMargins === "object"
                  ? metrics.profitMargins.raw * 100
                  : metrics.profitMargins * 100
              ).toFixed(1)}%`
            : "N/A",
          trend:
            (typeof metrics.profitMargins === "object"
              ? metrics.profitMargins.raw
              : metrics.profitMargins) > 0
              ? "up"
              : "down",
          description: "Net profit as a percentage of revenue",
        },
        {
          name: "Debt to Equity",
          value: formatNumber(metrics.debtToEquity) || "N/A",
          trend:
            (typeof metrics.debtToEquity === "object"
              ? metrics.debtToEquity.raw
              : metrics.debtToEquity) < 1
              ? "up"
              : "down",
          description: "Total debt relative to shareholders' equity",
        },
        {
          name: "Return on Equity",
          value: metrics.returnOnEquity
            ? `${(
                typeof metrics.returnOnEquity === "object"
                  ? metrics.returnOnEquity.raw * 100
                  : metrics.returnOnEquity * 100
              ).toFixed(1)}%`
            : "N/A",
          trend:
            (typeof metrics.returnOnEquity === "object"
              ? metrics.returnOnEquity.raw
              : metrics.returnOnEquity) > 0
              ? "up"
              : "down",
          description: "Net income as a percentage of shareholders' equity",
        },
        {
          name: "Free Cash Flow",
          value: metrics.freeCashflow
            ? `$${formatNumber(metrics.freeCashflow)}`
            : "N/A",
          trend:
            (typeof metrics.freeCashflow === "object"
              ? metrics.freeCashflow.raw
              : metrics.freeCashflow) > 0
              ? "up"
              : "down",
          description: "Cash generated after capital expenditures",
        },
        // Optionally add PEG ratio or P/S if available
        ...(metrics.pegRatio
          ? [{
              name: "PEG Ratio",
              value: formatNumber(metrics.pegRatio),
              trend: metrics.pegRatio < 1 ? "up" : "down",
              description: "Price/Earnings to Growth ratio",
            }]
          : []),
        ...(metrics.priceToSalesTrailing12Months
          ? [{
              name: "Price to Sales",
              value: formatNumber(metrics.priceToSalesTrailing12Months),
              trend: metrics.priceToSalesTrailing12Months < 5 ? "up" : "down",
              description: "Valuation: price divided by sales per share",
            }]
          : []),
      ];
      setKeyMetrics(sidebarMetrics);

      setRecentNews(
        (
          Array.isArray(aiObj.news) && aiObj.news.length > 0
            ? aiObj.news
            : norm.newsDigest || []
        )
          .slice(0, 8)
          .map((n) => ({
            title: n.title || n.headline || n.t || "",
            date: n.date
              ? new Date(n.date).toLocaleDateString()
              : n.publishedAt
              ? new Date(n.publishedAt).toLocaleDateString()
              : "",
            sentiment: n.sentiment || n.direction || "neutral",
            source: n.source || n.publisher || "",
            url: n.url || "",
            summary: n.summary || "",
          }))
      );

      setAnalysisData({
        overview: norm.overview,
        recommendation: norm.recommendation,
        quote: norm.quote,
        profile: norm.profile,
        plan: norm.plan,
        risk: norm.risk,
        fundamentals: aiObj.fundamentals || {},
        analyst: aiObj.analyst || {},
        legacy: aiObj.legacy || {},
      });

      setAiAnalysis(aiObj || null);
    };

    try {
      const aiRes = await fetchAPI(`${API_BASE}/api/ai-analysis/${company.ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userQuery: "",
          timeframe: "1d",
          newsDays: 14,
          detailLevel: "low",
          objective: "general",
          userId,
        }),
      });

      applyNormalized(aiRes.aiAnalysis || {});

      if (aiRes.tokens || aiRes.latency || aiRes.promptChars) {
        setAiTelemetry({
          promptChars: aiRes.promptChars,
          inputTokens: aiRes.tokens?.input ?? aiRes.tokens?.prompt_tokens ?? null,
          outputTokens: aiRes.tokens?.output ?? aiRes.tokens?.completion_tokens ?? null,
          latency: aiRes.latency,
        });
      } else {
        setAiTelemetry(null);
      }
    } catch (err) {
      try {
        const facts = await fetchAPI(`${API_BASE}/api/derived/${encodeURIComponent(company.ticker)}?timeframe=1d&newsDays=14`);
        const aiFallback = makeAiFromFacts(facts);
        applyNormalized(aiFallback);
        setError(null);
      } catch {
        if (err?.message && (err.message.includes("AI did not return valid JSON") || err.message.includes("AI output invalid"))) {
          setError("AI failed to analyze this company due to a data or formatting issue. Please try again later or with a different company.");
        } else {
          setError(err?.message || "Failed to fetch company analysis. Please try again.");
        }
      }
    }

    setAiAnalysisLoading(false);
    setIsLoading(false);
  }, [userId]);

  // Chart data (real candles)
  const rangeToInterval = useCallback((range) => {
    switch (range) {
      case "1D": return "1m";
      case "1W": return "5m";
      case "1M": return "1d";
      case "3M": return "1d";
      case "1Y": return "1wk";
      default: return "1mo";
    }
  }, []);
  const rangeToRange = useCallback((range) => {
    switch (range) {
      case "1D": return "5d";
      case "1W": return "1mo";
      case "1M": return "3mo";
      case "3M": return "6mo";
      case "1Y": return "1y";
      default: return "5y";
    }
  }, []);

  const fetchCandles = useCallback(async (ticker, range) => {
    const interval = rangeToInterval(range);
    const range_ = rangeToRange(range);
    try {
      const data = await fetchAPI(`${API_BASE}/api/history/${encodeURIComponent(ticker)}?interval=${interval}&range_=${range_}`);
      const timestamps = data?.timestamp || [];
      const candles = data?.indicators?.quote?.[0] || {};
      const opens = candles.open || [];
      const closes = candles.close || [];
      const highs = candles.high || [];
      const lows = candles.low || [];
      const volumes = candles.volume || [];
const rows = timestamps.map((ts, i) => ({
  time: ts, // <- keep raw epoch seconds from API
  dateLabel: new Date(ts * 1000).toLocaleDateString(), // optional, for UI only
  price: Number(closes[i] ?? 0),
  open: Number(opens[i] ?? 0),
  close: Number(closes[i] ?? 0),
  high: Number(highs[i] ?? 0),
  low: Number(lows[i] ?? 0),
  volume: Number(volumes[i] ?? 0),
}));
setChartData({
  priceHistory: rows.map(r => ({ date: r.dateLabel, price: r.price })),
  volumeData: rows.map(r => ({ date: r.dateLabel, volume: r.volume })),
  candleData: rows,  // <- includes time (seconds)
  raw: rows
});

      setChartData({
        priceHistory: rows.map(r => ({ date: r.date, price: r.price })),
        volumeData: rows.map(r => ({ date: r.date, volume: r.volume })),
        candleData: rows,
        raw: rows // keep raw for full info
      });
    } catch {
      setChartData({ priceHistory: [], volumeData: [], candleData: [], raw: [] });
    }
  }, [rangeToInterval, rangeToRange]);

  useEffect(() => {
    if (selectedCompany?.ticker) {
      fetchCandles(selectedCompany.ticker, timeRange);
    }
  }, [selectedCompany?.ticker, timeRange, fetchCandles]);

  const handleSearch = useCallback((e) => {
    e.preventDefault();
  }, []);

  const memoizedCompanyResults = useMemo(() => {
    if (!Array.isArray(companyResults)) return [];
    return companyResults.filter(Boolean).map((company, idx) => {
      const profile = company && typeof company === "object" ? (company.profile || {}) : {};
      const logo = getCompanyLogo(company || {});
      const name = profile.name || company?.description || company?.name || company?.symbol || "Unknown";
      const ticker = company?.symbol || profile.ticker || company?.ticker || "";
      const sector = profile.finnhubIndustry || profile.sector || company?.sector || "";
      const rationale = profile.exchange || profile.country || "";
      return {
        ...company,
        logo,
        name,
        ticker,
        sector,
        rationale,
        profile,
        idx
      };
    });
  }, [companyResults]);

  const handleSelectCompany = useCallback(async (company) => {
    setSelectedCompany(company);
    setActiveTab("overview");
    setShowAllMetrics(false);

    if (!skipAIAnalysis) {
      analyzeCompany(company);
    } else {
      // Fetch raw data directly from backend endpoints
      setIsLoading(true);
      setAnalysisData(null);
      setRecentNews([]);
      setKeyMetrics([]);
      setAiAnalysis(null);
      setAiTelemetry(null);

      try {
        const [profile, quote, fundamentals, analyst, news] = await Promise.all([
          fetchAPI(`${API_BASE}/api/profile/${company.ticker}`),
          fetchAPI(`${API_BASE}/api/quote/${company.ticker}`),
          fetchAPI(`${API_BASE}/api/fundamentals/${company.ticker}`),
          fetchAPI(`${API_BASE}/api/analyst/${company.ticker}`),
          fetchAPI(`${API_BASE}/api/news/${company.ticker}?max_articles=8`)
        ]);

        // --- Normalize Yahoo modules for overview ---
        // Defensive helpers
        const get = (obj, path) => {
          try {
            return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
          } catch {
            return undefined;
          }
        };
        const num = (v) => (typeof v === "number" ? v : (v && typeof v.raw === "number" ? v.raw : null));

        // Overview fields
        const overview = {
          marketCap:
            num(get(fundamentals, "summaryDetail.marketCap")) ??
            num(get(fundamentals, "price.marketCap")) ??
            null,
          peRatio:
            num(get(fundamentals, "summaryDetail.trailingPE")) ??
            num(get(fundamentals, "defaultKeyStatistics.trailingPE")) ??
            num(get(fundamentals, "summaryDetail.forwardPE")) ??
            num(get(fundamentals, "defaultKeyStatistics.forwardPE")) ??
            null,
          dividend:
            num(get(fundamentals, "summaryDetail.dividendRate")) ??
            null,
          beta:
            num(get(fundamentals, "defaultKeyStatistics.beta")) ??
            null,
          yearHigh:
            num(get(fundamentals, "summaryDetail.fiftyTwoWeekHigh")) ??
            null,
          yearLow:
            num(get(fundamentals, "summaryDetail.fiftyTwoWeekLow")) ??
            null,
          avgVolume:
            num(get(fundamentals, "price.averageDailyVolume3Month")) ??
            num(get(fundamentals, "summaryDetail.averageVolume")) ??
            null,
          eps:
            num(get(fundamentals, "defaultKeyStatistics.trailingEps")) ??
            num(get(fundamentals, "earningsTraillingTwelveMonths")) ??
            null,
          priceToSales:
            num(get(fundamentals, "summaryDetail.priceToSalesTrailing12Months")) ??
            null,
          priceToBook:
            num(get(fundamentals, "defaultKeyStatistics.priceToBook")) ??
            null,
          debtToEquity:
            num(get(fundamentals, "financialData.debtToEquity")) ??
            null,
          quickRatio:
            num(get(fundamentals, "financialData.quickRatio")) ??
            null,
          roe:
            num(get(fundamentals, "financialData.returnOnEquity")) ??
            null,
        };

        // --- Key Metrics (right card) ---
        const keyMetrics = [
          {
            name: "Revenue Growth (YoY)",
            value: num(get(fundamentals, "financialData.revenueGrowth")),
            trend: num(get(fundamentals, "financialData.revenueGrowth")) > 0 ? "up" : "down",
            description: "Year-over-year revenue growth rate",
          },
          {
            name: "Profit Margin",
            value:
              num(get(fundamentals, "defaultKeyStatistics.profitMargins")) ??
              num(get(fundamentals, "financialData.profitMargins")),
            trend:
              (num(get(fundamentals, "defaultKeyStatistics.profitMargins")) ??
                num(get(fundamentals, "financialData.profitMargins"))) > 0
                ? "up"
                : "down",
            description: "Net profit as a percentage of revenue",
          },
          {
            name: "Debt to Equity",
            value: num(get(fundamentals, "financialData.debtToEquity")),
            trend: num(get(fundamentals, "financialData.debtToEquity")) < 1 ? "up" : "down",
            description: "Total debt relative to shareholders' equity",
          },
          {
            name: "Return on Equity",
            value: num(get(fundamentals, "financialData.returnOnEquity")),
            trend: num(get(fundamentals, "financialData.returnOnEquity")) > 0 ? "up" : "down",
            description: "Net income as a percentage of shareholders' equity",
          },
          // Free Cash Flow Margin not available in Yahoo modules directly
        ].filter((m) => m.value !== undefined);

        setKeyMetrics(
          keyMetrics.map((m) => ({
            ...m,
            value:
              m.value == null
                ? "N/A"
                : m.name === "Debt to Equity"
                ? m.value.toFixed(2)
                : m.name === "Profit Margin" || m.name === "Revenue Growth (YoY)" || m.name === "Return on Equity"
                ? `${(m.value * 100).toFixed(1)}%`
                : m.value,
          }))
        );

        // --- News normalization ---
        const newsArr = Array.isArray(news?.news)
          ? news.news.slice(0, 8).map((n) => {
              const url = n.url || "";
              let source = "";
              try {
                source = url ? new URL(url).hostname.replace(/^www\./, "") : "";
              } catch {
                source = "";
              }
              let date = null;
              if (n.num && n.num.published) {
                try {
                  date = new Date(n.num.published).toLocaleDateString();
                } catch {
                  date = null;
                }
              }
              return {
                title: n.t || n.title || "",
                url,
                source,
                date,
                summary: "",
                sentiment: n.sentiment || "neutral",
              };
            }).filter((n) => n.title)
          : [];

        setRecentNews(newsArr);

        // --- Quote normalization ---
        const quoteObj = {
          regularMarketPrice: num(get(quote, "regularMarketPrice")) ?? null,
          regularMarketChange: num(get(quote, "regularMarketChange")) ?? null,
          regularMarketChangePercent: num(get(quote, "regularMarketChangePercent")) ?? null,
        };

        setAnalysisData({
          overview,
          recommendation: {
            rating: "N/A",
            targetPrice: analyst?.targetMean != null ? `$${analyst.targetMean}` : "N/A",
            upside: analyst?.impliedPct != null ? `${analyst.impliedPct > 0 ? "+" : ""}${analyst.impliedPct}%` : "N/A",
            confidence: "N/A",
            timeHorizon: "N/A",
            analystCount: (analyst?.buy ?? 0) + (analyst?.hold ?? 0) + (analyst?.sell ?? 0),
            analystRatings: {
              buy: analyst?.buy ?? 0,
              hold: analyst?.hold ?? 0,
              sell: analyst?.sell ?? 0,
            },
          },
          quote: quoteObj,
          profile: profile || {},
          plan: null,
          risk: null,
          fundamentals: undefined,
          analyst: undefined,
          legacy: {},
        });
      } catch (err) {
        setError("Failed to fetch raw company data.");
      }
      setAiAnalysis(null);
      setAiTelemetry(null);
      setIsLoading(false);
    }
  }, [analyzeCompany, skipAIAnalysis]);

  const toggleWatchlist = useCallback(async () => {
    if (!selectedCompany?.ticker) return;
    try {
      if (savedWatchlist) {
        await fetchAPI(`${API_BASE}/api/watchlist/${userId}/${selectedCompany.ticker}`, { method: "DELETE" });
        setWatchlist(watchlist => watchlist.filter(s => s !== selectedCompany.ticker));
      } else {
        await fetchAPI(`${API_BASE}/api/watchlist/${userId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: selectedCompany.ticker })
        });
        setWatchlist(watchlist => [...watchlist, selectedCompany.ticker]);
      }
    } catch {
      setSavedWatchlist(v => !v);
    }
  }, [selectedCompany, savedWatchlist, userId]);

  const getSentimentColor = useCallback((raw) => {
    if (raw == null) return "text-gray-700";
    if (typeof raw === "number") {
      const s = Math.max(-1, Math.min(1, raw));
      if (s > 0.15) return "text-green-700";
      if (s < -0.15) return "text-red-700";
      return "text-gray-700";
    }
    const s = String(raw).toLowerCase();
    if (s.includes("pos")) return "text-green-700";
    if (s.includes("neg")) return "text-red-700";
    return "text-gray-700";
  }, []);

  return (
    <AIFinancialAdvisor
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      handleSearch={handleSearch}
      isLoading={isLoading}
      companyResults={memoizedCompanyResults}
      selectedCompany={selectedCompany}
      handleSelectCompany={handleSelectCompany}
      analysisData={analysisData}
      chartData={chartData}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      showAllMetrics={showAllMetrics}
      setShowAllMetrics={setShowAllMetrics}
      savedWatchlist={savedWatchlist}
      toggleWatchlist={toggleWatchlist}
      timeRange={timeRange}
      setTimeRange={setTimeRange}
      getSentimentColor={getSentimentColor}
      recentNews={recentNews}
      keyMetrics={keyMetrics}
      riskFactors={riskFactors}
      error={error}
      aiAnalysis={aiAnalysis}
      aiAnalysisLoading={aiAnalysisLoading}
      aiTelemetry={aiTelemetry}
      skipAIAnalysis={skipAIAnalysis}
      setSkipAIAnalysis={setSkipAIAnalysis}
    />
  );
}