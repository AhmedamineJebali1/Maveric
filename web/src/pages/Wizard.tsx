import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, formatSize } from '../api.ts';
import type { AssessmentDetail, Catalog, Criterion, Module } from '../api.ts';
import { Card, Errors, Modal } from '../components/ui.tsx';

type Step = { key: string; short: string; title: string; kind: 'supplier' | 'module' | 'evidence'; module?: Module };

export default function Wizard() {
  const { id } = useParams();
  const assessmentId = Number(id);
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Etat local de saisie
  const [supplier, setSupplier] = useState({
    supplier_name: '',
    supplier_type: '',
    service_fourni: '',
    sous_traitance: '',
    sous_traitants_count: '',
    adresse: '',
    vis_a_vis: '',
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [evidenceLevel, setEvidenceLevel] = useState('');
  const [evidenceAge, setEvidenceAge] = useState('');
  const [naModal, setNaModal] = useState<{ criterion: Criterion; draft: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const [cat, det] = await Promise.all([api.catalog(), api.detail(assessmentId)]);
      setCatalog(cat);
      applyDetail(det);
    })();
  }, [assessmentId]);

  const applyDetail = (det: AssessmentDetail) => {
    setDetail(det);
    setAnswers(det.answers);
    setJustifications(det.justifications);
    setSupplier({
      supplier_name: det.assessment.supplier_name ?? '',
      supplier_type: det.assessment.supplier_type ?? '',
      service_fourni: det.assessment.service_fourni ?? '',
      sous_traitance: det.assessment.sous_traitance ?? '',
      sous_traitants_count:
        det.assessment.sous_traitants_count === null ? '' : String(det.assessment.sous_traitants_count),
      adresse: det.assessment.adresse ?? '',
      vis_a_vis: det.assessment.vis_a_vis ?? '',
    });
    setEvidenceLevel(det.assessment.evidence_level ?? '');
    setEvidenceAge(det.assessment.evidence_age ?? '');
  };

  const steps: Step[] = useMemo(() => {
    if (!catalog) return [];
    return [
      { key: 'supplier', short: 'Fournisseur', title: 'Module 1 — Présentation du fournisseur', kind: 'supplier' },
      ...catalog.modules.map((module) => ({
        key: module.id,
        short: module.title,
        title: `Module ${module.number} — ${module.title}`,
        kind: 'module' as const,
        module,
      })),
      { key: 'evidence', short: 'Informations complémentaires', title: 'Informations complémentaires', kind: 'evidence' },
    ];
  }, [catalog]);

  // Bascules automatiques en N/A, evaluees en direct sur les reponses saisies.
  const autoNa = useMemo(() => {
    const map: Record<string, string> = {};
    for (const rule of catalog?.autoNaRules ?? []) {
      if (answers[rule.when.criterionId] === rule.when.equals) {
        for (const target of rule.apply) map[target] = rule.note;
      }
    }
    return map;
  }, [answers, catalog]);

  const stepDone = (index: number): boolean => {
    if (!detail || !catalog) return false;
    const step = steps[index];
    if (!step) return false;
    if (step.kind === 'supplier') return detail.progress.supplierDone;
    if (step.kind === 'module') return detail.progress.moduleDone[step.module!.id];
    return detail.progress.evidenceDone;
  };

  const unlocked = (index: number): boolean => {
    if (index === 0) return true;
    for (let i = 0; i < index; i += 1) if (!stepDone(i)) return false;
    return true;
  };

  const chooseAnswer = (criterion: Criterion, value: number) => {
    if (value === 6) {
      setNaModal({ criterion, draft: justifications[criterion.id] ?? '' });
      return;
    }
    setAnswers((prev) => ({ ...prev, [criterion.id]: value }));
    setJustifications((prev) => {
      const next = { ...prev };
      delete next[criterion.id];
      return next;
    });
  };

  const confirmNa = () => {
    if (!naModal || !naModal.draft.trim()) return;
    setAnswers((prev) => ({ ...prev, [naModal.criterion.id]: 6 }));
    setJustifications((prev) => ({ ...prev, [naModal.criterion.id]: naModal.draft.trim() }));
    setNaModal(null);
  };

  const goNext = async () => {
    const step = steps[stepIndex];
    setErrors([]);
    setSaving(true);
    try {
      if (step.kind === 'supplier') {
        await api.saveSupplier(assessmentId, {
          ...supplier,
          sous_traitants_count: supplier.sous_traitance === 'oui' ? supplier.sous_traitants_count : null,
        });
      } else if (step.kind === 'module') {
        const module = step.module!;
        const payload: Record<string, number> = {};
        for (const criterion of module.criteria) {
          if (answers[criterion.id]) payload[criterion.id] = answers[criterion.id];
        }
        await api.saveModule(assessmentId, module.id, { answers: payload, justifications });
      } else {
        const level = catalog!.evidenceLevels.find((e) => e.id === evidenceLevel);
        await api.saveEvidence(assessmentId, {
          evidence_level: evidenceLevel,
          evidence_age: level?.noEvidence ? null : evidenceAge,
        });
        await api.finalize(assessmentId);
        navigate(`/evaluations/${assessmentId}/resultat`);
        return;
      }
      applyDetail(await api.detail(assessmentId));
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setErrors(error instanceof ApiError ? error.errors : [(error as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { attachments } = await api.upload(assessmentId, files);
    setDetail((prev) => (prev ? { ...prev, attachments } : prev));
    if (fileInput.current) fileInput.current.value = '';
  };

  const deleteFile = async (attachmentId: number) => {
    const { attachments } = await api.removeAttachment(assessmentId, attachmentId);
    setDetail((prev) => (prev ? { ...prev, attachments } : prev));
  };

  if (!catalog || !detail) return <div className="loading">Chargement du questionnaire…</div>;

  const step = steps[stepIndex];
  const noEvidence = catalog.evidenceLevels.find((e) => e.id === evidenceLevel)?.noEvidence ?? false;
  const evidenceReady = Boolean(evidenceLevel) && (noEvidence || Boolean(evidenceAge));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{detail.assessment.supplier_name || 'Nouvelle évaluation'}</h1>
          <p>
            Chaque critère doit recevoir une réponse pour accéder au module suivant. Les résultats ne sont calculés
            qu'à la fin du questionnaire.
          </p>
        </div>
        <button className="btn btn--ghost" onClick={() => navigate('/evaluations')}>
          Retour à la liste
        </button>
      </div>

      <div className="stepper">
        {steps.map((item, index) => (
          <button
            key={item.key}
            className={[
              'step',
              index === stepIndex ? 'step--active' : '',
              stepDone(index) && index !== stepIndex ? 'step--done' : '',
              unlocked(index) ? '' : 'step--locked',
            ].join(' ')}
            disabled={!unlocked(index)}
            onClick={() => unlocked(index) && setStepIndex(index)}
          >
            <span className="step__num">{index === 0 ? 1 : item.module ? item.module.number : '★'}</span>
            {item.short}
          </button>
        ))}
      </div>

      <Errors errors={errors} />

      {step.kind === 'supplier' && (
        <Card
          title="Module 1 — Présentation du fournisseur"
          subtitle="Ce module n'est pas noté ; le type de fournisseur pondère le score final."
        >
          <div className="grid grid--2">
            <div className="field">
              <label htmlFor="nom">Nom du fournisseur</label>
              <input
                id="nom"
                value={supplier.supplier_name}
                onChange={(e) => setSupplier({ ...supplier, supplier_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="service">Service fourni</label>
              <input
                id="service"
                value={supplier.service_fourni}
                onChange={(e) => setSupplier({ ...supplier, service_fourni: e.target.value })}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 20 }}>
            <label>Type du fournisseur</label>
            <div className="choices">
              {catalog.supplierTypes.map((type) => (
                <label
                  key={type.id}
                  className={`choice ${supplier.supplier_type === type.id ? 'choice--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="supplier_type"
                    checked={supplier.supplier_type === type.id}
                    onChange={() => setSupplier({ ...supplier, supplier_type: type.id })}
                  />
                  <span className="choice__text">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginTop: 20 }}>
            <label>Recours à la sous-traitance</label>
            <div className="choices">
              {[
                { id: 'oui', label: 'Oui' },
                { id: 'non', label: 'Non' },
              ].map((choice) => (
                <label
                  key={choice.id}
                  className={`choice ${supplier.sous_traitance === choice.id ? 'choice--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="sous_traitance"
                    checked={supplier.sous_traitance === choice.id}
                    onChange={() => setSupplier({ ...supplier, sous_traitance: choice.id })}
                  />
                  <span className="choice__text">{choice.label}</span>
                </label>
              ))}
            </div>
            {supplier.sous_traitance === 'oui' && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="nb">Nombre de sous-traitants ayant accès au SI ou aux données</label>
                <input
                  id="nb"
                  type="number"
                  min={0}
                  style={{ maxWidth: 220 }}
                  value={supplier.sous_traitants_count}
                  onChange={(e) => setSupplier({ ...supplier, sous_traitants_count: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="grid grid--2" style={{ marginTop: 20 }}>
            <div className="field">
              <label htmlFor="adresse">Adresse</label>
              <input
                id="adresse"
                value={supplier.adresse}
                onChange={(e) => setSupplier({ ...supplier, adresse: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="visavis">Vis-à-vis</label>
              <input
                id="visavis"
                value={supplier.vis_a_vis}
                onChange={(e) => setSupplier({ ...supplier, vis_a_vis: e.target.value })}
              />
            </div>
          </div>
        </Card>
      )}

      {step.kind === 'module' && (
        <Card
          title={step.title}
          subtitle="Un seul niveau de risque par critère."
          actions={<span className="badge badge--coef">Coefficient {step.module!.coefficient}</span>}
        >
          {step.module!.criteria.map((criterion, index) => {
            const locked = autoNa[criterion.id];
            const value = locked ? 6 : answers[criterion.id];
            return (
              <div className="criterion" key={criterion.id}>
                <div className="criterion__head">
                  <span className="criterion__label">{criterion.label}</span>
                  <span className="criterion__index">
                    {String.fromCharCode(97 + index).toUpperCase()} / {step.module!.criteria.length}
                  </span>
                </div>

                {locked ? (
                  <div className="na-note">
                    <strong>N/A automatique.</strong> {locked}
                  </div>
                ) : (
                  <div className="choices">
                    {criterion.options.map((option) => (
                      <label
                        key={option.value}
                        className={`choice ${value === option.value ? 'choice--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={criterion.id}
                          checked={value === option.value}
                          onChange={() => chooseAnswer(criterion, option.value)}
                        />
                        <span className={`choice__rank rank-${option.value}`}>
                          {option.na ? '—' : option.value}
                        </span>
                        <span className="choice__text">{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {!locked && value === 6 && justifications[criterion.id] && (
                  <div className="na-note">
                    <strong>Justification du N/A :</strong> {justifications[criterion.id]}{' '}
                    <button
                      className="btn btn--subtle"
                      style={{ padding: '0 4px' }}
                      onClick={() => setNaModal({ criterion, draft: justifications[criterion.id] })}
                    >
                      Modifier
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {step.kind === 'evidence' && (
        <div className="grid" style={{ gap: 18 }}>
          <Card
            title="Informations complémentaires"
            subtitle="Preuves que le client souhaite joindre — tout type de fichier accepté."
          >
            <div
              className="dropzone"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadFiles(e.dataTransfer.files);
              }}
            >
              <strong>Déposez vos fichiers ici</strong>
              <p className="tiny muted">PDF, Word, images, tableurs… — ou cliquez pour parcourir</p>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => void uploadFiles(e.target.files)}
              />
            </div>
            {detail.attachments.map((file) => (
              <div className="file-row" key={file.id}>
                <span className="file-row__name">{file.filename}</span>
                <span className="tiny muted">{formatSize(file.size)}</span>
                <a className="btn btn--ghost tiny" href={`/api/attachments/${file.id}/download`}>
                  Télécharger
                </a>
                <button className="btn btn--subtle" onClick={() => void deleteFile(file.id)}>
                  Retirer
                </button>
              </div>
            ))}
          </Card>

          <Card title="Niveau de preuve" subtitle="Qualité des informations utilisées pour l'évaluation.">
            <div className="choices">
              {catalog.evidenceLevels.map((level) => (
                <label key={level.id} className={`choice ${evidenceLevel === level.id ? 'choice--selected' : ''}`}>
                  <input
                    type="radio"
                    name="evidence_level"
                    checked={evidenceLevel === level.id}
                    onChange={() => {
                      setEvidenceLevel(level.id);
                      if (level.noEvidence) setEvidenceAge('');
                    }}
                  />
                  <span className="choice__text">{level.label}</span>
                </label>
              ))}
            </div>
          </Card>

          {evidenceLevel && !noEvidence && (
            <Card title="Âge de preuve">
              <div className="choices">
                {catalog.evidenceAges.map((age) => (
                  <label key={age.id} className={`choice ${evidenceAge === age.id ? 'choice--selected' : ''}`}>
                    <input
                      type="radio"
                      name="evidence_age"
                      checked={evidenceAge === age.id}
                      onChange={() => setEvidenceAge(age.id)}
                    />
                    <span className="choice__text">{age.label}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="wizard-actions">
        <button
          className="btn btn--ghost"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
        >
          Précédent
        </button>
        <button
          className="btn btn--primary"
          disabled={saving || (step.kind === 'evidence' && !evidenceReady)}
          onClick={() => void goNext()}
        >
          {saving ? 'Enregistrement…' : step.kind === 'evidence' ? "Calculer le score de risque" : 'Enregistrer et continuer'}
        </button>
      </div>

      {naModal && (
        <Modal
          title="Justification du choix N/A"
          onClose={() => setNaModal(null)}
          actions={
            <>
              <button className="btn btn--ghost" onClick={() => setNaModal(null)}>
                Annuler
              </button>
              <button className="btn btn--primary" disabled={!naModal.draft.trim()} onClick={confirmNa}>
                Valider
              </button>
            </>
          }
        >
          <p className="tiny muted">
            Critère : <strong>{naModal.criterion.label}</strong>. Un critère marqué N/A est exclu du calcul du module
            et doit être justifié.
          </p>
          <textarea
            className="field"
            style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}
            placeholder="Indiquez pourquoi ce critère ne s'applique pas au service fourni…"
            value={naModal.draft}
            onChange={(e) => setNaModal({ ...naModal, draft: e.target.value })}
          />
        </Modal>
      )}
    </>
  );
}
