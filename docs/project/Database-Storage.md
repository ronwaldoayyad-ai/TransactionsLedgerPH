# Database & Storage Schema Documentation

Reviewed October 26, 2026. The searchable table/column and bucket inventory below is a read-only production-catalog snapshot; its capture time is shown separately from build time. It contains structure, not borrower rows.

## Core entity relationships
[diagram:database]

Profiles own loans, transactions and account-facing activity. Transactions may be standalone or linked to a loan schedule. Payments store proof/review evidence; reviewed payment_postings and payment_allocations represent fund application. Payment logs, allocation releases and transaction corrections retain related history. fee_assessments link generated charge entries to their assessment.

Notifications have categories, reads, reactions and templates/rules. Messaging and support retain their own events/hidden state. Retail brand assignments link one target transaction or loan; rules contain merchant keywords rather than personal data.

## Isolation and security
All public tables in the captured catalog have RLS enabled. This does not mean every table has identical grants or policy behavior; inspect each table's commands/roles in the inventory and verify actual authorization with tests. Financial/session safeguards also use protected mobile_private functions, retry records and active-session checks. Private-schema implementation is not included as a credential-bearing export.

transaction_group_logos contains three global presentation settings (Cash Loan, Fees, Adjustments), sanitized SVG text, original filename, version and update time. Files are read and validated by the admin-only server; the canonical SVG is stored as small metadata rather than making the proof/attachment Storage buckets accept SVG. Active sessions can read the group artwork through RLS. Data API writes are revoked, and the existing server performs versioned, idempotent saves. Realtime publication refreshes borrower logos without ledger changes.

Realtime publication is a configured subset, not every table. Signal tables represent invalidation/version changes; clients refresh authorized source rows rather than trusting a signal as financial evidence.

## Storage boundaries
The captured bucket inventory distinguishes public avatars from private payment-proofs and mobile-attachments. Payment proofs and general private attachments are capped at 5 MB by their bucket limits; avatars have a separate 2 MB limit. Allowed MIME types differ by bucket. Upload validation can impose additional workflow rules and decoding checks; a bucket MIME list alone does not authorize a file.

Private-file downloads require authorized/signed access. Do not document or export live object paths, signed URLs, bank information or file contents in this reference.

## Migration and recovery rules
The repository migration inventory is source history, not a claim that every file should run against production. Use the reviewed forward candidate and manifest, compare actual live schema/configuration and reconcile legacy records before accounting changes. Database, Auth, Storage and configuration recovery must be captured and restored in isolation as separate release gates.

Changing archived_at can remove dues from active views while leaving physical rows intact. Archiving, permanent deletion, hiding a display breakdown and reversing a posting are separate operations. Brand assignment modifies presentation metadata and must not change financial records.

## Updating this catalog
After a schema change, capture metadata read-only, exclude row data and secrets, update schema-catalog.json and the relevant narrative, run documentation/schema checks and rebuild. The app intentionally does not embed a privileged production connection or automatically query private metadata from the browser.
