# Community preview validation

## 0.1.2 — 2026-10-18

- 48 Node tests passed, including authenticator vectors, replay/lockout protection, recovery codes, MFA authentication boundaries, local setup, tenant isolation, quote lifecycle and customer cost redaction. The same 48 tests passed after installing dependencies into a fresh extraction of the source ZIP. The sender-domain Message-ID regression was also verified after its final assertion was added.
- Seven source-release tests passed: root data/history exclusion, symlink rejection, private/hosted file rejection, credential detection without disclosure, empty example secrets, current-source audit, and reproducible archives with verified per-file hashes. The audit checked 102 selected UTF-8 source files.
- A production-mode Docker image built successfully. A fresh volume contained no contacts or quotes; anonymous workspace access was denied; a published quote omitted internal costs; hosted billing and shared review login were unavailable; recreating the container preserved a created quotation. The test container and volume were removed afterwards.
- Ego-browser verified the extracted local setup: individual-account sign-in, fictional Studio North dashboard, Account settings, authenticator enrollment, a required second step on the next login, and successful login with a single-use recovery code. Setup keys and recovery codes were kept outside screenshots and logs.
- No public deployment, upstream Git push or production-data migration was performed for this source package.

## Initial preview

The initial source release was checked with:

- 42 passing Node tests, including company/role isolation, local staff authentication, quotation calculation and lifecycle, customer field redaction, Turnstile verification/replay handling, MCP scope boundaries and mocked Xero/SMTP behavior.
- A clean production-mode Docker build and fresh persistent volume: anonymous workspace access denied; owner login succeeded; contact and draft creation succeeded; published customer quote excluded internal costs; recreation of the container preserved the quote.
- Proprietary Apple billing routes absent and returning 404 in the community container.
- Desktop browser login and Account rendering using individual local credentials; new account page displays community license information.
- A responsive marketing page at a 390px viewport without horizontal overflow, rendered trilingual PDF pages, and screenshots using fictional records.
- Secret scanning and checks that native source, signing files, production data and hosted licensing code were excluded.

External production TLS issuance, DNS, live SMTP delivery, provider OAuth consent, human Turnstile completion and paid official iOS license purchase must be validated for each operator's environment. Mock tests do not verify those accounts or services. This release does not claim a full independent security audit or public App Store availability.
