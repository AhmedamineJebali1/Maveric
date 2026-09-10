import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEVEL_COLORS, api, formatDate, ratingColor, scoreColor } from '../api.ts';
import type { DashboardPayload } from '../api.ts';
import { Card, LevelBadge, Markdown } from '../components/ui.tsx';

const LEVEL_LABELS: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
  critical: 'Critical',
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [ai, setAi] = useState<{ text: string; generatedAt: string; model: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api.dashboard().then(setData);
  }, []);

  const runAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      setAi(await api.dashboardAi());
    } catch (error) {
      setAiError((error as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  if (!data) return <div className="loading">Chargement du tableau de bord…</div>;

  // Les URL Power BI suivent l'hôte réel : le poste de travail doit atteindre le serveur MAVERIC.
  const exportBase = `${window.location.origin}/api/export`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <p>Classement des fournisseurs évalués et exposition par module.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a className="btn btn--ghost" href="/api/export/fournisseurs.csv">
            Export fournisseurs
          </a>
          <a className="btn btn--ghost" href="/api/export/modules.csv">
            Export modules
          </a>
          <a className="btn btn--ghost" href="/api/export/criteres.csv">
            Export critères
          </a>
        </div>
      </div>

      {data.suppliers.length === 0 ? (
        <Card>
          <div className="empty">
            <img src="/maveric-logo.png" alt="" />
            <p>Aucune évaluation clôturée. Complétez un questionnaire pour alimenter le tableau de bord.</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid--3">
            <div className="card stat">
              <div className="stat__label">Fournisseurs évalués</div>
              <div className="stat__value">{data.totals.assessments}</div>
              <div className="stat__sub">évaluations clôturées</div>
            </div>
            <div className="card stat">
              <div className="stat__label">Score moyen</div>
              <div
                className="stat__value"
                style={{ color: data.totals.averageScore ? scoreColor(data.totals.averageScore) : undefined }}
              >
                {data.totals.averageScore ? data.totals.averageScore.toFixed(1) : '—'}
              </div>
              <div className="stat__sub">sur 100 — plus haut = plus risqué</div>
            </div>
            <div className="card stat">
              <div className="stat__label">Fournisseurs à traiter</div>
              <div className="stat__value" style={{ color: '#a01128' }}>
                {data.suppliers.filter((s) => ['high', 'very_high', 'critical'].includes(s.level ?? '')).length}
              </div>
              <div className="stat__sub">niveau High ou supérieur</div>
            </div>
          </div>

          <div className="grid grid--2" style={{ marginTop: 18 }}>
            <Card title="Répartition par niveau de risque">
              {data.byLevel.map((level) => {
                const share = data.totals.assessments ? (level.count / data.totals.assessments) * 100 : 0;
                return (
                  <div className="bar-row" key={level.id}>
                    <div>
                      <div className="bar-row__label">
                        {level.label}
                        <small>{level.description}</small>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${share}%`, background: LEVEL_COLORS[level.id] }} />
                      </div>
                    </div>
                    <div className="mono-num" style={{ textAlign: 'right' }}>
                      {level.count}
                    </div>
                  </div>
                );
              })}
            </Card>

            <Card title="Exposition par module" subtitle="Moyenne du portefeuille, de 1 à 5.">
              {data.byModule.map((module) => (
                <div className="bar-row" key={module.moduleId}>
                  <div>
                    <div className="bar-row__label">
                      {module.number}. {module.title}
                      <small>
                        Coefficient {module.coefficient} · pire note observée{' '}
                        {module.worst ? module.worst.toFixed(2) : '—'}
                      </small>
                    </div>
                    <div className="bar">
                      <span
                        style={{
                          width: module.average ? `${((module.average - 1) / 4) * 100}%` : '0%',
                          background: module.average ? ratingColor(module.average) : 'transparent',
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className="mono-num"
                    style={{ textAlign: 'right', color: module.average ? ratingColor(module.average) : undefined }}
                  >
                    {module.average ? module.average.toFixed(2) : '—'}
                  </div>
                </div>
              ))}
            </Card>
          </div>

          <div style={{ marginTop: 18 }}>
            <Card
              title="Classement des fournisseurs"
              subtitle="Ordonné par score final, puis par score non plafonné pour départager les fournisseurs plafonnés à 100."
              bodyClass=""
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fournisseur</th>
                      <th>Type</th>
                      <th>Clôturée le</th>
                      <th style={{ width: 220 }}>Score</th>
                      <th style={{ textAlign: 'right' }}>Non plafonné</th>
                      <th>Niveau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppliers.map((supplier, index) => (
                      <tr
                        key={supplier.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/evaluations/${supplier.id}/resultat`)}
                      >
                        <td className="muted mono-num">{index + 1}</td>
                        <td style={{ fontWeight: 650 }}>{supplier.supplier_name}</td>
                        <td className="tiny muted">{supplier.supplier_type_label}</td>
                        <td className="tiny muted">{formatDate(supplier.completed_at)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="bar" style={{ flex: 1, marginTop: 0 }}>
                              <span
                                style={{
                                  width: `${supplier.score_final ?? 0}%`,
                                  background: scoreColor(supplier.score_final ?? 0),
                                }}
                              />
                            </div>
                            <span
                              className="mono-num"
                              style={{ color: scoreColor(supplier.score_final ?? 0), width: 42 }}
                            >
                              {supplier.score_final?.toFixed(1)}
                            </span>
                          </div>
                        </td>
                        <td className="mono-num muted" style={{ textAlign: 'right' }}>
                          {supplier.score_uncapped?.toFixed(1)}
                        </td>
                        <td>
                          <LevelBadge
                            level={supplier.level}
                            label={supplier.level ? LEVEL_LABELS[supplier.level] : undefined}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid grid--2" style={{ marginTop: 18 }}>
            <Card title="Critères les plus dégradés du portefeuille">
              {data.criteriaHotspots.map((hotspot) => (
                <div className="bar-row" key={hotspot.criterionId}>
                  <div>
                    <div className="bar-row__label">
                      {hotspot.label}
                      <small>
                        {hotspot.moduleTitle} · {hotspot.count} évaluation(s)
                      </small>
                    </div>
                    <div className="bar">
                      <span
                        style={{
                          width: `${((hotspot.average - 1) / 4) * 100}%`,
                          background: ratingColor(hotspot.average),
                        }}
                      />
                    </div>
                  </div>
                  <div className="mono-num" style={{ textAlign: 'right', color: ratingColor(hotspot.average) }}>
                    {hotspot.average.toFixed(2)}
                  </div>
                </div>
              ))}
            </Card>

            <Card
              title="Analyse IA du tableau de bord"
              subtitle="Lecture du portefeuille à partir des seules données enregistrées."
              actions={
                <button className="btn btn--primary" disabled={aiLoading} onClick={() => void runAi()}>
                  {aiLoading ? 'Analyse en cours…' : ai ? 'Régénérer' : "Générer l'analyse"}
                </button>
              }
            >
              {aiError && <div className="alert alert--error">{aiError}</div>}
              {ai ? (
                <>
                  <Markdown text={ai.text} />
                  <p className="tiny muted" style={{ marginTop: 14 }}>
                    Généré le {formatDate(ai.generatedAt)} · moteur : {ai.model}
                  </p>
                </>
              ) : (
                <p className="muted">
                  Lancez l'analyse pour obtenir la lecture du portefeuille, les concentrations de risque et les
                  priorités d'action.
                </p>
              )}
            </Card>
          </div>

          <div className="alert alert--info" style={{ marginTop: 18 }}>
            <strong>Connexion Power BI.</strong> Dans Power BI Desktop : <em>Obtenir les données → Web</em>, puis
            l'une des URL <code>{exportBase}/fournisseurs.csv</code>, <code>{exportBase}/modules.csv</code>,{' '}
            <code>{exportBase}/criteres.csv</code>. Les trois flux se relient par <code>assessment_id</code> pour
            construire les tableaux de bord par fournisseur et par module.
          </div>
        </>
      )}
    </>
  );
}
