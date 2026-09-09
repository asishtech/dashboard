"use client";

import { useEffect } from "react";
import { landingFor } from "@/lib/roles";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function AuthRedirect() {
  useEffect(() => {
    async function redirect() {
      const supabase =
        createSupabaseBrowser();

      /*
       * This page loads right after /auth/callback has just minted a
       * brand-new session. getUser() can trigger a token refresh to
       * validate it -- and proxy.ts is, at the very same moment,
       * independently refreshing that identical session on its own
       * middleware pass for this same navigation. Refresh tokens are
       * single-use, so whichever of the two loses that race gets back
       * a 400 from Supabase, and getUser() here resolves with
       * `user: null` rather than throwing -- indistinguishable from
       * "never signed in" without a retry. A moment later the cookie
       * holds the winner's rotated token and the same call succeeds,
       * so retry a couple of times before concluding the session is
       * really gone.
       */
      let user: Awaited<
        ReturnType<typeof supabase.auth.getUser>
      >["data"]["user"] = null;

      for (
        let attempt = 0;
        !user && attempt < 3;
        attempt++
      ) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, 400)
          );
        }

        const result =
          await supabase.auth.getUser();

        user = result.data.user;
      }

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
       * Role routing, from the same table the proxy routes by.
       *
       * This used to be a ladder of its own and had never learned
       * "registrations", so the desk fell through to the branch below
       * and was signed out with ?error=role on every sign-in. An
       * unknown role now lands on /buyer, which any signed-in account
       * may open, rather than being thrown out of a session that is
       * perfectly valid.
       */
      window.location.href = landingFor(
        profile.role
      );
    }

    redirect();
  }, []);

  return (
    <main className="app loading-screen">
      <div className="loading-card">
        <div className="loading-spinner" />

        <h2>Checking authorization</h2>

        <p>Matching your account to a role...</p>
      </div>
    </main>
  );
}
