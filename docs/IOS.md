# Official iOS app and company licensing

The Web/backend code is AGPL-3.0. The official native iOS client and Dowi's hosted license service are proprietary, separate products. The community server exposes ordinary authenticated APIs; it does not issue, verify or grant Apple purchases.

Private-server pricing: **USD 50 per company per month**, including **10 users total, administrators included**. Additional official iOS users are **USD 5 each per month**, arranged through support. The app is currently beta; do not assume public App Store checkout is available until Dowi confirms it.

## Administrator setup

1. Install and secure the company server with a trusted HTTPS certificate and publicly reachable quotation hostname when external sharing is needed.
2. Create each staff member locally with their own email/password and company role. Test Web login.
3. Obtain the company's official iOS private-server license through Dowi. A billing administrator pays for the company and assigns company access; staff do not need individual Apple subscriptions.
4. Register the private server HTTPS origin and the intended server company in the official app. Company binding and active seats are checked by the separate hosted licensing service.
5. Add the staff email to that licensed company, and ensure the corresponding local account has the right tenant membership. Staff then use their own Dowi sign-in for licensing and their local server credentials for data access.

Local membership and cloud licensing are distinct. Increasing `WEB_USER_LIMIT`, modifying this server or adding a local user does not create an official iOS entitlement. Removing a local membership blocks that company's data access; remove the licensed membership too when offboarding. License refreshes require Internet access to Dowi; this is not an offline/air-gapped license.

One billing administrator can manage licensed company packages and assign slots to independent tenants. Company data and local roles stay separate. Current packages, regional checkout prices and custom offers are confirmed in the official app/support, not by this open-source backend.

Microsoft/Google SSO requires operator-owned OAuth configuration. Automatic Microsoft Entra directory provisioning/SCIM is not implemented. Never share the administrator password with staff.

Contact: [support@dayella.co](mailto:support@dayella.co).
