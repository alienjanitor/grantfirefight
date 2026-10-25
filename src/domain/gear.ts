import { SOURCES, type Source } from "./sources";

export const ASSET_KINDS = {
  turnout: "Turnout coats and pants",
  helmet: "Helmets",
  hood: "Hoods",
  gloves: "Gloves",
  boots: "Boots",
  scba: "SCBA packs",
  scba_cylinder: "SCBA cylinders",
  apparatus: "Apparatus",
  radio: "Radios and pagers",
  wildland_ppe: "Wildland PPE",
  other: "Other",
} as const;

export type AssetKind = keyof typeof ASSET_KINDS;

export function isAssetKind(value: string): value is AssetKind {
  return Object.hasOwn(ASSET_KINDS, value);
}

export interface RetireRule {
  years: number;
  mandatory: boolean;
  text: string;
  source: Source;
}

const ENSEMBLE_RULE: RetireRule = {
  years: 10,
  mandatory: true,
  text: "NFPA 1850 requires retiring every ensemble element 10 years after manufacture.",
  source: SOURCES.msaEnsemble,
};

export const RETIRE_RULES: Partial<Record<AssetKind, RetireRule>> = {
  turnout: {
    years: 10,
    mandatory: true,
    text: "NFPA 1850 requires retiring turnout coats and pants 10 years after manufacture.",
    source: SOURCES.msaNfpa1850,
  },
  helmet: ENSEMBLE_RULE,
  hood: ENSEMBLE_RULE,
  gloves: ENSEMBLE_RULE,
  boots: ENSEMBLE_RULE,
  scba: {
    years: 15,
    mandatory: false,
    text: "NFPA 1850 recommends retiring SCBA 15 years after manufacture unless upgraded; upgrades can stretch some packs to about 20.",
    source: SOURCES.msaNfpa1850,
  },
  scba_cylinder: {
    years: 15,
    mandatory: true,
    text: "DOT requires removing composite cylinders from service after year 15.",
    source: SOURCES.msaCylinder,
  },
  apparatus: {
    years: 25,
    mandatory: false,
    text: "NFPA 1900 and 1910 annexes recommend reserve status after 15 years and replacement after 25.",
    source: SOURCES.apparatusAge,
  },
};

const HYDRO_YEARS: Record<string, number> = { carbon: 5, fiberglass: 3 };
const APPARATUS_RESERVE_YEARS = 15;

export interface AssetLike {
  kind: string;
  manufacture_date: string | null;
  date_source: string;
  cylinder_material: string | null;
  last_hydro_date: string | null;
  expires_on: string | null;
}

export type MilestoneKind = "retire" | "reserve" | "hydro";
export type Timing = "past" | "soon" | "future";

export interface Milestone {
  kind: MilestoneKind;
  label: string;
  date: string;
  timing: Timing;
}

export type GearStatus = "expired" | "hydro_due" | "due_soon" | "ok" | "unknown";

export interface GearProjection {
  status: GearStatus;
  retireOn: string | null;
  // The retirement date is a requirement (or the department's own date), not
  // a recommendation.
  firm: boolean;
  rule: RetireRule | null;
  milestones: Milestone[];
  notes: string[];
}

interface PartialDate {
  year: number;
  month: number;
  day: number;
  precision: "year" | "month" | "day";
}

// Accepts "2011", "2011-06" or "2011-06-15". Missing parts default to the
// earliest possible date so projections err toward warning early.
export function parsePartialDate(value: string | null | undefined): PartialDate | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 1;
  const day = m[3] ? Number(m[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const precision = m[3] ? "day" : m[2] ? "month" : "year";
  return { year, month, day, precision };
}

function iso(year: number, month: number, day: number): string {
  // Clamp Feb 29 and the like to the last day of the month.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(day, last);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addYears(date: PartialDate, years: number): string {
  return iso(date.year + years, date.month, date.day);
}

export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  return iso(Math.floor(total / 12), (total % 12) + 1, d);
}

function timing(date: string, today: string, soonMonths: number): Timing {
  if (date <= today) return "past";
  if (date <= addMonthsIso(today, soonMonths)) return "soon";
  return "future";
}

export function projectAsset(asset: AssetLike, today: string, soonMonths = 12): GearProjection {
  const kind = isAssetKind(asset.kind) ? asset.kind : "other";
  const rule = RETIRE_RULES[kind] ?? null;
  const made = parsePartialDate(asset.manufacture_date);
  const milestones: Milestone[] = [];
  const notes: string[] = [];

  if (made && made.precision === "year") {
    notes.push("Only the year is known, so dates assume January 1. Check the label for the exact month.");
  }
  if (made && asset.date_source === "estimate") {
    notes.push("The manufacture date is an estimate. Confirm it from the label before using it in an application.");
  }

  let retireOn: string | null = null;
  const override = parsePartialDate(asset.expires_on);
  if (override) {
    retireOn = iso(override.year, override.month, override.day);
  } else if (rule && made) {
    retireOn = addYears(made, rule.years);
  }
  if (retireOn) {
    milestones.push({
      kind: "retire",
      label: override ? "Retire (department's date)" : rule?.mandatory ? "Mandatory retirement" : "Recommended replacement",
      date: retireOn,
      timing: timing(retireOn, today, soonMonths),
    });
  }

  if (kind === "apparatus" && made) {
    const reserveOn = addYears(made, APPARATUS_RESERVE_YEARS);
    milestones.push({ kind: "reserve", label: "Recommended reserve status", date: reserveOn, timing: timing(reserveOn, today, soonMonths) });
  }

  if (kind === "scba_cylinder") {
    const every = asset.cylinder_material ? HYDRO_YEARS[asset.cylinder_material] : undefined;
    const lastTest = parsePartialDate(asset.last_hydro_date) ?? made;
    if (every && lastTest) {
      const due = addYears(lastTest, every);
      // A cylinder past its service life needs replacing, not testing.
      if (!retireOn || due < retireOn) {
        milestones.push({ kind: "hydro", label: `Hydrostatic test (every ${every} years)`, date: due, timing: timing(due, today, soonMonths) });
      }
    } else if (!every) {
      notes.push("Set the cylinder material to project hydrostatic test dates (carbon every 5 years, fiberglass every 3).");
    }
  }

  milestones.sort((a, b) => a.date.localeCompare(b.date));

  let status: GearStatus = "unknown";
  const retire = milestones.find((m) => m.kind === "retire");
  const hydro = milestones.find((m) => m.kind === "hydro");
  if (retire?.timing === "past") status = "expired";
  else if (hydro?.timing === "past") status = "hydro_due";
  else if (retire?.timing === "soon" || hydro?.timing === "soon") status = "due_soon";
  else if (retire || hydro) status = "ok";

  return { status, retireOn, firm: !!override || !!rule?.mandatory, rule, milestones, notes };
}

export const STATUS_LABELS: Record<GearStatus, string> = {
  expired: "Past retirement",
  hydro_due: "Hydro test overdue",
  due_soon: "Due within 12 months",
  ok: "OK",
  unknown: "No rule or no date",
};

export function statusLabel(p: GearProjection): string {
  if (p.status === "expired" && !p.firm) return "Past recommended replacement";
  return STATUS_LABELS[p.status];
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
