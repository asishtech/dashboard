/*
 * Paid vs free events.
 *
 * The V-TAPP feed never says whether an event charges, so the only
 * evidence is what registrations were worth. `events.pricing` is an
 * admin override for events that have not sold anything yet; when it
 * is unset the registrations decide.
 *
 * "unclassified" is a real answer, not a fallback -- most seeded
 * events have no registrations at all before the fest opens, and
 * calling those free would be a guess presented as a fact.
 */
export type Pricing = "paid" | "free" | "unclassified";

export type PricedEvent = {
  pricing?: string | null;
  registrations?: number | null;
  revenue?: number | null;
  paidRegistrations?: number | null;
  freeRegistrations?: number | null;
};

export function classifyPricing(event: PricedEvent): Pricing {
  if (event.pricing === "paid" || event.pricing === "free") {
    return event.pricing;
  }

  const registrations = Number(event.registrations ?? 0);

  if (registrations <= 0) {
    return "unclassified";
  }

  /*
   * `paidRegistrations` is absent until supabase/event-pricing.sql
   * runs. Revenue answers the same question less precisely -- it
   * cannot distinguish a wholly free event from a mixed one -- so it
   * is the fallback rather than the source.
   */
  const paid =
    event.paidRegistrations === undefined ||
    event.paidRegistrations === null
      ? Number(event.revenue ?? 0) > 0
        ? registrations
        : 0
      : Number(event.paidRegistrations);

  return paid > 0 ? "paid" : "free";
}

/* True when an event sold both free and paid tickets. */
export function isMixed(event: PricedEvent): boolean {
  return (
    Number(event.paidRegistrations ?? 0) > 0 &&
    Number(event.freeRegistrations ?? 0) > 0
  );
}

export const PRICING_LABEL: Record<Pricing, string> = {
  paid: "Paid",
  free: "Free",
  unclassified: "Unclassified",
};
