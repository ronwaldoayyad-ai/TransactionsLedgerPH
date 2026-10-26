# Information Architecture & UX Artifacts

Reviewed October 26, 2026.

## Admin information architecture
The generated route inventory below reflects the build. Workspace navigation groups borrower/review tasks, collections, lending, communication and management. Documentation is a management destination in both the New and Classic admin navigation; workspace search can find it.

## Borrower information architecture
[diagram:borrower]

Mobile primary destinations are Dashboard, Transactions, Payments, History and More. Desktop adds persistent navigation to supported destinations such as messages, notifications, invoices, disbursements and support. The iframe's screen states are not separate public React routes; the build inventory distinguishes them.

## Core UX artifacts
| Artifact | Current implementation |
| --- | --- |
| Journey: understand a balance | Current/next card → detailed breakdown → transaction/schedule. |
| Journey: submit payment | Positive dues → proof upload/replacement → OCR review → pending confirmation → lender allocation → approved evidence. |
| Journey: request credit | Enabled access → amount/term/bank/disclosure → submitted request → recorded timeline. |
| Journey: recover access | Lock message/reference → contextual support → lender review/unlock. |
| Content hierarchy | Page title, summary, filters, primary records, progressive detail and context actions. |
| Progressive disclosure | Five initial recent payments, expandable lists, category filters, card/list switch and record details. |
| Recognition | Shared retail logos, stable account reference, explicit status badges and consistent document buttons. |

## Wireframe: Documentation
Desktop: page heading/actions; build reference summary; searchable contents sidebar; selected document article; structured diagrams/tables; source metadata. Mobile: heading and actions wrap, contents collapse to an accessible selector, article uses the available width and large diagrams/tables scroll inside bounded regions. Search filters document sections and explains empty results.

## Navigation and accessibility acceptance
Support direct links to a document section, visible selected state, keyboard-accessible controls, meaningful headings and text equivalents for diagrams. Preserve form work during unrelated updates. Distinguish downloadable documents from account mutations. No action should become a different operation because two controls are adjacent.

## User research and limits
These are implementation-derived journeys and UX acceptance artifacts. They are not claimed to be results of interviews, a usability study or a formal WCAG certification. Validate with representative borrower/admin devices and record feedback before asserting measured usability outcomes.
