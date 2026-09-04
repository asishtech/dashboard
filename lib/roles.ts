/*
 * The roles, in one place.
 *
 * Split out of lib/auth.ts because that module reaches for
 * next/headers and the service-role client, which a client component
 * cannot import. NavBar and RoleSwitcher each kept their own copy of
 * this union instead, and adding "registrations" to the real one left
 * both of those silently one role short.
 *
 * Nothing here touches the request or the database, so both sides can
 * import it.
 */

export type Role =
  | "admin"
  | "volunteer"
  | "buyer"
  /*
   * Event coordinators, staff and student alike. The assignment
   * table is still `event_coordinators` because that describes the
   * relationship (who runs which event); this is the role they sign
   * in as.
   */
  | "faculty"
  /*
   * The registrations desk. Sees the whole festival -- every event,
   * every merchandise order, who has collected what -- and can change
   * none of it. Every write route requires "admin", so this role is
   * refused by the same check that refuses a buyer.
   */
  | "registrations";

/*
 * Most capable first. Used to pick a landing page when no role has
 * been chosen, and to resolve the primary role.
 *
 * Mirrors primary_role() in supabase/registrations-role.sql. If the
 * two disagree, the database decides what `profiles.role` says and
 * this decides where the browser goes -- which is how somebody ends
 * up on a page their role cannot open.
 */
export const ROLE_ORDER: Role[] = [
  "admin",
  "faculty",
  "volunteer",
  "registrations",
  "buyer",
];

export function primaryRole(roles: Role[]): Role | null {
  for (const r of ROLE_ORDER) {
    if (roles.includes(r)) return r;
  }

  return roles[0] ?? null;
}

/* What each role is called on screen. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  faculty: "Faculty",
  volunteer: "Volunteer",
  registrations: "Registrations",
  buyer: "Buyer",
};
