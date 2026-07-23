import type {
  MppSessionMeter,
  MppSessionMeterChargeResult,
  MppSessionNeedVoucherEvent,
  MppSessionReceiptEvent,
  TempoSessionStore,
} from '@lucid-agents/types/mpp';

type TempoSessionChannel = {
  channelId: `0x${string}`;
  deposit: bigint;
  highestVoucherAmount: bigint;
  spent?: bigint;
  units?: number;
  finalized?: boolean;
  closeRequestedAt?: bigint;
};

/** Store, channel, pricing, and wait options for a Tempo session meter. */
export type CreateTempoSessionMeterOptions = {
  store: TempoSessionStore;
  channelId: `0x${string}`;
  challengeId: string;
  tickCost: bigint;
  maximumAmount: bigint;
  unitType: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Units already deducted by native HTTP verification. */
  prepaidUnits?: number;
};

type ChargeAttempt =
  | { status: 'charged'; channel: TempoSessionChannel }
  | { status: 'insufficient'; channel: TempoSessionChannel }
  | { status: 'closed'; channel?: TempoSessionChannel };

function isChannel(value: unknown): value is TempoSessionChannel {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TempoSessionChannel>;
  return (
    typeof candidate.channelId === 'string' &&
    candidate.channelId.startsWith('0x') &&
    typeof candidate.deposit === 'bigint' &&
    typeof candidate.highestVoucherAmount === 'bigint'
  );
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function problem(
  reason: 'closed' | 'timeout' | 'aborted',
  detail: string
): Response {
  const status = reason === 'closed' ? 410 : reason === 'aborted' ? 499 : 402;
  const slug =
    reason === 'closed'
      ? 'channel-closed'
      : reason === 'aborted'
        ? 'request-aborted'
        : 'insufficient-balance';
  const title =
    reason === 'closed'
      ? 'Session Channel Closed'
      : reason === 'aborted'
        ? 'Session Charge Aborted'
        : 'Insufficient Session Balance';
  return Response.json(
    {
      type: `https://paymentauth.org/problems/session/${slug}`,
      title,
      status,
      detail,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/problem+json',
      },
    }
  );
}

function receiptEvent(
  channel: TempoSessionChannel,
  challengeId: string
): MppSessionReceiptEvent {
  const spent = channel.spent ?? 0n;
  const data = {
    method: 'tempo' as const,
    intent: 'session' as const,
    status: 'success' as const,
    timestamp: new Date().toISOString(),
    reference: channel.channelId,
    challengeId,
    channelId: channel.channelId,
    acceptedCumulative: channel.highestVoucherAmount.toString(),
    spent: spent.toString(),
    units: channel.units ?? 0,
  };
  return {
    event: 'payment-receipt',
    data,
    serialized: encodeBase64Url(JSON.stringify(data)),
  };
}

function needVoucherEvent(
  channel: TempoSessionChannel,
  requiredCumulative: bigint
): MppSessionNeedVoucherEvent {
  return {
    event: 'payment-need-voucher',
    data: {
      channelId: channel.channelId,
      requiredCumulative: requiredCumulative.toString(),
      acceptedCumulative: channel.highestVoucherAmount.toString(),
      deposit: channel.deposit.toString(),
    },
  };
}

function isClosed(channel: TempoSessionChannel): boolean {
  return channel.finalized === true || (channel.closeRequestedAt ?? 0n) !== 0n;
}

