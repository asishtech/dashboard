"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import { AlertIcon, BoxIcon } from "@/components/icons";

type Item = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status: "GIVEN" | "PENDING";
};

type Registration = {
  registration_id: string;
  name: string;
  email: string;
  total: number;
  qr_token: string;
  items: Item[];
  distribution: {
    total: number;
    given: number;
    pending: number;
  };
};

export default function RegistrationDetailPage({
  params,
}: {
  params: Promise<{
    registration_id: string;
  }>;
}) {
  const [registration, setRegistration] =
    useState<Registration | null>(null);

  const [qrImage, setQrImage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function load() {
      try {
        const {
          registration_id,
        } = await params;

        const response =
          await fetch(
            `/api/registrations/${encodeURIComponent(
              registration_id
            )}`,
            {
              cache: "no-store",
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Registration not found"
          );
        }

        setRegistration(
          data.registration
        );

        const baseUrl =
          window.location.origin;

        const claimUrl =
          `${baseUrl}/claim/${data.registration.qr_token}`;

        /*
         * Loaded on demand: the encoder is only needed once the
         * registration resolves, so it stays out of the initial
         * page bundle.
         */
        const { default: QRCode } =
          await import("qrcode");

        const qr =
          await QRCode.toDataURL(
            claimUrl,
            {
              width: 420,
              margin: 2,
              errorCorrectionLevel: "H",
            }
          );

        setQrImage(qr);
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load registration"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  const formatAmount = (
    amount: number
  ) =>
    new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }
    ).format(amount);

  async function reverseDistribution(
    registrationItemId: number
  ) {
    try {
      const response = await fetch(
        "/api/distribution",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            registrationItemId,
            status: "PENDING",
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to reverse distribution"
        );
      }

      window.location.reload();
    } catch (error) {
      console.error(
        "Distribution reversal failed:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to reverse distribution"
      );
    }
  }


  if (loading) {
    return (
      <main className="app">
        <div className="container container-narrow">
          <div className="skeleton skeleton-title" />

          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div
                className="skeleton skeleton-line"
                style={{ width: "60%" }}
              />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (error || !registration) {
    return (
      <main className="app center-screen">
        <div className="center-card center-card-wide">
          <div className="brand-mark">
            <AlertIcon size={24} />
          </div>

          <h1 className="page-title">Registration not found</h1>

          <p className="page-subtitle">
            {error || "This registration could not be loaded."}
          </p>

          <Link
            href="/admin/registrations"
            className="btn btn-block mt-8"
          >
            Back to registrations
          </Link>
        </div>
      </main>
    );
  }

  const fullyDistributed =
    registration.distribution.pending === 0;

  return (
    <main className="app">
      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / Registration
            </span>

            <h1 className="page-title">{registration.name}</h1>

            <p className="page-subtitle">{registration.email}</p>
          </div>

          <div className="header-actions">
            <Link
              href="/admin/registrations"
              className="btn btn-ghost btn-sm"
            >
              All registrations
            </Link>

            <LogoutButton />
          </div>
        </header>


        <section className="stat-grid">
          <div className="stat">
            <span className="stat-label">Registration</span>

            <strong className="stat-value stat-value-sm mono">
              #{registration.registration_id}
            </strong>
          </div>

          <div className="stat">
            <span className="stat-label">Order total</span>

            <strong className="stat-value stat-value-sm">
              {formatAmount(registration.total)}
            </strong>
          </div>

          <div className="stat">
            <span className="stat-label">Distribution</span>

            <strong
              className={`stat-value stat-value-sm ${
                fullyDistributed ? "stat-success" : "stat-warning"
              }`}
            >
              {registration.distribution.given} /{" "}
              {registration.distribution.total}
            </strong>

            <span className="stat-meta">
              {fullyDistributed
                ? "All items handed over"
                : `${registration.distribution.pending} still pending`}
            </span>
          </div>
        </section>


        <div className="grid grid-main">

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Merchandise</h2>

                <p className="panel-subtitle">
                  Reversing an item makes it collectable again.
                </p>
              </div>
            </div>

            <div className="panel-body stack-tight stack">
              {registration.items.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <BoxIcon size={22} />
                  </div>

                  <p className="empty-title">No items</p>

                  <p className="empty-body">
                    This registration has no merchandise attached.
                  </p>
                </div>
              ) : (
                registration.items.map((item) => {
                  const given = item.status === "GIVEN";

                  return (
                    <div
                      key={item.id}
                      className={`scan-item${
                        given ? " scan-item-given" : ""
                      }`}
                    >
                      <div>
                        <div className="scan-item-name">
                          {item.item}
                        </div>

                        <div className="scan-item-meta">
                          {item.size ? `Size ${item.size}` : "One size"}
                          {item.quantity > 1
                            ? ` · Qty ${item.quantity}`
                            : ""}
                        </div>
                      </div>

                      <div className="header-actions">
                        <span
                          className={`badge ${
                            given ? "badge-success" : "badge-warning"
                          }`}
                        >
                          {given ? "Given" : "Pending"}
                        </span>

                        {given && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              reverseDistribution(item.id)
                            }
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>


          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Collection QR</h2>

                <p className="panel-subtitle">
                  Scanned by a volunteer at handover.
                </p>
              </div>
            </div>

            <div className="panel-body">
              {qrImage ? (
                <span className="qr-frame">
                  {/* Generated client-side as a data URL, so
                      next/image would add no value here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImage}
                    alt={`Collection QR code for registration ${registration.registration_id}`}
                    width={420}
                    height={420}
                  />
                </span>
              ) : (
                <div
                  className="skeleton"
                  style={{
                    aspectRatio: "1",
                    maxWidth: 260,
                    margin: "0 auto",
                    borderRadius: "var(--radius-lg)",
                  }}
                />
              )}

              <p className="help mt-4" style={{ textAlign: "center" }}>
                Token{" "}
                <span className="mono">{registration.qr_token}</span>
              </p>
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
