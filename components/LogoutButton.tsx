"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);

    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();

    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="btn btn-ghost btn-sm"
    >
      {loading && <span className="btn-spinner" />}
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
