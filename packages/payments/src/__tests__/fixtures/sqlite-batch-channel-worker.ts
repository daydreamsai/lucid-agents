import { createSQLiteBatchChannelStorage } from '../../sqlite-batch-channel-storage';

const [dbPath, namespace, channelId, mode, value] = process.argv.slice(2);
if (!dbPath || !namespace || !channelId || !mode || !value) {
  throw new Error(
    'Expected dbPath, namespace, channelId, mode, and value arguments'
  );
}

const storage = createSQLiteBatchChannelStorage(dbPath, { namespace });
if (mode === 'increment') {
  const count = Number.parseInt(value, 10);
  for (let index = 0; index < count; index += 1) {
    await storage.updateChannel(channelId, current => {
      if (!current) throw new Error('Missing channel');
      return {
        ...current,
        chargedCumulativeAmount: (
          BigInt(current.chargedCumulativeAmount) + 1n
        ).toString(),
      };
    });
  }
} else if (mode === 'voucher') {
  const amount = BigInt(value);
  await storage.updateChannel(channelId, current => {
    if (!current) throw new Error('Missing channel');
    if (amount <= BigInt(current.signedMaxClaimable)) return current;
    return {
      ...current,
      chargedCumulativeAmount: amount.toString(),
      signedMaxClaimable: amount.toString(),
    };
  });
} else if (mode === 'delete') {
  await storage.updateChannel(channelId, () => undefined);
} else {
  throw new Error(`Unknown worker mode: ${mode}`);
}
storage.close();
