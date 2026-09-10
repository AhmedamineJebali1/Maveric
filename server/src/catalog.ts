// Catalogue MAVERIC — transcription stricte du document « MAVERIC TOOL.docx ».
// Chaque critere propose 5 niveaux de risque (1 = meilleur, 5 = pire).
// Un 6eme choix « N/A » n'existe que sur les criteres ou le document le prevoit.

export type Option = { value: number; label: string; na?: boolean };

export type Criterion = {
  id: string;
  label: string;
  options: Option[];
};

export type Module = {
  id: string;
  number: number;
  title: string;
  coefficient: number;
  criteria: Criterion[];
};

/** Regle « bascule automatique en N/A » decrite dans les modules 5 et 6. */
export type AutoNaRule = {
  when: { criterionId: string; equals: number };
  apply: string[];
  note: string;
};

const NA: Option = { value: 6, label: 'N/A', na: true };

export const SUPPLIER_TYPES = [
  { id: 'faible_impact', label: 'FRS à faible impact', kt: 0.75 },
  { id: 'metier', label: 'FRS métier', kt: 1 },
  { id: 'informatique', label: 'FRS informatique', kt: 1.25 },
  { id: 'it_critique', label: 'FRS IT critique, cloud, hébergement', kt: 1.5 },
] as const;

export const EVIDENCE_LEVELS = [
  { id: 'verifie', label: 'Documents vérifiés / certification valide / audit récent', confidence: 1 },
  { id: 'partiel', label: 'Preuves documentaires disponibles mais partiellement vérifiées', confidence: 0.75 },
  { id: 'declare', label: 'Informations déclarées par le fournisseur', confidence: 0.5 },
  { id: 'ancien', label: 'Informations anciennes ou incomplètes', confidence: 0.25 },
  { id: 'aucune', label: 'Pas de preuve', confidence: 0 },
] as const;

export const EVIDENCE_AGES = [
  { id: 'moins_12', label: '< 12 mois', factor: 1 },
  { id: '12_24', label: 'Entre 12 et 24 mois', factor: 0.75 },
  { id: 'plus_24', label: '> 24 mois', factor: 0.5 },
] as const;

export const RISK_LEVELS = [
  { id: 'low', label: 'Low', description: 'Risque maîtrisé', min: 0, max: 20 },
  { id: 'moderate', label: 'Moderate', description: 'Surveillance normale', min: 20, max: 40 },
  { id: 'high', label: 'High', description: "Plan d'action et surveillance renforcée", min: 40, max: 60 },
  { id: 'very_high', label: 'Very high', description: 'Mesures correctives importantes', min: 60, max: 80 },
  { id: 'critical', label: 'Critical', description: 'Réévaluation et blocage potentiel', min: 80, max: 100 },
] as const;

/** Coefficient alpha du malus de confiance. */
export const ALPHA = 15;

