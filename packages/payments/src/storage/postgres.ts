import type { PaymentStorageConfig } from '@lucid-agents/types/payments';
import type { SIWxStorageConfig } from '@lucid-agents/types/siwx';

import {
  createPostgresPaymentStorage,
  type PostgresPaymentStorage,
} from '../postgres-payment-storage';
import {
  createPostgresSIWxStorage,
  type PostgresSIWxStorage,
} from '../siwx-postgres-storage';

export { createPostgresPaymentStorage, createPostgresSIWxStorage };
export type { PostgresPaymentStorage, PostgresSIWxStorage };

export function postgresPaymentStorageFactory(
  config: PaymentStorageConfig | undefined,
  agentId?: string
): PostgresPaymentStorage {
  const connectionString = config?.postgres?.connectionString;
  if (config?.type !== 'postgres' || !connectionString) {
    throw new Error('Postgres payment storage requires connectionString');
  }
  return createPostgresPaymentStorage(
    connectionString,
    agentId
  ) as PostgresPaymentStorage;
}

export function postgresSIWxStorageFactory(
  config?: SIWxStorageConfig
): PostgresSIWxStorage {
  const connectionString = config?.postgres?.connectionString;
  if (config?.type !== 'postgres' || !connectionString) {
    throw new Error('SIWX Postgres storage requires connectionString');
  }
  return createPostgresSIWxStorage(connectionString) as PostgresSIWxStorage;
}
