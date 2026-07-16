import { createAgent } from '@lucid-agents/core';
import { a2a } from '@lucid-agents/a2a';
import { http } from '@lucid-agents/http';
import { custom, mpp } from '@lucid-agents/mpp';
import { payments } from '@lucid-agents/payments';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';

import { createAgentApp } from '../app';

function paymentCredential(response: Response): string {
  return Credential.serialize({
    challenge: Challenge.fromResponse(response),
    payload: { proof: 'test' },
  });
}

function x402PaymentSignature(
  challengeResponse: Response,
  payer: string
): string {
  const requiredHeader = challengeResponse.headers.get('PAYMENT-REQUIRED');
  if (!requiredHeader) throw new Error('Missing PAYMENT-REQUIRED header');
  const challenge = JSON.parse(
    Buffer.from(requiredHeader, 'base64').toString('utf8')
  ) as {
    x402Version: number;
    resource: Record<string, unknown>;
    accepts: Array<Record<string, unknown>>;
  };
  return Buffer.from(
    JSON.stringify({
      x402Version: challenge.x402Version,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      payload: {
        signature: 'test-signature',
        authorization: { from: payer },
      },
    })
  ).toString('base64');
}

const originalFetch = globalThis.fetch;
let throwDuringSettlement = false;

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.endsWith('/supported')) {
      return Response.json({
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network: 'eip155:84532',
            asset: {
              address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              decimals: 6,
              eip712: { name: 'USDC', version: '2' },
            },
          },
        ],
      });
    }
    if (url.endsWith('/verify')) {
      return Response.json({
        isValid: true,
        payer: '0x1234567890123456789012345678901234567890',
      });
    }
    if (url.endsWith('/settle')) {
      if (throwDuringSettlement) {
        throw new Error('settlement transport unavailable');
      }
      return Response.json({
        success: true,
        payer: '0x1234567890123456789012345678901234567890',
        transaction: '0xtest',
        network: 'eip155:84532',
      });
    }
    return Response.json({ error: 'Unexpected request' }, { status: 500 });
  }) as unknown as typeof globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  throwDuringSettlement = false;
});

