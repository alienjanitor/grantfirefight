import type { NeedCategory } from "../domain/needs";
import { SOURCES } from "../domain/sources";
import type { Eligibility, Program } from "./types";

// Minnesota's Volunteer Fire Assistance application is a one-page form with no
// narratives: population, protection area, last year's fire incidents, and
// costs in ten fixed categories. Facts below come from the DNR page and the
// current form; the 2025-cycle cover letter fills in examples.

export const MN_VFA_FORM_LINES = [
  { id: "wildland_ppe", label: "Wildland Personal Protective Equipment" },
  { id: "structural_turnout", label: "Structural Turnout Gear" },
  { id: "excess_property", label: "Excess Property Equipment Conversion" },
  { id: "radios_pagers", label: "Radios/Pagers" },
  { id: "wildland_equipment", label: "Wildland Equipment" },
  { id: "breathing_apparatus", label: "Breathing Apparatus" },
  { id: "water_movement", label: "Water Movement Items" },
  { id: "safety_equipment", label: "Safety Equipment" },
  { id: "water_storage", label: "Water Storage System" },
  { id: "other", label: "Other Miscellaneous Projects (Describe)" },
] as const;

export type MnVfaLine = (typeof MN_VFA_FORM_LINES)[number]["id"];

export type CategoryRuling =
  | { kind: "line"; line: MnVfaLine; note?: string }
  | { kind: "ineligible"; why: string }
  | { kind: "check"; why: string; line: MnVfaLine };

export const MN_VFA_CATEGORY_RULES: Record<NeedCategory, CategoryRuling> = {
  wildland_ppe: { kind: "line", line: "wildland_ppe" },
  turnout_ppe: { kind: "line", line: "structural_turnout" },
  excess_property_conversion: { kind: "line", line: "excess_property" },
  radios_pagers: { kind: "line", line: "radios_pagers", note: "Radios and pagers must be compatible with the county 911 system." },
  wildland_equipment: { kind: "line", line: "wildland_equipment" },
  scba: { kind: "line", line: "breathing_apparatus" },
  scba_facepiece: { kind: "line", line: "breathing_apparatus" },
  rit_pack: { kind: "line", line: "breathing_apparatus" },
  water_movement: { kind: "line", line: "water_movement" },
  safety_equipment: { kind: "line", line: "safety_equipment" },
  water_storage: { kind: "line", line: "water_storage" },
  other: { kind: "check", line: "other", why: "Describe it on the form; DNR decides whether it fits fire protection." },
  thermal_imaging: {
    kind: "check",
    line: "safety_equipment",
    why: "The 2025-cycle letter listed thermal imaging cameras as not allowed; the current DNR page doesn't. Ask DNR before including one.",
  },
  training: { kind: "check", line: "other", why: "Training isn't on DNR's list of example projects. Ask DNR before including it." },
  wellness_fitness: { kind: "check", line: "other", why: "Wellness and fitness isn't on DNR's list of example projects. Ask DNR before including it." },
  vehicle: { kind: "ineligible", why: "Vehicles, UTVs, ATVs and trailers aren't allowed." },
  ems_equipment: { kind: "ineligible", why: "EMS and ambulance equipment isn't allowed (non-fire equipment)." },
  water_rescue: { kind: "ineligible", why: "Water rescue equipment isn't allowed (non-fire equipment)." },
  facility: { kind: "ineligible", why: "Building repairs and construction aren't allowed." },
  maintenance: { kind: "ineligible", why: "Routine maintenance such as tires, batteries and tune-ups isn't allowed." },
  siren: { kind: "ineligible", why: "Sirens aren't allowed." },
};

export const MN_VFA_SUBMIT_TO = "VFAGrants.dnr@state.mn.us";

function mnEligibility(dept: { state: string; population_served: number | null; incident_reports_filed: number; uei: string | null }): Eligibility {
  const reasons: string[] = [];
  let status: Eligibility["status"] = "eligible";
  if (dept.state !== "MN") {
    return { status: "ineligible", reasons: ["Only Minnesota fire departments can apply."] };
  }
  if (dept.population_served == null) {
    status = "check";
    reasons.push("Add the population you serve; the community must be under 10,000.");
  } else if (dept.population_served >= 10_000) {
    return { status: "ineligible", reasons: ["The community served must have a population under 10,000."] };
  }
  if (!dept.incident_reports_filed) {
    status = "check";
    reasons.push("DNR won't fund departments that haven't filed last year's incident reports with the State Fire Marshal.");
  }
  if (!dept.uei) {
    status = "check";
    reasons.push("The form requires a federal Unique Entity ID (UEI); DNR won't process an application without one.");
  }
  return { status, reasons };
}

