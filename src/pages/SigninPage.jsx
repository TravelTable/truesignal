import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Signal } from "lucide-react";

export default function SigninPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    remember: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Simple email regex for validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = () => {
    const newErrors = {};
    if (!form.email.trim()) newErrors.email = "Email is required.";
    else if (!emailRegex.test(form.email)) newErrors.email = "Invalid email address.";
    if (!form.password) newErrors.password = "Password is required.";
    return newErrors;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSubmitting(true);
    setErrors({});
    // Simulate API call
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      {/* Header */}
      <header className="w-full bg-white shadow-sm">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-4">
          <div className="flex items-center">
            <Signal className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">TrueSignalAI</span>
          </div>
          <div>
            <a
              href="/signup"
              className="text-blue-600 font-medium hover:text-blue-700 transition-colors"
            >
              Sign up
            </a>
          </div>
        </nav>
      </header>

      {/* Main Signin Form */}
      <main className="flex-grow flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">
            Sign in to your account
          </h1>
          <p className="text-gray-600 text-center mb-8">
            Welcome back! Please enter your credentials.
          </p>
          {success ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 rounded-full p-3">
                  <ArrowRight className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-green-700 mb-2">
                Sign in successful!
              </h2>
              <p className="text-gray-700 mb-4">
                Redirecting to your dashboard...
              </p>
              <a
                href="/dashboard"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-5">
                <label
                  htmlFor="email"
                  className="block text-gray-700 font-medium mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={`w-full px-4 py-3 rounded-lg border ${
                    errors.email ? "border-red-400" : "border-gray-200"
                  } focus:outline-none focus:ring-2 focus:ring-blue-200`}
                  placeholder="you@email.com"
                  value={form.email}
                  onChange={handleChange}
                  disabled={submitting}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>
              <div className="mb-5 relative">
                <label
                  htmlFor="password"
                  className="block text-gray-700 font-medium mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`w-full px-4 py-3 rounded-lg border ${
                    errors.password ? "border-red-400" : "border-gray-200"
                  } focus:outline-none focus:ring-2 focus:ring-blue-200`}
                  placeholder="Your password"
                  value={form.password}
                  onChange={handleChange}
                  disabled={submitting}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password}</p>
                )}
              </div>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember"
                    name="remember"
                    type="checkbox"
                    className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    checked={form.remember}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                  <label htmlFor="remember" className="ml-2 text-gray-700 text-sm">
                    Remember me
                  </label>
                </div>
                <div>
                  <a
                    href="/forgot-password"
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Forgot password?
                  </a>
                </div>
              </div>
              <button
                type="submit"
                className={`w-full flex items-center justify-center bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors ${
                  submitting ? "opacity-60 cursor-not-allowed" : ""
                }`}
                disabled={submitting}
              >
                {submitting ? (
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    ></path>
                  </svg>
                ) : (
                  <ArrowRight className="h-5 w-5 mr-2" />
                )}
                {submitting ? "Signing in..." : "Sign In"}
              </button>
              <div className="mt-6 text-center text-gray-600 text-sm">
                Don't have an account?{" "}
                <a
                  href="/signup"
                  className="text-blue-600 font-medium hover:text-blue-700"
                >
                  Sign up free
                </a>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-6 mt-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center mb-2 md:mb-0">
            <Signal className="h-6 w-6 text-blue-500" />
            <span className="ml-2 text-gray-900 font-bold">TrueSignalAI</span>
          </div>
          <div className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} TrueSignalAI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}