export const MODULES: Module[] = [
  {
    id: 'm2',
    number: 2,
    title: "Sécurité de l'information",
    coefficient: 2,
    criteria: [
      {
        id: 'm2_politiques',
        label: 'Existence et maturité des politiques de sécurité',
        options: [
          { value: 1, label: "Politique formalisée, validée par la direction, revue < 12 mois et diffusée à l'ensemble du personnel concerné" },
          { value: 2, label: 'Politique formalisée et diffusée, dernière revue entre 12 et 24 mois' },
          { value: 3, label: 'Politique formalisée mais couverture partielle du périmètre, ou dernière revue > 24 mois' },
          { value: 4, label: 'Document informel ou non validé, diffusion non démontrée, pas de revue connue' },
          { value: 5, label: 'Aucune politique de sécurité formalisée' },
        ],
      },
      {
        id: 'm2_certification',
        label: "Certification sécurité (n'importe quel type) ou audit",
        options: [
          { value: 1, label: 'Certification sécurité reconnue (ISO 27001, SOC 2 Type II, PCI DSS, HDS…) en cours de validité et couvrant le périmètre du service fourni' },
          { value: 2, label: "Certification en cours d'obtention, ou valide mais ne couvrant qu'une partie du périmètre" },
          { value: 3, label: 'Aucune certification, mais audits de sécurité réguliers par un tiers, résultats satisfaisants' },
          { value: 4, label: 'Aucune certification, audits rares, internes uniquement, ou résultats mitigés' },
          { value: 5, label: "Aucune certification et aucun audit de sécurité, ou rapports d'audit très défavorables" },
        ],
      },
      {
        id: 'm2_mesures',
        label: 'Mesures techniques de sécurité en place (pare-feu, chiffrement, MFA, sauvegarde)',
        options: [
          { value: 1, label: '> 90 % des mesures exigées en place et opérationnelles' },
          { value: 2, label: '[75–90 %] des mesures exigées en place' },
          { value: 3, label: '[50–75 %[ des mesures exigées en place' },
          { value: 4, label: '[25–50 %[ des mesures exigées en place' },
          { value: 5, label: '< 25 % des mesures exigées en place' },
        ],
      },
    ],
  },
  {
    id: 'm3',
    number: 3,
    title: "Continuité d'activité",
    coefficient: 2,
    criteria: [
      {
        id: 'm3_pca_pra',
        label: 'Existence de PCA/PRA',
        options: [
          { value: 1, label: 'PCA et PRA formalisés, validés et couvrant le service fourni' },
          { value: 2, label: 'PCA et PRA formalisés mais partiellement validés ou périmètre incomplet' },
          { value: 3, label: 'Un seul des deux plans existe et est documenté' },
          { value: 4, label: 'Ébauche de plan non validée, non diffusée' },
          { value: 5, label: 'Aucun PCA ni PRA' },
        ],
      },
      {
        id: 'm3_sla',
        label: 'SLA',
        options: [
          { value: 1, label: 'SLA exigeants alignés avec les besoins métiers, pénalités prévues' },
          { value: 2, label: 'SLA corrects, pénalités limitées' },
          { value: 3, label: 'SLA moyens, sans pénalités claires' },
          { value: 4, label: 'SLA faibles ou peu engageants' },
          { value: 5, label: 'Aucun SLA formalisé' },
        ],
      },
      {
        id: 'm3_tests',
        label: 'Tests de continuité réalisés',
        options: [
          { value: 1, label: 'Tests annuels, résultats satisfaisants' },
          { value: 2, label: 'Tests tous les 2 ans, quelques écarts corrigés' },
          { value: 3, label: 'Tests occasionnels, suivi partiel des résultats' },
          { value: 4, label: 'Tests très rares, pas de suivi sérieux' },
          { value: 5, label: 'Jamais testé' },
        ],
      },
      {
        id: 'm3_sauvegarde',
        label: 'Sauvegarde',
        options: [
          { value: 1, label: 'Sauvegardes automatisées et complètes, copie hors site ou réplication, restaurations testées régulièrement' },
          { value: 2, label: 'Sauvegardes automatisées et externalisées, restaurations testées occasionnellement' },
          { value: 3, label: 'Sauvegardes régulières mais sans copie hors site, ou restaurations jamais testées' },
          { value: 4, label: 'Sauvegardes partielles, irrégulières ou non documentées' },
          { value: 5, label: 'Aucune sauvegarde' },
          NA,
        ],
      },
      {
        id: 'm3_rto_rpo',
        label: 'RTO/RPO',
        options: [
          { value: 1, label: 'RTO/RPO définis contractuellement, inférieurs aux besoins métiers du client, respectés lors des tests ou incidents réels' },
          { value: 2, label: 'RTO/RPO définis et conformes aux besoins, avec de rares dépassements' },
          { value: 3, label: 'RTO/RPO définis mais dépassements modérés et récurrents' },
          { value: 4, label: 'RTO/RPO définis mais dépassements fréquents avec impact métier' },
          { value: 5, label: 'RTO/RPO non définis, ou délais de rétablissement très supérieurs aux besoins' },
          NA,
        ],
      },
    ],
  },
  {
    id: 'm4',
    number: 4,
    title: 'Protection des données',
    coefficient: 1.5,
    criteria: [
      {
        id: 'm4_type_donnees',
        label: 'Type de données traitées',
        options: [
          { value: 1, label: 'Données publiques ou très peu sensibles' },
          { value: 2, label: 'Données internes non critiques' },
          { value: 3, label: 'Données personnelles non sensibles' },
          { value: 4, label: 'Données personnelles sensibles / données business' },
          { value: 5, label: 'Données très sensibles' },
        ],
      },
      {
        id: 'm4_conformite',
        label: 'Niveau de conformité (RGPD, loi locale)',
        options: [
          { value: 1, label: "Très bon niveau : peu ou pas de non-conformité + plans d'action suivis" },
          { value: 2, label: "Non-conformités mineures + plan d'action en cours" },
          { value: 3, label: 'Non-conformités modérées + plans pas totalement suivis' },
          { value: 4, label: 'Non-conformités importantes + suivi faible' },
          { value: 5, label: "Non-conformités majeures + absence de plan d'action" },
          NA,
        ],
      },
      {
        id: 'm4_clauses',
        label: 'Clauses contractuelles de protection des données',
        options: [
          { value: 1, label: 'Clauses complètes et conformes (finalités, durée, sécurité, sous-traitance, notification, restitution/suppression)' },
          { value: 2, label: 'Clauses présentes mais génériques, non adaptées aux risques du service' },
          { value: 3, label: 'Clauses présentes avec lacunes significatives sur au moins un point essentiel' },
          { value: 4, label: 'Clauses obsolètes, non conformes au cadre applicable, ou non signées' },
          { value: 5, label: 'Aucune clause spécifique de protection des données' },
          NA,
        ],
      },
    ],
  },
  {
    id: 'm5',
    number: 5,
    title: 'Conformité réglementaire',
    coefficient: 1.5,
    criteria: [
      {
        id: 'm5_liste_obligations',
        label: 'Liste des obligations réglementaires applicables au service fourni',
        options: [
          { value: 1, label: 'Liste complète, à jour (revue < 12 mois)' },
          { value: 2, label: 'Liste majoritairement à jour' },
          { value: 3, label: 'Liste partielle' },
          { value: 4, label: 'Connaissance informelle, peu documentée' },
          { value: 5, label: 'Aucune liste' },
        ],
      },
      {
        id: 'm5_audits',
        label: 'Audits de conformité réalisés',
        options: [
          { value: 1, label: 'Audits annuels par un tiers indépendant' },
          { value: 2, label: 'Audits par un tiers tous les 2–3 ans, ou audits internes annuels formalisés et suivis' },
          { value: 3, label: 'Audits internes occasionnels, sans périodicité définie' },
          { value: 4, label: 'Audits très rares et à périmètre limité' },
          { value: 5, label: 'Aucun audit de conformité' },
        ],
      },
      {
        id: 'm5_non_conformites',
        label: 'Nombre et gravité des non-conformités relevées',
        options: [
          { value: 1, label: 'Aucune ou très mineures' },
          { value: 2, label: 'Quelques non-conformités mineures' },
          { value: 3, label: 'Non-conformités modérées' },
          { value: 4, label: 'Non-conformités importantes' },
          { value: 5, label: 'Non-conformités majeures / critiques' },
        ],
      },
      {
        id: 'm5_plan_action',
        label: "Plan d'action sur les non-conformités",
        options: [
          { value: 1, label: 'Plans complets, suivis, délais respectés' },
          { value: 2, label: 'Plans existants, quelques retards' },
          { value: 3, label: 'Plans partiels, suivi irrégulier' },
          { value: 4, label: 'Plans peu formalisés, peu suivis' },
          { value: 5, label: 'Aucun plan' },
          NA,
        ],
      },
      {
        id: 'm5_sanction',
        label: 'Exposition au risque de sanction',
        options: [
          { value: 1, label: "Secteur peu régulé, aucun historique de sanction" },
          { value: 2, label: 'Secteur fortement régulé mais historique propre et veille active' },
          { value: 3, label: "Signaux d'alerte ou réclamations en cours" },
          { value: 4, label: 'Enquête ou contrôle en cours, risque significatif identifié' },
          { value: 5, label: 'Sanction prononcée récemment ou très probable' },
        ],
      },
    ],
  },
  {
    id: 'm6',
    number: 6,
    title: 'Suivi des incidents sur les 12 derniers mois',
    coefficient: 1,
    criteria: [
      {
        id: 'm6_nombre',
        label: 'Nombre des incidents déclarés ayant affecté le service fourni, sur les 12 derniers mois glissants',
        options: [
          { value: 1, label: '0 avec dispositif de détection et de notification documenté' },
          { value: 2, label: '1–2' },
          { value: 3, label: '3–5' },
          { value: 4, label: '6–10' },
          { value: 5, label: '> 10' },
        ],
      },
      {
        id: 'm6_gravite',
        label: 'Gravité des incidents',
        options: [
          { value: 1, label: 'Incidents mineurs, sans impact client' },
          { value: 2, label: 'Quelques incidents avec impact faible' },
          { value: 3, label: 'Au moins un incident avec impact modéré' },
          { value: 4, label: 'Incidents à impact important pour le client' },
          { value: 5, label: 'Incidents critiques (arrêt de service, atteinte image, légal…)' },
          NA,
        ],
      },
      {
        id: 'm6_delais',
        label: 'Délais de résolution',
        options: [
          { value: 1, label: 'Respect systématique des délais cibles (SLA contractuels)' },
          { value: 2, label: 'Légers dépassements occasionnels' },
          { value: 3, label: 'Dépassements réguliers mais maîtrisés' },
          { value: 4, label: 'Délais souvent très longs' },
          { value: 5, label: 'Incidents restant ouverts très longtemps / non résolus' },
          NA,
        ],
      },
      {
        id: 'm6_repetition',
        label: 'Répétition des mêmes incidents',
        options: [
          { value: 1, label: 'Aucune récidive (problèmes corrigés durablement)' },
          { value: 2, label: 'Une récurrence isolée, corrigée durablement' },
          { value: 3, label: 'Récurrence modérée' },
          { value: 4, label: 'Récurrence fréquente des mêmes incidents' },
          { value: 5, label: 'Récurrence très forte, pas de correction durable' },
          NA,
        ],
      },
    ],
  },
  {
    id: 'm7',
    number: 7,
    title: 'Organisation et gouvernance',
    coefficient: 1,
    criteria: [
      {
        id: 'm7_gouvernance',
        label: 'Structure de gouvernance (comités et rôles)',
        options: [
          { value: 1, label: 'Gouvernance claire, comités dédiés, décisions tracées' },
          { value: 2, label: 'Gouvernance en place, comités existants mais décisions non systématiquement tracées' },
          { value: 3, label: 'Gouvernance partielle, comités informels' },
          { value: 4, label: 'Gouvernance très limitée' },
          { value: 5, label: 'Aucune gouvernance identifiable' },
        ],
      },
      {
        id: 'm7_roles',
        label: 'Clarté des rôles et responsabilités',
        options: [
          { value: 1, label: 'RACI / document clair, partagé et appliqué' },
          { value: 2, label: 'Rôles définis, documentation correcte' },
          { value: 3, label: 'Rôles connus mais peu documentés' },
          { value: 4, label: 'Rôles flous, recouvrements fréquents' },
          { value: 5, label: 'Rôles non définis' },
        ],
      },
      {
        id: 'm7_frequence',
        label: 'Fréquence de réunion des comités et des revues',
        options: [
          { value: 1, label: 'Mensuel ou plus fréquent' },
          { value: 2, label: 'Trimestriel' },
          { value: 3, label: 'Semestriel' },
          { value: 4, label: 'Ponctuel, sans régularité' },
          { value: 5, label: 'Aucun comité / revue' },
        ],
      },
      {
        id: 'm7_procedures',
        label: 'Formalisation des procédures et des politiques internes',
        options: [
          { value: 1, label: 'Processus clés documentés, mis à jour, suivis par des indicateurs' },
          { value: 2, label: 'Processus documentés mais mises à jour irrégulières' },
          { value: 3, label: 'Processus partiellement documentés' },
          { value: 4, label: 'Processus peu formalisés' },
          { value: 5, label: 'Processus non formalisés' },
        ],
      },
      {
        id: 'm7_sous_traitants',
        label: 'Encadrement des sous-traitants (quatrièmes parties)',
        options: [
          { value: 1, label: "Sous-traitants critiques inventoriés, évalués avant contractualisation, encadrés contractuellement (clauses de sécurité et d'audit répercutées) et réévalués périodiquement" },
          { value: 2, label: 'Inventaire tenu et clauses répercutées, mais réévaluation irrégulière' },
          { value: 3, label: "Inventaire existant, encadrement contractuel partiel, pas d'évaluation formalisée" },
          { value: 4, label: 'Inventaire incomplet, aucune évaluation, clauses non répercutées' },
          { value: 5, label: 'Aucun recensement ni encadrement des sous-traitants' },
          NA,
        ],
      },
    ],
  },
];

