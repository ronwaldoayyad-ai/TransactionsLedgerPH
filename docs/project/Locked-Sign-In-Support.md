# Locked sign-in support handoff

October 17, 2026 · local staging

## Behavior

- When sign-in is locked, email/password inputs, password visibility control, Login Code input/keypad and sign-in buttons are disabled. Login Code cells have no active blue border or animated ring. Existing server-enforced locks and lender unlock decisions remain authoritative.
- Contact Lender Support from the lock pop-up, Help & Support from the sign-in screen and Forgot password all use the same support handoff when access is locked.
- The handoff captures only the lock/error pop-up as a PNG, attaches it to the editable support draft, selects **Unable to log in**, and fills the issue description with sign-in method, error details, lock scope, remaining attempts, unlock reference and timestamp. A known email is filled for email/password attempts; code-only login does not guess an email.
- Closing the pop-up before opening Help & Support preserves its error snapshot. Capture is done on demand, with loading feedback, using locally bundled html2canvas 1.4.1 (MIT). The capture library is not loaded during ordinary sign-in. No screen-sharing permission or external screenshot service is used.
- Only the dialog is rendered into the image. Passwords and entered Login Codes are not copied into the description or screenshot. The PNG can be reviewed, removed or replaced through the existing attachment controls.
- The form is never submitted automatically. Existing Submit to Contact Support remains the explicit submission action and includes the screenshot in its normal attachment payload. Description remains editable and capped at 2,000 characters. Long custom error copy is shortened so the unlock reference and attempt details remain present.
- If capture fails or times out, the form still opens with the error details and explains that a picture can be added manually. Returning to sign-in keeps the inputs disabled until the lock state is cleared by the existing access check or alternate-account flow.

## Verification

`npm run test:locked-support` requires the local app at http://127.0.0.1:5173 and installed Chrome. Ten browser checks cover disabled controls, both support entry points, nonblank PNG attachment, edited draft payload, returning to locked login, cleared lock state, on-demand library loading and capture failure. Synthetic lock states are used; submission is intercepted, so no real account is locked and no live ticket or lender message is sent. This verifies browser handoff and payload, not the existing server's ticket persistence/upload pipeline.

Evidence: workspace outputs/notification-rules/locked-support/results.json, example cropped PNGs and locked-support-browser.log. The local build and Node parsing pass. Production is unchanged.

## Related notification repair

The Rules screen's joined count query now selects and groups by l.rule_id. Five database/error-feedback regressions pass, including preparing all 62 notification-service statements against the actual local schema. The local notification publishing helper runs these checks and aborts a release on failure. A separate disposable-account Chrome run passed ten real authenticated API/read-screen checks; its accounts were removed and the 120 existing notifications remained unchanged. Rule publish/send/retroactive mutation acceptance is outside that read-only verification.
