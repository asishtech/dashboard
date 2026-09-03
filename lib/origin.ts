/*
 * The public origin of this request.
 *
 * `request.url` is what the *server* was reached on, not what the
 * browser typed. Behind a CDN those differ: CloudFront terminates TLS
 * on vtapp.co.in and forwards to an origin that believes it is
 * localhost:3000, so `new URL("/login", request.url)` produced
 * `https://localhost:3000/login` and every redirect -- including the
 * OAuth callback -- sent people to a machine that was not theirs.
 *
 * Netlify happens to set the host correctly, which is why this only
 * appeared after moving domains.
 *
 * Order matters: a forwarded header is per-request and handles several
 * domains pointing at one deployment; the configured URL is the
 * fallback for a proxy that forwards nothing; `request.url` is last
 * because it is the value that is wrong in exactly this situation.
 */
export function publicOrigin(request: Request): string {
  const headers = request.headers;

  const forwardedHost = headers.get("x-forwarded-host");

  /*
   * A comma-separated list means several proxies each appended to it.
   * The first entry is the one nearest the browser.
   */
  const first = (value: string) => value.split(",")[0].trim();

  const host = forwardedHost ?? headers.get("host");

  /*
   * `localhost` in the Host header is the CloudFront case: the CDN
   * forwards to an origin that answers on localhost:3000 and does not
   * rewrite the header. Trusting it is what produced the bad
   * redirects, so fall through to the configured URL instead.
   *
   * A forwarded host that says localhost is a local proxy, and is
   * accurate.
   */
  if (host && (forwardedHost || !host.startsWith("localhost"))) {
    const forwardedProto = headers.get("x-forwarded-proto");

    const proto = forwardedProto
      ? first(forwardedProto)
      : forwardedHost
        ? /*
           * A proxy that rewrites the host but not the protocol has
           * almost certainly terminated TLS; guessing http would
           * downgrade a real request.
           */
          "https"
        : /*
           * No proxy in front at all, so the scheme this request
           * actually arrived on is the right answer -- and it is http
           * for `next start` on a LAN address.
           */
          new URL(request.url).protocol.replace(":", "");

    return `${proto}://${first(host)}`;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return new URL(request.url).origin;
}

/* An absolute URL on the origin the browser actually used. */
export function publicUrl(request: Request, path: string): URL {
  return new URL(path, publicOrigin(request));
}