describe('task authorization', () => {
  it('rejects auth-only entrypoints without a SIWX runtime', async () => {
    const builder = createAgent({
      name: 'task-missing-siwx-runtime-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .addEntrypoint({
        key: 'unprotected-private-task',
        siwx: { authOnly: true },
        handler: async () => ({ output: { ok: true } }),
      });

    await expect(builder.build()).rejects.toThrow('SIWX runtime');
  });

  it('rejects a priced entrypoint with ambiguous payment rails', async () => {
    const builder = createAgent({
      name: 'task-payment-rail-conflict-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
          },
        })
      )
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            currency: 'usd',
            verifyCredential: async () => ({ valid: true }),
          },
        })
      )
      .addEntrypoint({
        key: 'ambiguous-payment-task',
        price: '0.001',
        handler: async () => ({ output: { ok: true } }),
      });

    await expect(builder.build()).rejects.toThrow('paymentProtocol');
  });

  it('uses only the explicitly selected payment rail', async () => {
    let mppVerifications = 0;
    const runtime = await createAgent({
      name: 'task-payment-rail-selection-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
          },
        })
      )
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            currency: 'usd',
            verifyCredential: async ({ credential }) => {
              mppVerifications += 1;
              return {
                valid: credential.payload.proof === 'test',
              };
            },
          },
        })
      )
      .addEntrypoint({
        key: 'mpp-selected-task',
        price: '0.001',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { rail: 'mpp' } }),
      })
      .addEntrypoint({
        key: 'x402-selected-task',
        price: '0.001',
        paymentProtocol: 'x402',
        handler: async () => ({ output: { rail: 'x402' } }),
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const taskRequest = (skillId: string, headers?: Record<string, string>) =>
      app.request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          skillId,
          message: {
            role: 'user',
            content: { text: JSON.stringify({}) },
          },
        }),
      });

    const mppChallenge = await taskRequest('mpp-selected-task');
    const mppResponse = await taskRequest('mpp-selected-task', {
      Authorization: paymentCredential(mppChallenge),
    });
    expect(mppResponse.status).toBe(200);
    expect(mppVerifications).toBe(1);

    const x402Challenge = await taskRequest('x402-selected-task', {
      Payment: 'mpp-credential',
    });
    expect(x402Challenge.status).toBe(402);
    expect(x402Challenge.headers.get('PAYMENT-REQUIRED')).toBeTruthy();
    expect(mppVerifications).toBe(1);
  });

  it('applies incoming sender policies to verified MPP task credentials', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'mpp-task-policy-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            policyGroups: [
              {
                name: 'verified-mpp-sender',
                allowedSenders: ['0x0000000000000000000000000000000000000001'],
              },
            ],
          },
        })
      )
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            currency: 'usd',
            verifyCredential: async () => ({
              valid: true,
              payer: '0x0000000000000000000000000000000000000002',
            }),
          },
        })
      )
      .addEntrypoint({
        key: 'mpp-policy-task',
        price: '0.001',
        paymentProtocol: 'mpp',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'mpp-policy-task',
      message: { role: 'user', content: { text: '{}' } },
    });
    const challenge = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: paymentCredential(challenge),
      },
      body,
    });

    expect(response.status).toBe(403);
    expect(executions).toBe(0);
  });

  it('does not execute a priced entrypoint without payment', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-authorization-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
          },
        })
      )
      .addEntrypoint({
        key: 'paid-task',
        price: '1000',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);

    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillId: 'paid-task',
        message: {
          role: 'user',
          content: { text: JSON.stringify({}) },
        },
      }),
    });

    expect(response.status).toBe(402);
    expect(executions).toBe(0);
  });

  it('does not execute an auth-only entrypoint without SIWX', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-auth-only-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            siwx: {
              enabled: true,
              storage: { type: 'in-memory' },
              verify: { skipSignatureVerification: true },
            },
          },
        })
      )
      .addEntrypoint({
        key: 'private-task',
        siwx: { authOnly: true },
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);

    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillId: 'private-task',
        message: {
          role: 'user',
          content: { text: JSON.stringify({}) },
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(executions).toBe(0);
  });

  it('executes an MPP task after credential verification', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-mpp-verification-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            currency: 'usd',
            verifyCredential: async ({ credential }) => ({
              valid: credential.payload.proof === 'test',
              receipt: 'task-receipt',
            }),
          },
        })
      )
      .addEntrypoint({
        key: 'paid-mpp-task',
        price: '1000',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);

    const requestBody = JSON.stringify({
      skillId: 'paid-mpp-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });
    const challenge = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: paymentCredential(challenge),
      },
      body: requestBody,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Payment-Receipt')).toBe('task-receipt');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('executes an x402 task after verification and settlement', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-x402-verification-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
          },
        })
      )
      .addEntrypoint({
        key: 'paid-x402-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'paid-x402-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });

    const challengeResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const requiredHeader = challengeResponse.headers.get('PAYMENT-REQUIRED');
    const challenge = JSON.parse(
      Buffer.from(requiredHeader!, 'base64').toString('utf8')
    ) as {
      x402Version: number;
      resource: Record<string, unknown>;
      accepts: Array<Record<string, unknown>>;
    };
    expect(challenge.accepts).toHaveLength(1);

    const paymentPayload = Buffer.from(
      JSON.stringify({
        x402Version: challenge.x402Version,
        resource: challenge.resource,
        accepted: challenge.accepts[0],
        payload: { signature: 'test-signature' },
      })
    ).toString('base64');
    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': paymentPayload,
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('PAYMENT-RESPONSE')).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('contains settlement transport failures and releases policy reservations', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-settlement-failure-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            policyGroups: [
              {
                name: 'settlement-reservation',
                rateLimits: { maxPayments: 1, windowMs: 60_000 },
              },
            ],
          },
        })
      )
      .addEntrypoint({
        key: 'settlement-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'settlement-task',
      message: { role: 'user', content: { text: '{}' } },
    });
    const challenge = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const signature = x402PaymentSignature(
      challenge,
      '0x1234567890123456789012345678901234567890'
    );
    const paidRequest = () =>
      app.request('http://localhost/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': signature,
        },
        body,
      });

    throwDuringSettlement = true;
    const failed = await paidRequest();
    throwDuringSettlement = false;
    const retried = await paidRequest();

    expect(failed.status).toBe(402);
    expect(retried.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('defers payer allowlists until x402 has verified the payer', async () => {
    const payer = '0x1234567890123456789012345678901234567890';
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-payer-allowlist-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            policyGroups: [{ name: 'known-payers', allowedSenders: [payer] }],
          },
        })
      )
      .addEntrypoint({
        key: 'allowlisted-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'allowlisted-task',
      message: { role: 'user', content: { text: JSON.stringify({}) } },
    });
    const challenge = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(challenge.status).toBe(402);
    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': x402PaymentSignature(challenge, payer),
      },
      body,
    });

    expect(response.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('blocks a verified payer before creating an x402 task', async () => {
    const payer = '0x1234567890123456789012345678901234567890';
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-payer-blocklist-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            policyGroups: [{ name: 'blocked-payers', blockedSenders: [payer] }],
          },
        })
      )
      .addEntrypoint({
        key: 'blocked-payer-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'blocked-payer-task',
      message: { role: 'user', content: { text: JSON.stringify({}) } },
    });
    const challenge = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(challenge.status).toBe(402);
    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': x402PaymentSignature(challenge, payer),
      },
      body,
    });

    expect(response.status).toBe(403);
    expect(executions).toBe(0);
  });

  it('enforces incoming payment limits before creating a task', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-incoming-policy-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            policyGroups: [
              {
                name: 'task-receivables-cap',
                incomingLimits: {
                  global: { maxPaymentUsd: 0.0005 },
                },
              },
            ],
          },
        })
      )
      .addEntrypoint({
        key: 'limited-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);

    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillId: 'limited-task',
        message: {
          role: 'user',
          content: { text: JSON.stringify({}) },
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(executions).toBe(0);
  });

  it('records settlement before admitting another task', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-settlement-policy-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            policyGroups: [
              {
                name: 'task-total-cap',
                incomingLimits: {
                  global: { maxTotalUsd: 0.0015 },
                },
              },
            ],
          },
        })
      )
      .addEntrypoint({
        key: 'capped-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'capped-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });

    const challengeResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const challenge = JSON.parse(
      Buffer.from(
        challengeResponse.headers.get('PAYMENT-REQUIRED')!,
        'base64'
      ).toString('utf8')
    ) as {
      x402Version: number;
      resource: Record<string, unknown>;
      accepts: Array<Record<string, unknown>>;
    };
    const paidResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': Buffer.from(
          JSON.stringify({
            x402Version: challenge.x402Version,
            resource: challenge.resource,
            accepted: challenge.accepts[0],
            payload: { signature: 'test-signature' },
          })
        ).toString('base64'),
      },
      body,
    });
    expect(paidResponse.status).toBe(200);

    const secondResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(secondResponse.status).toBe(403);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('does not let concurrent payments exceed an incoming total', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-concurrent-policy-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            policyGroups: [
              {
                name: 'concurrent-task-cap',
                incomingLimits: {
                  global: { maxTotalUsd: 0.0015 },
                },
              },
            ],
          },
        })
      )
      .addEntrypoint({
        key: 'concurrent-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'concurrent-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });
    const challengeResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const challenge = JSON.parse(
      Buffer.from(
        challengeResponse.headers.get('PAYMENT-REQUIRED')!,
        'base64'
      ).toString('utf8')
    ) as {
      x402Version: number;
      resource: Record<string, unknown>;
      accepts: Array<Record<string, unknown>>;
    };
    const paymentSignature = Buffer.from(
      JSON.stringify({
        x402Version: challenge.x402Version,
        resource: challenge.resource,
        accepted: challenge.accepts[0],
        payload: { signature: 'test-signature' },
      })
    ).toString('base64');
    const paidRequest = () =>
      app.request('http://localhost/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentSignature,
        },
        body,
      });

    const responses = await Promise.all([paidRequest(), paidRequest()]);

    expect(responses.map(response => response.status).sort()).toEqual([
      200, 403,
    ]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('does not let concurrent payments exceed an incoming rate limit', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-concurrent-rate-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            policyGroups: [
              {
                name: 'concurrent-task-rate',
                rateLimits: { maxPayments: 1, windowMs: 60_000 },
              },
            ],
          },
        })
      )
      .addEntrypoint({
        key: 'rate-limited-task',
        price: '0.001',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'rate-limited-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });
    const challengeResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const challenge = JSON.parse(
      Buffer.from(
        challengeResponse.headers.get('PAYMENT-REQUIRED')!,
        'base64'
      ).toString('utf8')
    ) as {
      x402Version: number;
      resource: Record<string, unknown>;
      accepts: Array<Record<string, unknown>>;
    };
    const paymentSignature = Buffer.from(
      JSON.stringify({
        x402Version: challenge.x402Version,
        resource: challenge.resource,
        accepted: challenge.accepts[0],
        payload: { signature: 'test-signature' },
      })
    ).toString('base64');
    const paidRequest = () =>
      app.request('http://localhost/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentSignature,
        },
        body,
      });

    const responses = await Promise.all([paidRequest(), paidRequest()]);

    expect(responses.map(response => response.status).sort()).toEqual([
      200, 403,
    ]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
    await runtime.close();
  });

  it('executes an auth-only task after SIWX verification', async () => {
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    let authenticatedAddress: string | undefined;
    const runtime = await createAgent({
      name: 'task-siwx-verification-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            siwx: {
              enabled: true,
              storage: { type: 'in-memory' },
              verify: { skipSignatureVerification: true },
            },
          },
        })
      )
      .addEntrypoint({
        key: 'authenticated-task',
        siwx: { authOnly: true },
        handler: async context => {
          authenticatedAddress = context.auth?.address;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const siwx = Buffer.from(
      JSON.stringify({
        domain: 'localhost',
        address: walletAddress,
        uri: 'http://localhost/tasks',
        version: '1',
        chainId: 'eip155:84532',
        nonce: `task-siwx-${Date.now()}`,
        issuedAt: new Date().toISOString(),
      })
    ).toString('base64');

    const response = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SIGN-IN-WITH-X': siwx,
      },
      body: JSON.stringify({
        skillId: 'authenticated-task',
        message: {
          role: 'user',
          content: { text: JSON.stringify({}) },
        },
      }),
    });

    expect(response.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(authenticatedAddress).toBe(walletAddress);
  });

  it('rejects malformed and replayed SIWX credentials for auth-only tasks', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'task-siwx-replay-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            siwx: {
              enabled: true,
              storage: { type: 'in-memory' },
              verify: { skipSignatureVerification: true },
            },
          },
        })
      )
      .addEntrypoint({
        key: 'replay-protected-task',
        siwx: { authOnly: true },
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'replay-protected-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });

    const malformedResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SIGN-IN-WITH-X': 'not-a-credential',
      },
      body,
    });
    expect(malformedResponse.status).toBe(401);

    const credential = Buffer.from(
      JSON.stringify({
        domain: 'localhost',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        uri: 'http://localhost/tasks',
        version: '1',
        chainId: 'eip155:84532',
        nonce: `task-replay-${Date.now()}`,
        issuedAt: new Date().toISOString(),
      })
    ).toString('base64');
    const authenticatedRequest = () =>
      app.request('http://localhost/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'SIGN-IN-WITH-X': credential,
        },
        body,
      });

    expect((await authenticatedRequest()).status).toBe(200);
    expect((await authenticatedRequest()).status).toBe(401);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(executions).toBe(1);
  });

  it('records a paid task entitlement and reuses it through SIWX', async () => {
    const payer = '0x1234567890123456789012345678901234567890';
    const grants: Array<string | undefined> = [];
    const runtime = await createAgent({
      name: 'task-siwx-entitlement-test',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            siwx: {
              enabled: true,
              storage: { type: 'in-memory' },
              verify: { skipSignatureVerification: true },
            },
          },
        })
      )
      .addEntrypoint({
        key: 'reusable-paid-task',
        price: '0.001',
        siwx: { enabled: true },
        handler: async context => {
          grants.push(context.auth?.grantedBy);
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const body = JSON.stringify({
      skillId: 'reusable-paid-task',
      message: {
        role: 'user',
        content: { text: JSON.stringify({}) },
      },
    });

    const challengeResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(challengeResponse.status).toBe(402);
    expect(challengeResponse.headers.get('X-SIWX-EXTENSION')).toBeTruthy();
    const challenge = JSON.parse(
      Buffer.from(
        challengeResponse.headers.get('PAYMENT-REQUIRED')!,
        'base64'
      ).toString('utf8')
    ) as {
      x402Version: number;
      resource: Record<string, unknown>;
      accepts: Array<Record<string, unknown>>;
    };
    const paymentPayload = Buffer.from(
      JSON.stringify({
        x402Version: challenge.x402Version,
        resource: challenge.resource,
        accepted: challenge.accepts[0],
        payload: { signature: 'test-signature' },
      })
    ).toString('base64');

    const paidResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': paymentPayload,
      },
      body,
    });
    expect(paidResponse.status).toBe(200);

    const credential = Buffer.from(
      JSON.stringify({
        domain: 'localhost',
        address: payer,
        uri: 'http://localhost/tasks',
        version: '1',
        chainId: 'eip155:84532',
        nonce: `task-entitlement-${Date.now()}`,
        issuedAt: new Date().toISOString(),
      })
    ).toString('base64');
    const reuseResponse = await app.request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SIGN-IN-WITH-X': credential,
      },
      body,
    });

    expect(reuseResponse.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(grants).toEqual([undefined, 'entitlement']);
  });
});
