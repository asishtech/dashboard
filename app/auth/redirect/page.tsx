"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function AuthRedirect() {

  useEffect(() => {

    async function redirect() {

      const supabase =
        createSupabaseBrowser();

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

      if (!user) {

        window.location.href =
          "/login";

        return;
      }


      /*
       * The database trigger creates the profile
       * automatically when the Auth user is created.
       *
       * Give Supabase a moment to expose the
       * newly-created profile.
       */

      let profile = null;

      for (
        let attempt = 0;
        attempt < 5;
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
          resolve =>
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
       * Role routing
       */

      if (
        profile.role ===
        "admin"
      ) {

        window.location.href =
          "/admin";

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


      if (
        profile.role ===
        "buyer"
      ) {

        window.location.href =
          "/buyer";

        return;
      }


      /*
       * Unknown role
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
        minHeight:
          "100vh",
        display:
          "grid",
        placeItems:
          "center",
      }}
    >

      <p>
        Checking authorization...
      </p>

    </main>

  );
}
