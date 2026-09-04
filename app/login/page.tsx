"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { AlertIcon, GoogleIcon, TicketIcon } from "@/components/icons";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supabase = createSupabaseBrowser();

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        window.location.href = "/auth/redirect";
      }
    }

    checkSession();
  }, [supabase]);

  async function loginWithGoogle() {
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="app center-screen">
      <div className="center-card">
        <div className="brand-mark">
          <TicketIcon size={24} />
        </div>

        <span className="eyebrow eyebrow-accent">
          V-TAPP 2026
        </span>

        <h1 className="page-title mt-2">Tickets Portal</h1>

        <p className="page-subtitle">
          Sign in with the Google account you were invited with.
        </p>

        {error && (
          <div
            className="banner banner-danger mt-6 mb-0"
            role="alert"
          >
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={loading}
          className="btn btn-primary btn-block mt-8"
        >
          {loading ? (
            <>
              <span className="btn-spinner" />
              Connecting...
            </>
          ) : (
            <>
              <GoogleIcon />
              Continue with Google
            </>
          )}
        </button>

        <p className="help mt-6">
          Authorized V-TAPP personnel only.
        </p>
      </div>
    </main>
  );
}
