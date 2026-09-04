"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import RoleSwitcher from "@/components/RoleSwitcher";
import {
  BoxIcon,
  InboxIcon,
  ListIcon,
  PulseIcon,
  ScanIcon,
  TicketIcon,
  UsersIcon,
} from "@/components/icons";

import { ROLE_LABEL, type Role } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number }) => React.ReactElement;
  /*
   * Sections with children match on prefix; leaf routes match
   * exactly, so /admin does not light up while you are on
   * /admin/inventory.
   */
  exact?: boolean;
};

/*
 * What each role can actually open. This mirrors needsRole() in
 * proxy.ts -- a link the active role would be bounced from is worse
 * than no link, because the bounce reads as a bug.
 */
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
    { href: "/admin/notifications", label: "Mail", icon: InboxIcon },
    { href: "/admin/users", label: "Staff", icon: UsersIcon },
    {
      href: "/admin/coordinators",
      label: "Coordinators",
      icon: UsersIcon,
    },
  ],

  faculty: [
    { href: "/events", label: "Events", icon: TicketIcon },
    { href: "/volunteer", label: "Scan", icon: ScanIcon },
  ],

  /*
   * One screen, one job. A volunteer scans; they have no reason to see
   * registrations, revenue or stock levels at the counter.
   */
  volunteer: [
    { href: "/volunteer", label: "Scan", icon: ScanIcon },
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
    { href: "/admin/activity", label: "Live", icon: PulseIcon },
  ],

  buyer: [
    { href: "/buyer", label: "My V-TAPP", icon: TicketIcon },
  ],
};

export default function NavBar() {
  const pathname = usePathname();

  const [roles, setRoles] = useState<Role[]>([]);
  const [active, setActive] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/role", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
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
  }, []);

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
      }).catch(() => {
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
          <div className="nav-links">
            {items.map((item) => {
              const Icon = item.icon;
              const current = isCurrent(item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${
                    current ? " nav-link-current" : ""
                  }`}
                  aria-current={current ? "page" : undefined}
                  /* Collapse the mobile menu on the way out. */
                  onClick={() => setOpen(false)}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="nav-actions">
            <RoleSwitcher roles={roles} activeRole={active} />
            <LogoutButton />
          </div>
        </div>

      </div>
    </nav>
  );
}
