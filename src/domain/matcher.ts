import { cycleStatus, PROGRAMS, type Cycle, type CycleStatus, type DepartmentLike, type Eligibility, type Program } from "../library";
import type { NeedLike } from "./needs";

export interface ProgramMatch {
  program: Program;
  eligibility: Eligibility;
  // Open needs this program can pay for.
  fundableNeeds: NeedLike[];
  nextCycle: { cycle: Cycle; status: CycleStatus } | null;
}

const STATUS_ORDER: Record<CycleStatus, number> = { open: 0, upcoming: 1, not_announced: 2, closed: 3 };

function nextCycle(program: Program, today: string): ProgramMatch["nextCycle"] {
  const ranked = program.cycles
    .map((cycle) => ({ cycle, status: cycleStatus(cycle, today) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return ranked[0] ?? null;
}

// Programs that apply to the department's state, best prospects first: open
// windows, then eligible, then the most fundable needs.
export function matchPrograms(dept: DepartmentLike, needs: NeedLike[], today: string): ProgramMatch[] {
  const matches = PROGRAMS.filter((p) => p.states === "all" || p.states.includes(dept.state)).map((program) => {
    const funds = new Set(program.activities.flatMap((a) => a.funds));
    return {
      program,
      eligibility: program.eligibility(dept),
      fundableNeeds: needs.filter((n) => funds.has(n.category as never)),
      nextCycle: nextCycle(program, today),
    };
  });
  const eligibilityRank = { eligible: 0, check: 1, ineligible: 2 } as const;
  return matches.sort(
    (a, b) =>
      eligibilityRank[a.eligibility.status] - eligibilityRank[b.eligibility.status] ||
      STATUS_ORDER[a.nextCycle?.status ?? "closed"] - STATUS_ORDER[b.nextCycle?.status ?? "closed"] ||
      b.fundableNeeds.length - a.fundableNeeds.length,
  );
}
