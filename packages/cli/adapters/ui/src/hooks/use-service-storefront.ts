'use client';

import {
  createServicePayloadExample,
  type ServicePageModel,
  type ServicePageOffering,
} from '@lucid-agents/http';
import type { TaskAccess } from '@lucid-agents/types/a2a';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWalletClient } from 'wagmi';

import {
  createInvocationState,
  invocationReducer,
  redactInvocationError,
  type InvocationEvent,
  type InvocationState,
} from '@/lib/invocation-state';
import {
  cancelServiceTask,
  createServiceTask,
  getServiceTask,
  invokeServiceOperation,
  paymentNetworkMismatch,
  streamServiceOperation,
  type SolanaWalletLike,
} from '@/lib/service-client';
import { formatServiceValue } from '@/lib/service-utils';

function chunkText(chunk: unknown): string {
  if (chunk && typeof chunk === 'object') {
    const record = chunk as Record<string, unknown>;
    if (record.kind === 'text') return String(record.text ?? '');
    if (record.kind === 'delta') return String(record.delta ?? '');
    if (record.kind === 'run-end' && record.output !== undefined) {
      return formatServiceValue(record.output);
    }
  }
  return formatServiceValue(chunk);
}

export type ServiceStorefrontController = {
  selected?: ServicePageOffering;
  state?: InvocationState;
  showMobileList: boolean;
  selectOffering: (key: string) => void;
  showOfferingList: () => void;
  dispatch: (event: InvocationEvent) => void;
  mppCredential: string;
  setMppCredential: (value: string) => void;
  invoke: () => Promise<void>;
  stream: () => Promise<void>;
  task: () => Promise<void>;
  cancel: () => Promise<void>;
};

