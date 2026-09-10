// « Plan d'action simplifie pour mitiger le risque selon les domaines les plus risques »
// Entierement derive des donnees existantes : le niveau atteint et le niveau cible
// sont des libelles du referentiel MAVERIC, aucune donnee exterieure n'est ajoutee.

import { CRITERIA_BY_ID } from './catalog.ts';
import type { CriterionScore, ScoreResult } from './scoring.ts';

export type PlanItem = {
  priority: 1 | 2 | 3;
  priorityLabel: string;
  moduleNumber: number;
  moduleTitle: string;
  coefficient: number;
  criterionId: string;
  criterion: string;
  currentValue: number;
  currentLabel: string;
  targetValue: number;
  targetLabel: string;
  weight: number;
};

const PRIORITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Priorité 1 — action immédiate',
  2: 'Priorité 2 — à planifier',
  3: 'Priorité 3 — à surveiller',
};

function priorityFor(value: number, coefficient: number): 1 | 2 | 3 {
  if (value === 5) return coefficient >= 1.5 ? 1 : 2;
  if (value === 4) return coefficient >= 2 ? 1 : 2;
  return 3;
}

export function buildActionPlan(score: ScoreResult): PlanItem[] {
  const items: PlanItem[] = [];

  for (const criterion of score.criteria) {
    if (criterion.na || criterion.value < 3) continue;
    const entry = CRITERIA_BY_ID.get(criterion.criterionId);
    if (!entry) continue;

    // Cible : le palier immediatement meilleur du referentiel, ou le palier 1 si le critere est au maximum.
    const targetValue = criterion.value >= 4 ? criterion.value - 2 : 1;
    const target = entry.criterion.options.find((o) => o.value === Math.max(1, targetValue));

    items.push({
      priority: priorityFor(criterion.value, criterion.coefficient),
      priorityLabel: PRIORITY_LABELS[priorityFor(criterion.value, criterion.coefficient)],
      moduleNumber: criterion.moduleNumber,
      moduleTitle: criterion.moduleTitle,
      coefficient: criterion.coefficient,
      criterionId: criterion.criterionId,
      criterion: criterion.label,
      currentValue: criterion.value,
      currentLabel: criterion.optionLabel,
      targetValue: Math.max(1, targetValue),
      targetLabel: target ? target.label : '',
      weight: criterion.value * criterion.coefficient,
    });
  }

  return items.sort((a, b) => b.weight - a.weight || a.moduleNumber - b.moduleNumber);
}

/** Modules ordonnes du plus risque au moins risque (pour la visualisation et le plan). */
export function riskiestModules(score: ScoreResult) {
  return score.modules
    .filter((m) => m.average !== null)
    .map((m) => ({ ...m, weighted: (m.average as number) * m.coefficient }))
    .sort((a, b) => b.weighted - a.weighted);
}

export function criteriaAtRisk(criteria: CriterionScore[]) {
  return criteria.filter((c) => !c.na && c.value >= 4);
}
