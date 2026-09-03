# Email setup

Mail is sent as `tickets@vtapp.co.in` through Google Workspace, using
an App Password.

`vtapp.co.in` already routes MX to Google and publishes
`v=spf1 include:_spf.google.com`, so mail sent through Gmail is
SPF-aligned. **No DNS changes are needed.**

## 1. Create the App Password

1. Sign in as `tickets@vtapp.co.in`.
2. Turn on **2-Step Verification** —
   <https://myaccount.google.com/signinoptions/two-step-verification>.
   App Passwords do not appear as an option until this is on.
3. Go to <https://myaccount.google.com/apppasswords>, create one named
   `V-TAPP Dashboard`, and copy the 16 characters. Paste it without
   the spaces Google displays.

If that page says the setting is not available, the Workspace admin
has disabled App Passwords for the domain. Since this is your own
domain, you can re-enable it: Admin console → Security →
Authentication → 2-Step Verification → allow App Passwords.

## 2. Set the environment variables

Locally in `.env.local`, and on Netlify under
**Site settings → Environment variables**:

```
SMTP_USER=tickets@vtapp.co.in
SMTP_PASSWORD=<the 16 characters, no spaces>
MAIL_FROM=tickets@vtapp.co.in
MAIL_FROM_NAME=V-TAPP 2026
ALERT_EMAIL=<your own address, for sync failures>
NEXT_PUBLIC_APP_URL=https://vtapp.co.in
```

`SMTP_HOST` and `SMTP_PORT` default to `smtp.gmail.com` and `587`.

`NEXT_PUBLIC_APP_URL` must match the deployed origin, with no trailing
slash. It is what the QR codes inside emails point at, and it is also
the fallback origin for redirects when the CDN does not rewrite the
Host header — get it wrong and sign-in breaks too.

Until `SMTP_USER` and `SMTP_PASSWORD` are both set, nothing sends:
every send returns `skipped` and the app behaves as it does today.

## 3. Run the migration

`supabase/email-log.sql`. It creates `email_log`, which is what stops a
re-sync mailing 1,200 people a second copy of their pass. The
guarantee is a partial unique index, not application code.

## 4. Redeploy, then send one

`/admin/notifications` → **Preview next batch** → check the list →
**Send** → confirm one actually arrives before doing the rest.

## What sends, and when

| Mail | Trigger | Volume |
|---|---|---|
| Registration pass + QR | An admin presses Send | Batches of 20 |
| Collection receipt | Automatic, on the last item handed over | One per buyer |
| Sync failure alert | Automatic, to `ALERT_EMAIL` | Throttled to 1/hour |

Registration passes are **not** wired to the sync. Twelve hundred
emails to real students cannot be recalled, so that stays a deliberate
press with the queue and a preview in front of you.

## Limits

Google Workspace allows about 2,000 messages a day. The app stops at
1,800 (`DAILY_CAP` in `lib/mailer.ts`) so a burst cannot lock the
account out for 24 hours mid-fest. `/admin/notifications` shows how
much of the allowance is left.

Batches are 20 because Gmail takes roughly a second per message and a
Netlify function is killed at 26 seconds. At 1,214 registrations that
is about 60 presses — tell me if you want a "send until empty" mode.

## If mail stops arriving

- `/admin/notifications` shows failures in the last 24 hours.
- `select * from email_log where status = 'failed' order by sent_at desc limit 20;`
- `535-5.7.8 Username and Password not accepted` means the App Password
  was revoked, or 2-Step Verification was turned off.
- A failed send stays in the queue and retries on the next batch. A
  successful one can never be sent twice.
