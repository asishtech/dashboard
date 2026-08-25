export default function Loading() {
  return (
    <main className="app loading-screen">
      <div className="loading-card">
        <div className="loading-spinner" />

        <h2>Loading V-TAPP</h2>

        <p>
          Fetching the latest data...
        </p>
      </div>
    </main>
  );
}
