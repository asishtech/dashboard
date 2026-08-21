"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

export default function AdminRegistrations() {

  const [records, setRecords] =
    useState<any[]>([]);

  const [search, setSearch] =
    useState("");

  const [updatingItem, setUpdatingItem] =
    useState<number | null>(null);

  async function updateDistribution(
    registrationItemId: number,
    currentStatus: string
  ) {
    const nextStatus =
      currentStatus === "GIVEN"
        ? "PENDING"
        : "GIVEN";

    const confirmed =
      window.confirm(
        nextStatus === "GIVEN"
          ? "Mark this item as distributed?"
          : "Mark this item as not distributed?"
      );

    if (!confirmed) {
      return;
    }

    setUpdatingItem(
      registrationItemId
    );

    try {
      const response =
        await fetch(
          "/api/distribution",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              registrationItemId,
              status: nextStatus,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Failed to update distribution"
        );
      }

      setRecords(
        current =>
          current.map(record => ({
            ...record,

            items:
              record.items?.map(
                (item: any) => {

                  if (
                    item.id !==
                    registrationItemId
                  ) {
                    return item;
                  }

                  return {
                    ...item,

                    distribution: [
                      {
                        status:
                          nextStatus,
                      },
                    ],

                    status:
                      nextStatus,
                  };
                }
              ),
          }))
      );

    } catch (error) {
      console.error(
        "Distribution update failed:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to update distribution"
      );

    } finally {
      setUpdatingItem(
        null
      );
    }
  }


  useEffect(() => {

    async function load() {

      const response =
        await fetch(
          "/api/registrations",
          {
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      setRecords(
        data.data ?? []
      );
    }

    load();

  }, []);


  const filtered =
    records.filter(
      record => {

        const q =
          search
            .toLowerCase()
            .trim();

        if (!q) {
          return true;
        }

        return JSON.stringify(
          record
        )
          .toLowerCase()
          .includes(q);
      }
    );


  return (

    <main className="dashboard">

      <div className="container">

        <header className="header">

          <div>
            <h1>
              Registrations
            </h1>

            <p>
              Buyers and QR codes
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <Link
              href="/admin"
              className="admin-link"
            >
              ← Admin
            </Link>

            <LogoutButton />
          </div>

        </header>


        <section className="search-panel">

          <input
            type="search"
            placeholder="Search buyer, email, registration..."
            value={search}
            onChange={e =>
              setSearch(
                e.target.value
              )
            }
          />

        </section>


        <section className="table-card">

          <div className="table-header">

            <div>

              <h2>
                Buyers
              </h2>

              <span>
                {filtered.length}
                {" "}
                registrations
              </span>

            </div>

          </div>


          <div className="table-wrapper">

            <table>

              <thead>

                <tr>

                  <th>Registration</th>
                  <th>Buyer</th>
                  <th>Email</th>
                  <th>Items</th>
                  <th>Distribution</th>
                  <th>QR</th>

                </tr>

              </thead>


              <tbody>

                {filtered.map(
                  record => {

                    const items =
                      record.items ??
                      [];

                    const given =
                      items.filter(
                        (item: any) =>
                          item.distribution
                            ?.some(
                              (d: any) =>
                                d.status ===
                                "GIVEN"
                            )
                      ).length;

                    return (

                      <tr
                        key={
                          record.id
                        }
                      >

                        <td>

                          <span className="id-badge">
                            {
                              record.registration_id
                            }
                          </span>

                        </td>


                        <td>
                          <strong>
                            {
                              record.name ??
                              "—"
                            }
                          </strong>
                        </td>


                        <td className="email">
                          {
                            record.email ??
                            "—"
                          }
                        </td>


                        <td>

                          {items.map(
                            (item: any) => {

                              const itemStatus =
                                item.distribution
                                  ?.at(0)
                                  ?.status ??
                                item.status ??
                                "PENDING";

                              const isUpdating =
                                updatingItem ===
                                item.id;

                              return (
                                <div
                                  key={
                                    item.id
                                  }
                                  style={{
                                    display:
                                      "flex",
                                    alignItems:
                                      "center",
                                    justifyContent:
                                      "space-between",
                                    gap:
                                      "12px",
                                    marginBottom:
                                      "8px",
                                  }}
                                >

                                  <span>
                                    {item.item}

                                    {item.size
                                      ? ` (${item.size})`
                                      : ""}

                                    {item.quantity > 1
                                      ? ` × ${item.quantity}`
                                      : ""}
                                  </span>

                                  <button
                                    type="button"
                                    disabled={
                                      isUpdating
                                    }
                                    onClick={() =>
                                      updateDistribution(
                                        item.id,
                                        itemStatus
                                      )
                                    }
                                    style={{
                                      border:
                                        "1px solid #d1d5db",
                                      borderRadius:
                                        "7px",
                                      padding:
                                        "4px 8px",
                                      fontSize:
                                        "11px",
                                      background:
                                        itemStatus ===
                                        "GIVEN"
                                          ? "#fee2e2"
                                          : "#dcfce7",
                                      color:
                                        itemStatus ===
                                        "GIVEN"
                                          ? "#991b1b"
                                          : "#166534",
                                      cursor:
                                        isUpdating
                                          ? "wait"
                                          : "pointer",
                                      whiteSpace:
                                        "nowrap",
                                    }}
                                  >
                                    {isUpdating
                                      ? "Updating..."
                                      : itemStatus ===
                                        "GIVEN"
                                        ? "Set Not Distributed"
                                        : "Set Distributed"}
                                  </button>

                                </div>
                              );
                            }
                          )}

                        </td>


                        <td>

                          {given ===
                          items.length &&
                          items.length > 0 ? (

                            <span className="type-badge single">
                              GIVEN
                            </span>

                          ) : (

                            <span className="type-badge combo">
                              {given}/
                              {items.length}
                            </span>

                          )}

                        </td>


                        <td>

                          <a
                            href={`/claim/${record.qr_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="qr-button"
                          >
                            View QR
                          </a>

                        </td>

                      </tr>

                    );

                  }
                )}

              </tbody>

            </table>

          </div>

        </section>

      </div>

    </main>
  );
}
