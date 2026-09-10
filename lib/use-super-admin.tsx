"use client";

import { useEffect, useState } from "react";

/*
 * Whether the signed-in admin is on the super_admins allowlist --
 * the only accounts requireAal2() and requireSuperAdmin() in
 * lib/auth.ts ever let through on inventory changes or admin/
 * coordinator grants.
 *
 * Read before deciding whether to run useStepUp()'s ensure(): a plain
 * admin who is not on the list was never going to be allowed to save
 * regardless of two-factor, so routing them through an enrollment
 * modal first and only then telling them "you are not on the list"
 * is a hoop nobody needed. Checking this first means only the
 * accounts the restriction actually applies to ever see that modal.
 */
export function useSuperAdmin() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/super-admins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setIsSuperAdmin(Boolean(data?.canManage));
      })
      .catch(() => {
        /* Defaults to false, which is the safe side -- worst case a
           super admin sees one extra "not authorized" round trip
           instead of the modal, on a request that would have needed
           a retry anyway. */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { isSuperAdmin, loaded };
}
