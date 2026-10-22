export interface Test {
  id: string;
  code: string;
  name: string;
  price: number | null;
}
export interface PlanItem {
  type: 'package' | 'test';
  id: string;
  name: string;
  price: number;
  covers: string[];
}
export interface Plan {
  items: PlanItem[];
  total: number;
  extraTests: string[];
  individualTotal: number | null;
  savings: number | null;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public testIds: string[] = [],
  ) {
    super(code);
  }
}

export async function fetchTests(signal?: AbortSignal): Promise<Test[]> {
  const res = await fetch('/api/tests', { signal });
  if (!res.ok) throw new ApiError('HTTP_ERROR');
  return res.json();
}

export async function fetchPlan(testIds: string[], signal?: AbortSignal): Promise<Plan> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testIds }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? 'HTTP_ERROR', data?.testIds ?? []);
  return data as Plan;
}
