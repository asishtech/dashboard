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

Locally in `.env.local`, and on AWS Amplify under
**App settings → Environment variables**. Redeploy afterwards: saving
alone does not rebuild, and `amplify.yml` is what carries these into
the SSR runtime — Amplify hands console variables to the build only.

```
SMTP_USER=tickets@vtapp.co.in
SMTP_PASSWORD=<the 16 characters, no spaces>
MAIL_FROM=tickets@vtapp.co.in
MAIL_FROM_NAME=V-TAPP 2026
ALERT_EMAIL=<your own address, for sync failures>
NEXT_PUBLIC_APP_URL=https://vtapp.co.in
```

`SMTP_USERNAME`, `SMTP_FROM_EMAIL` and `SMTP_FROM_NAME` also work, as
aliases for the first, third and fourth. Only `SMTP_USER` (or its
alias) and `SMTP_PASSWORD` are required; the rest have defaults.

`SMTP_HOST` and `SMTP_PORT` default to `smtp.gmail.com` and `587`.

`NEXT_PUBLIC_APP_URL` must match the deployed origin, with no trailing
slash. It is what the QR codes inside emails point at, and it is also
the fallback origin for redirects when the CDN does not rewrite the
Host header — get it wrong and sign-in breaks too.

Until `SMTP_USER` and `SMTP_PASSWORD` are both set, nothing sends:
every send returns `skipped` and the app behaves as it does today.

## 3. Run the migration

Run in order:

1. `supabase/email-log.sql` — creates `email_log`, which is what stops
   a re-sync mailing 900 people a second copy of their pass. The
   guarantee is a partial unique index, not application code.
2. `supabase/mail-controls.sql` — resending, and the automatic-send
   switch.
3. `supabase/person-passes.sql` — the queue grouped by person.

## 4. Redeploy, then send one

`/admin/notifications` → **Preview next batch** → check the list →
**Send** → confirm one actually arrives before doing the rest.

## What sends, and when

| Mail | Trigger | Volume |
|---|---|---|
| Registration passes (PDF) | An admin presses Send | Batches of 20 people |
| Collection receipt | Automatic, on the last item handed over | One per buyer |
| Sync failure alert | Automatic, to `ALERT_EMAIL` | Throttled to 1/hour |

One email per person, not per registration. Everything somebody holds
arrives as a single PDF, one page per pass, each with its own QR. That
is 917 emails rather than 1,408 across the fest -- and on a trial
account capped near 500 a day, those 491 are a whole day of sending.

Registration passes are **not** wired to the sync by default. Twelve hundred
emails to real students cannot be recalled, so that stays a deliberate
press with the queue and a preview in front of you.

## Limits

Set by `MAIL_DAILY_CAP`, default 1800. The app refuses to cross it,
because Gmail locks the account for 24 hours if you do — which
mid-fest means the remaining passes never arrive.
`/admin/notifications` shows how much is left.

The number to use depends on the plan, and the gap is large:

| Account | Real ceiling | Set |
|---|---|---|
| Workspace, paid | ~2,000/day | `1800` |
| Workspace, **free trial** | ~500/day | `400` |

**A trial is the dangerous case.** Sending limits are *not* raised
during a trial, and converting to paid is not enough on its own:
Google raises them only once the domain has cumulatively paid at least
**$100 USD**, and then it can take **up to 75 days** after hitting
that threshold. So on a 14-day Business Starter trial, 2,000/day is
not reachable at any price in the near term, and a cap of 1800 is more
than three times the real ceiling.

<https://support.google.com/a/answer/166852>

At 400/day, 917 pending emails (1,408 passes) take three days.

If you need the whole queue out in an afternoon, the answer is not a
bigger cap, it is a different sender. Amazon SES speaks SMTP, so it
needs **no code change** — only different values for `SMTP_HOST`,
`SMTP_USER` and `SMTP_PASSWORD`:

```
SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
SMTP_PORT=587
```

Verify `vtapp.co.in` in SES with the DKIM records (this does not
disturb the MX records pointing at Google, so mail still *arrives* in
Workspace), then request production access — new accounts start in a
sandbox capped at 200/day to verified addresses only, and the request
usually clears within a day. Roughly $0.10 per thousand messages.

Batches are 20 because Gmail takes roughly a second per message and a
serverless function is killed well before a thousand of them finish.
At 917 pending emails that is 46 presses, or 20 a day against a 400
cap — ask if you want a "send until today's allowance is used" mode.

## If mail stops arriving

- `/admin/notifications` shows failures in the last 24 hours.
- `select * from email_log where status = 'failed' order by sent_at desc limit 20;`
- `535-5.7.8 Username and Password not accepted` means the App Password
  was revoked, or 2-Step Verification was turned off.
- A failed send stays in the queue and retries on the next batch. A
  successful one can never be sent twice.
