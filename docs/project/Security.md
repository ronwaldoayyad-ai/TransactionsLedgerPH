# Security audit and operating requirements

Reviewed October 28, 2026. Engineering assessment, not certification. Local test results do not establish that production has changed; the release record must identify the exact deployed commit.

## Implemented web controls

- Build/runtime configuration rejects missing values, privileged browser keys, unsafe origins, shared worker credentials and production demo mode. Database TLS verification cannot be disabled by connection-string options. Environment examples contain placeholders only. Native public configuration has no embedded production fallback key.
- Supabase manages bcrypt passwords and refreshable sessions. Live session/account checks, active-admin guards, database ownership policies and RLS remain authoritative. Public tables have RLS; private service tables have no anonymous/authenticated table grants. Do not add permissive policies to fix a client error.
- Durable HMAC-keyed quotas use the existing private `service_rate_limits` table. Sign-in methods share 15 requests/minute and 120/hour per platform IP (IPv6 /64). Cookie replacement and a fresh service instance do not reset quotas. Existing five-failure locks remain. Guest support permits 5/minute and 20/hour; AI permits 30/minute/IP, 12/minute/user and 200/day/user. Storage failure returns a generic retryable error. Shared-network users can encounter limits; investigate before increasing them. Application quotas do not replace edge DDoS protection.
- Hosted APIs require JSON, enforce exact origins, bound payloads and scrub unexpected failures. Parameterized SQL, ownership checks and content validation remain required. Upload validation encodes owned storage-path segments, refuses redirects and bounds streamed bytes before inspection/attestation.
- CSP hashes shipped inline scripts and restricts script, network and image sources. Help/download wrappers no longer use `eval`. OCR uses WebAssembly permission, not general JavaScript evaluation. Legacy event-handler attributes and inline styles remain an explicit compatibility exception: remove them through a tested migration before enforcing `script-src-attr 'none'`. Do not broadly add script `unsafe-inline`, JavaScript `unsafe-eval` or wildcard hosts.
- HSTS, nosniff, same-origin framing, referrer and permissions policies apply globally. Private/source/config/map URL patterns are blocked; genuine application routes still load. Production SDK debug logging is disabled. Spreadsheet exports neutralize formulas while preserving signed amounts. Archiving requires review and a successful save before rows leave the view.
- Web packages and CI actions are pinned; dependency audit and offline source scanning are CI gates. PDF.js 6.4.299 uses evaluation-disabled parsing and loading-task cleanup. Local OCR/PDF resources have a hash manifest. Never apply forced framework upgrades just to suppress audit output.

## Remaining requirements and owner choices

| Item | State and required follow-up |
| --- | --- |
| Admin MFA | No enrolled admin factor found. Owner requests documentation, not enrollment/enforcement. Enroll and verify recovery before requiring MFA. |
| Reusable Login Codes | Owner retains reusable non-expiring codes. Quotas reduce guessing; copied codes and distributed guessing remain risks. Rotation/revocation stays a lender operation. |
| Browser tokens/CSP | Existing Supabase browser token storage preserves the Classic/new-interface contract. XSS could expose tokens. HttpOnly server sessions and removal of inline handlers need a dedicated migration and cross-interface tests. |
| Runtime database role | TLS and guarded functions do not establish a least-privilege connection identity. Review effective grants, rehearse a restricted role and rotate through a reviewed cutover; do not blindly revoke the current role. |
| Password screening | Supabase leaked-password protection is disabled and plan-dependent. No billing change or password reset was performed. Verify an available control with the owner. |
| Native dependencies | Separate Expo 57 lockfile initially reported 27 advisory entries (1 critical). Compatible lockfile patches reduced this to 12 (0 critical, 4 high, 3 moderate, 5 low), including dependency chains. Remaining causes include Expo CLI's Zod 3, Metro's image-size 1, query-string's decoder and deepmerge. Native release is blocked pending compatible patches/framework review and build/device tests. These packages are outside the Vercel web bundle. |
| Native configuration/storage | Supply explicit EXPO_PUBLIC_SUPABASE_URL and publishable EXPO_PUBLIC_SUPABASE_ANON_KEY before the next native build. AsyncStorage session protection requires a separately tested encrypted-storage migration. No native build was deployed by this audit. |
| Operations | Verify edge firewall, managed Auth quotas, incident access and monitoring in provider settings. A missing custom firewall configuration does not prove managed protection absent. Application rate limits do not guarantee DDoS protection. |
| Scan coverage | Reachable Git text blobs were reviewed; binary/unreachable objects and external logs/backups are not certified secret-free. No live credential was identified in reviewed text. Supabase public keys and Brandfetch Client IDs are public identifiers. |

## Verification and release

Run `npm ci`, `npm run security:scan`, `npm run security:audit`, `npm run lint:release`, `npm run test:release` and a production-mode build with explicit public configuration. Run database rollback/accounting/ownership tests only against an isolated loopback database. `request-security.test.cjs` proves real concurrent PostgreSQL quota enforcement and expiry.

After modifying borrower inline scripts run `npm run security:headers`; verify generated header parity and OCR asset hashes. Capture the documentation inventory after editing tests/migrations/examples. In Chrome check mobile/desktop navigation, first-open Finder, selection, image and PDF OCR, downloads, Help, logos, CSP and sensitive-path denials. Synthetic UI checks do not replace authenticated hosted acceptance.

No financial backfill, historical proof reinterpretation, credit operation or schema migration is required by these controls. Before publication, review the final diff/CI and the exact protected candidate; retain the current production deployment for rollback. Credential rotation, MFA enforcement, plan changes and database grants need their own reviewed change.
