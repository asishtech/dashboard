import QRCode from "qrcode";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ClaimDistribution = {
  status: string | null;
  given_at?: string | null;
};

type ClaimItem = {
  id: number;
  item: string;
  size: string | null;
  quantity: number | string | null;
  distribution:
    | ClaimDistribution[]
    | ClaimDistribution
    | null;
};

function quantityOf(item: ClaimItem) {
  return Math.max(
    Number(item.quantity ?? 1),
    1
  );
}

/*
 * How many units of this line item have been handed over.
 *
 * Supabase returns the embedded relation as an array or as a
 * single object depending on the inferred cardinality.
 */
function givenCount(item: ClaimItem) {
  const distributions = Array.isArray(
    item.distribution
  )
    ? item.distribution
    : item.distribution
      ? [item.distribution]
      : [];

  return distributions.filter(
    (distribution) =>
      distribution?.status === "GIVEN"
  ).length;
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {

  const { token } =
    await params;


  /*
   * Get authenticated Google user.
   */
  const authClient =
    await createSupabaseServer();

  const {
    data: {
      user,
    },
  } =
    await authClient.auth.getUser();


  if (!user) {
    redirect(
      `/login?next=/claim/${token}`
    );
  }


  const googleEmail =
    user.email
      ?.trim()
      .toLowerCase();

  if (!googleEmail) {
    notFound();
  }


  /*
   * The profile lookup and the QR lookup do not depend on each
   * other, so issue them together instead of back to back.
   *
   * The service-role client is used only after authentication,
   * and the buyer's email is STILL verified below.
   */
  const db = supabaseAdmin();

  const [
    {
      data: profile,
      error: profileError,
    },
    {
      data: registration,
      error,
    },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .maybeSingle(),

    db
      .from("registrations")
      .select(`
        id,
        registration_id,
        name,
        email,
        ticket,
        items:registration_items(
          id,
          item,
          size,
          quantity,
          distribution:distributions(
            status,
            given_at
          )
        )
      `)
      .eq(
        "qr_token",
        token
      )
      .maybeSingle(),
  ]);

  if (profileError) {
    console.error(
      "Profile lookup failed:",
      profileError
    );
  }


  if (
    error ||
    !registration
  ) {
    notFound();
  }


  /*
   * SECURITY CHECK:
   *
   * Admins and volunteers can access
   * any QR code because they need to
   * manage/distribute merchandise.
   *
   * Buyers can only access their own QR.
   */

  const isPrivileged =
    profile?.active === true &&
    (profile.role === "admin" ||
      profile.role === "volunteer");

  const registrationEmail =
    registration.email
      ?.trim()
      .toLowerCase();

  const isOwner =
    !!registrationEmail &&
    registrationEmail ===
      googleEmail;

  if (
    !isPrivileged &&
    !isOwner
  ) {

    return (
      <main
        style={{
          minHeight:
            "100vh",
          display:
            "grid",
          placeItems:
            "center",
          background:
            "#f4f6f9",
          padding:
            "30px",
        }}
      >

        <div
          style={{
            background:
              "white",
            borderRadius:
              "18px",
            padding:
              "40px",
            maxWidth:
              "500px",
            width:
              "100%",
            textAlign:
              "center",
            boxShadow:
              "0 20px 50px rgba(0,0,0,.08)",
          }}
        >

          <div
            style={{
              fontSize:
                "50px",
              marginBottom:
                "15px",
            }}
          >
            🔒
          </div>

          <h1>
            QR Access Denied
          </h1>

          <p
            style={{
              color:
                "#64748b",
              lineHeight:
                "1.6",
            }}
          >
            This QR code belongs to a
            different Google account.
          </p>

          <p
            style={{
              color:
                "#64748b",
              fontSize:
                "13px",
            }}
          >
            Sign in using the Google
            account used when purchasing
            the merchandise.
          </p>

        </div>

      </main>
    );
  }


  /*
   * Fall back to the request's own origin so an unset
   * NEXT_PUBLIC_APP_URL cannot bake "undefined/claim/..."
   * into a printed QR code.
   */
  const requestHeaders = await headers();

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${
      requestHeaders.get("host") ?? ""
    }`;

  const qrUrl =
    `${origin}/claim/${token}`;

  const qr =
    await QRCode.toDataURL(
      qrUrl,
      {
        width: 500,
        margin: 2,
        errorCorrectionLevel: "H",
      }
    );

  const items =
    (registration.items ??
      []) as ClaimItem[];

  const totalItems =
    items.reduce(
      (sum, item) =>
        sum + quantityOf(item),
      0
    );

  const givenItems =
    items.reduce(
      (sum, item) =>
        sum +
        Math.min(
          givenCount(item),
          quantityOf(item)
        ),
      0
    );

  const pendingItems =
    Math.max(
      totalItems -
        givenItems,
      0
    );

  const progress =
    totalItems > 0
      ? Math.round(
          (givenItems /
            totalItems) *
            100
        )
      : 0;

  const allGiven =
    totalItems > 0 &&
    pendingItems === 0;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#07090b",
        color: "#f4f7f8",
        padding:
          "24px 16px 50px",
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >

      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >

        {/* =================================================
            TOP BAR
           ================================================= */}

        <header
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "15px",
            marginBottom: "28px",
            paddingBottom: "15px",
            borderBottom:
              "1px solid #20262b",
          }}
        >

          <div>

            <div
              style={{
                color: "#b7ff00",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing:
                  ".18em",
              }}
            >
              V-TAPP / 2026
            </div>

            <div
              style={{
                marginTop: "5px",
                color: "#68737c",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "8px",
                letterSpacing:
                  ".1em",
              }}
            >
              MERCHANDISE CLAIM SYSTEM
            </div>

          </div>

          <div
            style={{
              padding:
                "7px 10px",
              border:
                "1px solid #283038",
              color:
                allGiven
                  ? "#b7ff00"
                  : "#f0b84b",
              background:
                "#0b0f12",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize: "8px",
              fontWeight: 800,
              letterSpacing:
                ".1em",
            }}
          >
            {allGiven
              ? "CLAIM COMPLETE"
              : "QR VERIFIED"}
          </div>

        </header>


        {/* =================================================
            BUYER HERO
           ================================================= */}

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            background:
              "linear-gradient(135deg,#11171b 0%,#0b0f12 100%)",
            border:
              "1px solid #293137",
            padding:
              "30px 28px",
            marginBottom: "18px",
          }}
        >

          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "140px",
              height: "140px",
              background:
                "radial-gradient(circle,rgba(183,255,0,.12),transparent 68%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              color: "#68737c",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing:
                ".15em",
              marginBottom:
                "12px",
            }}
          >
            MERCHANDISE CLAIM FOR
          </div>

          <h1
            style={{
              margin: 0,
              color: "#f4f7f8",
              fontSize:
                "clamp(30px,6vw,48px)",
              lineHeight: 1,
              letterSpacing:
                "-.04em",
              fontWeight: 800,
              textTransform:
                "uppercase",
            }}
          >
            {registration.name}
          </h1>

          <div
            style={{
              marginTop: "12px",
              color: "#7d8992",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize: "10px",
              wordBreak:
                "break-word",
            }}
          >
            {registration.email}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "20px",
            }}
          >

            <InfoPill
              label="REGISTRATION"
              value={
                registration.registration_id
              }
            />

            {registration.ticket && (
              <InfoPill
                label="TICKET"
                value={
                  registration.ticket
                }
              />
            )}

          </div>

        </section>


        {/* =================================================
            PROGRESS
           ================================================= */}

        <section
          style={{
            background:
              "#0d1215",
            border:
              "1px solid #20282e",
            padding:
              "22px 24px",
            marginBottom: "18px",
          }}
        >

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "baseline",
              gap: "10px",
              marginBottom:
                "10px",
            }}
          >

            <div
              style={{
                color: "#87929a",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "8px",
                fontWeight: 800,
                letterSpacing:
                  ".12em",
              }}
            >
              COLLECTION PROGRESS
            </div>

            <div
              style={{
                color:
                  allGiven
                    ? "#b7ff00"
                    : "#f0b84b",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              {givenItems} / {totalItems}
            </div>

          </div>

          <div
            style={{
              height: "8px",
              background:
                "#20282e",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width:
                  `${progress}%`,
                background:
                  allGiven
                    ? "#b7ff00"
                    : "#f0b84b",
                transition:
                  "width .3s ease",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              marginTop: "10px",
              color: "#5f6a72",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize: "8px",
            }}
          >
            <span>
              {givenItems} GIVEN
            </span>

            <span>
              {pendingItems} PENDING
            </span>

          </div>

        </section>


        {/* =================================================
            PURCHASED MERCHANDISE
           ================================================= */}

        <section
          style={{
            marginBottom:
              "18px",
          }}
        >

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "baseline",
              marginBottom:
                "12px",
            }}
          >

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
              }}
            >

              <span
                style={{
                  color: "#b7ff00",
                  fontFamily:
                    '"SFMono-Regular", Consolas, monospace',
                  fontSize: "9px",
                  fontWeight: 800,
                }}
              >
                01
              </span>

              <h2
                style={{
                  margin: 0,
                  color: "#f4f7f8",
                  fontSize: "18px",
                  fontWeight: 600,
                  textTransform:
                    "uppercase",
                }}
              >
                Your Merchandise
              </h2>

            </div>

            <span
              style={{
                color: "#5f6a72",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "8px",
              }}
            >
              {totalItems} ITEMS
            </span>

          </div>


          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >

            {items.map(
              (item) => {

                const quantity =
                  quantityOf(item);

                const itemGiven =
                  givenCount(item) >=
                  quantity;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr auto",
                      gap: "15px",
                      alignItems: "center",
                      padding:
                        "19px 20px",
                      background:
                        itemGiven
                          ? "#0b120b"
                          : "#10100d",
                      border:
                        `1px solid ${
                          itemGiven
                            ? "#273b1c"
                            : "#403720"
                        }`,
                    }}
                  >

                    <div>

                      <div
                        style={{
                          color:
                            "#f4f7f8",
                          fontSize:
                            "17px",
                          fontWeight:
                            700,
                          textTransform:
                            "uppercase",
                          letterSpacing:
                            "-.01em",
                        }}
                      >
                        {item.item}
                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          gap:
                            "14px",
                          marginTop:
                            "8px",
                          color:
                            "#707c84",
                          fontFamily:
                            '"SFMono-Regular", Consolas, monospace',
                          fontSize:
                            "9px",
                        }}
                      >

                        <span>
                          QTY{" "}
                          <strong
                            style={{
                              color:
                                "#dce2e5",
                            }}
                          >
                            {quantity}
                          </strong>
                        </span>

                        {item.size && (
                          <span>
                            SIZE{" "}
                            <strong
                              style={{
                                color:
                                  "#dce2e5",
                              }}
                            >
                              {item.size}
                            </strong>
                          </span>
                        )}

                      </div>

                    </div>


                    <div
                      style={{
                        textAlign:
                          "right",
                      }}
                    >

                      <div
                        style={{
                          color:
                            itemGiven
                              ? "#b7ff00"
                              : "#f0b84b",
                          fontFamily:
                            '"SFMono-Regular", Consolas, monospace',
                          fontSize:
                            "9px",
                          fontWeight:
                            800,
                          letterSpacing:
                            ".08em",
                        }}
                      >
                        {itemGiven
                          ? "✓ GIVEN"
                          : "● PENDING"}
                      </div>

                      <div
                        style={{
                          marginTop:
                            "5px",
                          color:
                            "#505b62",
                          fontFamily:
                            '"SFMono-Regular", Consolas, monospace',
                          fontSize:
                            "7px",
                        }}
                      >
                        {itemGiven
                          ? "COLLECTED"
                          : "AWAITING PICKUP"}
                      </div>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </section>


        {/* =================================================
            QR
           ================================================= */}

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0,1fr) 310px",
            gap: "1px",
            background:
              "#20282e",
            border:
              "1px solid #20282e",
            marginBottom:
              "18px",
          }}
        >

          <div
            style={{
              padding:
                "28px",
              background:
                "#0d1215",
            }}
          >

            <div
              style={{
                color: "#b7ff00",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "9px",
                fontWeight: 800,
                letterSpacing:
                  ".13em",
                marginBottom:
                  "15px",
              }}
            >
              VERIFIED QR RECORD
            </div>

            <p
              style={{
                margin: 0,
                color: "#9ba5ab",
                fontSize: "13px",
                lineHeight: 1.7,
              }}
            >
              This QR code is linked to
              this registration and its
              merchandise allocation.
            </p>

            <div
              style={{
                marginTop:
                  "20px",
                padding:
                  "13px",
                background:
                  "#080b0d",
                border:
                  "1px solid #252e34",
                color:
                  "#69757d",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "8px",
                lineHeight: 1.7,
                wordBreak:
                  "break-all",
              }}
            >
              /claim/{token}
            </div>

          </div>


          <div
            style={{
              padding:
                "25px",
              background:
                "#f5f7f8",
              display:
                "flex",
              flexDirection:
                "column",
              alignItems:
                "center",
              justifyContent:
                "center",
            }}
          >

            <img
              src={qr}
              alt="V-TAPP claim QR"
              style={{
                display:
                  "block",
                width:
                  "220px",
                maxWidth:
                  "100%",
                height:
                  "auto",
              }}
            />

            <div
              style={{
                marginTop:
                  "10px",
                color:
                  "#15191c",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize:
                  "8px",
                fontWeight:
                  800,
                letterSpacing:
                  ".1em",
              }}
            >
              V-TAPP / CLAIM
            </div>

          </div>

        </section>


        {/* =================================================
            FINAL STATUS
           ================================================= */}

        <section
          style={{
            padding:
              "22px",
            background:
              allGiven
                ? "#0d170b"
                : "#15120b",
            border:
              `1px solid ${
                allGiven
                  ? "#304c1c"
                  : "#493d1e"
              }`,
            textAlign:
              "center",
          }}
        >

          <div
            style={{
              color:
                allGiven
                  ? "#b7ff00"
                  : "#f0b84b",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize:
                "10px",
              fontWeight:
                800,
              letterSpacing:
                ".14em",
            }}
          >
            {allGiven
              ? "ALL MERCHANDISE COLLECTED"
              : `${pendingItems} ITEM${
                  pendingItems === 1
                    ? ""
                    : "S"
                } REMAINING`}
          </div>

          <div
            style={{
              marginTop:
                "8px",
              color:
                "#69757d",
              fontSize:
                "11px",
            }}
          >
            {allGiven
              ? "Your V-TAPP merchandise collection is complete."
              : "Present this QR code to the V-TAPP merchandise distribution team."}
          </div>

        </section>


        {/* FOOTER */}

        <footer
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            gap:
              "15px",
            flexWrap:
              "wrap",
            marginTop:
              "25px",
            paddingTop:
              "15px",
            borderTop:
              "1px solid #1c2328",
            color:
              "#414b52",
            fontFamily:
              '"SFMono-Regular", Consolas, monospace',
            fontSize:
              "7px",
            letterSpacing:
              ".1em",
          }}
        >

          <span>
            VTAAP 2026
          </span>

          <span>
            SECURE MERCHANDISE CLAIM
          </span>

          <span>
            REGISTRATION #
            {registration.registration_id}
          </span>

        </footer>

      </div>
    </main>
  );
}


function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding:
          "8px 10px",
        background:
          "#080b0d",
        border:
          "1px solid #293137",
      }}
    >
      <span
        style={{
          color:
            "#59656d",
          fontFamily:
            '"SFMono-Regular", Consolas, monospace',
          fontSize:
            "7px",
          marginRight:
            "8px",
          letterSpacing:
            ".08em",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          color:
            "#dfe5e8",
          fontFamily:
            '"SFMono-Regular", Consolas, monospace',
          fontSize:
            "9px",
        }}
      >
        {value}
      </strong>
    </div>
  );
}
