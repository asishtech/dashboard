"use client";

import Link from "next/link";

export default function VolunteerPage() {

  return (

    <main className="dashboard">

      <div className="container">

        <header className="header">

          <div>

            <h1>
              Volunteer Distribution
            </h1>

            <p>
              Scan a buyer QR code
              to distribute merchandise.
            </p>

          </div>

          <Link
            href="/"
            className="admin-link"
          >
            ← Dashboard
          </Link>

        </header>


        <section className="sales-panel">

          <div
            style={{
              textAlign:
                "center",
              padding:
                "50px 20px",
            }}
          >

            <div
              style={{
                fontSize:
                  "70px",
                marginBottom:
                  "20px",
              }}
            >
              📷
            </div>

            <h2>
              Ready to Scan
            </h2>

            <p className="panel-subtitle">
              Scan the QR code shown
              by the buyer.
            </p>

            <Link
              href="/volunteer/scan"
              className="save-button"
              style={{
                display:
                  "inline-block",
                textDecoration:
                  "none",
                marginTop:
                  "20px",
              }}
            >
              Start Scanner
            </Link>

          </div>

        </section>

      </div>

    </main>
  );
}
