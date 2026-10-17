# Pawcheebels AI Configuration and FAQ Maintenance

Version: v4.12.24. Updated October 14, 2026. Provider: OpenRouter. Model policy: free models only.

## Server configuration

Use [.env.ai.example](../../.env.ai.example) as the configuration template. Store the actual key in the protected server environment or secret manager:

```dotenv
PAWCHEEBELS_AI_ENABLED=true
PAWCHEEBELS_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-server-key
PAWCHEEBELS_AI_MODEL=openrouter/free
PAWCHEEBELS_AI_BASE_URL=https://openrouter.ai/api/v1/
```

Never put the key in chat, source control, public JSON, browser storage or a VITE_ setting. The Windows operator setup prompt accepts the key with hidden characters and restricts the settings file to the operator and SYSTEM. Restart the server processes after configuration changes so settings are reread. Key rotation follows the same process; revoke the old key in OpenRouter after confirming the replacement.

## Free-model routing

The default uses `openrouter/free`, avoiding dependence on a single free model that may lose its endpoints. Provider routing prioritizes latency, optional reasoning is disabled, and answers are requested in fewer than 90 words. The [Free Models Router](https://openrouter.ai/openrouter/free) selects from available free models, whose reasoning requirements can vary. A specific model ending in :free may be selected. The server rejects paid model slugs and applies zero maximum prices to prompt tokens, completion tokens and per-request charges. It does not switch to a paid model when free capacity is unavailable.

Review response speed and FAQ accuracy together before changing the recommended model. Provider load, availability and account controls affect timings, so a measured result does not establish a permanent fastest model. Latency preference chooses the fastest eligible provider for the selected model; it does not compare every model on each question.

OpenRouter applies account and provider limits. Review the account’s remaining allowance and [rate-limit documentation](https://openrouter.ai/docs/api/reference/limits). Free capacity, selected models and generated accuracy can vary. A limit, failed request, unavailable provider, incomplete answer or timeout returns FAQ guidance and releases the sending controls.

## Privacy and authority

AI assistance is enabled by default for signed-in users, who can turn it off before sending a question. Requests contain only the current question and server-selected public FAQ references. Automatic ledger rows, bank details, payment proof, support tickets, lender chat and authentication tokens are excluded. Keep private details out of questions. Provider routing requests data_collection: deny; this is a routing control and does not replace review of OpenRouter and underlying model-provider terms. The assistant has no financial action or autonomous messaging tools.

## Connection verification

1. Check that status reports the expected provider, free-only model and configured state without exposing the key.
2. Sign in, select Ask Pawcheebels, confirm AI assistance is enabled and ask a general app-navigation question.
3. Confirm AI-assisted labels for a greeting and a general question without FAQ matches. Confirm app questions retain relevant references; general replies do not claim FAQ citations.
4. Confirm unknown app policies route to support, private-detail patterns block external calls, and failure, limits and timeout produce recoverable guidance.
5. Verify Message lender remains a separate user-submitted account action.
6. Check representative browsers, phone layouts, accessibility and interaction response times. Record outcomes without retaining private prompts in documentation or the graph.

## FAQ lifecycle

[faq-knowledge.json](../../public/faq-knowledge.json) is the shared source for the FAQ screen, browser fallback and server references. Preserve IDs, update category/question/answer/keywords together and increment the content version. The project owner reviews policy, status, rate and fee wording. Do not import private borrower rows or chat content.

Retrieval is lexical and supplies up to three references. Add representative phrasing, validate matching, general questions and unknown app policies, and release content through change control. Server references load at initialization, so reload server processes after content changes and publish matching browser assets.

## References

Request shape and routing controls follow [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection). Data-subject rights wording references the [National Privacy Commission](https://privacy.gov.ph/data-subject-rights/).
