import { Hono } from "hono";
import type { FC } from "hono/jsx";
import {
  addContributor,
  createApplication,
  deleteApplication,
  deleteContributor,
  findApplication,
  getApplication,
  listApplicationNeeds,
  listApplications,
  listAssets,
  listCallCounts,
  listContributors,
  listNeeds,
  listSections,
  setApplicationNeeds,
  updateApplicationStatus,
  type ApplicationRow,
  type DepartmentRow,
  type NeedRow,
  type SectionRow,
} from "../db";
import type { CoverageReport } from "../ai/checker";
import { checkLimit } from "../domain/charcount";
import { helperListText, TOOL_CONTRIBUTOR } from "../domain/contributors";
import { addMonthsIso, projectAsset, todayIso } from "../domain/gear";
import { matchPrograms } from "../domain/matcher";
import { NEED_CATEGORIES, NEED_REASONS, type NeedCategory, type NeedReason } from "../domain/needs";
import { hasPriorityRules, mixWarnings, rateNeed, type PriorityLevel } from "../domain/priority";
import { VERDICT_LABELS, type SimilarityVerdict } from "../domain/similarity";
import { mnVfaReadiness, type FireIncidents } from "../domain/vfa-readiness";
import { checkbox, choice, FormError, list, optIsoDate, optNumber, requiredText, text } from "../forms";
import { dept, isLead, page, redirect, requireLead, type AppEnv, type Ctx } from "../http";
import { cycleStatus, getCycle, getProgram, type Activity, type Cycle, type Program } from "../library";
import { afgAwardCap, afgCostSplit } from "../library/afg";
import { MN_VFA_SUBMIT_TO } from "../library/vfa";
import type { SimilarityResult } from "../similarity-index";
import { Badge, daysBetween, Empty, Field, fmtDate, money, Select, Sources, type Tone } from "../views/components";

export const applicationRoutes = new Hono<AppEnv>();

const APP_STATUSES = {
  drafting: "Drafting",
  ready: "Ready to submit",
  submitted: "Submitted",
  awarded: "Awarded",
  declined: "Not funded",
  withdrawn: "Withdrawn",
} as const;

const CYCLE_STATUS_LABEL = { open: "Open", upcoming: "Upcoming", not_announced: "Not announced", closed: "Closed" } as const;
const CYCLE_STATUS_TONE: Record<keyof typeof CYCLE_STATUS_LABEL, Tone> = { open: "ok", upcoming: "info", not_announced: "muted", closed: "muted" };
const ELIGIBILITY_TONE: Record<string, Tone> = { eligible: "ok", check: "warn", ineligible: "bad" };
const ELIGIBILITY_LABEL: Record<string, string> = { eligible: "Eligible", check: "Check", ineligible: "Not eligible" };
const SUPPORT_LABEL = { narrative: "Interview coach and checks", form: "Readiness checklist", listing: "Calendar only" } as const;
const PRIORITY_TONE: Record<PriorityLevel, Tone> = { high: "ok", medium: "warn", low: "warn", unrated: "muted", wrong_activity: "bad" };
const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  unrated: "Unconfirmed",
  wrong_activity: "Wrong application",
};

const CycleLine: FC<{ cycle: Cycle; today: string }> = ({ cycle, today }) => {
  const status = cycleStatus(cycle, today);
  const days = cycle.closes ? daysBetween(today, cycle.closes) : null;
  return (
    <p>
      <strong>{cycle.label}</strong> <Badge tone={CYCLE_STATUS_TONE[status]}>{CYCLE_STATUS_LABEL[status]}</Badge>{" "}
      {cycle.opens && cycle.closes ? `${fmtDate(cycle.opens)} to ${fmtDate(cycle.closes)}` : null}
      {status === "open" && days != null ? ` (${days} days left)` : null}
      {cycle.note ? <span class="hint block">{cycle.note}</span> : null}
    </p>
  );
};

// Grant matcher

