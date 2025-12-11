import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import {
  getApiAgentsByAgentIdAnalyticsSummaryOptions,
  getApiAgentsByAgentIdAnalyticsTransactionsOptions,
  getApiAgentsByAgentIdAnalyticsExportCsvOptions,
  getApiAgentsByAgentIdAnalyticsExportJsonOptions,
} from '@lucid-agents/hono-runtime/sdk/react-query';
import type {
  AnalyticsSummary,
  Transaction,
} from '@lucid-agents/hono-runtime/sdk';

// Re-export types for convenience
export type { AnalyticsSummary, Transaction };

export interface UseAnalyticsSummaryOptions {
  windowHours?: number;
  enabled?: boolean;
}

/**
 * Fetch analytics summary for an agent
 */
export function useAnalyticsSummary(
  agentId: string,
  options: UseAnalyticsSummaryOptions = {}
) {
  const { windowHours, enabled = true } = options;

  return useQuery({
    ...getApiAgentsByAgentIdAnalyticsSummaryOptions({
      client: apiClient,
      path: { agentId },
      query: windowHours ? { windowHours } : undefined,
    }),
    enabled: enabled && !!agentId,
  });
}

export interface UseAnalyticsTransactionsOptions {
  windowHours?: number;
  direction?: 'incoming' | 'outgoing';
  enabled?: boolean;
}

/**
 * Fetch analytics transactions for an agent
 */
export function useAnalyticsTransactions(
  agentId: string,
  options: UseAnalyticsTransactionsOptions = {}
) {
  const { windowHours, direction, enabled = true } = options;

  return useQuery({
    ...getApiAgentsByAgentIdAnalyticsTransactionsOptions({
      client: apiClient,
      path: { agentId },
      query: {
        ...(windowHours && { windowHours }),
        ...(direction && { direction }),
      },
    }),
    enabled: enabled && !!agentId,
  });
}

/**
 * Export analytics as CSV
 */
export function useAnalyticsExportCSV(agentId: string, windowHours?: number) {
  return useQuery({
    ...getApiAgentsByAgentIdAnalyticsExportCsvOptions({
      client: apiClient,
      path: { agentId },
      query: windowHours ? { windowHours } : undefined,
    }),
    enabled: false, // Only fetch when explicitly called
  });
}

/**
 * Export analytics as JSON
 */
export function useAnalyticsExportJSON(agentId: string, windowHours?: number) {
  return useQuery({
    ...getApiAgentsByAgentIdAnalyticsExportJsonOptions({
      client: apiClient,
      path: { agentId },
      query: windowHours ? { windowHours } : undefined,
    }),
    enabled: false, // Only fetch when explicitly called
  });
}
