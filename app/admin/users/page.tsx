"use client";

import { useEffect, useState } from "react";

type StaffUser = {
  id: number;
  email: string;
  role: "admin" | "volunteer";
  active: boolean;
  created_at: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<"volunteer" | "admin">("volunteer");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);

      const response = await fetch(
        "/api/admin/users",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to load staff accounts"
        );
      }

      setUsers(data.users ?? []);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load staff accounts"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function addUser(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Email address is required.");
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedEmail
      )
    ) {
      setError(
        "Enter a valid email address."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to add staff account"
        );
      }

      setEmail("");
      setRole("volunteer");

      setMessage(
        `${normalizedEmail} added as ${role}.`
      );

      await loadUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to add staff account"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(
    user: StaffUser
  ) {
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/users",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id: user.id,
            active: !user.active,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to update account"
        );
      }

      await loadUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update account"
      );
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#030506",
        color: "#f4f4f5",
        padding: "40px",
        fontFamily:
          "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1500px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              color: "#f97316",
              fontFamily:
                "SFMono-Regular, Consolas, monospace",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: ".16em",
              marginBottom: "10px",
            }}
          >
            [ CONTROL ] / USER MANAGEMENT
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "34px",
              fontWeight: 800,
            }}
          >
            Staff Accounts
          </h1>

          <p
            style={{
              marginTop: "8px",
              color: "#8b8f98",
              fontSize: "14px",
            }}
          >
            Manage administrator and volunteer
            access.
          </p>
        </div>

        {/* MAIN GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(360px, 1fr) minmax(500px, 1.35fr)",
            border:
              "1px solid #242a32",
            background: "#090c0f",
          }}
        >
          {/* ADD USER */}
          <section
            style={{
              padding: "38px",
              borderRight:
                "1px solid #242a32",
            }}
          >
            <div
              style={{
                color: "#f97316",
                fontFamily:
                  "SFMono-Regular, Consolas, monospace",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: ".15em",
                marginBottom: "12px",
              }}
            >
              CREATE ACCESS
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "28px",
              }}
            >
              Add User
            </h2>

            <p
              style={{
                color: "#8b8f98",
                lineHeight: 1.6,
                fontSize: "14px",
                margin:
                  "10px 0 30px",
              }}
            >
              Enter the Google account email
              and assign its role. The user&apos;s
              profile details are resolved
              automatically when they sign in.
            </p>

            <form onSubmit={addUser}>
              {/* EMAIL */}
              <label
                style={{
                  display: "block",
                  color: "#777d87",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: ".12em",
                  marginBottom: "8px",
                }}
              >
                GOOGLE EMAIL
              </label>

              <input
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                type="email"
                placeholder="user@example.com"
                autoComplete="email"
                disabled={saving}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: "54px",
                  padding: "0 16px",
                  background: "#080b0e",
                  border:
                    "1px solid #303640",
                  color: "#f4f4f5",
                  outline: "none",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "13px",
                  marginBottom: "22px",
                }}
              />

              {/* ROLE */}
              <label
                style={{
                  display: "block",
                  color: "#777d87",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: ".12em",
                  marginBottom: "8px",
                }}
              >
                ROLE
              </label>

              <select
                value={role}
                onChange={(event) =>
                  setRole(
                    event.target.value as
                      | "volunteer"
                      | "admin"
                  )
                }
                disabled={saving}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: "54px",
                  padding: "0 16px",
                  background: "#080b0e",
                  border:
                    "1px solid #303640",
                  color: "#f4f4f5",
                  outline: "none",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "13px",
                  marginBottom: "24px",
                }}
              >
                <option value="volunteer">
                  Volunteer
                </option>
                <option value="admin">
                  Administrator
                </option>
              </select>

              {/* STATUS */}
              {error && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px 14px",
                    border:
                      "1px solid #7f1d1d",
                    background:
                      "rgba(127,29,29,.12)",
                    color: "#f87171",
                    fontFamily:
                      "SFMono-Regular, Consolas, monospace",
                    fontSize: "11px",
                  }}
                >
                  {error}
                </div>
              )}

              {message && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px 14px",
                    border:
                      "1px solid #166534",
                    background:
                      "rgba(22,101,52,.12)",
                    color: "#4ade80",
                    fontFamily:
                      "SFMono-Regular, Consolas, monospace",
                    fontSize: "11px",
                  }}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  saving ||
                  !email.trim()
                }
                style={{
                  width: "100%",
                  height: "52px",
                  border:
                    "1px solid #f97316",
                  background: saving
                    ? "#321b0b"
                    : "#f97316",
                  color: saving
                    ? "#f97316"
                    : "#080808",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: ".1em",
                  cursor: saving
                    ? "wait"
                    : "pointer",
                }}
              >
                {saving
                  ? "ADDING..."
                  : "ADD STAFF ACCOUNT"}
              </button>
            </form>
          </section>

          {/* STAFF LIST */}
          <section
            style={{
              padding: "38px",
            }}
          >
            <div
              style={{
                color: "#4ade80",
                fontFamily:
                  "SFMono-Regular, Consolas, monospace",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: ".15em",
                marginBottom: "12px",
              }}
            >
              PRIVILEGED ACCOUNTS
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "28px",
              }}
            >
              Staff Accounts
            </h2>

            <p
              style={{
                color: "#8b8f98",
                fontSize: "14px",
                margin:
                  "8px 0 28px",
              }}
            >
              Administrators and volunteers
              authorized by email.
            </p>

            {loading ? (
              <div
                style={{
                  color: "#777d87",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "12px",
                }}
              >
                Loading accounts...
              </div>
            ) : users.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  border:
                    "1px dashed #303640",
                  color: "#777d87",
                  fontFamily:
                    "SFMono-Regular, Consolas, monospace",
                  fontSize: "11px",
                }}
              >
                No staff accounts configured.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {users.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr auto auto",
                      alignItems: "center",
                      gap: "18px",
                      padding:
                        "17px 18px",
                      border:
                        "1px solid #252b33",
                      background:
                        "#07090c",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#f4f4f5",
                          fontSize: "14px",
                          fontWeight: 700,
                          marginBottom:
                            "6px",
                        }}
                      >
                        {user.email}
                      </div>

                      <div
                        style={{
                          color: "#626975",
                          fontFamily:
                            "SFMono-Regular, Consolas, monospace",
                          fontSize: "9px",
                        }}
                      >
                        Added{" "}
                        {new Date(
                          user.created_at
                        ).toLocaleDateString()}
                      </div>
                    </div>

                    <span
                      style={{
                        padding:
                          "7px 10px",
                        border:
                          user.role ===
                          "admin"
                            ? "1px solid #f97316"
                            : "1px solid #8b5cf6",
                        color:
                          user.role ===
                          "admin"
                            ? "#fb923c"
                            : "#c084fc",
                        fontFamily:
                          "SFMono-Regular, Consolas, monospace",
                        fontSize: "9px",
                        fontWeight: 800,
                        letterSpacing:
                          ".08em",
                      }}
                    >
                      {user.role ===
                      "admin"
                        ? "ADMIN"
                        : "VOLUNTEER"}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        toggleUser(user)
                      }
                      style={{
                        padding:
                          "7px 10px",
                        border:
                          "1px solid #303640",
                        background:
                          "transparent",
                        color: user.active
                          ? "#4ade80"
                          : "#f87171",
                        fontFamily:
                          "SFMono-Regular, Consolas, monospace",
                        fontSize: "9px",
                        fontWeight: 800,
                        cursor:
                          "pointer",
                      }}
                    >
                      {user.active
                        ? "ACTIVE"
                        : "DISABLED"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* BACK */}
        <div
          style={{
            marginTop: "20px",
          }}
        >
          <a
            href="/admin"
            style={{
              color: "#777d87",
              fontFamily:
                "SFMono-Regular, Consolas, monospace",
              fontSize: "10px",
              textDecoration: "none",
            }}
          >
            ← BACK TO ADMIN DASHBOARD
          </a>
        </div>
      </div>
    </main>
  );
}
