import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * Only same-origin, absolute-path destinations are accepted.
 *
 * `new URL(next, request.url)` on its own would happily resolve
 * "https://evil.example" or "//evil.example", turning the OAuth
 * callback into an open redirect.
 */
function safeNext(next: string | null) {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return "/auth/redirect";
  }

  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=oauth", request.url)
    );
  }

  const supabase = await createSupabaseServer();

  const { error } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=session", request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
