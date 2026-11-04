# India primary regulation: gap closure for the production payment design

Research date: 2026-11-03. India only. This pass replaces press and secondary citations from `research_notes/Production payment system design/cod_and_india_regulation.md`, `failure_scenarios.md` and the "Indian rules" table of `reports/Production payment system design.md` with primary texts where they could be reached. It does not redo the RBI PA Master Direction paras 10(b), 13(f) and 18(b), which were already primary-sourced.

Labels used below:

- **[PRIMARY]**: the regulator's own page or PDF, read directly.
- **[PRIMARY-COPY]**: a verbatim copy of the official text hosted by a third party (gazette scan, PA-hosted annex), read directly.
- **[SECONDARY]**: law-firm, regtech or press summary.
- **[SUPERSEDED]**: no longer the current rule.

How the sources were read: several PDFs (RBI TAT annex copy, E-Commerce Rules gazette, CBIC TCS FAQ, CGST Notification 15/2024, PIB release, law-firm alerts) came back from WebFetch as binary. Their text was extracted locally with `pdftotext`. The NPCI OC 185B circular is a scanned image, so it was decoded with pdf.js and read visually.

### Corrections to earlier notes and report (summary for the writer)

| Earlier claim                                      | Status after this pass                                                                                                                  | Source                                                                                                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CNP/e-commerce card TAT "probably merged with POS" | **Confirmed: T+5, ₹100/day beyond** (shared cell with PoS)                                                                              | [TAT annex copy](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>) |
| TAT applies to refunds generally                   | **Only failed transactions**; merchant refunds of successful payments are not covered                                                   | same                                                                                                                                                                                                                                        |
| Check status 90 s vs 45–60 s conflict              | 90 s is the rule. 45–60 s only "after NPCI revised communication"; max 3, "preferably within 2 hours"                                   | [TeamLease OC 215](https://teamleaseregtech.com/updates/article/42023/npci-issued-a-circular-regarding-the-initial-streamlining-of-the-check/)                                                                                              |
| UPI ₹5 lakh "select categories" (Outlook)          | Exact 11-row table, Verified Merchants only, 15 Sep 2025. Home goods not included                                                       | [NPCI OC 185B](https://www.npci.org.in/uploads/UPI_OC_No185_B_FY_2025_26_Addendum_to_OC_185_A_Implementation_of_higher_per_transaction_limit_for_specific_categories_in_UPI_ba517a0902.pdf)                                                 |
| Merchant collect: sources disagree                 | Not a disagreement, a sequence: P2P ended 1 Oct 2025 (OC 220); P2M deprecated 28 Feb 2026 with iOS/MCC/mandate exemptions               | PayU, Cashfree, Razorpay docs                                                                                                                                                                                                               |
| E-mandate 2026 (press only)                        | **Primary-verified**: ₹15k, ₹1 lakh for insurance/MF/credit-card bills, 24 h notice                                                     | [RBI Id=13374](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13374)                                                                                                                                                               |
| E-Commerce Rules via Mondaq                        | Gazette text: cancellation **4(8)**, refunds **4(10)** "reasonable period", payment-fee disclosure 5(3)(d), single-figure total 6(5)(b) | [Gazette copy](https://taxguru.in/wp-content/uploads/2020/07/Consumer-Protection-E-Commerce-Rules-2020.pdf)                                                                                                                                 |
| (missing)                                          | **2026 amendment, effective 1 Jan 2027**: dark-pattern self-audit, 30-day prior price, bundled-fee ban, etc.                            | [PIB 2308759](https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2308759)                                                                                                                                                                  |
| COD fee "dark pattern" (PTC News)                  | Probe opened Oct 2025. No published COD-specific order found. Drip-pricing definition is the hook                                       | Inc42; Verdictum                                                                                                                                                                                                                            |
| TCS 0.5% (Mondaq)                                  | **Primary-verified**: 0.25% CGST via Notif. 15/2024-CT. TCS turns on who "is to collect" consideration, not payment mode                | [Notif. 15/2024](https://gstcouncil.gov.in/sites/default/files/2024-09/central-tax-15-2024-11072024.pdf); [CBIC FAQ](https://www.gstcouncil.gov.in/sites/default/files/2024-02/faqs_tcs.pdf)                                                |
| Data localisation "binds PSOs, may flow down"      | Confirmed: FAQ puts responsibility on PSOs and their engaged entities; merchants not named; PA MD 9(c)                                  | [RBI FAQ 130](https://www.rbi.org.in/Scripts/FAQView.aspx?Id=130)                                                                                                                                                                           |
| (new)                                              | UPI Consolidated Circular v1.0 (18 Sep 2026) withdraws listed OCs; the OC numbers above may now be historical                           | [TeamLease](https://teamleaseregtech.com/updates/article/59640/npci-issued-the-upi-consolidated-circular-version-10)                                                                                                                        |

---

## Q1. RBI TAT circular (RBI/2019-20/67): exact annex rows for e-commerce cards, UPI P2M, IMPS and wallets; does it cover merchant refunds?

### Takeaway

The annex is now read verbatim, and it closes the "CNP row" gap. **Card Not Present (e-commerce), "account debited but confirmation not received at merchant's system", has auto-reversal within T+5 and ₹100/day beyond T+5.** It shares one cell with the POS row. UPI P2M is T+5, while UPI transfer and IMPS are T+1. On-us PPI/wallet is T+1, and off-us PPI follows the underlying rail. The framework covers only **failed** transactions "not fully completed due to any reason not attributable to the customer". **It does not cover merchant-initiated refunds of successful purchases.** Those fall under the PA MD's refund-to-source rule and the E-Commerce Rules' "reasonable period" (Q4).

### Cited Findings

- Circular header: "RBI/2019-20/67 DPSS.CO.PD No.629/02.01.014/2019-20, September 20, 2019", addressed to "All Operators and Participants of Authorised Payment Systems". Issued under s.10(2) read with s.18 of the PSS Act 2007, and "shall come into effect from October 15, 2019" — [PRIMARY-COPY: Cashfree-hosted Annexure I reproducing the circular and annex](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>). The RBI notification page [Id=11693](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693) and the website.rbi.org.in PDF (`Circular677ec931…pdf`) both redirect to the RBI homepage (301), and no rbidocs.rbi.org.in copy was found.
- Para 4: "the prescribed TAT is the outer limit for resolution of failed transactions; and the banks and other operators / system participants shall endeavour towards quicker resolution". Para 5: compensation "shall be effected to the customer's account suo moto, without waiting for a complaint or claim from the customer". Para 6: complaints go to the "Reserve Bank - Integrated Ombudsman Scheme, 2021" — [PRIMARY-COPY](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>). The 2021 scheme postdates 2019, so this copy reflects RBI's later-updated web text (inference).
- Annex General Instruction 2: "A 'failed transaction' is a transaction which has not been fully completed due to any reason not attributable to the customer such as failure in communication links, non-availability of cash in an ATM, time-out of sessions, etc. Failed transactions shall also include the credits which could not be effected to the beneficiary account on account of lack of full information or lack of proper information and delay in initiating a reversal transaction." Instruction 4: "T is the day of transaction and refers to the calendar date." Instruction 6: "The term bank includes non-banks also and applies to them wherever they are authorised to operate." Instruction 7: only domestic transactions are covered — [PRIMARY-COPY](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>)
- Annex rows, verbatim in substance — [PRIMARY-COPY](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>):

| Row                                        | Incident                                                                                                                                          | Auto-reversal timeline                               | Compensation            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| 2(a) Card to card                          | Card account debited, beneficiary card not credited                                                                                               | Reversed (R) latest T+1 if credit not effected       | ₹100/day beyond T+1     |
| 2(b) PoS (card present), incl. cash at PoS | Debited, no confirmation at merchant location (no charge slip)                                                                                    | **Auto-reversal within T+5** (shared cell with 2(c)) | **₹100/day beyond T+5** |
| **2(c) Card Not Present (e-commerce)**     | **"Account debited but confirmation not received at merchant's system"**                                                                          | **Auto-reversal within T+5** (shared cell)           | **₹100/day beyond T+5** |
| 3(a) IMPS                                  | Debited, beneficiary not credited                                                                                                                 | Beneficiary bank auto-reverses latest T+1            | ₹100/day beyond T+1     |
| 4(a) UPI transfer                          | Debited, beneficiary not credited                                                                                                                 | Beneficiary bank auto-reverses latest T+1            | ₹100/day beyond T+1     |
| **4(b) UPI P2M**                           | "Account debited but transaction confirmation not received at merchant location (payment to merchant)"                                            | **Auto-reversal within T+5**                         | **₹100/day beyond T+5** |
| 7(a)/(b) NACH                              | Delay crediting/reversal; debit despite mandate revocation                                                                                        | T+1                                                  | ₹100/day beyond T+1     |
| 8(a) PPI off-us                            | "The transaction will ride on UPI, card network, IMPS, etc., as the case may be. The TAT and compensation rule of respective system shall apply." | —                                                    | —                       |
| **8(b) PPI on-us**                         | Beneficiary PPI not credited; "PPI debited but transaction confirmation not received at merchant location"                                        | **Reversal in remitter's account within T+1**        | ₹100/day beyond T+1     |

- Cashfree's cover note maps the clauses relevant to PAs: 2(c) card, 3(a) "Net banking" (IMPS), 4(b) UPI, 7(a)/(b) mandates, 8(a)/(b) wallet — [PRIMARY-COPY cover note, SECONDARY interpretation](<https://cashfreelogo.cashfree.com/website/pdf/ANNEXURE%20I_%20Harmonisation%20of%20Turnaround%20Time%20(TAT)%20and%20Customer%20Compensation%20for%20Failed%20Transactions%20Using%20Authorised%20Payment%20Systems.pdf>). Its mapping of netbanking to the IMPS row is Cashfree's own; the annex has **no separate netbanking row**.
- The RBI PA MD 2025 says separately that "All refunds shall be made to the original method of payment, unless specifically instructed by the payer…" (para 10(f)). Para 8(a) requires the PA's grievance mechanism to "include timelines for processing refunds". Para 18(h) says "refund transactions shall be routed back through the escrow account unless the refund is directly managed by the merchant", provided the payer has been made aware under the PA–merchant contract — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)

### Inferences

- A cancellation, return or other merchant-initiated refund of a **successful** payment is not a "failed transaction", so the T+1/T+5 and ₹100/day framework does not apply to it. No RBI circular found fixes a day-count for merchant refunds. The binding rules are: refund to the original method (PA MD 10(f)); the PA's own published refund timelines (PA MD 8(a)); and "within a reasonable period of time" (E-Commerce Rules 4(10)).
- "Debited, but our order shows failed" on card/e-commerce or UPI P2M has an outer limit of T+5 calendar days, and T+1 for on-us wallets. Our reconciler should auto-refund or auto-confirm well before T+5. The obligation sits on the bank or PA, but it reaches us as complaints and chargebacks.
- Netbanking has no row of its own. Treat it as T+5 by analogy (merchant confirmation not received), not as a rule.

### Gaps

- No rbi.org.in or rbidocs copy of the circular could be loaded; the RBI URLs redirect to the homepage. The verbatim text comes from a PA-hosted reproduction whose Ombudsman wording shows it was refreshed after 2021. The row content matches the RBI Common Person summary used earlier.
- The Master Circular on customer service was not located or checked for a merchant-refund TAT.

---

## Q2. NPCI 2025–26 circulars: check-status limits, P2P collect end, merchant collect deprecation, P2M category limits

### Takeaway

- **P2M limits (primary, NPCI OC 185B, 28 Aug 2025):** read verbatim. ₹5 lakh per transaction applies only to 11 listed MCC/purpose categories: capital market, insurance, GeM EMD, travel 4722, credit-card bills, collections 7322, B2B "Business/Merchant", jewellery ₹2 lakh, FX retail, and digital account opening. It applies only to "Verified Merchants", and compliance was due by 15 Sep 2025. **Home goods and building-materials MCCs are not on the list**, so the standard P2M limit applies to us.
- **Check status:** the "90 s vs 45–60 s" conflict is explained by the circular's own wording. OC 215 (26 Apr 2025) sets the first call at 90 s and allows 45–60 s only "after NPCI revised communication". The cap is 3 calls, "preferably within 2 hours". This comes from a regtech summary; the NPCI PDF itself was not reachable.
- **P2P collect:** ended 1 Oct 2025 under NPCI/UPI/OC/220/2025-26 (29 Jul 2025, per regtech).
- **Merchant (P2M) collect:** deprecated from **28 Feb 2026** with exemptions. Three PAs say this independently; no NPCI circular number was found.
- **New:** NPCI issued a **UPI Consolidated Circular v1.0 (NPCI/UPI/CC/01, 18 Sep 2026)**. It consolidates operating circulars issued up to 31 Jul 2026 and withdraws those listed in its Annexure G. Individual OC numbers may therefore now be historical.

### Cited Findings

**P2M per-transaction limits: NPCI/UPI/2025-26/OC/185B, 28 Aug 2025 [PRIMARY]**

- Subject: "Addendum to OC 185 A – Implementation of higher per transaction limit for specific categories in UPI". It refers to NPCI/UPI/2024-25/OC/185 A of 24 Aug 2024, which raised tax-payment categories to ₹5 lakh — [NPCI PDF](https://www.npci.org.in/uploads/UPI_OC_No185_B_FY_2025_26_Addendum_to_OC_185_A_Implementation_of_higher_per_transaction_limit_for_specific_categories_in_UPI_ba517a0902.pdf)
- Conditions: (1) "The enhanced limits shall be applicable for merchants which are categorised as 'Verified Merchant'". (2) Acquirers must ensure the merchants comply with OC-100/2020-21, OC-163/2022-23, OC-163A/2023-24 and OC-190/2023-24. (3) "Member banks may continue to be provided the discretion to set their internal limits based on their internal policy, within the overall ceilings prescribed by NPCI." (4) "The per transaction limit for P2P shall continue as per the extant guidelines." Compliance was due "by 15th September 2025" — [NPCI PDF](https://www.npci.org.in/uploads/UPI_OC_No185_B_FY_2025_26_Addendum_to_OC_185_A_Implementation_of_higher_per_transaction_limit_for_specific_categories_in_UPI_ba517a0902.pdf)
- Annexure I, transcribed from the scanned circular — [NPCI PDF](https://www.npci.org.in/uploads/UPI_OC_No185_B_FY_2025_26_Addendum_to_OC_185_A_Implementation_of_higher_per_transaction_limit_for_specific_categories_in_UPI_ba517a0902.pdf):

| #   | Category                                        | MCC / identifier                                            | Per txn | Cumulative 24 h\* |
| --- | ----------------------------------------------- | ----------------------------------------------------------- | ------- | ----------------- |
| 1   | Capital Market                                  | 6211                                                        | ₹5 L    | ₹10 L             |
| 2   | Insurance                                       | 5960, 6300, 6529                                            | ₹5 L    | ₹10 L             |
| 3   | Government e-Market Place (EMD payments)        | 9311                                                        | ₹5 L    | ₹10 L             |
| 4   | Travel                                          | 4722                                                        | ₹5 L    | ₹10 L             |
| 5   | Credit Card Bill Payments                       | 5413                                                        | ₹5 L    | ₹6 L              |
| 6   | Collections                                     | 7322                                                        | ₹5 L    | ₹10 L             |
| 7   | Business/Merchant (incl. pre-approved payments) | "Payer MCC shall not be 0000 and Purpose Code – 20 or 15"   | ₹5 L    | NA                |
| 8   | Jewellery                                       | 5944                                                        | ₹2 L    | ₹6 L              |
| 9   | FX Retail use case with BBPS platform           | MCC-6012, purpose code BF (regular) / 01 (one-time mandate) | ₹5 L    | ₹5 L              |
| 10  | Digital Account Opening for Term Deposits       | 7410 (new MCC)                                              | ₹5 L    | ₹5 L              |
| 11  | Digital Account Opening – Initial Funding       | 7409 (new MCC)                                              | ₹2 L    | ₹2 L              |

\* "Issuing banks are required to ensure that such cumulative limits are kept at their end."

- The standard UPI P2M limit of ₹1 lakh/transaction is still reported only by secondary sources, e.g. that P2P stays at ₹1 lakh/day — [SECONDARY: newsonair (Prasar Bharati)](https://www.newsonair.gov.in/npci-hikes-upi-limit-for-merchant-payments-to-%E2%82%B910-lakh-per-day); [SECONDARY: Outlook Money](https://www.outlookmoney.com/banking/npci-changes-upi-transaction-limits-for-key-categories-from-september-15-2025-know-the-details)

**Check Transaction Status API: NPCI/UPI/OC/215/2025-26, 26 Apr 2025 [SECONDARY: regtech summary quoting the circular]**

- "PSP banks/Acquiring banks shall initiate the first check transaction status API after 90 seconds from the initiation/authentication of the original transaction." Members may initiate it "after 45 to 60 seconds … after NPCI revised communication". The cap is a "maximum of 3 check transaction status APIs, preferably within 2 hours". If an Annexure 1 error code comes back, the transaction is treated as failed and no further checks are made. On U48 ("Transaction ID not present") within 2 hours, check settlement files after the cycle, or make one UDIR check. Effective "on an immediate basis", with a CERT-In empanelled audit of API usage — [TeamLease RegTech OC 215](https://teamleaseregtech.com/updates/article/42023/npci-issued-a-circular-regarding-the-initial-streamlining-of-the-check/). TeamLease's own gloss says "UPI OC 214 changed the timers". Read with the quoted text, the 45–60 s figure is a future option that needs a further NPCI communication; it is not a confirmed current rule.
- A separate circular, NPCI/UPI/OC No. 215A/2025-26 of 21 May 2025 ("Guidelines on usage of UPI APIs": balance enquiry, list-account and other caps), was due by 31 Jul 2025, with undertakings and CERT-In audit reports due 31 Aug 2025 — [TeamLease RegTech OC 215A](https://teamleaseregtech.com/updates/article/42884/npci-issued-guidelines-on-the-usage-of-upi-api/); NPCI PDF path listed (not loadable): [npci.org.in OC 215A](https://www.npci.org.in/PDF/npci/upi/circular/2025/UPI-OC-No-215-A-FY-2025-26-Guidelines-on-usage-of-UPI-APIs.pdf)
- Press reports of "90 s / 3 calls in 2 h / deadline 31 Jul 2025" ([Business Standard](https://www.business-standard.com/amp/finance/news/npci-directs-upi-members-to-follow-new-api-guidelines-to-avoid-disruptions-125042801443_1.html), [Inc42](https://inc42.com/buzz/upi-outage-npci-directs-banks-to-limit-check-transaction-api-usage/)) merge OC 215 and OC 215A — [SECONDARY]

**P2P collect discontinuation: NPCI/UPI/OC/220/2025-26, 29 Jul 2025 [SECONDARY]**

- "Person-to-Person (P2P) Collect transactions on UPI will be discontinued from October 01, 2025." Banks, PSPs and apps must block "initiation, routing, or processing" — [TeamLease RegTech OC 220](https://www.teamleaseregtech.com/updates/article/45492/npci-issued-a-notification-regarding-the-discontinuation-of-the-servic/). Press quote: "By October 1, 2025, UPI P2P Collect shall not be allowed to be processed in UPI." Merchant collect was unaffected at that time — [Business Today](https://www.businesstoday.in/personal-finance/banking/story/npci-to-tighten-upi-rules-peer-to-peer-collect-feature-to-end-in-october-489244-2025-08-13); [MediaNama](https://www.medianama.com/2025/08/223-npci-p2p-collect-payments-oct-1-what-it-means/)

**Merchant (P2M) collect deprecation, 28 Feb 2026 [SECONDARY: three PAs agree]**

- PayU: "the UPI Collect flow will be deprecated effective 28 February 2026". "Manual entry of VPA/UPI ID or mobile number for payments and mandate registration will be discontinued." Exemptions: MCC 6012 & 6211 (IPO/secondary market); "Transactions initiated via iOS mobile applications and mobile web platforms"; UPI mandates "Only for executing, modifying, or revoking existing mandates"; PACB cross-border — [PayU docs](https://docs.payu.in/docs/upi-collect-disablement-information)
- Cashfree: "UPI Collect for P2M transactions must be discontinued". It "has blocked UPI Collect on Android and desktop from February 28, 2026", and "iOS is currently exempted by NPCI and will continue to support UPI Collect until further notice". Mandates (OTM, Autopay execution/modify/revoke), eRupi and PACB are exempt — [Cashfree docs](https://www.cashfree.com/docs/payments/manage/payment-methods/upi-collect)
- Razorpay (from the earlier round): deprecated from 28 Feb 2026 with the same exemptions — [Razorpay S2S UPI Collect](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/collect/)
- A press report dated 4 Feb 2026 says NPCI asked PAs and banks to discontinue UPI Collect for P2M. The page was truncated, so no circular number or date was obtained — [The Head and The Tale](https://theheadandtale.com/explainer/npci-asks-banks-payments-firms-to-discontinue-upi-collect-for-p2m-transactions/)
- **Conflict note:** PayU exempts "iOS mobile applications and mobile web" outright. Cashfree's matrix blocks mobile web on Android and keeps only iOS. The two PAs read the exemption differently.

**UPI Consolidated Circular v1.0 [SECONDARY]**

- "NPCI/UPI/CC/01", issued 18 Sep 2026: "The Circular consolidates the UPI Operating Circulars issued up to July 31, 2026". It covers merchant transactions, API usage, AutoPay, UPI Lite, settlement, reconciliation and dispute management, and withdraws the Operating Circulars listed in Annexure G. Revised merchant QR requirements apply to "QR codes issued or replaced from December 1, 2026" — [TeamLease RegTech](https://teamleaseregtech.com/updates/article/59640/npci-issued-the-upi-consolidated-circular-version-10)

### Inferences

- Building materials and home goods do not map to any OC 185B category, so standard P2M limits apply (₹1 lakh per transaction is widely reported but not primary-verified here). Payer banks may set lower limits. Carts above that need card, netbanking, EMI or split payment. Category 7 (B2B, payer MCC ≠ 0000) could lift B2B purchases by registered contractors to ₹5 lakh, but only if the payer is a merchant-coded entity. That is a narrow, PSP-dependent path; confirm with Razorpay.
- Our own status polling of Razorpay is not bound by NPCI's limits; those bind PSP and acquiring banks. But Razorpay's view of a UPI payment cannot settle faster than its bank's first check at 90 s plus up to 3 checks in about 2 h. So reservation TTL and pending UX for UPI should assume **minutes to about 2 hours** of uncertainty, with webhooks plus late reconciliation.
- Treat UPI Collect as gone for Android and desktop. Build intent (mobile) and QR (desktop). Keep collect only behind Razorpay's own iOS fallback, if at all.

### Gaps

- No NPCI-hosted PDF for OC 215, OC 220 or the P2M-collect directive could be loaded. npci.org.in listing pages render client-side and returned only the site header to WebFetch, and old `/PDF/…` paths returned the header too. Only OC 185B (`/uploads/…` path) loaded.
- The circular number and date of the P2M-collect discontinuation directive are unconfirmed.
- Whether the 18 Sep 2026 consolidated circular changes check-status timers, collect or limits is unknown; the full text was not available.
- No primary NPCI source was found for the standard ₹1 lakh P2M limit (OC 76/76A/76B are listed but were not read).

---

## Q3. RBI e-mandate / recurring framework 2026

### Takeaway

**Now primary-verified.** "Digital Payments – E-mandate Framework, 2026" (RBI/DPSS/2026-27/396; RBI/CO.DPSS.POLC.No.S56/02.14.003/2026-27, 21 Apr 2026, effective immediately) covers recurring transactions on cards, PPIs and UPI. Up to ₹15,000 per transaction needs no AFA. Insurance premiums, mutual fund subscriptions and credit-card bills are allowed up to ₹1,00,000. A pre-debit notice is required at least 24 h before each debit. It repeals the 2019–2024 e-mandate circulars.

### Cited Findings

- Title, references and date: "Digital Payments – E-mandate Framework, 2026", RBI/DPSS/2026-27/396; RBI/CO.DPSS.POLC.No.S56/02.14.003/2026-27, April 21, 2026. Clause 1(b): effective immediately — [PRIMARY: RBI notification Id=13374](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13374); also published as a Master Direction — [RBI MD id=13374](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13374)
- Clause 8(a): "All recurring transactions may be authorised without AFA up to ₹15,000/- per transaction." Clause 8(b): "Payment of insurance premiums, subscription to mutual funds, and credit card bill payments" without AFA up to ₹1,00,000 per transaction — [PRIMARY](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13374)
- Clause 5(a): "The first transaction under an e-mandate shall require AFA validation". It may be combined with registration AFA. Clause 6(a): the pre-transaction notification must be sent "at least 24 hours prior to the actual charge / debit" — [PRIMARY](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13374)
- Clause 2 scope: "all Payment System Providers and Payment System Participants", for recurring domestic and cross-border transactions on cards/PPI/UPI. Clause 6: the notice must state merchant name, amount, date/time, mandate reference and reason. Clause 6(c): opt-out per transaction or per mandate, with AFA. Clause 6(d): no pre-debit notice for FASTag/NCMC auto-replenish. Clause 10(a): "No charges shall be levied to the customer for availing the e-mandate facility…". Clause 11 repeals eight earlier instruments, from DPSS.CO.PD.No.447/02.14.003/2019-20 (21 Aug 2019) through CO.DPSS.POLC.No.S528/02-14-003/2024-25 (22 Aug 2024) — [SECONDARY reproduction: TaxGuru](https://taxguru.in/rbi/rbi-issues-consolidated-directions-digital-payments-e-mandate-framework-2026.html) (clauses 5, 6(a), 8 cross-checked against the RBI page)
- **[SUPERSEDED]:** the 2021 framework (CO.DPSS.POLC.No.S34, 31 Mar 2021) and the June 2022 ₹15,000 circular (S-518) are repealed by clause 11 — [SECONDARY: TaxGuru](https://taxguru.in/rbi/rbi-issues-consolidated-directions-digital-payments-e-mandate-framework-2026.html)

### Inferences

- Not core to a one-off marketplace checkout. If we later offer EMIs, subscriptions or vendor plan billing via mandates, home-goods payments over ₹15,000 will need AFA on every debit (no ₹1 lakh category applies), and the issuer sends the 24 h pre-debit notice, not us.

### Gaps

- The full clause 11 repeal list was read only via TaxGuru's reproduction, not the RBI page directly.

---

## Q4. Consumer Protection (E-Commerce) Rules 2020, the 2026 amendment, dark patterns and COD fees

### Takeaway

The gazette text (G.S.R. 462(E), 23 Jul 2020) is now read verbatim. **Corrections to the earlier notes:** the cancellation-charge symmetry rule is **Rule 4(8)**, and refunds are **Rule 4(10)**: payments towards accepted refund requests must be made "as prescribed by the Reserve Bank of India … within a reasonable period of time". No day-count is set. Rule 5(3) requires marketplaces to display seller details, return/refund information and payment-method fees. Rule 6(5)(b) requires the "total price in single figure" with the breakup of all compulsory and voluntary charges.
**New since the earlier round:** the **Consumer Protection (E-Commerce) (Amendment) Rules, 2026** (G.S.R. 789(E), 9 Sep 2026; PIB 10 Sep 2026) take effect **1 Jan 2027**. They mandate compliance with the 2023 Dark Patterns Guidelines, a **yearly self-audit with a displayed compliance certificate**, prior-30-day-lowest-price display on discounts, sponsored-listing labels, the seller name on invoices, a ban on bundled unrelated fees, and NCH convergence. There is **no specific COD-fee rule**. Drip pricing ("elements of prices are not revealed upfront…") is a listed dark pattern. The COD probe announced in Oct 2025 produced **no published CCPA order** that could be found.

### Cited Findings

**Principal rules: gazette text [PRIMARY-COPY: Gazette of India scan hosted by TaxGuru](https://taxguru.in/wp-content/uploads/2020/07/Consumer-Protection-E-Commerce-Rules-2020.pdf)** (consumeraffairs.nic.in refused the connection, ECONNREFUSED)

- "G.S.R. 462(E).—", Ministry of Consumer Affairs notification, New Delhi, 23rd July 2020, under s.101(1)(zg) of the Consumer Protection Act 2019. In force on publication.
- Rule 2(1)(b): applies to "all models of e-commerce, including marketplace and inventory models". Rule 3(1)(g): "'marketplace e-commerce entity' means an e-commerce entity which provides an information technology platform on a digital or electronic network to facilitate transactions between buyers and sellers". Rule 3(1)(b): "e-commerce entity" excludes "a seller offering his goods or services for sale on a marketplace e-commerce entity".
- Rule 4(2): legal name, HQ/branch addresses, website details, and customer-care and grievance-officer contacts, displayed prominently. Rule 4(4)–(5): grievance officer; "acknowledges the receipt of any consumer complaint within forty-eight hours and redresses the complaint within one month".
- **Rule 4(8):** "No e-commerce entity shall impose cancellation charges on consumers cancelling after confirming purchase unless similar charges are also borne by the e-commerce entity, if they cancel the purchase order unilaterally for any reason."
- Rule 4(9): consent only "through an explicit and affirmative action … including in the form of pre-ticked checkboxes" is barred.
- **Rule 4(10):** "Every e-commerce entity shall effect all payments towards accepted refund requests of the consumers as prescribed by the Reserve Bank of India or any other competent authority under any law for the time being in force, within a reasonable period of time, or as prescribed under applicable laws."
- Rule 4(11)(b): no discrimination between consumers of the same class.
- **Rule 5(3):** marketplaces must display "(a) details about the sellers … name of their business, whether registered or not, their geographic address, customer care number, any rating …". Also: "(c) information relating to return, refund, exchange, warranty and guarantee, delivery and shipment, modes of payment, and grievance redressal mechanism"; "(d) information on available payment methods, the security of those payment methods, **any fees or charges payable by users**, the procedure to cancel regular payments under those methods, charge-back options, if any, and the contact information of the relevant payment service provider"; (e) all seller info under 6(5); (f) ranking parameters. Rule 5(4): disclose differentiated treatment of sellers in seller T&Cs.
- **Rule 6(3):** a marketplace seller cannot refuse return/refund for defective, deficient or spurious goods, goods not as advertised, or late delivery (except force majeure). Rule 6(4): prior written contract with the marketplace, a seller grievance officer (48 h / 1 month), and legal name, address, GSTIN and PAN to the marketplace. **Rule 6(5)(b):** "total price in single figure of any good or service, along with the breakup price … showing all the compulsory and voluntary charges such as delivery charges, postage and handling charges, conveyance charges and the applicable tax". Rule 6(5)(g): return/refund terms "including information related to costs of return shipping".
- Rule 8: contraventions are dealt with under the Consumer Protection Act 2019.

**2026 amendment**

- PIB, 10 Sep 2026: amended rules "to come into force from January 1, 2027". Key provisions: a copy of the recorded complaint to the complainant; no misleading search manipulation; sponsored listings disclosed; "Where a price reduction is announced, the reduced price and prior price shall both be displayed. The 'prior price' means the lowest price at which the goods or services were offered during the 30 days preceding the announcement"; "E-commerce entities shall comply with the Guidelines for Prevention and Regulation of Dark Patterns, 2023, undertake a yearly self-audit and prominently display a certificate of compliance"; marketplaces to provide "return/refund, warranty, delivery and payment details"; no use of consumer information for specified purposes without express consent; "Marketplace e-commerce entities shall not collect bundled fees for services unrelated to the e-commerce platform, subject to the specified exception for loyalty or membership programmes"; importer and country of origin disclosed — [PRIMARY: PIB Release ID 2308759](https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2308759) (read from the PDF print at [MediaNama mirror](https://www.medianama.com/wp-content/uploads/2026/09/Press-Release_-Press-Information-Bureau.pdf))
- Gazette reference G.S.R. 789(E), 9 Sep 2026. Rules amended or inserted: 3(1)(j); 4(2), 4(5), 4(6), 4(7) (NCH partnership now mandatory); 4(11)(c); 4(12)–(15) (sponsored listings, prior price, seller name on invoice "in the same font size", dark-pattern self-audit as 4(15)); 5(3)(a),(c),(f); 5(6) consent; 5(7) bundled fees; 6(5)(d); 6(5)(j) (GSTIN/MSME IDs); 7(1)(a). **Rules 4(8) (cancellation) and 4(10) (refunds) are unchanged.** No total-price or COD-fee rule was added — [SECONDARY: TaxGuru summary of the gazette](https://taxguru.in/corporate-law/consumer-protection-commerce-amendment-rules-2026.html); [SECONDARY: MediaNama](https://www.medianama.com/2026/09/223-consumer-protection-ecommerce-amendment-rules-2026/)

**Dark Patterns Guidelines, 2023 (CCPA, notified 30 Nov 2023) [SECONDARY reproduction]**

- Apply to "all platforms, systematically offering goods or services in India; advertisers; and sellers" — [Verdictum](https://www.verdictum.in/news/central-consumer-protection-authority-dark-patterns-guidelines-notification-1507072)
- "Drip pricing" means a practice whereby "(i) elements of prices are not revealed upfront or are revealed surreptitiously within the user experience; or (ii) revealing the price post-confirmation of purchase, i.e. charging an amount higher than the amount disclosed at the time of checkout; or (iii) a product or service is advertised as free without appropriate disclosure …; or (iv) a user is prevented from availing a service which is already paid for unless something additional is purchased." — [Verdictum](https://www.verdictum.in/news/central-consumer-protection-authority-dark-patterns-guidelines-notification-1507072)
- "Basket sneaking": "inclusion of additional items such as products, services, payments to charity or donation at the time of checkout from a platform, without the consent of the user, such that the total amount payable by the user is more than the amount payable for the product or service chosen by the user." "Interface interference" is also defined — [Verdictum](https://www.verdictum.in/news/central-consumer-protection-authority-dark-patterns-guidelines-notification-1507072)
- Thirteen specified patterns, including drip pricing and basket sneaking — [SECONDARY: search excerpt, Sansa Legal](https://www.sansalegal.com/post/dark-patterns-in-e-commerce-ccpa-guidelines-and-compliance-in-india-2026). The draft illustration of drip pricing: price X shown at checkout, then Y > X charged at payment — [Draft guidelines on consumeraffairs.nic.in](https://consumeraffairs.nic.in/sites/default/files/file-uploads/latestnews/Draft%20Guidelines%20for%20Prevention%20and%20Regulation%20of%20Dark%20Patterns%202023.pdf) (search excerpt only; server unreachable)

**COD fee: after the Oct 2025 statement**

- Oct 2025: the Ministry and the CCPA began a probe into extra COD charges ("Amazon charges ₹7-10 and Flipkart and FirstCry charge an additional ₹10"), alongside delayed refunds on cancelled prepaid orders — [SECONDARY: Inc42](https://inc42.com/buzz/ccpa-probing-ecommerce-platforms-for-cash-on-delivery-dark-patterns/); [Storyboard18](https://storyboard18.com/digital/consumer-affairs-ministry-probes-e-commerce-platforms-over-extra-cash-on-delivery-charges-81961.htm)
- Aug 2026: a government reply says the CCPA imposed ₹20 lakh in dark-pattern penalties. The page returned 403, so whether COD fees are included is unknown — [SECONDARY: ANI (search excerpt)](https://www.aninews.in/news/business/govt-says-ccpa-imposes-rs-20-lakh-for-dark-patterns-steps-up-action-against-deceptive-online-practices20260806161831/)
- June 2025: a CCPA advisory asked e-commerce platforms to self-audit for dark patterns within 3 months — [SECONDARY: newsonair](https://www.newsonair.gov.in/central-consumer-protection-authority-advises-all-e-commerce-platforms-to-not-engage-in-deceptive-unfair-trade-practice)

### Inferences

- A COD fee is **not per se prohibited** by any primary text found. Rule 5(3)(d) actually contemplates "fees or charges payable by users" per payment method, provided they are disclosed. It becomes risky under drip pricing when it is not shown upfront, or when it appears only after the method is chosen or after confirmation. The minister's "dark pattern" framing has not been backed by a published order. Design rule: if any COD or payment-method fee exists, show it on the product/cart total before checkout and in the single-figure total (Rule 6(5)(b)). Better still, use a prepaid incentive, as already recommended.
- The cancellation ADR must be symmetric (4(8)): if we charge a customer for cancelling after confirmation, we must bear a similar charge when a vendor or the platform cancels unilaterally. Refunds: no statutory day-count. A published SLA plus the RBI refund-to-source rule meets "reasonable period"; a 5–7 working-day SLA is industry-typical (inference).
- **From 1 Jan 2027 (in about 2 months):** the yearly dark-pattern self-audit certificate, the 30-day prior-price rule for any "sale" strikethrough price, sponsored-listing labels, and the seller name on invoices. These are product backlog items, not payment-core items.
- We are a marketplace e-commerce entity. Rule 5(3)(a) seller details (business name, address, customer care, rating) must appear pre-purchase on the listing, and 6(4)(d) GSTIN/PAN must be collected from vendors.

### Gaps

- The official gazette PDF of the 2026 amendment (G.S.R. 789(E)) was not read directly; clause numbering comes from a TaxGuru summary.
- The final Dark Patterns Guidelines gazette text was not read directly (verbatim definitions via Verdictum). Whether the final text has a proviso excluding "necessary fees disclosed at the time of purchase" from basket sneaking is unverified.
- No CCPA order specific to COD fees was found. Whether COD fees featured in the ₹20 lakh penalties is unknown.

---

## Q5. GST: Section 52 TCS on COD orders, the 0.5% rate, and GST on PG fees

### Takeaway

The rate is primary-verified. CGST Notification **15/2024-Central Tax (10 Jul 2024)** replaced "half per cent." with "0.25 per cent." in Notification 52/2018-CT, giving 0.25% CGST + 0.25% SGST = 0.5% intra-state. 0.5% IGST for inter-state comes via 01/2024-IT (secondary). **COD:** the statutory trigger is supplies "where the consideration with respect to such supplies is to be collected by such operator". CBIC's FAQ says TCS is due "irrespective of the actual collection" where the business model is that the operator collects. **Payment mode is not a criterion.** What matters is who is to collect the consideration. GST on PA/PG fees: 18% on the fee, per secondary sources; the 2024 proposal to tax PA fees on sub-₹2,000 card transactions was deferred.

### Cited Findings

- Notification "No. 15/2024- Central Tax, New Delhi, dated the 10th July, 2024", under s.52(1) CGST Act. It amends Notification No. 52/2018-Central Tax (G.S.R. 900(E), 20 Sep 2018): "for the words 'half per cent.', the figure and word '0.25 per cent.' shall be substituted." It comes into force on publication in the official gazette — [PRIMARY: gstcouncil.gov.in copy](https://gstcouncil.gov.in/sites/default/files/2024-09/central-tax-15-2024-11072024.pdf)
- IGST rate 0.5% via Notification 01/2024-Integrated Tax of the same date — [SECONDARY: Mondaq](https://www.mondaq.com/india/sales-taxes-vat-gst/1516974/reduction-in-rate-of-gst-collected-by-the-e-commerce-operators)
- **[SUPERSEDED]** CBIC TCS FAQ (updated 30.11.2018): "Rate of TCS is 0.5% under each Act … and the same is 1% under the IGST Act" (Notifications 52/2018-CT and 02/2018-IT) — [PRIMARY: CBIC FAQ on GST Council site](https://www.gstcouncil.gov.in/sites/default/files/2024-02/faqs_tcs.pdf)
- FAQ 3, s.52: the operator, "not being an agent, is required to collect an amount calculated at the rate not exceeding one per cent., … of the net value of taxable supplies made through it, **where the consideration with respect to such supplies is to be collected by such operator**." — [PRIMARY: CBIC FAQ](https://www.gstcouncil.gov.in/sites/default/files/2024-02/faqs_tcs.pdf)
- FAQ 12: "every e-commerce operator is required to collect tax where the supplier is supplying goods or services through e-commerce operator and consideration with respect to the supply is to be collected by the said e-commerce operator." FAQ 13: "TCS is to be collected once supply has been made through the e-commerce operator and where the business model is that the consideration is to be collected by the e-commerce operator **irrespective of the actual collection of the consideration**." Its example: supply on 30 Oct, cash collected in Nov, so TCS is reported for October — [PRIMARY: CBIC FAQ](https://www.gstcouncil.gov.in/sites/default/files/2024-02/faqs_tcs.pdf)
- FAQ 11: "net value of taxable supplies" means the aggregate value of taxable supplies in a month by a registered supplier through the operator, "reduced by the aggregate value of taxable supplies returned to such supplier during the said month". It is computed at GSTIN level. FAQ 20–21: returns are netted per supplier, and negative net values are ignored and not carried forward. FAQ 14–15: no TCS on exempt or RCM supplies. FAQ 19: TCS cannot be paid via the operator's ITC — [PRIMARY: CBIC FAQ](https://www.gstcouncil.gov.in/sites/default/files/2024-02/faqs_tcs.pdf)
- PA/PG fees: fees charged by any payment aggregator are subject to GST at 18% (on the fee, not the transaction value) — [SECONDARY: ClearTax](https://cleartax.in/s/gst-on-upi-payments). The 54th GST Council (Sep 2024) deferred the proposal to tax PA fees on card transactions under ₹2,000 and sent it to the fitment committee — [SECONDARY: Taxscan](https://www.taxscan.in/18-gst-on-upi-transactions-under-rs-2000-undecided-by-gst-council-and-forwarded-to-fitment-committee-says-sources/435651). The existing exemption covers "services by an acquiring bank … in relation to settlement of an amount upto two thousand rupees in a single transaction transacted through credit card, debit card, charge card or other payment card service" (originating as service-tax entry 64, Notification 52/2016-ST) — [SECONDARY: search excerpt, TaxHeal](https://www.taxheal.com/service-tax-exemption-notification-rs-2000-transactions-cards.html)

### Inferences

- **COD with our own contracted courier collecting cash and remitting to the platform:** the consideration is "to be collected by the operator" (through its agent), so **TCS applies on COD as on prepaid**, at supply time and regardless of when cash arrives (FAQ 13). That is the natural reading; it is not an explicit CBIC ruling on COD.
- **COD where the vendor delivers and collects cash itself** (the 0036 loading/unloading pattern): if the platform's model is that the vendor, not the operator, collects, the s.52 trigger is arguably not met for those orders. This changes both TCS and GSTR-8 scope. It is a structural tax question; **get a CA opinion** before choosing the vendor-collects COD model.
- RTO and returned goods reduce the net value for that vendor-GSTIN in the month (FAQ 11/20). The `tcs_payable` ledger must net returns per vendor GSTIN per month and floor at zero, with no carry-forward of negatives.
- Razorpay MDR/fees: book 18% GST on the fee as input-tax-credit-eligible expense. Razorpay invoices it.

### Gaps

- No CBIC circular, AAR or AAAR ruling specifically on COD and s.52 was found.
- The IGST Notification 01/2024 was not read directly.
- No primary text was read for the 18% rate on heading 9971 (financial and related services) after the 2025 rate rationalisation, or for the exact current entry number of the ₹2,000 acquiring-bank exemption in Notification 12/2017-CT(Rate).
- No 2025–26 change to the TCS rate was found. Secondary sources agree it is still 0.5%, but CBIC was not checked for later notifications.

---

## Q6. Payment data localisation: does it bind merchants directly?

### Takeaway

**No, not directly.** The 6 Apr 2018 directive (DPSS.CO.OD No.2785/06.08.005/2017-18) is addressed to "system providers". RBI's FAQ says it applies to authorised/approved PSOs and to entities they "retain or engage", and that "The responsibility to ensure compliance … would be on the authorised / approved PSOs". **Merchants are not mentioned.** The PA MD 2025 para 9(c) applies the same localisation duty to PAs. A merchant is reached only by contract (PA → merchant) and by the separate card-data rules: the merchant must not store card credentials (PA MD Annex-1 para 2.1).

### Cited Findings

- Circular DPSS.CO.OD No.2785/06.08.005/2017-18, 6 Apr 2018: "all system providers shall ensure that the entire data relating to payment systems operated by them are stored in a system only in India." Compliance within 6 months, reported by 15 Oct 2018; System Audit Report by 31 Dec 2018. Issued under s.10(2) read with s.18 of the PSS Act — [PRIMARY: RBI notification Id=11244](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11244) (via search excerpt of the RBI page; not fetched in full)
- FAQ: "The directions are applicable to all Payment System providers authorised / approved by the Reserve Bank of India (RBI)". It extends to "system participants, service providers, intermediaries, payment gateways, third party vendors" that are "retained or engaged by the authorised / approved entities for providing payment services". "The responsibility to ensure compliance with the provisions of these directions would be on the authorised / approved PSOs." Data "should include end-to-end transaction details". If processed abroad, data must be returned "not later than the one business day or 24 hours from payment processing, whichever is earlier" — [PRIMARY: RBI FAQ Id=130](https://www.rbi.org.in/Scripts/FAQView.aspx?Id=130)
- PA MD 2025 para 9(c): "PA shall comply with data storage requirements as applicable to Payment System Operators (PSOs)", citing the 6 Apr 2018 circular. Para 9(a): "PA shall ensure that infrastructure of the merchants is compliant with security standards like PCI-DSS…". Annex-1 para 2.1: "The customer card credentials shall not be stored within the database or the server accessed by the merchant." Annex-1 paras 1.4 and 1.18: security assessment and PCI-DSS review at merchant onboarding. Annex-1 is mandatory for PAs — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)

### Inferences

- Golden Abode, as a Razorpay merchant using hosted checkout, is not itself a "system provider". Localisation of our order DB is not a direct RBI obligation. Razorpay's merchant agreement may still flow it down, and the payment records we hold (payment IDs, amounts, VPA/bank refs for COD refunds) are "end-to-end transaction details" in Razorpay's hands. Hosting the payments DB in an Indian region (ap-south-1) remains the low-cost, defensible choice. The DPDP Act 2023 is a separate regime, not covered here.
- If we ever run our own payout or collection for third parties, we drift toward being a payment system operator or PA, and localisation then binds us directly.

### Gaps

- The full 2018 circular was seen only through search excerpts of the RBI page; the FAQ was read directly.
- Razorpay's merchant T&C flow-down clause on data storage was not checked.

---

## Q7. Marketplace + PA: does a marketplace collecting for sellers need PA authorisation, and how does the 2025 MD treat marketplaces on a PA?

### Takeaway

No RBI FAQ or clarification was found that says expressly whether a marketplace needs PA authorisation. The 2025 MD answers it structurally. A **marketplace is a "merchant"** (para 4(f)) onboarded by a PA. The **PA may not run a marketplace** (10(b)). The PA must ensure a marketplace it onboards takes payments only for sellers onboarded on that platform (13(f)), and must validate that funds reach the right merchant (13(g)). Law firms read the 2025 MD as allowing a PA to **settle to marketplaces** (Cyril Amarchand: "Can settle with marketplaces (now included in merchant definition)"), which was unclear under 2020. The **2020 rule** that e-commerce marketplaces doing aggregation must separate it and seek authorisation (para 3.6) is **[SUPERSEDED]** by the consolidated MD. Only true **cash** on delivery is outside escrow; any "delivery-versus-payment" by card or UPI is inside the PA regime.

### Cited Findings

- Para 4(e): "Marketplace: An e-commerce entity which provides an information technology platform…". Para 4(f) Merchant: "An entity or a marketplace that sells goods, provides services, or offers investment products". Para 10(b): "A PA business shall not carry out marketplace business." Para 13(f): "A PA shall ensure that a marketplace onboarded by it does not accept payments for a seller not onboarded on to the marketplace's platform." Para 13(g): "Necessary validation mechanisms shall be put in place by a PA to ensure that funds due to a merchant are credited…" — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Para 3(a): the Directions apply to "all bank and non-bank entities undertaking the business of Payment Aggregator". Para 5(b): "A non-bank entity shall seek authorisation for operating as a PA". Para 10(g): a PG (technology-only routing, 4(j)) is outside the MD. The MD does not say whether merchants or marketplaces themselves need authorisation — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Para 4(a): "Cash-on-delivery transaction: A merchant transaction wherein banknotes or currency notes, being legal tender in India, is offered or tendered, for and at the time of, delivery of goods and / or service(s)." Para 18(b): the escrow "shall not be operated for 'Cash-on-Delivery' transactions" — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896)
- Table 1 (para 16), permitted debit iv: "Payment to any other account (third party), on specific direction of a merchant, having physical or online presence…". The third party must be "the payee that interfaces with the payer", and only for merchants above ₹40 lakh turnover (₹5 lakh export) — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896); threshold per [SECONDARY: Khaitan ERGO, 3 Oct 2025](https://www.khaitanco.com/sites/default/files/2025-10/ERGO%20-%20PA%20Master%20Directions%20-%203%20Oct%202025_0.pdf)
- Para 13(j): merchants onboarded until 31 Dec 2025 must meet the new due diligence within a stated period; from 1 Jan 2026 new merchants are onboarded under the MD — [PRIMARY: RBI PA MD](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=12896). Khaitan states the deadline as **15 Sep 2026** — [SECONDARY: Khaitan ERGO](https://www.khaitanco.com/sites/default/files/2025-10/ERGO%20-%20PA%20Master%20Directions%20-%203%20Oct%202025_0.pdf). **Conflict:** the earlier note paraphrased 13(j) as "within one year"; read from the MD's 15 Sep 2025 date, both give 15 Sep 2026, so this is consistent but the date is inferred.
- Cyril Amarchand comparison table (23 Sep 2025), 2020 vs 2025. Marketplaces: from "No clarity on processing / settling of funds for sellers of marketplaces" to "PA must ensure it is processing / settling funds only for sellers onboarded by marketplaces". Settlement with marketplaces: from "No clarity if funds could be settled with marketplaces" to "Can settle with marketplaces (now included in merchant definition)". DvP: from "Exempted from PA regime" to "DvP transactions not exempted. Exemption only for cash on delivery transactions", with the footnote "Payment made against delivery of goods or services through currency notes" — [SECONDARY: Cyril Amarchand Mangaldas client alert](https://www.cyrilshroff.com/wp-content/uploads/2025/10/Client-Alert-RBI-Introduces-Consolidated-Framework-for-Payment-Aggregators-3.pdf)
- Khaitan: PAs "must not carry out marketplace business and aggregate funds for merchants with whom they do not have a contractual relationship". PAs must ensure onboarded marketplaces don't accept payments for non-onboarded sellers, and must validate that funds reach the right merchant. "PAs would also now need to closely scrutinize marketplace-seller arrangements and may need to relook certain flows involving settlement of payments to a particular merchant for or on behalf of an unrelated third-party beneficiary." — [SECONDARY: Khaitan ERGO](https://www.khaitanco.com/sites/default/files/2025-10/ERGO%20-%20PA%20Master%20Directions%20-%203%20Oct%202025_0.pdf)
- **[SUPERSEDED]** 2020 PA/PG Guidelines para 3.6 (e-commerce marketplaces providing PA services to separate the activity and apply by 30 Jun 2021); para 2.3 (guidelines did not apply to the COD model) — [PRIMARY: RBI notification 11822](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11822) (from the earlier round); consolidation per [SECONDARY: AZB](https://www.azbpartners.com/bank/rbi-issues-consolidated-reserve-bank-of-india-regulation-of-payment-aggregators-directions-2025/)

### Inferences

- **Recommended structure (unchanged, now better grounded):** Golden Abode is the marketplace-merchant onboarded by Razorpay. Each vendor and artisan is onboarded as a Route linked account, which satisfies 13(f). Settlement goes from escrow to linked accounts, which is 13(g) validation. The 2025 MD's recognition that a PA can settle to a marketplace (CAM reading) means settling the full amount to Golden Abode and paying vendors from our own account is **less clearly prohibited than before**. It is still the pattern that makes us look like an unlicensed aggregator (we would hold third-party funds), and 13(f) still requires the sellers to be onboarded. Keep Route.
- **Doorstep UPI/card on "COD" orders is not "Cash-on-Delivery"** under para 4(a), which means currency notes only. If a courier collects by UPI QR, that is a PA transaction (the courier's PA), not COD. Our ledger can still treat it like a courier remittance. A better design is a Razorpay payment link or QR on our own account at the door, so it becomes a normal prepaid payment into escrow and Route.
- The third-party settlement route (Table 1 debit iv) applies only to merchants above ₹40 lakh turnover, where the third party "interfaces with the payer". It is not the right tool for vendor splits; Route linked accounts are.
- COD vendor payouts from our own bank account remain an open legal question (aggregation of cash for third parties outside the PA regime). The MD is silent because COD-cash is excluded from escrow. **Get legal advice.**

### Gaps

- No RBI FAQ on the 2025 PA MD was found, and no RBI clarification on marketplaces needing their own PA authorisation.
- No Trilegal, AZB-detail or IndusLaw note specifically on marketplace settlement was read.
- The exact para 13(j) deadline wording (a date vs "one year") was not quoted verbatim; WebFetch summarised it.
- Whether RBI extended the 13(j) deadline beyond 15 Sep 2026 is not confirmed.
