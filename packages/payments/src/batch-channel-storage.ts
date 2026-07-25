import type {
  Channel,
  ChannelStorage,
} from '@x402/evm/batch-settlement/server';

const CHANNEL_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/u;

/**
 * Managed x402 batch-settlement server storage.
 *
 * The inherited `updateChannel` callback is the atomicity boundary. Durable
 * implementations must serialize it across every process sharing a backend.
 */
export interface BatchChannelStorage extends ChannelStorage {
  /** True only when the backend survives restarts and coordinates replicas. */
  readonly durable: boolean;
  /** Deletes all channels in this storage namespace. */
  clear(): Promise<void>;
  /** Releases backend resources and rejects subsequent operations. */
  close(): Promise<void> | void;
}

export function normalizeBatchChannelId(channelId: string): string {
  if (!CHANNEL_ID_PATTERN.test(channelId)) {
    throw new Error('invalid_batch_settlement_evm_channel_id_invalid');
  }
  return channelId.toLowerCase();
}

export function parseBatchChannel(raw: string): Channel {
  return JSON.parse(raw) as Channel;
}

export function serializeBatchChannel(
  channelId: string,
  channel: Channel
): string {
  const key = normalizeBatchChannelId(channelId);
  if (normalizeBatchChannelId(channel.channelId) !== key) {
    throw new Error('Batch channel record does not match its storage key');
  }
  return JSON.stringify({ ...channel, channelId: key });
}

export function cloneBatchChannel(channel: Channel): Channel {
  return parseBatchChannel(JSON.stringify(channel));
}
