"use client";

import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");

  const [authMode, setAuthMode] = useState<"microsoft" | "email">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setLoginError(result.error);
      } else if (result?.ok) {
        router.push("/dashboard");
      }
    } catch (err) {
      setLoginError("An error occurred during sign in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-10 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold">MarginDesk</h1>
          <p className="mt-2 text-sm text-gray-600">
            Project Margin Management System
          </p>
        </div>

        {/* Auth Method Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setAuthMode("email")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              authMode === "email"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Email & Password
          </button>
          <button
            onClick={() => setAuthMode("microsoft")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              authMode === "microsoft"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Microsoft
          </button>
        </div>

        {/* Error Messages */}
        {(error || loginError) && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">
              {loginError ||
              (error === "OAuthSignin" && "Error connecting to Microsoft") ||
              (error === "OAuthCallback" && "Error during sign in") ||
              (error === "OAuthCreateAccount" && "Could not create user account") ||
              (error === "CredentialsSignin" && "Invalid email or password") ||
              (error === "SessionRequired" && "Please sign in to access this page") ||
              "An error occurred during sign in"}
            </p>
          </div>
        )}

        {/* Email & Password Form */}
        {authMode === "email" && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:bg-gray-400"
            >
              {isLoading ? "Signing in..." : "Sign in with Email"}
            </button>
          </form>
        )}

        {/* Microsoft OAuth */}
        {authMode === "microsoft" && (
          <div className="space-y-4">
            <button
              onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
              className="w-full flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
              </svg>
              Sign in with Microsoft
            </button>
            <p className="text-center text-xs text-gray-500">
              Sign in with your organization Microsoft account
            </p>
          </div>
        )}

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>By signing in, you agree to our terms of service</p>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
