// Module 8 — « Analyse de tableau de bord avec l'IA selon les donnees existantes seulement ».
// Le prompt ne contient que les donnees enregistrees dans MAVERIC ; le modele a interdiction
// d'introduire des informations exterieures. Sans cle API, une analyse deterministe est produite.

import type { ScoreResult } from './scoring.ts';
import { buildActionPlan, criteriaAtRisk, riskiestModules } from './plan.ts';

const MODEL = process.env.MAVERIC_AI_MODEL ?? 'claude-sonnet-5';

const SYSTEM_PROMPT = `Tu es l'assistant d'analyse de MAVERIC, un outil d'evaluation du risque fournisseur.
Regles absolues :
- Tu n'utilises QUE les donnees fournies dans le message. Aucune connaissance exterieure, aucune hypothese sur le fournisseur, aucun chiffre invente.
- Si une information n'est pas dans les donnees, tu ecris explicitement qu'elle n'est pas disponible.
- Tu n'affiches jamais les formules de calcul ni les etapes intermediaires du score.
- Tu ecris en francais, dans un style factuel de rapport de risque, sans emphase commerciale.
Format de reponse (markdown, sans titre de niveau 1) :
## Lecture d'ensemble
2 a 4 phrases sur le niveau de risque global et ce qui le porte.
## Domaines les plus risques
Liste a puces des modules et criteres les plus degrades, avec la note constatee.
## Points de vigilance
Liste a puces : criteres N/A, qualite des preuves, regles eliminatoires declenchees le cas echeant.
## Plan d'action simplifie
Liste numerotee de 3 a 6 actions, chacune reliee a un critere evalue et a la cible du referentiel.`;

function buildDataset(assessment: Record<string, unknown>, score: ScoreResult) {
  const plan = buildActionPlan(score);
  return {
    fournisseur: {
      nom: assessment.supplier_name,
      type: score.supplierTypeLabel,
      service_fourni: assessment.service_fourni,
      recours_sous_traitance: assessment.sous_traitance,
      nombre_sous_traitants_avec_acces: assessment.sous_traitants_count,
      adresse: assessment.adresse,
      vis_a_vis: assessment.vis_a_vis,
    },
    score: {
      score_final_sur_100: Number(score.scoreFinal.toFixed(2)),
      score_non_plafonne: Number(score.scoreUncapped.toFixed(2)),
      niveau: `${score.levelLabel} — ${score.levelDescription}`,
      regles_eliminatoires_declenchees: score.eliminationRules,
    },
    qualite_des_preuves: {
      confiance_effective: Number(score.effectiveConfidence.toFixed(2)),
    },
    modules: score.modules.map((m) => ({
      numero: m.number,
      module: m.title,
      coefficient: m.coefficient,
      moyenne: m.average === null ? null : Number(m.average.toFixed(2)),
      criteres_notes: m.counted,
      criteres_na: m.excluded,
    })),
    criteres: score.criteria.map((c) => ({
      module: c.moduleTitle,
      critere: c.label,
      note: c.na ? 'N/A' : c.value,
      reponse: c.optionLabel || 'N/A',
      justification_na: c.justification,
    })),
    criteres_les_plus_degrades: criteriaAtRisk(score.criteria).map((c) => ({
      module: c.moduleTitle,
      critere: c.label,
      note: c.value,
      reponse: c.optionLabel,
    })),
    plan_action_calcule: plan.slice(0, 8).map((p) => ({
      priorite: p.priorityLabel,
      module: p.moduleTitle,
      critere: p.criterion,
      constat: p.currentLabel,
      cible: p.targetLabel,
    })),
  };
}

/** Analyse deterministe, utilisee lorsque aucune cle API n'est configuree. */
function fallbackAnalysis(assessment: Record<string, unknown>, score: ScoreResult): string {
  const modules = riskiestModules(score);
  const plan = buildActionPlan(score);
  const na = score.criteria.filter((c) => c.na);

  const lines: string[] = [];
  lines.push("## Lecture d'ensemble");
  lines.push(
    `Le fournisseur **${assessment.supplier_name}** (${score.supplierTypeLabel}) obtient un score de risque de ` +
      `**${score.scoreFinal.toFixed(1)}/100**, soit le niveau **${score.levelLabel} — ${score.levelDescription}**. ` +
      `Le score non plafonné retenu pour l'ordonnancement des plans d'action est de ${score.scoreUncapped.toFixed(1)}. ` +
      `La confiance effective accordée aux informations est de ${(score.effectiveConfidence * 100).toFixed(0)} %.`,
  );

  lines.push('', '## Domaines les plus risqués');
  for (const m of modules.slice(0, 3)) {
    lines.push(
      `- **Module ${m.number} — ${m.title}** (coefficient ${m.coefficient}) : moyenne ${(m.average as number).toFixed(2)}/5 sur ${m.counted} critère(s) noté(s).`,
    );
  }
  for (const c of criteriaAtRisk(score.criteria).slice(0, 5)) {
    lines.push(`- ${c.label} — noté ${c.value}/5 : « ${c.optionLabel} »`);
  }

  lines.push('', '## Points de vigilance');
  if (score.eliminationRules.length > 0) {
    for (const rule of score.eliminationRules) lines.push(`- ${rule}`);
  }
  if (na.length > 0) {
    lines.push(`- ${na.length} critère(s) exclus du calcul (N/A) : ${na.map((c) => c.label).join(' ; ')}.`);
  }
  if (score.effectiveConfidence < 1) {
    lines.push(
      `- La qualité des preuves dégrade le score : un malus de confiance de ${score.malusConfiance.toFixed(1)} point(s) est appliqué.`,
    );
  }
  if (na.length === 0 && score.eliminationRules.length === 0 && score.effectiveConfidence === 1) {
    lines.push('- Aucun point de vigilance particulier : dossier complet et preuves vérifiées.');
  }

  lines.push('', '## Plan d\'action simplifié');
  plan.slice(0, 6).forEach((p, i) => {
    lines.push(
      `${i + 1}. **${p.priorityLabel}** — Module ${p.moduleNumber} (${p.moduleTitle}), « ${p.criterion} ». ` +
        `Constat : ${p.currentLabel}. Cible : ${p.targetLabel}`,
    );
  });
  if (plan.length === 0) {
    lines.push("1. Aucun critère au-dessus du seuil d'alerte : maintenir la surveillance périodique.");
  }

  return lines.join('\n');
}

