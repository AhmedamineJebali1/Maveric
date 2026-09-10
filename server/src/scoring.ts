// Moteur de calcul MAVERIC. Execute uniquement cote serveur :
// « Les calculs ne doivent pas etre affiches » — le client ne recoit que les resultats.

import {
  ALPHA,
  EVIDENCE_AGES,
  EVIDENCE_LEVELS,
  MODULES,
  RISK_LEVELS,
  SUPPLIER_TYPES,
  autoNaCriteria,
} from './catalog.ts';

export type Answers = Record<string, number>;

export type ModuleScore = {
  moduleId: string;
  number: number;
  title: string;
  coefficient: number;
  average: number | null;
  counted: number;
  excluded: number;
};

export type CriterionScore = {
  criterionId: string;
  moduleId: string;
  moduleNumber: number;
  moduleTitle: string;
  coefficient: number;
  label: string;
  value: number;
  na: boolean;
  optionLabel: string;
  justification: string | null;
};

export type ScoreResult = {
  modules: ModuleScore[];
  criteria: CriterionScore[];
  mbase: number;
  riskBase: number;
  kt: number;
  supplierTypeLabel: string;
  confidence: number;
  ageFactor: number;
  effectiveConfidence: number;
  malusConfiance: number;
  /** Score non plafonne, affiche a cote du score borne pour l'ordonnancement des plans d'action. */
  scoreUncapped: number;
  /** Score final borne a 100, apres application des regles eliminatoires. */
  scoreFinal: number;
  level: string;
  levelLabel: string;
  levelDescription: string;
  eliminationRules: string[];
};

export function levelFor(score: number) {
  // Seuils : 0-20 Low ; >20-40 Moderate ; >40-60 High ; >60-80 Very high ; >80-100 Critical.
  for (const level of RISK_LEVELS) {
    if (score <= level.max) return level;
  }
  return RISK_LEVELS[RISK_LEVELS.length - 1];
}

export function computeScore(input: {
  supplierTypeId: string;
  answers: Answers;
  justifications: Record<string, string>;
  evidenceLevelId: string;
  evidenceAgeId: string | null;
}): ScoreResult {
  const auto = autoNaCriteria(input.answers);
  const moduleScores: ModuleScore[] = [];
  const criteriaScores: CriterionScore[] = [];

  for (const module of MODULES) {
    let sum = 0;
    let counted = 0;
    let excluded = 0;

    for (const criterion of module.criteria) {
      const value = auto.has(criterion.id) ? 6 : input.answers[criterion.id];
      const isNa = value === 6;
      const option = criterion.options.find((o) => o.value === value);

      criteriaScores.push({
        criterionId: criterion.id,
        moduleId: module.id,
        moduleNumber: module.number,
        moduleTitle: module.title,
        coefficient: module.coefficient,
        label: criterion.label,
        value,
        na: isNa,
        optionLabel: option ? option.label : '',
        justification: input.justifications[criterion.id] ?? null,
      });

      // « Si il coche le 6eme choix = ne pas compter ni dans le numerateur ni denominateur »
      if (isNa) {
        excluded += 1;
        continue;
      }
      sum += value;
      counted += 1;
    }

    moduleScores.push({
      moduleId: module.id,
      number: module.number,
      title: module.title,
      coefficient: module.coefficient,
      average: counted > 0 ? sum / counted : null,
      counted,
      excluded,
    });
  }

  const avg = (id: string) => {
    const m = moduleScores.find((x) => x.moduleId === id);
    return m && m.average !== null ? m.average : 1;
  };

  // Mbase = (2xM2 + 2xM3 + 1.5xM4 + 1.5xM5 + M6 + M7) / 9
  const mbase =
    (2 * avg('m2') + 2 * avg('m3') + 1.5 * avg('m4') + 1.5 * avg('m5') + avg('m6') + avg('m7')) / 9;

  // Riskbase = ((Mbase - 1) / 4) x 100
  const riskBase = ((mbase - 1) / 4) * 100;

  const supplierType = SUPPLIER_TYPES.find((t) => t.id === input.supplierTypeId);
  const kt = supplierType ? supplierType.kt : 1;

  const evidenceLevel = EVIDENCE_LEVELS.find((e) => e.id === input.evidenceLevelId);
  const confidence = evidenceLevel ? evidenceLevel.confidence : 0;
  const evidenceAge = EVIDENCE_AGES.find((a) => a.id === input.evidenceAgeId);
  const ageFactor = evidenceAge ? evidenceAge.factor : 1;

  // « Si le choix est pas de preuves : confiance effective = 0 »
  const effectiveConfidence = confidence === 0 ? 0 : confidence * ageFactor;
  const malusConfiance = ALPHA * (1 - effectiveConfidence);

  const scoreUncapped = riskBase * kt + malusConfiance;
  let scoreFinal = Math.min(100, scoreUncapped);

  // Regles eliminatoires sur les modules de coefficient 2.
  const eliminationRules: string[] = [];
  const heavyModules = MODULES.filter((m) => m.coefficient === 2);
  let fivesAcrossHeavy = 0;

  for (const module of heavyModules) {
    const scored = criteriaScores.filter((c) => c.moduleId === module.id && !c.na);
    const fives = scored.filter((c) => c.value === 5);
    fivesAcrossHeavy += fives.length;
    if (scored.length > 0 && fives.length === scored.length) {
      scoreFinal = Math.max(scoreFinal, 60);
      eliminationRules.push(
        `Tous les critères notés 5 sur le module ${module.number} (coefficient 2) : score plancher de 60 — classé High.`,
      );
    }
  }
  if (fivesAcrossHeavy >= 2) {
    scoreFinal = Math.max(scoreFinal, 80);
    eliminationRules.push(
      `${fivesAcrossHeavy} critères notés 5 sur les modules de coefficient 2 : score plancher de 80 — classé Very high.`,
    );
  }

  const level = levelFor(scoreFinal);

  return {
    modules: moduleScores,
    criteria: criteriaScores,
    mbase,
    riskBase,
    kt,
    supplierTypeLabel: supplierType ? supplierType.label : '',
    confidence,
    ageFactor,
    effectiveConfidence,
    malusConfiance,
    scoreUncapped,
    scoreFinal,
    level: level.id,
    levelLabel: level.label,
    levelDescription: level.description,
    eliminationRules,
  };
}

/**
 * Verifie qu'aucun critere n'est laisse sans reponse :
 * « ne peut pas passer au module suivant que s'il coche une reponse ».
 */
export function validateModule(
  moduleId: string,
  answers: Answers,
  justifications: Record<string, string>,
): string[] {
  const module = MODULES.find((m) => m.id === moduleId);
  if (!module) return [`Module inconnu : ${moduleId}`];
  const auto = autoNaCriteria(answers);
  const errors: string[] = [];

  for (const criterion of module.criteria) {
    if (auto.has(criterion.id)) continue;
    const value = answers[criterion.id];
    if (!value) {
      errors.push(`« ${criterion.label} » : une réponse est obligatoire.`);
      continue;
    }
    // N/A choisi manuellement : justification obligatoire.
    if (value === 6 && !(justifications[criterion.id] ?? '').trim()) {
      errors.push(`« ${criterion.label} » : le choix N/A doit être justifié.`);
    }
  }
  return errors;
}
