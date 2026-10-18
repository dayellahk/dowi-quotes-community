# Install your own Dowi Quotes

## 1. Prepare the server

Use a maintained Linux host, Docker Engine and Compose v2. Start with 1 vCPU and 1–2 GB RAM for evaluation; storage and backup capacity depend on attachments. Keep SSH restricted and expose only required services. Docker installation is managed by your server provider.

Choose a hostname such as `quotes.example.com`. Point its A/AAAA record at the server, or use a CNAME to an origin hostname you control. Only publish AAAA when IPv6 reaches this host. Allow inbound TCP 80 and 443. Caddy obtains and renews HTTPS certificates; its data volume must persist.

## 2. Configure

Clone this repository, then run `node scripts/setup.mjs` with Node 22.13+. Without host Node, run:

```sh
docker run --rm -it -v "$PWD:/work" -w /work node:22-bookworm-slim node scripts/setup.mjs
```

The script asks for hostname and administrator email, generates a long password and encryption key, and creates `.env` without overwriting an existing file. On Linux, set file ownership back to your operator account if Docker created it as root. Keep `.env` private and back it up securely.

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Open `https://YOUR_HOST/login`. Use `OWNER_EMAIL` and `INTERNAL_PASSWORD` from `.env`. After initial sign-in, change the password in Account. Changing `INTERNAL_PASSWORD` later does not reset an existing owner; use account password management.

## 3. Company and staff

Set company name, logo, contact information, currency, tax and terms. Each company is an independent tenant with its own membership. A user can belong to several companies without sharing their data. Invite each staff email through Account, set its initial password and select its role; share credentials securely. Staff can change their own password. Removal revokes access to that company.

`WEB_USER_LIMIT` is an operator-configured capacity, not a paid license. Microsoft directory synchronization is not automatic. For the paid official app, also assign the same staff email to the company's Dowi license account; see [IOS.md](IOS.md).

## 4. Public quote pages and email

Optional two-step verification is available in Account. Add the displayed key to an authenticator, confirm its six-digit code and store the one-time recovery codes securely. Enabling it revokes other sessions and disables password-only HTTP Basic access for that account. Restore the original `TOKEN_ENCRYPTION_KEY` along with the database when recovering a server.

Use a publicly reachable HTTPS hostname for links sent to external customers. Private-only DNS or a LAN address works only for visitors on that network. Open tracking runs on this server and records in its database. No separate tracking domain is required. Previewing as a staff user must not be treated as a customer view.

SMTP is optional. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`; port 587 uses STARTTLS and port 465 uses implicit TLS. Configure SPF/DKIM/DMARC with your mail provider. This application sends mail; it is not an incoming mail server. Test with a mailbox you control before emailing customers.

Production webhooks accept public HTTPS destinations and validate DNS when connecting. For a deliberately trusted internal integration, the server operator may set `WEBHOOK_ALLOW_PRIVATE=true`; this permits company administrators to target internal services. Leave it unset when hosting untrusted company tenants. Apply per-client request limits at your reverse proxy; the application uses the socket peer and does not trust forwarded IP headers.

For public forms, use your own Cloudflare Turnstile site/secret keys and add your exact hostname to both the Cloudflare widget configuration and `TURNSTILE_HOSTNAMES`; set `TURNSTILE_REQUIRED=true`. Complete a real human browser submission after configuration. Native/staff API calls use authentication instead of a customer challenge.

Apply environment changes with `docker compose up -d --force-recreate quotes`.

## 5. Storage and backups

By default the `quotes-data` Docker volume holds SQLite and uploaded files. It survives container recreation; **do not run `docker compose down -v`** unless deliberately deleting the installation.

For a complete local backup, stop writes, archive the volume, then restart:

```sh
mkdir -p backups
chmod 700 backups
docker compose stop quotes
docker compose run --rm --no-deps --user root --entrypoint tar quotes -czf - -C /app/data . > "backups/data-$(date +%Y%m%d-%H%M%S).tar.gz"
docker compose start quotes
```

Encrypt the archive and keep an off-server copy, along with `.env` and the exact application version. A per-company JSON export in the UI is useful for portability but does not replace a full backup of users, authentication and integrations. Configure your own backup schedule; none is automatically installed.

Restore to an isolated empty volume first. Stop the service, extract the archive into `/app/data` with the container stopped, restore ownership for UID 1000, and use the original encryption key. Disable outgoing SMTP/webhooks before rehearsal to avoid resending pending work. Test database integrity, file downloads, login and tenant access before replacing production. The `restore-backup.mjs` and `restore-cloud-backup.mjs` utilities target their documented JSON/encrypted formats, not these tar archives.

Optional BytePlus TOS uses your bucket and credentials; see [integrations](INTEGRATIONS.md). Your provider bills storage, requests and transfer. The community edition includes no hosted storage allowance.

## 6. Upgrade

Back up first. Review the changelog, test a copy of data, then pull a chosen release and run `docker compose up -d --build`. Reverting code alone may not reverse a schema change; retain the pre-upgrade data snapshot. This initial release does not promise zero-downtime migrations.

## Existing reverse proxy / native Node

You can use your own proxy instead of Caddy. Forward to port 3000 and keep it inaccessible publicly. Set `PUBLIC_URL` and `WEB_URL` to the same externally reachable HTTPS origin. With native Node, change `DATA_DIR` from `/app/data` to a persistent directory owned by your service user, set `HOST=127.0.0.1`, then run `npm ci --omit=dev` and `npm start` under a service manager. Keep `AUTH_MODE=local` or deliberately configure OIDC; never disable authentication on an exposed server.

## Diagnose

`docker compose logs --tail=100 quotes caddy` shows startup and request failures. `/healthz` reports process health, not a full delivery test. Inspect disk capacity and backup results. Redact passwords, customer records and link tokens before sharing logs. Contact `support@dayella.co` for official app access, or use GitHub issues for reproducible community bugs.
