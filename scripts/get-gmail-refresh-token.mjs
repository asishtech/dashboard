#!/usr/bin/env node
/*
 * Obtain a Gmail refresh token for registration.vtapp@vitap.ac.in.
 *
 * For when the Workspace admin will not allow App Passwords. OAuth is
 * a different, narrower grant: this asks only for gmail.send, it can
 * be revoked from the account without changing a password, and it
 * never puts a reusable credential in an environment variable.
 *
 * Run:
 *   node scripts/get-gmail-refresh-token.mjs <client-id> <client-secret>
 *
 * It opens a consent page, catches the redirect on localhost, and
 * prints the three variables to set. Nothing is written to disk and
 * nothing leaves your machine except the token exchange with Google.
 */

import http from "node:http";
import { spawn } from "node:child_process";

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;

const [clientId, clientSecret] = process.argv.slice(2);

if (!clientId || !clientSecret) {
  console.error(
    "Usage: node scripts/get-gmail-refresh-token.mjs <client-id> <client-secret>\n\n" +
      "Create the client at console.cloud.google.com:\n" +
      "  APIs & Services -> Credentials -> Create credentials\n" +
      "  -> OAuth client ID -> Web application\n" +
      `  Authorised redirect URI: http://localhost:${PORT}/callback`
  );
  process.exit(1);
}

/* The narrowest scope that can send mail. Not gmail.modify, not full. */
const SCOPE = "https://www.googleapis.com/auth/gmail.send";

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    /* Both are required or Google returns an access token with no
       refresh token, which works today and breaks in an hour. */
    access_type: "offline",
    prompt: "consent",
  });

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);

  if (url.pathname !== "/callback") {
    response.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  const done = (message) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      `<body style="font-family:system-ui;padding:40px">${message}</body>`
    );
  };

  if (error || !code) {
    done(`<h2>Denied</h2><p>${error ?? "no code returned"}</p>`);
    console.error(`\nConsent failed: ${error ?? "no code returned"}`);
    console.error(
      "\nIf this says access_denied or admin_policy_enforced, the\n" +
        "Workspace blocks this app. That needs IT, same as App Passwords."
    );
    server.close();
    process.exit(1);
  }

  try {
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    }).then((r) => r.json());

    if (!token.refresh_token) {
      done("<h2>No refresh token</h2><p>Check the terminal.</p>");
      console.error(
        "\nGoogle returned no refresh_token. This happens when the\n" +
          "account has already consented to this client: revoke it at\n" +
          "myaccount.google.com/permissions and run this again."
      );
      server.close();
      process.exit(1);
    }

    done("<h2>Done</h2><p>Copy the values from your terminal.</p>");

    console.log("\nSet these, and remove SMTP_PASSWORD:\n");
    console.log(`SMTP_USER=registration.vtapp@vitap.ac.in`);
    console.log(`SMTP_OAUTH_CLIENT_ID=${clientId}`);
    console.log(`SMTP_OAUTH_CLIENT_SECRET=${clientSecret}`);
    console.log(`SMTP_OAUTH_REFRESH_TOKEN=${token.refresh_token}`);
    console.log(
      "\nThe refresh token is a credential. Treat it like a password:" +
        "\nput it in Netlify's environment, not in the repository.\n"
    );
  } catch (exchangeError) {
    done("<h2>Token exchange failed</h2>");
    console.error("\nToken exchange failed:", exchangeError);
  }

  server.close();
});

server.listen(PORT, () => {
  console.log(
    `Sign in as registration.vtapp@vitap.ac.in when the browser opens.\n` +
      `If it does not, open this yourself:\n\n${authUrl}\n`
  );

  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  spawn(opener, [authUrl], { stdio: "ignore", detached: true }).unref();
});
