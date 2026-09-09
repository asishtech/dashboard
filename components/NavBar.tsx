"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import RoleSwitcher from "@/components/RoleSwitcher";
import {
  BedIcon,
  BoxIcon,
  InboxIcon,
  ListIcon,
  PulseIcon,
  ScanIcon,
  SearchIcon,
  TicketIcon,
  UsersIcon,
} from "@/components/icons";

import { ROLE_LABEL, type Role } from "@/lib/roles";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { NavLinks, type NavItem } from "@/components/NavLinks";

/*
 * What each role can actually open, in the order they matter. The bar
 * shows as many as fit and moves the rest into a menu, so this list
 * can grow without anything being silently pushed off the edge.
 *
 * `exact` is for sections with children: /admin must not light up
 * while you are on /admin/inventory.
 *
 * This mirrors needsRole() in proxy.ts -- a link the active role would be bounced from is worse
 * than no link, because the bounce reads as a bug.
 */
/*
 * Everyone's own passes, last in every list.
 *
 * Staff buy hoodies and enter events too, and /buyer only ever shows
 * what the signed-in address itself owns -- so it is the same link for
 * every role rather than a buyer-only screen. Last, because it is the
 * one thing here nobody is on shift for: on a narrow window it is the
 * first to fold into the menu.
 */
const MINE: NavItem = {
  href: "/buyer",
  label: "My V-TAPP",
  icon: TicketIcon,
};

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Overview", icon: ListIcon, exact: true },
    { href: "/events", label: "Events", icon: TicketIcon },
    {
      href: "/admin/registrations",
      label: "Registrations",
      icon: ListIcon,
    },
    { href: "/admin/inventory", label: "Inventory", icon: BoxIcon },
    { href: "/admin/activity", label: "Live", icon: PulseIcon },
    { href: "/admin/external", label: "External", icon: UsersIcon },
    { href: "/admin/hostel", label: "Hostel", icon: BedIcon },
    { href: "/admin/whereabouts", label: "Find", icon: SearchIcon },
    { href: "/admin/notifications", label: "Mail", icon: InboxIcon },
    { href: "/admin/users", label: "Staff", icon: UsersIcon },
    {
      href: "/admin/coordinators",
      label: "Coordinators",
      icon: UsersIcon,
    },
    MINE,
  ],

  faculty: [
    { href: "/events", label: "Events", icon: TicketIcon },
    { href: "/volunteer", label: "Scan", icon: ScanIcon },
    MINE,
  ],

  /*
   * One screen, one job. A volunteer scans; they have no reason to see
   * registrations, revenue or stock levels at the counter.
   */
  volunteer: [
    { href: "/volunteer", label: "Scan", icon: ScanIcon },
    MINE,
  ],

  /*
   * The same three screens an admin uses, minus everything that
   * writes. No Mail, Staff or Coordinators: those change what the
   * festival does rather than report on it.
   */
  registrations: [
    { href: "/events", label: "Events", icon: TicketIcon },
    {
      href: "/admin/registrations",
      label: "Registrations",
      icon: ListIcon,
    },
    { href: "/admin/inventory", label: "Inventory", icon: BoxIcon },
    { href: "/admin/external", label: "External", icon: UsersIcon },
    { href: "/admin/hostel", label: "Hostel", icon: BedIcon },
    { href: "/admin/whereabouts", label: "Find", icon: SearchIcon },
    { href: "/admin/activity", label: "Live", icon: PulseIcon },
    MINE,
  ],

  buyer: [MINE],
};

/*
 * A session that has lapsed while the page stayed open.
 *
 * The proxy only runs on navigation, so a tab left sitting keeps
 * rendering long after its token expired -- and every API call under
 * it answers 401 while the screen still looks signed in. That reads
 * as the app being broken rather than as needing to sign in again.
 *
 * The sign-out is not tidiness. /login checks for a client-side
 * session and bounces straight back to /auth/redirect, so redirecting
 * with the stale session still in storage is a loop. Clearing it
 * first is what makes the redirect terminate.
 */
async function sessionLapsed(pathname: string) {
  if (pathname.startsWith("/login") || pathname.startsWith("/auth/")) {
    return;
  }

  try {
    await createSupabaseBrowser().auth.signOut();
  } catch {
    /* Going to /login matters more than a clean sign-out. */
  }

  window.location.href = `/login?next=${encodeURIComponent(
    pathname
  )}`;
}

export default function NavBar() {
  const pathname = usePathname();

  const [roles, setRoles] = useState<Role[]>([]);
  const [active, setActive] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/role", { cache: "no-store" })
      .then(async (r) => {
        /*
         * 401 is the only status treated as "signed out". A 500 or a
         * dropped connection is the server having a bad moment, and
         * throwing somebody back to the login screen for that would
         * lose whatever they were in the middle of.
         */
        if (r.status === 401) {
          if (!cancelled) await sessionLapsed(pathname);
          return null;
        }

        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (cancelled || !data?.success) return;
        setRoles(data.roles ?? []);
        setActive(data.activeRole ?? null);
      })
      .catch(() => {
        /* Chrome, not content. A failure must not blank the page. */
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /*
   * Heartbeat, so the admin activity page can say who is actually on
   * the site. Every 45 seconds against a 2-minute "online" window, so
   * one missed beat does not make a volunteer disappear mid-shift.
   *
   * It upserts a single row per account rather than appending, so the
   * cost is one write a minute per signed-in person -- about twenty
   * writes a minute across a fest, which is nothing next to the
   * scanning it is measuring.
   */
  useEffect(() => {
    if (!active) return;

    let stopped = false;

    const beat = () => {
      if (stopped || document.visibilityState === "hidden") return;

      void fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: window.location.pathname }),
        keepalive: true,
      })
        .then((r) => {
          /* The heartbeat is also the liveness check on the session:
             a tab left open finds out within one interval rather than
             on the next click. */
          if (r.status === 401 && !stopped) {
            void sessionLapsed(window.location.pathname);
          }
        })
        .catch(() => {
          /* A gate must not care that the monitor is down. */
        });
    };

    beat();

    const timer = window.setInterval(beat, 45_000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [active]);

  const items = active ? NAV[active] : [];

  function isCurrent(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return (
      pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  }

  const home = active ? NAV[active][0].href : "/";

  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">

        <Link href={home} className="nav-brand">
          <span className="nav-logo">
            <TicketIcon size={17} />
          </span>

          <span className="nav-wordmark">
            V-TAPP
            {active && (
              <span className="nav-role">{ROLE_LABEL[active]}</span>
            )}
          </span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="nav-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">
            {open ? "Hide menu" : "Show menu"}
          </span>

          <span className="nav-toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        {/*
          Links and account controls collapse together. Leaving the
          role switcher and sign-out button in the bar wrapped it onto
          a second row on a phone, which cost 120px of sticky height
          before any content.
        */}
        <div
          id="nav-menu"
          className={`nav-collapse${
            open ? " nav-collapse-open" : ""
          }`}
        >
          <NavLinks
            items={items}
            isCurrent={isCurrent}
            /* Collapse the mobile menu on the way out. */
            onNavigate={() => setOpen(false)}
          />

          <div className="nav-actions">
            <RoleSwitcher roles={roles} activeRole={active} />
            <LogoutButton />
          </div>
        </div>

      </div>
    </nav>
  );
}
