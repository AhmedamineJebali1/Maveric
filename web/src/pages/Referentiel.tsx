import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Catalog } from '../api.ts';
import { Card } from '../components/ui.tsx';

export default function Referentiel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    void api.catalog().then(setCatalog);
  }, []);

  if (!catalog) return <div className="loading">Chargement du référentiel…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Référentiel MAVERIC</h1>
          <p>Modules notés, coefficients et grille des niveaux de risque appliqués à chaque évaluation.</p>
        </div>
      </div>

      <Card title="Seuils de classement" subtitle="Score final en pourcentage.">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Score final</th>
                <th>Niveau</th>
                <th>Conduite à tenir</th>
              </tr>
            </thead>
            <tbody>
              {catalog.riskLevels.map((level) => (
                <tr key={level.id}>
                  <td className="mono-num">
                    {level.min === 0 ? '0' : `> ${level.min}`} – {level.max}
                  </td>
                  <td>
                    <span className={`badge badge--${level.id}`}>{level.label}</span>
                  </td>
                  <td className="muted">{level.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ marginTop: 18 }} className="grid">
        {catalog.modules.map((module) => (
          <Card
            key={module.id}
            title={`Module ${module.number} — ${module.title}`}
            subtitle={`${module.criteria.length} critère(s) évalué(s)`}
            actions={<span className="badge badge--coef">Coefficient {module.coefficient}</span>}
            bodyClass=""
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Critère à traiter</th>
                    <th>Niveaux de risque</th>
                  </tr>
                </thead>
                <tbody>
                  {module.criteria.map((criterion) => (
                    <tr key={criterion.id}>
                      <td style={{ fontWeight: 600, verticalAlign: 'top' }}>{criterion.label}</td>
                      <td>
                        {criterion.options.map((option) => (
                          <div
                            key={option.value}
                            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}
                          >
                            <span className={`choice__rank rank-${option.value}`}>
                              {option.na ? '—' : option.value}
                            </span>
                            <span className="tiny">{option.label}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <Card title="Règles automatiques">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {catalog.autoNaRules.map((rule) => (
              <li key={rule.when.criterionId} style={{ marginBottom: 6 }}>
                {rule.note}
              </li>
            ))}
            <li>Un critère marqué N/A est exclu du numérateur et du dénominateur de la moyenne du module.</li>
            <li>Un N/A choisi manuellement doit être justifié par écrit.</li>
            <li>
              Tous les critères notés 5 sur un module de coefficient 2 : score plancher de 60 (High). Deux critères
              notés 5 sur les modules de coefficient 2 : score plancher de 80 (Very high).
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
