import type {
  AgentConfig,
  ConfigSummary,
  CreateExperiment,
  ExperimentDetail,
  ExperimentStats,
  ExperimentSummary,
  TaskSummary,
  TrialDetail,
  TrialDiff,
  TrialFile,
  TrialSummary,
  Arm,
} from '@evals/shared';

/** An API error response (`{ error, details? }`) or a network failure. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    throw new ApiRequestError(`Cannot reach the API: ${String(error)}`, 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, details } = (body ?? {}) as { error?: string; details?: unknown };
    throw new ApiRequestError(error ?? `${res.status} ${res.statusText}`, res.status, details);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  tasks: () => request<TaskSummary[]>('/tasks'),
  configs: () => request<ConfigSummary[]>('/configs'),
  config: (slug: string) => request<AgentConfig>(`/configs/${slug}`),
  experiments: () => request<ExperimentSummary[]>('/experiments'),
  experiment: (id: string) => request<ExperimentDetail>(`/experiments/${id}`),
  createExperiment: (body: CreateExperiment) => post<ExperimentDetail>('/experiments', body),
  runExperiment: (id: string) => post<ExperimentDetail>(`/experiments/${id}/run`),
  stopExperiment: (id: string) => post<ExperimentDetail>(`/experiments/${id}/stop`),
  stats: (id: string) => request<ExperimentStats>(`/experiments/${id}/stats`),
  trials: (id: string, query: { taskId?: string; arm?: Arm } = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined),
    );
    return request<TrialSummary[]>(`/experiments/${id}/trials?${params.toString()}`);
  },
  trial: (id: string) => request<TrialDetail>(`/trials/${id}`),
  trialEvents: (id: string) => request<unknown[]>(`/trials/${id}/events`),
  trialSession: (id: string) => request<unknown[]>(`/trials/${id}/session`),
  trialDiff: (id: string) => request<TrialDiff>(`/trials/${id}/diff`),
  trialFiles: (id: string) => request<TrialFile[]>(`/trials/${id}/files`),
  /** A workspace file as text (the API serves it as text/plain or bytes, never JSON). */
  trialFileText: async (id: string, path: string): Promise<string> => {
    const url = `/api/v1/trials/${id}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url).catch((error: unknown) => {
      throw new ApiRequestError(`Cannot reach the API: ${String(error)}`, 0);
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiRequestError(body?.error ?? `${res.status} ${res.statusText}`, res.status);
    }
    return res.text();
  },
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
