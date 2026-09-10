import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatDate, scoreColor } from '../api.ts';
import type { AssessmentRow } from '../api.ts';
import { Card, LevelBadge } from '../components/ui.tsx';

const LEVEL_LABELS: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
  critical: 'Critical',
};

export default function Assessments() {
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const navigate = useNavigate();

  const load = () => api.list().then(setRows);
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const { id } = await api.create();
    navigate(`/evaluations/${id}`);
  };

  const remove = async (row: AssessmentRow) => {
    if (!confirm(`Supprimer l'évaluation « ${row.supplier_name || 'sans nom'} » ?`)) return;
    await api.remove(row.id);
    await load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Évaluations fournisseurs</h1>
          <p>Bulletin de notes MAVERIC : 6 modules notés, score de risque sur 100.</p>
        </div>
        <button className="btn btn--primary" onClick={create}>
          Nouvelle évaluation
        </button>
      </div>

      <Card bodyClass="">
        {rows === null ? (
          <div className="loading">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <img src="/maveric-logo.png" alt="" />
            <p>Aucune évaluation enregistrée. Lancez la première évaluation fournisseur.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th>Type</th>
                  <th>Service fourni</th>
                  <th>Créée le</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                  <th>Niveau</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      navigate(
                        row.status === 'completed' ? `/evaluations/${row.id}/resultat` : `/evaluations/${row.id}`,
                      )
                    }
                  >
                    <td style={{ fontWeight: 650 }}>{row.supplier_name || <span className="muted">Sans nom</span>}</td>
                    <td className="tiny muted">{row.supplier_type_label ?? '—'}</td>
                    <td className="tiny muted">{row.service_fourni || '—'}</td>
                    <td className="tiny muted">{formatDate(row.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {row.score_final === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="mono-num" style={{ color: scoreColor(row.score_final), fontSize: 15 }}>
                          {row.score_final.toFixed(1)}
                        </span>
                      )}
                    </td>
                    <td>
                      <LevelBadge level={row.level} label={row.level ? LEVEL_LABELS[row.level] : undefined} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn--subtle"
                        onClick={(event) => {
                          event.stopPropagation();
                          void remove(row);
                        }}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
