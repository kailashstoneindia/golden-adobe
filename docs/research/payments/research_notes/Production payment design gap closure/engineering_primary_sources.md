# Primary engineering and architecture sources on payment systems (gap closure)

Retrieval notes:

- Tools used: built-in WebSearch and WebFetch only.
- The Airbnb Medium article pages still return 403, and web.archive.org is blocked for WebFetch. However, **Medium's RSS feed for the Airbnb Engineering "payments" and "fintech" tags (`https://medium.com/feed/airbnb-engineering/tagged/payments`) returned the full post bodies.** The Airbnb quotes below come from that first-party feed.
- WebFetch passes pages through a small summarising model. Quoted strings are what that model returned as verbatim text. Short phrases are reliable; treat longer paraphrases as close summaries.
- Labels used throughout:
  - **[1P]** = first-party (the company's or author's own publication).
  - **[2P]** = secondary (summary, reader notes, or third party).

## 1. Airbnb Orpheus ("Avoiding Double Payments in a Distributed Payments System")

### Takeaway

All five claims in the earlier notes are now confirmed from Airbnb's own text, delivered through the Medium RSS feed:

- the Pre-RPC / RPC / Post-RPC phases;
- 5XX = retryable, 4XX = non-retryable, with "non-retryable" as the default;
- a lease with expiry higher than the RPC timeout;
- reading from master because of replica lag;
- "move money at most once".

The post is by Jon Chew and Ninad Khisti and was published 16 Apr 2019.

### Cited Findings

