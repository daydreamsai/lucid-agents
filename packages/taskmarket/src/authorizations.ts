import type { AuthorizationStore, IssuedAuthorization } from './types';

export function createInMemoryAuthorizationStore(): AuthorizationStore {
  const records = new Map<string, IssuedAuthorization>();
  return {
    get(token) {
      return records.get(token);
    },
    set(record) {
      records.set(record.token, record);
    },
  };
}
