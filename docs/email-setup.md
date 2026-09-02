# Email setup

Mail is sent from `registration.vtapp@vitap.ac.in` over Gmail SMTP,
using an App Password. This needs access to that account only — no
Workspace admin console, no DNS changes on `vitap.ac.in`.

## 1. Create the App Password

1. Sign in as `registration.vtapp@vitap.ac.in`.
2. Turn on **2-Step Verification** at
   <https://myaccount.google.com/signinoptions/two-step-verification>.
   App Passwords do not exist as an option until this is on.
3. Go to <https://myaccount.google.com/apppasswords>, create one named
   `V-TAPP Dashboard`, and copy the 16-character value.

If the App Passwords page says the option is not available, the
Workspace admin has disabled it for the domain. That is the one thing
that needs IT: ask them to allow App Passwords for this account, or to
set up an SMTP relay instead.

## 2. Set the environment variables

Locally in `.env.local`, and on Netlify under
**Site settings → Environment variables**:

```
SMTP_USER=registration.vtapp@vitap.ac.in
SMTP_PASSWORD=<the 16-character App Password, no spaces>
MAIL_FROM=registration.vtapp@vitap.ac.in
ALERT_EMAIL=<where sync failures should go>
NEXT_PUBLIC_APP_URL=https://vtapp-dashboard.netlify.app
```

`SMTP_HOST` and `SMTP_PORT` default to `smtp.gmail.com` and `587`.

Until `SMTP_USER` and `SMTP_PASSWORD` are both set, nothing sends: every
send returns `skipped` and the app runs exactly as it does today.

## 3. Run the migration

`supabase/email-log.sql`. It creates `email_log`, which is what stops a
re-sync mailing several hundred people a second copy of their pass.

## What sends, and when

| Mail | Trigger | Volume |
|---|---|---|
| Registration pass + QR | An admin presses **Send** on `/admin/notifications` | Batches of 20 |
| Collection receipt | Automatic, when a registration's last item is marked given | One per buyer |
| Sync failure alert | Automatic, to `ALERT_EMAIL` | Throttled to 1/hour |

Confirmations are **not** wired to the sync. Several hundred emails to
real students cannot be recalled, so that decision stays a deliberate
press with the queue and a preview in front of you.

## Limits

Google Workspace allows about 2,000 messages a day. The app stops at
1,800 (`DAILY_CAP` in `lib/mailer.ts`) so a burst cannot get the account
locked out for 24 hours mid-fest. `/admin/notifications` shows how much
of the allowance is left.

Batches are 20 because Gmail takes roughly a second per message and a
Netlify function is killed at 26 seconds.

## If mail stops arriving

- Check `/admin/notifications` for failures in the last 24 hours.
- `select * from email_log where status = 'failed' order by sent_at desc limit 20;`
- `535-5.7.8 Username and Password not accepted` means the App Password
  was revoked or the account's 2-Step Verification was turned off.
- A failed send stays in the queue and is retried on the next batch. A
  successful one can never be sent twice — that is enforced by a unique
  index, not by application code.
