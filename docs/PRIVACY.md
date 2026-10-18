# Data flows for operators

- SQLite: company records, staff memberships, credentials (password hashes), quotes, customer responses and activity.
- Files: local persistent volume by default; optionally the operator's private TOS bucket. Company exports may contain customer data.
- Public quote links: bearer-style links intended for the recipient; anyone with the link may view a published quote. Draft previews require staff authentication. Do not publish real links in issues or screenshots.
- Open tracking: first-party quote-page events saved on the operator's server. Browser/network conditions and automated visits affect the signal.
- SMTP or connected provider: recipient, subject, message and quotation link for requested emails.
- Xero: customer and invoice information when a staff administrator explicitly submits a request.
- Turnstile: browser verification and server-side token checks, if enabled.
- Exchange lookup: requested currency pair; no customer record is needed.
- MCP/webhooks: data explicitly exposed under granted permissions or configured events.

There is no automatic quotation-record upload to Dowi in this community server. The proprietary official iOS app uses Dowi's separate account and licensing service. Administrators must publish their own privacy notice, define retention, control staff access and protect backups. Replace `public/privacy.html` with that notice before customer use.
