import { SOURCES } from "../domain/sources";
import type { Activity, DepartmentLike, Eligibility, NarrativeSpec, Program } from "./types";

// Every FEMA fire grant requires an active SAM.gov registration.
function samRegistered(dept: DepartmentLike): Eligibility {
  if (dept.uei) return { status: "eligible", reasons: [] };
  return {
    status: "check",
    reasons: ["Register at SAM.gov for a Unique Entity ID. FEMA won't make an award until SAM registration is active."],
  };
}

// FY2025 narrative criteria, from the Federal Register notice published after
// the cycle (Sept 10, 2026). The 4,000-character limit comes from the NOFO via
// Grantsights; FEMA's NOFO PDF itself blocks automated reading.
const FY2025_SOURCES = [SOURCES.frAfgFy2025, SOURCES.grantsightsAfg];

export const AFG_FY2025_NARRATIVES: NarrativeSpec[] = [
  {
    key: "financial_need",
    title: "Financial Need",
    weight: "25% of the peer review score",
    charLimit: 4000,
    sources: FY2025_SOURCES,
    criteria: [
      {
        id: "fn_distress",
        label: "Financial distress",
        guidance: "Describe the department's financial situation and the distress behind the request.",
        questions: [
          "What is your annual operating budget, and where does the money come from (taxes, fundraising, township, donations)?",
          "What has happened to that money over the last few years: flat, cut, or eaten up by rising costs?",
        ],
      },
      {
        id: "fn_constraints",
        label: "Budget constraints",
        guidance: "Summarize budget constraints: what the budget already has to cover and what's left over.",
        questions: [
          "After fuel, insurance, utilities, and maintenance, how much is left for gear in a typical year?",
          "Which fixed costs went up the most recently?",
        ],
      },
      {
        id: "fn_other_funding",
        label: "Other funding tried",
        guidance: "Describe unsuccessful attempts to secure other funding.",
        questions: [
          "What other grants, levies, or fundraisers have you tried for this, and what happened?",
          "Have you asked your township, county, or local businesses? What did they say?",
        ],
      },
      {
        id: "fn_cannot_self_fund",
        label: "Can't fund it alone",
        guidance: "Show the situation does not allow the department to fund the project on its own, for reasons beyond its control.",
        questions: [
          "If you don't get this grant, how long would it take to save up for it, and what would you have to give up?",
          "What about your community (population, tax base, local economy) limits how much you can raise?",
        ],
      },
    ],
  },
  {
    key: "project_description",
    title: "Project Description",
    weight: "25% of the peer review score",
    charLimit: 4000,
    sources: FY2025_SOURCES,
    criteria: [
      {
        id: "pd_problem",
        label: "The problem",
        guidance: "Explain the problem the department is trying to solve.",
        questions: [
          "In your own words, what's wrong with what you have now? What would a new member notice first?",
          "Has the problem caused a close call, a failed inspection, or a call you couldn't handle?",
        ],
      },
      {
        id: "pd_plan",
        label: "The plan",
        guidance: "Explain the plan to use AFG funds to solve the problem, tied to the budget request.",
        questions: [
          "Exactly what would you buy, how many, and why that number?",
          "How did you arrive at the cost? Did you get quotes?",
        ],
      },
      {
        id: "pd_risk",
        label: "Risk analysis",
        guidance: "Include a risk analysis: what risks the department and community face, and how the project reduces them.",
        questions: [
          "What are the biggest hazards in your district (highways, farms, grain bins, forest, nursing homes)?",
          "What happens to your members or residents if this gear fails during a call?",
        ],
      },
      {
        id: "pd_timeline",
        label: "Timeline and milestones",
        guidance: "Give timelines and milestones showing the project completes within the two-year period of performance.",
        questions: [
          "If you were awarded tomorrow, what would happen in the first month, by six months, and by a year?",
          "Who in the department would handle purchasing, fitting, and training?",
        ],
      },
      {
        id: "pd_challenges",
        label: "Anticipated challenges",
        guidance: "Describe plans for anticipated challenges in executing the project.",
        questions: [
          "What could slow this down (vendor lead times, board approval, the cost share)? What's your backup plan?",
        ],
      },
    ],
  },
  {
    key: "cost_benefit",
    title: "Cost-Benefit",
    weight: "25% of the peer review score",
    charLimit: 4000,
    sources: FY2025_SOURCES,
    criteria: [
      {
        id: "cb_benefits",
        label: "Community benefits, with numbers",
        guidance: "Describe how the project benefits the community, with numbers and dollar amounts wherever reasonable.",
        questions: [
          "How many residents, homes, businesses, or miles of road does your department cover?",
          "What property value or lives are at stake on a typical call?",
        ],
      },
      {
        id: "cb_reduce_costs",
        label: "Keeping costs down",
        guidance: "Describe how the department intends to reduce costs, such as sharing assets or buying cooperatively.",
        questions: [
          "Do you share gear or apparatus with neighboring departments through mutual aid?",
          "How will you get the best price: multiple quotes, cooperative purchasing, trade-ins?",
        ],
      },
      {
        id: "cb_ratio",
        label: "Cost per resident or per call",
        guidance: "Relate benefits to costs with formulas such as cost per resident served or cost per call.",
        questions: [
          "Roughly how many calls a year would use this equipment? How many years will it last?",
        ],
      },
    ],
  },
  {
    key: "statement_of_effect",
    title: "Statement of Effect on Operations",
    weight: "25% of the peer review score",
    charLimit: 4000,
    sources: FY2025_SOURCES,
    criteria: [
      {
        id: "se_daily_ops",
        label: "Daily operations",
        guidance: "Describe how the project improves daily operations.",
        questions: [
          "How would a normal week at the station change with this equipment?",
          "How often, and on what kinds of calls, will it be used?",
        ],
      },
      {
        id: "se_members",
        label: "Benefits to members",
        guidance: "Detail the benefits to the department's members, especially their safety.",
        questions: [
          "How does this protect your firefighters? Any injuries or exposures it would have prevented?",
          "Would it help you keep or recruit volunteers?",
        ],
      },
      {
        id: "se_response",
        label: "Response and capability",
        guidance: "Describe effects on response times and the department's ability to respond.",
        questions: [
          "Are there calls today where you wait for mutual aid because you lack this? How long is that wait?",
        ],
      },
      {
        id: "se_internal",
        label: "Cost reductions and other improvements",
        guidance: "Describe cost reductions and other internal improvements.",
        questions: [
          "Would this cut repair bills, rental costs, or overtime? By roughly how much?",
        ],
      },
    ],
  },
];

