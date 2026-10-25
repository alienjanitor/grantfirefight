import type { NeedCategory, NeedLike, NeedReason } from "./needs";
import { SOURCES, type Source } from "./sources";

// "Priority match", never "your FEMA score": FEMA's pre-score also weighs
// things we can't see, such as audit findings and history managing awards.

export type PriorityLevel = "high" | "medium" | "low" | "unrated" | "wrong_activity";

export interface PriorityResult {
  level: PriorityLevel;
  basis: string;
  source?: Source;
}

interface Rule {
  categories: NeedCategory[];
  reasons?: NeedReason[];
  level: Exclude<PriorityLevel, "unrated" | "wrong_activity">;
  basis: string;
  source: Source;
}

// AFG FY2025, Operations and Safety. Only rules we can cite are listed; the
// NOFO's full priority tables still need loading (FEMA blocks automated reads
// of the PDF).
const AFG_OPS_SAFETY_FY2025: Rule[] = [
  {
    categories: ["turnout_ppe", "scba"],
    reasons: ["replace_expired"],
    level: "high",
    basis: "Replacing in-service expired or noncompliant PPE or SCBA to the current standard is high priority.",
    source: SOURCES.msaFy2025Afg,
  },
  {
    categories: ["turnout_ppe", "scba"],
    reasons: ["replace_damaged"],
    level: "high",
    basis: "Replacing in-service damaged, unsafe or unrepairable PPE or SCBA to the current standard is high priority.",
    source: SOURCES.msaFy2025Afg,
  },
  {
    categories: ["turnout_ppe", "scba"],
    reasons: ["members_without"],
    level: "high",
    basis: "Increasing supply for firefighters who don't have a set of PPE or SCBA is high priority.",
    source: SOURCES.msaFy2025Afg,
  },
  {
    categories: ["scba_facepiece"],
    level: "high",
    basis: "Acquiring or replacing an individual SCBA facepiece for each operational member is high priority.",
    source: SOURCES.msaFy2025Afg,
  },
  {
    categories: ["rit_pack"],
    level: "high",
    basis: "RIT packs and cylinders are high-priority basic equipment.",
    source: SOURCES.msaFy2025Afg,
  },
];

const RULES_BY_CYCLE: Record<string, Rule[]> = {
  // FY2026 drafts use FY2025 rules until the new notice is loaded.
  "afg:fy2025:operations_safety": AFG_OPS_SAFETY_FY2025,
  "afg:fy2026:operations_safety": AFG_OPS_SAFETY_FY2025,
};

export function hasPriorityRules(programId: string, cycleId: string, activity: string): boolean {
  return `${programId}:${cycleId}:${activity}` in RULES_BY_CYCLE;
}

// An expired linked asset makes the need a replacement, whatever reason was picked.
export function effectiveReason(need: NeedLike, linkedAssetExpired: boolean): string {
  return linkedAssetExpired ? "replace_expired" : need.reason;
}

export function rateNeed(
  programId: string,
  cycleId: string,
  activity: string,
  need: NeedLike,
  linkedAssetExpired = false,
): PriorityResult {
  if (programId === "afg" && activity === "operations_safety" && need.category === "vehicle") {
    return { level: "wrong_activity", basis: "Vehicles go in a separate Vehicle Acquisition application." };
  }
  const rules = RULES_BY_CYCLE[`${programId}:${cycleId}:${activity}`];
  if (!rules) return { level: "unrated", basis: "Priority rules for this program aren't loaded yet." };
  const reason = effectiveReason(need, linkedAssetExpired);
  const rule = rules.find(
    (r) => r.categories.includes(need.category as NeedCategory) && (!r.reasons || r.reasons.includes(reason as NeedReason)),
  );
  if (rule) return { level: rule.level, basis: rule.basis, source: rule.source };
  return { level: "unrated", basis: "Not a high priority we can confirm. Check this item against the current NOFO's priority tables." };
}

export interface MixWarning {
  message: string;
  source: Source;
}

export function mixWarnings(results: PriorityResult[]): MixWarning[] {
  const hasHigh = results.some((r) => r.level === "high");
  const others = results.filter((r) => r.level !== "high" && r.level !== "wrong_activity");
  if (!hasHigh || others.length === 0) return [];
  return [
    {
      message: `${others.length} item${others.length === 1 ? "" : "s"} in this request ${others.length === 1 ? "isn't" : "aren't"} confirmed high priority. Mixing medium- or low-priority items with high-priority ones can lower the pre-score; consider dropping them or requesting them separately.`,
      source: SOURCES.grantsOfficeMixing,
    },
  ];
}
