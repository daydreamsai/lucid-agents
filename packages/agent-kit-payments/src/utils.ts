import { getActiveInstanceConfig, getAgentKitConfig } from '@lucid-agents/agent-kit';
import type { PaymentsConfig } from './types';

export function paymentsFromEnv(params?: {
  defaultPrice?: string;
}): PaymentsConfig {
  const activeInstanceConfig = getActiveInstanceConfig();
  const { payments } = getAgentKitConfig(activeInstanceConfig);
  return {
    payTo: payments.payTo,
    facilitatorUrl: payments.facilitatorUrl,
    network: payments.network,
    defaultPrice: params?.defaultPrice ?? payments.defaultPrice,
  };
}

