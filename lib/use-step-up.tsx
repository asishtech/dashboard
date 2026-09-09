"use client";

import { useCallback, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { TwoFactorModal, type TwoFactorStep } from "@/components/TwoFactorModal";

/*
 * Gate a sensitive action behind two-factor authentication.
 *
 * `ensure()` resolves true once the current session actually holds
 * AAL2 -- immediately, if it already does, or after walking the
 * caller through enrolling and/or entering a code. It resolves false
 * if they cancel. The server-side check in requireAal2() (lib/auth.ts)
 * is the real gate; this is what makes the client experience a modal
 * instead of a bare 403 the caller has no way to act on.
 *
 * Usage:
 *   const { ensure, modal } = useStepUp();
 *   async function save() {
 *     if (!(await ensure())) return;
 *     // ...the actual request...
 *   }
 *   return <>{modal}...</>;
 */
export function useStepUp() {
  const supabase = createSupabaseBrowser();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<TwoFactorStep>("verify");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const factorId = useRef("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  function reset() {
    setOpen(false);
    setCode("");
    setError("");
    setBusy(false);
    setQrCode("");
    setSecret("");
  }

  function settle(ok: boolean) {
    reset();
    resolver.current?.(ok);
    resolver.current = null;
  }

  const ensure = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      (async () => {
        const { data, error: aalError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        if (aalError) {
          resolve(false);
          return;
        }

        if (data.currentLevel === "aal2") {
          resolve(true);
          return;
        }

        if (data.nextLevel === "aal2") {
          /*
           * Enrolled, but this session has not proven it yet -- find
           * the verified factor to challenge.
           */
          const { data: factors } =
            await supabase.auth.mfa.listFactors();

          const totp = factors?.totp?.find(
            (f) => f.status === "verified"
          );

          if (!totp) {
            resolve(false);
            return;
          }

          factorId.current = totp.id;
          setStep("verify");
        } else {
          setStep("enroll");
        }

        resolver.current = resolve;
        setOpen(true);
      })();
    });
  }, [supabase]);

  async function startEnroll() {
    setBusy(true);
    setError("");

    const { data, error: enrollError } = await supabase.auth.mfa.enroll(
      { factorType: "totp" }
    );

    setBusy(false);

    if (enrollError) {
      setError(enrollError.message);
      return;
    }

    factorId.current = data.id;
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("enroll-confirm");
  }

  async function submitCode() {
    setBusy(true);
    setError("");

    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({
          factorId: factorId.current,
        });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factorId.current,
        challengeId: challenge.id,
        code: code.trim(),
      });

      if (verifyError) throw verifyError;

      settle(true);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error ? err.message : "That code did not work"
      );
    }
  }

  const modal = open ? (
    <TwoFactorModal
      step={step}
      qrCode={qrCode}
      secret={secret}
      code={code}
      error={error}
      busy={busy}
      onCodeChange={setCode}
      onStartEnroll={startEnroll}
      onSubmit={submitCode}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { ensure, modal };
}
