/*
 * Reading every row, when "every row" is more than PostgREST will hand
 * over in one response.
 *
 * Supabase caps a response at 1000 rows (db-max-rows) and says nothing
 * about it: no error, no flag, just a shorter array. At 1060
 * registrations the admin list quietly lost 60 people, and the
 * dashboard's head count was computed from the 1000 that happened to
 * come back. A silent undercount is worse than a failure, because
 * nothing about the screen looks wrong.
 */

export const PAGE_SIZE = 1000;

type Page<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

/*
 * `build` is called once per page with the row window, so the caller
 * keeps ownership of the query -- its columns, filters and ordering.
 *
 * The ordering must be total. Paging over a query ordered by a column
 * with ties lets rows swap between pages, which drops some and repeats
 * others; every caller here orders by id as the final key.
 */
export async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = [];

  let total = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error, count } = await build(
      from,
      from + PAGE_SIZE - 1
    );

    if (error) throw error;

    if (from === 0 && typeof count === "number") {
      total = count;
    }

    const page = data ?? [];

    rows.push(...page);

    /*
     * A short page is the last page. Checking the count instead would
     * loop forever if rows were deleted mid-read.
     */
    if (page.length < PAGE_SIZE) break;
  }

  return { rows, total: total || rows.length };
}
