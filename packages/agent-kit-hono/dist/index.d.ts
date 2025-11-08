import * as _lucid_agents_agent_kit from '@lucid-agents/agent-kit';
import { AgentMeta, CreateAgentHttpOptions, EntrypointDef, PaymentsConfig } from '@lucid-agents/agent-kit';
import * as _lucid_agents_agent_core from '@lucid-agents/agent-core';
import * as hono_types from 'hono/types';
import { Hono } from 'hono';
import { paymentMiddleware } from 'x402-hono';
import { FacilitatorConfig } from 'x402/types';
import { z } from 'zod';

type CreateAgentAppOptions = CreateAgentHttpOptions & {
    /**
     * Hook called before mounting agent routes.
     * Use this to register custom middleware that should run before agent handlers.
     */
    beforeMount?: (app: Hono) => void;
    /**
     * Hook called after mounting all agent routes.
     * Use this to register additional custom routes or error handlers.
     */
    afterMount?: (app: Hono) => void;
};
declare function createAgentApp(meta: AgentMeta, opts?: CreateAgentAppOptions): {
    app: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;
    agent: _lucid_agents_agent_core.AgentCore;
    addEntrypoint: (def: EntrypointDef) => void;
    config: _lucid_agents_agent_kit.ResolvedAgentKitConfig;
    readonly payments: _lucid_agents_agent_kit.PaymentsConfig | undefined;
};

type PaymentMiddlewareFactory = typeof paymentMiddleware;
type WithPaymentsParams = {
    app: Hono;
    path: string;
    entrypoint: EntrypointDef;
    kind: "invoke" | "stream";
    payments?: PaymentsConfig;
    facilitator?: FacilitatorConfig;
    middlewareFactory?: PaymentMiddlewareFactory;
};
declare function withPayments({ app, path, entrypoint, kind, payments, facilitator, middlewareFactory, }: WithPaymentsParams): boolean;

declare function toJsonSchemaOrUndefined(s?: z.ZodTypeAny): z.core.JSONSchema.JSONSchema | undefined;

export { type CreateAgentAppOptions, type WithPaymentsParams, createAgentApp, toJsonSchemaOrUndefined, withPayments };
