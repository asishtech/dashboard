import { supabaseAdmin } from "./supabase";

/* Key in app_settings. See supabase/mail-controls.sql. */
export const AUTO_SEND_KEY = "mail_auto_send";

export type AutoSend = {
  enabled: boolean;
  /*
   * When it was switched on.
   *
   * Automatic sending only covers people who registered at or after
   * this moment. Without it, ticking the box with 1,241 unsent
   * registrations already in the table would mail the entire backlog
   * -- which is the accident the manual button exists to prevent.
   *
   * Cleared when switched off, so turning it on again next week does
   * not retroactively capture everyone in between.
   */
  enabledAt: string | null;
};

export const AUTO_SEND_OFF: AutoSend = {
  enabled: false,
  enabledAt: null,
};

/*
 * Off is the safe answer to every failure here, including "the
 * migration has not run yet". Defaulting the other way would mail
 * students because a query timed out.
 */
export async function readAutoSend(): Promise<AutoSend> {
  const { data, error } = await supabaseAdmin().rpc("get_setting", {
    p_key: AUTO_SEND_KEY,
  });

  if (error || !data) return AUTO_SEND_OFF;

  const value = data as Partial<AutoSend>;

  return {
    enabled: value.enabled === true,
    enabledAt: value.enabledAt ?? null,
  };
}

export async function writeAutoSend(enabled: boolean) {
  const value: AutoSend = enabled
    ? { enabled: true, enabledAt: new Date().toISOString() }
    : AUTO_SEND_OFF;

  const { error } = await supabaseAdmin().rpc("set_setting", {
    p_key: AUTO_SEND_KEY,
    p_value: value,
  });

  return { value, error };
}
