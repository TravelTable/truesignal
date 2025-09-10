import time
import random
import re
from urllib.parse import quote

import requests
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from bs4 import BeautifulSoup
from typing import Optional, List, Dict, Any

app = FastAPI(title="Yahoo Finance Scraper API", version="1.2")

class YahooFinanceScraper:
    BASE_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
    BASE_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
    BASE_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart"
    BASE_QUOTE_SUMMARY_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary"
    BASE_NEWS_URL = "https://finance.yahoo.com/quote"
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )

    def __init__(self, rate_limit=1.0):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self.USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        })
        self.crumb = None
        self.cookies = None
        self.rate_limit = rate_limit  # seconds between requests
        self.last_request_time = 0
        self._init_session()

    def _init_session(self):
        resp = self.session.get("https://finance.yahoo.com/quote/AAPL")
        if self._is_consent_page(resp.text):
            self._accept_consent()
            resp = self.session.get("https://finance.yahoo.com/quote/AAPL")
        self.cookies = resp.cookies.get_dict()
        self.crumb = self._get_crumb_from_html(resp.text)
        if not self.crumb:
            raise Exception("Failed to obtain Yahoo Finance crumb token.")

    def _is_consent_page(self, html):
        return (
            "guce.yahoo.com" in html or
            "consent.yahoo.com" in html or
            "manage settings" in html.lower() or
            ("consent" in html.lower() and "privacy" in html.lower())
        )

    def _accept_consent(self):
        consent_url = "https://guce.yahoo.com/consent"
        params = {
            "brandType": "nonEu",
            "gcrumb": "",
            "done": "https://finance.yahoo.com"
        }
        resp = self.session.get(consent_url, params=params)
        soup = BeautifulSoup(resp.text, "lxml")
        form = soup.find("form")
        if not form:
            return
        action = form.get("action")
        inputs = form.find_all("input")
        data = {}
        for inp in inputs:
            name = inp.get("name")
            value = inp.get("value", "")
            if name:
                data[name] = value
        if action:
            if not action.startswith("http"):
                action = "https://guce.yahoo.com" + action
            self.session.post(action, data=data)

    def _get_crumb_from_html(self, html):
        m = re.search(r'"CrumbStore":\{"crumb":"(.*?)"\}', html)
        if m:
            crumb = m.group(1)
            crumb = crumb.encode('ascii').decode('unicode_escape')
            return crumb
        m2 = re.search(r'"crumb"\s*:\s*"([^"]+)"', html)
        if m2:
            crumb = m2.group(1)
            crumb = crumb.encode('ascii').decode('unicode_escape')
            return crumb
        return None

    def _throttle(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.rate_limit:
            time.sleep(self.rate_limit - elapsed + random.uniform(0, 0.3))
        self.last_request_time = time.time()

    def _request(self, url, params=None, require_crumb=False, allow_retry=True):
        self._throttle()
        cookies = self.cookies
        if require_crumb:
            if not self.crumb:
                self._init_session()
            if params is None:
                params = {}
            params['crumb'] = self.crumb
        try:
            resp = self.session.get(url, params=params, cookies=cookies, timeout=10)
            if resp.status_code == 401 and allow_retry:
                self._init_session()
                return self._request(url, params, require_crumb, allow_retry=False)
            resp.raise_for_status()
            return resp
        except Exception as e:
            raise Exception(f"Request failed: {url} ({e})")

    def get_realtime_quotes(self, tickers):
        url = self.BASE_QUOTE_URL
        params = {
            "symbols": ",".join(tickers),
            "lang": "en-US",
            "region": "US"
        }
        resp = self._request(url, params=params, require_crumb=True)
        data = resp.json()
        if "quoteResponse" in data and "result" in data["quoteResponse"]:
            return {item['symbol']: item for item in data["quoteResponse"]["result"]}
        else:
            return {}

    def search_ticker(self, query):
        url = self.BASE_SEARCH_URL
        params = {"q": query, "lang": "en-US", "region": "US"}
        resp = self._request(url, params=params)
        data = resp.json()
        return data.get("quotes", [])

    def get_historical_prices(self, ticker, interval="1d", range_="1y", events=None, period1=None, period2=None):
        url = f"{self.BASE_CHART_URL}/{quote(ticker)}"
        params = {
            "interval": interval,
        }
        if period1 and period2:
            params["period1"] = str(period1)
            params["period2"] = str(period2)
        else:
            params["range"] = range_
        if events:
            params["events"] = events
        resp = self._request(url, params=params, require_crumb=True)
        data = resp.json()
        if "chart" in data and "result" in data["chart"] and data["chart"]["result"]:
            return data["chart"]["result"][0]
        else:
            return {}

    def get_fundamentals(self, ticker, modules):
        url = f"{self.BASE_QUOTE_SUMMARY_URL}/{quote(ticker)}"
        params = {
            "modules": ",".join(modules),
            "formatted": "true"
        }
        resp = self._request(url, params=params, require_crumb=True)
        data = resp.json()
        if "quoteSummary" in data and "result" in data["quoteSummary"] and data["quoteSummary"]["result"]:
            return data["quoteSummary"]["result"][0]
        else:
            return {}

    def get_financial_statements(self, ticker, statement_type="incomeStatementHistory", quarterly=False):
        if quarterly:
            statement_type += "Quarterly"
        modules = [statement_type]
        data = self.get_fundamentals(ticker, modules)
        return data.get(statement_type, {}).get(statement_type.replace("History", "Statements"), [])

    def get_company_profile(self, ticker):
        modules = ["assetProfile", "summaryProfile"]
        return self.get_fundamentals(ticker, modules)

    def get_holders(self, ticker):
        modules = ["majorHoldersBreakdown", "insiderHolders", "institutionOwnership", "fundOwnership"]
        return self.get_fundamentals(ticker, modules)

    def get_calendar_events(self, ticker):
        modules = ["calendarEvents"]
        return self.get_fundamentals(ticker, modules)

    def get_analyst_estimates(self, ticker):
        modules = [
            "earningsTrend", "earningsHistory", "earnings",
            "recommendationTrend", "upgradeDowngradeHistory"
        ]
        return self.get_fundamentals(ticker, modules)

    def get_news(self, ticker, max_articles=10):
        url = f"{self.BASE_NEWS_URL}/{quote(ticker)}/news"
        self._throttle()
        try:
            resp = self.session.get(url, headers=self.session.headers, cookies=self.cookies, timeout=10)
            soup = BeautifulSoup(resp.text, "lxml")
            articles = []
            for li in soup.select("li.js-stream-content, li.stream-item"):
                a = li.find("a", href=True)
                h3 = li.find("h3")
                p = li.find("p")
                if a and h3:
                    articles.append({
                        "title": h3.get_text(strip=True),
                        "url": "https://finance.yahoo.com" + a['href'] if a['href'].startswith('/') else a['href'],
                        "summary": p.get_text(strip=True) if p else ""
                    })
                if len(articles) >= max_articles:
                    break
            return articles
        except Exception as e:
            # Defensive: always return a list
            return []

    def get_etf_fund_data(self, ticker):
        modules = ["fundProfile", "fundPerformance", "topHoldings", "defaultKeyStatistics"]
        return self.get_fundamentals(ticker, modules)

    def get_crypto_data(self, ticker):
        quote = self.get_realtime_quotes([ticker])
        chart = self.get_historical_prices(ticker)
        summary = self.get_fundamentals(ticker, ["summaryDetail"])
        return {"quote": quote, "chart": chart, "summaryDetail": summary}

scraper = YahooFinanceScraper(rate_limit=1.2)

@app.get("/search")
def search_company(query: str = Query(..., description="Company name or ticker")):
    try:
        results = scraper.search_ticker(query)
        if not isinstance(results, list):
            results = []
        return {"results": results}
    except Exception as e:
        return {"results": []}

@app.get("/quote")
def get_quote(symbols: str = Query(..., description="Comma-separated tickers (e.g. AAPL,MSFT)")):
    try:
        tickers = [s.strip() for s in symbols.split(",")]
        data = scraper.get_realtime_quotes(tickers)
        return data
    except Exception as e:
        return {}

@app.get("/news")
def get_news(ticker: str, max_articles: int = 8):
    try:
        news = scraper.get_news(ticker, max_articles=20)  # Fetch more for dedupe
        if not isinstance(news, list):
            news = []
        # Deduplication logic
        def normalize_title(title):
            import string
            return ''.join(c for c in title.lower() if c not in string.punctuation).strip()
        seen = []
        deduped = []
        for item in news:
            norm = normalize_title(item.get("title", ""))
            # Levenshtein deduplication
            def levenshtein(a, b):
                if a == b:
                    return 0
                if len(a) < len(b):
                    return levenshtein(b, a)
                if len(b) == 0:
                    return len(a)
                previous_row = range(len(b) + 1)
                for i, c1 in enumerate(a):
                    current_row = [i + 1]
                    for j, c2 in enumerate(b):
                        insertions = previous_row[j + 1] + 1
                        deletions = current_row[j] + 1
                        substitutions = previous_row[j] + (c1 != c2)
                        current_row.append(min(insertions, deletions, substitutions))
                    previous_row = current_row
                return previous_row[-1]
            is_dup = False
            for s in seen:
                dist = levenshtein(norm, s) / max(1, max(len(norm), len(s)))
                if dist < 0.15:
                    is_dup = True
                    break
            if not norm or is_dup:
                continue
            seen.append(norm)
            # Number extraction
            numbers = {}
            t = item.get("title", "")
            # EPS %
            m = re.search(r"EPS\s*([+-]?\d+\.?\d*)%", t)
            if m:
                numbers["eps%"] = float(m.group(1))
            # Revenue %
            m = re.search(r"revenue\s*([+-]?\d+\.?\d*)%", t, re.I)
            if m:
                numbers["rev%"] = float(m.group(1))
            # Guidance %
            m = re.search(r"guidance\s*([+-]?\d+\.?\d*)%", t, re.I)
            if m:
                numbers["guide%"] = float(m.group(1))
            # Fine $
            m = re.search(r"\$([0-9,]+)", t)
            if m:
                numbers["fine$"] = float(m.group(1).replace(",", ""))
            # Layoffs
            m = re.search(r"layoff[s]?\s*(\d+)", t, re.I)
            if m:
                numbers["layoff"] = int(m.group(1))
            # Remove nulls
            numbers = {k: v for k, v in numbers.items() if v is not None}
            deduped.append({
                "t": item.get("title", "")[:90],
                "url": item.get("url", ""),
                "num": numbers,
            })
            if len(deduped) >= max_articles:
                break
        return {"news": deduped}
    except Exception as e:
        return {"news": []}

@app.get("/fundamentals")
def get_fundamentals(ticker: str, modules: str = Query("summaryDetail,defaultKeyStatistics,financialData", description="Comma-separated Yahoo modules")):
    try:
        module_list = [m.strip() for m in modules.split(",")]
        data = scraper.get_fundamentals(ticker, module_list)
        return data
    except Exception as e:
        return {}

@app.get("/analyst")
def get_analyst(ticker: str):
    try:
        data = scraper.get_analyst_estimates(ticker)
        return data
    except Exception as e:
        return {}

@app.get("/profile")
def get_profile(ticker: str):
    try:
        data = scraper.get_company_profile(ticker)
        return data
    except Exception as e:
        return {}

@app.get("/holders")
def get_holders(ticker: str):
    try:
        data = scraper.get_holders(ticker)
        return data
    except Exception as e:
        return {}

@app.get("/calendar")
def get_calendar(ticker: str):
    try:
        data = scraper.get_calendar_events(ticker)
        return data
    except Exception as e:
        return {}

@app.get("/financials")
def get_financials(ticker: str, statement_type: str = "incomeStatementHistory", quarterly: bool = False):
    try:
        data = scraper.get_financial_statements(ticker, statement_type, quarterly)
        return data
    except Exception as e:
        return []

@app.get("/history")
def get_history(ticker: str, interval: str = "1d", range_: str = "1y"):
    try:
        data = scraper.get_historical_prices(ticker, interval=interval, range_=range_)
        return data
    except Exception as e:
        return {}

@app.get("/etf")
def get_etf(ticker: str):
    try:
        data = scraper.get_etf_fund_data(ticker)
        return data
    except Exception as e:
        return {}

@app.get("/crypto")
def get_crypto(ticker: str):
    try:
        data = scraper.get_crypto_data(ticker)
        return data
    except Exception as e:
        return {}

@app.get(
    "/company",
    summary="Search for any company, ETF, or crypto by name or ticker and return customizable key data.",
    description="""
Search for any company, ETF, or crypto by name or ticker and return all key data.
You can customize the response by specifying which fields to include using the `fields` query parameter.

**Available fields:**
- `query`: The original search query.
- `matched_ticker`: The matched ticker symbol.
- `company_name`: The full company name.
- `title`: Alias for company_name.
- `quote_type`: The type of security (e.g., equity, etf, cryptocurrency).
- `quote`: Real-time quote data.
- `news`: Recent news articles.
- `profile`: Company profile (business summary, sector, industry, etc.).
- `fundamentals`: Key financial and statistical data.
- `analyst`: Analyst estimates and recommendations.
- `calendar`: Upcoming company events.
- `holders`: Major, insider, and institutional holders.
- `etf_data`: ETF or mutual fund data (if applicable).
- `crypto_data`: Crypto data (if applicable).
- `search_results`: All search results for the query.

Example: `/company?query=Apple&fields=profile,title`
"""
)
def get_company(
    query: str = Query(..., description="Company name or ticker (e.g. Tesla, Apple, NVDA, VOO, BTC-USD)"),
    fields: Optional[str] = Query(
        None,
        description="Comma-separated fields to include in the response. See docs for available fields."
    )
):
    try:
        search_results = scraper.search_ticker(query)
        if not isinstance(search_results, list) or not search_results:
            return {"data": {}}
        best = search_results[0]
        ticker = best.get("symbol")
        longname = best.get("longname") or best.get("shortname") or ticker
        quote_type = best.get("quoteType", "").lower()
        quote = scraper.get_realtime_quotes([ticker]).get(ticker, {})
        news = scraper.get_news(ticker, max_articles=10)
        # News: dedupe and numeric extraction, short titles, max 8
        def normalize_title(title):
            import string
            return ''.join(c for c in title.lower() if c not in string.punctuation).strip()
        seen = []
        deduped_news = []
        for item in news if isinstance(news, list) else []:
            norm = normalize_title(item.get("title", ""))
            def levenshtein(a, b):
                if a == b:
                    return 0
                if len(a) < len(b):
                    return levenshtein(b, a)
                if len(b) == 0:
                    return len(a)
                previous_row = range(len(b) + 1)
                for i, c1 in enumerate(a):
                    current_row = [i + 1]
                    for j, c2 in enumerate(b):
                        insertions = previous_row[j + 1] + 1
                        deletions = current_row[j] + 1
                        substitutions = previous_row[j] + (c1 != c2)
                        current_row.append(min(insertions, deletions, substitutions))
                    previous_row = current_row
                return previous_row[-1]
            is_dup = False
            for s in seen:
                dist = levenshtein(norm, s) / max(1, max(len(norm), len(s)))
                if dist < 0.15:
                    is_dup = True
                    break
            if not norm or is_dup:
                continue
            seen.append(norm)
            numbers = {}
            t = item.get("title", "")
            m = re.search(r"EPS\s*([+-]?\d+\.?\d*)%", t)
            if m:
                numbers["eps%"] = float(m.group(1))
            m = re.search(r"revenue\s*([+-]?\d+\.?\d*)%", t, re.I)
            if m:
                numbers["rev%"] = float(m.group(1))
            m = re.search(r"guidance\s*([+-]?\d+\.?\d*)%", t, re.I)
            if m:
                numbers["guide%"] = float(m.group(1))
            m = re.search(r"\$([0-9,]+)", t)
            if m:
                numbers["fine$"] = float(m.group(1).replace(",", ""))
            m = re.search(r"layoff[s]?\s*(\d+)", t, re.I)
            if m:
                numbers["layoff"] = int(m.group(1))
            numbers = {k: v for k, v in numbers.items() if v is not None}
            deduped_news.append({
                "t": item.get("title", "")[:90],
                "url": item.get("url", ""),
                "num": numbers,
            })
            if len(deduped_news) >= 8:
                break
        profile = scraper.get_company_profile(ticker)
        fundamentals = scraper.get_fundamentals(ticker, ["summaryDetail", "defaultKeyStatistics", "financialData"])
        analyst = scraper.get_analyst_estimates(ticker)
        calendar = scraper.get_calendar_events(ticker)
        holders = scraper.get_holders(ticker)
        etf_data = scraper.get_etf_fund_data(ticker) if quote_type in ("etf", "mutualfund") else None
        crypto_data = scraper.get_crypto_data(ticker) if quote_type == "cryptocurrency" else None

        full_response = {
            "query": query,
            "matched_ticker": ticker,
            "company_name": longname,
            "title": longname,
            "quote_type": quote_type,
            "quote": quote,
            "news": deduped_news,
            "profile": profile,
            "fundamentals": fundamentals,
            "analyst": analyst,
            "calendar": calendar,
            "holders": holders,
            "etf_data": etf_data,
            "crypto_data": crypto_data,
            "search_results": search_results
        }

        if fields:
            requested_fields = [f.strip().lower() for f in fields.split(",")]
            field_map = {
                "query": "query",
                "matched_ticker": "matched_ticker",
                "company_name": "company_name",
                "title": "title",
                "quote_type": "quote_type",
                "quote": "quote",
                "news": "news",
                "profile": "profile",
                "fundamentals": "fundamentals",
                "analyst": "analyst",
                "calendar": "calendar",
                "holders": "holders",
                "etf_data": "etf_data",
                "crypto_data": "crypto_data",
                "search_results": "search_results"
            }
            filtered_response = {}
            for field in requested_fields:
                key = field_map.get(field)
                if key and key in full_response:
                    filtered_response[key] = full_response[key]
            if not filtered_response:
                return {"data": {}}
            return {"data": filtered_response}
        else:
            return {"data": full_response}
    except Exception as e:
        return {"data": {}}