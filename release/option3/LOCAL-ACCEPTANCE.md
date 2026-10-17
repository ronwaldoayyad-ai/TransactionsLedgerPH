# Option 3 acceptance evidence

Prepared October 17–18, 2026 (Asia/Singapore). **Local candidate accepted for hosted testing; production release is not approved.**

## Implemented

Vercel Node API adapter, Supabase-backed queue and rate counters, validated private uploads, shared Classic/New session storage, safe Classic fallback, server-issued exact proof timestamps, protected worker endpoint, additive migration bundle and CI checks. Hosting remains entirely on Vercel and Supabase.

## Checks actually completed

| Check | Observed result |
| --- | --- |
| Regression suite | 38/38 unit checks pass with bounded concurrency. An earlier parallel run hit one image-worker timeout; the repeated bounded run passed. Image decoding now limits native threads. |
| Notification SQL | 5/5 checks pass against local PostgreSQL, including preparing the service's literal queries, ambiguous-column regression, read handlers and safe database-error feedback. |
| Scoped lint and build | `src` and `tests/unit` lint passed; fresh preview compilation passed. The existing large-chunk warning remains. |
| Additive migration | Applied to an isolated database restored from the captured production public schema plus schema-only Auth/Storage dependencies. No customer rows copied. Six Classic borrower policies preserved. Rollout remains paused, default Classic. |
| Database failure recovery | Injected SQL failure rolled back completely; no partial marker remained. This is not a full production backup restore. |
| Scheduler | Local transaction successfully created the Cron job and event wake, denied ordinary users worker execution, then rolled back. No permanent job or remote HTTP call was enabled. |
| Exact proof timestamp | Server clock used, client backdating blocked, later edits cannot change it; test transaction rolled back. |
| Source package scan | 407 application files copied into the release checkout; no privileged JWT, provider key, secret key or private key matched the bounded scan. Environment secrets and local state excluded. Separate native Expo prototype excluded from this web release. |

## Chrome DevTools acceptance — local production-style preview

These are observed browser interactions, not inferred from compilation. Tests used disposable local accounts.

- Admin password login reached the redesigned workspace; assigned New borrower reached New; Classic borrower stayed Classic.
- Flag-off build sent an assigned New borrower to Classic, with no release API calls. A simulated release-service failure also recovered to Classic.
- Admin changed a synthetic borrower New → Classic → New through reviewed controls. The open page did not reload itself; the next reload followed the new assignment.
- Borrower requests for administrative release settings and another borrower's assignment were rejected with 403. A stale admin update returned 409.
- Return to classic admin opened without reauthentication. The independently built original Classic source also opened successfully. This remains a local build, not a frozen public Vercel recovery deployment.
- Admin idle interval of approximately 51.8 seconds caused zero additional requests and zero navigations.
- Six-digit Login Code automatically proceeded to the Dashboard without a Continue click. The success animation lasted approximately 4504 ms, retaining the requested four-second minimum.
- Invalid password attempts showed 4, 3, 2, 1, then 0 remaining and a locked state. Fields became disabled. Admin unlock restored access. No real user's credentials were changed.
- A synthetic PHP 1,000 proof retained its file, amount, date, method, reference, notes, selected dues and confirmation after reload. A forced validation failure preserved the draft; retry produced one pending proof. The financial due remained unpaid until approval.
- A generated 4,129,538-byte support screenshot became a 1,412,360-byte JSON request. One ticket and a validated 1,059,014-byte private WebP were stored. Its confirmation included Save Image/Share and had no horizontal overflow.
- The notification New button opened an unsaved rule editor. Category grouping and date-sort controls were present.
- At 390-pixel mobile width, the tested borrower page and frame had no horizontal overflow.
- API methods and missing routes returned JSON errors, not the SPA homepage.
- October 18 final check: fresh password sign-in reached the Dashboard; native proof validation through the Web Request adapter returned 200/valid. The first local validation took 6276 ms; a repeated check after refreshing the temporary preview key took 1047 ms. The refreshed Dashboard had no console errors and no horizontal overflow. Hosted performance remains unmeasured.

## Remaining gates

1. Access to isolated Supabase project `lzprybrxhwktfxqvsbjk` is restored. The schema and storage baseline are now installed and checked; no production records were copied and no test Auth accounts exist yet. See HOSTED-PREVIEW.md for the latest hosted checks.
2. Vercel connection is not yet confirmed. No hosted function build, Linux native dependency package, TLS database session, hosted cookie, Auth hook or pg_net/Cron delivery has passed acceptance yet.
3. Capture and rehearse a current full production recovery set, including Auth configuration/users and Storage objects. The source tag/archive and schema-only rehearsal do not satisfy this requirement.
4. Verify live schema drift against the candidate, freeze an independent public Classic deployment, then run the documented hosted acceptance matrix and pilot recovery tests.
5. Review hosted cold/warm request timings. Local file validation is noticeably slower than a warm UI interaction, so do not treat the current local measurement as a hosted performance pass.
6. The Free/Pro-compatible app counts password failures at its sign-in endpoint. Direct failed Auth password requests outside the app are not counted without Supabase's optional higher-plan Password Verification hook. The standard Custom Access Token hook must be configured to enforce existing account locks on fresh Classic/OTP sign-ins.

Production domains, production data, GitHub main and live credentials have not been changed. Do not enable borrowers from this local evidence alone.