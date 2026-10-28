# Notification rules and message management

Implemented October 16, 2026, in local staging. Production has not been changed.

## Admin use

Open **Notifications** in the admin workspace:

1. **Rules & canvas**: create, duplicate, enable or disable rules. Drag block headers or use arrow keys. Connect an output to another block's Connect input. Add When, If, Delay and Send blocks. AND/OR groups may be nested; Yes/No branches allow conditional messages.
2. Configure source event, recipients, timing, category, surface, spacing, English/Filipino copy and placeholders. Existing saved templates can be copied into a Send block. Sample preview does not send anything. Local draft edits survive navigation in that browser session.
3. **Review & save** shows linked read/unread counts, queued deliveries and a sample before/after comparison. Choose whether to apply changes to linked past notifications and queued messages. Original recipients, notification IDs, reads, replies and reactions are preserved. Past surface changes do not replay pop-ups. Future-only edits leave previously queued message versions pinned. Disabling or deleting cancels waiting deliveries.
4. **Sent & linking**: search, edit text, archive/delete or restore individual messages. Link a legacy message only after choosing its real source event and reviewing the captured values. Unmatched messages remain editable. Linking alone does not resend or rewrite the message. Unlinking preserves the audit history.
5. **Compose & inbox** retains the existing composer, attachments, replies, reactions and template management. Editing a composer template alone does not rewrite rules; copy it into a rule and publish that rule.
6. **Activity** shows recent event processing, deliveries and administrative changes; failed work can be retried. Refresh buttons request updated records. No browser polling loop or whole-page refresh was added.

## Supported scope

The event catalog covers proof submission and review, posted payments, due dates, loan submission/status, statements, disbursements and acceptance, support submission/status, notification replies/reactions, lender notices, Pawcheebels welcome/idle invitations, payment/support confirmation pop-ups, sign-in errors/locks and generic app feedback.

Business events support inbox/bell, banner, speech bubble and pop-up delivery. Screen confirmations/errors use pop-ups or banners with a maximum five-minute delay. Pawcheebels welcome/idle events use its existing Dashboard speech bubble and session dismissal rules. Screen rules change presentation, never authentication lockouts, payment values, record validation or transaction outcomes. Payment/support confirmation Save Image and Share retain captured details and use the configured heading/message. Document upload/download loaders remain separate.

Rules use supported app events and safe data comparisons; they do not execute arbitrary JavaScript, SQL, external webhooks, email or SMS. The canvas supports 2–32 blocks, 64 connections, six nested condition levels, delays up to 30 days for saved business events and 1–120-second display duration. A rule with multiple paths to the same Send block delivers that block once at the earliest matching delay. Message spacing applies per rule/block/recipient.

Thirty-five defaults preserve the audited automatic messages and invitation variety. The daily due-tomorrow reminder is disabled initially. Due schedules use Asia/Manila and require the local server to be running; when restarted, it evaluates that day's eligible rules. It does not backfill missed calendar days. Past notifications with no original event remain unlinked; no text-based provenance inference is used.

## Data and authorization

Private tables hold versioned rules, event snapshots, deliveries, links and administrative history. Authenticated borrower sessions cannot directly read or mutate them. All management actions verify a live admin session. Presentation responses expose only eligible screen rules, not inbox event payloads or recipient lists. Archived messages are hidden through RLS and application filtering; archiving preserves their discussion records.

Known automatic database producers capture an event in the same transaction as their former notification insert. Existing financial checks and statements are retained. A worker plans deduplicated deliveries, applies recipient/language restrictions, waits until due and retries failures up to eight times. A database wake signal and indexed 15-second queue fallback operate on the server; they do not refresh browser records. Frontend-generated documents and payment-log notices publish events after their existing save/document work; this path still depends on the client completing that follow-up request.

Migration: `supabase/migrations/20261016143643_notification_rules_and_delivery.sql`. The local development service starts with Vite. A hosted deployment needs the migration, equivalent authenticated service and a continuously running worker before enabling these controls outside staging. The app retains its existing notification tools in environments without that service.

## Audit and verification

Baseline: 120 existing notifications and 32 composer templates. The initial install added 35 rules, with zero legacy links and zero new business events. No existing notification text, read state, reply or reaction was changed during installation. The installed local proof-submission function already had correct submitted-for-review wording; a historical migration had stale wording.

See the workspace outputs/notification-audit inventory and outputs/notification-rules/VERIFICATION.md. Static checks and visual review are not evidence of an authenticated end-to-end send, retry, lockout or retrospective edit; those flows have not been exercised against real borrower data for this task.

## October 17 follow-up

The ambiguous rule_id aggregate was corrected and protected by five SQL/error-feedback regressions and a local publish gate. A disposable-account Chrome run passed ten authenticated read-screen/API checks, including all 35 rules, sent messages and activity. Accounts were removed and existing notifications were unchanged. Writes and retrospective mutation acceptance remain unverified. See Locked-Sign-In-Support.md for the new lockout support handoff.
