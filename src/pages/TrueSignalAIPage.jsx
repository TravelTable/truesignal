import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Search, TrendingUp, BarChart2, AlertTriangle, DollarSign, PieChart, ArrowRight, Clock, Target, Shield, Zap, Download, Share2, ChevronDown, Bell, Info, ExternalLink, Bookmark, Eye, Filter, ChevronUp, Calendar, Percent, Briefcase, Signal
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Bar, BarChart
} from "recharts";

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

  // Fallback: return null to indicate no logo, so UI can render initial
  return null;
}

// Helper functions
function formatNumber(num) {
  if (!num && num !== 0) return "N/A";
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1) + "B";
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

// Memoized risk factors (static, for demo)
const riskFactors = [
  { factor: "Regulatory Changes", impact: "High", description: "Potential antitrust legislation in US and EU markets could impact business operations and growth strategy." },
  { factor: "Supply Chain Disruptions", impact: "Medium", description: "Ongoing semiconductor shortages affecting production capacity and product availability in key markets." },
  { factor: "Competition", impact: "Medium", description: "Increasing market share from emerging competitors in key segments, particularly in services and wearables." },
  { factor: "Currency Fluctuations", impact: "Low", description: "Exposure to foreign exchange risk in international markets, particularly in emerging economies." },
  { factor: "Product Cycle", impact: "Medium", description: "Upcoming product refresh cycle may impact short-term performance and inventory management." },
  { factor: "Talent Retention", impact: "Medium", description: "Increasing competition for technical talent in AI and machine learning specialties." }
];

