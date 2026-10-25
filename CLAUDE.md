# Grant Firefight

Grant readiness coach for volunteer fire departments: a Cloudflare Worker (Hono with server-rendered JSX, D1, Workers AI) plus the Claude API. See README.md for what's built and why.

## Guardrails (product rules, not style preferences)

- The coach and checker never write narrative prose, sample sentences or rewrites. FEMA disqualifies narratives that copy other submissions; departments must write their own words.
- Never show one department's draft text, or its name, to another department. The similarity guard reports overlap with "another department's draft".
- Never submit anything for a department, and never call anything a "FEMA score" or predict wins. Use "priority match".
- No patient-level EMS data anywhere. Call data is aggregate counts.
- No contingency or percentage-of-award pricing.
- Every grant rule in `src/library/` or `src/domain/` cites a source in `src/domain/sources.ts`. If a rule can't be cited, leave it unrated rather than guessing.

## Code

- Pure logic lives in `src/domain/` and `src/library/` and is unit tested. Routes in `src/routes/` stay thin.
- Every D1 query on department data is scoped by `department_id`. Load applications through `loadApplication`, which checks ownership.
- `public/app.js` duplicates `countChars` from `src/domain/charcount.ts`; `test/charcount.test.ts` keeps them identical.
- Claude calls go through `src/ai/`. They use structured outputs and `fallbacks: "default"`, and rebuild history as plain text without replaying thinking blocks.

## Commands

- `npm run check`: typecheck plus tests. Tests run in workerd with migrations applied, and the Anthropic API is mocked.
- `npm run dev`: local only (`wrangler dev --local`). Voice transcription needs `npm run dev:remote`.
- After changing `wrangler.jsonc`, run `npm run cf-typegen`.
