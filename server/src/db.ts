import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = join(here, '..');
export const UPLOAD_DIR = join(SERVER_ROOT, 'uploads');
const DB_PATH = process.env.MAVERIC_DB ?? join(SERVER_ROOT, 'data', 'maveric.db');

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assessment (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  completed_at          TEXT,

  supplier_name         TEXT NOT NULL DEFAULT '',
  supplier_type         TEXT,
  service_fourni        TEXT NOT NULL DEFAULT '',
  sous_traitance        TEXT,
  sous_traitants_count  INTEGER,
  adresse               TEXT NOT NULL DEFAULT '',
  vis_a_vis             TEXT NOT NULL DEFAULT '',

  evidence_level        TEXT,
  evidence_age          TEXT,

  mbase                 REAL,
  risk_base             REAL,
  kt                    REAL,
  confidence            REAL,
  age_factor            REAL,
  effective_confidence  REAL,
  malus_confiance       REAL,
  score_uncapped        REAL,
  score_final           REAL,
  level                 TEXT,
  elimination_rules     TEXT,

  ai_analysis           TEXT,
  ai_generated_at       TEXT,
  ai_model              TEXT
);

CREATE TABLE IF NOT EXISTS answer (
  assessment_id INTEGER NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  criterion_id  TEXT NOT NULL,
  value         INTEGER NOT NULL,
  justification TEXT,
  auto_na       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (assessment_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS module_score (
  assessment_id INTEGER NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  module_id     TEXT NOT NULL,
  module_number INTEGER NOT NULL,
  module_title  TEXT NOT NULL,
  coefficient   REAL NOT NULL,
  average       REAL,
  counted       INTEGER NOT NULL,
  excluded      INTEGER NOT NULL,
  PRIMARY KEY (assessment_id, module_id)
);

CREATE TABLE IF NOT EXISTS attachment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime          TEXT,
  size          INTEGER NOT NULL,
  uploaded_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_answer_assessment ON answer(assessment_id);
CREATE INDEX IF NOT EXISTS idx_attachment_assessment ON attachment(assessment_id);
`);

// Vues de restitution consommees par Power BI (module 8).
db.exec(`
CREATE VIEW IF NOT EXISTS v_fournisseur AS
SELECT
  a.id                     AS assessment_id,
  a.supplier_name          AS fournisseur,
  a.supplier_type          AS type_fournisseur,
  a.service_fourni         AS service_fourni,
  a.adresse                AS adresse,
  a.vis_a_vis              AS vis_a_vis,
  a.sous_traitance         AS recours_sous_traitance,
  a.sous_traitants_count   AS nb_sous_traitants,
  a.evidence_level         AS niveau_preuve,
  a.evidence_age           AS age_preuve,
  a.effective_confidence   AS confiance_effective,
  a.score_final            AS score_final,
  a.score_uncapped         AS score_non_plafonne,
  a.level                  AS niveau_risque,
  a.status                 AS statut,
  a.created_at             AS date_creation,
  a.completed_at           AS date_cloture
FROM assessment a;

CREATE VIEW IF NOT EXISTS v_module AS
SELECT
  m.assessment_id          AS assessment_id,
  a.supplier_name          AS fournisseur,
  a.supplier_type          AS type_fournisseur,
  m.module_number          AS module_numero,
  m.module_title           AS module,
  m.coefficient            AS coefficient,
  m.average                AS moyenne_module,
  m.counted                AS criteres_notes,
  m.excluded               AS criteres_na,
  a.score_final            AS score_final_fournisseur,
  a.level                  AS niveau_risque
FROM module_score m
JOIN assessment a ON a.id = m.assessment_id;

CREATE VIEW IF NOT EXISTS v_critere AS
SELECT
  ans.assessment_id        AS assessment_id,
  a.supplier_name          AS fournisseur,
  a.supplier_type          AS type_fournisseur,
  ans.criterion_id         AS critere_id,
  ans.value                AS note,
  CASE WHEN ans.value = 6 THEN 1 ELSE 0 END AS est_na,
  ans.auto_na              AS na_automatique,
  ans.justification        AS justification,
  a.level                  AS niveau_risque
FROM answer ans
JOIN assessment a ON a.id = ans.assessment_id;
`);

export function nowIso(): string {
  return new Date().toISOString();
}
