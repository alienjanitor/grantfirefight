# Grant Firefight

A grant readiness coach for small volunteer fire departments. It is not an AI grant writer.

The chief talks through the department's situation, and the app keeps the facts, tracks gear against its retirement dates, matches needs to grant programs, and checks each draft against the funder's criteria and against every other customer's drafts. The department writes every word and submits every application.

Two rules from FEMA shape that design. FEMA can disqualify narratives that copy other submissions, so one AI ghostwriting for hundreds of departments would produce look-alike text that gets thrown out. And only the department's authorized representative can submit. The full reasoning is in the "Volunteer Fire Grant Copilot: Deep Dive" document (Oct 18, 2026).

## What's in version 0.1

The build follows the deep dive's MVP spec, focused on the launch plan's first build: profile, tracker, and coach, piloted on a live state grant window.

| Spec item | Status |
| --- | --- |
| Profile onboarding, aggregate call counts only | Done. No field accepts patient-level data. |
| Needs tracker with expiration dates and reminders | Done. Retirement rules for turnout gear and ensemble (10 years), SCBA (15, recommended), cylinders (15 years, plus hydro tests every 5 years for carbon and every 3 for fiberglass), apparatus (reserve at 15, replace at 25). Dashboard alerts; no email yet. |
| Grant matcher | Done. Programs by state, population and need, with the next window. |
| Interview coach | Done. Text answers, and voice through Workers AI Whisper. Asks one question at a time, files the chief's own facts by criterion, and refuses to write prose. |
| Criteria checker | Done. Character counts (spaces included, line breaks counted as 2) and Claude coverage per criterion. Every evidence quote is checked against the draft. |
| Similarity guard | Done. Compares each draft with every other department's drafts and with loaded templates, highlights the overlapping passages, and never reveals another department's text or name. |
| Helper list export, including this tool | Done. |
| Copy-ready export per section | Done. Also exports the Minnesota VFA form values. |
| Post-award reminders | Partial. Programs with a known cadence (SAFER: every 6 months) show the report dates. |
| Program library versioned by fiscal year | Done, kept as reviewed code in `src/library/`. |
| Priority match, never labeled a FEMA score | Partial. Rates only rules we can cite (FY2025 high-priority PPE, SCBA, facepieces, RIT packs) and warns when priorities are mixed. Other items show as "Unconfirmed". |
| Gear label scanner | Not started. |
| Expiry radar (outreach) | Not started. |
| Past-application upload | Not started. |
| Reviewer queue | Not started. |
| Association admin | Version 2, per the spec. |

### Programs loaded

- **Minnesota Volunteer Fire Assistance**, the pilot. The window is open now and closes December 1, 2026. This application is a one-page form with no narratives, so the app gives a readiness checklist instead of a writing coach. It maps each need onto the form's ten cost lines, blocks ineligible items (vehicles, used equipment, EMS gear, buildings, sirens, maintenance), computes the 50:50 match, and produces the values to copy onto DNR's form.
- **AFG FY2026 (prep)**: the four narratives with FY2025 criteria from the [Federal Register notice](https://www.govinfo.gov/content/pkg/FR-2026-09-10/html/2026-18419.htm), plus cost share, award caps, and one application per activity. FEMA hasn't announced the FY2026 window.
- **Calendar and matcher only**: SAFER, FP&S, VFA in New Mexico, Nevada and Maryland, and USDA Community Facilities.

## Decisions worth knowing

- **The similarity guard compares wording, not meaning.** The spec proposed Vectorize. But every fire department writes about the same SCBA and the same budgets, so embedding similarity would flag everyone. FEMA's duplication check is after copied text, so the guard matches six-word runs (shingles) and stores only their hashes in D1. Vectorize could be added later to catch close paraphrases.
- **The coach never drafts.** The spec left "how much drafting is safe" open, so this version takes the conservative answer: the coach asks questions and keeps notes, the checker asks questions, and neither suggests wording.
- **Sign-in uses Cloudflare Access.** Access sends a one-time PIN by email. The Worker verifies the Access JWT itself and authorizes against its own users table. Roles: the grant lead owns the profile, applications and team; helpers add gear, answer the coach and edit drafts.
- **Claude calls** use `claude-opus-5-5` (set by `CLAUDE_MODEL`) with structured outputs and server-side refusal fallback (`fallbacks: "default"`). Coach turns run at low effort, checks at medium.

## Running it

```sh
npm ci
cp .dev.vars.example .dev.vars        # add ANTHROPIC_API_KEY to turn on the coach
npm run db:migrate:local
npm run dev                           # http://localhost:8787, signed in as DEV_AUTH_EMAIL
```

Without an API key the app still runs: answers are saved, and the originality check, gear tracker, matcher and VFA checklist all work. Voice transcription needs Workers AI, which only runs remotely: use `npm run dev:remote` after `npx wrangler login`.

```sh
npm run check                         # typecheck + tests (runs inside workerd with a real D1)
```

## Deploying

The repo is connected to Cloudflare Workers Builds: a push to the production branch (set under the Worker's **Settings → Build**) runs `npm ci` and `npx wrangler deploy` on Cloudflare. The production D1 database already exists and is migrated.

- **Schema changes:** add a migration, then run `npm run db:migrate:remote` before pushing the code that needs it. Builds don't migrate.
- **Anthropic key:** add `ANTHROPIC_API_KEY` as a secret under the Worker's **Settings → Variables and Secrets**.
- **Sign-in:** turn on Cloudflare Access for the Worker's hostname with a One-time PIN login method and a policy allowing the people who should sign in. Set `ACCESS_TEAM_DOMAIN` (for example `yourteam.cloudflareaccess.com`) and `ACCESS_AUD` (the Access application's AUD tag) in `wrangler.jsonc` and push. Until both are set, every request gets the sign-in page.

To deploy by hand instead: `npm run deploy` with `CLOUDFLARE_API_TOKEN` set.

To flag drafts that lean on a circulating template, load it into the guard. Only hashes are stored.

```sh
node scripts/template-sql.ts template.txt "IAFF FY22 AFG narrative template" > template.sql
npx wrangler d1 execute grantfirefight --remote --file template.sql
```

## Updating the program library each cycle

Programs live in `src/library/`. When a new NOFO drops, add a cycle with its dates, narratives (criteria, character limits, starter questions) and sources, then add its priority rules to `src/domain/priority.ts`. Cite every rule: `src/domain/sources.ts` lists the sources used so far.

## Open questions this build surfaced

These are in addition to the deep dive's list.

- **Minnesota VFA:** does the $5,000 limit cap the reimbursement or the request? The app assumes the reimbursement. Is the Sept 1 to Dec 1 window current? DNR's page and form say so, but past cycles had spring and summer deadlines. Are thermal imaging cameras eligible? The 2025-cycle letter excluded them; the current page doesn't mention them.
- **AFG FY2025 priority tables:** only the high-priority PPE and SCBA items are loaded, sourced from MSA's summary, because FEMA's NOFO PDF blocks automated reading. Someone needs to read the PDF and fill in the medium and low tables.
- **How should the tool be listed?** The helper list includes Grant Firefight as unpaid software that didn't write narrative text. That wording should go to the FEMA help desk along with the deep dive's questions.
