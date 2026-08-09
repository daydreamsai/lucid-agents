/**
 * Taskmarket extension for Lucid Agents.
 *
 * Enables AI agents operating within Lucid to discover, browse, create,
 * claim, and manage Taskmarket tasks on Base L2. Agents can delegate
 * external work to the Taskmarket worker marketplace instead of burning
 * inference on tasks better handled by specialized workers.
 *
 * Requires the `payments` extension (for wallet/payment context) or
 * `identity` extension (for wallet access).
 */

import { createTaskmarketClient } from './client.js';
import { createTaskmarketRuntime } from './runtime.js';

// --- Minimal Extension type (mirrors @lucid-agents/types/core) ---
type BuildContext<Deps extends object = Record<string, unknown>> = {
  meta: { name: string; version: string; description?: string };
  runtime: Record<string, unknown> & Deps;
};

interface Extension<
  R extends Record<string, unknown> = {},
  Dependencies extends object = {},
> {
  name: string;
  requires?: readonly string[];
  after?: readonly string[];
  before?: readonly string[];
  build: (ctx: BuildContext<Dependencies>) => R | Promise<R>;
  onEntrypointAdded?: (entrypoint: unknown, runtime: unknown) => void;
  initialize?: (runtime: unknown) => void | Promise<void>;
  dispose?: (runtime: unknown) => void | Promise<void>;
  onManifestBuild?: (card: unknown, runtime: unknown) => unknown;
}

// --- Public types ---
export type TaskmarketConfig = {
  apiUrl?: string;
  apiKey?: string;
  workerAddress?: string;
};

export type TaskmarketExtensionOptions = {
  config?: TaskmarketConfig;
};

export type TaskmarketRuntime = {
  listTasks: (params: ListTasksParams) => Promise<TaskSummary[]>;
  getTask: (taskId: string) => Promise<TaskDetails>;
  createTask: (params: CreateTaskParams) => Promise<TaskCreated>;
  claimTask: (taskId: string) => Promise<TaskActionResponse>;
  submitWork: (params: SubmitWorkParams) => Promise<TaskActionResponse>;
  listSubmissions: (taskId: string) => Promise<Submission[]>;
  getWallet: () => Promise<WalletInfo>;
};

export type ListTasksParams = {
  status?: 'open' | 'claimed' | 'worker_selected' | 'pending_approval' | 'review' | 'appealing' | 'disputed' | 'completed' | 'expired' | 'cancelled';
  mode?: 'bounty' | 'claim' | 'pitch' | 'benchmark' | 'auction';
  tags?: string[];
  rewardMin?: number;
  rewardMax?: number;
  deadlineHours?: number;
  limit?: number;
};

export type TaskSummary = {
  id: string;
  title: string;
  description: string;
  reward: string;
  rewardUsdc: number;
  mode: string;
  status: string;
  expiryTime: string;
  submissionCount: number;
  awardCount: number;
  tags: string[];
  netReward: number;
};

export type TaskDetails = TaskSummary & {
  requester: string;
  requesterPubkey?: string;
  fullDescription: string;
  escrowTxHash: string;
  createdAt: string;
  submissionWindowOpen: boolean;
  pendingActions: PendingAction[];
  platformFeeBps: number;
  stakeRequired: boolean;
  hookContract?: string;
};

export type PendingAction = {
  role: 'worker' | 'requester' | 'evaluator';
  action: string;
  command?: string;
  eligibleAddress?: string;
  requiresPayment?: boolean;
  paymentAmount?: string;
  availableAfter?: string | null;
  availableUntil?: string | null;
};

export type CreateTaskParams = {
  description: string;
  rewardUsdc: number;
  durationHours: number;
  tags?: string[];
  mode?: 'bounty' | 'claim' | 'pitch' | 'benchmark' | 'auction';
  taskVisibility?: 'public' | 'unlisted' | 'private';
};

export type TaskCreated = {
  taskId: string;
  taskUrl: string;
  reward: string;
  expiryTime: string;
};

export type SubmitWorkParams = {
  taskId: string;
  fileName: string;
  mimeType: string;
  content: string;
  role?: 'preview' | 'source' | 'final' | 'attachment';
};

export type TaskActionResponse = {
  ok: boolean;
  action: string;
  taskId: string;
  data?: unknown;
  error?: string;
};

export type Submission = {
  submissionId: string;
  workerAddress: string;
  artifacts: ArtifactInfo[];
  createdAt: string;
  status?: string;
};

export type ArtifactInfo = {
  fileName: string;
  mimeType: string;
  role: string;
};

export type WalletInfo = {
  address: string;
  balanceUsdc: string;
  balanceBaseUnits: string;
};

/**
 * Taskmarket extension for Lucid Agents.
 *
 * Enables AI agents built on Lucid to discover, browse, create, claim,
 * and manage tasks on the Taskmarket marketplace on Base L2.
 */
export function taskmarket(
  options?: TaskmarketExtensionOptions,
): Extension<{ taskmarket: TaskmarketRuntime }, { payments?: unknown; identity?: unknown }> {
  return {
    name: 'taskmarket',
    requires: [],
    after: ['payments', 'identity'],
    build(_ctx: BuildContext<{ payments?: unknown; identity?: unknown }>): { taskmarket: TaskmarketRuntime } {
      const client = createTaskmarketClient({
        apiUrl: options?.config?.apiUrl,
        apiKey: options?.config?.apiKey,
      });

      const runtime = createTaskmarketRuntime({
        client,
        workerAddress: options?.config?.workerAddress,
      });

      return { taskmarket: runtime };
    },
    async dispose() {
      // cleanup if needed
    },
  };
}
