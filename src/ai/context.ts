// Department facts the coach and checker can lean on, as plain text. Aggregate
// counts only; nothing patient-level ever reaches the model.

export interface DepartmentContext {
  name: string;
  state: string;
  deptType: string;
  population: number | null;
  areaSqMi: number | null;
  budget: number | null;
  callCounts: { year: number; category: string; count: number }[];
  needs: { description: string; category: string; reason: string; quantity: number; cost: number }[];
}

export function renderDepartmentContext(d: DepartmentContext): string {
  const lines = [
    `Department: ${d.name} (${d.state}), ${d.deptType.replaceAll("_", " ")}`,
    `Population served: ${d.population ?? "not on file"}`,
    `Protection area: ${d.areaSqMi != null ? `${d.areaSqMi} square miles` : "not on file"}`,
    `Annual operating budget: ${d.budget != null ? `$${d.budget.toLocaleString("en-US")}` : "not on file"}`,
  ];
  if (d.callCounts.length) {
    lines.push("Call counts on file:");
    for (const c of d.callCounts) lines.push(`- ${c.year} ${c.category.replaceAll("_", " ")}: ${c.count}`);
  }
  if (d.needs.length) {
    lines.push("Items in this request:");
    for (const n of d.needs) {
      lines.push(`- ${n.quantity} × ${n.description} (${n.category.replaceAll("_", " ")}; reason: ${n.reason.replaceAll("_", " ")}; estimate $${n.cost.toLocaleString("en-US")})`);
    }
  }
  return lines.join("\n");
}
