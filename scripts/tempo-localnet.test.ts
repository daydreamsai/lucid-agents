import { describe, expect, test } from 'bun:test';

import {
  assertSafeTempoRpcUrl,
  assertTempoSourceRevision,
  assertTempoLocalnetChainId,
  buildTempoDockerRunArgs,
  redactTempoDiagnostics,
  runTempoLocalnet,
  TEMPO_IMAGE,
  TEMPO_SOURCE_REVISION,
} from './tempo-localnet';

describe('Tempo localnet test orchestrator', () => {
  test('accepts only an HTTP loopback RPC endpoint', () => {
    expect(assertSafeTempoRpcUrl('http://127.0.0.1:18545').href).toBe(
      'http://127.0.0.1:18545/'
    );
    expect(assertSafeTempoRpcUrl('http://localhost:18545').href).toBe(
      'http://localhost:18545/'
    );
    expect(() =>
      assertSafeTempoRpcUrl('https://rpc.moderato.tempo.xyz')
    ).toThrow('Tempo E2E test credentials require a loopback HTTP RPC URL');
    expect(() => assertSafeTempoRpcUrl('http://0.0.0.0:18545')).toThrow(
      'Tempo E2E test credentials require a loopback HTTP RPC URL'
    );
  });

  test('requires the Tempo development chain ID from JSON-RPC readiness', () => {
    expect(() =>
      assertTempoLocalnetChainId({ jsonrpc: '2.0', id: 1, result: '0x539' })
    ).not.toThrow();
    expect(() =>
      assertTempoLocalnetChainId({ jsonrpc: '2.0', id: 1, result: '0xa5bf' })
    ).toThrow('expected Tempo localnet chain ID 1337 (0x539), received 0xa5bf');
    expect(() =>
      assertTempoLocalnetChainId({ jsonrpc: '2.0', id: 1, error: {} })
    ).toThrow('invalid eth_chainId JSON-RPC response');
  });

  test('constructs the reviewed single-node development command', () => {
    expect(TEMPO_IMAGE).toBe(
      'ghcr.io/tempoxyz/tempo@sha256:fd3912451658118f54625d122b37fd35e0dc2fe2192f99d9941f1a468dd4d97c'
    );
    expect(TEMPO_SOURCE_REVISION).toBe(
      '0dcf32250f0ff29791b5940e30c9084232cd6d43'
    );
    expect(
      buildTempoDockerRunArgs({
        containerName: 'lucid-tempo-e2e',
        rpcUrl: 'http://127.0.0.1:18545',
      })
    ).toEqual([
      'run',
      '--detach',
      '--name',
      'lucid-tempo-e2e',
      '--publish',
      '127.0.0.1:18545:54515',
      TEMPO_IMAGE,
      'node',
      '--authrpc.port',
      '54545',
      '--datadir',
      '/tmp/lucid-tempo-e2e',
      '--dev',
      '--dev.block-time',
      '200ms',
      '--dev.mnemonic',
      'test test test test test test test test test test test junk',
      '--engine.disable-precompile-cache',
      '--engine.legacy-state-root',
      '--faucet.address',
      '0x20c0000000000000000000000000000000000000',
      '0x20c0000000000000000000000000000000000001',
      '0x20c0000000000000000000000000000000000002',
      '0x20c0000000000000000000000000000000000003',
      '--faucet.amount',
      '1000000000000',
      '--faucet.enabled',
      '--faucet.private-key',
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '--http.addr',
      '0.0.0.0',
      '--http.api',
      'all',
      '--http.corsdomain',
      '*',
      '--http.port',
      '54515',
      '--port',
      '54525',
      '--ws.port',
      '54535',
    ]);
  });

  test('requires the reviewed source revision from the pinned image', () => {
    expect(() =>
      assertTempoSourceRevision('0dcf32250f0ff29791b5940e30c9084232cd6d43\n')
    ).not.toThrow();
    expect(() => assertTempoSourceRevision('unknown')).toThrow(
      'expected Tempo source revision 0dcf32250f0ff29791b5940e30c9084232cd6d43, received unknown'
    );
  });

  test('redacts deterministic credentials and payment material from diagnostics', () => {
    const diagnostic = [
      "mnemonic='test test test test test test test test test test test junk'",
      'privateKey=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      'Authorization: Payment credential-value',
      'signature=0xdeadbeef',
      'rawTransaction: 0xfeedface',
      'transactionHash: 0xsafe-to-retain',
      '{"signature":"0xjson-secret","authorization":"Payment json-secret","transactionHash":"0xjson-safe"}',
    ].join('\n');

    expect(redactTempoDiagnostics(diagnostic)).toBe(
      [
        "mnemonic='[REDACTED]'",
        'privateKey=[REDACTED]',
        'Authorization: [REDACTED]',
        'signature=[REDACTED]',
        'rawTransaction: [REDACTED]',
        'transactionHash: 0xsafe-to-retain',
        '{"signature":"[REDACTED]","authorization":"[REDACTED]","transactionHash":"0xjson-safe"}',
      ].join('\n')
    );
  });

  test('always removes the exact container when the E2E command fails', async () => {
    const dockerCalls: string[][] = [];
    const diagnostics: string[] = [];

    await expect(
      runTempoLocalnet(['bun', 'test', 'tempo-localnet.e2e.ts'], {
        containerName: 'lucid-tempo-e2e-test',
        dependencies: {
          delay: async () => {},
          fetchJson: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: '0x539',
          }),
          log: message => diagnostics.push(message),
          runChild: async () => {
            throw new Error('child process failed');
          },
          runDocker: async args => {
            dockerCalls.push(args);
            if (args[0] === 'image') {
              return {
                exitCode: 0,
                stderr: '',
                stdout: `${TEMPO_SOURCE_REVISION}\n`,
              };
            }
            if (args[0] === 'logs') {
              return {
                exitCode: 0,
                stderr: '',
                stdout:
                  'signature=0xsecret\ntransactionHash: 0xdiagnostic-hash',
              };
            }
            return { exitCode: 0, stderr: '', stdout: '' };
          },
        },
      })
    ).rejects.toThrow('child process failed');

    expect(dockerCalls.at(-1)).toEqual([
      'rm',
      '--force',
      'lucid-tempo-e2e-test',
    ]);
    expect(diagnostics.join('\n')).not.toContain('0xsecret');
    expect(diagnostics.join('\n')).toContain('0xdiagnostic-hash');
  });
});
