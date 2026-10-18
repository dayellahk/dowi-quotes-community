# Optional integrations

The community server runs with local accounts and local file storage. Every integration below uses credentials supplied by the operator. Never commit `.env` or keys.

## SMTP / Microsoft / Google

SMTP is the simplest self-hosted sending path; see INSTALL.md. In `AUTH_MODE=local`, outgoing quote emails use SMTP. For delegated Microsoft/Google sending use `AUTH_MODE=oidc` and register your own OAuth apps; SSO alone does not grant send-mail consent.

Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; callback `https://YOUR_HOST/auth/google/callback`.
Microsoft: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (directory UUID); callback `https://YOUR_HOST/auth/microsoft/callback`.

Allow the exact callbacks at the provider. Add members to the company before sign-in. In Account & mailboxes, explicitly connect the desired mailbox and consent to sending. Each provider controls verification, consent and delivery limits. The app does not provide a shared SMTP service.

## Xero: manual draft invoice

Register a Xero OAuth app you control; set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`. Use `https://YOUR_HOST/auth/xero/callback`. Connect a Xero organisation from company settings and choose the account/tax mappings.

An administrator explicitly requests a draft invoice from an accepted quote. The request includes the quote number in Reference and its public link. It does not automatically invoice every accepted quote, email invoices, collect payments or silently synchronise later edits. Invoice unlink/cancellation actions are explicit and depend on the Xero invoice status. Check Xero before retrying an uncertain request; the implementation records request state to avoid duplicates. Xero subscriptions, API access and limits are your responsibility.

## MCP for assistants

Endpoint: `https://YOUR_HOST/mcp`. Create a company-scoped token in Settings, or use the supported OAuth flow with a compatible client. Treat tokens as passwords. Grant the narrowest scopes, revoke unused tokens, and review draft/edit proposals in Dowi Quotes. Tools operate within the authenticated member's tenant and permissions. AI models or chat subscriptions are not bundled with this repository. Client-specific compatibility and approval policies vary.

## Own hostname / additional company domains

The Docker setup serves one operator-owned hostname through Caddy; it does not need a Dowi CNAME target or a Premium purchase. Set `PUBLIC_URL` to that origin. For several independent installations, use separate volumes, origins and configuration.

Optional automatic per-company domain provisioning uses **your own Cloudflare for SaaS setup**, with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_SAAS_TARGET`. Without those settings, the domain provisioning UI remains unavailable, while the server's primary hostname works. Customer domain routing is bound to its configured company and rejects another company's quote. Configure TLS and Turnstile hostnames for every enabled public hostname.

## BytePlus TOS

Set `TOS_ENDPOINT`, `TOS_REGION`, `TOS_BUCKET`, `TOS_ACCESS_KEY_ID`, `TOS_SECRET_ACCESS_KEY`; optionally `TOS_PREFIX` and `TOS_FORCE_PATH_STYLE`. Use a private bucket, minimum necessary permissions and a separate prefix/bucket per installation. New uploads go to your bucket; switching configuration does not automatically migrate existing local files.

For encrypted whole-server cloud backups, additionally set a base64 32-byte `BACKUP_ENCRYPTION_KEY`, keep it separately, and run `node --env-file=.env scripts/cloud-backup.mjs`. All referenced files must already be in TOS. The script retains seven daily and four weekly objects; schedule and verify it yourself. Keep credentials and keys available for recovery.

## Exchange rates / webhooks

The reference exchange-rate lookup uses Frankfurter. It fetches the latest available published rate, not a continuously traded quote; manual input is available. Confirm your commercial conversion rate before issuing a quote.

Webhooks can notify your own HTTPS endpoint of quote activity. Configure signing and verify signatures on your receiver; retries can produce duplicate events, so deduplicate event IDs. Do not point hooks at untrusted destinations. No external hook is configured by default.

## Webhook receiver headers (next community revision)

Delivery headers are `X-Dowi-Quotes-Event`, `X-Dowi-Quotes-Delivery` and `X-Dowi-Quotes-Signature`. When upgrading from 0.1.0, update your receiver to these names. Verify the `sha256=` signature using HMAC-SHA256 and the exact raw request body before parsing. Payload contents and retry behavior are unchanged.
