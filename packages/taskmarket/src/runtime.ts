/**
 * Taskmarket runtime implementation.
 *
 * Provides the agent-facing methods that power the taskmarket extension.
 * Converts between human-readable USDC and the API's base units.
 */

import type { TaskmarketApiClient } from './client';
import type {
  TaskmarketRuntime,
  ListTasksParams,
  TaskSummary,
  TaskDetails,
  CreateTaskParams,
  TaskCreated,
  SubmitWorkParams,
  TaskActionResponse,
  Submission,
  WalletInfo,
  PendingAction,
} from './index';

export type CreateTaskmarketRuntimeOptions = {
  client: TaskmarketApiClient;
  workerAddress?: string;
};

const USDC_BASE = 1_000_000;

function usdcToBase(usdc: number): string {
  return String(Math.round(usdc * USDC_BASE));
}

function baseToUsdc(base: string | number): number {
  return Number(base) / USDC_BASE;
}

function fmtDate(s: string | undefined): string {
  if (!s) return 'N/A';
  try {
    return new Date(s).toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return s;
  }
}

function toTaskSummary(t: any): TaskSummary {
  return {
    id: t.id,
    title:
      t.description?.slice(0, 100) +
      (t.description?.length > 100 ? '...' : ''),
    description: t.description || '',
    reward: t.reward || '0',
    rewardUsdc: baseToUsdc(t.reward || '0'),
    mode: t.mode || 'bounty',
    status: t.status || 'open',
    expiryTime: fmtDate(t.expiryTime),
    submissionCount: t.submissionCount || 0,
    awardCount: t.awardCount || 0,
    tags: t.tags || [],
    netReward: baseToUsdc(t.netReward || '0'),
  };
}

function toPendingAction(pa: any): PendingAction {
  return {
    role: pa.role,
    action: pa.action,
    command: pa.command,
    eligibleAddress: pa.eligibleAddress,
    requiresPayment: pa.requiresPayment,
    paymentAmount: pa.paymentAmount,
    availableAfter: pa.availableAfter,
    availableUntil: pa.availableUntil,
  };
}

export function createTaskmarketRuntime(
  options: CreateTaskmarketRuntimeOptions,
): TaskmarketRuntime {
  const { client, workerAddress } = options;

  return {
    async listTasks(params: ListTasksParams): Promise<TaskSummary[]> {
      const queryParams: Record<string, string | undefined> = {
        limit: params.limit?.toString(),
      };
      if (params.status) queryParams.status = params.status;
      if (params.mode) queryParams.mode = params.mode;
      if (params.tags) queryParams.tags = params.tags.join(',');
      if (params.rewardMin !== undefined)
        queryParams.reward_min = params.rewardMin.toString();
      if (params.rewardMax !== undefined)
        queryParams.reward_max = params.rewardMax.toString();
      if (params.deadlineHours !== undefined)
        queryParams.deadline_hours = params.deadlineHours.toString();

      const data = await client.listTasks(queryParams);
      const tasks = (data.tasks || data) as any[];
      if (!Array.isArray(tasks)) return [];
      return tasks.map(toTaskSummary);
    },

    async getTask(taskId: string): Promise<TaskDetails> {
      const t = await client.getTask(taskId);
      return {
        ...toTaskSummary(t),
        requester: t.requester,
        requesterPubkey: t.requesterPubkey,
        fullDescription: t.description || '',
        escrowTxHash: t.escrowTxHash,
        createdAt: t.createdAt,
        submissionWindowOpen: t.submissionWindowOpen,
        pendingActions: (t.pendingActions || []).map(toPendingAction),
        platformFeeBps: t.platformFeeBps,
        stakeRequired: t.stakeRequired,
        hookContract: t.hookContract,
      };
    },

    async createTask(params: CreateTaskParams): Promise<TaskCreated> {
      const reward = usdcToBase(params.rewardUsdc);
      const body: any = {
        description: params.description,
        reward,
        duration: params.durationHours,
        mode: params.mode || 'bounty',
        taskVisibility: params.taskVisibility || 'public',
      };
      if (params.tags) body.tags = params.tags;

      const data = await client.createTask(body);
      return {
        taskId: data.taskId || data.id || '',
        taskUrl: `https://taskmarket.dev/task/${data.taskId || data.id}`,
        reward,
        expiryTime: data.expiryTime
          ? fmtDate(data.expiryTime)
          : 'N/A',
      };
    },

    async claimTask(taskId: string): Promise<TaskActionResponse> {
      try {
        const data = await client.claimTask(taskId);
        return { ok: true, action: 'claim', taskId, data };
      } catch (e: any) {
        return { ok: false, action: 'claim', taskId, error: e.message };
      }
    },

    async submitWork(params: SubmitWorkParams): Promise<TaskActionResponse> {
      const body = {
        workerAddress: workerAddress || '',
        artifacts: [
          {
            fileName: params.fileName,
            mimeType: params.mimeType,
            role: params.role || 'final',
            file: params.content, // base64-encoded
          },
        ],
      };
      try {
        const data = await client.submitWork(params.taskId, body);
        return { ok: true, action: 'submit', taskId: params.taskId, data };
      } catch (e: any) {
        return {
          ok: false,
          action: 'submit',
          taskId: params.taskId,
          error: e.message,
        };
      }
    },

    async listSubmissions(taskId: string): Promise<Submission[]> {
      const data = await client.listSubmissions(taskId);
      const subs = (data.submissions || []) as any[];
      if (!Array.isArray(subs)) return [];
      return subs.map((s) => ({
        submissionId: s.submissionId || s.id || '',
        workerAddress: s.workerAddress || s.worker || '',
        artifacts: (s.artifacts || []).map((a: any) => ({
          fileName: a.fileName || '',
          mimeType: a.mimeType || '',
          role: a.role || '',
        })),
        createdAt: fmtDate(s.createdAt || s.submittedAt),
        status: s.status,
      }));
    },

    async getWallet(): Promise<WalletInfo> {
      const data = await client.getWalletBalance();
      return {
        address: data.address || workerAddress || '',
        balanceUsdc:
          data.balanceUsdc ||
          String(baseToUsdc(data.balanceBaseUnits || '0')),
        balanceBaseUnits: data.balanceBaseUnits || '0',
      };
    },
  };
}
