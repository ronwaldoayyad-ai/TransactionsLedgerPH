# Technical Diagram and Documentation

Reviewed October 26, 2026. The live web deployment uses Vercel and Supabase. The diagram omits secrets and private account data.

## System architecture
[diagram:architecture]

The React host owns authentication, role-based routing, providers and service calls. The New borrower HTML document owns presentation inside a same-origin iframe. Classic borrower and admin pages remain React routes. Administrative Documentation is lazy-loaded and guarded like other admin routes.

## Trust boundaries and data paths
The frame/host bridge uses the loanledger-v41224 channel and validates both source window and origin. Borrower snapshots contain account-scoped presentation data; credentials and server secrets are not sent into the frame. A rendered screen is not an authorization boundary: Supabase policies, active-session checks and guarded server/RPC operations enforce access.

Ordinary account reads use the Supabase client and RLS. Reviewed accounting uses database/server operations with expected-state checks and stable retry identifiers. Private attachments are uploaded to allowed buckets and validated before they are accepted by business workflows. Private downloads use controlled/signed access.

Vercel's API adapter checks origin, method, route and request limits, then invokes the relevant service. Database connections, privileged keys, Login Code secrets, Telegram credentials and optional SMTP/AI settings stay server-side. Public VITE variables are configuration, not a place for secrets.

## Realtime and jobs
[diagram:realtime]

Providers subscribe to relevant changes and invalidation signals. Ledger, payment-due, message and notification signal tables permit targeted refresh. A refresh updates the read model; it does not repost a payment. Durable notification/Telegram queues and scheduled worker retries are operational services, not browser polling loops that rewrite account data.

Supabase Cron/pg_net and protected worker access are configured separately from the front-end build. A protected preview and the canonical production worker must not both become uncontrolled senders.

## Integrations
Brandfetch browser search and direct logo delivery use the public Client ID. Saved associations are local presentation metadata with ownership/version checks; ambiguity remains for review. The borrower Payments border now reuses Finder CSS and has no liquid-metal shader dependency.

Telegram sends configured proof-submission and borrower-message alerts to the verified private destination. An alert links back to the app and does not approve or post funds. Pawcheebels uses maintained FAQ/reference content and the configured free-model AI path; it cannot invent account actions.

## Deployment and recovery
Build in the accepted Vercel project, run CI and hosted Chrome checks, then promote that same immutable build. Preserve domain/protection settings. Schema releases need an independently reviewed forward candidate, fresh protected recovery set, isolated restoration proof, legacy reconciliation and explicit cutover authorization. Reverting a UI build does not reverse accounting operations.

## Implementation references
- src/components/VersionedBorrower.jsx
- src/lib/realtimeInvalidation.js
- server/web-api.cjs
- server/hosted-runtime.cjs
- release/option3/README.md
