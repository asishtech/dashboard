"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "faculty" | "volunteer" | "buyer";

const LABEL: Record<Role, string> = {
  admin: "Admin",
  faculty: "Faculty",
  volunteer: "Volunteer",
  buyer: "Buyer",
};

/* Where each role belongs once it becomes active. */
const HOME: Record<Role, string> = {
  admin: "/admin",
  faculty: "/events",
  volunteer: "/volunteer",
  buyer: "/buyer",
};

type Props = {
  /*
   * NavBar has already asked /api/auth/role, so it hands the answer
   * down rather than making every bar cost two identical requests.
   * Used standalone (the collection pass), these are omitted and the
   * switcher fetches for itself.
   */
  roles?: Role[];
  activeRole?: Role | null;
};

/*
 * Only renders for accounts holding more than one role, so the common
 * case shows nothing at all rather than a control with one option.
 *
 * Switching reloads into that role's home screen: permissions follow
 * the active role, so staying put would often mean sitting on a page
 * the new role cannot open.
 */
export default function RoleSwitcher({ roles, activeRole }: Props) {
  const provided = roles !== undefined;

  const [ownRoles, setOwnRoles] = useState<Role[]>([]);
  const [ownActive, setOwnActive] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (provided) return;

    let cancelled = false;

    fetch("/api/auth/role", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setOwnRoles(data.roles ?? []);
        setOwnActive(data.activeRole ?? null);
      })
      .catch(() => {
        /* The switcher is optional chrome; never block the page. */
      });

    return () => {
      cancelled = true;
    };
  }, [provided]);

  const held = provided ? roles : ownRoles;
  const active = provided ? (activeRole ?? null) : ownActive;

  if (held.length < 2 || !active) {
    return null;
  }

  async function switchTo(role: Role) {
    if (role === active || busy) return;

    setBusy(true);

    try {
      const response = await fetch("/api/auth/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error("switch failed");
      }

      window.location.href = HOME[role];
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="sr-only" htmlFor="role-switcher">
        Acting as
      </label>

      <select
        id="role-switcher"
        className="select select-inline role-switcher"
        value={active}
        disabled={busy}
        onChange={(e) => switchTo(e.target.value as Role)}
        title="Switch which role you are acting as"
      >
        {held.map((r) => (
          <option key={r} value={r}>
            Acting as {LABEL[r]}
          </option>
        ))}
      </select>
    </>
  );
}
