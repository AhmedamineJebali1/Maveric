import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { db, nowIso, UPLOAD_DIR, SERVER_ROOT } from './db.ts';
import {
  AUTO_NA_RULES,
  CRITERIA_BY_ID,
  EVIDENCE_AGES,
  EVIDENCE_LEVELS,
  MODULES,
  RISK_LEVELS,
  SUPPLIER_TYPES,
  autoNaCriteria,
} from './catalog.ts';
import { computeScore, validateModule } from './scoring.ts';
import type { Answers, ScoreResult } from './scoring.ts';
import { buildActionPlan, riskiestModules } from './plan.ts';
import { analyseAssessment, analysePortfolio } from './ai.ts';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

type Row = Record<string, any>;

const getAssessment = (id: number): Row | undefined =>
  db.prepare('SELECT * FROM assessment WHERE id = ?').get(id) as Row | undefined;

function loadAnswers(id: number) {
  const rows = db
    .prepare('SELECT criterion_id, value, justification, auto_na FROM answer WHERE assessment_id = ?')
    .all(id) as Row[];
  const answers: Answers = {};
  const justifications: Record<string, string> = {};
  for (const row of rows) {
    answers[row.criterion_id] = row.value;
    if (row.justification) justifications[row.criterion_id] = row.justification;
  }
  return { answers, justifications };
}

function loadAttachments(id: number) {
  return db
    .prepare('SELECT id, filename, mime, size, uploaded_at FROM attachment WHERE assessment_id = ? ORDER BY id')
    .all(id) as Row[];
}

function decodeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Etat d'avancement : le questionnaire est sequentiel, un module verrouille le suivant. */
function progress(assessment: Row, answers: Answers) {
  const auto = autoNaCriteria(answers);
  const supplierDone = Boolean(
    decodeText(assessment.supplier_name).trim() &&
      assessment.supplier_type &&
      decodeText(assessment.service_fourni).trim() &&
      assessment.sous_traitance &&
      decodeText(assessment.adresse).trim() &&
      decodeText(assessment.vis_a_vis).trim(),
  );
  const moduleDone: Record<string, boolean> = {};
  for (const module of MODULES) {
    moduleDone[module.id] = module.criteria.every((c) => auto.has(c.id) || Boolean(answers[c.id]));
  }
  const evidenceLevel = EVIDENCE_LEVELS.find((e) => e.id === assessment.evidence_level);
  const evidenceDone = Boolean(
    evidenceLevel && (evidenceLevel.confidence === 0 || assessment.evidence_age),
  );
  return { supplierDone, moduleDone, evidenceDone, autoNa: Object.fromEntries(auto) };
}

function scoreOf(assessment: Row): ScoreResult | null {
  const { answers, justifications } = loadAnswers(Number(assessment.id));
  const p = progress(assessment, answers);
  if (!p.supplierDone || !p.evidenceDone || MODULES.some((m) => !p.moduleDone[m.id])) return null;
  return computeScore({
    supplierTypeId: assessment.supplier_type,
    answers,
    justifications,
    evidenceLevelId: assessment.evidence_level,
    evidenceAgeId: assessment.evidence_age,
  });
}

function persistScore(id: number, score: ScoreResult) {
  db.prepare(
    `UPDATE assessment SET
       status = 'completed', completed_at = ?, updated_at = ?,
       mbase = ?, risk_base = ?, kt = ?, confidence = ?, age_factor = ?,
       effective_confidence = ?, malus_confiance = ?, score_uncapped = ?, score_final = ?,
       level = ?, elimination_rules = ?
     WHERE id = ?`,
  ).run(
    nowIso(),
    nowIso(),
    score.mbase,
    score.riskBase,
    score.kt,
    score.confidence,
    score.ageFactor,
    score.effectiveConfidence,
    score.malusConfiance,
    score.scoreUncapped,
    score.scoreFinal,
    score.level,
    JSON.stringify(score.eliminationRules),
    id,
  );

  db.prepare('DELETE FROM module_score WHERE assessment_id = ?').run(id);
  const insert = db.prepare(
    `INSERT INTO module_score (assessment_id, module_id, module_number, module_title, coefficient, average, counted, excluded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const m of score.modules) {
    insert.run(id, m.moduleId, m.number, m.title, m.coefficient, m.average, m.counted, m.excluded);
  }
}

// --------------------------------------------------------------------------- referentiel

app.get('/api/catalog', (_req, res) => {
  res.json({
    modules: MODULES,
    supplierTypes: SUPPLIER_TYPES.map((t) => ({ id: t.id, label: t.label })),
    evidenceLevels: EVIDENCE_LEVELS.map((e) => ({ id: e.id, label: e.label, noEvidence: e.confidence === 0 })),
    evidenceAges: EVIDENCE_AGES.map((a) => ({ id: a.id, label: a.label })),
    riskLevels: RISK_LEVELS,
    autoNaRules: AUTO_NA_RULES,
  });
});

// --------------------------------------------------------------------------- evaluations

app.get('/api/assessments', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, supplier_name, supplier_type, service_fourni, status, created_at, completed_at,
              score_final, score_uncapped, level
       FROM assessment ORDER BY datetime(created_at) DESC`,
    )
    .all() as Row[];
  res.json(
    rows.map((row) => ({
      ...row,
      supplier_type_label: SUPPLIER_TYPES.find((t) => t.id === row.supplier_type)?.label ?? null,
    })),
  );
});

