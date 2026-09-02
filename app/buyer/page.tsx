"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import NavBar from "@/components/NavBar";
import {
  AlertIcon,
  BoxIcon,
  InboxIcon,
  TicketIcon,
} from "@/components/icons";

type BuyerEvent = {
  id: number;
  registration_id: string;
  event_id: string | null;
  name: string;
  day: string | null;
  venue: string | null;
  total: number;
  scanned: boolean;
  qr_token: string;
};

type MerchItem = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status: "GIVEN" | "PENDING";
};

type MerchOrder = {
  id: number;
  registration_id: string;
  total: number;
  qr_token: string;
  items: MerchItem[];
};

/*
 * Where a student goes to register or buy. Overridable, because a fest
 * portal URL is exactly the kind of thing that changes a week out.
 */
const PORTAL_URL =
  process.env.NEXT_PUBLIC_EVENTS_PORTAL_URL ||
  "https://events.vitap.ac.in";

/*
 * Everything one Google account owns, in two sections that never mix.
 * A person can register for six events and buy two hoodies; those are
 * different kinds of thing with different questions attached ("where
 * do I go?" vs "have I collected it?"), so they get different
 * sections rather than one undifferentiated list of registrations.
 */
export default function BuyerPage() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<BuyerEvent[]>([]);
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseBrowser();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        setUser(user);

        const response = await fetch("/api/buyer", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load your V-TAPP");
        }

        setEvents(data.events ?? []);
        setOrders(data.merchandise ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your V-TAPP"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const merch = useMemo(() => {
    let total = 0;
    let given = 0;

    for (const order of orders) {
      for (const item of order.items) {
        total += 1;
        if (item.status === "GIVEN") given += 1;
      }
    }

    return { total, given };
  }, [orders]);

  const checkedIn = events.filter((event) => event.scanned).length;

  const nothing =
    !loading && events.length === 0 && orders.length === 0;

  return (
    <main className="app">
      <NavBar />

      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / 2026</span>

            <h1 className="page-title">My V-TAPP</h1>

            <p className="page-subtitle">
              {user?.email ?? "Everything on your account"}
            </p>
          </div>
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}


        {loading ? (
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div
                className="skeleton skeleton-line"
                style={{ width: "70%" }}
              />
            </div>
          </section>
        ) : nothing ? (
          <section className="panel">
            <div className="empty">
              <div className="empty-icon">
                <InboxIcon size={22} />
              </div>

              <p className="empty-title">Nothing here yet</p>

              <p className="empty-body">
                Nothing is registered to{" "}
                <strong>{user?.email ?? "your Google account"}</strong>.
              </p>

              <p className="empty-body mt-4">
                The commonest reason is a different address: passes are
                matched to the email you used on the Events Portal, not
                the one you signed in with here.
              </p>

              <div className="actions-centred mt-8">
                <a
                  href={PORTAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Register or buy merchandise
                </a>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    const supabase = createSupabaseBrowser();
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  }}
                >
                  Sign in with another email
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="stat-grid">
              <div className="stat stat-feature">
                <span className="stat-label">Events</span>

                <strong className="stat-value">{events.length}</strong>

                <span className="stat-meta">
                  {events.length === 0
                    ? "None registered"
                    : `${checkedIn} checked in`}
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Merchandise</span>

                <strong className="stat-value">{merch.total}</strong>

                <span className="stat-meta">
                  {merch.total === 0
                    ? "Nothing bought"
                    : `Across ${orders.length} order${
                        orders.length === 1 ? "" : "s"
                      }`}
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Collected</span>

                <strong className="stat-value stat-success">
                  {merch.given}
                  <span className="dim"> / {merch.total}</span>
                </strong>

                <span className="stat-meta">
                  {merch.total === 0
                    ? "Nothing to collect"
                    : merch.given === merch.total
                      ? "All picked up"
                      : `${merch.total - merch.given} still waiting`}
                </span>
              </div>
            </section>


            {/* Events -------------------------------------------- */}
            {events.length > 0 && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">My events</h2>

                    <p className="panel-subtitle">
                      Show the QR at the venue to check in.
                    </p>
                  </div>

                  <span className="badge badge-plain">
                    {events.length}
                  </span>
                </div>

                <div className="panel-body stack-tight stack">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className={`scan-item${
                        event.scanned ? " scan-item-given" : ""
                      }`}
                    >
                      <div>
                        <div className="scan-item-name">
                          {event.name}
                        </div>

                        <div className="scan-item-meta">
                          {[event.day, event.venue]
                            .filter(Boolean)
                            .join(" · ") || "Schedule to be announced"}
                        </div>

                        <div className="mono dim text-sm mt-2">
                          #{event.registration_id}
                        </div>
                      </div>

                      <div className="header-actions">
                        {event.scanned ? (
                          <span className="badge badge-success">
                            Checked in
                          </span>
                        ) : (
                          <Link
                            href={`/claim/${event.qr_token}`}
                            className="btn btn-ghost btn-sm"
                          >
                            <TicketIcon size={14} />
                            Show QR
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}


            {/* Merchandise --------------------------------------- */}
            {orders.length > 0 && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">My merchandise</h2>

                    <p className="panel-subtitle">
                      A volunteer scans your QR at the counter.
                    </p>
                  </div>

                  <span className="badge badge-plain">
                    {merch.total} item{merch.total === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="panel-body stack-loose stack">
                  {orders.map((order) => (
                    <div key={order.id}>
                      <div className="section-header">
                        <div>
                          <div className="row-title">
                            Order #{order.registration_id}
                          </div>

                          <div className="row-meta">
                            {order.items.length} item
                            {order.items.length === 1 ? "" : "s"}
                          </div>
                        </div>

                        <Link
                          href={`/claim/${order.qr_token}`}
                          className="btn btn-primary btn-sm"
                        >
                          <TicketIcon size={14} />
                          Collection QR
                        </Link>
                      </div>

                      <div className="stack-tight stack">
                        {order.items.length === 0 ? (
                          <p className="help">
                            Nothing itemised on this order yet.
                          </p>
                        ) : (
                          order.items.map((item) => {
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
                                    {item.size
                                      ? `Size ${item.size} · `
                                      : ""}
                                    Qty {item.quantity}
                                  </div>
                                </div>

                                <span
                                  className={`badge ${
                                    given
                                      ? "badge-success"
                                      : "badge-warning"
                                  }`}
                                >
                                  {given ? "Collected" : "Pending"}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}


            {/* Only shown when the other half exists, so a merch-only
                buyer is not told twice that they have no events. */}
            {events.length === 0 && orders.length > 0 && (
              <section className="panel">
                <div className="empty">
                  <div className="empty-icon">
                    <TicketIcon size={22} />
                  </div>

                  <p className="empty-title">No events registered</p>

                  <p className="empty-body">
                    You have merchandise but no event bookings on this
                    address.
                  </p>
                </div>
              </section>
            )}

            {orders.length === 0 && events.length > 0 && (
              <section className="panel">
                <div className="empty">
                  <div className="empty-icon">
                    <BoxIcon size={22} />
                  </div>

                  <p className="empty-title">No merchandise</p>

                  <p className="empty-body">
                    You have event bookings but nothing to collect from
                    the merchandise counter.
                  </p>

                  <div className="actions-centred mt-8">
                    <a
                      href={PORTAL_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                    >
                      Buy merchandise
                    </a>
                  </div>

                  <p className="help mt-4">
                    Already bought some? It may sit under the email you
                    used on the Events Portal.
                  </p>
                </div>
              </section>
            )}
          </>
        )}

      </div>
    </main>
  );
}
