"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function Home() {
  useEffect(() => {
    async function redirect() {
      const supabase = createSupabaseBrowser();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,active")
        .eq("id", user.id)
        .single();

      if (!profile?.active) {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      if (profile.role === "admin") {
        window.location.href = "/admin";
      } else if (profile.role === "volunteer") {
        window.location.href = "/volunteer";
      } else if (profile.role === "buyer") {
        window.location.href = "/buyer";
      } else {
        await supabase.auth.signOut();
        window.location.href = "/login?error=role";
      }
    }

    redirect();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <p>Checking authentication...</p>
    </main>
  );
}
