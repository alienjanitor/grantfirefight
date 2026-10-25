import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const BASE = "http://localhost";
const CHIEF = "chief@pinelake.example";
const OTHER = "chief@riverbend.example";

type Form = Record<string, string | string[]>;

function envFor(email: string | null, extra: Partial<Env> = {}): Env {
  return { ...env, DEV_AUTH_EMAIL: email ?? undefined, ...extra } as Env;
}

function get(path: string, email: string | null = CHIEF, extra: Partial<Env> = {}) {
  return app.request(`${BASE}${path}`, {}, envFor(email, extra));
}

function post(path: string, form: Form, email: string | null = CHIEF, extra: Partial<Env> = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) for (const x of Array.isArray(v) ? v : [v]) body.append(k, x);
  return app.request(
    `${BASE}${path}`,
    { method: "POST", body, headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" } },
    envFor(email, extra),
  );
}

async function html(res: Response | Promise<Response>) {
  return (await res).text();
}

function location(res: Response) {
  return new URL(res.headers.get("location")!, BASE);
}

async function onboard(email = CHIEF, over: Form = {}) {
  const res = await post(
    "/onboarding",
    {
      your_name: "Dana",
      name: email === CHIEF ? "Pine Lake Volunteer Fire Department" : "Riverbend Fire Department",
      state: "MN",
      dept_type: "volunteer",
      population_served: "2400",
      protection_area_sq_mi: "96",
      operating_budget: "84000",
      uei: "ABCDEF123456",
      incident_reports_filed: "1",
      ...over,
    },
    email,
  );
  expect(res.status).toBe(303);
}

async function addNeed(form: Form, email = CHIEF) {
  const res = await post("/needs", { quantity: "1", priority: "high", status: "open", ...form }, email);
  expect(location(res).searchParams.get("err")).toBeNull();
}

async function startApplication(program_id: string, cycle_id: string, activity: string, email = CHIEF) {
  const res = await post("/applications", { program_id, cycle_id, activity }, email);
  expect(res.status).toBe(303);
  const loc = location(res);
  expect(loc.pathname).toMatch(/^\/applications\/[0-9a-f-]+$/);
  return loc.pathname;
}

// Storage persists across tests within a file, so start each test empty.
const TABLES = [
  "shingles", "similarity_sources", "contributors", "interviews", "narrative_sections", "application_needs",
  "applications", "needs", "assets", "call_counts", "users", "departments",
];
beforeEach(async () => {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});

afterEach(() => vi.restoreAllMocks());

