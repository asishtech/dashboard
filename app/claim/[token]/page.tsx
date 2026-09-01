import QRCode from "qrcode";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import RoleSwitcher from "@/components/RoleSwitcher";
import {
  ArrowLeftIcon,
  BoxIcon,
  LockIcon,
} from "@/components/icons";

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

  /*
   * Any granted role counts here, not the active one. This is a
   * one-off page reached by scanning, and a volunteer who happens to
   * be viewing as a buyer should still be able to do their job at
   * the counter.
   */
  /*
   * Only the primary role is read here. It is the highest-privilege
   * one the account holds, so an admin or volunteer still passes;
   * selecting `roles` would fail outright wherever the multi-role
   * migration has not run.
   */
  const heldRoles: string[] = profile?.role ? [profile.role] : [];

  const isPrivileged =
    profile?.active === true &&
    (heldRoles.includes("admin") ||
      heldRoles.includes("volunteer"));

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
      <main className="app center-screen">
        <div className="center-card center-card-wide">
          <div className="brand-mark">
            <LockIcon size={24} />
          </div>

          <h1 className="page-title">QR access denied</h1>

          <p className="page-subtitle">
            This QR code belongs to a different Google account.
          </p>

          <p className="help mt-6">
            Sign in with the Google account you used when buying the
            merchandise.
          </p>

          {/*
            * Two ways out. Signing out is the fix when you are in the
            * wrong Google account, but someone who simply opened a
            * colleague's link should not have to do that to get back
            * to their own.
            */}
          <Link
            href="/buyer"
            className="btn btn-primary btn-block mt-8"
          >
            <ArrowLeftIcon size={14} />
            My merchandise
          </Link>

          <a href="/login" className="btn btn-block mt-4">
            Switch account
          </a>
        </div>
      </main>
    );
  }

  const items =
    (registration.items ?? []) as ClaimItem[];

  const totalItems = items.reduce(
    (sum, item) => sum + quantityOf(item),
    0
  );

  const givenItems = items.reduce(
    (sum, item) =>
      sum + Math.min(givenCount(item), quantityOf(item)),
    0
  );

  const pendingItems = Math.max(totalItems - givenItems, 0);

  const progress =
    totalItems > 0
      ? Math.round((givenItems / totalItems) * 100)
      : 0;

  const allGiven = totalItems > 0 && pendingItems === 0;

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

  const backHref = isPrivileged ? "/volunteer/scan" : "/buyer";
  const backLabel = isPrivileged ? "Scan another" : "My merchandise";

  const qr = await QRCode.toDataURL(
    `${origin}/claim/${token}`,
    {
      width: 420,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#08090b", light: "#ffffff" },
    }
  );

  return (
    <main className="app">
      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / 2026</span>

            <h1 className="page-title">Collection Pass</h1>

            <p className="page-subtitle">
              Show this to a volunteer at the merchandise counter.
            </p>
          </div>

          <div className="header-actions">
            <span
              className={`badge ${
                allGiven ? "badge-success" : "badge-warning"
              }`}
            >
              {allGiven ? "Collected" : `${pendingItems} to collect`}
            </span>

            {/*
              * A real destination rather than history.back(): this page
              * is often opened straight from a QR scan, where there is
              * no history to go back to. Staff arrived by scanning, so
              * they go to the scanner; a buyer came from their own
              * orders.
              */}
            {/*
              * Full size, not btn-sm. Unlike the admin screens this
              * page is opened on a phone at the counter, so the one
              * navigation control on it gets a proper 46px target.
              */}
            <Link href={backHref} className="btn btn-ghost">
              <ArrowLeftIcon size={15} />
              {backLabel}
            </Link>

            <RoleSwitcher />
          </div>
        </header>


        <section className="panel mb-8">
          <div className="panel-body">
            <span className="qr-frame">
              {/* Generated server-side as a data URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`Collection QR code for registration ${registration.registration_id}`}
                width={420}
                height={420}
              />
            </span>

            <dl className="kv mt-6">
              <dt>Name</dt>
              <dd>{registration.name}</dd>

              <dt>Registration</dt>
              <dd className="mono">
                #{registration.registration_id}
              </dd>

              <dt>Ticket</dt>
              <dd>{registration.ticket ?? "Merchandise"}</dd>
            </dl>
          </div>

          <div className="panel-footer">
            <div className="meter">
              <div className="meter-head">
                <span className="meter-label">Collected</span>

                <span className="meter-value">
                  {givenItems} / {totalItems}
                </span>
              </div>

              <div
                className="meter-track"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Items collected"
              >
                <div
                  className="meter-fill meter-fill-success"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </section>


        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Your merchandise</h2>

              <p className="panel-subtitle">
                {totalItems} item{totalItems === 1 ? "" : "s"} in this
                order
              </p>
            </div>
          </div>

          <div className="panel-body stack-tight stack">
            {items.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <BoxIcon size={22} />
                </div>

                <p className="empty-title">Nothing to collect</p>

                <p className="empty-body">
                  This registration has no merchandise attached.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const quantity = quantityOf(item);
                const itemGiven = givenCount(item) >= quantity;

                return (
                  <div
                    key={item.id}
                    className={`scan-item${
                      itemGiven ? " scan-item-given" : ""
                    }`}
                  >
                    <div>
                      <div className="scan-item-name">
                        {item.item}
                      </div>

                      <div className="scan-item-meta">
                        {item.size ? `Size ${item.size}` : "One size"}
                        {quantity > 1 ? ` · Qty ${quantity}` : ""}
                      </div>
                    </div>

                    <span
                      className={`badge ${
                        itemGiven ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {itemGiven ? "Collected" : "Pending"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
