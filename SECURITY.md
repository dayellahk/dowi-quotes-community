# Security reports

Send suspected vulnerabilities to **support@dayella.co** with affected version, minimal reproduction and impact. Do not include passwords or real customer data. Please report authentication bypasses, tenant isolation failures and credential exposure privately rather than in a public issue.

This is an initial community preview. Run a maintained Node/Docker release, use HTTPS and strong individual accounts, restrict administrative network access where practical, enable verification for exposed customer forms, and maintain tested encrypted backups. Operators are responsible for infrastructure, secrets, retention and incident response. No certification or guaranteed support SLA is asserted.

Community 0.1.2 includes individual hashed passwords, encrypted provider and authenticator secrets, replay-resistant MFA and recovery codes, tenant-scoped authorization, draft/customer field redaction, origin checks, request limits, clickjacking protections and a script Content Security Policy. Production webhooks require public HTTPS destinations, validate DNS at connection time and never follow redirects. `WEBHOOK_ALLOW_PRIVATE=true` is an operator opt-in that gives company administrators access to internal webhook destinations; leave it unset on an untrusted multi-company service.

CI runs the application and release-boundary tests, `npm audit` at all severities, CodeQL with extended security queries, and Gitleaks on source and committed history. Actions are pinned to commit hashes. Dependabot proposes dependency, container and action updates; operators must install reviewed fixes. See [the 0.1.2 security review](docs/SECURITY-REVIEW-0.1.2.md) for checked areas, fixes and limits. Automated checks do not establish that the application has no vulnerabilities.
