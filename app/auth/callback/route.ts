import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/auth";
import { publicUrl } from "@/lib/origin";

export const dynamic = "force-dynamic";

/*
 * Only same-origin, absolute-path destinations are accepted.
 *
 * Resolving `next` against a base would happily accept
 * "https://evil.example" or "//evil.example" and keep them, turning
 * the OAuth callback into an open redirect.
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
      publicUrl(request, "/login?error=oauth")
    );
  }

  const supabase = await createSupabaseServer();

  const { error } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (error) {
    return NextResponse.redirect(
      publicUrl(request, "/login?error=session")
    );
  }

  return NextResponse.redirect(publicUrl(request, next));
}
