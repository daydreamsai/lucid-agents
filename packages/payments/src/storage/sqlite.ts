import type { PaymentStorageConfig } from '@lucid-agents/types/payments';
import type { SIWxStorageConfig } from '@lucid-agents/types/siwx';

import {
  createSQLitePaymentStorage,
  type SQLitePaymentStorage,
} from '../sqlite-payment-storage';
import {
  createSQLiteSIWxStorage,
  type SQLiteSIWxStorage,
} from '../siwx-sqlite-storage';

export { createSQLitePaymentStorage, createSQLiteSIWxStorage };
export type { SQLitePaymentStorage, SQLiteSIWxStorage };

export function sqlitePaymentStorageFactory(
  config?: PaymentStorageConfig
): SQLitePaymentStorage {
  if (config && config.type !== 'sqlite') {
    throw new Error(`Expected sqlite payment storage, received ${config.type}`);
  }
  return createSQLitePaymentStorage(
    config?.sqlite?.dbPath
  ) as SQLitePaymentStorage;
}

export function sqliteSIWxStorageFactory(
  config?: SIWxStorageConfig
): SQLiteSIWxStorage {
  if (config && config.type !== 'sqlite') {
    throw new Error(`Expected sqlite SIWX storage, received ${config.type}`);
  }
  return createSQLiteSIWxStorage(config?.sqlite?.dbPath) as SQLiteSIWxStorage;
}
