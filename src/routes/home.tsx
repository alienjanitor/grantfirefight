import { Hono } from "hono";
import type { FC } from "hono/jsx";
import {
  addHelper,
  CALL_CATEGORIES,
  createDepartmentWithLead,
  DEPT_TYPES,
  getUserByEmail,
  listApplications,
  listAssets,
  listCallCounts,
  listNeeds,
  listTeam,
  removeHelper,
  setCallCounts,
  updateDepartment,
  type DepartmentInput,
  type DepartmentRow,
} from "../db";
import { ASSET_KINDS, projectAsset, statusLabel, todayIso } from "../domain/gear";
import { matchPrograms } from "../domain/matcher";
import { checkbox, choice, FormError, isEmail, optNumber, optText, requiredText, text, type FormBody } from "../forms";
import { dept, isLead, page, redirect, requireLead, user, type AppEnv } from "../http";
import { Badge, Check, daysBetween, Empty, Field, fmtDate, Select, STATES } from "../views/components";

export const homeRoutes = new Hono<AppEnv>();

// Dashboard

homeRoutes.get("/", async (c) => {
  const d = dept(c);
  const today = todayIso();
  const [assets, needs, apps, counts] = await Promise.all([
    listAssets(c.env.DB, d.id),
    listNeeds(c.env.DB, d.id),
    listApplications(c.env.DB, d.id),
    listCallCounts(c.env.DB, d.id),
  ]);
  const openNeeds = needs.filter((n) => n.status === "open" || n.status === "planned");
  const windows = matchPrograms(d, openNeeds, today).filter(
    (m) => m.eligibility.status !== "ineligible" && (m.nextCycle?.status === "open" || m.nextCycle?.status === "upcoming"),
  );
  const alerts = assets
    .map((a) => ({ a, p: projectAsset(a, today) }))
    .filter(({ p }) => p.status === "expired" || p.status === "hydro_due" || p.status === "due_soon")
    .sort((x, y) => (x.p.milestones[0]?.date ?? "").localeCompare(y.p.milestones[0]?.date ?? ""));
  const lastYear = Number(today.slice(0, 4)) - 1;
  const gaps = profileGaps(d, counts.some((r) => r.year === lastYear), lastYear);

  return page(
    c,
    { title: "Dashboard", active: "home" },
    <>
      <h1>{d.name}</h1>
      {gaps.length ? (
        <section class="card">
          <h2>Finish your profile</h2>
          <p>Grant forms ask for these. Fill them in once and every application uses them.</p>
          <ul>
            {gaps.map((g) => (
              <li>{g}</li>
            ))}
          </ul>
          <a class="button" href="/department">
            Update the department profile
          </a>
        </section>
      ) : null}

      <section class="card">
        <h2>Grant windows</h2>
        {windows.length ? (
          <ul class="rows">
            {windows.map((m) => {
              const cyc = m.nextCycle!;
              const days = cyc.cycle.closes ? daysBetween(today, cyc.cycle.closes) : null;
              return (
                <li>
                  <strong>{m.program.name}</strong>{" "}
                  {cyc.status === "open" ? <Badge tone="ok">Open</Badge> : <Badge tone="info">Opens {fmtDate(cyc.cycle.opens)}</Badge>}
                  <div class="sub">
                    {cyc.status === "open" && days != null ? `Closes ${fmtDate(cyc.cycle.closes)} (${days} days). ` : null}
                    {m.fundableNeeds.length} of your open needs fit.
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No windows are open or announced for your state right now.</Empty>
        )}
        <a href="/grants">See every program you qualify for</a>
      </section>

      <section class="card">
        <h2>Gear alerts</h2>
        {alerts.length ? (
          <ul class="rows">
            {alerts.slice(0, 8).map(({ a, p }) => (
              <li>
                <strong>
                  {a.quantity} × {a.description || ASSET_KINDS[a.kind as keyof typeof ASSET_KINDS]}
                </strong>{" "}
                <Badge tone={p.status === "due_soon" ? "warn" : "bad"}>{statusLabel(p)}</Badge>
                <div class="sub">
                  {p.milestones
                    .filter((m) => m.timing !== "future")
                    .map((m) => `${m.label}: ${fmtDate(m.date)}`)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{assets.length ? "Nothing past or near retirement." : "Add your gear to see what's expiring."}</Empty>
        )}
        <a href="/gear">Open the gear tracker</a>
      </section>

      <section class="card">
        <h2>Applications</h2>
        {apps.length ? (
          <ul class="rows">
            {apps.map((a) => (
              <li>
                <a href={`/applications/${a.id}`}>{a.title}</a> <Badge tone="muted">{a.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No applications yet. Start one from the Grants page.</Empty>
        )}
      </section>
    </>,
  );
});

function profileGaps(d: DepartmentRow, hasLastYearCounts: boolean, lastYear: number): string[] {
  const gaps: string[] = [];
  if (d.population_served == null) gaps.push("Population served");
  if (d.protection_area_sq_mi == null) gaps.push("Protection area in square miles");
  if (d.operating_budget == null) gaps.push("Annual operating budget");
  if (!d.uei) gaps.push("Unique Entity ID (UEI) from SAM.gov");
  if (!hasLastYearCounts) gaps.push(`${lastYear} call counts`);
  return gaps;
}

// Department profile, shared by onboarding and the department page

const DepartmentFields: FC<{ d?: Partial<DepartmentRow>; disabled?: boolean }> = ({ d = {}, disabled }) => (
  <>
    <Field label="Department name">
      <input name="name" required value={d.name ?? ""} disabled={disabled} maxlength={200} />
    </Field>
    <div class="grid2">
      <Field label="State">
        <Select name="state" options={STATES} value={d.state ?? "MN"} disabled={disabled} />
      </Field>
      <Field label="Department type">
        <Select name="dept_type" options={DEPT_TYPES} value={d.dept_type ?? "volunteer"} disabled={disabled} />
      </Field>
      <Field label="Population served">
        <input name="population_served" inputmode="numeric" value={d.population_served ?? ""} disabled={disabled} />
      </Field>
      <Field label="Protection area (square miles)">
        <input name="protection_area_sq_mi" inputmode="decimal" value={d.protection_area_sq_mi ?? ""} disabled={disabled} />
      </Field>
      <Field label="Annual operating budget ($)">
        <input name="operating_budget" inputmode="numeric" value={d.operating_budget ?? ""} disabled={disabled} />
      </Field>
      <Field label="Unique Entity ID (UEI)" hint="From SAM.gov. Federal grants and Minnesota VFA require it.">
        <input name="uei" value={d.uei ?? ""} disabled={disabled} maxlength={12} />
      </Field>
      <Field label="NERIS Entity ID" hint="Optional.">
        <input name="neris_entity_id" value={d.neris_entity_id ?? ""} disabled={disabled} maxlength={40} />
      </Field>
    </div>
    <Check name="incident_reports_filed" checked={!!d.incident_reports_filed} disabled={disabled} label="We filed last year's incident reports with the state (MFIRS or NERIS)" />
    <Check
      name="in_mitigation_plan"
      checked={!!d.in_mitigation_plan}
      disabled={disabled}
      label="We take part in a Community Wildfire Protection Plan or county all-hazard mitigation plan"
    />
  </>
);

function parseDepartment(form: FormBody): DepartmentInput {
  return {
    name: requiredText(form, "name", "Department name", 200),
    state: choice<string>(form, "state", STATES, "MN"),
    dept_type: choice(form, "dept_type", DEPT_TYPES, "volunteer"),
    population_served: optNumber(form, "population_served", "Population served", { max: 50_000_000 }),
    protection_area_sq_mi: optNumber(form, "protection_area_sq_mi", "Protection area", { max: 100_000, integer: false }),
    operating_budget: optNumber(form, "operating_budget", "Operating budget", { max: 10_000_000_000 }),
    uei: optText(form, "uei", 12)?.toUpperCase() ?? null,
    neris_entity_id: optText(form, "neris_entity_id", 40),
    incident_reports_filed: checkbox(form, "incident_reports_filed"),
    in_mitigation_plan: checkbox(form, "in_mitigation_plan"),
  };
}

homeRoutes.get("/onboarding", (c) => {
  if (c.get("dept")) return c.redirect("/", 303);
  return page(
    c,
    { title: "Set up your department" },
    <section class="card narrow">
      <h1>Set up your department</h1>
      <p>
        You'll be the grant lead: you own the profile, invite helpers, and decide what goes in each application. Grant Firefight never submits
        anything. Only your department's authorized representative can submit to FEMA or the state.
      </p>
      <form method="post" action="/onboarding" class="stack">
        <Field label="Your name">
          <input name="your_name" maxlength={120} />
        </Field>
        <DepartmentFields />
        <button type="submit">Create department</button>
      </form>
    </section>,
  );
});

homeRoutes.post("/onboarding", async (c) => {
  if (c.get("dept")) return c.redirect("/", 303);
  const form = await c.req.parseBody();
  const input = parseDepartment(form);
  const existing = c.get("user") ?? (await getUserByEmail(c.env.DB, c.get("email")));
  await createDepartmentWithLead(c.env.DB, input, c.get("email"), optText(form, "your_name", 120), existing?.id ?? null);
  return redirect(c, "/department", { msg: "Department created. Add last year's call counts next." }, "#calls");
});

homeRoutes.get("/department", async (c) => {
  const d = dept(c);
  const lead = isLead(c);
  const counts = await listCallCounts(c.env.DB, d.id);
  const thisYear = Number(todayIso().slice(0, 4));
  const year = Number(c.req.query("year")) || thisYear - 1;
  const years = [...new Set([thisYear - 1, thisYear, ...counts.map((r) => r.year)])].sort((a, b) => b - a);
  const forYear = Object.fromEntries(counts.filter((r) => r.year === year).map((r) => [r.category, r.count]));

  return page(
    c,
    { title: "Department", active: "department" },
    <>
      <h1>Department profile</h1>
      <section class="card">
        <form method="post" action="/department" class="stack">
          <DepartmentFields d={d} disabled={!lead} />
          {lead ? <button type="submit">Save profile</button> : <p class="hint">Only the grant lead can change the profile.</p>}
        </form>
      </section>

      <section class="card" id="calls">
        <h2>Call counts</h2>
        <p>
          Totals only. Never enter patient names, run reports, or anything from an EMS patient record. Grant forms ask for counts like these, and
          the coach uses them to ask better questions.
        </p>
        <form method="get" action="/department#calls" class="inline">
          <Field label="Year">
            <select name="year">
              {years.map((y) => (
                <option value={y} selected={y === year}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" class="secondary">
            Show
          </button>
        </form>
        <form method="post" action="/department/calls" class="stack">
          <input type="hidden" name="year" value={year} />
          <div class="grid3">
            {Object.entries(CALL_CATEGORIES).map(([k, label]) => (
              <Field label={label}>
                <input name={k} inputmode="numeric" value={forYear[k] ?? ""} />
              </Field>
            ))}
          </div>
          <button type="submit">Save {year} counts</button>
        </form>
      </section>
    </>,
  );
});

homeRoutes.post("/department", requireLead, async (c) => {
  await updateDepartment(c.env.DB, dept(c).id, parseDepartment(await c.req.parseBody()));
  return redirect(c, "/department", { msg: "Profile saved." });
});

homeRoutes.post("/department/calls", async (c) => {
  const form = await c.req.parseBody();
  const year = optNumber(form, "year", "Year", { min: 1990, max: 2100 });
  if (!year) throw new FormError("Pick a year.");
  const counts: Record<string, number | null> = {};
  for (const [k, label] of Object.entries(CALL_CATEGORIES)) counts[k] = optNumber(form, k, label, { max: 1_000_000 });
  await setCallCounts(c.env.DB, dept(c).id, year, counts);
  return redirect(c, `/department?year=${year}`, { msg: `${year} call counts saved.` }, "#calls");
});

// Team

homeRoutes.get("/team", async (c) => {
  const team = await listTeam(c.env.DB, dept(c).id);
  const lead = isLead(c);
  return page(
    c,
    { title: "Team", active: "team" },
    <>
      <h1>Team</h1>
      <section class="card">
        <p>
          Helpers are officers or members who add gear, answer coach questions and review drafts. Only the grant lead changes the profile, starts
          applications, and marks them submitted.
        </p>
        <ul class="rows">
          {team.map((m) => (
            <li>
              <strong>{m.name || m.email}</strong> <Badge tone={m.role === "grant_lead" ? "info" : "muted"}>{m.role === "grant_lead" ? "Grant lead" : "Helper"}</Badge>
              <div class="sub">{m.email}</div>
              {lead && m.role === "helper" ? (
                <form method="post" action={`/team/${m.id}/remove`} class="inline">
                  <button type="submit" class="link danger">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {lead ? (
        <section class="card">
          <h2>Add a helper</h2>
          <p class="hint">They sign in with this email address. Add the same address to your Cloudflare Access policy if it's limited to a list.</p>
          <form method="post" action="/team" class="stack">
            <div class="grid2">
              <Field label="Email">
                <input name="email" type="email" required maxlength={200} />
              </Field>
              <Field label="Name">
                <input name="name" maxlength={120} />
              </Field>
            </div>
            <button type="submit">Add helper</button>
          </form>
        </section>
      ) : null}
    </>,
  );
});

homeRoutes.post("/team", requireLead, async (c) => {
  const form = await c.req.parseBody();
  const email = text(form, "email", 200).toLowerCase();
  if (!isEmail(email)) throw new FormError("Enter a valid email address.");
  if (await getUserByEmail(c.env.DB, email)) throw new FormError("That person already has an account.");
  await addHelper(c.env.DB, dept(c).id, email, optText(form, "name", 120));
  return redirect(c, "/team", { msg: `${email} can now sign in as a helper.` });
});

homeRoutes.post("/team/:id/remove", requireLead, async (c) => {
  if (c.req.param("id") === user(c).id) throw new FormError("You can't remove yourself.");
  await removeHelper(c.env.DB, dept(c).id, c.req.param("id"));
  return redirect(c, "/team", { msg: "Helper removed." });
});
