# Contributing

Use Node 22.13+, `npm ci` and `npm test`. Open a focused issue or pull request with reproduction steps and validation. Work on a branch and use sample data. Never include real customer records, authentication tokens, private quote URLs or signing material.

Contributions to the Web/backend are accepted under this repository's AGPL-3.0-only license. By submitting code, you confirm that you have the right to contribute it under that license. The native iOS application and hosted billing service are not part of this project.

Keep tenant authorization server-side, preserve customer redaction and add meaningful regression coverage for behavior changes. Mock external providers in automated tests; do not send real email or create real invoices from CI. See SECURITY.md for private vulnerability reporting.
