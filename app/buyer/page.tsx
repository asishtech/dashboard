"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";
import RoleSwitcher from "@/components/RoleSwitcher";
import { AlertIcon, InboxIcon } from "@/components/icons";

type Item = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status: string;
};

type Registration = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  ticket: string | null;
  qr_token: string;
  items: Item[];
};

export default function BuyerPage() {

  const [user, setUser] =
    useState<User | null>(null);

  const [registrations, setRegistrations] =
    useState<Registration[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  useEffect(() => {

    async function load() {

      try {

        const supabase =
          createSupabaseBrowser();

        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();

        if (!user) {

          window.location.href =
            "/login";

          return;
        }

        setUser(user);


        const response =
          await fetch(
            "/api/buyer",
            {
              cache: "no-store",
            }
          );

        const data =
          await response.json();

        if (!response.ok) {

          throw new Error(
            data.error ||
              "Unable to load orders"
          );

        }

        setRegistrations(
          data.registrations ?? []
        );

      } catch (err) {

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load orders"
        );

      } finally {

        setLoading(false);

      }

    }

    load();

  }, []);


  return (
    <main className="app">
      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / 2026</span>

            <h1 className="page-title">My Merchandise</h1>

            <p className="page-subtitle">
              {user?.email ?? "Your V-TAPP orders"}
            </p>
          </div>

          <RoleSwitcher />

            <LogoutButton />
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}


        {loading ? (
          <section className="panel">
            <div className="panel-body">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" style={{ width: "70%" }} />
            </div>
          </section>
        ) : registrations.length === 0 ? (
          <section className="panel">
            <div className="empty">
              <div className="empty-icon">
                <InboxIcon size={22} />
              </div>

              <p className="empty-title">No merchandise found</p>

              <p className="empty-body">
                We couldn&apos;t find any V-TAPP merchandise for{" "}
                {user?.email ?? "your Google account"}. If you bought
                something with a different address, sign in with that
                account instead.
              </p>
            </div>
          </section>
        ) : (
          <div className="stack-loose stack">
            {registrations.map((registration) => (
              <section className="panel" key={registration.id}>
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">
                      Registration #{registration.registration_id}
                    </h2>

                    <p className="panel-subtitle">
                      {registration.ticket ?? "Merchandise"}
                    </p>
                  </div>

                  <Link
                    href={`/claim/${registration.qr_token}`}
                    className="btn btn-primary btn-sm"
                  >
                    View QR
                  </Link>
                </div>

                <div className="panel-body stack-tight stack">
                  {(registration.items ?? []).length === 0 && (
                    <p className="help">
                      This is an event booking, so there is no
                      merchandise to collect.
                    </p>
                  )}

                  {(registration.items ?? []).map((item) => {
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
                            {item.size ? `Size ${item.size} · ` : ""}
                            Qty {item.quantity}
                          </div>
                        </div>

                        <span
                          className={`badge ${
                            given ? "badge-success" : "badge-warning"
                          }`}
                        >
                          {given ? "Given" : "Pending"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