// Main Container Component
export default function TrueSignalAIPage() {
  // State management
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
  const [chartData, setChartData] = useState({ priceHistory: [], volumeData: [] });

  // For AI telemetry
  const [aiTelemetry, setAiTelemetry] = useState(null);

  // For debug tab
  const [showDebug, setShowDebug] = useState(false);
  const [debugJson, setDebugJson] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState(null);

  const userId = useMemo(getUserId, []);

  // Debounce ref for search
  const debounceRef = useRef();

  // Load watchlist on mount
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

  // Update savedWatchlist when selectedCompany or watchlist changes
  useEffect(() => {
    if (selectedCompany?.ticker) {
      setSavedWatchlist(watchlist.includes(selectedCompany.ticker));
    } else {
      setSavedWatchlist(false);
    }
  }, [selectedCompany, watchlist]);

  // Deep Company Search using backend
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

  // Debounced search effect
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
    // Debounce: wait 400ms after user stops typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchCompanies(searchQuery);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Company Analysis using backend (AI-powered)
  const analyzeCompany = useCallback(async (company) => {
    setIsLoading(true);
    setError(null);
    setAnalysisData(null);
    setRecentNews([]);
    setKeyMetrics([]);
    setAiAnalysis(null);
    setAiTelemetry(null);
    setAiAnalysisLoading(true);
    try {
      const aiRes = await fetchAPI(`${API_BASE}/api/ai-analysis/${company.ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userQuery: "",
          timeframe: "1d",
          newsDays: 30,
          detailLevel: "std",
          objective: "general",
          userId
        })
      });
      setAiAnalysis(aiRes.aiAnalysis || null);

      // AI telemetry (tokens, latency, etc.)
      if (aiRes.tokens || aiRes.latency || aiRes.promptChars) {
        setAiTelemetry({
          promptChars: aiRes.promptChars,
          inputTokens: aiRes.tokens?.input,
          outputTokens: aiRes.tokens?.output,
          latency: aiRes.latency
        });
      } else {
        setAiTelemetry(null);
      }

      // Overview metrics (from aiAnalysis.fundamentals/quote)
      const quote = aiRes.aiAnalysis?.quote || {};
      const metrics = aiRes.aiAnalysis?.fundamentals?.defaultKeyStatistics || {};
      const overview = {
        marketCap: metrics.marketCap ? `$${formatNumber(metrics.marketCap)}` : "N/A",
        peRatio: metrics.trailingPE || metrics.forwardPE || "N/A",
        dividend: metrics.dividendYield ? `${metrics.dividendYield}%` : "N/A",
        beta: metrics.beta || "N/A",
        yearHigh: metrics.fiftyTwoWeekHigh ? `$${metrics.fiftyTwoWeekHigh}` : "N/A",
        yearLow: metrics.fiftyTwoWeekLow ? `$${metrics.fiftyTwoWeekLow}` : "N/A",
        avgVolume: metrics.averageDailyVolume10Day ? formatNumber(metrics.averageDailyVolume10Day) : "N/A",
        eps: metrics.trailingEps ? `$${metrics.trailingEps}` : "N/A",
        priceToSales: metrics.priceToSalesTrailing12Months || "N/A",
        priceToBook: metrics.priceToBook || "N/A",
        debtToEquity: metrics.debtToEquity || "N/A",
        quickRatio: metrics.quickRatio || "N/A",
        roe: metrics.returnOnEquity || "N/A"
      };

      // Key Metrics for sidebar
      const sidebarMetrics = [
        {
          name: "Revenue Growth (YoY)",
          value: metrics.revenueGrowth ? `${(metrics.revenueGrowth * 100).toFixed(1)}%` : "N/A",
          trend: metrics.revenueGrowth > 0 ? "up" : "down",
          description: "Year-over-year revenue growth rate"
        },
        {
          name: "Profit Margin",
          value: metrics.profitMargins ? `${(metrics.profitMargins * 100).toFixed(1)}%` : "N/A",
          trend: metrics.profitMargins > 0 ? "up" : "down",
          description: "Net profit as a percentage of revenue"
        },
        {
          name: "Debt to Equity",
          value: metrics.debtToEquity || "N/A",
          trend: metrics.debtToEquity < 1 ? "up" : "down",
          description: "Total debt relative to shareholders' equity"
        },
        {
          name: "Return on Equity",
          value: metrics.returnOnEquity ? `${(metrics.returnOnEquity * 100).toFixed(1)}%` : "N/A",
          trend: metrics.returnOnEquity > 0 ? "up" : "down",
          description: "Net income as a percentage of shareholders' equity"
        },
        {
          name: "Free Cash Flow",
          value: metrics.freeCashflow ? `$${formatNumber(metrics.freeCashflow)}` : "N/A",
          trend: metrics.freeCashflow > 0 ? "up" : "down",
          description: "Cash generated after capital expenditures"
        }
      ];
      setKeyMetrics(sidebarMetrics);

      // News
      const newsArr = aiRes.aiAnalysis?.newsDigest || [];
      setRecentNews(
        (newsArr || []).slice(0, 5).map((n) => ({
          title: n.title || n.headline,
          date: n.date ? new Date(n.date).toLocaleDateString() : "",
          sentiment: n.sentiment || "neutral",
          source: n.source || ""
        }))
      );

      // Recommendation
      const analyst = aiRes.aiAnalysis?.analyst || {};
      let rating = "N/A";
      let analystCount = 0;
      let buy = 0, hold = 0, sell = 0;
      if (analyst.recommendationTrend && analyst.recommendationTrend.trend) {
        const trend = analyst.recommendationTrend.trend[0] || {};
        buy = (trend.strongBuy || 0) + (trend.buy || 0);
        hold = trend.hold || 0;
        sell = (trend.strongSell || 0) + (trend.sell || 0);
        analystCount = buy + hold + sell;
        if (buy >= sell + hold * 1.2) rating = "Strong Buy";
        else if (buy > sell) rating = "Buy";
        else if (hold >= buy && hold >= sell) rating = "Hold";
        else if (sell > buy) rating = "Sell";
      }
      const targetPrice = analyst.earningsTrend?.trend?.[0]?.targetMeanPrice || null;
      const safePrice = quote.regularMarketPrice || null;
      const upsidePct = (targetPrice && safePrice) ? (((targetPrice - safePrice) / safePrice) * 100) : null;
      const recommendation = {
        rating,
        targetPrice: targetPrice ? `$${targetPrice}` : "N/A",
        upside: (upsidePct == null) ? "N/A" : `${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(1)}%`,
        confidence: analystCount ? Math.min(100, Math.round((buy / analystCount) * 100)) : "N/A",
        timeHorizon: "12 months",
        analystCount,
        analystRatings: { buy, hold, sell }
      };

      setAnalysisData({
        overview,
        recommendation,
        quote,
        profile: aiRes.aiAnalysis?.profile || {},
      });

    } catch (err) {
      // Enhanced error handling for AI/JSON errors
      if (
        err.message &&
        (err.message.includes("AI did not return valid JSON") ||
          err.message.includes("AI output invalid after repair attempt."))
      ) {
        setError(
          "AI failed to analyze this company due to a data or formatting issue. Please try again later or with a different company."
        );
      } else {
        setError(
          err.message ||
            "Failed to fetch company analysis. Please try again."
        );
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
      const closes = data?.indicators?.quote?.[0]?.close || [];
      const volumes = data?.indicators?.quote?.[0]?.volume || [];
      const rows = timestamps.map((ts, i) => ({
        date: new Date(ts * 1000).toLocaleDateString(),
        price: Number(closes[i] ?? 0),
        volume: Number(volumes[i] ?? 0),
      }));
      setChartData({
        priceHistory: rows.map(r => ({ date: r.date, price: r.price })),
        volumeData: rows.map(r => ({ date: r.date, volume: r.volume })),
      });
    } catch {
      setChartData({ priceHistory: [], volumeData: [] });
    }
  }, [rangeToInterval, rangeToRange]);

  useEffect(() => {
    if (selectedCompany?.ticker) {
      fetchCandles(selectedCompany.ticker, timeRange);
    }
  }, [selectedCompany?.ticker, timeRange, fetchCandles]);

  // Handle search submission (optional: disables default form submit)
  const handleSearch = useCallback((e) => {
    e.preventDefault();
    // No-op: search is now debounced on input change
  }, []);

  // Memoized search results list for performance
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

  // Handle company selection
  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    analyzeCompany(company);
    setActiveTab("overview");
    setShowAllMetrics(false);
    setShowDebug(false);
    setDebugJson(null);
    setDebugError(null);
  }, [analyzeCompany]);

  // Toggle watchlist status (persisted)
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

  // Generate news sentiment color (robust)
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

  // Debug tab: fetch derived facts JSON
  const fetchDebugJson = useCallback(async () => {
    if (!selectedCompany?.ticker) return;
    setDebugLoading(true);
    setDebugError(null);
    setDebugJson(null);
    try {
      const data = await fetchAPI(`${API_BASE}/api/derived/${selectedCompany.ticker}`);
      setDebugJson(data);
    } catch (err) {
      setDebugError("Failed to fetch derived facts JSON.");
    }
    setDebugLoading(false);
  }, [selectedCompany]);

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
      showDebug={showDebug}
      setShowDebug={setShowDebug}
      fetchDebugJson={fetchDebugJson}
      debugJson={debugJson}
      debugLoading={debugLoading}
      debugError={debugError}
    />
  );
}

// UI Component
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
  showDebug,
  setShowDebug,
  fetchDebugJson,
  debugJson,
  debugLoading,
  debugError
}) {
  // Show debug tab only if user presses a secret key combo or clicks a hidden link
  // We'll use a hidden clickable area in the header for devs
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
              {/* Hidden debug link for devs */}
              <span
                style={{ width: 16, height: 16, opacity: 0, cursor: "pointer" }}
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => setShowDebug((v) => !v)}
                title="Show debug"
              >
                🐞
              </span>
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
            {/* Company Header */}
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
                          <a href={analysisData.profile.weburl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            <span>Company Website</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {analysisData.quote && analysisData.quote.regularMarketPrice ? `$${analysisData.quote.regularMarketPrice}` : "N/A"}
                    </div>
                    <div className={`flex items-center justify-end space-x-1 ${
                      analysisData.quote && analysisData.quote.regularMarketChange > 0
                        ? "text-green-600"
                        : analysisData.quote && analysisData.quote.regularMarketChange < 0
                        ? "text-red-600"
                        : "text-gray-600"
                    }`}>
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-medium">
                        {analysisData.quote && typeof analysisData.quote.regularMarketChange === "number"
                          ? `${analysisData.quote.regularMarketChange > 0 ? "+" : ""}${analysisData.quote.regularMarketChange} (${analysisData.quote.regularMarketChangePercent > 0 ? "+" : ""}${analysisData.quote.regularMarketChangePercent}%)`
                          : "N/A"}
                      </span>
                      <span className="text-xs text-gray-500">Today</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Navigation Tabs */}
            <div className="mb-5 bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <div className="flex border-b min-w-max">
                {["overview", "charts", "trading plan", "risk analysis"].map((tab) => (
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
                {/* Optional debug tab, only visible if showDebug is true */}
                {showDebug && (
                  <button
                    className={`px-6 py-3 font-medium text-sm uppercase tracking-wider whitespace-nowrap ${
                      activeTab === "debug"
                        ? "border-b-2 border-indigo-600 text-indigo-600"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                    onClick={() => {
                      setActiveTab("debug");
                      fetchDebugJson();
                    }}
                  >
                    Debug
                  </button>
                )}
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
                      {/* AI usage telemetry line */}
                      {aiTelemetry && (
                        <div className="text-xs text-gray-500 font-mono flex items-center space-x-2">
                          <span>
                            AI usage:
                            {aiTelemetry.promptChars && (
                              <span> Prompt in: {aiTelemetry.promptChars.toLocaleString()} chars,</span>
                            )}
                            {aiTelemetry.inputTokens && (
                              <span> Input tokens: {aiTelemetry.inputTokens.toLocaleString()},</span>
                            )}
                            {aiTelemetry.outputTokens && (
                              <span> Output tokens: {aiTelemetry.outputTokens.toLocaleString()},</span>
                            )}
                            {aiTelemetry.latency && (
                              <span> Latency: {Number(aiTelemetry.latency).toFixed(2)}s</span>
                            )}
                          </span>
                        </div>
                      )}
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
                          {(aiAnalysis && aiAnalysis.legacy && aiAnalysis.legacy.summaryText) ||
                            (analysisData.profile && analysisData.profile.description) ||
                            `No summary available.`}
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

                    {/* Price Chart */}
                    <div className="mb-5">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-sm">Price History ({timeRange})</h4>
                        <div className="flex items-center space-x-2">
                          <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center">
                            <Filter className="h-3 w-3 mr-1" />
                            <span>Indicators</span>
                          </button>
                          <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center">
                            <Eye className="h-3 w-3 mr-1" />
                            <span>View Options</span>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 h-64 flex items-center justify-center border border-gray-100">
                        {chartData.priceHistory.length > 0 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData.priceHistory}>
                              <XAxis dataKey="date" minTickGap={20} />
                              <YAxis domain={['auto', 'auto']} />
                              <Tooltip />
                              <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="text-center text-gray-500">
                            <BarChart2 className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                            <p className="text-sm">No chart data available for this range.</p>
                            <p className="text-xs text-gray-400 mt-1">Try a different time range.</p>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Volume Chart */}
                    {chartData.volumeData.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4 h-32 mt-4 border border-gray-100">
                        <ResponsiveContainer width="100%" height={80}>
                          <BarChart data={chartData.volumeData}>
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip />
                            <Bar dataKey="volume" fill="#a5b4fc" />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="text-xs text-gray-500 text-center">Volume</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Trading Plan Tab */}
{activeTab === "trading plan" && (
  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
    <h3 className="text-lg font-semibold mb-4 flex items-center">
      <Target className="h-5 w-5 mr-2 text-indigo-600" />
      AI-Generated Trading Plan
    </h3>
    <div className="text-gray-700 leading-relaxed text-sm whitespace-pre-line">
      Trading plan feature is currently unavailable.
    </div>
  </div>
)}

                {/* Risk Analysis Tab */}
{activeTab === "risk analysis" && (
  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
    <h3 className="text-lg font-semibold mb-4 flex items-center">
      <Shield className="h-5 w-5 mr-2 text-indigo-600" />
      Risk Analysis
    </h3>
    <div className="text-gray-700 leading-relaxed text-sm whitespace-pre-line">
      Risk analysis feature is currently unavailable.
    </div>
  </div>
)}

                {/* Debug Tab */}
{activeTab === "debug" && showDebug && (
  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
    <h3 className="text-lg font-semibold mb-4 flex items-center">
      <Info className="h-5 w-5 mr-2 text-indigo-600" />
      Debug: Derived Facts JSON
    </h3>
    <button
      className="mb-3 px-3 py-1 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-mono text-xs"
      onClick={fetchDebugJson}
      disabled={debugLoading}
    >
      {debugLoading ? "Loading..." : "Reload"}
    </button>
    {debugError && (
      <div className="text-red-600 text-xs mb-2">{debugError}</div>
    )}
    {debugJson && (
      <details open className="bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-96 overflow-auto">
        <summary className="cursor-pointer font-semibold text-indigo-700 mb-2">Show/Hide JSON</summary>
        <pre className="overflow-x-auto">{JSON.stringify(debugJson, null, 2)}</pre>
      </details>
    )}
    {!debugJson && !debugLoading && !debugError && (
      <div className="text-gray-500 text-xs">No debug data loaded yet.</div>
    )}
  </div>
)}
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* AI Recommendation */}
                <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                  <h3 className="text-lg font-semibold mb-3">AI Recommendation</h3>
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
                    {keyMetrics.slice(0, 5).map((metric, index) => (
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
                    <a href="#" className="text-indigo-600 hover:text-indigo-700 text-xs">View All</a>
                  </div>
                  <div className="space-y-3">
                    {recentNews.slice(0, 4).map((news, index) => (
                      <div key={index} className="border-b border-gray-100 last:border-0 pb-2.5 last:pb-0">
                        <h4 className={`font-medium text-sm ${getSentimentColor(news.sentiment)}`}>
                          {news.title}
                        </h4>
                        <div className="flex justify-between mt-1">
                          <span className="text-gray-500 text-xs">{news.date}</span>
                          <span className="text-gray-500 text-xs">{news.source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Insights */}
<div className="bg-indigo-50 rounded-xl shadow-sm p-5 border border-indigo-100">
  <div className="flex items-center mb-3">
    <Zap className="h-5 w-5 text-indigo-600 mr-2" />
    <h3 className="text-base font-semibold text-indigo-800">AI Insights</h3>
  </div>
  <div className="text-indigo-700 text-sm">
    {aiAnalysisLoading
      ? "Loading AI insights..."
      : aiAnalysis && aiAnalysis.legacy && aiAnalysis.legacy.newsSummaryText
      ? aiAnalysis.legacy.newsSummaryText
      : "AI insights feature is currently unavailable."}
  </div>
</div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}