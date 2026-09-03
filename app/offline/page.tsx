import { AlertIcon } from "@/components/icons";

/*
 * Served by the service worker when a page is requested with no
 * network and nothing cached for it. Static on purpose: it must not
 * need a server to render, which is the whole point.
 */
export default function OfflinePage() {
  return (
    <main className="app center-screen">
      <div className="center-card center-card-wide">
        <div className="brand-mark">
          <AlertIcon size={24} />
        </div>

        <h1 className="page-title">No connection</h1>

        <p className="page-subtitle">
          This screen has not been opened on this device before, so
          there is no copy to show.
        </p>

        <p className="help mt-6">
          The scanner works offline once it has been opened with a
          signal at least once. Anything scanned while offline is saved
          and sent when the connection returns.
        </p>

        <a href="/volunteer" className="btn btn-block mt-8">
          Go to the scanner
        </a>
      </div>
    </main>
  );
}