describe("sign-in", () => {
  it("shows the sign-in page without an identity", async () => {
    const res = await get("/", null);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Sign in to Grant Firefight");
  });

  it("only honors the dev login on localhost", async () => {
    const res = await app.request("https://grants.example.org/", {}, envFor(CHIEF, { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" }));
    expect(res.status).toBe(401);
  });

  it("rejects a forged Access token", async () => {
    const res = await app.request(
      "https://grants.example.org/",
      { headers: { "cf-access-jwt-assertion": "not.a.jwt" } },
      envFor(null, { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" }),
    );
    expect(res.status).toBe(401);
  });

  it("sends security headers and allows the microphone only for this site", async () => {
    await onboard();
    const res = await get("/");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("permissions-policy")).toContain("microphone=(self)");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("blocks cross-site form posts", async () => {
    await onboard();
    const res = await app.request(
      `${BASE}/needs`,
      { method: "POST", body: new URLSearchParams({ description: "x" }), headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" } },
      envFor(CHIEF),
    );
    expect(res.status).toBe(403);
  });
});

describe("onboarding and profile", () => {
  it("sends new users to onboarding, then to the dashboard", async () => {
    const first = await get("/");
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("/onboarding");
    await onboard();
    const dash = await html(get("/"));
    expect(dash).toContain("Pine Lake Volunteer Fire Department");
    expect(dash).toContain("Minnesota Volunteer Fire Assistance");
  });

  it("asks for missing profile facts", async () => {
    await onboard(CHIEF, { uei: "", population_served: "" });
    const dash = await html(get("/"));
    expect(dash).toContain("Finish your profile");
    expect(dash).toContain("Unique Entity ID (UEI) from SAM.gov");
  });

  it("saves aggregate call counts and rejects junk", async () => {
    await onboard();
    const ok = await post("/department/calls", { year: "2025", structure_fire: "14", wildland_fire: "22", ems: "180" });
    expect(location(ok).searchParams.get("msg")).toContain("2025");
    const page = await html(get("/department?year=2025"));
    expect(page).toContain('value="22"');
    const bad = await post("/department/calls", { year: "2025", ems: "lots" });
    expect(location(bad).searchParams.get("err")).toContain("EMS");
  });
});

describe("gear and needs", () => {
  it("flags 15-year-old SCBA and turns it into a high-priority replacement", async () => {
    await onboard();
    await post("/gear", { kind: "scba", description: "Scott Air-Pak", quantity: "12", manufacture_date: "2011-08", date_source: "label", condition: "fair" });
    const gear = await html(get("/gear"));
    expect(gear).toContain("Past recommended replacement");
    expect(gear).toContain("Aug 1, 2026");

    const assetId = /\/gear\/([0-9a-f-]{36})\/need/.exec(gear)![1]!;
    await post(`/gear/${assetId}/need`, {});
    const needs = await html(get("/needs"));
    expect(needs).toContain("12 × Replace Scott Air-Pak");
    expect(needs).toContain("Replace expired or noncompliant gear");
  });

  it("keeps departments out of each other's data", async () => {
    await onboard(CHIEF);
    await onboard(OTHER);
    await addNeed({ description: "Forestry hose bundles", category: "water_movement", reason: "replace_damaged", estimated_cost: "1800" });
    const needId = /href="\/needs\/([0-9a-f-]{36})"/.exec(await html(get("/needs")))![1]!;

    expect((await get(`/needs/${needId}`, OTHER)).status).toBe(404);
    expect((await post(`/needs/${needId}`, { description: "Mine now", category: "other" }, OTHER)).status).toBe(404);
    expect(await html(get("/needs", OTHER))).not.toContain("Forestry hose bundles");
    expect(await html(get(`/needs/${needId}`))).toContain("Forestry hose bundles");
  });
});

describe("roles", () => {
  it("lets helpers contribute but not change the profile or start applications", async () => {
    await onboard();
    await post("/team", { email: "helper@pinelake.example", name: "Sam" });
    const helper = "helper@pinelake.example";

    expect(await html(get("/", helper))).toContain("Pine Lake Volunteer Fire Department");
    const profile = await post("/department", { name: "Hijacked", state: "MN", dept_type: "volunteer" }, helper);
    expect(location(profile).searchParams.get("err")).toContain("grant lead");
    const start = await post("/applications", { program_id: "mn_vfa", cycle_id: "fall-2026", activity: "vfa" }, helper);
    expect(location(start).searchParams.get("err")).toContain("grant lead");

    await addNeed({ description: "Pagers", category: "radios_pagers", reason: "upgrade", estimated_cost: "2400" }, helper);
    expect(await html(get("/needs"))).toContain("Pagers");
  });
});

describe("AFG application", () => {
  it("rates priorities, estimates cost share, and allows one application per activity", async () => {
    await onboard();
    await addNeed({ description: "SCBA packs", category: "scba", reason: "replace_expired", quantity: "12", estimated_cost: "96000" });
    await addNeed({ description: "Radios", category: "radios_pagers", reason: "upgrade", quantity: "10", estimated_cost: "12000" });
    const path = await startApplication("afg", "fy2026", "operations_safety");

    const page = await html(get(path));
    expect(page).toContain("Priority match");
    expect(page).toContain("Unconfirmed");
    expect(page).toContain("Mixing medium- or low-priority items");
    expect(page).toContain("$108,000");
    expect(page).toContain("Your cost share (5%)");
    expect(page).toContain("Financial Need");
    expect(page).toContain("Grant Firefight (software)");

    const again = await post("/applications", { program_id: "afg", cycle_id: "fy2026", activity: "operations_safety" });
    expect(location(again).pathname).toBe(path);
    expect(location(again).searchParams.get("msg")).toContain("One per activity");
  });

  it("refuses closed cycles and calendar-only programs", async () => {
    await onboard();
    const closed = await post("/applications", { program_id: "afg", cycle_id: "fy2025", activity: "operations_safety" });
    expect(location(closed).searchParams.get("err")).toContain("isn't open");
    const listing = await post("/applications", { program_id: "safer", cycle_id: "fy2026", activity: "recruitment_retention" });
    expect(location(listing).searchParams.get("err")).toContain("can't build");
  });

  it("counts characters, flags copied text across departments, and never shows the other draft", async () => {
    const shared =
      "Our department relies entirely on volunteers who answer every call in the township at all hours, and our breathing apparatus has reached the end of its fifteen year service life.";
    await onboard(OTHER);
    const otherPath = await startApplication("afg", "fy2026", "operations_safety", OTHER);
    await post(`${otherPath}/sections/financial_need/draft`, { draft: `${shared} Riverbend also covers the interstate.` }, OTHER);

    await onboard(CHIEF);
    const path = await startApplication("afg", "fy2026", "operations_safety");
    const save = await post(`${path}/sections/financial_need/draft`, { draft: `Pine Lake has 22 members. ${shared}` });
    expect(location(save).searchParams.get("msg")).toBe("Draft saved.");

    const section = await html(get(`${path}/sections/financial_need`));
    expect(section).toContain("High overlap");
    expect(section).toContain("Another department&#39;s draft");
    expect(section).toContain("<mark>");
    expect(section).not.toContain("interstate");

    const own = await html(get(`${otherPath}/sections/financial_need`, OTHER));
    expect(own).not.toContain("Pine Lake has 22 members");
  });

  it("indexes and checks a long draft in one statement each", async () => {
    await onboard(OTHER);
    const otherPath = await startApplication("afg", "fy2026", "operations_safety", OTHER);
    const words = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(" ");
    await post(`${otherPath}/sections/project_description/draft`, { draft: words }, OTHER);

    await onboard(CHIEF);
    const path = await startApplication("afg", "fy2026", "operations_safety");
    const res = await post(`${path}/sections/project_description/draft`, { draft: words.slice(0, 8000) });
    expect(location(res).searchParams.get("err")).toContain("over the limit");
    expect(await html(get(`${path}/sections/project_description`))).toContain("High overlap");
  });

  it("warns when a draft runs over the limit", async () => {
    await onboard();
    const path = await startApplication("afg", "fy2026", "operations_safety");
    const res = await post(`${path}/sections/cost_benefit/draft`, { draft: "x ".repeat(2001) });
    expect(location(res).searchParams.get("err")).toContain("over the limit");
    const exported = await html(get(`${path}/export`));
    expect(exported).toContain("FEMA GO won&#39;t accept it");
  });
});

describe("interview coach", () => {
  it("saves answers without an API key", async () => {
    await onboard();
    const path = await startApplication("afg", "fy2026", "operations_safety");
    const res = await post(`${path}/sections/financial_need/interview`, { answer: "About $84,000 a year, nearly all township levy." });
    expect(location(res).searchParams.get("msg")).toBe("Answer saved.");
    const page = await html(get(`${path}/sections/financial_need`));
    expect(page).toContain("nearly all township levy");
    expect(page).toContain("isn&#39;t turned on");
  });

  it("asks the next question and files the chief's facts", async () => {
    await onboard();
    const path = await startApplication("afg", "fy2026", "operations_safety");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "claude-opus-5-5",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  facts: [{ criterion_id: "fn_distress", fact: "$84,000 a year, nearly all township levy" }],
                  reply: "Has the levy kept up with costs over the last five years?",
                }),
              },
            ],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const withKey = { ANTHROPIC_API_KEY: "sk-test" };
    await post(`${path}/sections/financial_need/interview`, { answer: "About $84,000 a year, nearly all township levy." }, CHIEF, withKey);
    const page = await html(get(`${path}/sections/financial_need`, CHIEF, withKey));
    expect(page).toContain("Has the levy kept up with costs");
    expect(page).toContain("$84,000 a year, nearly all township levy");
  });
});

describe("Minnesota VFA application", () => {
  it("builds the form values and checklist from the profile and needs", async () => {
    await onboard();
    await post("/department/calls", { year: "2025", structure_fire: "4", wildland_fire: "12", vehicle_fire: "3", other_fire: "6" });
    await addNeed({ description: "Wildland hose and nozzles", category: "water_movement", reason: "replace_damaged", estimated_cost: "3200" });
    await addNeed({ description: "Brush truck", category: "vehicle", reason: "replace_expired", estimated_cost: "90000" });
    const path = await startApplication("mn_vfa", "fall-2026", "vfa");

    const page = await html(get(path));
    expect(page).toContain("Readiness checklist");
    expect(page).toContain("Water Movement Items");
    expect(page).not.toContain("Brush truck");

    const exported = await html(get(`${path}/export`));
    expect(exported).toContain("ABCDEF123456");
    expect(exported).toContain("12 / 4 / 9");
    expect(exported).toContain("$3,200");
    expect(exported).toContain("VFAGrants.dnr@state.mn.us");
  });
});
