"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function AuthRedirect() {
  useEffect(() => {
    async function redirect() {
      const supabase =
        createSupabaseBrowser();

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      /*
       * First synchronize any administrator /
       * volunteer invitation assigned to this
       * Google account.
       */
      let syncedRole: string | null =
        null;

      try {
        const response = await fetch(
          "/api/auth/staff-sync",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );

        if (response.ok) {
          const result =
            await response.json();

          /*
           * Staff sync just wrote the profile and
           * tells us the role it assigned, so for
           * admins and volunteers there is nothing
           * left to wait for.
           */
          if (
            result?.active !== false
          ) {
            syncedRole =
              result?.role ?? null;
          }
        } else {
          console.error(
            "Staff synchronization failed"
          );
        }
      } catch (error) {
        console.error(
          "Staff synchronization error:",
          error
        );
      }

      /*
       * Read the final profile after staff
       * synchronization.
       *
       * Only buyers reach the retry loop: their
       * profile is created by the database, which
       * can lag slightly behind first sign-in.
       */
      let profile: {
        role: string;
        active: boolean;
      } | null = syncedRole
        ? {
            role: syncedRole,
            active: true,
          }
        : null;

      for (
        let attempt = 0;
        !profile && attempt < 5;
        attempt++
      ) {
        const result =
          await supabase
            .from("profiles")
            .select(
              "role,active"
            )
            .eq(
              "id",
              user.id
            )
            .maybeSingle();

        if (result.data) {
          profile =
            result.data;
          break;
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              300
            )
        );
      }

      if (!profile) {
        console.error(
          "Profile was not created for:",
          user.id
        );

        await supabase.auth.signOut();

        window.location.href =
          "/login?error=profile";

        return;
      }

      if (!profile.active) {
        await supabase.auth.signOut();

        window.location.href =
          "/login?error=unauthorized";

        return;
      }

      /*
       * Role routing.
       */

      if (profile.role === "admin") {
        window.location.href = "/admin";
        return;
      }

      if (
        profile.role ===
        "volunteer"
      ) {
        window.location.href =
          "/volunteer";
        return;
      }

      if (profile.role === "buyer") {
        window.location.href =
          "/buyer";
        return;
      }

      /*
       * Unknown role.
       */
      await supabase.auth.signOut();

      window.location.href =
        "/login?error=role";
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
      <p>
        Checking authorization...
      </p>
    </main>
  );
}
