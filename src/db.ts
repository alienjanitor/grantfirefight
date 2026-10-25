// D1 access. Every query that touches department data is scoped by
// department_id; callers pass the signed-in user's department.

export interface DepartmentRow {
  id: string;
  name: string;
  state: string;
  dept_type: string;
  population_served: number | null;
  protection_area_sq_mi: number | null;
  operating_budget: number | null;
  neris_entity_id: string | null;
  uei: string | null;
  incident_reports_filed: number;
  in_mitigation_plan: number;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  department_id: string | null;
  role: "grant_lead" | "helper";
}

export interface CallCountRow {
  year: number;
  category: string;
  count: number;
}

export interface AssetRow {
  id: string;
  department_id: string;
  kind: string;
  description: string;
  quantity: number;
  manufacture_date: string | null;
  date_source: string;
  cylinder_material: string | null;
  last_hydro_date: string | null;
  expires_on: string | null;
  condition: string;
  notes: string;
}

export interface NeedRow {
  id: string;
  department_id: string;
  asset_id: string | null;
  category: string;
  reason: string;
  description: string;
  quantity: number;
  estimated_cost: number;
  used_equipment: number;
  priority: string;
  status: string;
}

export interface ApplicationRow {
  id: string;
  department_id: string;
  program_id: string;
  cycle_id: string;
  activity: string;
  title: string;
  status: string;
  submitted_on: string | null;
  awarded_on: string | null;
  award_amount: number | null;
  updated_at: string;
}

export interface SectionRow {
  id: string;
  application_id: string;
  section_key: string;
  draft_text: string;
  criteria_coverage: string | null;
  coverage_checked_at: string | null;
  similarity_score: number | null;
  similarity_detail: string | null;
  similarity_checked_at: string | null;
  updated_at: string;
}

export interface InterviewRow {
  section_id: string;
  transcript: string;
  extracted_facts: string;
}

export interface ContributorRow {
  id: string;
  application_id: string;
  name: string;
  organization: string;
  role: string;
  paid: number;
}

export const CALL_CATEGORIES = {
  structure_fire: "Structure fires",
  wildland_fire: "Wildland fires",
  vehicle_fire: "Vehicle fires",
  other_fire: "Other fires",
  ems: "EMS",
  rescue: "Rescue",
  hazmat: "Hazmat",
  service: "Service calls",
  false_alarm: "False alarms",
  mutual_aid: "Mutual aid given",
  other: "Other",
} as const;

export const DEPT_TYPES = {
  volunteer: "All volunteer",
  mostly_volunteer: "Mostly volunteer",
  combination: "Combination",
  career: "Career",
} as const;

export const newId = () => crypto.randomUUID();

const all = async <T>(stmt: D1PreparedStatement) => (await stmt.all<T>()).results;

// Users and departments

export function getUserByEmail(db: D1Database, email: string) {
  return db.prepare("SELECT id, email, name, department_id, role FROM users WHERE email = ?").bind(email).first<UserRow>();
}

export function getDepartment(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM departments WHERE id = ?").bind(id).first<DepartmentRow>();
}

export type DepartmentInput = Omit<DepartmentRow, "id">;

