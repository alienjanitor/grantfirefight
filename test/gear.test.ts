import { describe, expect, it } from "vitest";
import { addMonthsIso, parsePartialDate, projectAsset, statusLabel, type AssetLike } from "../src/domain/gear";

const asset = (over: Partial<AssetLike>): AssetLike => ({
  kind: "turnout",
  manufacture_date: null,
  date_source: "label",
  cylinder_material: null,
  last_hydro_date: null,
  expires_on: null,
  ...over,
});

describe("parsePartialDate", () => {
  it("accepts year, year-month and full dates", () => {
    expect(parsePartialDate("2011")).toMatchObject({ year: 2011, month: 1, day: 1, precision: "year" });
    expect(parsePartialDate("2011-06")).toMatchObject({ month: 6, precision: "month" });
    expect(parsePartialDate("2011-06-15")).toMatchObject({ day: 15, precision: "day" });
  });

  it("rejects junk", () => {
    expect(parsePartialDate("June 2011")).toBeNull();
    expect(parsePartialDate("2011-13")).toBeNull();
    expect(parsePartialDate("")).toBeNull();
  });
});

describe("addMonthsIso", () => {
  it("rolls over years and clamps month ends", () => {
    expect(addMonthsIso("2026-10-25", 12)).toBe("2027-10-25");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("projectAsset", () => {
  const today = "2026-10-25";

  it("retires turnout gear 10 years after manufacture", () => {
    const p = projectAsset(asset({ manufacture_date: "2016-03" }), today);
    expect(p.retireOn).toBe("2026-03-01");
    expect(p.status).toBe("expired");
    expect(p.rule?.mandatory).toBe(true);
    expect(statusLabel(p)).toBe("Past retirement");
  });

  it("warns a year ahead", () => {
    expect(projectAsset(asset({ manufacture_date: "2017-06" }), today).status).toBe("due_soon");
    expect(projectAsset(asset({ manufacture_date: "2018-06" }), today).status).toBe("ok");
  });

  it("recommends SCBA replacement at 15 years: the 2011 grant packs hit it this year", () => {
    const p = projectAsset(asset({ kind: "scba", manufacture_date: "2011-08" }), today);
    expect(p.retireOn).toBe("2026-08-01");
    expect(p.status).toBe("expired");
    expect(p.rule?.mandatory).toBe(false);
    expect(statusLabel(p)).toBe("Past recommended replacement");
  });

  it("projects hydro tests for cylinders by material", () => {
    const carbon = projectAsset(
      asset({ kind: "scba_cylinder", manufacture_date: "2015-01", cylinder_material: "carbon", last_hydro_date: "2021-05" }),
      today,
    );
    expect(carbon.milestones.find((m) => m.kind === "hydro")?.date).toBe("2026-05-01");
    expect(carbon.status).toBe("hydro_due");

    const fiberglass = projectAsset(
      asset({ kind: "scba_cylinder", manufacture_date: "2024-02", cylinder_material: "fiberglass" }),
      today,
    );
    expect(fiberglass.milestones.find((m) => m.kind === "hydro")?.date).toBe("2027-02-01");
    expect(fiberglass.status).toBe("due_soon");
  });

  it("skips the hydro test once a cylinder is past service life", () => {
    const p = projectAsset(asset({ kind: "scba_cylinder", manufacture_date: "2010", cylinder_material: "carbon", last_hydro_date: "2023" }), today);
    expect(p.status).toBe("expired");
    expect(p.milestones.some((m) => m.kind === "hydro")).toBe(false);
  });

  it("marks apparatus reserve age without calling it expired", () => {
    const p = projectAsset(asset({ kind: "apparatus", manufacture_date: "2008" }), today);
    expect(p.milestones.find((m) => m.kind === "reserve")?.timing).toBe("past");
    expect(p.status).toBe("ok");
    expect(p.retireOn).toBe("2033-01-01");
  });

  it("prefers the department's own retirement date", () => {
    const p = projectAsset(asset({ manufacture_date: "2020", expires_on: "2026-01-15" }), today);
    expect(p.retireOn).toBe("2026-01-15");
    expect(p.status).toBe("expired");
  });

  it("flags year-only and estimated dates", () => {
    const p = projectAsset(asset({ manufacture_date: "2018", date_source: "estimate" }), today);
    expect(p.notes).toHaveLength(2);
  });

  it("has nothing to say about radios", () => {
    expect(projectAsset(asset({ kind: "radio", manufacture_date: "2001" }), today).status).toBe("unknown");
  });
});
