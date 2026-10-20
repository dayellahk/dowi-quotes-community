# Changelog

## 0.1.3 — Source-archive hygiene — 2026-10-20

- Extended the release audit to reject literal OpenAI/Anthropic-style `sk-` keys, xAI `xai-` keys, Google `AIza` keys, and named API-key environment variables for common AI providers.
- Reject every literal `http(s)` URL on `dowisuite.com`, `dayella.co`, or their subdomains across all release files, not only runtime code. Support email addresses remain allowed.
- Added fragment-based regression fixtures for literal AI keys, provider environment variables and hosted SaaS URLs so the tests do not contain prohibited values themselves.
- Updated the Community website and release documentation for self-host-only installation. Operator-configured external service endpoints remain supported without shipping proprietary Dowi endpoints or model-provider credentials.

## 0.1.2 — Sanitized source distribution — 2026-10-18

- Hardened attachment caching and recovery against file races and symbolic links; login cache identifiers now use a random per-process HMAC key.
- Created the dedicated `dowi-quotes-community` source project with no inherited private history.
- Hardened existing-account invitations, production webhook destinations and DNS handling, malformed request processing, browser security policies and resistance to spoofed client-IP rate-limit bypasses. Added regression coverage, pinned security workflows, dependency auditing, CodeQL, Gitleaks and Dependabot configuration.
- Ported optional authenticator-based two-step verification, encrypted setup secrets, single-use recovery codes and password-only Basic-auth protection from the current application.
- Added a loopback-only local setup with generated individual credentials and fictional demonstration records. Production setup keeps an empty initial workspace.
- Added an explicit source-only release packager, sensitive-content checks, deterministic ZIP metadata, per-file manifest and archive checksum. Git history, runtime data, binaries and hosted services are excluded.
- Removed the hosted operator's Gmail Message-ID domain; delegated messages use the sender's domain.
- Added release boundary documentation and automated packaging checks to CI. Health status now reads the packaged version.

## Community packaging — 2026-10-17

- The community distribution includes no operator-owned support widget, chatbot ID or embedded support service. Self-hosted operators choose and configure their own support tooling.

## 0.1.1 — Community packaging and branding

- Standardized export filenames, email Message-ID domain and agent examples on Dowi Quotes.
- **Webhook receiver migration:** outgoing headers are now `X-Dowi-Quotes-Event`, `X-Dowi-Quotes-Delivery` and `X-Dowi-Quotes-Signature`. Update receivers when deploying this revision. The signature remains HMAC-SHA256 over the raw body; event payloads are unchanged.
- Removed third-party promotional names from product copy. Required integration configuration and license attribution remain.

## Website — 2026-10-17

- Launched English, Traditional Chinese and Simplified Chinese product pages.
- Added responsive plan comparisons, source downloads, self-hosting guidance, FAQs and hosted sign-in.
- Added GitHub icon links and localized changelog pages at `/changelog/`, `/zh-Hant/changelog/` and `/zh-Hans/changelog/`.
- The website update does not change the published Community 0.1.0 release or official iOS availability.

## 0.1.0 — Community preview

- Initial AGPL-3.0-only release of the self-hosted Web and backend.
- Docker Compose with Caddy TLS, generated local credentials and persistent storage.
- Company tenants, local staff roles, customer quote portal, open activity and manual integrations.
- Public-edition account information and visible corresponding-source link.
- Official iOS source and hosted mobile billing/licensing implementation excluded.
