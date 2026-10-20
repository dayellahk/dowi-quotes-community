# Community release validation

## Community 0.1.3 source hygiene — 2026-10-20

- `npm run test:release` passed nine source-release tests, including fragment-based fixtures for literal AI-provider keys, named provider API-key environment variables and hosted SaaS URLs in documentation, scripts and tests.
- `npm run check:release` accepted 108 UTF-8 source files with no configured sensitive patterns. The audit now covers every release file for literal `dowisuite.com` and `dayella.co` URLs while allowing support email addresses.
- The reproducible archive test verifies the per-file manifest and whole-archive SHA-256 checksum. A fresh `/tmp` package was generated and its checksum and manifest were verified separately.
- `npm ci` completed from the lockfile on Node 22.23.0, and `npm audit --audit-level=low` reported zero known dependency vulnerabilities.
- `npm test` passed all 54 application tests in an unrestricted local shell, including HTTP server, tenancy, attachment, webhook, Turnstile and two-step verification coverage.
- An independent source and website scan covered 122 files and found no old repository URL, AI-provider key form or named AI-provider key variable.

These checks cover the source distribution boundary. They do not claim that the application has no vulnerabilities or replace a full independent security review.

## Dedicated public Community 0.1.2 — 2026-10-18

The publication target is the new [dowi-quotes-community repository](https://github.com/dayellahk/dowi-quotes-community), with a fresh source-only Git history. The earlier project is not the release destination.

- 54 Node tests passed, covering account and tenant isolation, existing-account takeover prevention, credential reset boundaries, MFA and recovery, quotation lifecycle, customer cost redaction, webhook destination/DNS/redirect restrictions, malformed requests, spoofed IP headers, attachment cache races and symbolic links.
- Seven source-release tests passed, including exclusions, symlink rejection, secret-pattern detection, reproducible archives and per-file hash verification. The release allowlist selects 108 UTF-8 source files.
- `npm audit --audit-level=low` reported zero known dependency vulnerabilities at validation time. Gitleaks 8.30.1 found no credentials in the source snapshot or the new Git history.
- GitHub Actions passed the regression suite, release audit, packaging, production Docker build, Gitleaks and extended CodeQL analysis for JavaScript and Python. Four file-race findings were fixed. Four remaining static-analysis findings were individually reviewed as false positives with public reasoning in [the security review](SECURITY-REVIEW-0.1.2.md): two local recovery writes, a token digest and an ephemeral keyed login-cache identifier. No authentication or backup module was excluded from scanning.
- A production-mode Docker image built successfully. A fresh volume contained no contacts or quotes; anonymous workspace access was denied; unpublished quotations were private; a published quotation omitted internal costs; hosted billing and shared review login were unavailable; container recreation preserved a created quotation. The temporary container and volume were removed afterwards.
- Ego-browser verified individual sign-in, the fictional Studio North dashboard, Account settings, authenticator enrollment, a required second step on the next login, and successful login with a recovery code under the new Content Security Policy. Setup keys and recovery codes were kept outside screenshots and logs.
- Repository protection includes secret scanning, push protection, dependency alerts and automated security fixes, private vulnerability reporting, and weekly Dependabot updates. The source ZIP includes a SHA-256 checksum and a per-file manifest.

No production-data migration or public application deployment was performed. This release publishes source and installation instructions; operators supply their own infrastructure and credentials. Passing automated checks does not guarantee the absence of vulnerabilities.

## Initial preview

The initial source release was checked with:

- 42 passing Node tests, including company/role isolation, local staff authentication, quotation calculation and lifecycle, customer field redaction, Turnstile verification/replay handling, MCP scope boundaries and mocked Xero/SMTP behavior.
- A clean production-mode Docker build and fresh persistent volume: anonymous workspace access denied; owner login succeeded; contact and draft creation succeeded; published customer quote excluded internal costs; recreation of the container preserved the quote.
- Proprietary Apple billing routes absent and returning 404 in the community container.
- Desktop browser login and Account rendering using individual local credentials; new account page displays community license information.
- A responsive marketing page at a 390px viewport without horizontal overflow, rendered trilingual PDF pages, and screenshots using fictional records.
- Secret scanning and checks that native source, signing files, production data and hosted licensing code were excluded.

External production TLS issuance, DNS, live SMTP delivery, provider OAuth consent, human Turnstile completion and paid official iOS license purchase must be validated for each operator's environment. Mock tests do not verify those accounts or services. This release does not claim a full independent security audit or public App Store availability.