applicationRoutes.get("/grants", async (c) => {
  const d = dept(c);
  const today = todayIso();
  const [needs, apps] = await Promise.all([listNeeds(c.env.DB, d.id), listApplications(c.env.DB, d.id)]);
  const open = needs.filter((n) => n.status === "open" || n.status === "planned");
  const matches = matchPrograms(d, open, today);
  const lead = isLead(c);

  return page(
    c,
    { title: "Grants", active: "grants" },
    <>
      <h1>Grants for {d.name}</h1>
      <p class="lede">
        Programs for {d.state} departments, best prospects first. AFG is the biggest prize but the least predictable; Volunteer Fire Assistance is
        small, steady and run differently in every state.
      </p>
      {matches.map((m) => {
        const startable = m.program.cycles.filter((cy) => cycleStatus(cy, today) !== "closed");
        return (
          <section class="card">
            <div class="item-head">
              <h2>{m.program.name}</h2>
              <Badge tone={ELIGIBILITY_TONE[m.eligibility.status]!}>{ELIGIBILITY_LABEL[m.eligibility.status]}</Badge>
            </div>
            <p class="sub">
              {m.program.funder} · {SUPPORT_LABEL[m.program.support]}
            </p>
            <p>{m.program.summary}</p>
            {m.eligibility.reasons.length ? (
              <ul class="reasons">
                {m.eligibility.reasons.map((r) => (
                  <li>{r}</li>
                ))}
              </ul>
            ) : null}
            <dl class="facts">
              <dt>Award</dt>
              <dd>{m.program.award}</dd>
              <dt>Match</dt>
              <dd>{m.program.match}</dd>
              <dt>Your needs it can fund</dt>
              <dd>{m.fundableNeeds.length ? m.fundableNeeds.map((n) => n.description).join("; ") : "None on your list yet"}</dd>
            </dl>
            {m.program.cycles.map((cy) => (
              <CycleLine cycle={cy} today={today} />
            ))}
            {m.program.support !== "listing" && m.eligibility.status !== "ineligible" && startable.length && lead ? (
              <form method="post" action="/applications" class="inline-form">
                <input type="hidden" name="program_id" value={m.program.id} />
                <Field label="Cycle">
                  <Select name="cycle_id" options={Object.fromEntries(startable.map((cy) => [cy.id, cy.label]))} />
                </Field>
                {m.program.activities.length > 1 ? (
                  <Field label="Activity">
                    <Select name="activity" options={Object.fromEntries(m.program.activities.map((a) => [a.id, a.label]))} />
                  </Field>
                ) : (
                  <input type="hidden" name="activity" value={m.program.activities[0]!.id} />
                )}
                <button type="submit">Start application</button>
              </form>
            ) : null}
            {apps
              .filter((a) => a.program_id === m.program.id)
              .map((a) => (
                <p>
                  <a href={`/applications/${a.id}`}>Open “{a.title}”</a> <Badge tone="muted">{APP_STATUSES[a.status as keyof typeof APP_STATUSES]}</Badge>
                </p>
              ))}
            <Sources sources={m.program.sources} />
          </section>
        );
      })}
      <p class="hint">State grant programs beyond Volunteer Fire Assistance, and private foundations, aren't loaded yet.</p>
    </>,
  );
});

// Applications

