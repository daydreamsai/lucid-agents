import type { TaskmarketAccount } from './types';

export async function readSignatureHeaders(
  account: TaskmarketAccount
): Promise<Record<string, string>> {
  const message = `taskmarket:read:${account.address.toLowerCase()}`;
  const signature = await account.signMessage({ message });
  return {
    'X-Taskmarket-Caller-Address': account.address,
    'X-Taskmarket-Caller-Signature': signature,
  };
}
