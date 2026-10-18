<p align="center"><img src="public/brand/dowi-quotes-mark.svg" width="88" alt="Dowi Quotes"></p>

# Dowi Quotes Community

**Your quotes. Your server.**

Create proposals, share a customer link and follow the conversation from your own infrastructure. This repository contains the **Web application and backend**, released under **AGPL-3.0-only**.

The official **Dowi Quotes iOS app is proprietary and is not included**. Connecting that app to a private server requires a separate paid company license. The open-source Web edition works without a Dowi subscription.

[Install](docs/INSTALL.md) · [Sanitized source release / 脫敏說明](docs/SANITIZATION.md) · [iOS & staff access](docs/IOS.md) · [Integrations](docs/INTEGRATIONS.md) · [中文](docs/README.zh-Hant.md) · [简体中文](docs/README.zh-Hans.md)

## What you can do

- Build quotes with quantities, internal costs, discounts, tax, optional items and alternative choices.
- Keep customers, reusable items and templates together; filter quotes by status and colleague.
- Share branded quotation pages; collect customer questions, acceptance and selected quantities.
- Record quotation-page open activity and follow-ups. Open events are signals, not proof that a person read a quote.
- Manage independent company tenants and their memberships and roles.
- Protect individual accounts with optional authenticator codes and single-use recovery codes.
- Use multiple currencies, manually entered rates and latest available reference exchange rates.
- Send using your own SMTP service or configured OAuth mailbox integration.
- Manually request a accounting draft invoice from an accepted quote, with the quote number and link as references.
- Connect compatible assistants through company-scoped MCP access and review proposed changes.

## Get running

For a local evaluation with Node 22.13+:

```sh
npm ci
npm run setup:local
npm start
```

Open `http://localhost:3000/login`, use `admin@example.test` and the generated `INTERNAL_PASSWORD` in your private `.env` file. This loopback-only development setup uses fictional Studio North contacts and quotations. SMTP, webhooks and optional provider accounts are unconfigured. Setup never replaces an existing `.env`. For a blank workspace, set `EMPTY_WORKSPACE=true` before the first start with an empty data directory.

For a public deployment, use a separate installation with the production setup below. The production setup starts with an empty workspace.

Requirements: a Linux server with Docker Compose, a hostname pointing to that server, and reachable ports 80/443. A small deployment can start with 1 vCPU and 1–2 GB RAM; measure workload and attachment growth before sizing a production service.

```sh
git clone https://github.com/dayellahk/dowi-quotes-community.git
cd dowi-quotes-community
# Use Node 22.13+ on the host, or the Docker alternative in the installation guide.
node scripts/setup.mjs
docker compose up -d --build
```

Read the initial password from the private `.env` file, then sign in at `https://YOUR_HOST/login` using the administrator email you supplied. Change your password, configure your company and add staff from **Account & mailboxes**. [Full setup, email and backup instructions →](docs/INSTALL.md)

## Free Web and paid official iOS

| | Community Web | Official iOS private-server access |
|---|---|---|
| Software | Web + backend source in this repository | Separate proprietary app |
| Price | Free software under AGPL-3.0 | USD 50 / company / month |
| Included users | Operator-configurable Web capacity | 10 users, including administrators |
| Extra official iOS users | Not applicable | USD 5 / user / month; contact support |
| Hosting, storage, SMTP | Provided and paid for by you | Uses your private backend |
| Billing | No Dowi billing server required | Company administrator pays; staff do not buy separate subscriptions |
| Availability | Community preview | Beta; availability and checkout confirmed by Dowi |

Storefront currency, taxes and the price displayed at purchase apply. Web user limits do not create mobile entitlements. The official app requires access to Dowi's separate licensing service; it is not an air-gapped product. [Ask about iOS](mailto:support@dayella.co).

## Deployment model

Browser / official iOS app → your HTTPS endpoint → Node.js API → SQLite + local attachments (or your optional object-storage bucket).

The server does not automatically upload quotation records to Dowi. Optional integrations send the data needed for their purpose to their configured providers. The official app uses a separate Dowi account and license service. See [privacy and data flows](docs/PRIVACY.md).

Run **one application instance per data volume**. This release uses SQLite and is not designed for multiple replicas writing the same volume. Back up the whole volume plus encryption keys, and test restores.

## Project status

This is the initial community preview. Test with sample records before migrating business data. Core workflow tests are included; live identity, accounting, email, bot-protection and DNS verification depend on your configuration. Some legacy Web workflow text remains English; account/settings and selected surfaces support English, Traditional Chinese and Simplified Chinese.

```sh
npm ci
npm test
npm run test:release
npm run check:release
npm run package:release
```

The release commands require Python 3 (standard library only). They create a reproducible source ZIP and SHA-256 checksum in `dist/`; the ZIP includes a per-file `RELEASE-MANIFEST.json`. Runtime databases, uploaded files, secrets, Git history, native applications, and marketing binaries are excluded. See [release scope and checks](docs/SANITIZATION.md).

[Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## License

Copyright 2026 Dayella Limited. Source in this repository is licensed under the [GNU Affero General Public License v3.0 only](LICENSE). Preserve the license and provide corresponding source as required, including to network users of modified versions. Set `SOURCE_URL` to the source for your running version. See [NOTICE](NOTICE) and [third-party notices](THIRD_PARTY_NOTICES.md).

No official iOS source, mobile signing files, hosted billing implementation or production customer records are part of this repository. Dowi branding does not imply endorsement of a third-party installation.