export async function createDepartmentWithLead(db: D1Database, input: DepartmentInput, email: string, name: string | null, existingUserId: string | null) {
  const id = newId();
  const insertDept = db
    .prepare(
      `INSERT INTO departments (id, name, state, dept_type, population_served, protection_area_sq_mi, operating_budget,
         neris_entity_id, uei, incident_reports_filed, in_mitigation_plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.name, input.state, input.dept_type, input.population_served, input.protection_area_sq_mi, input.operating_budget,
      input.neris_entity_id, input.uei, input.incident_reports_filed, input.in_mitigation_plan);
  const user = existingUserId
    ? db.prepare("UPDATE users SET department_id = ?, role = 'grant_lead', name = COALESCE(?, name) WHERE id = ?").bind(id, name, existingUserId)
    : db.prepare("INSERT INTO users (id, email, name, department_id, role) VALUES (?, ?, ?, ?, 'grant_lead')").bind(newId(), email, name, id);
  await db.batch([insertDept, user]);
  return id;
}

export function updateDepartment(db: D1Database, id: string, input: DepartmentInput) {
  return db
    .prepare(
      `UPDATE departments SET name = ?, state = ?, dept_type = ?, population_served = ?, protection_area_sq_mi = ?,
         operating_budget = ?, neris_entity_id = ?, uei = ?, incident_reports_filed = ?, in_mitigation_plan = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(input.name, input.state, input.dept_type, input.population_served, input.protection_area_sq_mi, input.operating_budget,
      input.neris_entity_id, input.uei, input.incident_reports_filed, input.in_mitigation_plan, id)
    .run();
}

export function listCallCounts(db: D1Database, departmentId: string) {
  return all<CallCountRow>(
    db.prepare("SELECT year, category, count FROM call_counts WHERE department_id = ? ORDER BY year DESC, category").bind(departmentId),
  );
}

// Replaces one year's counts. Blank categories are cleared.
export async function setCallCounts(db: D1Database, departmentId: string, year: number, counts: Record<string, number | null>) {
  const stmts = [db.prepare("DELETE FROM call_counts WHERE department_id = ? AND year = ?").bind(departmentId, year)];
  for (const [category, count] of Object.entries(counts)) {
    if (count == null) continue;
    stmts.push(db.prepare("INSERT INTO call_counts (department_id, year, category, count) VALUES (?, ?, ?, ?)").bind(departmentId, year, category, count));
  }
  await db.batch(stmts);
}

export function listTeam(db: D1Database, departmentId: string) {
  return all<UserRow>(db.prepare("SELECT id, email, name, department_id, role FROM users WHERE department_id = ? ORDER BY role, email").bind(departmentId));
}

export function addHelper(db: D1Database, departmentId: string, email: string, name: string | null) {
  return db.prepare("INSERT INTO users (id, email, name, department_id, role) VALUES (?, ?, ?, ?, 'helper')").bind(newId(), email, name, departmentId).run();
}

export function removeHelper(db: D1Database, departmentId: string, userId: string) {
  return db.prepare("DELETE FROM users WHERE id = ? AND department_id = ? AND role = 'helper'").bind(userId, departmentId).run();
}

// Assets and needs

export function listAssets(db: D1Database, departmentId: string) {
  return all<AssetRow>(db.prepare("SELECT * FROM assets WHERE department_id = ? ORDER BY kind, manufacture_date").bind(departmentId));
}

export function getAsset(db: D1Database, departmentId: string, id: string) {
  return db.prepare("SELECT * FROM assets WHERE id = ? AND department_id = ?").bind(id, departmentId).first<AssetRow>();
}

export type AssetInput = Omit<AssetRow, "id" | "department_id">;

export function insertAsset(db: D1Database, departmentId: string, a: AssetInput) {
  return db
    .prepare(
      `INSERT INTO assets (id, department_id, kind, description, quantity, manufacture_date, date_source, cylinder_material,
         last_hydro_date, expires_on, condition, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), departmentId, a.kind, a.description, a.quantity, a.manufacture_date, a.date_source, a.cylinder_material,
      a.last_hydro_date, a.expires_on, a.condition, a.notes)
    .run();
}

export function updateAsset(db: D1Database, departmentId: string, id: string, a: AssetInput) {
  return db
    .prepare(
      `UPDATE assets SET kind = ?, description = ?, quantity = ?, manufacture_date = ?, date_source = ?, cylinder_material = ?,
         last_hydro_date = ?, expires_on = ?, condition = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ? AND department_id = ?`,
    )
    .bind(a.kind, a.description, a.quantity, a.manufacture_date, a.date_source, a.cylinder_material, a.last_hydro_date,
      a.expires_on, a.condition, a.notes, id, departmentId)
    .run();
}

export function deleteAsset(db: D1Database, departmentId: string, id: string) {
  return db.prepare("DELETE FROM assets WHERE id = ? AND department_id = ?").bind(id, departmentId).run();
}

export function listNeeds(db: D1Database, departmentId: string) {
  return all<NeedRow>(
    db.prepare("SELECT * FROM needs WHERE department_id = ? ORDER BY status = 'closed', priority = 'low', priority = 'medium', created_at").bind(departmentId),
  );
}

export function getNeed(db: D1Database, departmentId: string, id: string) {
  return db.prepare("SELECT * FROM needs WHERE id = ? AND department_id = ?").bind(id, departmentId).first<NeedRow>();
}

export type NeedInput = Omit<NeedRow, "id" | "department_id">;

export function insertNeed(db: D1Database, departmentId: string, n: NeedInput) {
  return db
    .prepare(
      `INSERT INTO needs (id, department_id, asset_id, category, reason, description, quantity, estimated_cost, used_equipment, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), departmentId, n.asset_id, n.category, n.reason, n.description, n.quantity, n.estimated_cost, n.used_equipment, n.priority, n.status)
    .run();
}

export function updateNeed(db: D1Database, departmentId: string, id: string, n: NeedInput) {
  return db
    .prepare(
      `UPDATE needs SET asset_id = ?, category = ?, reason = ?, description = ?, quantity = ?, estimated_cost = ?,
         used_equipment = ?, priority = ?, status = ?, updated_at = datetime('now')
       WHERE id = ? AND department_id = ?`,
    )
    .bind(n.asset_id, n.category, n.reason, n.description, n.quantity, n.estimated_cost, n.used_equipment, n.priority, n.status, id, departmentId)
    .run();
}

export function deleteNeed(db: D1Database, departmentId: string, id: string) {
  return db.prepare("DELETE FROM needs WHERE id = ? AND department_id = ?").bind(id, departmentId).run();
}

// Applications

export function listApplications(db: D1Database, departmentId: string) {
  return all<ApplicationRow>(db.prepare("SELECT * FROM applications WHERE department_id = ? ORDER BY updated_at DESC").bind(departmentId));
}

export function getApplication(db: D1Database, departmentId: string, id: string) {
  return db.prepare("SELECT * FROM applications WHERE id = ? AND department_id = ?").bind(id, departmentId).first<ApplicationRow>();
}

export function findApplication(db: D1Database, departmentId: string, programId: string, cycleId: string, activity: string) {
  return db
    .prepare("SELECT * FROM applications WHERE department_id = ? AND program_id = ? AND cycle_id = ? AND activity = ?")
    .bind(departmentId, programId, cycleId, activity)
    .first<ApplicationRow>();
}

export async function createApplication(
  db: D1Database,
  departmentId: string,
  a: { program_id: string; cycle_id: string; activity: string; title: string },
  sectionKeys: string[],
  contributors: Omit<ContributorRow, "id" | "application_id">[],
) {
  const id = newId();
  const stmts = [
    db
      .prepare("INSERT INTO applications (id, department_id, program_id, cycle_id, activity, title) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, departmentId, a.program_id, a.cycle_id, a.activity, a.title),
    ...sectionKeys.map((key) =>
      db.prepare("INSERT INTO narrative_sections (id, application_id, section_key) VALUES (?, ?, ?)").bind(newId(), id, key),
    ),
    ...contributors.map((c) =>
      db
        .prepare("INSERT INTO contributors (id, application_id, name, organization, role, paid) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newId(), id, c.name, c.organization, c.role, c.paid),
    ),
  ];
  await db.batch(stmts);
  return id;
}

export async function deleteApplication(db: D1Database, departmentId: string, id: string) {
  // Drop the drafts from the similarity index too; it isn't tied to sections by a foreign key.
  await db.batch([
    db
      .prepare(
        `DELETE FROM similarity_sources WHERE id IN (
           SELECT s.id FROM narrative_sections s JOIN applications a ON a.id = s.application_id
           WHERE a.id = ? AND a.department_id = ?)`,
      )
      .bind(id, departmentId),
    db.prepare("DELETE FROM applications WHERE id = ? AND department_id = ?").bind(id, departmentId),
  ]);
}

export function updateApplicationStatus(
  db: D1Database,
  departmentId: string,
  id: string,
  s: { status: string; submitted_on: string | null; awarded_on: string | null; award_amount: number | null },
) {
  return db
    .prepare(
      `UPDATE applications SET status = ?, submitted_on = ?, awarded_on = ?, award_amount = ?, updated_at = datetime('now')
       WHERE id = ? AND department_id = ?`,
    )
    .bind(s.status, s.submitted_on, s.awarded_on, s.award_amount, id, departmentId)
    .run();
}

export function touchApplication(db: D1Database, id: string) {
  return db.prepare("UPDATE applications SET updated_at = datetime('now') WHERE id = ?").bind(id).run();
}

export function listApplicationNeeds(db: D1Database, applicationId: string) {
  return all<NeedRow>(
    db
      .prepare("SELECT n.* FROM needs n JOIN application_needs an ON an.need_id = n.id WHERE an.application_id = ? ORDER BY n.created_at")
      .bind(applicationId),
  );
}

// needIds must already be filtered to the department's own needs.
export async function setApplicationNeeds(db: D1Database, applicationId: string, needIds: string[]) {
  await db.batch([
    db.prepare("DELETE FROM application_needs WHERE application_id = ?").bind(applicationId),
    ...needIds.map((nid) => db.prepare("INSERT INTO application_needs (application_id, need_id) VALUES (?, ?)").bind(applicationId, nid)),
  ]);
}

// Narrative sections and interviews

export function listSections(db: D1Database, applicationId: string) {
  return all<SectionRow>(db.prepare("SELECT * FROM narrative_sections WHERE application_id = ?").bind(applicationId));
}

export function getSection(db: D1Database, applicationId: string, key: string) {
  return db.prepare("SELECT * FROM narrative_sections WHERE application_id = ? AND section_key = ?").bind(applicationId, key).first<SectionRow>();
}

export function saveDraft(db: D1Database, sectionId: string, text: string, userId: string) {
  return db
    .prepare("UPDATE narrative_sections SET draft_text = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(text, userId, sectionId)
    .run();
}

export function saveCoverage(db: D1Database, sectionId: string, coverageJson: string) {
  return db
    .prepare("UPDATE narrative_sections SET criteria_coverage = ?, coverage_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(coverageJson, sectionId)
    .run();
}

export function saveSimilarity(db: D1Database, sectionId: string, score: number, detailJson: string) {
  return db
    .prepare("UPDATE narrative_sections SET similarity_score = ?, similarity_detail = ?, similarity_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(score, detailJson, sectionId)
    .run();
}

export function getInterview(db: D1Database, sectionId: string) {
  return db.prepare("SELECT * FROM interviews WHERE section_id = ?").bind(sectionId).first<InterviewRow>();
}

export function saveInterview(db: D1Database, sectionId: string, transcriptJson: string, factsJson: string) {
  return db
    .prepare(
      `INSERT INTO interviews (section_id, transcript, extracted_facts, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(section_id) DO UPDATE SET transcript = excluded.transcript, extracted_facts = excluded.extracted_facts, updated_at = excluded.updated_at`,
    )
    .bind(sectionId, transcriptJson, factsJson)
    .run();
}

// Contributors

export function listContributors(db: D1Database, applicationId: string) {
  return all<ContributorRow>(db.prepare("SELECT * FROM contributors WHERE application_id = ? ORDER BY created_at").bind(applicationId));
}

export function addContributor(db: D1Database, applicationId: string, c: Omit<ContributorRow, "id" | "application_id">) {
  return db
    .prepare("INSERT INTO contributors (id, application_id, name, organization, role, paid) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId(), applicationId, c.name, c.organization, c.role, c.paid)
    .run();
}

export function deleteContributor(db: D1Database, applicationId: string, id: string) {
  return db.prepare("DELETE FROM contributors WHERE id = ? AND application_id = ?").bind(id, applicationId).run();
}
