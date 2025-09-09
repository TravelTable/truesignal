import { useState } from "react";
import {
  Zap,
  Search,
  BarChart2,
  Target,
  Shield,
  TrendingUp,
  ChevronRight,
  CheckCircle,
  ArrowRight,
  Menu,
  X,
  ChevronDown,
  DollarSign,
  Brain,
  LineChart,
  Clock,
  Users,
  Star,
  Signal,
} from "lucide-react";

// Utility: Generate or get a persistent userId (for demo, localStorage)
function getUserId() {
  let userId = localStorage.getItem("tsai_userId");
  if (!userId) {
    userId = "user-" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("tsai_userId", userId);
  }
  return userId;
}

// Container Component
export default function TrueSignalAIHomepageContainer({
  navigate,
  handleNavClick,
  currentPage,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <TrueSignalAIHomepage
      mobileMenuOpen={mobileMenuOpen}
      setMobileMenuOpen={setMobileMenuOpen}
      activeFaq={activeFaq}
      toggleFaq={toggleFaq}
      navigate={navigate}
      handleNavClick={handleNavClick}
      currentPage={currentPage}
    />
  );
}

// UI Component
function TrueSignalAIHomepage({
  mobileMenuOpen,
  setMobileMenuOpen,
  activeFaq,
  toggleFaq,
  navigate,
  handleNavClick,
  currentPage,
}) {
  // Navigation links
  const navLinks = [
    { name: "Features", href: "#features" },
    { name: "How It Works", href: "#how-it-works" },
    { name: "Pricing", href: "#pricing" },
    { name: "Testimonials", href: "#testimonials" },
    { name: "FAQ", href: "#faq" },
  ];

  // Features data
  const features = [
    {
      icon: Search,
      title: "Deep Company Analysis",
      description:
        "Our AI scans millions of data points across financial statements, news, social sentiment, and market trends to provide comprehensive company insights.",
    },
    {
      icon: BarChart2,
      title: "Advanced Technical Analysis",
      description:
        "Leverage sophisticated chart patterns, indicators, and price action analysis to identify optimal entry and exit points.",
    },
    {
      icon: Target,
      title: "AI-Generated Trading Plans",
      description:
        "Receive personalized trading strategies with precise entry points, stop losses, and take profit levels tailored to your risk tolerance.",
    },
    {
      icon: Shield,
      title: "Risk Assessment",
      description:
        "Understand potential downside with multi-dimensional risk analysis covering market, sector, company-specific, and volatility factors.",
    },
    {
      icon: Brain,
      title: "Sentiment Analysis",
      description:
        "Track institutional investor behavior, social media sentiment, and news impact to gauge market perception beyond the numbers.",
    },
    {
      icon: LineChart,
      title: "Portfolio Optimization",
      description:
        "Optimize your investment portfolio with AI-driven asset allocation recommendations based on your financial goals.",
    },
  ];

  // How it works steps
  const steps = [
    {
      number: "01",
      title: "Search for a Company",
      description:
        "Enter a company name, ticker symbol, or industry to begin your analysis journey.",
    },
    {
      number: "02",
      title: "Review AI-Generated Insights",
      description:
        "Our AI instantly analyzes financial data, market trends, and news to provide comprehensive insights.",
    },
    {
      number: "03",
      title: "Explore Trading Opportunities",
      description:
        "Examine potential entry points, risk levels, and profit targets tailored to your investment style.",
    },
    {
      number: "04",
      title: "Execute with Confidence",
      description:
        "Make informed decisions backed by data-driven analysis and AI-powered recommendations.",
    },
  ];

  // Pricing plans
  const pricingPlans = [
    {
      name: "Basic",
      price: "$29",
      period: "per month",
      description: "Essential tools for individual investors",
      features: [
        "10 deep company analyses per month",
        "Basic technical indicators",
        "Standard trading plans",
        "Email support",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
    {
      name: "Pro",
      price: "$79",
      period: "per month",
      description: "Advanced features for active traders",
      features: [
        "Unlimited company analyses",
        "Advanced technical analysis",
        "Custom trading strategies",
        "Risk assessment tools",
        "Portfolio optimization",
        "Priority support",
      ],
      cta: "Start Free Trial",
      popular: true,
    },
    {
      name: "Enterprise",
      price: "$199",
      period: "per month",
      description: "Comprehensive solution for professional traders",
      features: [
        "All Pro features",
        "API access",
        "Custom integrations",
        "Team collaboration tools",
        "Dedicated account manager",
        "24/7 premium support",
      ],
      cta: "Contact Sales",
      popular: false,
    },
  ];

  // Testimonials
  const testimonials = [
    {
      quote:
        "The AI-generated trading plans have completely transformed my investment approach. I've seen a 32% increase in my portfolio's performance since I started using TrueSignalAI.",
      author: "Sarah Johnson",
      title: "Day Trader",
      avatar: "https://picsum.photos/64/64?random=1",
    },
    {
      quote:
        "As a financial advisor, I rely on comprehensive data analysis. TrueSignalAI delivers insights in minutes that would take my team days to compile. It's become an essential part of our workflow.",
      author: "Michael Chen",
      title: "Financial Advisor",
      avatar: "https://picsum.photos/64/64?random=2",
    },
    {
      quote:
        "The risk assessment tools are incredibly detailed. They've helped me avoid several potentially costly investments by highlighting risks I hadn't considered.",
      author: "Emma Rodriguez",
      title: "Portfolio Manager",
      avatar: "https://picsum.photos/64/64?random=3",
    },
  ];

  // FAQ items
  const faqItems = [
    {
      question: "How accurate are the AI-generated trading recommendations?",
      answer:
        "Our AI trading recommendations are based on comprehensive analysis of historical data, market trends, technical indicators, and fundamental factors. While no prediction system is 100% accurate, our models are continuously trained and refined to provide high-quality insights. We recommend using our AI recommendations as part of a broader investment strategy rather than as standalone advice.",
    },
    {
      question: "Can I connect my brokerage account to execute trades?",
      answer:
        "Currently, we don't offer direct brokerage integrations for trade execution. Our platform is designed to provide analysis and recommendations that you can implement through your existing brokerage platform. However, API integrations with major brokerages are on our roadmap for future development.",
    },
    {
      question: "How is my data protected on the platform?",
      answer:
        "We take data security extremely seriously. All user data is encrypted both in transit and at rest using industry-standard encryption protocols. We implement strict access controls, regular security audits, and comply with relevant data protection regulations. We never sell your personal data to third parties.",
    },
    {
      question: "Can I customize the risk parameters for trading recommendations?",
      answer:
        "Yes, our platform allows you to set custom risk parameters including maximum drawdown tolerance, position sizing preferences, and risk-reward thresholds. These settings are used by our AI to tailor recommendations to your specific risk profile and investment goals.",
    },
    {
      question: "How often is the financial data updated?",
      answer:
        "Market data, price information, and technical indicators are updated in real-time during market hours. Fundamental company data is updated quarterly or as new information becomes available through earnings reports and financial filings. News sentiment and social media analysis are continuously updated throughout the day.",
    },
  ];

  // --- DEMO: AI Company Analysis Form (matches backend) ---
  const [aiTicker, setAiTicker] = useState("");
  const [aiUserQuery, setAiUserQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);

  // For Next Actions checklist (per userId+ticker)
  const [nextActions, setNextActions] = useState([]);
  const [nextActionsLoading, setNextActionsLoading] = useState(false);

  // Fetch AI analysis from backend
  async function fetchAIAnalysis(e) {
    e.preventDefault();
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setNextActions([]);
    try {
      const userId = getUserId();
      const res = await fetch("/api/ai-analysis/" + encodeURIComponent(aiTicker), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userQuery: aiUserQuery,
          userId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch AI analysis");
      }
      const data = await res.json();
      setAiResult(data.aiAnalysis);
      setNextActions(data.aiAnalysis?.nextActions || []);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  // Update Next Actions checklist (PUT)
  async function updateNextActions(actions) {
    setNextActionsLoading(true);
    try {
      const userId = getUserId();
      const res = await fetch(
        `/api/next-actions/${encodeURIComponent(userId)}/${encodeURIComponent(
          aiTicker
        )}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions }),
        }
      );
      if (!res.ok) throw new Error("Failed to update actions");
      const data = await res.json();
      setNextActions(data.actions);
    } catch (err) {
      // ignore for now
    } finally {
      setNextActionsLoading(false);
    }
  }

  // Toggle checklist item
  function handleToggleAction(idx) {
    const updated = nextActions.map((a, i) =>
      i === idx ? { ...a, checked: !a.checked } : a
    );
    setNextActions(updated);
    updateNextActions(updated);
  }

  // Add new action
  async function handleAddAction(label) {
    if (!label.trim()) return;
    setNextActionsLoading(true);
    try {
      const userId = getUserId();
      const res = await fetch(
        `/api/next-actions/${encodeURIComponent(userId)}/${encodeURIComponent(
          aiTicker
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }
      );
      if (!res.ok) throw new Error("Failed to add action");
      const data = await res.json();
      setNextActions(data.actions);
    } catch (err) {
      // ignore
    } finally {
      setNextActionsLoading(false);
    }
  }

  // Remove action
  async function handleRemoveAction(actionId) {
    setNextActionsLoading(true);
    try {
      const userId = getUserId();
      const res = await fetch(
        `/api/next-actions/${encodeURIComponent(userId)}/${encodeURIComponent(
          aiTicker
        )}/${encodeURIComponent(actionId)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) throw new Error("Failed to remove action");
      const data = await res.json();
      setNextActions(data.actions);
    } catch (err) {
      // ignore
    } finally {
      setNextActionsLoading(false);
    }
  }

  // Navigation helpers for SPA
  const handleNav = (e, page) => {
    if (handleNavClick) {
      e.preventDefault();
      handleNavClick(e, page);
      setMobileMenuOpen(false);
    }
  };

  // --- END DEMO AI FORM LOGIC ---

  return (
    <div className="bg-white">
      {/* Navigation */}
      <header className="fixed w-full bg-white shadow-sm z-50">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Logo */}
            <div
              className="flex items-center cursor-pointer"
              onClick={(e) => handleNav(e, "home")}
            >
              <Signal className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">
                TrueSignalAI
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <div className="flex space-x-6">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-gray-600 hover:text-blue-600 font-medium transition-colors"
                  >
                    {link.name}
                  </a>
                ))}
                <a
                  href="/ai"
                  onClick={(e) => handleNav(e, "ai")}
                  className={`font-medium transition-colors ${
                    currentPage === "ai"
                      ? "text-blue-700"
                      : "text-blue-600 hover:text-blue-700"
                  }`}
                >
                  AI Advisor
                </a>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href="/login"
                  onClick={(e) => handleNav(e, "signin")}
                  className="text-blue-600 font-medium hover:text-blue-700"
                >
                  Log in
                </a>
                <a
                  href="/signup"
                  onClick={(e) => handleNav(e, "signup")}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Sign up free
                </a>
              </div>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                type="button"
                className="text-gray-600 hover:text-gray-900"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-100">
              <div className="flex flex-col space-y-4">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-gray-600 hover:text-blue-600 font-medium transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.name}
                  </a>
                ))}
                <div className="pt-2 border-t border-gray-100 flex flex-col space-y-3">
                  <a
                    href="/login"
                    onClick={(e) => handleNav(e, "signin")}
                    className="text-blue-600 font-medium hover:text-blue-700"
                  >
                    Log in
                  </a>
                  <a
                    href="/signup"
                    onClick={(e) => handleNav(e, "signup")}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
                  >
                    Sign up free
                  </a>
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="pt-24 pb-16 sm:pt-32 sm:pb-20 bg-gradient-to-b from-blue-50 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
              AI-Powered Financial Analysis for Smarter Trading Decisions
            </h1>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
              TrueSignalAI harnesses the power of artificial intelligence to analyze stocks, generate trading plans, and optimize your investment strategy with precision.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="/signup"
                onClick={(e) => handleNav(e, "signup")}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center flex items-center justify-center"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <a
                href="#how-it-works"
                className="bg-white text-blue-600 border border-blue-200 px-8 py-3 rounded-lg font-medium hover:bg-blue-50 transition-colors text-center"
              >
                See How It Works
              </a>
            </div>
          </div>

          {/* Hero Image */}
          <div className="mt-16 max-w-5xl mx-auto rounded-xl shadow-2xl overflow-hidden">
            <img
              src="https://picsum.photos/1200/600?random=10"
              alt="TrueSignalAI dashboard showing stock analysis, charts, and trading recommendations"
              className="w-full h-auto"
            />
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">2.5M+</div>
              <div className="mt-1 text-gray-600">Data Points Analyzed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">98%</div>
              <div className="mt-1 text-gray-600">Accuracy Rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">10,000+</div>
              <div className="mt-1 text-gray-600">Active Users</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">24/7</div>
              <div className="mt-1 text-gray-600">Market Monitoring</div>
            </div>
          </div>
        </div>
      </section>

      {/* --- DEMO: AI Company Analysis Form (matches backend) --- */}
      <section id="ai-demo" className="py-16 sm:py-24 bg-blue-50 border-t border-blue-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Try AI Company Analysis
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Enter a stock ticker and (optionally) your question. Our AI will analyze the company and generate a trading plan, risk assessment, and next actions checklist.
            </p>
          </div>
          <form
            className="max-w-xl mx-auto bg-white rounded-xl shadow-md p-6 flex flex-col gap-4"
            onSubmit={fetchAIAnalysis}
          >
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                required
                placeholder="Ticker (e.g. AAPL)"
                value={aiTicker}
                onChange={(e) => setAiTicker(e.target.value.toUpperCase())}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                maxLength={8}
                autoFocus
              />
              <input
                type="text"
                placeholder="Your question (optional)"
                value={aiUserQuery}
                onChange={(e) => setAiUserQuery(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                maxLength={120}
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center"
                disabled={aiLoading || !aiTicker}
              >
                {aiLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                    Analyzing...
                  </span>
                ) : (
                  <>
                    Analyze <Zap className="ml-2 h-5 w-5" />
                  </>
                )}
              </button>
            </div>
            {aiError && (
              <div className="text-red-600 text-sm mt-2">{aiError}</div>
            )}
          </form>
          {/* AI Result */}
          {aiResult && (
            <div className="max-w-4xl mx-auto mt-10 bg-white rounded-xl shadow-lg p-8">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-blue-700 mb-2">
                    {aiResult.ticker} Trading Plan
                  </h3>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Rating:</span>{" "}
                    {aiResult.decision.ratingLabel} ({aiResult.decision.ratingScore}/10)
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Time Horizon:</span>{" "}
                    {aiResult.decision.timeHorizon}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Risk/Reward:</span>{" "}
                    {aiResult.decision.riskReward}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Entry:</span>{" "}
                    ${aiResult.entryExit.entry} | <span className="font-semibold">Stop:</span> ${aiResult.entryExit.stop} | <span className="font-semibold">TP1:</span> ${aiResult.entryExit.takeProfits[0]} | <span className="font-semibold">TP2:</span> ${aiResult.entryExit.takeProfits[1]}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Position Size:</span>{" "}
                    {aiResult.entryExit.positionSizePct}%
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Risk Score:</span>{" "}
                    {aiResult.risk.riskScore}/10
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Invalidation:</span>{" "}
                    {aiResult.risk.invalidation.join(", ")}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Volatility:</span>{" "}
                    {aiResult.risk.volatilityNote}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Catalysts:</span>{" "}
                    {aiResult.catalysts.map((c, i) => (
                      <span key={i} className="inline-block mr-2">
                        {c.type} ({c.date}): {c.note}
                      </span>
                    ))}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Scenarios:</span>{" "}
                    {aiResult.scenarios.map((s, i) => (
                      <span key={i} className="inline-block mr-2">
                        {s.name} ({s.prob * 100}%): Target ${s.target}
                      </span>
                    ))}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Rationale:</span>
                    <ul className="list-disc ml-6">
                      {aiResult.rationale.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Data Freshness:</span>{" "}
                    Price as of {aiResult.dataFreshness.priceAt}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">Legacy Summary:</span>{" "}
                    {aiResult.legacy?.summaryText}
                  </div>
                  <div className="mb-2 text-gray-700">
                    <span className="font-semibold">News Summary:</span>{" "}
                    {aiResult.legacy?.newsSummaryText}
                  </div>
                </div>
                {/* Next Actions Checklist */}
                <div className="flex-1">
                  <h4 className="text-xl font-bold text-blue-700 mb-2">
                    Next Actions Checklist
                  </h4>
                  <ul className="space-y-2">
                    {nextActions.map((action, idx) => (
                      <li
                        key={action.id}
                        className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2"
                      >
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!action.checked}
                            onChange={() => handleToggleAction(idx)}
                            className="form-checkbox h-5 w-5 text-blue-600"
                            disabled={nextActionsLoading}
                          />
                          <span
                            className={`ml-3 ${
                              action.checked
                                ? "line-through text-gray-400"
                                : "text-gray-800"
                            }`}
                          >
                            {action.label}
                          </span>
                        </label>
                        <button
                          className="ml-2 text-gray-400 hover:text-red-500"
                          onClick={() => handleRemoveAction(action.id)}
                          title="Remove"
                          disabled={nextActionsLoading}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <AddActionInput
                    onAdd={handleAddAction}
                    loading={nextActionsLoading}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      {/* --- END DEMO AI FORM --- */}

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Powerful Features for Informed Trading
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Our AI-powered platform provides comprehensive tools to analyze, plan, and execute your trading strategy with confidence.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-5">
                  <feature.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              How TrueSignalAI Works
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Our platform simplifies the complex process of financial analysis and trading strategy development.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-12">
                {steps.map((step, index) => (
                  <div key={index} className="flex">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-12 h-12 rounded-md bg-blue-600 text-white font-bold">
                        {step.number}
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-gray-600">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <a
                  href="/signup"
                  onClick={(e) => handleNav(e, "signup")}
                  className="inline-flex items-center text-blue-600 font-medium hover:text-blue-700"
                >
                  Get started today
                  <ChevronRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-w-4 aspect-h-3 rounded-xl overflow-hidden shadow-lg">
                <img
                  src="https://picsum.photos/800/600?random=20"
                  alt="TrueSignalAI platform interface showing analysis process"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-white rounded-lg shadow-lg p-4 max-w-xs">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">
                      AI-detected trading opportunity
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      AAPL showing bullish divergence with 78% confidence
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Choose the plan that fits your trading needs and investment goals.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`rounded-xl shadow-sm border ${
                  plan.popular
                    ? "border-blue-200 ring-2 ring-blue-600"
                    : "border-gray-200"
                } bg-white overflow-hidden`}
              >
                {plan.popular && (
                  <div className="bg-blue-600 text-white text-center py-1.5 text-sm font-medium">
                    Most Popular
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900">
                    {plan.name}
                  </h3>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-extrabold text-gray-900">
                      {plan.price}
                    </span>
                    <span className="ml-1 text-xl font-medium text-gray-500">
                      {plan.period}
                    </span>
                  </div>
                  <p className="mt-2 text-gray-600">{plan.description}</p>

                  <ul className="mt-6 space-y-4">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="ml-3 text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <a
                      href={
                        plan.name === "Enterprise" ? "/contact" : "/signup"
                      }
                      onClick={
                        plan.name === "Enterprise"
                          ? undefined
                          : (e) => handleNav(e, "signup")
                      }
                      className={`block w-full text-center px-6 py-3 rounded-lg font-medium ${
                        plan.popular
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
                      } transition-colors`}
                    >
                      {plan.cta}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <p className="text-gray-600">
              All plans include a 14-day free trial. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-16 sm:py-24 bg-blue-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Trusted by Traders Worldwide
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              See what our users have to say about their experience with
              TrueSignalAI.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
              >
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.author}
                      className="h-12 w-12 rounded-full"
                    />
                  </div>
                  <div className="ml-3">
                    <h4 className="text-lg font-semibold text-gray-900">
                      {testimonial.author}
                    </h4>
                    <p className="text-gray-600">{testimonial.title}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="text-gray-700 italic">
                  "{testimonial.quote}"
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row items-center">
              <div className="md:w-2/3 mb-6 md:mb-0 md:pr-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Ready to transform your trading strategy?
                </h3>
                <p className="text-gray-600">
                  Join thousands of traders who are leveraging TrueSignalAI to
                  make smarter investment decisions.
                </p>
              </div>
              <div className="md:w-1/3 flex justify-center md:justify-end">
                <a
                  href="/signup"
                  onClick={(e) => handleNav(e, "signup")}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-flex items-center"
                >
                  Start Your Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Find answers to common questions about TrueSignalAI.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <button
                    className="w-full flex justify-between items-center p-4 text-left focus:outline-none"
                    onClick={() => toggleFaq(index)}
                  >
                    <span className="font-medium text-gray-900">
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-gray-500 transition-transform ${
                        activeFaq === index ? "transform rotate-180" : ""
                      }`}
                    />
                  </button>
                  {activeFaq === index && (
                    <div className="p-4 pt-0 border-t border-gray-100">
                      <p className="text-gray-600">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-600">
              Still have questions?{" "}
              <a
                href="/contact"
                className="text-blue-600 font-medium hover:text-blue-700"
              >
                Contact our support team
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Features Highlight */}
      <section className="py-16 sm:py-24 bg-gray-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Why Choose TrueSignalAI
            </h2>
            <p className="mt-4 text-xl text-gray-300">
              Cutting-edge technology designed to give you the trading edge.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-5">
                <Brain className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Advanced AI Models
              </h3>
              <p className="text-gray-300">
                Our proprietary machine learning algorithms analyze patterns
                across multiple timeframes and data sources for superior
                predictions.
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-5">
                <Clock className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Real-Time Analysis
              </h3>
              <p className="text-gray-300">
                Get instant insights as market conditions change, with alerts
                for emerging opportunities and risks.
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mb-5">
                <Users className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Personalized Experience
              </h3>
              <p className="text-gray-300">
                Our AI adapts to your trading style, risk tolerance, and goals
                to provide increasingly relevant recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 bg-blue-600 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Start Making Smarter Trading Decisions Today
            </h2>
            <p className="mt-4 text-xl text-blue-100">
              Join thousands of traders who are leveraging TrueSignalAI to gain
              a competitive edge in the market.
            </p>
            <div className="mt-10">
              <a
                href="/signup"
                onClick={(e) => handleNav(e, "signup")}
                className="bg-white text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors inline-flex items-center"
              >
                Start Your Free 14-Day Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <p className="mt-4 text-blue-200">
                No credit card required. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="#features"
                    className="hover:text-white transition-colors"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="hover:text-white transition-colors"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="/integrations"
                    className="hover:text-white transition-colors"
                  >
                    Integrations
                  </a>
                </li>
                <li>
                  <a
                    href="/roadmap"
                    className="hover:text-white transition-colors"
                  >
                    Roadmap
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="/blog"
                    className="hover:text-white transition-colors"
                  >
                    Blog
                  </a>
                </li>
                <li>
                  <a
                    href="/guides"
                    className="hover:text-white transition-colors"
                  >
                    Trading Guides
                  </a>
                </li>
                <li>
                  <a
                    href="/webinars"
                    className="hover:text-white transition-colors"
                  >
                    Webinars
                  </a>
                </li>
                <li>
                  <a
                    href="/api"
                    className="hover:text-white transition-colors"
                  >
                    API Documentation
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="/about"
                    className="hover:text-white transition-colors"
                  >
                    About Us
                  </a>
                </li>
                <li>
                  <a
                    href="/careers"
                    className="hover:text-white transition-colors"
                  >
                    Careers
                  </a>
                </li>
                <li>
                  <a
                    href="/contact"
                    className="hover:text-white transition-colors"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <a
                    href="/press"
                    className="hover:text-white transition-colors"
                  >
                    Press
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="/terms"
                    className="hover:text-white transition-colors"
                  >
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a
                    href="/privacy"
                    className="hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/security"
                    className="hover:text-white transition-colors"
                  >
                    Security
                  </a>
                </li>
                <li>
                  <a
                    href="/disclaimer"
                    className="hover:text-white transition-colors"
                  >
                    Disclaimer
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <Signal className="h-6 w-6 text-blue-500" />
              <span className="ml-2 text-white font-bold">TrueSignalAI</span>
            </div>
            <div className="text-sm">
              &copy; {new Date().getFullYear()} TrueSignalAI. All rights
              reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// AddActionInput: input for adding checklist items
function AddActionInput({ onAdd, loading }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onAdd(value.trim());
          setValue("");
        }
      }}
    >
      <input
        type="text"
        placeholder="Add next action..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 border border-gray-300 rounded-l-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        disabled={loading}
        maxLength={60}
      />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded-r-lg font-medium hover:bg-blue-700 transition-colors"
        disabled={loading || !value.trim()}
      >
        Add
      </button>
    </form>
  );
}