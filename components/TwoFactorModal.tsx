"use client";

import { AlertIcon, LockIcon } from "@/components/icons";

export type TwoFactorStep = "verify" | "enroll" | "enroll-confirm";

/*
 * The three states a step-up can be in:
 *
 *   verify         -- already enrolled, just needs this session to
 *                      prove it holds the authenticator.
 *   enroll         -- never enrolled. The intro screen, one button.
 *   enroll-confirm -- enroll() has returned a QR code and secret;
 *                      waiting for the first code to prove it was
 *                      scanned correctly before it counts as set up.
 */
export function TwoFactorModal({
  step,
  qrCode,
  secret,
  code,
  error,
  busy,
  onCodeChange,
  onStartEnroll,
  onSubmit,
  onCancel,
}: {
  step: TwoFactorStep;
  qrCode: string;
  secret: string;
  code: string;
  error: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onStartEnroll: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="two-factor-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal-card">
        <div className="brand-mark">
          <LockIcon size={22} />
        </div>

        {step === "enroll" && (
          <>
            <h2 id="two-factor-title" className="modal-title">
              Set up two-factor authentication
            </h2>

            <p className="modal-body">
              This action needs a second step. Set up an authenticator
              app once (Google Authenticator, Authy, or similar) and
              you will not be asked to enroll again.
            </p>

            {error && (
              <div className="banner banner-danger mb-6" role="alert">
                <AlertIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onStartEnroll}
                disabled={busy}
              >
                {busy && <span className="btn-spinner" />}
                {busy ? "Starting..." : "Set up now"}
              </button>
            </div>
          </>
        )}

        {step === "enroll-confirm" && (
          <>
            <h2 id="two-factor-title" className="modal-title">
              Scan this code
            </h2>

            <p className="modal-body">
              Scan with your authenticator app, then enter the 6-digit
              code it shows to confirm.
            </p>

            {qrCode && (
              <div className="modal-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="Authenticator setup QR code" />
              </div>
            )}

            {secret && (
              <code className="modal-secret">{secret}</code>
            )}

            <label className="sr-only" htmlFor="two-factor-code">
              6-digit code
            </label>

            <input
              id="two-factor-code"
              className="input modal-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) =>
                onCodeChange(event.target.value.replace(/\D/g, ""))
              }
              disabled={busy}
              autoFocus
            />

            {error && (
              <div className="banner banner-danger mb-6" role="alert">
                <AlertIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onSubmit}
                disabled={busy || code.length !== 6}
              >
                {busy && <span className="btn-spinner" />}
                {busy ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </>
        )}

        {step === "verify" && (
          <>
            <h2 id="two-factor-title" className="modal-title">
              Verify to continue
            </h2>

            <p className="modal-body">
              Enter the 6-digit code from your authenticator app.
            </p>

            <label className="sr-only" htmlFor="two-factor-code">
              6-digit code
            </label>

            <input
              id="two-factor-code"
              className="input modal-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) =>
                onCodeChange(event.target.value.replace(/\D/g, ""))
              }
              disabled={busy}
              autoFocus
            />

            {error && (
              <div className="banner banner-danger mb-6" role="alert">
                <AlertIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onSubmit}
                disabled={busy || code.length !== 6}
              >
                {busy && <span className="btn-spinner" />}
                {busy ? "Verifying..." : "Verify"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
