# LoanLedger PH — Project documentation

Version: v4.12.24. Updated October 14, 2026. Owner: LoanLedger PH project owner. This document set defines the borrower service, its React/Supabase integration, Pawcheebels FAQ and AI assistance, and lender communication.

## Documents

| Document | Purpose |
| --- | --- |
| [Login-Access.md](Login-Access.md) | Automatic Login Code sign-in, five-attempt account/device locks, admin unlock and review limits |
| [Dashboard-Shortcuts.md](Dashboard-Shortcuts.md) | Combined borrower orb, compact fan menu, existing interfaces and visual review limits |
| [Admin-Workspace.md](Admin-Workspace.md) | Lender workspace, staging data completeness, manual refresh, verification boundaries and source links · October 16, 2026 |
| [BRD.md](BRD.md) | Business goals, stakeholders, scope, constraints and outcomes |
| [PRD.md](PRD.md) | Product behavior, feature priorities and release boundaries |
| [FRD.md](FRD.md) | Functional rules and failure handling |
| [SRS.md](SRS.md) | Software interfaces, data requirements and acceptance criteria |
| [SDD.md](SDD.md) | Software design and component responsibilities |
| [TDD.md](TDD.md) | Technical design, verification strategy and evidence |
| [UIRD.md](UIRD.md) | Screen structure, interaction and accessibility requirements |
| [URS.md](URS.md) | Borrower, guest and lender user requirements |
| [Design-System.md](Design-System.md) | Reusable visual and interaction rules |
| [Architecture.md](Architecture.md) | System boundaries, data paths and deployment dependencies |
| [Agents.md](Agents.md) | Guidance for development agents and Pawcheebels boundaries |
| [user-flow.md](user-flow.md) | End-to-end navigation and recovery flows |
| [AI-Setup.md](AI-Setup.md) | Optional AI configuration and FAQ maintenance |

The requested SDD/TDD and UIRD/URS are supplied as separate companion files so each can be read and maintained independently. Architecture.md serves as the technical architecture requirements document.

## Requirements and acceptance

The documents use stable business, functional, quality and user requirement IDs. [TDD.md](TDD.md) defines acceptance and recovery scenarios. [AI-Setup.md](AI-Setup.md) explains OpenRouter’s free-model configuration and FAQ maintenance. [Architecture.md](Architecture.md) describes service hosting and security boundaries.

No borrower names, credentials, bank details, payment proofs or private ledger exports belong in the documentation or project graph. Approval of financial decisions remains with the lender.

## Change control

Update the relevant requirements and flow documents with every behavior change. Record affected requirement IDs, tests, migration effects and restart instructions. Keep FAQ text aligned with implemented navigation. Review legal notices when data destinations, retention or AI processing change. Update Graphify using the canonical source scope, excluding credentials, generated builds and private exports.

- [Notification rules and message management](Notification-Rules.md)

- [Locked sign-in support handoff](Locked-Sign-In-Support.md)
