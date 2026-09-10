import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, formatSize, ratingColor, scoreColor } from '../api.ts';
import type { ResultPayload } from '../api.ts';
import { Card, Markdown } from '../components/ui.tsx';

const PRIORITY_COLORS: Record<number, string> = { 1: '#d8442c', 2: '#dd6b13', 3: '#b0870d' };

export default function Result() {
  const { id } = useParams();
  const assessmentId = Number(id);
  const navigate = useNavigate();
  const [data, setData] = useState<ResultPayload | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    void api.result(assessmentId).then(setData);
  }, [assessmentId]);

  const runAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const ai = await api.aiAnalysis(assessmentId);
      setData((prev) => (prev ? { ...prev, ai } : prev));
    } catch (error) {
      setAiError((error as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  if (!data) return <div className="loading">Chargement du résultat…</div>;

  const { assessment, score, plan } = data;
  const color = scoreColor(score.scoreFinal);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{assessment.supplier_name}</h1>
          <p>
            {assessment.supplier_type_label} · {assessment.service_fourni} · Évaluation clôturée le{' '}
            {formatDate(assessment.completed_at ?? assessment.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--ghost" onClick={() => navigate(`/evaluations/${assessmentId}`)}>
            Modifier les réponses
          </button>
          <button className="btn btn--ghost" onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>

      <div className="score-hero">
        <div className="score-hero__dial">
          <div className="score-hero__value">
            {score.scoreFinal.toFixed(1)}
            <span> / 100</span>
          </div>
          <div className="score-hero__level">
            {score.levelLabel} — {score.levelDescription}
          </div>
          <p className="tiny" style={{ opacity: 0.75 }}>
            Score non plafonné : {score.scoreUncapped.toFixed(1)}
            <br />
            (ordonnancement des plans d'action)
          </p>
        </div>
        <div className="score-hero__meta">
          <dl className="meta-grid">
            <div>
              <dt>Vis-à-vis</dt>
              <dd>{assessment.vis_a_vis}</dd>
            </div>
            <div>
              <dt>Adresse</dt>
              <dd>{assessment.adresse}</dd>
            </div>
            <div>
              <dt>Sous-traitance</dt>
              <dd>
                {assessment.sous_traitance === 'oui'
                  ? `Oui — ${assessment.sous_traitants_count} sous-traitant(s) avec accès`
                  : 'Non'}
              </dd>
            </div>
            <div>
              <dt>Niveau de preuve</dt>
              <dd>{assessment.evidence_level_label ?? '—'}</dd>
            </div>
            <div>
              <dt>Âge de preuve</dt>
              <dd>{assessment.evidence_age_label ?? 'Sans objet'}</dd>
            </div>
            <div>
              <dt>Pièces jointes</dt>
              <dd>{data.attachments.length}</dd>
            </div>
          </dl>
          <div>
            <div className="scale">
              <span style={{ background: '#12915a' }} />
              <span style={{ background: '#b0870d' }} />
              <span style={{ background: '#dd6b13' }} />
              <span style={{ background: '#d8442c' }} />
              <span style={{ background: '#a01128' }} />
            </div>
            <div
              className="tiny muted"
              style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}
            >
              <span>0 Low</span>
              <span>20</span>
              <span>40</span>
              <span>60</span>
              <span>80</span>
              <span>100 Critical</span>
            </div>
            <div style={{ position: 'relative', height: 16, marginTop: 2 }}>
              <div
                style={{
                  position: 'absolute',
                  left: `calc(${Math.min(100, score.scoreFinal)}% - 6px)`,
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: color,
                  border: '2px solid #fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {score.eliminationRules.length > 0 && (
        <div className="alert alert--warn" style={{ marginTop: 18 }}>
          <strong>Règles éliminatoires déclenchées</strong>
          <ul>
            {score.eliminationRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid--2" style={{ marginTop: 18 }}>
        <Card title="Risque par module" subtitle="Moyenne de 1 (maîtrisé) à 5 (critique).">
          {score.modules.map((module) => (
            <div className="bar-row" key={module.moduleId}>
              <div>
                <div className="bar-row__label">
                  {module.number}. {module.title}
                  <small>
                    Coefficient {module.coefficient} · {module.counted} critère(s) noté(s)
                    {module.excluded > 0 ? ` · ${module.excluded} N/A exclu(s)` : ''}
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
                {module.average ? `${module.average.toFixed(2)} / 5` : 'N/A'}
              </div>
            </div>
          ))}
        </Card>

        <Card
          title="Plan d'action simplifié"
          subtitle="Domaines les plus risqués, ordonnés par poids dans le score."
        >
          {plan.length === 0 ? (
            <p className="muted">
              Aucun critère au-dessus du seuil d'alerte. Maintenir la surveillance périodique.
            </p>
          ) : (
            plan.slice(0, 8).map((item, index) => (
              <div className="plan-item" key={item.criterionId}>
                <span className="plan-item__rank" style={{ background: PRIORITY_COLORS[item.priority] }}>
                  {index + 1}
                </span>
                <div className="plan-item__body">
                  <h4>{item.criterion}</h4>
                  <p>
                    Module {item.moduleNumber} — {item.moduleTitle} · noté {item.currentValue}/5
                    <br />
                    <em>Constat :</em> {item.currentLabel}
                    <br />
                    <span className="target">Cible : {item.targetLabel}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <Card
          title="Analyse IA du tableau de bord"
          subtitle="Produite à partir des seules données enregistrées dans cette évaluation."
          actions={
            <button className="btn btn--primary" disabled={aiLoading} onClick={() => void runAi()}>
              {aiLoading ? 'Analyse en cours…' : data.ai ? "Régénérer l'analyse" : "Générer l'analyse"}
            </button>
          }
        >
          {aiError && <div className="alert alert--error">{aiError}</div>}
          {data.ai ? (
            <>
              <Markdown text={data.ai.text} />
              <p className="tiny muted" style={{ marginTop: 14 }}>
                Généré le {formatDate(data.ai.generatedAt)} · moteur : {data.ai.model}
              </p>
            </>
          ) : (
            <p className="muted">
              Lancez l'analyse pour obtenir une lecture d'ensemble, les domaines les plus risqués et un plan
              d'action rédigé.
            </p>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <Card title="Détail des réponses" subtitle="Réponse retenue pour chaque critère évalué." bodyClass="">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Critère</th>
                  <th>Réponse retenue</th>
                  <th style={{ textAlign: 'center' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {score.criteria.map((criterion) => (
                  <tr key={criterion.criterionId}>
                    <td className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
                      {criterion.moduleNumber}. {criterion.moduleTitle}
                    </td>
                    <td style={{ fontWeight: 600 }}>{criterion.label}</td>
                    <td className="tiny">
                      {criterion.na ? (
                        <span className="muted">
                          N/A{criterion.justification ? ` — ${criterion.justification}` : ''}
                        </span>
                      ) : (
                        criterion.optionLabel
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {criterion.na ? (
                        <span className="badge badge--draft">N/A</span>
                      ) : (
                        <span
                          className="choice__rank"
                          style={{ background: ratingColor(criterion.value), margin: '0 auto' }}
                        >
                          {criterion.value}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {data.attachments.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card title="Preuves jointes">
            {data.attachments.map((file) => (
              <div className="file-row" key={file.id}>
                <span className="file-row__name">{file.filename}</span>
                <span className="tiny muted">{formatSize(file.size)}</span>
                <a className="btn btn--ghost tiny" href={`/api/attachments/${file.id}/download`}>
                  Télécharger
                </a>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}