async function waitForPoll(
  milliseconds: number,
  signal: AbortSignal | undefined
): Promise<'elapsed' | 'aborted'> {
  if (signal?.aborted) return 'aborted';
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve('elapsed');
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve('aborted');
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Creates a transport-neutral meter backed by the same atomic store used by
 * the native Tempo session verifier.
 */
export function createTempoSessionMeter(
  options: CreateTempoSessionMeterOptions
): MppSessionMeter {
  if (options.tickCost <= 0n) {
    throw new Error('Tempo session tickCost must be greater than zero');
  }
  if (options.maximumAmount < options.tickCost) {
    throw new Error('Tempo session maximumAmount must cover at least one unit');
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  let prepaidUnits = options.prepaidUnits ?? 0;
  let cancelled = false;

  const attemptCharge = (): Promise<ChargeAttempt> =>
    options.store.update<ChargeAttempt>(options.channelId, current => {
      if (!isChannel(current) || isClosed(current)) {
        return {
          op: 'noop',
          result: {
            status: 'closed',
            ...(isChannel(current) ? { channel: current } : {}),
          } satisfies ChargeAttempt,
        };
      }
      const spent = current.spent ?? 0n;
      if (spent + options.tickCost > current.highestVoucherAmount) {
        return {
          op: 'noop',
          result: {
            status: 'insufficient',
            channel: current,
          } satisfies ChargeAttempt,
        };
      }
      const channel = {
        ...current,
        spent: spent + options.tickCost,
        units: (current.units ?? 0) + 1,
      };
      return {
        op: 'set',
        value: channel,
        result: {
          status: 'charged',
          channel,
        } satisfies ChargeAttempt,
      };
    });

  const rollbackCharge = async (): Promise<void> => {
    await options.store.update<void>(options.channelId, current => {
      if (!isChannel(current)) {
        throw new Error('Tempo session channel was not found');
      }
      const spent = current.spent ?? 0n;
      const units = current.units ?? 0;
      if (spent < options.tickCost || units < 1) {
        throw new Error('Tempo session charge rollback is inconsistent');
      }
      return {
        op: 'set',
        value: {
          ...current,
          spent: spent - options.tickCost,
          units: units - 1,
        },
        result: undefined,
      };
    });
  };

  const chargedResult = (
    receipt: MppSessionReceiptEvent
  ): MppSessionMeterChargeResult => {
    let rolledBack = false;
    return {
      status: 'charged',
      receipt,
      rollback: async () => {
        if (rolledBack) return;
        rolledBack = true;
        await rollbackCharge();
      },
    };
  };

  return {
    channelId: options.channelId,
    unitType: options.unitType,
    unitAmount: options.tickCost.toString(),
    maximumAmount: options.maximumAmount.toString(),
    async charge(chargeOptions = {}): Promise<MppSessionMeterChargeResult> {
      if (cancelled || chargeOptions.signal?.aborted) {
        return {
          status: 'unavailable',
          reason: 'aborted',
          problem: problem('aborted', 'The session charge was cancelled.'),
        };
      }
      if (prepaidUnits > 0) {
        prepaidUnits -= 1;
        return chargedResult(await this.receipt());
      }

      const startedAt = Date.now();
      let notifiedRequired: bigint | undefined;
      while (true) {
        const attempted = await attemptCharge();
        if (attempted.status === 'charged') {
          return chargedResult(
            receiptEvent(attempted.channel, options.challengeId)
          );
        }
        if (attempted.status === 'closed') {
          return {
            status: 'unavailable',
            reason: 'closed',
            problem: problem(
              'closed',
              'The Tempo session channel is missing, closing, or finalized.'
            ),
          };
        }

        const required = (attempted.channel.spent ?? 0n) + options.tickCost;
        if (chargeOptions.onNeedVoucher && notifiedRequired !== required) {
          await chargeOptions.onNeedVoucher(
            needVoucherEvent(attempted.channel, required)
          );
          notifiedRequired = required;
        }

        if (
          !chargeOptions.onNeedVoucher ||
          Date.now() - startedAt >= timeoutMs
        ) {
          return {
            status: 'unavailable',
            reason: 'timeout',
            problem: problem(
              'timeout',
              'The accepted voucher does not cover the next session unit.'
            ),
          };
        }
        if (cancelled || chargeOptions.signal?.aborted) {
          return {
            status: 'unavailable',
            reason: 'aborted',
            problem: problem('aborted', 'The session charge was cancelled.'),
          };
        }
        const waited = await waitForPoll(
          Math.min(
            pollIntervalMs,
            Math.max(0, timeoutMs - (Date.now() - startedAt))
          ),
          chargeOptions.signal
        );
        if (waited === 'aborted') {
          return {
            status: 'unavailable',
            reason: 'aborted',
            problem: problem('aborted', 'The session charge was cancelled.'),
          };
        }
      }
    },
    async receipt(): Promise<MppSessionReceiptEvent> {
      const current = await options.store.get(options.channelId);
      if (!isChannel(current)) {
        throw new Error('Tempo session channel was not found');
      }
      return receiptEvent(current, options.challengeId);
    },
    async cancel(): Promise<void> {
      if (cancelled) return;
      cancelled = true;
      const unusedPrepaid = prepaidUnits;
      prepaidUnits = 0;
      if (unusedPrepaid <= 0) return;
      await options.store.update<void>(options.channelId, current => {
        if (!isChannel(current)) return { op: 'noop', result: undefined };
        const spent = current.spent ?? 0n;
        const units = current.units ?? 0;
        const rollback = options.tickCost * BigInt(unusedPrepaid);
        if (spent < rollback || units < unusedPrepaid) {
          throw new Error('Tempo session prepaid accounting is inconsistent');
        }
        return {
          op: 'set',
          value: {
            ...current,
            spent: spent - rollback,
            units: units - unusedPrepaid,
          },
          result: undefined,
        };
      });
    },
  };
}
