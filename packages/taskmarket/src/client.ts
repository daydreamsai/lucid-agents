/**
 * Taskmarket API client.
 *
 * Wraps the Taskmarket REST API at api.taskmarket.dev.
 * All monetary values use USDC base units (6 decimals) on the wire;
 * the runtime layer converts to human-readable USDC.
 */

export type TaskmarketClientConfig = {
  apiUrl?: string;
  apiKey?: string;
};

export interface TaskmarketApiClient {
  listTasks(params: Record<string, string | undefined>): Promise<any>;
  getTask(taskId: string): Promise<any>;
  createTask(body: any): Promise<any>;
  claimTask(taskId: string): Promise<any>;
  submitWork(taskId: string, body: any): Promise<any>;
  listSubmissions(taskId: string): Promise<any>;
  getWalletBalance(): Promise<any>;
}

export function createTaskmarketClient(
  config?: TaskmarketClientConfig,
): TaskmarketApiClient {
  const baseUrl = config?.apiUrl || 'https://api.taskmarket.dev';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config?.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  async function request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers,
      ...options,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Taskmarket API error ${res.status}: ${body.slice(0, 500)}`,
      );
    }
    return res.json();
  }

  return {
    listTasks(params) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) usp.set(k, v);
      }
      return request(`/tasks?${usp.toString()}`);
    },

    getTask(taskId) {
      return request(`/tasks/${taskId}`);
    },

    createTask(body) {
      return request('/tasks', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    claimTask(taskId) {
      return request(`/tasks/${taskId}/claim`, { method: 'POST' });
    },

    submitWork(taskId, body) {
      return request(`/tasks/${taskId}/submissions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    listSubmissions(taskId) {
      return request(`/tasks/${taskId}/submissions`);
    },

    getWalletBalance() {
      return request('/wallet/balance');
    },
  };
}
