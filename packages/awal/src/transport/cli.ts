import { spawn } from 'node:child_process';

import { z } from 'zod';

import type { AwalCliTransportConfig } from '@lucid-agents/types/awal';

const cliResultSchema = z.object({
  success: z.boolean().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
});

type CliAction =
  | 'make-x402-request'
  | 'send'
  | 'balance'
  | 'trade'
  | 'wallet-metadata';

type CliInvokeOptions = {
  action: CliAction;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
};

type CliInvokeResult = {
  success: boolean;
  data: unknown;
};

const splitCommand = (command: string): { executable: string; args: string[] } => {
  const normalized = command.trim();
  if (!normalized) {
    return {
      executable: 'npx',
      args: ['-y', 'awal@latest'],
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {
      executable: 'npx',
      args: ['-y', 'awal@latest'],
    };
  }

  return {
    executable: parts[0],
    args: parts.slice(1),
  };
};

const toCliPayload = (payload?: Record<string, unknown>): string | undefined => {
  if (!payload) {
    return undefined;
  }
  return JSON.stringify(payload);
};

const decodeJson = (stdout: string): CliInvokeResult => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('[awal] CLI returned empty output');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Some CLIs may emit logs before JSON. Try last line as JSON.
    const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1];
    parsed = JSON.parse(lastLine);
  }

  const result = cliResultSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: true,
      data: parsed,
    };
  }

  const payload = result.data;
  if (payload.error?.message) {
    throw new Error(`[awal] ${payload.error.message}`);
  }

  return {
    success: payload.success ?? true,
    data: payload.data ?? payload.result ?? parsed,
  };
};

export type AwalCliTransport = {
  invoke: (options: CliInvokeOptions) => Promise<CliInvokeResult>;
};

export function createCliTransport(config: AwalCliTransportConfig): AwalCliTransport {
  const commandSpec = splitCommand(config.command ?? 'npx -y awal@latest');
  const baseArgs = config.args ?? commandSpec.args;
  const timeoutMs = config.timeoutMs ?? 30_000;

  return {
    async invoke(options: CliInvokeOptions): Promise<CliInvokeResult> {
      const payloadString = toCliPayload(options.payload);
      const args = [...baseArgs, options.action, '--json'];

      if (payloadString) {
        args.push('--input', payloadString);
      }

      const proc = spawn(commandSpec.executable, args, {
        cwd: config.cwd,
        env: {
          ...process.env,
          ...config.env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks: Array<Buffer> = [];
      const stderrChunks: Array<Buffer> = [];

      proc.stdout.on('data', chunk => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      proc.stderr.on('data', chunk => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      const effectiveTimeoutMs = options.timeoutMs ?? timeoutMs;
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
      }, effectiveTimeoutMs);

      const exitCode = await new Promise<number>((resolve, reject) => {
        proc.once('error', reject);
        proc.once('close', code => {
          resolve(code ?? 1);
        });
      }).finally(() => {
        clearTimeout(timer);
      });

      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (exitCode !== 0) {
        throw new Error(
          `[awal] CLI exited with code ${exitCode}${stderr ? `: ${stderr}` : ''}`
        );
      }

      return decodeJson(stdout);
    },
  };
}
