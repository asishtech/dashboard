/*
 * The proxy resolves "/" for every visitor: anonymous users go
 * to /login, signed-in users go to their role's dashboard.
 *
 * This page therefore only renders if the proxy is bypassed, so
 * it stays a server component. It previously shipped a client
 * bundle that repeated the same auth lookups in the browser.
 */
export default function Home() {
  return (
    <main className="app loading-screen">
      <div className="loading-card">
        <div className="loading-spinner" />

        <h2>Checking authentication</h2>

        <p>Taking you to your dashboard...</p>
      </div>
    </main>
  );
}
