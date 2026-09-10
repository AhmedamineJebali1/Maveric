export type Option = { value: number; label: string; na?: boolean };
export type Criterion = { id: string; label: string; options: Option[] };
export type Module = {
  id: string;
  number: number;
  title: string;
  coefficient: number;
  criteria: Criterion[];
};

export type Catalog = {
  modules: Module[];
  supplierTypes: { id: string; label: string }[];
  evidenceLevels: { id: string; label: string; noEvidence: boolean }[];
  evidenceAges: { id: string; label: string }[];
  riskLevels: { id: string; label: string; description: string; min: number; max: number }[];
  autoNaRules: { when: { criterionId: string; equals: number }; apply: string[]; note: string }[];
};

export type Attachment = {
  id: number;
  filename: string;
  mime: string | null;
  size: number;
  uploaded_at: string;
};

export type Progress = {
  supplierDone: boolean;
  moduleDone: Record<string, boolean>;
  evidenceDone: boolean;
  autoNa: Record<string, string>;
};

export type AssessmentDetail = {
  assessment: {
    id: number;
    status: string;
    created_at: string;
    completed_at: string | null;
    supplier_name: string;
    supplier_type: string | null;
    service_fourni: string;
    sous_traitance: string | null;
    sous_traitants_count: number | null;
    adresse: string;
    vis_a_vis: string;
    evidence_level: string | null;
    evidence_age: string | null;
  };
  answers: Record<string, number>;
  justifications: Record<string, string>;
  attachments: Attachment[];
  progress: Progress;
};

export type AssessmentRow = {
  id: number;
  supplier_name: string;
  supplier_type: string | null;
  supplier_type_label: string | null;
  service_fourni: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  score_final: number | null;
  score_uncapped: number | null;
  level: string | null;
};

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

export type ResultPayload = {
  assessment: {
    id: number;
    supplier_name: string;
    supplier_type_label: string;
    service_fourni: string;
    sous_traitance: string | null;
    sous_traitants_count: number | null;
    adresse: string;
    vis_a_vis: string;
    created_at: string;
    completed_at: string | null;
    status: string;
    evidence_level_label: string | null;
    evidence_age_label: string | null;
  };
  score: {
    scoreFinal: number;
    scoreUncapped: number;
    level: string;
    levelLabel: string;
    levelDescription: string;
    eliminationRules: string[];
    modules: ModuleScore[];
    criteria: CriterionScore[];
  };
  plan: PlanItem[];
  riskiestModules: (ModuleScore & { weighted: number })[];
  attachments: Attachment[];
  ai: { text: string; generatedAt: string; model: string } | null;
};

export type DashboardPayload = {
  suppliers: (AssessmentRow & { effective_confidence: number | null })[];
  byLevel: { id: string; label: string; description: string; count: number }[];
  byModule: {
    moduleId: string;
    number: number;
    title: string;
    coefficient: number;
    average: number | null;
    worst: number | null;
    count: number;
  }[];
  criteriaHotspots: {
    criterionId: string;
    label: string;
    moduleTitle: string;
    average: number;
    count: number;
  }[];
  totals: { assessments: number; averageScore: number | null };
};

export class ApiError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join(' '));
    this.errors = errors;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let payload: any = {};
    try {
      payload = await response.json();
    } catch {
      /* reponse non JSON */
    }
    throw new ApiError(payload.errors ?? [payload.error ?? `Erreur ${response.status}`]);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  catalog: () => request<Catalog>('/api/catalog'),
  list: () => request<AssessmentRow[]>('/api/assessments'),
  create: () => request<{ id: number }>('/api/assessments', { method: 'POST' }),
  detail: (id: number) => request<AssessmentDetail>(`/api/assessments/${id}`),
  remove: (id: number) => request<{ ok: true }>(`/api/assessments/${id}`, { method: 'DELETE' }),
  saveSupplier: (id: number, body: unknown) => request<{ ok: true }>(`/api/assessments/${id}/supplier`, json(body)),
  saveModule: (id: number, moduleId: string, body: unknown) =>
    request<{ ok: true; progress: Progress }>(`/api/assessments/${id}/modules/${moduleId}`, json(body)),
  saveEvidence: (id: number, body: unknown) => request<{ ok: true }>(`/api/assessments/${id}/evidence`, json(body)),
  upload: (id: number, files: FileList) => {
    const form = new FormData();
    for (const file of Array.from(files)) form.append('files', file);
    return request<{ attachments: Attachment[] }>(`/api/assessments/${id}/attachments`, {
      method: 'POST',
      body: form,
    });
  },
  removeAttachment: (id: number, attachmentId: number) =>
    request<{ attachments: Attachment[] }>(`/api/assessments/${id}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
  finalize: (id: number) => request<{ ok: true }>(`/api/assessments/${id}/finalize`, { method: 'POST' }),
  result: (id: number) => request<ResultPayload>(`/api/assessments/${id}/result`),
  aiAnalysis: (id: number) =>
    request<{ text: string; generatedAt: string; model: string }>(`/api/assessments/${id}/ai-analysis`, {
      method: 'POST',
    }),
  dashboard: () => request<DashboardPayload>('/api/dashboard'),
  dashboardAi: () =>
    request<{ text: string; generatedAt: string; model: string }>('/api/dashboard/ai-analysis', {
      method: 'POST',
    }),
};

export const LEVEL_COLORS: Record<string, string> = {
  low: '#12915a',
  moderate: '#b0870d',
  high: '#dd6b13',
  very_high: '#d8442c',
  critical: '#a01128',
};

export function scoreColor(score: number): string {
  if (score <= 20) return LEVEL_COLORS.low;
  if (score <= 40) return LEVEL_COLORS.moderate;
  if (score <= 60) return LEVEL_COLORS.high;
  if (score <= 80) return LEVEL_COLORS.very_high;
  return LEVEL_COLORS.critical;
}

export function ratingColor(value: number): string {
  const palette = ['#12915a', '#6a9c1c', '#b0870d', '#dd6b13', '#d8442c'];
  return palette[Math.min(4, Math.max(0, Math.round(value) - 1))];
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