app.post('/api/assessments', (_req, res) => {
  const stamp = nowIso();
  const info = db
    .prepare('INSERT INTO assessment (created_at, updated_at) VALUES (?, ?)')
    .run(stamp, stamp);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.get('/api/assessments/:id', (req, res) => {
  const id = Number(req.params.id);
  const assessment = getAssessment(id);
  if (!assessment) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const { answers, justifications } = loadAnswers(id);
  res.json({
    assessment: {
      id: assessment.id,
      status: assessment.status,
      created_at: assessment.created_at,
      completed_at: assessment.completed_at,
      supplier_name: assessment.supplier_name,
      supplier_type: assessment.supplier_type,
      service_fourni: assessment.service_fourni,
      sous_traitance: assessment.sous_traitance,
      sous_traitants_count: assessment.sous_traitants_count,
      adresse: assessment.adresse,
      vis_a_vis: assessment.vis_a_vis,
      evidence_level: assessment.evidence_level,
      evidence_age: assessment.evidence_age,
    },
    answers,
    justifications,
    attachments: loadAttachments(id),
    progress: progress(assessment, answers),
  });
});

app.delete('/api/assessments/:id', async (req, res) => {
  const id = Number(req.params.id);
  const files = db.prepare('SELECT stored_name FROM attachment WHERE assessment_id = ?').all(id) as Row[];
  db.prepare('DELETE FROM assessment WHERE id = ?').run(id);
  await Promise.all(
    files.map((f) => unlink(join(UPLOAD_DIR, f.stored_name)).catch(() => undefined)),
  );
  res.json({ ok: true });
});

// Module 1 — presentation du fournisseur (non note).
app.put('/api/assessments/:id/supplier', (req, res) => {
  const id = Number(req.params.id);
  if (!getAssessment(id)) return res.status(404).json({ error: 'Évaluation introuvable.' });

  const body = req.body ?? {};
  const errors: string[] = [];
  const name = decodeText(body.supplier_name).trim();
  const service = decodeText(body.service_fourni).trim();
  const adresse = decodeText(body.adresse).trim();
  const visAVis = decodeText(body.vis_a_vis).trim();
  const type = decodeText(body.supplier_type);
  const sousTraitance = decodeText(body.sous_traitance);
  const count =
    body.sous_traitants_count === '' || body.sous_traitants_count === null || body.sous_traitants_count === undefined
      ? null
      : Number(body.sous_traitants_count);

  if (!name) errors.push('Le nom du fournisseur est obligatoire.');
  if (!SUPPLIER_TYPES.some((t) => t.id === type)) errors.push('Le type de fournisseur est obligatoire.');
  if (!service) errors.push('Le service fourni est obligatoire.');
  if (sousTraitance !== 'oui' && sousTraitance !== 'non') errors.push('Le recours à la sous-traitance est obligatoire.');
  if (sousTraitance === 'oui' && (count === null || Number.isNaN(count) || count < 0)) {
    errors.push('Le nombre de sous-traitants ayant accès au SI ou aux données est obligatoire.');
  }
  if (!adresse) errors.push("L'adresse est obligatoire.");
  if (!visAVis) errors.push('Le vis-à-vis est obligatoire.');
  if (errors.length) return res.status(400).json({ errors });

  db.prepare(
    `UPDATE assessment SET supplier_name = ?, supplier_type = ?, service_fourni = ?, sous_traitance = ?,
       sous_traitants_count = ?, adresse = ?, vis_a_vis = ?, updated_at = ? WHERE id = ?`,
  ).run(
    name,
    type,
    service,
    sousTraitance,
    sousTraitance === 'oui' ? count : null,
    adresse,
    visAVis,
    nowIso(),
    id,
  );
  res.json({ ok: true });
});

// Modules 2 a 7 — enregistrement + verrouillage du module suivant.
app.put('/api/assessments/:id/modules/:moduleId', (req, res) => {
  const id = Number(req.params.id);
  const moduleId = req.params.moduleId;
  const assessment = getAssessment(id);
  if (!assessment) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const module = MODULES.find((m) => m.id === moduleId);
  if (!module) return res.status(404).json({ error: 'Module inconnu.' });

  const stored = loadAnswers(id);
  const incomingAnswers = (req.body?.answers ?? {}) as Answers;
  const incomingJustifications = (req.body?.justifications ?? {}) as Record<string, string>;

  const answers: Answers = { ...stored.answers };
  const justifications = { ...stored.justifications, ...incomingJustifications };
  for (const criterion of module.criteria) {
    const value = Number(incomingAnswers[criterion.id]);
    if (value) answers[criterion.id] = value;
    else delete answers[criterion.id];
  }

  const auto = autoNaCriteria(answers);
  const errors = validateModule(moduleId, answers, justifications);
  if (errors.length) return res.status(400).json({ errors });

  const del = db.prepare('DELETE FROM answer WHERE assessment_id = ? AND criterion_id = ?');
  const ins = db.prepare(
    `INSERT INTO answer (assessment_id, criterion_id, value, justification, auto_na)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const criterion of module.criteria) {
    del.run(id, criterion.id);
    const isAuto = auto.has(criterion.id);
    const value = isAuto ? 6 : answers[criterion.id];
    const justification = isAuto ? auto.get(criterion.id) ?? null : justifications[criterion.id] ?? null;
    ins.run(id, criterion.id, value, value === 6 ? justification : null, isAuto ? 1 : 0);
  }

  // Un changement de reponse peut lever une bascule automatique posee precedemment.
  for (const rule of AUTO_NA_RULES) {
    if (!module.criteria.some((c) => c.id === rule.when.criterionId)) continue;
    if (answers[rule.when.criterionId] === rule.when.equals) continue;
    for (const target of rule.apply) {
      db.prepare('DELETE FROM answer WHERE assessment_id = ? AND criterion_id = ? AND auto_na = 1').run(id, target);
    }
  }

  db.prepare('UPDATE assessment SET updated_at = ? WHERE id = ?').run(nowIso(), id);
  const refreshed = loadAnswers(id);
  res.json({ ok: true, progress: progress(getAssessment(id) as Row, refreshed.answers) });
});

// Informations complementaires — niveau et age de preuve.
app.put('/api/assessments/:id/evidence', (req, res) => {
  const id = Number(req.params.id);
  if (!getAssessment(id)) return res.status(404).json({ error: 'Évaluation introuvable.' });

  const levelId = decodeText(req.body?.evidence_level);
  const level = EVIDENCE_LEVELS.find((e) => e.id === levelId);
  if (!level) return res.status(400).json({ errors: ['Le niveau de preuve est obligatoire.'] });

  // « En cas ou le choix etait pas de preuve : pas d'apparition du 2eme tableau »
  let ageId: string | null = null;
  if (level.confidence !== 0) {
    ageId = decodeText(req.body?.evidence_age);
    if (!EVIDENCE_AGES.some((a) => a.id === ageId)) {
      return res.status(400).json({ errors: ["L'âge de preuve est obligatoire."] });
    }
  }

  db.prepare('UPDATE assessment SET evidence_level = ?, evidence_age = ?, updated_at = ? WHERE id = ?').run(
    level.id,
    ageId,
    nowIso(),
    id,
  );
  res.json({ ok: true });
});

// Pieces jointes — tout type de fichier.
app.post('/api/assessments/:id/attachments', upload.array('files', 20), (req, res) => {
  const id = Number(req.params.id);
  if (!getAssessment(id)) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const files = (req.files ?? []) as Express.Multer.File[];
  const ins = db.prepare(
    `INSERT INTO attachment (assessment_id, filename, stored_name, mime, size, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const file of files) {
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    ins.run(id, original, file.filename, file.mimetype ?? null, file.size, nowIso());
  }
  res.json({ attachments: loadAttachments(id) });
});

app.delete('/api/assessments/:id/attachments/:attachmentId', async (req, res) => {
  const id = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const row = db
    .prepare('SELECT stored_name FROM attachment WHERE id = ? AND assessment_id = ?')
    .get(attachmentId, id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
  db.prepare('DELETE FROM attachment WHERE id = ?').run(attachmentId);
  await unlink(join(UPLOAD_DIR, row.stored_name)).catch(() => undefined);
  res.json({ attachments: loadAttachments(id) });
});

app.get('/api/attachments/:attachmentId/download', (req, res) => {
  const row = db.prepare('SELECT * FROM attachment WHERE id = ?').get(Number(req.params.attachmentId)) as
    | Row
    | undefined;
  if (!row) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
  res.download(join(UPLOAD_DIR, row.stored_name), row.filename);
});

// --------------------------------------------------------------------------- resultat

app.post('/api/assessments/:id/finalize', (req, res) => {
  const id = Number(req.params.id);
  const assessment = getAssessment(id);
  if (!assessment) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const score = scoreOf(assessment);
  if (!score) {
    return res.status(400).json({ errors: ['Tous les modules doivent être complétés avant le calcul du score.'] });
  }
  persistScore(id, score);
  res.json({ ok: true });
});

app.get('/api/assessments/:id/result', (req, res) => {
  const id = Number(req.params.id);
  const assessment = getAssessment(id);
  if (!assessment) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const score = scoreOf(assessment);
  if (!score) return res.status(400).json({ error: 'Évaluation incomplète.' });

  res.json({
    assessment: {
      id: assessment.id,
      supplier_name: assessment.supplier_name,
      supplier_type_label: score.supplierTypeLabel,
      service_fourni: assessment.service_fourni,
      sous_traitance: assessment.sous_traitance,
      sous_traitants_count: assessment.sous_traitants_count,
      adresse: assessment.adresse,
      vis_a_vis: assessment.vis_a_vis,
      created_at: assessment.created_at,
      completed_at: assessment.completed_at,
      status: assessment.status,
      evidence_level_label: EVIDENCE_LEVELS.find((e) => e.id === assessment.evidence_level)?.label ?? null,
      evidence_age_label: EVIDENCE_AGES.find((a) => a.id === assessment.evidence_age)?.label ?? null,
    },
    // Les etapes de calcul ne sont pas exposees : seuls les resultats le sont.
    score: {
      scoreFinal: score.scoreFinal,
      scoreUncapped: score.scoreUncapped,
      level: score.level,
      levelLabel: score.levelLabel,
      levelDescription: score.levelDescription,
      eliminationRules: score.eliminationRules,
      modules: score.modules,
      criteria: score.criteria,
    },
    plan: buildActionPlan(score),
    riskiestModules: riskiestModules(score),
    attachments: loadAttachments(id),
    ai: assessment.ai_analysis
      ? { text: assessment.ai_analysis, generatedAt: assessment.ai_generated_at, model: assessment.ai_model }
      : null,
  });
});

app.post('/api/assessments/:id/ai-analysis', async (req, res) => {
  const id = Number(req.params.id);
  const assessment = getAssessment(id);
  if (!assessment) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const score = scoreOf(assessment);
  if (!score) return res.status(400).json({ error: 'Évaluation incomplète.' });

  try {
    const { text, model } = await analyseAssessment(assessment, score);
    const stamp = nowIso();
    db.prepare('UPDATE assessment SET ai_analysis = ?, ai_generated_at = ?, ai_model = ? WHERE id = ?').run(
      text,
      stamp,
      model,
      id,
    );
    res.json({ text, generatedAt: stamp, model });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// --------------------------------------------------------------------------- module 8

function dashboardData() {
  const rows = db
    .prepare(
      `SELECT id, supplier_name, supplier_type, service_fourni, score_final, score_uncapped, level,
              effective_confidence, completed_at
       FROM assessment WHERE status = 'completed'
       ORDER BY score_final DESC, score_uncapped DESC`,
    )
    .all() as Row[];

  const suppliers = rows.map((row) => ({
    ...row,
    supplier_type_label: SUPPLIER_TYPES.find((t) => t.id === row.supplier_type)?.label ?? null,
  }));

  const byLevel = RISK_LEVELS.map((level) => ({
    ...level,
    count: suppliers.filter((s) => s.level === level.id).length,
  }));

  const byModule = MODULES.map((module) => {
    const scores = db
      .prepare(
        `SELECT m.average AS average, a.supplier_name AS supplier
         FROM module_score m JOIN assessment a ON a.id = m.assessment_id
         WHERE m.module_id = ? AND a.status = 'completed' AND m.average IS NOT NULL`,
      )
      .all(module.id) as Row[];
    const values = scores.map((s) => Number(s.average));
    return {
      moduleId: module.id,
      number: module.number,
      title: module.title,
      coefficient: module.coefficient,
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      worst: values.length ? Math.max(...values) : null,
      count: values.length,
    };
  });

  const criteriaHotspots = db
    .prepare(
      `SELECT criterion_id, AVG(value) AS avg_value, COUNT(*) AS n
       FROM answer ans JOIN assessment a ON a.id = ans.assessment_id
       WHERE a.status = 'completed' AND ans.value < 6
       GROUP BY criterion_id ORDER BY avg_value DESC LIMIT 10`,
    )
    .all() as Row[];

  return {
    suppliers,
    byLevel,
    byModule,
    criteriaHotspots: criteriaHotspots.map((row) => ({
      criterionId: row.criterion_id,
      label: CRITERIA_BY_ID.get(row.criterion_id)?.criterion.label ?? row.criterion_id,
      moduleTitle: CRITERIA_BY_ID.get(row.criterion_id)?.module.title ?? '',
      average: Number(row.avg_value),
      count: Number(row.n),
    })),
    totals: {
      assessments: suppliers.length,
      averageScore: suppliers.length
        ? suppliers.reduce((a, b) => a + Number(b.score_final), 0) / suppliers.length
        : null,
    },
  };
}

app.get('/api/dashboard', (_req, res) => {
  res.json(dashboardData());
});

app.post('/api/dashboard/ai-analysis', async (_req, res) => {
  const data = dashboardData();
  if (data.suppliers.length === 0) {
    return res.status(400).json({ error: 'Aucune évaluation clôturée à analyser.' });
  }
  const levelOf = (id: string | null) => RISK_LEVELS.find((l) => l.id === id);
  const dataset = {
    score_moyen: data.totals.averageScore,
    fournisseurs: data.suppliers.map((s) => ({
      fournisseur: s.supplier_name,
      type: s.supplier_type_label,
      service_fourni: s.service_fourni,
      score_final: s.score_final,
      score_non_plafonne: s.score_uncapped,
      niveau_id: s.level,
      niveau: levelOf(s.level) ? `${levelOf(s.level)!.label} — ${levelOf(s.level)!.description}` : null,
      confiance_effective: s.effective_confidence,
    })),
    modules: data.byModule.map((m) => ({
      numero: m.number,
      module: m.title,
      coefficient: m.coefficient,
      moyenne: m.average,
      pire_note: m.worst,
      evaluations: m.count,
    })),
    criteres_les_plus_degrades: data.criteriaHotspots.map((c) => ({
      critere: c.label,
      module: c.moduleTitle,
      moyenne: c.average,
      evaluations: c.count,
    })),
    repartition_par_niveau: data.byLevel.map((l) => ({ niveau: l.label, nombre: l.count })),
  };

  try {
    const result = await analysePortfolio(dataset);
    res.json({ ...result, generatedAt: nowIso() });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// Flux consommes par Power BI (connecteur Web / CSV).
const EXPORT_VIEWS: Record<string, string> = {
  fournisseurs: 'v_fournisseur',
  modules: 'v_module',
  criteres: 'v_critere',
};

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(';'), ...rows.map((row) => headers.map((h) => escape(row[h])).join(';'))].join('\r\n');
}

app.get('/api/export/:view.csv', (req, res) => {
  const view = EXPORT_VIEWS[req.params.view];
  if (!view) return res.status(404).json({ error: 'Vue inconnue.' });
  const rows = db.prepare(`SELECT * FROM ${view}`).all() as Row[];
  const enriched = rows.map((row) =>
    row.critere_id
      ? { ...row, critere: CRITERIA_BY_ID.get(row.critere_id)?.criterion.label ?? row.critere_id,
          module: CRITERIA_BY_ID.get(row.critere_id)?.module.title ?? '' }
      : row,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="maveric_${req.params.view}.csv"`);
  res.send('﻿' + toCsv(enriched));
});

app.get('/api/export/:view.json', (req, res) => {
  const view = EXPORT_VIEWS[req.params.view];
  if (!view) return res.status(404).json({ error: 'Vue inconnue.' });
  res.json(db.prepare(`SELECT * FROM ${view}`).all());
});

// --------------------------------------------------------------------------- front

const distDir = join(SERVER_ROOT, '..', 'web', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
}

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`MAVERIC — API sur http://localhost:${port}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "Analyse IA : Claude activé."
      : "Analyse IA : moteur déterministe (définir ANTHROPIC_API_KEY pour activer Claude).",
  );
});
