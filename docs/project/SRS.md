# Software Requirements Specification

Baseline: October 14, 2026. Functional IDs: [F01–F24](FRD.md). Design: [SDD](SDD.md), [Architecture](Architecture.md).

## Runtime and interfaces

The web client uses React 19, React Router 7, Vite 8 and Supabase JS 2 as pinned by package/lock files. PostgreSQL and Supabase provide Auth, database, Storage and Realtime. The borrower UI is a same-origin HTML frame hosted by VersionedBorrower.jsx. A protected companion API handles support, uploads and Pawcheebels requests.

Host the browser interface and authorized APIs under HTTPS with consistent origin rules. Protect database connections and server credentials. Configure Auth redirect URLs and storage access for the service’s published domain.

## Bridge contract

Messages use channel `loanledger-v41224`. Both origin and source frame must match. A presentation `mobile-call` has requestId, action and payload. Responses have `mobile-result`, matching requestId, ok and result/error. Credentials and auth tokens remain in the React host. Mutations use a stable UUID request key where the existing action supports idempotency. Default bridge timeout is 45 seconds; Support uses 20 and assistant uses 15.

Allowed mutation families include profile/preferences/avatar, payment submit/retract, support submit, notification reply/react, message send/react/read/hide/restore, loan submit/cancel/bank, disbursement accept, and statement create/delete. Authenticated operations pass through existing server/RPC ownership validation; the presentation frame is not an authorization boundary by itself.

## New assistant HTTP contract

| Endpoint | Method | Input | Output |
| --- | --- | --- | --- |
| Pawcheebels status route | GET | Same-origin request | configured boolean, provider, model, free-only flag and FAQ version; no key |
| Pawcheebels question route | POST | JSON `{question, useAI}`; optional bearer token supplied by React | answer, sources `{id,question}`, mode `faq`/`ai`, reason, version |

The question is 2–800 characters; request body is at most 4,096 bytes. Client-supplied ledger/history fields are not forwarded. For external AI, the bearer token is validated against an active profile. Guest questions are FAQ-only. Signed-in AI assistance, enabled by default with an off switch, permits greetings and general questions without a FAQ match; private-detail screening applies before all external calls. Unknown app policies must not be invented. General answers have no fabricated FAQ citations. Cross-origin requests return 403; unsupported routes/methods return 404; malformed or unauthorized requests return 400; rate/concurrency limits return 429. Provider failures return a successful FAQ fallback, identified by reason.

## Data requirements

Core entities: profiles, loans, transactions, payments, payment logs, loan requests/events/rates/access, invoices, due configuration/overrides, notifications/reads/reactions, messages and disbursements. Borrower service flows also use support tickets/events, borrower preferences/statements, hidden messages, login tokens, verified uploads and operation keys. See migration history for constraints and access policies; migration presence alone does not prove application to a database.

Transaction date, due date, paid date and event timestamp remain distinct. Currency uses PHP display with two decimals. Decimal rates are multiplied by 100 for percentage display, including 0.018934 → 1.8934%. Calendar/day logic uses Asia/Manila where account dates are evaluated. No borrower-private records are embedded in FAQ or legal content JSON.

FAQ and legal content are versioned files rather than new database tables. FAQ records contain unique id, category, question, answer, keywords and optional destination page. Legal content contains update date and titled sections. Pawcheebels conversation state is memory-only and owner-scoped. No new migration is required for this feature.

## Quality and acceptance requirements

| ID | Acceptance |
| --- | --- |
| Q01 | Every successful support submission has a confirmed durable ticket and visible confirmation |
| Q02 | Pending/error/timeout states release controls and avoid duplicate calls |
| Q03 | FAQ search remains focused; source links open the actual referenced answer |
| Q04 | Routine card switches preserve unrelated dashboard elements and honor reduced motion |
| Q05 | Required document flows show feedback before browser handoff; no claim of verified saving completion |
| Q06 | New screens fit a 320 px viewport, expose labels and keyboard-operable controls, and show no script errors in recorded tests |
| Q07 | AI keys never appear in public assets, bridge messages, status responses, logs or project documents |
| Q08 | Configured AI requests use HTTPS, bounded input/output, a timeout and FAQ fallback |

