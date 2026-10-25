import type { NeedCategory } from "../domain/needs";
import type { Source } from "../domain/sources";

export interface Criterion {
  id: string;
  label: string;
  // What reviewers look for, in the funder's terms.
  guidance: string;
  // Plain-language starter questions the coach asks the chief.
  questions: string[];
}

export interface NarrativeSpec {
  key: string;
  title: string;
  weight: string;
  charLimit: number;
  criteria: Criterion[];
  sources: Source[];
}

export interface Activity {
  id: string;
  label: string;
  funds: NeedCategory[];
}

export interface Cycle {
  id: string;
  label: string;
  // ISO dates. Absent when the funder hasn't announced them.
  opens?: string;
  closes?: string;
  note?: string;
  // Narrative sections for programs that take narratives.
  narratives?: NarrativeSpec[];
  sources: Source[];
}

export interface DepartmentLike {
  state: string;
  dept_type: string;
  population_served: number | null;
  uei: string | null;
  incident_reports_filed: number;
  in_mitigation_plan: number;
}

export type EligibilityStatus = "eligible" | "ineligible" | "check";

export interface Eligibility {
  status: EligibilityStatus;
  reasons: string[];
}

// What the app can do with a program today.
//   narrative: coach, criteria check and similarity guard per narrative
//   form:      readiness worksheet for a form-only application
//   listing:   matcher and calendar only
export type ProgramSupport = "narrative" | "form" | "listing";

export interface Program {
  id: string;
  name: string;
  funder: string;
  level: "federal" | "state";
  // Two-letter state codes, or "all".
  states: string[] | "all";
  support: ProgramSupport;
  summary: string;
  award: string;
  match: string;
  activities: Activity[];
  cycles: Cycle[];
  eligibility(dept: DepartmentLike): Eligibility;
  postAward?: { reportEveryMonths: number; source: Source };
  sources: Source[];
}

export type CycleStatus = "upcoming" | "open" | "closed" | "not_announced";

export function cycleStatus(cycle: Cycle, today: string): CycleStatus {
  if (!cycle.opens || !cycle.closes) return "not_announced";
  if (today < cycle.opens) return "upcoming";
  if (today <= cycle.closes) return "open";
  return "closed";
}