const OPERATIONS_AND_SAFETY: Activity = {
  id: "operations_safety",
  label: "Operations and Safety (equipment, PPE, training, wellness, facility modifications)",
  funds: [
    "turnout_ppe", "wildland_ppe", "scba", "scba_facepiece", "rit_pack", "radios_pagers",
    "water_movement", "wildland_equipment", "safety_equipment", "thermal_imaging",
    "ems_equipment", "water_rescue", "training", "wellness_fitness", "facility",
  ],
};

const VEHICLE_ACQUISITION: Activity = {
  id: "vehicle_acquisition",
  label: "Vehicle Acquisition",
  funds: ["vehicle"],
};

const REGIONAL: Activity = {
  id: "regional",
  label: "Regional (host a joint project with partner departments)",
  funds: [...OPERATIONS_AND_SAFETY.funds, "vehicle"],
};

export const AFG: Program = {
  id: "afg",
  name: "Assistance to Firefighters Grant (AFG)",
  funder: "FEMA",
  level: "federal",
  states: "all",
  support: "narrative",
  summary:
    "The biggest federal prize for equipment, PPE, training and vehicles. An automated pre-score of the request is half the total; the top-ranked requests go to a peer panel that scores four narratives.",
  award: "Up to $1M a year for jurisdictions of 100,000 or fewer; FY2025 averaged about $162,000.",
  match: "5% for 20,000 people or fewer, 10% up to 1 million, 15% above.",
  activities: [OPERATIONS_AND_SAFETY, VEHICLE_ACQUISITION, REGIONAL],
  cycles: [
    {
      id: "fy2025",
      label: "FY2025",
      opens: "2026-05-19",
      closes: "2026-06-22",
      narratives: AFG_FY2025_NARRATIVES,
      sources: FY2025_SOURCES,
    },
    {
      id: "fy2026",
      label: "FY2026 (prep)",
      note:
        "FEMA hasn't announced the FY2026 window. Drafts use the FY2025 criteria until the FY2026 notice is loaded; the FY2025 notice was announced May 18, 2026.",
      narratives: AFG_FY2025_NARRATIVES,
      sources: FY2025_SOURCES,
    },
  ],
  eligibility: samRegistered,
  sources: [SOURCES.frAfgFy2025, SOURCES.grantsightsAfg],
};

export const SAFER: Program = {
  id: "safer",
  name: "Staffing for Adequate Fire and Emergency Response (SAFER)",
  funder: "FEMA",
  level: "federal",
  states: "all",
  support: "listing",
  summary:
    "Pays for hiring, and for recruiting and retaining volunteers. Volunteer firefighter organizations can apply on behalf of many departments.",
  award: "About $324M in the latest cycle.",
  match: "Not yet checked.",
  activities: [{ id: "recruitment_retention", label: "Recruitment and Retention of Volunteers", funds: [] }],
  cycles: [
    {
      id: "fy2026",
      label: "FY2026",
      note: "Runs in the same window as AFG; not yet announced.",
      sources: [SOURCES.saferExplainer],
    },
  ],
  eligibility: samRegistered,
  postAward: { reportEveryMonths: 6, source: SOURCES.femaSaferReporting },
  sources: [SOURCES.saferExplainer],
};

export const FPS: Program = {
  id: "fps",
  name: "Fire Prevention and Safety (FP&S)",
  funder: "FEMA",
  level: "federal",
  states: "all",
  support: "listing",
  summary: "Community risk reduction, wildfire risk reduction, code enforcement and origin-and-cause programs.",
  award: "$32.4M in FY2025 across about 100 awards; up to $1.5M federal share.",
  match: "5% of the grant; cash or in-kind.",
  activities: [{ id: "fps", label: "Fire Prevention and Safety", funds: [] }],
  cycles: [
    {
      id: "fy2026",
      label: "FY2026",
      note: "Same window as AFG; not yet announced.",
      sources: [SOURCES.frAfgFy2025],
    },
  ],
  eligibility: samRegistered,
  sources: [SOURCES.frAfgFy2025],
};

export function afgCostSharePercent(population: number): 5 | 10 | 15 {
  if (population <= 20_000) return 5;
  if (population <= 1_000_000) return 10;
  return 15;
}

export function afgAwardCap(population: number): number {
  if (population <= 100_000) return 1_000_000;
  if (population <= 500_000) return 2_000_000;
  // Above 500,000 the cap is $2.91M (FY2025), waivable above 1 million.
  return 2_910_000;
}

export interface CostSplit {
  total: number;
  federal: number;
  local: number;
  percent: number;
}

// Estimate only: FEMA states the share as a percent "of the grant awarded";
// confirm exact figures with FEMA's cost-share calculator.
export function afgCostSplit(totalCost: number, population: number): CostSplit {
  const percent = afgCostSharePercent(population);
  const local = Math.ceil((totalCost * percent) / 100);
  return { total: totalCost, federal: totalCost - local, local, percent };
}