applicationRoutes.get("/applications", async (c) => {
  const apps = await listApplications(c.env.DB, dept(c).id);
  return page(
    c,
    { title: "Applications", active: "applications" },
    <>
      <h1>Applications</h1>
      <section class="card">
        {apps.length ? (
          <ul class="rows">
            {apps.map((a) => (
              <li>
                <a href={`/applications/${a.id}`}>
                  <strong>{a.title}</strong>
                </a>{" "}
                <Badge tone="muted">{APP_STATUSES[a.status as keyof typeof APP_STATUSES]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            No applications yet. <a href="/grants">Find a grant</a> to start one.
          </Empty>
        )}
      </section>
    </>,
  );
});

applicationRoutes.post("/applications", requireLead, async (c) => {
  const d = dept(c);
  const form = await c.req.parseBody();
  const program = getProgram(text(form, "program_id", 40));
  if (!program || program.support === "listing") throw new FormError("Grant Firefight can't build that application yet.");
  const cycle = getCycle(program, text(form, "cycle_id", 40));
  if (!cycle || cycleStatus(cycle, todayIso()) === "closed") throw new FormError("That cycle isn't open for new applications.");
  const activity = program.activities.find((a) => a.id === text(form, "activity", 60));
  if (!activity) throw new FormError("Pick an activity.");

  // One application per activity per period: FEMA may disqualify both.
  const existing = await findApplication(c.env.DB, d.id, program.id, cycle.id, activity.id);
  if (existing) return redirect(c, `/applications/${existing.id}`, { msg: "You already have this application. One per activity per period." });

  const title = program.activities.length > 1 ? `${program.name} ${cycle.label}: ${activity.label.split(" (")[0]}` : `${program.name} ${cycle.label}`;
  const id = await createApplication(
    c.env.DB,
    d.id,
    { program_id: program.id, cycle_id: cycle.id, activity: activity.id, title },
    cycle.narratives?.map((n) => n.key) ?? [],
    [TOOL_CONTRIBUTOR],
  );
  const funds = new Set<string>(activity.funds);
  const needs = await listNeeds(c.env.DB, d.id);
  await setApplicationNeeds(
    c.env.DB,
    id,
    needs.filter((n) => n.status === "open" && funds.has(n.category)).map((n) => n.id),
  );
  return redirect(c, `/applications/${id}`, { msg: "Application started. Check which items belong in this request." });
});

interface Loaded {
  app: ApplicationRow;
  program: Program;
  cycle: Cycle;
  activity: Activity;
}

export async function loadApplication(c: Ctx): Promise<Loaded | null> {
  const app = await getApplication(c.env.DB, dept(c).id, c.req.param("id")!);
  if (!app) return null;
  const program = getProgram(app.program_id);
  const cycle = program && getCycle(program, app.cycle_id);
  const activity = program?.activities.find((a) => a.id === app.activity);
  if (!program || !cycle || !activity) return null;
  return { app, program, cycle, activity };
}

function lastYearIncidents(counts: { year: number; category: string; count: number }[], year: number): FireIncidents {
  const get = (cat: string) => counts.find((r) => r.year === year && r.category === cat)?.count ?? null;
  const vehicle = get("vehicle_fire");
  const other = get("other_fire");
  return {
    year,
    wildland: get("wildland_fire"),
    structural: get("structure_fire"),
    other: vehicle == null && other == null ? null : (vehicle ?? 0) + (other ?? 0),
  };
}

applicationRoutes.get("/applications/:id", async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  const { app, program, cycle, activity } = loaded;
  const d = dept(c);
  const today = todayIso();
  const lead = isLead(c);
  const [selected, allNeeds, assets, sections, contributors, counts] = await Promise.all([
    listApplicationNeeds(c.env.DB, app.id),
    listNeeds(c.env.DB, d.id),
    listAssets(c.env.DB, d.id),
    listSections(c.env.DB, app.id),
    listContributors(c.env.DB, app.id),
    listCallCounts(c.env.DB, d.id),
  ]);
  const selectedIds = new Set(selected.map((n) => n.id));
  const funds = new Set<string>(activity.funds);
  const candidates = allNeeds.filter((n) => selectedIds.has(n.id) || ((n.status === "open" || n.status === "planned") && funds.has(n.category)));
  const expiredAssets = new Set(assets.filter((a) => projectAsset(a, today).status === "expired").map((a) => a.id));
  const total = selected.reduce((s, n) => s + n.estimated_cost, 0);

  return page(
    c,
    { title: app.title, active: "applications" },
    <>
      <p>
        <a href="/applications">← Applications</a>
      </p>
      <h1>{app.title}</h1>
      <section class="card">
        <CycleLine cycle={cycle} today={today} />
        <p class="sub">
          {program.funder} · {activity.label}
        </p>
        <StatusForm app={app} lead={lead} />
        <PostAward app={app} program={program} />
      </section>

      <section class="card" id="items">
        <h2>Items in this request</h2>
        {candidates.length ? (
          <form method="post" action={`/applications/${app.id}/needs`} class="stack">
            <ul class="checklist">
              {candidates.map((n) => {
                const rating = program.id === "afg" ? rateNeed(program.id, cycle.id, activity.id, n, !!n.asset_id && expiredAssets.has(n.asset_id)) : null;
                return (
                  <li>
                    <label class="check">
                      <input type="checkbox" name="need_ids" value={n.id} checked={selectedIds.has(n.id)} />
                      <span>
                        {n.quantity} × {n.description} · {money(n.estimated_cost)}{" "}
                        {rating ? <Badge tone={PRIORITY_TONE[rating.level]}>Priority match: {PRIORITY_LABEL[rating.level]}</Badge> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <button type="submit">Save items</button>
          </form>
        ) : (
          <Empty>
            None of your open needs fit this activity. <a href="/needs">Add needs</a> first.
          </Empty>
        )}
      </section>

      {program.support === "narrative" ? (
        <NarrativeOverview loaded={loaded} dept={d} selected={selected} sections={sections} total={total} expiredAssets={expiredAssets} />
      ) : null}

      {program.id === "mn_vfa" ? <VfaOverview dept={d} selected={selected} incidents={lastYearIncidents(counts, Number(today.slice(0, 4)) - 1)} /> : null}

      <section class="card" id="helpers">
        <h2>Everyone who helped</h2>
        <p class="hint">
          FEMA asks for everyone who helped prepare or review the application, paid or not. Keep this list current and paste it into the Contact
          Information section.
        </p>
        <ul class="rows">
          {contributors.map((ct) => (
            <li>
              <strong>{ct.name}</strong> {ct.paid ? <Badge tone="info">Paid</Badge> : <Badge tone="muted">Unpaid</Badge>}
              <div class="sub">{[ct.organization, ct.role].filter(Boolean).join(" · ")}</div>
              <form method="post" action={`/applications/${app.id}/contributors/${ct.id}/delete`} class="inline">
                <button type="submit" class="link danger">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form method="post" action={`/applications/${app.id}/contributors`} class="stack">
          <div class="grid2">
            <Field label="Name">
              <input name="name" required maxlength={120} />
            </Field>
            <Field label="Organization">
              <input name="organization" maxlength={120} />
            </Field>
            <Field label="What they did">
              <input name="role" maxlength={200} placeholder="Proofread the cost-benefit narrative" />
            </Field>
            <label class="check">
              <input type="checkbox" name="paid" value="1" />
              <span>Paid for their help</span>
            </label>
          </div>
          <button type="submit" class="secondary">
            Add helper
          </button>
        </form>
      </section>

      <section class="card">
        <h2>When you're ready</h2>
        <p>
          <a class="button" href={`/applications/${app.id}/export`}>
            Copy-ready export
          </a>
        </p>
        <p class="hint">
          {program.id === "mn_vfa"
            ? `Fill in DNR's form from the export, sign it, and email it to ${MN_VFA_SUBMIT_TO}.`
            : "Paste each narrative into FEMA GO yourself. Only your department's authorized organization representative can submit."}
        </p>
        {lead ? (
          <form method="post" action={`/applications/${app.id}/delete`}>
            <button type="submit" class="link danger">
              Delete this application
            </button>
          </form>
        ) : null}
      </section>
    </>,
  );
});

const StatusForm: FC<{ app: ApplicationRow; lead: boolean }> = ({ app, lead }) =>
  lead ? (
    <form method="post" action={`/applications/${app.id}/status`} class="inline-form">
      <Field label="Status">
        <Select name="status" options={APP_STATUSES} value={app.status} />
      </Field>
      <Field label="Submitted on">
        <input type="date" name="submitted_on" value={app.submitted_on ?? ""} />
      </Field>
      <Field label="Awarded on">
        <input type="date" name="awarded_on" value={app.awarded_on ?? ""} />
      </Field>
      <Field label="Award ($)">
        <input name="award_amount" inputmode="numeric" value={app.award_amount ?? ""} />
      </Field>
      <button type="submit" class="secondary">
        Update status
      </button>
    </form>
  ) : (
    <p>
      Status: <Badge tone="muted">{APP_STATUSES[app.status as keyof typeof APP_STATUSES]}</Badge>
    </p>
  );

const PostAward: FC<{ app: ApplicationRow; program: Program }> = ({ app, program }) => {
  if (app.status !== "awarded" || !app.awarded_on || !program.postAward) return null;
  const every = program.postAward.reportEveryMonths;
  const dates = [1, 2, 3, 4].map((i) => addMonthsIso(app.awarded_on!, i * every));
  return (
    <div class="callout">
      <strong>Progress reports due every {every} months:</strong> {dates.map(fmtDate).join(", ")}
      <Sources sources={[program.postAward.source]} label="Source" />
    </div>
  );
};

const NarrativeOverview: FC<{
  loaded: Loaded;
  dept: DepartmentRow;
  selected: NeedRow[];
  sections: SectionRow[];
  total: number;
  expiredAssets: Set<string>;
}> = ({ loaded: { app, program, cycle, activity }, dept: d, selected, sections, total, expiredAssets }) => {
  const ratings = selected.map((n) => ({ n, r: rateNeed(program.id, cycle.id, activity.id, n, !!n.asset_id && expiredAssets.has(n.asset_id)) }));
  const warnings = mixWarnings(ratings.map((x) => x.r));
  const pop = d.population_served;
  const split = pop != null ? afgCostSplit(total, pop) : null;
  const cap = pop != null ? afgAwardCap(pop) : null;

  return (
    <>
      {hasPriorityRules(program.id, cycle.id, activity.id) || ratings.some((x) => x.r.level === "wrong_activity") ? (
        <section class="card" id="priority">
          <h2>Priority match</h2>
          <p class="hint">
            FEMA's automated pre-score ranks every request against the year's priorities, and narratives are only read for the top-ranked ones. This
            is our reading of the notice, not your FEMA score: FEMA also weighs things we can't see, like audit findings and how past awards were
            managed.
          </p>
          {ratings.length ? (
            <table class="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Match</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {ratings.map(({ n, r }) => (
                  <tr>
                    <td>
                      {n.quantity} × {n.description}
                      <div class="sub">
                        {NEED_CATEGORIES[n.category as NeedCategory]} · {NEED_REASONS[n.reason as NeedReason]}
                      </div>
                    </td>
                    <td>
                      <Badge tone={PRIORITY_TONE[r.level]}>{PRIORITY_LABEL[r.level]}</Badge>
                    </td>
                    <td>
                      {r.basis} {r.source ? <Sources sources={[r.source]} label="Source" /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Pick items above to see how they match.</Empty>
          )}
          {warnings.map((w) => (
            <div class="callout warn">
              {w.message} <Sources sources={[w.source]} label="Source" />
            </div>
          ))}
        </section>
      ) : null}

      <section class="card" id="money">
        <h2>Money</h2>
        <dl class="facts">
          <dt>Total request</dt>
          <dd>{money(total)}</dd>
          {split ? (
            <>
              <dt>Your cost share ({split.percent}%)</dt>
              <dd>about {money(split.local)}</dd>
              <dt>Federal share</dt>
              <dd>about {money(split.federal)}</dd>
            </>
          ) : (
            <>
              <dt>Cost share</dt>
              <dd>
                <a href="/department">Add your population</a> to estimate it.
              </dd>
            </>
          )}
          {cap != null ? (
            <>
              <dt>Yearly award limit for your population</dt>
              <dd>{money(cap)}</dd>
            </>
          ) : null}
        </dl>
        {cap != null && total > cap ? <div class="callout bad">This request is over the yearly award limit for your population.</div> : null}
        <p class="hint">Estimates. Confirm figures with FEMA's cost-share calculator. In-kind matches aren't allowed for AFG.</p>
      </section>

      <section class="card" id="narratives">
        <h2>Narratives</h2>
        <ul class="items">
          {(cycle.narratives ?? []).map((spec) => {
            const s = sections.find((x) => x.section_key === spec.key);
            const lim = checkLimit(s?.draft_text ?? "", spec.charLimit);
            const coverage = s?.criteria_coverage ? (JSON.parse(s.criteria_coverage) as CoverageReport) : null;
            const covered = coverage?.criteria.filter((x) => x.status === "covered").length;
            const sim = s?.similarity_detail ? (JSON.parse(s.similarity_detail) as SimilarityResult) : null;
            return (
              <li>
                <div class="item-head">
                  <a href={`/applications/${app.id}/sections/${spec.key}`}>
                    <strong>{spec.title}</strong>
                  </a>
                  <span class={lim.over ? "count over" : "count"}>
                    {lim.count.toLocaleString("en-US")} / {spec.charLimit.toLocaleString("en-US")}
                  </span>
                </div>
                <div class="sub">
                  {spec.weight}
                  {coverage ? ` · ${covered} of ${spec.criteria.length} criteria covered` : " · not checked yet"}
                  {sim ? ` · ${VERDICT_LABELS[sim.verdict as SimilarityVerdict]}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
        <Sources sources={cycle.sources} />
      </section>
    </>
  );
};

const VfaOverview: FC<{ dept: DepartmentRow; selected: NeedRow[]; incidents: FireIncidents }> = ({ dept: d, selected, incidents }) => {
  const r = mnVfaReadiness(d, selected, incidents);
  return (
    <>
      <section class="card" id="readiness">
        <h2>Readiness checklist</h2>
        <ul class="checklist">
          {r.checklist.map((item) => (
            <li class={item.ok === true ? "done" : item.ok === false ? "missing" : "manual"}>
              <span class="mark" aria-hidden="true">
                {item.ok === true ? "✓" : item.ok === false ? "✗" : "○"}
              </span>
              <span>
                {item.label}
                {item.detail ? <span class="hint block">{item.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section class="card" id="form-lines">
        <h2>Cost lines on DNR's form</h2>
        {r.flags.map((f) => (
          <div class={`callout ${f.severity === "blocker" ? "bad" : "warn"}`}>
            <strong>{f.need.description}:</strong> {f.message}
          </div>
        ))}
        <table class="table">
          <tbody>
            {r.lines.map((l) => (
              <tr>
                <td>
                  {l.label}
                  {l.needs.length ? <div class="sub">{l.needs.map((n) => n.description).join("; ")}</div> : null}
                  {l.notes.map((n) => (
                    <div class="hint">{n}</div>
                  ))}
                </td>
                <td class="num">{l.total ? money(l.total) : ""}</td>
              </tr>
            ))}
            <tr class="total">
              <td>Grand total requested</td>
              <td class="num">{money(r.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
        <dl class="facts">
          <dt>DNR reimburses (50:50)</dt>
          <dd>
            up to {money(r.estimate.reimbursement)}
            {r.estimate.capped ? " (capped at $5,000)" : ""}
          </dd>
          <dt>Your department pays</dt>
          <dd>{money(r.estimate.departmentShare)}</dd>
        </dl>
        <p class="hint">DNR describes grants as $1,000 to $5,000. Confirm with DNR whether the $5,000 limit applies to the reimbursement or the total.</p>
      </section>
    </>
  );
};

applicationRoutes.post("/applications/:id/needs", async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  const ids = new Set(list(await c.req.parseBody({ all: true }), "need_ids"));
  const mine = (await listNeeds(c.env.DB, dept(c).id)).filter((n) => ids.has(n.id)).map((n) => n.id);
  await setApplicationNeeds(c.env.DB, loaded.app.id, mine);
  return redirect(c, `/applications/${loaded.app.id}`, { msg: "Items saved." }, "#items");
});

applicationRoutes.post("/applications/:id/status", requireLead, async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  const form = await c.req.parseBody();
  await updateApplicationStatus(c.env.DB, dept(c).id, loaded.app.id, {
    status: choice(form, "status", APP_STATUSES, "drafting"),
    submitted_on: optIsoDate(form, "submitted_on", "Submitted on"),
    awarded_on: optIsoDate(form, "awarded_on", "Awarded on"),
    award_amount: optNumber(form, "award_amount", "Award", { max: 100_000_000 }),
  });
  return redirect(c, `/applications/${loaded.app.id}`, { msg: "Status updated." });
});

applicationRoutes.post("/applications/:id/contributors", async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  const form = await c.req.parseBody();
  await addContributor(c.env.DB, loaded.app.id, {
    name: requiredText(form, "name", "Name", 120),
    organization: text(form, "organization", 120),
    role: text(form, "role", 200),
    paid: checkbox(form, "paid"),
  });
  return redirect(c, `/applications/${loaded.app.id}`, { msg: "Helper added." }, "#helpers");
});

applicationRoutes.post("/applications/:id/contributors/:cid/delete", async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  await deleteContributor(c.env.DB, loaded.app.id, c.req.param("cid"));
  return redirect(c, `/applications/${loaded.app.id}`, { msg: "Helper removed." }, "#helpers");
});

applicationRoutes.post("/applications/:id/delete", requireLead, async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  await deleteApplication(c.env.DB, dept(c).id, loaded.app.id);
  return redirect(c, "/applications", { msg: "Application deleted." });
});

// Copy-ready export

applicationRoutes.get("/applications/:id/export", async (c) => {
  const loaded = await loadApplication(c);
  if (!loaded) return c.notFound();
  const { app, program, cycle } = loaded;
  const d = dept(c);
  const [sections, contributors, selected, counts] = await Promise.all([
    listSections(c.env.DB, app.id),
    listContributors(c.env.DB, app.id),
    listApplicationNeeds(c.env.DB, app.id),
    listCallCounts(c.env.DB, d.id),
  ]);
  const helpers = helperListText(contributors);

  return page(
    c,
    { title: `Export: ${app.title}`, active: "applications" },
    <>
      <p>
        <a href={`/applications/${app.id}`}>← {app.title}</a>
      </p>
      <h1>Copy-ready export</h1>

      {(cycle.narratives ?? []).map((spec) => {
        const s = sections.find((x) => x.section_key === spec.key);
        const draft = s?.draft_text ?? "";
        const lim = checkLimit(draft, spec.charLimit);
        const id = `export-${spec.key}`;
        return (
          <section class="card">
            <div class="item-head">
              <h2>{spec.title}</h2>
              <span class={lim.over ? "count over" : "count"}>
                {lim.count.toLocaleString("en-US")} / {spec.charLimit.toLocaleString("en-US")}
              </span>
            </div>
            {!draft ? <div class="callout warn">Not written yet.</div> : null}
            {lim.over ? <div class="callout bad">Over the limit by {(-lim.remaining).toLocaleString("en-US")} characters. FEMA GO won't accept it.</div> : null}
            <textarea id={id} readonly rows={10}>
              {draft}
            </textarea>
            <button type="button" data-copy={id} class="secondary">
              Copy
            </button>
          </section>
        );
      })}

      {program.id === "mn_vfa" ? <VfaExport dept={d} selected={selected} incidents={lastYearIncidents(counts, Number(todayIso().slice(0, 4)) - 1)} /> : null}

      <section class="card">
        <h2>Everyone who helped</h2>
        <textarea id="export-helpers" readonly rows={Math.max(3, contributors.length + 1)}>
          {helpers}
        </textarea>
        <button type="button" data-copy="export-helpers" class="secondary">
          Copy
        </button>
      </section>
    </>,
  );
});

const VfaExport: FC<{ dept: DepartmentRow; selected: NeedRow[]; incidents: FireIncidents }> = ({ dept: d, selected, incidents }) => {
  const r = mnVfaReadiness(d, selected, incidents);
  const show = (v: number | null) => (v == null ? "MISSING" : String(v));
  return (
    <section class="card">
      <h2>Values for DNR's form</h2>
      <table class="table">
        <tbody>
          <tr>
            <td>Federal Unique Entity Identification number (UEI)</td>
            <td>{d.uei ?? "MISSING"}</td>
          </tr>
          <tr>
            <td>1. Population directly benefiting from the project</td>
            <td>{show(d.population_served)}</td>
          </tr>
          <tr>
            <td>2. Fire Department's protection area (square miles)</td>
            <td>{show(d.protection_area_sq_mi)}</td>
          </tr>
          <tr>
            <td>3. Number of fire incidents for {incidents.year}: wildland / structural / other</td>
            <td>
              {show(incidents.wildland)} / {show(incidents.structural)} / {show(incidents.other)}
            </td>
          </tr>
          {r.lines
            .filter((l) => l.total)
            .map((l) => (
              <tr>
                <td>4. {l.label}</td>
                <td class="num">{money(l.total)}</td>
              </tr>
            ))}
          <tr class="total">
            <td>Grand Total Dollars Requested</td>
            <td class="num">{money(r.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p class="hint">
        "Other" fire incidents combines vehicle fires and other fires from your call counts. Sign the form, the AD-1048 certification and Exhibit D,
        then email everything to {MN_VFA_SUBMIT_TO} and keep a copy.
      </p>
    </section>
  );
};
