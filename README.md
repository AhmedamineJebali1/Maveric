# MAVERIC — Évaluation du risque fournisseur

Outil de notation du risque fournisseur : 6 modules notés de 1 à 5, pondérés, agrégés en un
score de risque sur 100 (**plus la note est haute, plus le risque est élevé**).

## Démarrage

Prérequis : **Node.js 24 LTS ou plus récent** — le serveur exécute le TypeScript sans compilation et
utilise `node:sqlite`, deux fonctionnalités actives sans option de lancement à partir de Node 24
(également disponibles sur Node 22.18+). Vérifié sur Node 25.9.
Aucun autre prérequis : pas de base de données à installer, pas de compilateur, aucun module natif.

```bash
npm install          # une seule fois, à la racine
npm run dev          # API sur :4000, interface sur :5173
```

Interface : http://localhost:5173

Mode « un seul processus » (l'API sert l'interface compilée) :

```bash
npm run build
npm start            # tout sur http://localhost:4000
```

### Analyse IA

Sans configuration, l'analyse est produite par un moteur déterministe local.
Pour utiliser Claude :

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
npm start
```

Modèle par défaut : `claude-sonnet-5` (variable `MAVERIC_AI_MODEL` pour en changer).
Le prompt système interdit toute information extérieure : l'analyse ne porte que sur les
données enregistrées dans l'évaluation.

## Déploiement sur un autre poste

1. Installer Node.js 24 LTS (ou plus récent) : https://nodejs.org
2. Copier le dossier `maveric/` (sans `node_modules/`).
3. Dans le dossier copié :

```bash
npm install
npm run build
npm start
```

L'application est alors disponible sur http://localhost:4000 — interface et API sur le même
port, donc rien à configurer côté réseau.

**Poste sans connexion internet :** copier également `node_modules/` (racine, `server/` et `web/`)
depuis un poste déjà installé, et sauter `npm install`. Pour éviter aussi l'étape `npm run build`,
copier le dossier `web/dist/` déjà compilé : `npm start` seul suffit alors.

**Partager l'outil sur le réseau local :** le serveur écoute sur toutes les interfaces. Les autres
postes accèdent à `http://<adresse-ip-du-serveur>:4000` après ouverture du port 4000 dans le
pare-feu Windows :

```powershell
New-NetFirewallRule -DisplayName "MAVERIC" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
```

⚠️ L'outil ne comporte pas d'authentification : toute personne atteignant le serveur peut consulter
et modifier les évaluations. À réserver à un réseau de confiance, ou à faire précéder d'une brique
d'authentification avant une mise à disposition plus large.

**Reprendre les données existantes :** copier `server/data/maveric.db` et le contenu de
`server/uploads/`. Le chemin de la base peut être déplacé avec la variable `MAVERIC_DB`, et le port
avec `PORT`.

## Architecture

```
maveric/
  server/                 API Node/Express en TypeScript natif, base SQLite
    src/catalog.ts        référentiel : modules, critères, options, coefficients, règles N/A
    src/scoring.ts        moteur de calcul (moyennes, Mbase, malus, Kt, règles éliminatoires)
    src/plan.ts           plan d'action simplifié dérivé des notes
    src/ai.ts             analyse IA (Claude ou moteur déterministe)
    src/db.ts             schéma SQLite + vues de restitution Power BI
    data/maveric.db       base de données
    uploads/              pièces jointes
  web/                    interface React (Vite)
```

Les calculs ne sont **jamais** exécutés côté navigateur : le client envoie les réponses, le
serveur renvoie les résultats. Aucune formule intermédiaire n'est exposée dans l'interface.

## Parcours

1. **Module 1 — Présentation du fournisseur** (non noté) : nom, type, service fourni, recours à
   la sous-traitance (et nombre de sous-traitants ayant accès au SI ou aux données), adresse,
   vis-à-vis.
2. **Modules 2 à 7** : un niveau de risque par critère. Le module suivant reste verrouillé tant
   que tous les critères ne sont pas renseignés.
3. **Informations complémentaires** : pièces jointes de tout type, puis niveau de preuve et âge
   de preuve (ce dernier tableau n'apparaît pas si « Pas de preuve » est choisi).
4. **Résultat** : score final, score non plafonné, niveau, risque par module, plan d'action,
   analyse IA, détail des réponses.

### Règles appliquées

| Règle | Comportement |
|---|---|
| N/A (6ᵉ choix) | Exclu du numérateur **et** du dénominateur de la moyenne du module |
| N/A choisi manuellement | Une fenêtre de justification s'ouvre ; la justification est obligatoire |
| Module 5 | Si « Nombre et gravité des non-conformités » = 1, le plan d'action bascule en N/A sans justification à saisir |
| Module 6 | Si le nombre d'incidents = 0, les trois critères suivants basculent en N/A |
| Coefficient 2, tous les critères à 5 | Score plancher de 60 (High) |
| Coefficient 2, deux critères à 5 | Score plancher de 80 (Very high) |

### Pondérations et seuils

| Module | Coefficient | | Type de fournisseur | Kt |
|---|---|---|---|---|
| 2 — Sécurité de l'information | 2 | | FRS à faible impact | 0,75 |
| 3 — Continuité d'activité | 2 | | FRS métier | 1 |
| 4 — Protection des données | 1,5 | | FRS informatique | 1,25 |
| 5 — Conformité réglementaire | 1,5 | | FRS IT critique, cloud, hébergement | 1,5 |
| 6 — Suivi des incidents | 1 | | | |
| 7 — Organisation et gouvernance | 1 | | | |

Niveau de preuve → confiance : 1 / 0,75 / 0,5 / 0,25 / 0.
Âge de preuve → facteur : 1 / 0,75 / 0,5. Malus de confiance : α = 15.

| Score final | Niveau |
|---|---|
| 0–20 | Low — risque maîtrisé |
| > 20–40 | Moderate — surveillance normale |
| > 40–60 | High — plan d'action et surveillance renforcée |
| > 60–80 | Very high — mesures correctives importantes |
| > 80–100 | Critical — réévaluation et blocage potentiel |

## Module 8 — Power BI

Trois flux sont exposés, reliés entre eux par `assessment_id` :

| Flux | URL | Granularité |
|---|---|---|
| Fournisseurs | `http://localhost:4000/api/export/fournisseurs.csv` | 1 ligne par évaluation |
| Modules | `http://localhost:4000/api/export/modules.csv` | 1 ligne par module et par évaluation |
| Critères | `http://localhost:4000/api/export/criteres.csv` | 1 ligne par critère et par évaluation |

Les mêmes flux sont disponibles en JSON (`.json` au lieu de `.csv`).

**Connexion depuis Power BI Desktop :** `Obtenir les données → Web`, coller l'URL, répéter pour
les trois flux, puis dans `Modèle` relier `fournisseurs[assessment_id]` (1) à
`modules[assessment_id]` (∗) et à `criteres[assessment_id]` (∗). Les CSV sont encodés en UTF-8
avec BOM et séparateur `;`.

Visuels correspondant au besoin : classement des fournisseurs par score final, matrice
fournisseur × module sur `moyenne_module`, répartition par `niveau_risque`, détail des critères
notés 4 et 5.

La base SQLite `server/data/maveric.db` expose également les vues `v_fournisseur`, `v_module` et
`v_critere` pour une connexion directe via un pilote ODBC SQLite.
