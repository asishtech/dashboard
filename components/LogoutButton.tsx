"use client";

import {
  useState,
} from "react";

import {
  createSupabaseBrowser,
} from "@/lib/supabase-browser";

export default function LogoutButton() {

  const [loading, setLoading] =
    useState(false);


  async function logout() {

    setLoading(true);

    const supabase =
      createSupabaseBrowser();

    await supabase.auth.signOut();

    window.location.href =
      "/login";
  }


  return (

    <button
      onClick={logout}
      disabled={loading}
      style={{
        border:
          "1px solid #e5e7eb",
        borderRadius:
          "9px",
        padding:
          "9px 14px",
        background:
          "white",
        color:
          "#374151",
        fontWeight:
          700,
        cursor:
          "pointer",
      }}
    >

      {loading
        ? "Logging out..."
        : "Logout"}

    </button>
  );
}
