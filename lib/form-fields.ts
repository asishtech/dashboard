/*
 * Answers to the custom form questions, read out of raw_data.
 *
 * The feed has no phone or university column. Whatever the organisers
 * added to a form arrives as
 * raw_data.field_values = [{ field_name, field_value }, ...], and the
 * labels differ per event: "University Name", "College/Institution",
 * "Mobile Number", "Contact No".
 *
 * These are ports of registration_phone() and registration_university()
 * in supabase/desk-tools.sql and supabase/external-colleges.sql. The
 * database is the original, and anything that can ask Postgres should
 * keep calling those. This copy exists for the spreadsheet exports,
 * which would otherwise need a new migration run against a live fest
 * to add one download -- raw_data is about 670 bytes a row, so reading
 * it for a few thousand registrations costs a couple of megabytes once,
 * on a request somebody deliberately made.
 *
 * If you change a pattern here, change it there too.
 */

export type RawRegistration = {
  field_values?: { field_name?: string; field_value?: string }[];
} | null;

/* raw_data is a text column on some rows and json on others. */
export function parseRaw(raw: unknown): RawRegistration {
  if (!raw) return null;

  if (typeof raw === "object") return raw as RawRegistration;

  if (typeof raw !== "string") return null;

  try {
    return JSON.parse(raw) as RawRegistration;
  } catch {
    return null;
  }
}

function fields(raw: RawRegistration) {
  const values = raw?.field_values;

  return Array.isArray(values) ? values : [];
}

const INSTITUTION = /(university|college|institut|organi[sz]ation|campus|school)/;

/*
 * "University Regd Number" matches the institution pattern and comes
 * first on most forms, so without this the college column filled up
 * with roll numbers -- 181 nonsense values against 1,260 real ones.
 */
const ID_SHAPED =
  /(regd|reg\.?\s*no|registration\s*(no|number)|roll|\bid\b|number|mobile|phone|email|size)/;

export function collegeFrom(raw: RawRegistration) {
  for (const field of fields(raw)) {
    const name = (field?.field_name ?? "").toLowerCase();

    if (!INSTITUTION.test(name) || ID_SHAPED.test(name)) continue;

    const value = (field?.field_value ?? "").trim();

    if (value) return value;
  }

  return "";
}

const PHONE_FIELD = /(mobile|phone|contact|whatsapp)/;

/*
 * Digits only. People type 7207066999, +91 7207066999 and
 * 072070 66999 for the same number, and a sheet that gets pasted into
 * a bulk SMS tool wants one shape.
 */
export function phoneFrom(raw: RawRegistration) {
  for (const field of fields(raw)) {
    const name = (field?.field_name ?? "").toLowerCase();

    if (!PHONE_FIELD.test(name)) continue;

    const digits = (field?.field_value ?? "").replace(/\D/g, "");

    /* Shorter than ten digits is an extension or a typo, not a number
       anyone can ring. */
    if (digits.length >= 10) return digits;
  }

  return "";
}
