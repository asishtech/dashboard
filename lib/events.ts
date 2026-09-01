import { supabaseAdmin } from "@/lib/supabase";

/*
 * Upstream V-TAPP buckets: 513 is merchandise, 514 is events.
 */
export const MERCH_SOURCE_ID = "513";

/* Slug the seed gives the merchandise row, used only as a fallback. */
const MERCH_SLUG = "merchandise";

/*
 * `public.events` carries a row for merchandise as well as the real
 * events -- resolve_event() needs something to map a hoodie order
 * onto, so supabase/events-seed.sql inserts one. That row is
 * plumbing, not an event: it has no day, no venue and no coordinator,
 * and listing it under "All Events" puts garment sales next to Art
 * Attack.
 *
 * So the events screens filter it out. Matching on the upstream
 * bucket rather than the slug means renaming the row cannot silently
 * put merchandise back in the list.
 */
export async function merchandiseEventIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin()
    .from("events")
    .select("event_id")
    .eq("source_event_id", MERCH_SOURCE_ID);

  /*
   * 42703: `source_event_id` predates supabase/events-seed.sql. Fall
   * back to the known slug rather than letting merchandise leak into
   * the list.
   */
  if (error) {
    if (error.code === "42703") {
      return new Set([MERCH_SLUG]);
    }

    throw error;
  }

  const ids = new Set((data ?? []).map((row) => String(row.event_id)));

  /*
   * Belt and braces: an older seed may have inserted the row before
   * source_event_id existed, leaving it unlabelled.
   */
  ids.add(MERCH_SLUG);

  return ids;
}
