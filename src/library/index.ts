import { AFG, FPS, SAFER } from "./afg";
import type { Cycle, NarrativeSpec, Program } from "./types";
import { MN_VFA, OTHER_STATE_VFA, USDA_COMMUNITY_FACILITIES } from "./vfa";

export const PROGRAMS: Program[] = [AFG, MN_VFA, SAFER, FPS, ...OTHER_STATE_VFA, USDA_COMMUNITY_FACILITIES];

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

export function getCycle(program: Program, cycleId: string): Cycle | undefined {
  return program.cycles.find((c) => c.id === cycleId);
}

export function getNarrative(program: Program, cycleId: string, key: string): NarrativeSpec | undefined {
  return getCycle(program, cycleId)?.narratives?.find((n) => n.key === key);
}

export { cycleStatus } from "./types";
export type { Activity, Criterion, Cycle, CycleStatus, DepartmentLike, Eligibility, NarrativeSpec, Program } from "./types";