// « si le nombre d'incidents = 0, les trois criteres suivants passent automatiquement en N/A »
// « Si le critere Nombre et gravite des non-conformites relevees vaut 1 (aucune non-conformite),
//   ce critere bascule automatiquement en N/A, sans justification a saisir. » -> applique au critere
//   dependant qui porte l'option N/A, c.-a-d. le plan d'action sur les non-conformites.
export const AUTO_NA_RULES: AutoNaRule[] = [
  {
    when: { criterionId: 'm5_non_conformites', equals: 1 },
    apply: ['m5_plan_action'],
    note: "Aucune non-conformité relevée : basculé automatiquement en N/A, sans justification à saisir.",
  },
  {
    when: { criterionId: 'm6_nombre', equals: 1 },
    apply: ['m6_gravite', 'm6_delais', 'm6_repetition'],
    note: "Aucun incident sur les 12 derniers mois : basculé automatiquement en N/A.",
  },
];

export const CRITERIA_BY_ID = new Map<string, { module: Module; criterion: Criterion }>();
for (const module of MODULES) {
  for (const criterion of module.criteria) {
    CRITERIA_BY_ID.set(criterion.id, { module, criterion });
  }
}

export function criterionHasNa(criterion: Criterion): boolean {
  return criterion.options.some((o) => o.na);
}

/** Criteres bascules en N/A automatiquement compte tenu des reponses deja saisies. */
export function autoNaCriteria(answers: Record<string, number>): Map<string, string> {
  const result = new Map<string, string>();
  for (const rule of AUTO_NA_RULES) {
    if (answers[rule.when.criterionId] === rule.when.equals) {
      for (const id of rule.apply) result.set(id, rule.note);
    }
  }
  return result;
}
