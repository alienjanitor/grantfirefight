// Every rule the app applies cites where it came from, so a chief (or we) can
// check it when a new notice drops.

export interface Source {
  label: string;
  url: string;
}

export const SOURCES = {
  frAfgFy2025: {
    label: "Federal Register notice on FY2025 AFG and FP&S (Sept 10, 2026)",
    url: "https://www.govinfo.gov/content/pkg/FR-2026-09-10/html/2026-18419.htm",
  },
  grantsightsAfg: {
    label: "Grantsights summary of the FY2025 AFG NOFO",
    url: "https://grantsights.com/afg-application-review",
  },
  msaFy2025Afg: {
    label: "MSA summary of FY2025 AFG SCBA and PPE priorities",
    url: "https://blog.msafire.com/g1-scba-fy-2025-afg-application-period-opened-may-19-important-information/",
  },
  grantsOfficeMixing: {
    label: "Grants Office AFG details (mixing priorities)",
    url: "https://firegrants.grantsoffice.com/GrantDetails.aspx?gid=18039",
  },
  femaDuplicationFaq: {
    label: "FEMA AFG FAQ on duplicated narratives",
    url: "https://www.fema.gov/grants/preparedness/firefighters/assistance-grants/faqs?page=15",
  },
  femaGrantWriterFaq: {
    label: "FEMA FAQ on grant writer fees",
    url: "https://fema.gov/fr/node/632231",
  },
  femaAor: {
    label: "FEMA bulletin on the authorized organization representative",
    url: "https://content.govdelivery.com/accounts/USDHSFEMA/bulletins/41afd18",
  },
  femaSaferReporting: {
    label: "FEMA: SAFER reporting changes",
    url: "https://fema.gov/node/what-changes-were-made-safer-program-last-year",
  },
  mnVfaPage: {
    label: "Minnesota DNR: Volunteer Fire Assistance grants",
    url: "https://www.dnr.state.mn.us/grants/ruralfire/volunteer.html",
  },
  mnVfaForm: {
    label: "Minnesota DNR: VFA grant application form (PDF)",
    url: "https://files.dnr.state.mn.us/assistance/grants/ruralfire/vfa-grant-application.pdf",
  },
  mnVfa2025Letter: {
    label: "Minnesota DNR: 2025 VFA cover letter and form (April 2024)",
    url: "https://content.govdelivery.com/attachments/MNDPS/2024/04/08/file_attachments/2839705/2025%20VFA%20Grant%20Application.pdf",
  },
  nmVfa: {
    label: "New Mexico Volunteer Fire Assistance listing",
    url: "https://grantable.co/grants/volunteer-fire-assistance-program-grant-09488e811ac6",
  },
  nvVfa: {
    label: "Nevada Division of Forestry: VFA grants",
    url: "https://forestry.nv.gov/happening-now/news/VFD-grant-2023",
  },
  mdVfa: {
    label: "Maryland DNR: 2025 VFA awards",
    url: "https://news.maryland.gov/dnr/2026/01/14/volunteer-fire-departments-in-17-maryland-counties-get-167314-for-rural-wildfire-protection/",
  },
  saferExplainer: {
    label: "Granted AI: AFG and SAFER explainer",
    url: "https://grantedai.com/blog/fema-afg-safer-fire-grants-fy2027-702-million-firefighters-staffing-equipment-volunteer-departments-strategy-2026",
  },
  usdaCf: {
    label: "FireRescue1: FY2026 budget proposal and fire services",
    url: "https://www.firerescue1.com/legislation-funding/trumps-2026-budget-proposal-examining-the-impact-on-fire-and-emergency-services",
  },
  msaNfpa1850: {
    label: "MSA: NFPA 1850 changes",
    url: "https://blog.msafire.com/?p=3079",
  },
  msaEnsemble: {
    label: "MSA: ensemble 10-year retirement",
    url: "https://blog.msafire.com/quiz-should-your-fire-boots-be-replaced/",
  },
  msaCylinder: {
    label: "MSA G1 manual: cylinder service life",
    url: "https://docs.msasafety.com/g1scba2025cbrn/G1%202024%20CBRN%20PN%20TBD/Cylinder_and_Cylinder_Va_1.htm",
  },
  hydroTesting: {
    label: "SafetyNow: SCBA cylinder hydrostatic testing",
    url: "https://icwgroup.safetynow.com/?p=10316",
  },
  apparatusAge: {
    label: "Fire Engineering: apparatus replacement",
    url: "https://www.fireengineering.com/?p=692557",
  },
} as const satisfies Record<string, Source>;
