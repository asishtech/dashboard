import { supabaseAdmin } from "@/lib/supabase";

/*
 * Upstream V-TAPP buckets: 513 is merchandise, 514 is events,
 * 516 is hostel (food & accommodation).
 */
export const MERCH_SOURCE_ID = "513";

/*
 * A second merchandise sales window, opened mid-fest, selling from the
 * same catalog as 513 -- same items, same combo numbers, confirmed
 * against a portal export. Its ticket text carries only a size
 * ("L-SIZE"), never the item, so lib/vtapp-sync.ts reads the item from
 * a separate "Selected ITEM AND COLOUR" field instead of the ticket
 * text the way 513's parser does.
 *
 * Not yet folded into merchandiseEventIds() or resolve_event() -- this
 * only covers item/inventory parsing, not the Events-list exclusion or
 * revenue split those other 513-only checks do.
 */
export const MERCH_PHASE2_SOURCE_ID = "518";

/*
 * Unlike merchandise, hostel is a real upstream event -- it has its
 * own row in `events`, synced like any other -- so resolve_event()
 * (supabase/hostel-resolve.sql) maps it to itself rather than to a
 * synthetic slug. That row belongs to the Hostel screen, not the
 * general events list, for the same reason merchandise's does: it has
 * its own screen already.
 */
export const HOSTEL_SOURCE_ID = "516";

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
