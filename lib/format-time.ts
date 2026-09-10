/*
 * Every timestamp in this app describes something that happened at
 * the fest, in India -- a check-in, a hand-over, a sync. `"en-IN"` as
 * a locale only decides formatting conventions (date order, the comma
 * before AM/PM); it says nothing about which timezone the clock reads
 * in, and `toLocaleString()` without an explicit `timeZone` falls
 * back to wherever the code happens to be running -- the server's
 * timezone for anything rendered there, which is UTC more often than
 * not. That silently shifted every timestamp in the app by 5.5 hours.
 *
 * These three wrap the standard formatters with `timeZone: "Asia/
 * Kolkata"` pinned, so a registration's timestamp reads the same
 * whether the page rendered on a laptop in Amaravati or a server
 * anywhere else on earth.
 */

const IST = "Asia/Kolkata";

export function formatDateTimeIst(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: IST,
    ...options,
  });
}

export function formatDateIst(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: IST,
    ...options,
  });
}

export function formatTimeIst(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
) {
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: IST,
    ...options,
  });
}
