// FEMA asks applicants to list everyone who helped prepare or review the
// application, paid or not, in the Contact Information section.

export interface ContributorLike {
  name: string;
  organization: string;
  role: string;
  paid: number;
}

export const TOOL_CONTRIBUTOR: ContributorLike = {
  name: "Grant Firefight",
  organization: "Grant Firefight (software)",
  role: "Interview coaching and draft checks; did not write narrative text",
  paid: 0,
};

export function helperListText(contributors: ContributorLike[]): string {
  if (contributors.length === 0) return "No one besides department members helped prepare this application.";
  return contributors
    .map((c) => [c.name, c.organization, c.role, c.paid ? "Paid" : "Unpaid"].filter(Boolean).join(" | "))
    .join("\n");
}
