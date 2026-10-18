# Community 0.1.2 security review — 2026-10-18

The dedicated public project is `dayellahk/dowi-quotes-community`. Its initial commit is built from the source release allowlist, without the parent application's Git history, runtime data, native binaries, private credentials or commercial billing implementation. DOWI attribution and AGPL-3.0-only licensing remain.

## Changes made before publication

- File creation uses exclusive writes, backup reads use a single non-following file descriptor, and recovery atomically claims a new private directory. Attachment caching rejects symbolic links and never overwrites a file created by a competing request. Login cache identifiers use a random per-process HMAC key; stored passwords continue to use salted scrypt.
- Existing-account invitations cannot replace a global password. Initial passwords are accepted only when creating a new local account; adding an existing identity leaves its credentials unchanged. The separate administrator reset action refuses changes to another member with active membership in another company. Tests cover both an existing password account and an existing federated account without a local password.
- Production webhook destinations require HTTPS and publicly routable IP addresses. DNS results are checked at socket connection time, including every retry; mixed public/private answers, loopback, LAN, metadata, mapped IPv4 and reserved ranges are rejected. Redirects are not followed and response bodies are not exposed. An explicit operator-only `WEBHOOK_ALLOW_PRIVATE=true` setting supports trusted internal integrations.
- Malformed HTTP request targets are caught before tenant routing can throw outside the request handler. JSON requests must contain objects and are limited to 8 MiB. Rate limits use the socket peer, not client-supplied IP headers. A reverse proxy should also apply per-client limits; all clients sharing one proxy peer share the application limit.
- Browser responses include a Content Security Policy restricting scripts to this server and the optional Turnstile provider, `frame-ancestors 'none'`, `object-src 'none'`, frame denial, MIME sniffing protection and a no-referrer policy. Production responses enable HSTS. The application retry button uses a programmatic handler compatible with the script policy.
- Optional two-step authentication uses encrypted authenticator secrets, hashed one-time recovery codes, short-lived challenges, replay prevention and attempt limits. Password-only Basic authentication cannot bypass an enabled second factor; enrollment revokes other sessions.

## Checks

The Node regression suite covers account and tenant authorization, credential reset boundaries, public quote redaction, draft access, origin verification, MFA/PKCE, webhook network destinations, request parsing and limits. Release tests cover allowlist exclusions, symlinks, known credential patterns and ZIP/manifest integrity. The release workflow performs these tests, a production dependency audit and a Docker build.

Gitleaks checks the source snapshot and the new repository history. GitHub Actions also runs extended CodeQL analysis for JavaScript and Python, plus secret scanning. Actions are pinned to verified upstream commit hashes. Dependabot is configured for npm, Docker and GitHub Actions updates. Release notes describe the final observed test and scan results.

## Static-analysis triage

CodeQL's two `js/http-to-file-access` findings in `restoreBackup` are false positives for a network attack surface: the only production caller is the operator-invoked `scripts/restore-backup.mjs` CLI; no HTTP route imports or invokes recovery. The apparent HTTP source is a test that downloads an authenticated backup and then calls the CLI library locally. Writing that explicitly selected backup is the purpose of recovery. The library validates its format, workspace checksum, UUID attachment identifiers, lengths and attachment checksums, and exclusively creates files inside a newly claimed private directory. The findings are recorded as false positives with this rationale; integrity checks are not a claim that arbitrary backups are trusted. Operators must select a trusted backup source.

## Scope and limits

This review checks the source distribution and the listed application boundaries. It is not an independent penetration test, a security certification or a promise that no vulnerability exists. The dependency audit reports known advisories available at scan time. Static analysis and secret detectors can miss defects and unusual secrets.

Live OAuth providers, real SMTP delivery, production TLS/DNS, real Turnstile challenges, Xero accounts and operator object-storage policies require deployment-specific validation. Use HTTPS, protect and back up the installation encryption key, keep source and runtime dependencies updated, restrict administrator access and publish the operator's privacy notice. Do not use the development demo configuration as a public deployment.

Report vulnerabilities privately using [SECURITY.md](../SECURITY.md); do not post customer records or working credentials in a public issue.
