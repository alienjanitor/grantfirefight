import { describe, expect, it } from "vitest";
import { matchPrograms } from "../src/domain/matcher";
import type { NeedLike } from "../src/domain/needs";
import { mixWarnings, rateNeed } from "../src/domain/priority";
import { mnVfaReadiness, type DepartmentForVfa } from "../src/domain/vfa-readiness";
import { getProgram, PROGRAMS } from "../src/library";
import { afgAwardCap, afgCostSplit } from "../src/library/afg";
import { mnVfaEstimate } from "../src/library/vfa";

const dept: DepartmentForVfa = {
  state: "MN",
  dept_type: "volunteer",
  population_served: 2400,
  uei: "ABCDEF123456",
  incident_reports_filed: 1,
  in_mitigation_plan: 0,
  protection_area_sq_mi: 96,
};

let nextId = 0;
const need = (over: Partial<NeedLike>): NeedLike => ({
  id: `n${nextId++}`,
  category: "turnout_ppe",
  reason: "other",
  description: "",
  quantity: 1,
  estimated_cost: 1000,
  used_equipment: 0,
  asset_id: null,
  ...over,
});

describe("program library", () => {
  it("gives every narrative criteria, a limit and a source", () => {
    for (const program of PROGRAMS) {
      for (const cycle of program.cycles) {
        for (const n of cycle.narratives ?? []) {
          expect(n.charLimit).toBeGreaterThan(0);
          expect(n.criteria.length).toBeGreaterThan(0);
          expect(n.sources.length).toBeGreaterThan(0);
          for (const c of n.criteria) expect(c.questions.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("loads the four FY2025 AFG narratives at 4,000 characters", () => {
    const narratives = getProgram("afg")!.cycles.find((c) => c.id === "fy2025")!.narratives!;
    expect(narratives.map((n) => n.key)).toEqual(["financial_need", "project_description", "cost_benefit", "statement_of_effect"]);
    expect(narratives.every((n) => n.charLimit === 4000)).toBe(true);
  });

  it("uses unique program ids and criterion ids", () => {
    const ids = PROGRAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const criteria = getProgram("afg")!.cycles[0]!.narratives!.flatMap((n) => n.criteria.map((c) => c.id));
    expect(new Set(criteria).size).toBe(criteria.length);
  });
});

describe("matchPrograms", () => {
  it("shows Minnesota VFA to a Minnesota department, open in late October", () => {
    const matches = matchPrograms(dept, [need({})], "2026-10-25");
    const vfa = matches.find((m) => m.program.id === "mn_vfa")!;
    expect(vfa.eligibility.status).toBe("eligible");
    expect(vfa.nextCycle?.status).toBe("open");
    expect(matches[0]!.program.id).toBe("mn_vfa");
    expect(matches.some((m) => m.program.id === "nm_vfa")).toBe(false);
  });

  it("rules out VFA for large communities and other states", () => {
    const big = matchPrograms({ ...dept, population_served: 12_000 }, [], "2026-10-25");
    expect(big.find((m) => m.program.id === "mn_vfa")!.eligibility.status).toBe("ineligible");
    const nm = matchPrograms({ ...dept, state: "NM" }, [], "2026-10-25");
    expect(nm.some((m) => m.program.id === "mn_vfa")).toBe(false);
    expect(nm.some((m) => m.program.id === "nm_vfa")).toBe(true);
  });

  it("asks for a UEI before AFG", () => {
    const matches = matchPrograms({ ...dept, uei: null }, [], "2026-10-25");
    expect(matches.find((m) => m.program.id === "afg")!.eligibility.status).toBe("check");
  });

  it("lists only the needs a program can pay for", () => {
    const matches = matchPrograms(dept, [need({ category: "vehicle" }), need({ category: "scba" })], "2026-10-25");
    expect(matches.find((m) => m.program.id === "mn_vfa")!.fundableNeeds.map((n) => n.category)).toEqual(["scba"]);
  });
});

describe("priority match (AFG FY2025)", () => {
  const rate = (n: NeedLike, expired = false) => rateNeed("afg", "fy2025", "operations_safety", n, expired);

  it("rates replacing expired or damaged PPE and SCBA as high", () => {
    expect(rate(need({ category: "scba", reason: "replace_expired" })).level).toBe("high");
    expect(rate(need({ category: "turnout_ppe", reason: "replace_damaged" })).level).toBe("high");
    expect(rate(need({ category: "turnout_ppe", reason: "members_without" })).level).toBe("high");
    expect(rate(need({ category: "scba_facepiece" })).level).toBe("high");
  });

  it("treats a need tied to an expired asset as a replacement", () => {
    expect(rate(need({ category: "scba", reason: "upgrade" }), true).level).toBe("high");
  });

  it("won't guess about items it can't cite", () => {
    expect(rate(need({ category: "radios_pagers" })).level).toBe("unrated");
    expect(rate(need({ category: "scba", reason: "upgrade" })).level).toBe("unrated");
  });

  it("sends vehicles to their own application", () => {
    expect(rate(need({ category: "vehicle" })).level).toBe("wrong_activity");
  });

  it("warns when high-priority items are mixed with others", () => {
    const high = rate(need({ category: "scba", reason: "replace_expired" }));
    const radio = rate(need({ category: "radios_pagers" }));
    expect(mixWarnings([high])).toEqual([]);
    expect(mixWarnings([high, radio])).toHaveLength(1);
  });
});

describe("AFG money", () => {
  it("uses the population tiers from the FY2025 notice", () => {
    expect(afgCostSplit(100_000, 2400)).toEqual({ total: 100_000, federal: 95_000, local: 5_000, percent: 5 });
    expect(afgCostSplit(100_000, 20_001).percent).toBe(10);
    expect(afgCostSplit(100_000, 1_000_001).percent).toBe(15);
    expect(afgAwardCap(100_000)).toBe(1_000_000);
    expect(afgAwardCap(100_001)).toBe(2_000_000);
  });
});

describe("Minnesota VFA readiness", () => {
  const incidents = { year: 2025, wildland: 12, structural: 4, other: 9 };

  it("splits 50:50 and caps the reimbursement at $5,000", () => {
    expect(mnVfaEstimate(2000)).toEqual({ projectTotal: 2000, reimbursement: 1000, departmentShare: 1000, capped: false });
    expect(mnVfaEstimate(14_000)).toMatchObject({ reimbursement: 5000, departmentShare: 9000, capped: true });
  });

  it("maps needs onto the form's cost lines", () => {
    const r = mnVfaReadiness(
      dept,
      [need({ category: "scba", estimated_cost: 6000 }), need({ category: "rit_pack", estimated_cost: 1500 }), need({ category: "water_movement", estimated_cost: 900 })],
      incidents,
    );
    expect(r.lines.find((l) => l.id === "breathing_apparatus")!.total).toBe(7500);
    expect(r.lines.find((l) => l.id === "water_movement")!.total).toBe(900);
    expect(r.grandTotal).toBe(8400);
    expect(r.flags).toEqual([]);
    expect(r.checklist.filter((c) => c.ok === false)).toEqual([]);
  });

  it("blocks ineligible items and used equipment", () => {
    const r = mnVfaReadiness(dept, [need({ category: "vehicle" }), need({ category: "turnout_ppe", used_equipment: 1 })], incidents);
    expect(r.flags.map((f) => f.severity)).toEqual(["blocker", "blocker"]);
    expect(r.grandTotal).toBe(0);
    expect(r.checklist.find((c) => c.id === "no_blockers")!.ok).toBe(false);
  });

  it("asks before including items DNR's lists disagree on", () => {
    const r = mnVfaReadiness(dept, [need({ category: "thermal_imaging", estimated_cost: 7000 })], incidents);
    expect(r.flags[0]!.severity).toBe("check");
    expect(r.grandTotal).toBe(7000);
  });

  it("lists what's missing from the profile", () => {
    const r = mnVfaReadiness(
      { ...dept, uei: null, incident_reports_filed: 0, protection_area_sq_mi: null },
      [],
      { year: 2025, wildland: null, structural: null, other: null },
    );
    const missing = r.checklist.filter((c) => c.ok === false).map((c) => c.id);
    expect(missing).toEqual(["incident_reports", "uei", "protection_area", "incidents", "projects"]);
  });
});
