# Email setup

Mail is sent as `registration.vtapp@vitap.ac.in`. Three ways to
authenticate; the code takes any of them and only environment variables
change.

| Route | Needs | Sender address |
|---|---|---|
| OAuth2 refresh token | a Google Cloud project | the real one |
| Transactional provider | an account, plus DNS for the real address | see below |
| App Password | 2SV on the account | the real one |

**IT has declined App Passwords for this domain**, so that route is at
the bottom in case the decision changes. Start with OAuth2.

## 1. OAuth2 (try this first)

OAuth is a narrower grant than an App Password, not a workaround for
it: this asks only for `gmail.send`, it is revocable from the account
without changing a password, and no reusable password is stored. Worth
saying plainly if you have to go back to IT -- it is the more
conservative request of the two.

1. At <https://console.cloud.google.com>, create a project.
2. **APIs & Services → Library**, enable **Gmail API**.
3. **OAuth consent screen** → Internal, if offered.
4. **Credentials → Create credentials → OAuth client ID → Web
   application**, redirect URI `http://localhost:53682/callback`.
5. Run this, signing in as `registration.vtapp@vitap.ac.in`:

   ```bash
   node scripts/get-gmail-refresh-token.mjs <client-id> <client-secret>
   ```

   It opens consent, catches the redirect, and prints the variables.

If consent fails with `admin_policy_enforced` or `access_denied`, the
Workspace blocks third-party apps too and this route is closed the same
way the first was. Use a provider instead.

## 2. Transactional provider (no Google permission at all)

Resend, Brevo and SendGrid all speak SMTP, so **this needs no code
change** -- point the existing variables at them:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=<api key>
```

The catch is the sender address. Sending *as* `@vitap.ac.in` needs SPF
and DKIM records on the university's DNS. That is a smaller ask than
account credentials -- it grants access to nothing -- but it is still
an ask. Without it, send from a domain you control, set `MAIL_FROM` to
that, and replies still go wherever you point them.

## 3. App Password (currently refused)

Turn on 2-Step Verification, then create one at
<https://myaccount.google.com/apppasswords> and set `SMTP_PASSWORD`.
Nothing else differs.

## 4. Set the environment variables

Locally in `.env.local`, and on Netlify under
**Site settings → Environment variables**:

```
SMTP_USER=registration.vtapp@vitap.ac.in
MAIL_FROM=registration.vtapp@vitap.ac.in
ALERT_EMAIL=<where sync failures should go>
NEXT_PUBLIC_APP_URL=https://vtapp-dashboard.netlify.app

# then one credential, not both:
SMTP_OAUTH_CLIENT_ID=...
SMTP_OAUTH_CLIENT_SECRET=...
SMTP_OAUTH_REFRESH_TOKEN=...
# or
SMTP_PASSWORD=<16-character App Password, no spaces>
```

`SMTP_HOST` and `SMTP_PORT` default to `smtp.gmail.com` and `587`.

Until `SMTP_USER` and one credential are set, nothing sends: every send
returns `skipped` and the app runs exactly as it does today.

## 5. Run the migration

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