export const MN_VFA: Program = {
  id: "mn_vfa",
  name: "Minnesota Volunteer Fire Assistance (VFA)",
  funder: "USDA Forest Service through Minnesota DNR",
  level: "state",
  states: ["MN"],
  support: "form",
  summary:
    "Small, steady 50:50 cost-share grants for fire protection in communities under 10,000. Priority goes to the greatest need and to departments in a Community Wildfire Protection Plan or county all-hazard mitigation plan; DNR also weighs project type, fire runs, and how many prior years you were funded.",
  award: "About 120 to 140 grants of $1,000 to $5,000 a year.",
  match: "50:50. A $2,000 project gets at most $1,000 back.",
  activities: [
    {
      id: "vfa",
      label: "Volunteer Fire Assistance",
      funds: (Object.keys(MN_VFA_CATEGORY_RULES) as NeedCategory[]).filter(
        (c) => MN_VFA_CATEGORY_RULES[c].kind !== "ineligible",
      ),
    },
  ],
  cycles: [
    {
      id: "fall-2026",
      label: "Fall 2026",
      opens: "2026-09-01",
      closes: "2026-12-01",
      note:
        "DNR's page lists September 1 to December 1 each year, and the current form says \"December 1 Deadline.\" Earlier cycles used spring and summer deadlines, so confirm the date with DNR's Rural Fire Programs Specialist.",
      sources: [SOURCES.mnVfaPage, SOURCES.mnVfaForm],
    },
  ],
  eligibility: mnEligibility,
  sources: [SOURCES.mnVfaPage, SOURCES.mnVfaForm, SOURCES.mnVfa2025Letter],
};

// Other states run VFA their own way. Listed so the matcher surfaces them; the
// details are what we've confirmed so far.
function stateVfa(state: string, name: string, award: string, match: string, source: (typeof SOURCES)[keyof typeof SOURCES]): Program {
  return {
    id: `${state.toLowerCase()}_vfa`,
    name,
    funder: "USDA Forest Service through the state forestry agency",
    level: "state",
    states: [state],
    support: "listing",
    summary: "State-run Volunteer Fire Assistance for departments serving 10,000 people or fewer.",
    award,
    match,
    activities: [{ id: "vfa", label: "Volunteer Fire Assistance", funds: [] }],
    cycles: [{ id: "next", label: "Next window", note: "Set by the state; not yet loaded.", sources: [source] }],
    eligibility(dept) {
      if (dept.population_served != null && dept.population_served > 10_000) {
        return { status: "ineligible", reasons: ["VFA serves communities of 10,000 people or fewer."] };
      }
      return { status: "check", reasons: ["Confirm the current rules with the state forestry agency."] };
    },
    sources: [source],
  };
}

export const OTHER_STATE_VFA: Program[] = [
  stateVfa("NM", "New Mexico Volunteer Fire Assistance", "Up to $25,000.", "10% from state or local funds.", SOURCES.nmVfa),
  stateVfa("NV", "Nevada Volunteer Fire Assistance", "Not yet checked.", "1:1 in money, time or equipment.", SOURCES.nvVfa),
  stateVfa("MD", "Maryland Volunteer Fire Assistance", "Up to $3,000.", "50%.", SOURCES.mdVfa),
];

export const USDA_COMMUNITY_FACILITIES: Program = {
  id: "usda_cf",
  name: "USDA Rural Development Community Facilities",
  funder: "USDA Rural Development",
  level: "federal",
  states: "all",
  support: "listing",
  summary: "Loans and grants to rural municipalities for stations, apparatus and ambulances. Proposed for elimination in the FY2026 budget.",
  award: "$721M program.",
  match: "Not yet checked.",
  activities: [{ id: "cf", label: "Community Facilities", funds: ["vehicle", "facility"] }],
  cycles: [{ id: "next", label: "Next window", note: "Not yet checked. Ask your state USDA Rural Development office.", sources: [SOURCES.usdaCf] }],
  eligibility: () => ({ status: "check", reasons: ["Applicants are municipalities and public bodies, so the township or city may need to apply."] }),
  sources: [SOURCES.usdaCf],
};

export interface VfaEstimate {
  projectTotal: number;
  reimbursement: number;
  departmentShare: number;
  capped: boolean;
}

// DNR describes grants as up to $5,000 on a 50:50 basis. Whether the cap
// applies to the reimbursement or to the request is an open question for DNR;
// this applies it to the reimbursement.
export function mnVfaEstimate(projectTotal: number): VfaEstimate {
  const half = Math.floor(projectTotal / 2);
  const reimbursement = Math.min(half, 5_000);
  return { projectTotal, reimbursement, departmentShare: projectTotal - reimbursement, capped: half > 5_000 };
}
