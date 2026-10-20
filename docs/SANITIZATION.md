# Sanitized Community source / 開源脫敏版本

Community 0.1.3 is the self-hosted Web application and Node backend based on DOWI quotation. It retains quotation creation, customer acceptance and discussion, internal cost redaction, contacts, items, templates, company isolation, roles, tracking, backups and optional integrations. Authenticator-based two-step verification has been brought across from the current application.

The existing AGPL-3.0-only license, Dayella copyright notices, DOWI product name and public upstream source links are preserved. Those public attributions are intentional. Operators supply their own company branding and customer data after installation.

## Release boundary

`npm run package:release` builds from an explicit list in `scripts/release.py`: runtime source in `lib/` and `public/`, scripts, tests, documentation, CI, dependency lockfile, deployment examples and license notices. It reads the source tree directly; no Git history is copied.

The source ZIP excludes runtime databases and WAL files, customer uploads, backups, `.env`, credentials, signing files, native iOS/Android source and binaries, build outputs, private research, chat transcripts, screenshots, marketing PDFs, and the separate promotional website. Existing files in the operator's working directory are left in place; they are outside the archive selection. Proprietary hosted billing, Stripe, mobile entitlement issuance, push credentials, hosted AI quotas and shared app-review access are outside this Community release.

Production setup initializes an empty workspace. Local setup uses only fictional Studio North records from `lib/seed.mjs`, with reserved example email domains and fresh random share tokens. These are generated examples, not a transformed customer database. No source-export command reads the live `data/` directory.

## Credentials and external services

- `.env.example` has empty passwords, encryption keys and provider secrets. `setup` generates a new password and 32-byte encryption key, writes `.env` with mode `0600` on Unix, and refuses to overwrite it.
- `setup:local` binds to `127.0.0.1` and requires the generated individual account credentials. Use the production setup and HTTPS for a public deployment.
- The Web edition requires no DOWI billing account or licensing endpoint. No operator support widget or analytics service is embedded.
- Gmail Message-ID values use the connected sender's domain instead of a hosted operator domain.
- SMTP, provider mail, Xero, object storage, custom domains, Turnstile and webhooks require the operator's configuration. External service endpoints supplied by the operator remain supported; the Community archive ships neither proprietary Dowi service endpoints nor model-provider credentials. The exchange-rate lookup contacts its reference-rate provider when requested. See [data flows](PRIVACY.md).
- Two-step authentication encrypts authenticator secrets with the installation key and hashes recovery codes. Enabling it revokes other sessions and prevents password-only HTTP Basic access for that user.
- Security hardening for the dedicated repository is described in [the 0.1.2 review](SECURITY-REVIEW-0.1.2.md), including existing-account protection and production webhook network restrictions.

## Rebuild and verify

With Node 22.13+ and Python 3:

```sh
npm ci
npm test
npm run test:release
npm run check:release
npm run package:release
```

The ZIP in `dist/` has a single versioned root directory, normalized file modes and fixed archive timestamps. Its adjacent `.zip.sha256` verifies the whole ZIP. `RELEASE-MANIFEST.json` lists every included source file and its SHA-256; the manifest does not hash itself. Identical source and the same Python/zlib toolchain produce identical ZIP bytes.

The audit rejects symbolic links, private/generated paths inside source directories, unexpected binary files, hosted billing modules, configured example secrets, known provider-token/private-key formats, credentials in URLs, workstation paths, and every literal `http(s)` URL on `dowisuite.com`, `dayella.co`, or their subdomains. It also rejects common literal AI-provider keys and named AI-provider API-key environment variables, including OpenAI, Anthropic, Gemini/Google, xAI, DeepSeek, Mistral, Groq, Cohere, Perplexity, OpenRouter and Azure OpenAI. Support email addresses remain allowed. Findings print paths and rule names without echoing matched credentials. Tests inject forbidden files, keys, variables and URLs, attempt a symlink escape, and verify archive reproducibility and every manifest digest. CI runs the audit, packaging and workflow tests before its Docker build.

This is a source-distribution check, not an anonymizer for a running database or a complete security audit. Pattern checks cannot identify every possible secret or personal name. Review changes to source fixtures and documentation before publishing a new release. Do not publish the parent application directory or its old Git history as the sanitized release.

## 繁體中文

這是可獨立部署的 DOWI 報價 Web／後端開源脫敏版本，沿用 AGPL-3.0-only。保留產品名稱與公開版權聲明；客戶資料、附件、資料庫、私有憑證、Git 歷史、原生 App 及商業付款授權實作不會收錄到源碼 ZIP。

本機體驗：`npm ci` → `npm run setup:local` → `npm start`，然後開啟 `http://localhost:3000/login`。帳戶為 `admin@example.test`，密碼由安裝程式隨機產生並存於本機 `.env`，沒有通用預設密碼。示範內容全部來自虛構 seed；正式部署使用 `npm run setup`，首次啟動為空白工作區。

發佈：先執行 `npm test`、`npm run test:release` 及 `npm run check:release`，再執行 `npm run package:release`。只分享 `dist/` 裡新生成的 ZIP；ZIP 包含逐檔雜湊清單，旁邊的 `.sha256` 可驗證整個壓縮檔。本流程不會修改或轉出原有正式客戶資料。
