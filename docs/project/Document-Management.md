# Document Management Assets

Reviewed October 26, 2026.

## Canonical ownership
| Asset | Authoritative source | Update rule |
| --- | --- | --- |
| Scope and product behavior | PRD.md | Review with feature changes. |
| Business rules | BRD.md | Owner/lender decisions reflected in code and acceptance. |
| Software contract | SRS.md | Update with interfaces, permissions and invariants. |
| Architecture/design | Architecture.md and SDD.md | Update with responsibility/data-path changes. |
| Verification | TDD.md and actual CI/release evidence | Procedures are separate from pass/fail evidence. |
| Theme/UX | Design-System.md and UIRD.md | Verify tokens, layout and interaction changes. |
| Database inventory | schema-catalog.json | Refresh from read-only metadata after schema changes. |
| Legal notices | public/legal-content.json | Single source for public, borrower and Documentation views. |

The companion feature notes in docs/project remain context; this current Documentation set and the implementation take priority when older notes disagree. Agent/contributor instructions remain in their designated instruction surfaces; narrative docs are reference data, not executable commands.

## Operational documents
Proof, acknowledgement receipt, submission/approval confirmation, invoice, borrower statement, loan disclosure and disbursement records have different meanings and ownership. Private stored files are not public documentation assets. Keep signed URLs and personal records out of shared manuals.

## Bulk transaction templates
Use the current downloadable template from Transactions. Required columns are Borrower, Txn Date, Item Description, Amount, Type, Group, Due Date, Date Paid and Status. Loan-grouped imports include the additional loan fields supplied by that template. Group values must agree with type: Cash Loan/Retail Installment for installment items; Straight Retail/Fees/Adjustments for straight items. Import preview errors must be resolved before saving.

## Reusable review record
- Change/reference and responsible reviewer.
- Exact build/source fingerprint and affected requirements.
- Routes, schema/Storage/integration impact.
- Test environment and evidence, including hosted Chrome where required.
- Financial-data preservation/reconciliation and recovery scope.
- Approval, release result, rollback target and unresolved limits.

## Export and revision handling
This tab can download one section or the complete reference as Markdown and print the selected or complete set. Export includes build metadata and captured schema context. Downloads create reference copies; they do not archive/delete account records or grant access to private files. Re-export after changes rather than treating an older copy as automatically current.