These are acceptance conditions, not a claim of WCAG certification, provider quality certification or measured availability. Physical-device testing and production deployment review remain separate activities.


## Assistant recovery and verified QR downloads

Signed-in AI starts enabled and can be switched off. OpenRouter requests remain free-only with zero prompt, completion and request price caps, latency preference and denied provider data collection. The free router and another eligible free model provide bounded failover within a twelve-second request budget. Retired endpoints cool down for five minutes; transient failures cool down for thirty seconds. Successful answers are cached for five minutes per authenticated owner, question digest, FAQ version and preferred model, with at most 200 entries. Private-detail screening occurs before caching and provider access. Daily free quotas and invalid credentials have distinct recovery messages; model switching never bypasses account quotas. External free capacity is not guaranteed.

Receiving QRs use native SVG viewports to retain the bank-export pattern and replace surrounding artwork with a white scanning margin. PNG downloads preserve the decoded bank payment payload. Scan verification compares payload hashes with bank-export evidence rather than treating a decorative QR or matching file size as sufficient. The BPI displayed account number is corrected according to lender confirmation. Browser verification runs on Chromium, Firefox and WebKit with temporary fixture accounts and cleanup; reports distinguish simulated mobile layouts from physical-device acceptance.

## Browser verification requirements

A project-contained Playwright suite covers Chromium, Firefox and WebKit. It uses temporary accounts against isolated fixture services, removes them afterward, and never updates borrower balances. Browser engine checks cover public screens, authenticated navigation, AI preference and separate drafts, both composer surfaces, modal focus and reduced motion, and all bank QR downloads. Independent QR decoding compares downloaded payload hashes to the bank-export originals. Physical Android and iOS banking-app scans remain a separate acceptance step.

## Payment confirmation contract

The view consumes the saved payment ID, amount, paid_date, submitted_at, reference, method, receipt_number and requested_allocations. No schema change is required. The server supplies allocation amounts; client-selected titles or totals are not trusted for reconciliation. Preserve date-only payment semantics and distinguish them from the submission timestamp. Monetary subtraction uses integer cents.

A single in-flight submission captures immutable form values before file serialization. Repeated clicks cannot create another call. Account changes prevent stale success UI; server and validation errors retain the current proof and draft. Native file sharing requires supporting browser capabilities and user activation. The image is prepared before the Share click; an unsupported capability uses the download fallback. No external messaging occurs automatically.

## Session continuity and validation spacing

Routine token renewal and repeated confirmation of the same signed-in identity must preserve the active borrower screen and unsent draft. INITIAL_SESSION is the sole initial restore signal; deferred profile requests use generation guards so superseded events cannot restore an ended session. Genuine sign-out still clears account-scoped data. Login validation has room to wrap above the following field at narrow widths.

## Durable proof drafts and loading feedback

Drafts store attachment bytes as ArrayBuffer plus file metadata for browser compatibility. Writes are serialized; owner checks guard asynchronous restoration. Drafts persist until confirmed submission or explicit discard, subject to browser storage availability/eviction. No credentials are stored in draft records and no draft is submitted automatically. Routine borrower snapshots preserve payment form DOM. General feedback uses concurrent request tracking and a 240 ms visual reveal threshold. Successful authentication displays a 7×7 sequenced pulse grid for at least four seconds, followed by a 450 ms opacity fade once Dashboard data is ready. Reduced motion preserves the four-second hold with a static grid.

## Borrower number allocation

profiles.borrower_account_number is a text field with a numeric format constraint and unique index. A private trigger encodes the first five ASCII-normalized given-name letters, padding the base to ten digits, and allocates a suffix under an atomic prefix-counter row lock. Common Latin accents are folded; unsupported characters are omitted. Empty encodings use a zero base. Existing borrowers are backfilled in created_at/id order. Counter values are not reused after deletion. The private allocator and counter are inaccessible to ordinary API roles; profile row permissions remain in force. Account numbers are display references and are not authentication credentials.