/** Analyse du tableau de bord consolide (portefeuille de fournisseurs). */
export async function analysePortfolio(dataset: Record<string, unknown>): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: fallbackPortfolio(dataset), model: 'moteur-deterministe' };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            "Voici le tableau de bord consolide MAVERIC (tous fournisseurs evalues). " +
            "Produis l'analyse du portefeuille en te limitant strictement a ces donnees.\n\n" +
            '```json\n' +
            JSON.stringify(dataset, null, 2) +
            '\n```',
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Appel API Claude en echec (${response.status}) : ${detail.slice(0, 400)}`);
  }

  const payload = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const text = payload.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  return { text: text || fallbackPortfolio(dataset), model: MODEL };
}

function fallbackPortfolio(dataset: Record<string, unknown>): string {
  const suppliers = (dataset.fournisseurs ?? []) as Array<Record<string, any>>;
  const modules = (dataset.modules ?? []) as Array<Record<string, any>>;
  const hotspots = (dataset.criteres_les_plus_degrades ?? []) as Array<Record<string, any>>;
  const atRisk = suppliers.filter((s) => ['high', 'very_high', 'critical'].includes(String(s.niveau_id)));

  const lines: string[] = [];
  lines.push("## Lecture d'ensemble");
  lines.push(
    `${suppliers.length} fournisseur(s) évalué(s), pour un score de risque moyen de ` +
      `${Number(dataset.score_moyen ?? 0).toFixed(1)}/100. ` +
      `${atRisk.length} fournisseur(s) atteignent le niveau High ou supérieur et appellent un plan d'action.`,
  );

  lines.push('', '## Domaines les plus risqués');
  for (const m of [...modules].sort((a, b) => Number(b.moyenne ?? 0) - Number(a.moyenne ?? 0)).slice(0, 3)) {
    lines.push(
      `- **Module ${m.numero} — ${m.module}** (coefficient ${m.coefficient}) : moyenne portefeuille ${Number(
        m.moyenne ?? 0,
      ).toFixed(2)}/5.`,
    );
  }
  for (const h of hotspots.slice(0, 4)) {
    lines.push(`- ${h.critere} — moyenne ${Number(h.moyenne).toFixed(2)}/5 sur ${h.evaluations} évaluation(s).`);
  }

  lines.push('', '## Points de vigilance');
  for (const s of atRisk.slice(0, 5)) {
    lines.push(
      `- **${s.fournisseur}** (${s.type}) : ${Number(s.score_final).toFixed(1)}/100 — ${s.niveau}, score non plafonné ${Number(
        s.score_non_plafonne,
      ).toFixed(1)}.`,
    );
  }
  if (atRisk.length === 0) lines.push('- Aucun fournisseur au-dessus du seuil High.');

  lines.push('', "## Plan d'action simplifié");
  atRisk.slice(0, 5).forEach((s, index) => {
    lines.push(
      `${index + 1}. **${s.fournisseur}** — niveau ${s.niveau} : ouvrir le plan d'action sur les modules les plus dégradés de cette évaluation.`,
    );
  });
  if (atRisk.length === 0) {
    lines.push('1. Maintenir la surveillance périodique du portefeuille ; aucun plan correctif prioritaire.');
  }

  return lines.join('\n');
}

export async function analyseAssessment(
  assessment: Record<string, unknown>,
  score: ScoreResult,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { text: fallbackAnalysis(assessment, score), model: 'moteur-deterministe' };
  }

  const dataset = buildDataset(assessment, score);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            "Voici l'integralite des donnees enregistrees pour cette evaluation MAVERIC. " +
            "Produis l'analyse du tableau de bord en te limitant strictement a ces donnees.\n\n" +
            '```json\n' +
            JSON.stringify(dataset, null, 2) +
            '\n```',
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Appel API Claude en echec (${response.status}) : ${detail.slice(0, 400)}`);
  }

  const payload = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const text = payload.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  return { text: text || fallbackAnalysis(assessment, score), model: MODEL };
}
