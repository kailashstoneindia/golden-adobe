# COD System Design and Indian Payment Regulation (for a Razorpay-based home-goods marketplace)

Research date: 2026-11-03. India only. Superseded rules are flagged **[SUPERSEDED]**. Vendor marketing claims are flagged **[vendor claim]**.

## Q1. How do Indian e-commerce marketplaces design COD end-to-end (lifecycle, confirmation, fees, limits, eligibility, RTO, remittance, refunds)?

### Takeaway

COD has no payment-gateway signal: on Razorpay, a COD order is just a `payment.pending` (method=cod) event that means "start fulfilment". Cash comes in later, as a courier remittance about 2–14 days after delivery. So COD needs its own state machine and reconciliation against courier remittance files. Its main risk is RTO: about 25–30% of COD orders vs 2–3% prepaid. Indian platforms handle this with risk-scored eligibility (pincode/phone/IP blocklists, cart-value slabs), confirmation (WhatsApp/IVR/OTP), and prepaid nudges. Charging a separate COD fee is now politically risky: the Consumer Affairs Minister called it a "dark pattern" in Oct 2025.

### Cited Findings

**Scale and economics**

- 60–65% of Indian e-commerce orders are COD (citing ET Prime Research 2024), higher in Tier 2/3. About 25–30% of COD orders RTO vs 2–3% prepaid; fashion COD RTO can exceed 35–40%. India loses over Rs 20,000 crore/yr to RTO and failed deliveries. Offering COD raises conversion by 20–30% **[vendor claim]**. Page updated 10 Jun 2026 — [Razorpay blog: Cash on Delivery](https://razorpay.com/blog/cash-on-delivery/)
- Other estimates: 28–35% RTO for COD and 4–8% for prepaid. Fraud patterns include bogus/wrong addresses and deliberate refusal at the door — [Shipmozo: COD fraud](https://www.shipmozo.com/blog/cod-fraud-in-indian-e-commerce)
- Meesho: over 75% of orders are COD, and only about 75.5% of COD orders are fulfilled (delivered and accepted) vs about 96.3% prepaid. COD success was 77.7% in FY23 and 78.6% in FY24, from IPO-filing analysis — [Upstox](https://upstox.com/news/upstox-originals/investing/is-cash-on-delivery-quietly-costing-you-more/article-184260); [IndMoney](https://www.indmoney.com/blog/ipo/meesho-ipo-aws-dispute-cod-risk-losses)
- Competitors sometimes place fake orders to waste a seller's resources, so deduplication and fraud detection are needed — [Hillteck](https://hillteck.com/blog/reduce-rto-ecommerce.html) (low-authority blog)
- Amazon India offers "COD suppression" to sellers to cut RTO — [Amazon Smart Commerce blog](https://smartcommerce.amazon.in/blog/cod-suppression-for-rto--reduce-returns-and-increase-seller-profits)

**How COD works on Razorpay (Standard Checkout) — primary doc**

- COD is an extra payment method in Standard Checkout. It is off by default, needs activation, and is limited to India, INR and physical goods — [Razorpay docs: COD on Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- The payment entity has `method: cod`, `status: pending`, `captured: false`. No money moves through Razorpay and no settlement is generated — [same](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- The webhook is `payment.pending` with `method=cod`, and it is the signal to start fulfilment. **There is no `payment.captured` for COD.** The webhook `amount` includes `cod_fee`, which is not sent separately — [same](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- `cod_fee` is an optional integer in paise on the Orders API. It must be at least 0 and at most `amount`, or the API returns 400. A negative value is accepted silently and means no fee is charged. Omit the field when there is no fee — [same](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- **The merchant decides eligibility** (pincode, order value, RTO history). Once activated, COD shows on every session. Hide it per session with `config.display.hide: [{method: "cod"}]`, which overrides `cod_fee` — [same](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- "Automatic COD placement" is an optional feature. It falls back to COD only on a confirmed processor payment failure, not on abandonment. With no fee, the order auto-places after 15 s unless the customer stops it; with a fee, the customer must tap "Pay on Delivery". Duplicate placement on refresh is prevented — [same](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- On Standard Checkout the merchant bears all RTO losses and must reconcile cash collected against order amount + COD fee itself — [same](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)

**Razorpay Magic Checkout: COD Intelligence and RTO protection**

- Magic Checkout charges differential COD fees for medium-risk orders and disables COD for high-risk users with a history of failed deliveries — [Razorpay Magic Checkout](https://razorpay.com/magic-checkout/)
- The blocklist (phone, email, device IP, 6-digit pincode) makes a customer ineligible for COD. The allowlist (phone/email) always allows COD, whatever the RTO model says. Both require COD Intelligence, enabled under Magic Checkout → Analytics → RTO. CSV upload takes up to 1M rows — [Razorpay docs: Allowlist & Blocklist](https://razorpay.com/docs/payments/magic-checkout/rto-reduction/allowlist-blocklist)
- RTO protection reimburses verified COD orders that Magic Checkout's risk systems approved but that still RTO'd. It requires COD Intelligence. Allowlisted orders are excluded. Sharing monthly delivery-status data back to Razorpay is part of eligibility — [Allowlist/Blocklist](https://razorpay.com/docs/payments/magic-checkout/rto-reduction/allowlist-blocklist); [Delivery status doc](https://razorpay.com/docs/payments/magic-checkout/rto-reduction/delivery-status)
- A case study says the absorbed cost is specifically the shipping cost **[vendor claim]** — [Razorpay case study](https://razorpay.com/case-studies/magic-electronics-company/)
- Other levers: cart-value slabs for COD eligibility (some platforms cap COD on high-value electronics), partial COD, WhatsApp payment links with discounts to convert COD to prepaid, and an extra COD fee as a deterrent — [Razorpay blog](https://razorpay.com/blog/cash-on-delivery/)

**Confirmation (no webhook means you confirm via the customer)**

- Common methods are IVR (press-to-confirm), OTP at checkout, WhatsApp confirmation, and AI voice calls. One reported pattern is WhatsApp first, then IVR or a voice call if there is no reply within 2 h. Reported RTO reductions are about 10–15% for IVR, 15–20% for OTP and 15–25% for WhatsApp, but figures conflict and come from vendors **[vendor claim]**. OTP adds friction and some genuine orders are lost — [bot.space](https://www.bot.space/blog/what-is-cod-verification-ecommerce); [RTO simulator guide](https://mintlify.com/shubhamsingh-pg/rto-profit-simulator/guides/optimization-strategies); [QuickReply](https://www.quickreply.ai/rto-reduction-campaigns)

**COD fees: regulatory headwind**

- On about 4 Oct 2025, Union Consumer Affairs Minister Pralhad Joshi said the government would act against e-commerce platforms charging extra for COD. He called it "a practice classified as a dark pattern that misleads and exploits consumers." The trigger was a viral Flipkart order with Rs 226 of extra fees ("payment handling fee" for COD, "offer handling fee", "protect promise fee"). No specific rule or penalty was stated — [PTC News](https://www.ptcnews.tv/nation/govt-to-take-action-against-e-commerce-platforms-imposing-extra-charges-on-cod-orders-4415403)
- HT (Oct 2025) reported that Consumer Affairs would consult consumer bodies and e-commerce companies on COD fees, with Amazon and Flipkart under scrutiny — [Magzter/Hindustan Times](https://www.magzter.com/en/stories/newspaper/Hindustan-Times-Delhi/AMAZON-FLIPKART-FACE-SCRUTINY-FOR-FEE-ON-COD)
- Typical industry COD collection charges (courier side) are about 1.5–3% of order value or Rs 30–50 per order. These are inconsistent low-authority estimates — [Edesy calculator](https://edesy.in/tools/cod-rto-calculator)

**COD limits**

- Amazon.in "Pay on Delivery" reportedly becomes unavailable above Rs 30,000 order value. This comes from a third-party mirror of Amazon help text and is unverified — [ecommerceportal freshdesk](https://ecommerceportal.freshdesk.com/en/support/solutions/articles/25000016355-about-pay-on-delivery)
- Razorpay's docs set no COD min/max. The merchant enforces limits itself — [Razorpay COD doc](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)

**Doorstep payment and cash flow**

- Delivery agents collect cash or digital payment (e.g. UPI). Funds reach the business only when the logistics partner settles, typically 7–14 days later — [Razorpay blog](https://razorpay.com/blog/cash-on-delivery/)

**Courier COD remittance cycles**

- Shiprocket standard: COD reaches the seller's bank 8–9 days after delivery — [Shiprocket support](https://support.shiprocket.in/support/solutions/articles/43000607415-shiprocket-app-when-will-i-receive-my-cod-payment-)
- Shiprocket Early COD: D+2, D+3 or D+4 plans for a fee — [Shiprocket support](https://support.shiprocket.in/support/solutions/articles/43000538961); [Shiprocket Early COD](https://www.shiprocket.in/early-cod/)
- Shiprocket Instant COD: up to 70% of COD remitted at S+1 (the day after shipping). The fee is quoted as 2.99% on one page and as 5% in an FAQ example, which conflict — [Instant COD SOP](https://sites.google.com/shiprocket.com/sop-shiprocket/instant-cod); [Instant COD FAQ](https://support.shiprocket.in/support/solutions/articles/152000000970-instant-cod-faqs)
- Delhivery's help center says COD is transferred within 48 h of delivery. A negative Delhivery wallet balance pushes the remittance to the next cycle, so freight is netted against COD (page dated about 2023). Third parties quote D+3 to D+5 or T+5 for enterprise accounts, depending on contract — [Delhivery help: COD remittance](https://help.delhivery.com/docs/cod-remittance); [Shipmozo](https://www.shipmozo.com/blog/cod-remittance-in-india)
- Remittance terms have two parts: frequency (e.g. twice weekly) and lag (e.g. D+7) — [GoSwift glossary](https://www.goswift.in/glossary/cod-remittance-cycle)

**COD refunds**

- Amazon.in Pay-on-Delivery refunds go to a bank account via NEFT (2–4 business days FBA, 3–5 business days seller-fulfilled) or to Amazon Pay balance (about 2 h). Paper cheque takes 8–10 days. Bank details are captured in the Returns Centre. Refunds cannot go to third-party accounts, and the account-holder name must match. Source is a third-party mirror and unverified — [ecommerceportal freshdesk](https://ecommerceportal.freshdesk.com/en/support/solutions/articles/25000016355-about-pay-on-delivery)
- PG payout products are marketed for automated COD refunds (bank/UPI payouts) — [PayU blog](https://payu.in/blog/ecommerce-businesses-automate-cod-refunds-with-payu-payouts/); [Cashfree: WooCommerce COD refunds](https://www.cashfree.com/blog/manage-woocommerce-cod-refunds-india/)

### Inferences

- **State machine (COD):** `PLACED(cod, payment.pending)` → `CONFIRMATION_PENDING` (WhatsApp/IVR/OTP; auto-cancel after a timeout) → `CONFIRMED` (stock reservation hardens) → `SHIPPED` → `OUT_FOR_DELIVERY` → `DELIVERED_CASH_COLLECTED` (courier event; receivable from courier) → `REMITTED` (matched to a line in the courier remittance file, net of freight/COD charges) → `SETTLED_TO_VENDOR`. The failure branch is `NDR` (attempt failed) → reattempt or `RTO_INITIATED` → `RTO_DELIVERED` (restock, book RTO freight as a loss).
- Stock reservation: reserve on PLACED with a short TTL until confirmation, then hold to shipment. This fits the existing stale-reservation sweep (decision 0048–0050 in repo history).
- **Ledger:** on delivery, Dr _Courier COD receivable_ / Cr _Customer order revenue (vendor payable + platform commission)_. On remittance, Dr _Bank_ + Dr _Courier charges expense_ / Cr _Courier COD receivable_. An RTO reverses the revenue and books freight as an expense. The courier receivable should age to zero within the contracted D+N.
- A COD fee line item now carries regulatory/reputational risk. Prefer prepaid incentives (discount, priority dispatch) over a COD surcharge. If a fee is kept, show it upfront before the order is placed, not as drip pricing.
- For high-ticket building materials, a COD cap (or partial/token advance via Razorpay) is more defensible than blanket COD. Amazon's reported Rs 30k cap is a reference point.
- COD refunds cannot go "to source", because the source was cash. Collect bank/UPI VPA details, validate them (penny-drop or VPA validation), and pay out via a payouts API, or offer store credit as an opt-in only.

### Gaps

- No primary Flipkart/Meesho/Amazon engineering-blog material on their internal COD architecture or risk models was found.
- No official current COD fee schedules or COD caps from Flipkart, Meesho or Amazon.
- Magic Checkout COD settings (fee configuration, slabs, pricing for RTO protection) were not in the docs pages fetched. Razorpay says Magic COD is "handled separately" and to contact the account manager.
- Delhivery's current remittance frequency is not confirmed (the official page is about 2023).
- No authoritative data on doorstep UPI QR collection flows (dynamic QR per AWB) or how they reconcile.

## Q2. Which RBI/NPCI and other Indian rules must a production payment system respect?

### Takeaway

The PA Master Direction of 15 Sep 2025 replaced the 2020 PA/PG guidelines. Under it the PA (Razorpay) cannot itself run a marketplace. A marketplace collecting for its sellers is a "merchant" onboarded by the PA, and may accept payments only for sellers onboarded by that PA. Splitting and settling to vendors is done through the PA's escrow, via Razorpay Route. COD is explicitly outside the escrow. The merchant must never store card PAN/CVV/expiry (CoF tokenisation since 1 Oct 2022). Payment data must be stored in India. Failed-transaction TATs of T+1 to T+5 with Rs 100/day compensation bind banks and PAs, not the merchant directly. Refunds go to the original payment method. GST TCS under Section 52 is now **0.5%, not 1%**.

### Cited Findings

**RBI Payment Aggregator Master Direction, 2025 (primary)**

- Title: "Reserve Bank of India (Regulation of Payment Aggregators) Directions, 2025", RBI/DPSS/2025-26/141, dated 15 Sep 2025 — [RBI Master Direction](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- It consolidates and supersedes PA directions/circulars since 17 Mar 2020 (2020 PA/PG guidelines, 2021 clarifications, 2023 PA-CB). **[SUPERSEDED: 2020 PA/PG guidelines]** — [MediaNama explainer](https://www.medianama.com/2025/09/223-explained-rbi-master-direction-payment-aggregators/); [Outlook Business](https://www.outlookbusiness.com/news/rbi-issues-new-master-directions-for-payment-aggregators-rules-take-effect-immediately)
- Definitions (para 4): a "Marketplace" is "An e-commerce entity which provides an information technology platform on a digital or electronic network to facilitate transactions between buyer(s) and seller(s)." A "Merchant" is "An entity or a marketplace that sells goods, provides services…", so a marketplace is a merchant of the PA — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Para 10(a): "A PA shall aggregate funds only for the merchant with whom it has a contractual relationship." Para 10(b): "A PA business shall not carry out marketplace business." — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Para 13(f): "A PA shall ensure that a marketplace onboarded by it does not accept payments for a seller not onboarded…". Para 13(g): PAs must have validation mechanisms so funds due to a merchant are credited correctly — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896). MediaNama summarises this as marketplaces must "accept payments only for sellers registered on their platforms" — [MediaNama](https://www.medianama.com/2025/09/223-explained-rbi-master-direction-payment-aggregators/)
- Escrow, permitted credits (Table 1, para 16a): payer funds for onboarded merchants; funds from other PAs; refunds initiated by merchants (failed, disputed, returned, cancelled); pre-funding; promotional and cashback funds. Permitted debits: payments to onboarded merchants; refunds to payers; payments to another PA or PA-CB in the flow; payment to a third-party account on the merchant's specific direction; PA commission — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- **Para 18(b): "The escrow account shall not be operated for 'Cash-on-Delivery' transactions."** — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Merchant settlement timeline: "As per the agreement between the PA and the merchant… must transparently mention the settlement timelines." The fixed T+1 rules of 2020 no longer appear — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- "All refunds shall be made to the original method of payment, unless specifically instructed by the payer to credit the refund to an alternate mode belonging to the same payer." — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Merchant due diligence: CDD on all merchants via CKYCR. Small merchants (turnover below Rs 40 lakh) get simplified checks (PAN, contact-point verification, OVD). Funds credited only to the merchant's own accounts. Non-bank PAs need Rs 15 cr net worth at application, rising to Rs 25 cr, and FIU-IND registration — [MediaNama](https://www.medianama.com/2025/09/223-explained-rbi-master-direction-payment-aggregators/)
- Deadlines: existing merchants onboarded until 31 Dec 2025 must meet due diligence within one year (para 13(j)). Several existing-PA instructions were due by 31 Dec 2025 — [RBI MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Card data must not be stored on merchant servers, and PAs must ensure PCI-DSS on merchant infrastructure — [MediaNama](https://www.medianama.com/2025/09/223-explained-rbi-master-direction-payment-aggregators/)
- **[SUPERSEDED] 2020 PA/PG guidelines (17 Mar 2020)** for history:
  - Settlement was capped at Ts+1, Td+1 or Tr+1. Td was the "date of confirmation by the merchant to the intermediary about delivery of goods."
  - Para 2.3: the guidelines did "not apply to Cash on Delivery (CoD) e-commerce model." Para 8.8 had the same escrow-COD bar.
  - Para 3.6: e-commerce marketplaces doing PA activity had to separate it from the marketplace business and apply for authorisation by 30 Jun 2021.
  - Para 7.4: "Merchant site shall not save customer card and such related data."
  - Source: [RBI notification 11822](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11822)

**Razorpay licensing and Route**

- Razorpay holds PA-Online, PA-Cross-Border and (via Razorpay POS) PA-Physical authorisations, per news reports — [Outlook Business](https://www.outlookbusiness.com/corporate/razorpay-pos-gets-rbi-nod-for-offline-payment-aggregator-licence); [Yahoo Finance](https://finance.yahoo.com/news/razorpay-gains-payment-aggregator-cross-130144298.html); [Pulse](https://www.pulse.bot/fintech/news/razorpay-secures-rbi-pa-p-licence-expanding-fully-regulated-in-store-payments-across-india-b3892f31-a3b7-442e-9ee6-5189264d7344)
- Route splits payments to linked accounts (vendors), INR only. `on_hold: true` holds the settlement, indefinitely if `on_hold_until` is omitted. `on_hold_until` is a Unix timestamp; after it passes, funds settle on the next business day. A hold overrides the schedule (e.g. a T+10 schedule still doesn't settle while on hold). Holds can be changed via `PATCH /v1/transfers/:id`. Direct transfers from the merchant balance need on-demand activation — [Razorpay Route transfers API](https://www.razorpay.com/docs/api/payments/route/transfers/); [Modify settlement hold](https://razorpay.com/docs/api/payments/route/transfers/modify-settlement-hold/); [Direct transfers](https://razorpay.com/docs/api/payments/route/transfers/direct-transfers/); [Route product page](https://razorpay.com/route/)

**Card-on-File tokenisation (CoFT)**

- From 1 Oct 2022, merchants cannot store card number, CVV or expiry for online transactions. "No entity in the card transaction / payment chain, other than the card issuers and / or card networks, shall store CoF data", and previously stored data must be purged. Tokenisation applies to domestic transactions only — [SBI CoFT FAQ](https://www.sbi.co.in:443/documents/16012/78812/300922-FAQ+COFT+VER.pdf); [Federal Bank CoFT](https://www.federal.bank.in/card-on-file-tokenisation-coft)
- Acquiring banks were allowed to store CoF data until 31 Jan 2023 for guest-checkout settlement and chargebacks — [Inc42](https://inc42.com/buzz/card-tokenisation-acquiring-banks-can-store-card-details-for-checkout-transactions-till-jan-31-says-rbi/)
- RBI later allowed CoF tokenisation directly through card issuers as well — [Inc42](https://inc42.com/?p=433109); [RBI press release](https://website.rbi.org.in/web/rbi/-/press-releases/reserve-bank-of-india-encourages-cardholders-to-tokenise-their-cards-53920)

**PCI-DSS scope with Razorpay hosted/Standard Checkout**

- Razorpay's shared responsibility model says to "ensure that a customer's payment information only reaches your servers if you are PCI DSS certified." Server-to-Server checkout requires being "compliant with PCI DSS standards at all times" and an annual PCI AOC — [Razorpay shared responsibility model](https://razorpay.com/docs/security/shared-responsibility-model.md)
- Razorpay lists PCI DSS Level 1. It does not state which SAQ a Standard Checkout merchant files. A Razorpay guide notes that PCI SSC now treats embedded forms and redirects differently for SAQ-A script-security eligibility, and that SAQ-A pages may need ASV scanning — [Razorpay security docs](https://razorpay.com/docs/security/shared-responsibility-model/); [Razorpay blog](https://razorpay.com/blog/what-is-secure-checkout-and-why-it-matters/)

**Data localisation**

- The RBI directive of 6 Apr 2018 (DPSS.CO.OD.No 2785/06.08.005/2017-18, "Storage of Payment System Data") requires the entire payment-system data to be stored only in India. The FAQ of 26 Jun 2019 allows processing abroad, but the data must be deleted abroad and brought back within 1 business day or 24 h, whichever is earlier. The directive applies to payment system operators (and their service providers), not directly to merchants — [RBI FAQ Id=130](https://rbi.org.in/Scripts/FAQView.aspx?Id=130); [ThePrint](https://theprint.in/economy/rbi-says-all-data-processed-outside-india-will-have-to-be-brought-back-within-24-hours/254838)

**Failed-transaction TAT and compensation**

- RBI circular DPSS.CO.PD No.629/02.01.014/2019-20 (20 Sep 2019) sets TATs per channel. For UPI, the beneficiary bank auto-reverses by T+1. Card/e-commerce failures must resolve within T+5 maximum. Compensation is Rs 100/day beyond the TAT, credited suo motu without waiting for a complaint. The TAT is an outer limit, and complaints escalate to the RBI Ombudsman — [RBI circular PDF](https://website.rbi.org.in/documents/87730/39710850/Circular677ec931a7a65e4d99aa957d8e85bc0a2a.pdf); [RBI Citizens' Corner](https://website.rbi.org.in/web/rbi/-/citizens-corner/harmonisation-of-turn-around-time-tat-and-customer-compensation-for-failed-transactions-using-authorised-payment-systems-3074); [Cashfree annexure copy](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>)

**E-mandates (recurring), briefly**

- Under RBI's "Digital Payments — E-mandate Framework, 2026" (reported Apr–May 2026), recurring transactions up to Rs 15,000 per transaction need no AFA after the first AFA-registered mandate, across cards, PPIs and UPI. Insurance premiums, MF subscriptions and credit-card bills are allowed up to Rs 1 lakh. A 24-hour pre-debit notice is reported but the details were not verified — [Business Today Apr 2026](https://www.businesstoday.in/personal-finance/news/story/rbi-caps-recurring-payments-at-rs15000-without-otp-under-new-e-mandate-framework-526759-2026-04-21); [Business Today May 2026](https://www.businesstoday.in/personal-finance/news/story/rbi-auto-debit-rules-explained-what-new-changes-mean-for-your-upi-and-card-payments-528507-2026-05-02); [Zee Biz](https://www.zeebiz.com/personal-finance/banking/news-rbi-auto-pay-rules-changed-no-otp-for-rs-15000-payments-rs-1-lakh-limit-for-sips-insurance-what-it-means-for-users-394077)
- **[SUPERSEDED]** The 2021–22 e-mandate circulars (Rs 5,000, raised to Rs 15,000 in Jun 2022) are now consolidated into the 2026 framework — [Business Standard 2022](https://bsppd.business-standard.com/article/finance/new-e-mandate-guidelines-rbi-enhances-limit-for-e-mandates-on-credit-debit-cards-to-rs-15-000-122060800417_1.html)

**GST TCS for e-commerce operators (Section 52)**

- **The TCS rate was cut from 1% to 0.5% effective 10 Jul 2024** (0.25% CGST + 0.25% SGST/UTGST intra-state, or 0.5% IGST inter-state). Notification 15/2024-Central Tax and 01/2024-Integrated Tax, following the 53rd GST Council meeting. **[SUPERSEDED: 1% rate]** — [Mondaq](https://www.mondaq.com/india/sales-taxes-vat-gst/1516974/reduction-in-rate-of-gst-collected-by-the-e-commerce-operators); [TaxGuru](https://taxguru.in/goods-and-service-tax/cgst-e-commerce-operator-tcs-collection-rate-reduced-0-25-percent.html)
- The operator collects TCS on the net value of taxable supplies made through the platform where it collects the consideration, deposits it, and files GSTR-8 — [Patron Accounting](https://www.patronaccounting.com/blog/tcs-section-52-ecommerce-gst-explained); [Masters India](https://www.mastersindia.co/blog/gst-implications-ecommerce-operator-guide/)

**Consumer Protection (E-Commerce) Rules, 2020**

- Notified 23 Jul 2020 under the Consumer Protection Act 2019. They cover marketplace and inventory models — [SS Rana](https://ssrana.in/articles/consumer-protection-e-commerce-rules-2020/); [Khaitan & Co](<https://khaitanco.com/sites/default/files/2020-08/Stricter%20Regulations%20on%20E-Commerce%20%E2%80%93%20The%20Consumer%20Protection%20(E-Commerce)%20Rules,%202020.pdf>)
- Marketplaces cannot impose cancellation charges on consumers unless they bear similar charges when they cancel unilaterally. Refunds must be made within a reasonable period. Sellers cannot refuse refunds for defective, deficient or misrepresented goods, and their return/refund policies must be displayed — [Mondaq](https://www.mondaq.com/india/dodd-frank-consumer-protection-act/971026/key-facets-of-the-consumer-protection-act-2019-and-e-commerce-rules); [Bar & Bench](https://www.barandbench.com/columns/consumer-protection-e-commerce-rules-2020-reining-in-of-an-unruly-horse); [Cyril Amarchand blog](https://www.cyrilshroff.com/consumer-protection-e-commerce-rules-need-for-more-clarity/)

### Inferences

- **The marketplace does not need its own PA licence if it uses Razorpay Route.** Razorpay (the PA) onboards the marketplace as a merchant and each vendor/artisan as a linked account. Funds stay in Razorpay's escrow until transfer, which is the structure paras 10 and 13(f)–(g) contemplate. If the marketplace instead collected into its own bank account and paid vendors itself, it would look like PA activity (aggregation for third parties) without authorisation. That pattern should be avoided.
- Every vendor/artisan who receives prepaid funds must be a KYC'd Route linked account before their products can be sold prepaid (para 13(f)). This argues for gating listing activation or prepaid eligibility on linked-account activation status.
- Route `on_hold` + `on_hold_until` is the natural way to implement "release vendor payout after delivery + return window" (equivalent to the old Tr+1 concept). Settlement timing is now contractual, but it must be disclosed transparently.
- COD cash never touches the PA escrow (para 18(b)). COD vendor payouts therefore come from the marketplace's own bank account, after courier remittance, e.g. via RazorpayX payouts. This is a separate ledger path from Route. Whether this disbursement itself counts as aggregation needing a licence was not confirmed; get legal advice.
- Refund-to-source is mandatory for prepaid (refunds via Razorpay refund API). An alternate mode is only allowed on the payer's explicit instruction and only to the payer's own instrument.
- Never accept card fields in the app or backend. Use Razorpay Standard Checkout (hosted iframe/SDK) so the platform stays at the minimal PCI tier. Saved cards = Razorpay/network tokens only.
- Use Indian-region hosting for the payments DB if there is any doubt. The localisation directive formally binds PSOs, but Razorpay and banks may flow it down contractually. A Railway/AWS region choice should be checked against this; AWS ap-south-1 = Mumbai.
- TAT compensation is the bank/PA's obligation. The merchant-side implication is to make payment-status reconciliation (polling `payments` when a webhook is missed) fast enough that "debited but order not created" cases are auto-refunded well inside T+5.

### Gaps

- The full text of the E-Commerce Rules 2020 was not fetched. "Reasonable period" for refunds has no fixed day count in the summaries.
- No primary statement on whether TCS under Section 52 applies to COD orders where the courier, not the operator, collects cash. Needs a tax adviser.
- No official SAQ type for Razorpay Standard Checkout found.
- Whether the Oct 2025 COD-fee "dark pattern" statement became a formal CCPA advisory or order was not confirmed.
- The 2026 e-mandate framework's primary RBI text was not fetched; only press reports were used.
- RBI 2025 MD applicability of nodal/escrow to marketplace-originated COD payouts was not addressed by any source.

## Q3. Which UPI specifics matter for design (intent vs collect, P2P collect phase-out, AutoPay, limits, UPI Lite)?

### Takeaway

P2P collect was discontinued from 1 Oct 2025, but **merchant (P2M) collect remains**. Even so, intent/QR is the safer default. Default UPI P2M limits are Rs 1 lakh, with select categories raised to Rs 5 lakh per transaction from 15 Sep 2025. UPI Lite caps are Rs 1,000 per transaction and a Rs 5,000 balance. AutoPay without AFA is allowed up to Rs 15,000.

### Cited Findings

- NPCI circular (29 Jul 2025): "By October 1, 2025, UPI P2P Collect shall not be allowed to be processed in UPI." Banks and apps must stop initiating, routing or processing P2P collect. **Merchant collect requests remain operational.** P2P collect had already been capped at Rs 2,000 since 2019. Mint (9 Oct 2025) reported the option withdrawn as scheduled — [Business Today](https://www.businesstoday.in/personal-finance/banking/story/npci-to-tighten-upi-rules-peer-to-peer-collect-feature-to-end-in-october-489244-2025-08-13); [MediaNama](https://www.medianama.com/2025/08/223-npci-p2p-collect-payments-oct-1-what-it-means/); [The Week](https://www.theweek.in/wire-updates/business/2025/08/14/dcm65-biz-npci-collect.html)
- NPCI circular (28 Aug 2025, effective 15 Sep 2025) raised P2M limits for verified merchants in select categories to Rs 5 lakh per transaction and Rs 10 lakh per day. Categories include insurance, capital markets, credit-card bills and tax. P2P stays at Rs 1 lakh per day, and banks may set lower caps — [Outlook Money](https://www.outlookmoney.com/banking/npci-changes-upi-transaction-limits-for-key-categories-from-september-15-2025-know-the-details); [Paytm blog](https://paytm.com/blog/news/upi-higher-transaction-limits-sep-2025)
- UPI Lite (RBI, 4 Dec 2024): per-transaction cap raised from Rs 500 to Rs 1,000, and total wallet limit from Rs 2,000 to Rs 5,000. Replenishment is online only, with AFA. Outlook's "per day" wording appears to be an error — [Business Standard](https://business-standard.com/amp/finance/news/rbi-raises-upi-lite-wallet-limit-to-rs-5-000-per-transaction-to-rs-1-000-124120401066_1.html); [Inc42](https://inc42.com/buzz/rbi-increases-wallet-limit-for-upi-lite-to-inr-5000)
- UPI AutoPay (recurring) without AFA is allowed up to Rs 15,000 under the 2026 e-mandate framework — [Business Today](https://www.businesstoday.in/personal-finance/news/story/rbi-caps-recurring-payments-at-rs15000-without-otp-under-new-e-mandate-framework-526759-2026-04-21)
- For failed UPI transactions, auto-reversal is due by T+1, with Rs 100/day compensation after that — [RBI TAT circular](https://website.rbi.org.in/documents/87730/39710850/Circular677ec931a7a65e4d99aa957d8e85bc0a2a.pdf)

### Inferences

- Build UPI as intent (mobile) and QR (desktop) via Razorpay. Merchant collect is still legal but is phased down by apps in practice and is fraud-sensitive. Don't make it the only path.
- Building-materials baskets often exceed Rs 1 lakh. Home goods and building materials are not among the categories raised to Rs 5 lakh, so large carts need card/netbanking/EMI or split payments, and UPI must be shown as limit-bounded.
- Doorstep "pay on delivery via UPI" would be a courier-side dynamic QR (courier's PA). The money still arrives via courier remittance, not Razorpay, so treat it as COD in the ledger. Alternatively, send a Razorpay payment link or QR tied to the order before or at delivery, which converts it to prepaid and puts the funds in escrow/Route.

### Gaps

- The NPCI circular PDFs themselves (P2P collect; Aug 2025 limits) were not fetched. Facts come from consistent press coverage.
- No source confirmed whether NPCI has scheduled any restriction on P2M collect after 2025.
- No source on UPI "pay-on-delivery" QR reconciliation APIs from Shiprocket or Delhivery.
