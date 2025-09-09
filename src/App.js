// src/App.js
import { useState, useCallback, useEffect } from "react";
import TrueSignalHomepage from "./pages/TrueSignalHomepage";
import TrueSignalAIPage from "./pages/TrueSignalAIPage";
import SignupPage from "./pages/SignupPage";
import SigninPage from "./pages/SigninPage";

// Utility to parse the current path and return the page key
function getPageFromPath(pathname) {
  if (pathname === "/" || pathname === "/home") return "home";
  if (pathname === "/ai" || pathname === "/truesignal-ai") return "ai";
  if (pathname === "/signup") return "signup";
  if (pathname === "/login" || pathname === "/signin") return "signin";
  return "home";
}

// Utility to get the path for a given page key
function getPathForPage(page) {
  if (page === "home") return "/";
  if (page === "ai") return "/ai";
  if (page === "signup") return "/signup";
  if (page === "signin") return "/login";
  return "/";
}

function App() {
  const [page, setPage] = useState(() => getPageFromPath(window.location.pathname));

  // Update the URL when the page changes
  const navigate = useCallback(
    (nextPage) => {
      const nextPath = getPathForPage(nextPage);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ page: nextPage }, "", nextPath);
      }
      setPage(nextPage);
    },
    []
  );

  // Listen for browser navigation (back/forward)
  useEffect(() => {
    const onPopState = (event) => {
      const nextPage = getPageFromPath(window.location.pathname);
      setPage(nextPage);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Handler for navigation links (prevents full page reload)
  const handleNavClick = (e, nextPage) => {
    e.preventDefault();
    navigate(nextPage);
  };

  // Provide navigation props to child pages for internal linking
  const pageProps = {
    navigate,
    handleNavClick,
    currentPage: page,
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <main>
        {page === "home" && <TrueSignalHomepage {...pageProps} />}
        {page === "ai" && <TrueSignalAIPage {...pageProps} />}
        {page === "signup" && <SignupPage {...pageProps} />}
        {page === "signin" && <SigninPage {...pageProps} />}
      </main>
    </div>
  );
}

export default App;