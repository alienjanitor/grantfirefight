-- Grant Firefight schema. Grant programs and their cycles live in code
-- (src/library), versioned by fiscal year and reviewed like any other change.

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  dept_type TEXT NOT NULL CHECK (dept_type IN ('volunteer', 'mostly_volunteer', 'combination', 'career')),
  population_served INTEGER,
  protection_area_sq_mi REAL,
  operating_budget INTEGER,
  neris_entity_id TEXT,
  uei TEXT,
  -- Prior year's incident reports filed with the state (MFIRS/NERIS). Minnesota VFA requires it.
  incident_reports_filed INTEGER NOT NULL DEFAULT 0,
  -- Takes part in a Community Wildfire Protection Plan or county all-hazard mitigation plan.
  in_mitigation_plan INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  department_id TEXT REFERENCES departments(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'grant_lead' CHECK (role IN ('grant_lead', 'helper')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Aggregate call counts only. Patient-level EMS records never enter the app.
CREATE TABLE call_counts (
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'structure_fire', 'wildland_fire', 'vehicle_fire', 'other_fire',
    'ems', 'rescue', 'hazmat', 'service', 'false_alarm', 'mutual_aid', 'other'
  )),
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (department_id, year, category)
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'turnout', 'helmet', 'hood', 'gloves', 'boots', 'scba', 'scba_cylinder',
    'apparatus', 'radio', 'wildland_ppe', 'other'
  )),
  description TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- ISO date or year-month from the label; model year for apparatus.
  manufacture_date TEXT,
  date_source TEXT NOT NULL DEFAULT 'estimate' CHECK (date_source IN ('label', 'records', 'estimate')),
  cylinder_material TEXT CHECK (cylinder_material IN ('carbon', 'fiberglass', 'other')),
  last_hydro_date TEXT,
  -- Manual override when the department knows a different retirement date.
  expires_on TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good', 'fair', 'poor', 'out_of_service')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX assets_department ON assets(department_id);

CREATE TABLE needs (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  -- Why the item is needed. Grant priorities hinge on this (e.g. AFG rates
  -- replacing expired PPE as high priority).
  reason TEXT NOT NULL DEFAULT 'other' CHECK (reason IN (
    'replace_expired', 'replace_damaged', 'members_without', 'upgrade', 'new_capability', 'other'
  )),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  estimated_cost INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  used_equipment INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'planned', 'funded', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX needs_department ON needs(department_id);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  activity TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafting' CHECK (status IN ('drafting', 'ready', 'submitted', 'awarded', 'declined', 'withdrawn')),
  submitted_on TEXT,
  awarded_on TEXT,
  award_amount INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- FEMA may disqualify both applications when a department files two for the
  -- same activity in one period. Enforce one per activity per cycle.
  UNIQUE (department_id, program_id, cycle_id, activity)
);

CREATE TABLE application_needs (
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  need_id TEXT NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, need_id)
);

CREATE TABLE narrative_sections (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  draft_text TEXT NOT NULL DEFAULT '',
  criteria_coverage TEXT,
  coverage_checked_at TEXT,
  similarity_score REAL,
  similarity_detail TEXT,
  similarity_checked_at TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, section_key)
);

CREATE TABLE interviews (
  section_id TEXT PRIMARY KEY REFERENCES narrative_sections(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL DEFAULT '[]',
  extracted_facts TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Everyone who helped prepare or review an application, paid or not. FEMA asks
-- for this list in the Contact Information section.
CREATE TABLE contributors (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Similarity guard index: hashed 6-word shingles of every narrative draft and
-- known template. department_id is NULL for templates. Text is never stored
-- here, and one department's drafts are never shown to another.
CREATE TABLE similarity_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('section', 'template')),
  department_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  shingle_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE shingles (
  source_id TEXT NOT NULL REFERENCES similarity_sources(id) ON DELETE CASCADE,
  hash INTEGER NOT NULL,
  PRIMARY KEY (source_id, hash)
) WITHOUT ROWID;
CREATE INDEX shingles_hash ON shingles(hash);