/** Owns the shared browser invocation state machine for every React adapter. */
export function useServiceStorefront(
  service: ServicePageModel
): ServiceStorefrontController {
  const { data: walletClient } = useWalletClient();
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider: solanaProvider } =
    useAppKitProvider<SolanaWalletLike['provider']>('solana');
  const solanaNetwork = solanaAccount.caipAddress
    ?.split(':')
    .slice(0, 2)
    .join(':');
  const solanaWallet = useMemo<SolanaWalletLike>(
    () => ({
      address: solanaAccount.address,
      network: solanaNetwork,
      provider: solanaProvider,
    }),
    [solanaAccount.address, solanaNetwork, solanaProvider]
  );
  const [selectedKey, setSelectedKey] = useState(service.offerings[0]?.key);
  const [showMobileList, setShowMobileList] = useState(false);
  const [invocations, setInvocations] = useState<
    Record<string, InvocationState>
  >(() =>
    Object.fromEntries(
      service.offerings.map(offering => [
        offering.key,
        createInvocationState(
          createServicePayloadExample(offering.inputSchema)
        ),
      ])
    )
  );
  const [mppCredentials, setMppCredentials] = useState<Record<string, string>>(
    {}
  );
  const streamCancelRef = useRef<(() => void) | null>(null);
  const taskAccessRef = useRef<Record<string, TaskAccess>>({});
  const taskPollRef = useRef<number | null>(null);

  const selected = useMemo(
    () => service.offerings.find(offering => offering.key === selectedKey),
    [selectedKey, service.offerings]
  );

  useEffect(() => {
    const syncSelectionFromUrl = () => {
      const url = new URL(window.location.href);
      const requestedKey = url.searchParams.get('offering');
      const requestedOffering = service.offerings.find(
        offering => offering.key === requestedKey
      );
      const resolvedKey = requestedOffering?.key ?? service.offerings[0]?.key;
      setSelectedKey(resolvedKey);
      if (requestedOffering) {
        setShowMobileList(false);
      } else {
        setShowMobileList(window.matchMedia('(max-width: 767px)').matches);
        if (resolvedKey) {
          url.searchParams.set('offering', resolvedKey);
          window.history.replaceState(window.history.state, '', url);
        }
      }
    };

    syncSelectionFromUrl();
    window.addEventListener('popstate', syncSelectionFromUrl);
    return () => {
      window.removeEventListener('popstate', syncSelectionFromUrl);
    };
  }, [service.offerings]);

  useEffect(() => {
    return () => {
      streamCancelRef.current?.();
      if (taskPollRef.current !== null) {
        window.clearTimeout(taskPollRef.current);
      }
    };
  }, []);

  const selectOffering = useCallback((key: string) => {
    setSelectedKey(key);
    setShowMobileList(false);
    const url = new URL(window.location.href);
    url.searchParams.set('offering', key);
    window.history.pushState({}, '', url);
    window.setTimeout(
      () => document.getElementById('offering-title')?.focus(),
      0
    );
  }, []);

  const dispatchFor = useCallback((key: string, event: InvocationEvent) => {
    setInvocations(current => ({
      ...current,
      [key]: invocationReducer(current[key] ?? createInvocationState(), event),
    }));
  }, []);

  const requestOptions = useCallback(
    (offering: ServicePageOffering) => ({
      walletClient,
      solanaWallet,
      network: offering.payment.network,
      siwxNetwork: offering.authorization?.siwx.network,
      useSIWx: offering.authorization?.siwx.enabled === true,
      useX402: offering.payment.protocol === 'x402',
      mppCredential: mppCredentials[offering.key],
    }),
    [mppCredentials, solanaWallet, walletClient]
  );

  const parsedPayload = useCallback(
    (offering: ServicePageOffering): unknown | undefined => {
      const state = invocations[offering.key];
      try {
        return JSON.parse(state?.payload ?? '{}');
      } catch {
        dispatchFor(offering.key, {
          type: 'INVALID',
          error: 'Payload must be valid JSON.',
        });
        return undefined;
      }
    },
    [dispatchFor, invocations]
  );

  const prepare = useCallback(
    (offering: ServicePageOffering): boolean => {
      dispatchFor(offering.key, { type: 'PREPARE' });
      if (offering.authorization?.siwx.enabled) {
        const network = offering.authorization.siwx.network;
        if (network?.startsWith('solana:')) {
          dispatchFor(offering.key, {
            type: 'NETWORK_MISMATCH',
            error: `This storefront cannot sign SIWX challenges for ${network}.`,
          });
          return false;
        }
        if (!walletClient) {
          dispatchFor(offering.key, { type: 'REQUIRE_AUTHORIZATION' });
          return false;
        }
        const mismatch = paymentNetworkMismatch(network, {
          evmChainId: walletClient.chain?.id,
        });
        if (mismatch) {
          dispatchFor(offering.key, {
            type: 'NETWORK_MISMATCH',
            error: mismatch,
          });
          return false;
        }
      }
      if (offering.payment.protocol === 'x402') {
        const network = offering.payment.network;
        const usesSolana = network?.startsWith('solana:') === true;
        const hasRequiredWallet = usesSolana
          ? Boolean(solanaWallet.address && solanaWallet.provider)
          : Boolean(walletClient);
        if (!hasRequiredWallet) {
          dispatchFor(offering.key, { type: 'REQUIRE_PAYMENT' });
          return false;
        }
        const mismatch = paymentNetworkMismatch(network, {
          evmChainId: walletClient?.chain?.id,
          solanaNetwork: solanaWallet.network,
        });
        if (mismatch) {
          dispatchFor(offering.key, {
            type: 'NETWORK_MISMATCH',
            error: mismatch,
          });
          return false;
        }
      }
      if (
        offering.payment.protocol === 'mpp' &&
        !mppCredentials[offering.key]?.trim()
      ) {
        dispatchFor(offering.key, { type: 'REQUIRE_PAYMENT' });
        return false;
      }
      return true;
    },
    [dispatchFor, mppCredentials, solanaWallet, walletClient]
  );

  const invoke = useCallback(async () => {
    if (!selected) return;
    const payload = parsedPayload(selected);
    if (payload === undefined || !prepare(selected)) return;
    dispatchFor(selected.key, { type: 'START' });
    try {
      const result = await invokeServiceOperation({
        url: selected.operations.invoke.path,
        body: payload,
        request: requestOptions(selected),
      });
      dispatchFor(selected.key, {
        type: 'SUCCEED',
        result,
        paymentUsed: selected.payment.required,
      });
    } catch (error) {
      dispatchFor(selected.key, {
        type: 'FAIL',
        error: redactInvocationError(error),
      });
    }
  }, [dispatchFor, parsedPayload, prepare, requestOptions, selected]);

  const stream = useCallback(async () => {
    if (!selected?.operations.stream) return;
    const payload = parsedPayload(selected);
    if (payload === undefined || !prepare(selected)) return;
    streamCancelRef.current?.();
    dispatchFor(selected.key, { type: 'START' });
    try {
      const activeStream = await streamServiceOperation({
        url: selected.operations.stream.path,
        body: payload,
        request: requestOptions(selected),
        onChunk: chunk =>
          dispatchFor(selected.key, { type: 'CHUNK', chunk: chunkText(chunk) }),
        onDone: () =>
          dispatchFor(selected.key, {
            type: 'SUCCEED',
            result: 'Stream completed.',
            paymentUsed: selected.payment.required,
          }),
        onError: error =>
          dispatchFor(selected.key, { type: 'FAIL', error: error.message }),
      });
      streamCancelRef.current = activeStream.cancel;
    } catch (error) {
      dispatchFor(selected.key, {
        type: 'FAIL',
        error: redactInvocationError(error),
      });
    }
  }, [dispatchFor, parsedPayload, prepare, requestOptions, selected]);

  const task = useCallback(async () => {
    if (!selected || !service.endpoints.tasks) return;
    const payload = parsedPayload(selected);
    if (payload === undefined || !prepare(selected)) return;
    dispatchFor(selected.key, { type: 'START' });
    try {
      const created = await createServiceTask({
        url: service.endpoints.tasks,
        skillId: selected.key,
        input:
          payload && typeof payload === 'object' && 'input' in payload
            ? (payload as { input: unknown }).input
            : payload,
        request: requestOptions(selected),
      });
      taskAccessRef.current[selected.key] = created;
      dispatchFor(selected.key, {
        type: 'TASK',
        taskId: created.taskId,
        status: created.status,
      });
      const poll = async () => {
        const access = taskAccessRef.current[selected.key];
        if (!access) return;
        try {
          const current = await getServiceTask({
            tasksUrl: service.endpoints.tasks!,
            ...access,
          });
          dispatchFor(selected.key, {
            type: 'TASK',
            taskId: current.taskId,
            status: current.status,
          });
          if (current.status === 'completed') {
            dispatchFor(selected.key, {
              type: 'SUCCEED',
              result: current.result,
              paymentUsed: selected.payment.required,
            });
          } else if (current.status === 'failed') {
            dispatchFor(selected.key, {
              type: 'FAIL',
              error: current.error?.message ?? 'The task failed.',
            });
          } else if (current.status === 'running') {
            taskPollRef.current = window.setTimeout(poll, 1000);
          }
        } catch (error) {
          dispatchFor(selected.key, {
            type: 'FAIL',
            error: redactInvocationError(error),
          });
        }
      };
      taskPollRef.current = window.setTimeout(poll, 500);
    } catch (error) {
      dispatchFor(selected.key, {
        type: 'FAIL',
        error: redactInvocationError(error),
      });
    }
  }, [
    dispatchFor,
    parsedPayload,
    prepare,
    requestOptions,
    selected,
    service.endpoints.tasks,
  ]);

  const cancel = useCallback(async () => {
    if (!selected) return;
    streamCancelRef.current?.();
    streamCancelRef.current = null;
    if (taskPollRef.current !== null) {
      window.clearTimeout(taskPollRef.current);
    }
    const access = taskAccessRef.current[selected.key];
    if (access && service.endpoints.tasks) {
      await cancelServiceTask({
        tasksUrl: service.endpoints.tasks,
        ...access,
      }).catch(() => undefined);
      delete taskAccessRef.current[selected.key];
    }
    dispatchFor(selected.key, { type: 'CANCEL' });
  }, [dispatchFor, selected, service.endpoints.tasks]);

  return {
    selected,
    state: selected
      ? (invocations[selected.key] ??
        createInvocationState(
          createServicePayloadExample(selected.inputSchema)
        ))
      : undefined,
    showMobileList,
    selectOffering,
    showOfferingList: () => setShowMobileList(true),
    dispatch: event => {
      if (selected) dispatchFor(selected.key, event);
    },
    mppCredential: selected ? (mppCredentials[selected.key] ?? '') : '',
    setMppCredential: value => {
      if (!selected) return;
      setMppCredentials(current => ({ ...current, [selected.key]: value }));
    },
    invoke,
    stream,
    task,
    cancel,
  };
}
