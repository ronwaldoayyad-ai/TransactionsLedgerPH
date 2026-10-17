# Login attempts and lender unlock

Updated October 16, 2026. Local staging implementation; production has not been changed.

## Requirements — F43

Entering the sixth Login Code digit automatically submits one attempt. Typing, pasting and the on-screen keypad use the same action. Only one request may run at a time. An invalid-code pop-up shows remaining attempts. Try Again clears the code and returns focus to its input; the email/password flow still requires Sign In and preserves the email on failure.

The owner selected code-only login. Unknown or revoked codes cannot identify a borrower, so five invalid Login Codes lock sign-in on the current device. Email/password failures use the identified account, with five consecutive invalid attempts locking both sign-in methods for that account. Unknown email addresses use a private keyed email digest. A valid credential before lockout resets its associated counter. Network, timeout, service and rate-limit errors do not deliberately increment a counter. Malformed/incomplete input is not a credential attempt.

Locks persist across page reloads and server restarts. Waiting or resetting a password does not unlock access. A correct Login Code cannot bypass an account lock. The signed device cookie prevents editing the device identifier; clearing browser cookies or using another device is outside the scope of a device-only limit. This does not clear an account lock.

Locked feedback is centered. The pop-up distinguishes account locks and device locks, displays the unlock reference, and offers guest support and Check access. A borrower may use another account after an account lock; the locked account remains blocked on the server. A device lock disables both methods on that browser until unlocked. Check access is explicit; there is no repeated background polling. English and contextual Filipino copy are provided.

## Lender workflow

In Borrowers → Login access, the Sign-in locks card lists locked accounts and devices. It is also available wherever the existing lender Login Code controls appear. Match the user's unlock reference and select Unlock. Refresh locks requests current data once. The user then selects Check access or reloads the login page.

Unlock requests require a verified active lender and an existing Auth session. Each successful unlock records the lender, lock reference and time in a private audit table. Changing a password, issuing a new Login Code and unlocking are separate actions. A sole administrator who loses all authenticated sessions and locks their own account requires a trusted operator with direct local database access; there is no unauthenticated unlock endpoint.

## Backend design

- [Private schema and Auth hooks](../../server/sql/login-access.sql): private durable counters, row security, no anonymous/client access, invoker functions callable only by the Auth service.
- [CLI-created migration](../../supabase/migrations/20261016133725_login_access_lockout.sql): same schema, applied to local staging and recorded in local migration history.
- [Sign-in companion](../../server/login-access.cjs): server-signed HttpOnly device cookie, serialized counter mutations, generic credential errors, server-returned attempt metadata and authorized unlocks. Credentials, codes and device cookie values are not logged.
- [Password session integration](../../src/lib/loginAccess.js): local sign-in request followed by the normal Auth session lifecycle.
- [Borrower feedback](../../public/v41224-login-access.js) and [styles](../../public/v41224-login-access.css): accessible native dialog, retry/focus behavior and disabled controls.
- [Admin controls](../../src/components/admin/LoginAccessLocks.jsx): initial and explicit refresh only, with no account password exposure.

Local Auth configuration enables `password_verification_attempt` and `custom_access_token` hooks in the private schema. The password hook counts direct Auth attempts as well as the app flow. The token hook rejects fresh sign-ins for locked accounts, while allowing existing sessions to refresh so a malicious failed login does not evict an active payment submission. Existing account status and RLS checks continue to apply.

The existing successful-authentication animation remains at least four seconds and overlaps session/profile preparation. No additional success hold was introduced.

## Review and delivery limits

Focused ESLint, JavaScript parsing and the production bundle completed successfully. The local Auth health endpoint returned 200 after hook configuration. Schema inspection confirmed both hooks use invoker rights and anonymous callers cannot execute them. The read-only local database security advisor reported no issues. Chrome DevTools reviewed the invalid-code and locked pop-ups at 320 pixels with synthetic display state, including Filipino text and disabled sign-in controls; no console errors appeared in that preview. This was visual review, not an authenticated end-to-end login/lock/unlock run. No automated tests, password changes or real-account failed sign-ins were performed for this delivery. Prior 43-check evidence predates F43 and must not be treated as coverage for it.

The local app servers were restarted with live reload disabled. Reload a browser page once to load the new assets. Local Auth was recreated from its existing image/configuration with the two hooks enabled; its prior stopped container is retained for rollback. Database records and sessions were preserved. The managed production environment needs its own secured service and hook configuration before F43 can be represented as deployed there.

Sources consulted: [Supabase password verification hooks](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook), [custom access token hooks](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook), and [self-hosted hook configuration](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-hooks).

### Inline notice placement correction

The lock notice is a full-width sibling immediately below the sign-in method tabs, outside their two-column grid. This centers the notice across both methods instead of restricting it to the first tab column. Chrome layout review at 390 pixels confirmed equal tab/notice widths and zero horizontal center offset using synthetic display state. Static assets only; reload once, no server restart.