- **Authors and date:** "Authors: Jon Chew and Ninad Khisti". The feed's publish date is "Tue, 16 Apr 2019 22:01:01 GMT". [1P] — [Airbnb Tech Blog RSS (payments tag)](https://medium.com/feed/airbnb-engineering/tagged/payments). The canonical article URL is still 403: [Medium article](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb).
- **Goal wording:** "the underlying system should move money at most once." [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- **Phases** [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments):
  - Pre-RPC: "Details of the payment request are recorded in the database."
  - RPC: "The request is made live to the external service over network and the response is received."
  - Post-RPC: "Details of the response from the external service are recorded in the database".
- **Ground rules:** "No service interaction over networks in Pre and Post-RPC phases" and "No database interactions in the RPC phases". The summary principle is: "We essentially want to avoid mixing network communication with database work." [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- **Error classification** [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments):
  - "unexpected runtime exceptions due to network and infrastructure issues (5XX HTTP statuses) are retryable"
  - validation errors are treated "as non-retryable (4XX HTTP statuses)"
  - the default is "defaulting to 'non-retryable'".
- **Lease** [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments):
  - Requests "each need to acquire a database row-level lock on an idempotency key".
  - "A lease comes with an expiration to cover the scenario where there are timeouts on the server side."
  - "A good rule of thumb is to have a higher lease expiration than the RPC timeout."
  - Orpheus "offers a maximum retryable window for an idempotency key".
- **Master reads:** "we chose to do this directly from the master database". The post gives the reason as replica lag ("in the event of replica lag, the client could correctly fire an idempotent retry", which would cause a double charge). [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- **Key types** [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments):
  - Request-level: "a random and unique key should be chosen from the client".
  - Entity-level: "use a deterministic idempotency key based on the entity model", for example "payment-1234-refund".
- **Library rather than service:** "We chose a library as a solution because it offers low latency", and "building a separate, stand-alone idempotency service wouldn't be sufficient." [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- **Write repair:** Orpheus "utilizes write repair, where every write call from the client to the server attempts to repair an inconsistent" state. "Clients can thus request eventual consistency on-demand." [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- **Recording responses:** the response is recorded in the database once the request "has reached a deterministic end-state". [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- **Outcome:** "we have achieved five nines in consistency for our payments". [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)

### Inferences

- The earlier notes' Orpheus section (idempotency_and_duplicates.md §2) can now be treated as first-party-confirmed. The report can attribute these rules to Airbnb directly.
- Golden Abode can map the design directly onto its own flow:
  - Phases: Tx1 records the intent, the Razorpay call runs with no transaction open, and Tx2 records the result.
  - Lease: a lease on the attempt row whose TTL is greater than the Razorpay client timeout.
  - Keys: an entity-level key such as `refund:<payment_id>:<n>` for refunds.

### Gaps

- Code samples in the post (images or embeds) were not captured as text.
- The Wayback Machine snapshot was not reachable (WebFetch is blocked for web.archive.org).
- No InfoQ or QCon talk write-up was checked, because the first-party text made it unnecessary.

## 2. Airbnb, Uber, Square and Stripe: ledger and reconciliation designs (first-party)

### Takeaway

Primary sources now exist for three of these companies' designs. Stripe's was already cited.

- **Airbnb** measures "transactional integrity" by comparing every transaction across all internal systems, not only by three-way money reconciliation. It uses Hive/Spark over HDFS database snapshots, Airflow, and anomaly detection, and runs payments as DAGs of retryable idempotent steps at five 9s of consistency.
- **Uber Gulfstream** uses immutable, zero-sum "money orders", deterministic IDs and processed-order IDs for exactly-once processing, and self-reconciliation by replaying from OrderStore.
- **Square Books** is a small, insert-only double-entry service on Spanner.

### Cited Findings

**Airbnb: Measuring Transactional Integrity (Ninad Khisti and William Betz, 17 Jan 2018)**

- Definition: "transactional integrity represents a no-surprise, accurate money movement." Accuracy is judged on attributes such as amount, currency, status, payment method and timeliness. "we expect full consistency of payment attributes between our internal systems." [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments); [canonical URL](https://medium.com/airbnb-engineering/measuring-transactional-integrity-in-airbnbs-distributed-payment-ecosystem-a670d6926d22)
- Scale: "over 190 countries and 40 currencies". Airbnb "integrates with a handful of gateways and dozens of processors". [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- Why conventional recon is not enough:
  - The post describes conventional merchant practice as "3-way reconciliation between platform transaction records, processor settlement files, and bank statements".
  - But "Payment reconciliation is only done when money exchanges hands", so it misses non-money events such as voided authorizations.
  - Airbnb instead traces every transaction across all systems. [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)
- Mechanics [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments):
  - "Snapshots of every database are available in HDFS at regular intervals".
  - Hive is used to "compare different transaction models represented by different schemas".
  - There is one Hive pipeline per category (payments, refunds, payouts, returns).
  - A moving average of the categories gives a single integrity score.
  - Anomalous transactions "can be further grouped based on the type of aberration found".
  - OLAP lets teams "configure anomaly detection algorithms across various dimensional cuts", with alerts.
  - Airflow schedules the steps.
  - (This part came from the second chunk of the feed, which did not show the byline.)

**Airbnb: Rebuilding Payment Orchestration (Feb 24 2022) and Scaling Airbnb's Payment Platform (Sep 12 2016)**

- "Every major workflow is divided into a directed acyclic graph (DAG) of retryable idempotent steps." [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments) (post: [Rebuilding Payment Orchestration at Airbnb](https://medium.com/airbnb-engineering/rebuilding-payment-orchestration-at-airbnb-341d194a781b))
- That approach "has led to five 9s (99.999%) of consistency for payments". [1P] — same source.
- The same post adds:
  - Reconciliation "provide[s] an additional layer of confidence by ensuring consistency between events and transactional data sources".
  - "Immutable data is easier to understand, audit, and reconcile." [1P] — same source.
- The 2016 financial pipeline is built around "discrete financial events with well-defined schemas". It is "constructed around the principle of double-entry bookkeeping" and is "a Spark + Scala based financial reporting application" (authors Angela Zhu and Karen Kim). A related summary passage from the same feed gives "money can't be created out of thin air." [1P] — [Airbnb RSS (fintech tag)](https://medium.com/feed/airbnb-engineering/tagged/fintech) (post: [Scaling Airbnb's Payment Platform](https://medium.com/airbnb-engineering/scaling-airbnbs-payment-platform-43ebfc99b324))
- An older Rails-era post describes a "ProtectedAccess" layer that "controls changes to the underlying table and ensures an audit trail is written" (Michel Weksler). [1P] — [Airbnb RSS](https://medium.com/feed/airbnb-engineering/tagged/payments)

**Uber Gulfstream**

- "Revolutionizing Money Movements at Scale with Strong Data Consistency" (Aakriti Singla and Simon Wu, 2 Oct 2020) [1P] — [Uber blog](https://www.uber.com/blog/money-scale-strong-data/):
  - Gulfstream is "Uber's fifth generation collection and disbursement payment platform", "built on the principles of double-entry accounting".
  - Model: Jobs (a trip or delivery) → Orders (fare, adjustments, tips, incentives) → Entries (money into or out of one account).
  - Each order's entries net to zero.
  - IDs for users, jobs and orders are generated deterministically. Orders are immutable and persisted before processing. Processed order IDs give exactly-once order processing.
  - Per-user version numbers on an entity change log are used. Version gaps trigger reconciliation events that replay missing orders from OrderStore. Validation jobs run every 24 hours.
  - Temporarily failing payments are retried with exponential backoff over a long period.
  - Scale: >18M requests/day, 10,000+ cities, a 2-year migration with 40+ people, and a 1→5→10→20→50→100% rollout.
- "Uber's Payments Platform" 10-year retrospective (Nimish Sheth, Manas Kelshikar and Dhirendra Kumar Singh, 6 Aug 2026) [1P] — [Uber blog](https://www.uber.com/blog/ubers-payments-platform/):
  - "To make our system self-auditable, we made our money order immutable"; "an order once written can't be changed in any shape or form". Corrections are new orders.
  - A pre-commit validation is "to ensure that all entries in any money order sum to zero"; "every credit entry on the order has an equivalent debit entry".
  - In 2016 there was no "perfect solution to guarantee strong consistency for ledger balances", so Uber built a custom store on DynamoDB.
  - An Entity changelog "Captures balance updates on the ledger, providing a complete audit trail."
  - Scale: ledger balances for >1.2B entities, and money movement of ~2× gross bookings ($217B annualised).
- LedgerStore: still only a page summary from the earlier round ([Uber LedgerStore](https://www.uber.com/blog/how-ledgerstore-supports-trillions-of-indexes/)). It was not re-fetched.

**Square Books ("Books: an immutable double-entry accounting database service", Łukasz Strzałkowski, 16 Oct 2019)**
All points below are [1P] — [Square Developer blog](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/).

- Three tables:
  - `books`: an account, with balance, type, owner and a monotonic version.
  - `journal_entries`: one per accounting transaction.
  - `book_entries`: a debit or credit linking a journal entry to a book.
- "all transactions (which we call 'journal entries') must balance to 0". Debits are stored positive and credits negative.
- "Books are immutable and can only have the balance changed by participating in accounting transaction". Apart from the books balance, the service is insert-only, and mistakes are fixed by offsetting entries, so "there will always be a trace of what happened in the system."
- It runs on Google Cloud Spanner and GKE, with no application-level sharding.
- Multi-tenant "shelves" namespace the indexes.
- About 20 TB of data, run by "a small team of three people".
- Idempotency is not covered in the article.

**Stripe Ledger:** already cited ([Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)). It was not re-fetched this round. The prior notes' quotes stand.

**Shopify "Building resilient payment systems"** (Bart de Water, 28 Jul 2022) — confirmed. All points [1P] — [Shopify Engineering](https://shopify.engineering/building-resilient-payment-systems).

- Timeouts: Ruby Net::HTTP has 60s defaults. "an open timeout of one second with a write and read or query timeout of five seconds is a decent starting point". Go and Node HTTP clients have no default timeout.
- Circuit breakers: Semian, with the merchant country code in the circuit key.
- Idempotency: "we want a payment or refund to happen exactly once". Keys must be unique over the retry window, "typically 24 hours or less".
- ULID keys: "48-bit timestamp followed by 80 bits of random data". Switching to them gave "a 50 percent decrease in INSERT statement duration".
- Reconciliation: "we reconcile individual records such as charges or refunds". On a mismatch "we record the anomaly in our database", auto-fixing where possible.
- Tracing: a `correlation_id` is created at checkout and passed to the background job.
- Backoff and jitter are not discussed in this article.

### Inferences

- Patterns that several first-party sources independently share:
  - Immutable money records with corrections as new records (Uber, Square, Stripe, Airbnb).
  - A zero-sum check before commit (Uber, Square).
  - Deterministic or idempotent IDs (Uber, Airbnb).
  - Recon as a separate batch over snapshots or replays (Airbnb, Uber 24h validation, Shopify per-record recon).
- For Golden Abode, a `CHECK`/trigger that entries sum to zero per transaction, plus an insert-only ledger, mirrors Square Books at a tiny scale.
- Airbnb's "compare every transaction across internal systems" lesson matters here. A daily job should diff `orders` vs `payment_attempts` vs ledger vs Razorpay, not only check settled money. That catches non-money anomalies such as an expired order with an authorized payment.

### Gaps

- The Uber LedgerStore full text was not re-read.
- The byline for the second half of Airbnb's integrity post was not displayed (the first chunk confirmed Khisti and Betz).
- No Stripe first-party reconciliation-pipeline post was found beyond the Ledger post.

## 3. Martin Fowler: Accounting Patterns

### Takeaway

Fowler's 2006 draft patterns provide the vocabulary and the core rules:

- An account's balance is derived from its entries.
- Multi-legged transactions must sum to zero, and posted entries are immutable.
- Corrections are made by Reversal, Difference or Replacement adjustment.

Reversal is the one compatible with immutable entries.

### Cited Findings

- "The value, or balance, of the Account is derived as the sum of all the Accounting Entrys." Period balances sum the entries posted within the period. [1P] — [Fowler: Patterns for Accounting (24 Jan 2006 draft)](https://martinfowler.com/eaaDev/AccountingNarrative.html)
- "Accounts keep track of the monetary consequences of events, which means they work very well with Event Sourcing." [1P] — [Fowler: Accounting Narrative](https://martinfowler.com/eaaDev/AccountingNarrative.html)
- Transaction legs [1P] — [Fowler: Accounting Transaction](https://martinfowler.com/eaaDev/AccountingTransaction.html):
  - "A two-legged transaction only ever has two entries, which are of opposite sign."
  - "A multi-legged transaction allows any number of entries", but "all the entries must sum to zero". `canPost()` checks for a zero balance before posting.
  - "Entries are immutable", and "once I've posted I can't add any more entries to the transaction".
- "Entries may often be immutable at all times or they may be mutable until they are booked". "Connecting a Domain Event to all the Accounting Entry created due to it helps auditing and later processing." [1P] — [Fowler: Accounting Entry](https://martinfowler.com/eaaDev/AccountingEntry.html)
- Adjustment strategies [1P] — [Fowler: Accounting Narrative](https://martinfowler.com/eaaDev/AccountingNarrative.html):
  - Replacement "deletes the incorrect Accounting Transactions and creates the correct set", which loses history.
  - Reversal posts "an opposite Accounting Entry to cancel it out" and then the correct ones.
  - Difference "posts in new entries that represent the difference between the incorrect and correct entries".
- Reversal Adjustment [1P] — [Fowler: Reversal Adjustment](https://martinfowler.com/eaaDev/ReversalAdjustment.html):
  - "For each entry that needs to be adjusted you create two new entries": a reversal with the original date and the opposite sign, and a correct entry.
  - Link the reversal to the original event and mark the original as adjusted.
  - It works when entries are immutable.
  - "The main disadvantage is that it results in a lot of entries".

### Inferences

- Golden Abode can use these rules in its ledger:
  - Multi-legged transactions (capture = PSP receivable / vendor payable / commission), with sum-to-zero enforced.
  - Entries immutable once posted.
  - Each ledger transaction linked to its originating domain event (webhook event id or refund id).
  - Corrections via Reversal Adjustment.
  - A refund is not an adjustment. It is a new business event with its own transaction.

### Gaps

- The `PostingRule.html` page returned 404, so the Posting Rule pattern text was not retrieved. Fowler's pages are explicitly unrevised 2006 drafts.

## 4. Kleppmann (DDIA): end-to-end argument, exactly-once, operation identifiers

### Takeaway

No first-party text of DDIA was retrievable (the book is paywalled, and martin.kleppmann.com was not reached for this). Reader-captured highlights confirm the key claims in near-verbatim form:

- Exactly-once means the final effect is as if no faults had occurred.
- A database transaction alone is insufficient.
- The fix is an identifier "passed all the way from the end-user client to the database".

This is Saltzer, Reed and Clark's end-to-end argument applied to databases (DDIA ch. 12).

### Cited Findings

- The following are DDIA quotes captured verbatim by a reader on Goodreads; the book itself was not checked. [2P] — [Goodreads DDIA notes](https://www.goodreads.com/notes/34626431-designing-data-intensive-applications/146561796-charles-fonseca?page=11)
  - "exactly-once means arranging the computation such that the final effect is the same as if no faults had occurred"
  - "it is not sufficient to rely just on a transaction mechanism provided by a database"
  - "a transaction identifier that is passed all the way from the end-user client to the database"
  - "duplicate suppression (e.g., idempotent operations) are important for maintaining the integrity of a data system"
  - "We saw that TCP suppresses duplicate packets at the TCP connection level"
  - Correctness can be achieved "without requiring distributed transactions and an atomic commit protocol"
  - "When processing event streams asynchronously, there is no guarantee of timeliness"; "integrity is in fact central to streaming systems."
- A DDIA wiki summary (citing chapter 12, paraphrased) [2P] — [DDIA wiki: End-to-End Argument](https://stevesuave.github.io/ddia-wiki-quartz/end-to-end-argument):
  - Apps "should generate a unique identifier (e.g., a UUID) for every operation".
  - "Without an application-level request ID, the transaction could be executed twice".
  - Low-level features are "rarely sufficient to ensure application-level correctness".
- Origin: Saltzer, Reed and Clark (1984), "End-to-End Arguments in System Design". The function "can completely and correctly be implemented only with the knowledge and help of the application standing at the end points". [1P paper] — [Princeton copy of the paper](https://www.cs.princeton.edu/courses/archive/fall15/cos518/papers/endtoend.pdf) (seen via search snippet; the PDF was not fetched)
- A practitioner summary (Allegro Tech, 2 Dec 2025) quotes Helland and Campbell, "Building on Quicksand": "In practice, systems evolve to be idempotent as designers either anticipate the problem or make changes to fix it." It also describes the operation-ID-plus-uniqueness-constraint pattern. [2P] — [Allegro Tech: Transactions Aren't Enough](https://blog.allegro.tech/2025/12/transactions-arent-enough.html)

### Inferences

- In this codebase, the end-to-end identifier should be created on the client per checkout attempt and carried through the API into the DB. It should be enforced by a UNIQUE constraint, and forwarded to Razorpay as `receipt`/notes. TCP retries, HTTP retries and DB transactions each cover only one hop.

### Gaps

- No first-party DDIA excerpt or Kleppmann talk transcript was retrieved. The exact section title ("Operation identifiers") and page numbers are unverified.
- The report should cite DDIA ch. 12 with the caveat that the quotes come from reader highlights, or paraphrase it.

## 5. Indian e-commerce and payments engineering (Flipkart, Meesho, PhonePe, Swiggy, Zomato, Razorpay)

### Takeaway

**No first-party engineering posts on payment reliability, idempotency, reconciliation or COD/RTO prediction were found for any of these companies.** blog.flipkart.tech and engineering.razorpay.com returned 403. Searches surfaced only seller tools, vendor marketing, news and community posts. What can be cited:

- Razorpay's and PhonePe's own developer docs.
- Meesho's COD share, from its DRHP via news coverage.

### Cited Findings

- RazorpayX payouts support an idempotency key: the response to the first request with a key is saved, and later requests with the same key return it. [1P docs] — [RazorpayX: Idempotency](https://razorpay.com/docs/razorpayx/api/idempotency/) (seen via search summary; the page was not fetched this round)
- PhonePe's Static QR docs describe a Transaction List API for matching payments to the POS bill. They note that reconciliation is needed for transactions that are "payment Successful but Order Not Fulfilled". [1P docs] — [PhonePe Developer: Payment Flow](https://developer.phonepe.com/category/v2/integrated-static-qr-code-solutions/payment-flow-2) (search summary)
- Razorpay's product blog splits reconciliation into "internal reconciliation and external reconciliation" (marketing). [1P marketing] — [Razorpay: What is payment reconciliation](https://razorpay.com/blog/what-is-payment-reconciliation/) (search summary)
- Meesho COD share [2P news, citing DRHP]:
  - Over 76% of the 1.59 billion orders shipped in FY2025 were COD — [Whalesbook](https://www.whalesbook.com/news/English/consumer-products/Meeshos-IPO-Faces-Headwinds-as-Cash-on-Delivery-Dominates-Small-Town-Orders/68fa09c6b501b60a20d21674).
  - More than 75% of orders are COD, of which about 75.5% are fulfilled — [Upstox](https://upstox.com/news/upstox-originals/investing/is-cash-on-delivery-quietly-costing-you-more/article-184260).
- Swiggy is testing an in-app UPI plug-in with Yes Bank and Juspay to cut app-switch failures [2P news] — [Inc42](https://inc42.com/buzz/ipo-bound-swiggy-experimenting-with-upi-plug-in-to-enhance-consumer-experience). Juspay's case study notes Swiggy monitors success rates across four services [vendor] — [Hyperswitch/Juspay: Swiggy](https://hyperswitch.io/case-studies/swiggy/).
- RTO prediction is offered as a vendor feature: ML that disables COD for high-risk shoppers using phone, address, cart and merchant history [vendor docs] — [Cashfree: COD RTO](https://www.cashfree.com/docs/payments/checkout/cod/rto.md).

### Inferences

- The report should not attribute any internal payment or COD architecture to Flipkart, Meesho, PhonePe, Swiggy or Zomato. The only defensible Indian sources are PSP docs (Razorpay, PhonePe, Cashfree) and DRHP-derived figures.

### Gaps

- blog.flipkart.tech and engineering.razorpay.com returned 403 to WebFetch. The archive.org fallback is blocked.
- No Meesho tech (medium.com/meesho-tech), PhonePe tech blog, Swiggy Bytes or Zomato engineering post on payments or COD was surfaced by search. The medium.com/feed/<publication> RSS trick that worked for Airbnb was not tried for meesho-tech or swiggy-bytes, and is the next thing to try.
- Adyen and PayPal idempotency docs were not checked (optional item).
