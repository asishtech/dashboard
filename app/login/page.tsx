"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const supabase =
    createSupabaseBrowser();


  useEffect(() => {

    async function checkSession() {

      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();

      if (session) {
        window.location.href =
          "/auth/redirect";
      }
    }

    checkSession();

  }, [supabase]);


  async function loginWithGoogle() {

    setLoading(true);
    setError("");

    const {
      error,
    } =
      await supabase.auth.signInWithOAuth({
        provider: "google",

        options: {
          redirectTo:
            `${window.location.origin}/auth/callback`,
        },
      });

    if (error) {
      setError(
        error.message
      );
      setLoading(false);
    }
  }


  return (

    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f6f9",
        padding: "24px",
      }}
    >

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "white",
          borderRadius: "20px",
          padding: "40px",
          boxShadow:
            "0 20px 60px rgba(0,0,0,.08)",
          textAlign: "center",
        }}
      >

        <div
          style={{
            fontSize: "42px",
            marginBottom: "15px",
          }}
        >
          🎟️
        </div>

        <h1>
          V-TAPP Merchandise
        </h1>

        <p
          style={{
            color: "#64748b",
            marginBottom: "30px",
          }}
        >
          Admin & Volunteer Portal
        </p>


        {error && (

          <div
            style={{
              background: "#fff1f2",
              color: "#be123c",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>

        )}


        <button
          onClick={
            loginWithGoogle
          }
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            fontSize: "15px",
            fontWeight: 700,
          }}
        >

          {loading
            ? "Connecting..."
            : "Continue with Google"}

        </button>


        <p
          style={{
            marginTop: "25px",
            fontSize: "12px",
            color: "#94a3b8",
          }}
        >
          Authorized V-TAPP personnel only.
        </p>

      </div>

    </main>
  );
}
