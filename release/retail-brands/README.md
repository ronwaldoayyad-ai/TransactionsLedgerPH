# Retail brand logos

Only Retail Installment and Straight Retail items receive logos. Cash Loan, Fees, Adjustments and archived records are excluded by the same classification logic on both sides.

Clear merchant/product keywords resolve locally against a small reference catalog and lender-managed keywords. Multiple brand matches and the ambiguous PMC abbreviation require review. Unknown descriptions keep the generic icon until assigned. This does not call paid enrichment APIs or send transaction descriptions to Brandfetch in the background.

The admin Transactions toolbar opens Brand logos for the current filtered retail records; the Brand logo grid cell opens an individual record. Selected rows can use Assign brand logos. Linked installment rows are deduplicated to their loan. Manual assignment, explicit removal and returning to automatic are supported, including atomic batches of up to 200 targets. Manual choices take priority over automatic rules. Conflicting keyword matches still require review.

The database migration creates two metadata tables and guarded RPCs only. Every write requires an active lender, explicit review, current description/owner/version and an idempotency key. Tables grant SELECT only to authenticated sessions, with restrictive live-session policies. Assignment reads follow the current record owner, even after ownership changes. No bill, payment, balance, credit or historical accounting row is modified by logo operations.

Configure the public `VITE_BRANDFETCH_CLIENT_ID` at build time. Never put the desktop MCP token or a secret Brandfetch API key into the app. Brand Search runs directly in the admin browser with a debounce and aborts outdated searches. Search results and expiring search image URLs remain transient; only the lender's chosen name/domain or merchant keyword is saved. Borrowers load logos directly from the CDN with a generic-icon fallback, lazy loading and origin-only referrers. Image requests never gate account loading.

Run `node release/retail-brands/generate-browser-core.cjs` after changing the shared matching module. Unit tests check classification, ambiguity, overrides, safe domains and browser parity. `tests/integration/retailBrands.test.cjs` rehearses transaction rollback, retry, atomic batches, owner-scoped reads, session revocation, stale edits and preservation of financial data in disposable local databases. Additive rollback is to promote the prior app and retain the unused metadata tables; no accounting reversal is involved.
