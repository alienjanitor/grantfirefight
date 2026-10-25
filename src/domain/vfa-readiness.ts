import { MN_VFA_CATEGORY_RULES, MN_VFA_FORM_LINES, MN_VFA_SUBMIT_TO, mnVfaEstimate, type MnVfaLine, type VfaEstimate } from "../library/vfa";
import type { DepartmentLike } from "../library";
import { isNeedCategory, type NeedLike } from "./needs";

export interface ChecklistItem {
  id: string;
  label: string;
  // true: done, false: missing and required, null: the chief confirms by hand.
  ok: boolean | null;
  detail?: string;
}

export interface FormLine {
  id: MnVfaLine;
  label: string;
  total: number;
  needs: NeedLike[];
  notes: string[];
}

export interface Flag {
  need: NeedLike;
  severity: "blocker" | "check";
  message: string;
}

export interface FireIncidents {
  year: number;
  wildland: number | null;
  structural: number | null;
  other: number | null;
}

export interface VfaReadiness {
  checklist: ChecklistItem[];
  lines: FormLine[];
  flags: Flag[];
  grandTotal: number;
  estimate: VfaEstimate;
  incidents: FireIncidents;
}

export interface DepartmentForVfa extends DepartmentLike {
  protection_area_sq_mi: number | null;
}

export function mnVfaReadiness(dept: DepartmentForVfa, needs: NeedLike[], incidents: FireIncidents): VfaReadiness {
  const lines: FormLine[] = MN_VFA_FORM_LINES.map((l) => ({ id: l.id, label: l.label, total: 0, needs: [], notes: [] }));
  const flags: Flag[] = [];

  for (const need of needs) {
    if (need.used_equipment) {
      flags.push({ need, severity: "blocker", message: "Used equipment isn't allowed." });
      continue;
    }
    const ruling = isNeedCategory(need.category) ? MN_VFA_CATEGORY_RULES[need.category] : MN_VFA_CATEGORY_RULES.other;
    if (ruling.kind === "ineligible") {
      flags.push({ need, severity: "blocker", message: ruling.why });
      continue;
    }
    if (ruling.kind === "check") flags.push({ need, severity: "check", message: ruling.why });
    const line = lines.find((l) => l.id === ruling.line)!;
    line.total += need.estimated_cost;
    line.needs.push(need);
    if (ruling.kind === "line" && ruling.note && !line.notes.includes(ruling.note)) line.notes.push(ruling.note);
  }

  const grandTotal = lines.reduce((sum, l) => sum + l.total, 0);
  const incidentsKnown = incidents.wildland != null && incidents.structural != null && incidents.other != null;

  const checklist: ChecklistItem[] = [
    { id: "state", label: "Minnesota fire department", ok: dept.state === "MN" },
    {
      id: "population",
      label: "Community population under 10,000",
      ok: dept.population_served != null && dept.population_served < 10_000,
      detail: dept.population_served != null ? `${dept.population_served.toLocaleString("en-US")} on file` : "Not on file",
    },
    {
      id: "incident_reports",
      label: "Last year's incident reports filed with the State Fire Marshal",
      ok: !!dept.incident_reports_filed,
      detail: "DNR won't fund departments that haven't filed them.",
    },
    { id: "uei", label: "Federal Unique Entity ID (UEI)", ok: !!dept.uei, detail: dept.uei ?? "Register at SAM.gov; DNR won't process the form without it." },
    {
      id: "protection_area",
      label: "Protection area in square miles",
      ok: dept.protection_area_sq_mi != null,
      detail: dept.protection_area_sq_mi != null ? `${dept.protection_area_sq_mi} sq mi` : "Not on file",
    },
    {
      id: "incidents",
      label: `${incidents.year} fire incidents: wildland, structural, other`,
      ok: incidentsKnown,
      detail: incidentsKnown ? `${incidents.wildland} / ${incidents.structural} / ${incidents.other}` : "Add last year's counts on the department page.",
    },
    { id: "projects", label: "At least one eligible project with a cost estimate", ok: grandTotal > 0 },
    { id: "no_blockers", label: "No ineligible items in the request", ok: !flags.some((f) => f.severity === "blocker") },
    {
      id: "mitigation_plan",
      label: "In a Community Wildfire Protection Plan or county all-hazard mitigation plan",
      ok: dept.in_mitigation_plan ? true : null,
      detail: "Not required, but DNR gives these departments priority.",
    },
    { id: "contacts", label: "Governing representative and fire chief contact details on the form", ok: null },
    { id: "signatures", label: "Chief's signature, AD-1048 debarment certification, and Exhibit D certification", ok: null },
    { id: "submit", label: `Email the completed form to ${MN_VFA_SUBMIT_TO} and keep a copy`, ok: null },
    {
      id: "no_early_purchases",
      label: "Nothing bought before the grant contract's start date",
      ok: null,
      detail: "DNR won't reimburse purchases made before the begin date on the grant contract.",
    },
  ];

  return { checklist, lines, flags, grandTotal, estimate: mnVfaEstimate(grandTotal), incidents };
}
