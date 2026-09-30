# Brokerage and 3PL support

**Implementation snapshot: 2026-09-30**

## Operating profiles

Organization owners/admins can choose one of three profiles under **Settings → Operating profile**:

- **Asset-based carrier / 3PL** — owned drivers/equipment and yard workflows remain primary; partner carriers can cover overflow.
- **Freight broker** — use shipper orders, customer accounts, carrier coverage, buy/sell rates and billing without requiring an owned fleet.
- **Both** — keep both operating patterns available in one workspace.

The profile changes workspace context and wording, not roles, entitlements, or row-level security. The existing asset-based profile remains the default for current organizations.

## Broker workflow

1. Add shipper/bill-to records under **Customers** and maintain partner contact email/MC/DOT information under **Carriers**.
2. Create an order from **Orders**. The order workflow creates the shipment, stops and leg used for planning.
3. On **Broker Desk**, review legs needing carrier coverage, offers awaiting a reply and booked/resolved work. Create an offer from **Tenders** or **Load Planning**.
4. Creating an offer writes an internal tender record and associates the selected carrier with that load while the offer is open. If a carrier email is saved, **Open email draft** prepares a message with the shipment number, lane and offered carrier pay. The draft is not sent automatically. Without an email address, contact the carrier through your usual channel.
5. After the carrier replies, staff use **Log acceptance** or **Log rejection**. An accepted offer seeds carrier pay from the offered rate through the existing database trigger. Rejection clears that carrier assignment.
6. Enter the customer sell rate in **Rates** (agreement/apply-to-load) or the **Billing** load editor, review the indicative margin on Broker Desk, then use the existing invoice/settlement workflow.

The broker margin tile is an estimate over the recent loads currently loaded in Billing (up to 300). It uses customer rate + fuel surcharge − carrier pay and excludes accessorials; it is not a financial statement.

## Current boundaries / next phase

This is an operational broker MVP, not a connected carrier network. There is **no automatic email or SMS sending, carrier portal, external carrier acceptance link, EDI tender/response, rate negotiation, FMCSA/insurance verification, accounting sync, or automated load-to-carrier matching**. Carrier replies are manually recorded by staff. Broker/3PL users share the existing dispatcher/admin permission model.

The previously prepared market-analysis report was framed around asset-controlling trucking/yard operators. This app expansion does **not** revise that report's broker-segment market size or competitive analysis; those claims should not be generalized to asset-light freight brokers without a separate evidence-backed update.

## Deployment note

The code package includes `supabase/migrations/20260930000100_broker_operating_model.sql`. Apply that additive migration to the target Supabase project using the normal controlled deployment path **before** saving a non-default business profile. It adds a constrained `company_settings.business_model` field and extends the current settings audit trail. No hosted database was changed by this sandbox implementation.
