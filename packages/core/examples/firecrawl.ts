import { z } from 'zod';
import { createAgentApp } from '@lucid-agents/hono';
import { AgentKitConfig, createAxLLMClient } from '@lucid-agents/core';
import { flow } from '@ax-llm/ax';
import {
  createSigner,
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  type Hex,
} from 'x402-fetch';

/**
 * This example shows how to combine `createAxLLMClient` with a small AxFlow
 * pipeline. The flow scrapes a public webpage with Firecrawl and then produces
 * a concise summary together with the key takeaways.
 *
 * Required environment variables:
 *   - OPENAI_API_KEY   (passed through to @ax-llm/ax)
 *   - PRIVATE_KEY      (used for x402 payments)
 * Optional environment variables:
 *   - FIRECRAWL_SEARCH_URL (override the Firecrawl on-demand search endpoint)
 *   - FIRECRAWL_AUTH_TOKEN (Bearer token for the endpoint, if required)
 *   - X402_NETWORK        (chain identifier for createSigner, defaults to base-sepolia)
 */

const axClient = createAxLLMClient({
  apiUrl: 'https://api-beta.daydreams.systems/v1',
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[examples] ${message}`, error);
      } else {
        console.warn(`[examples] ${message}`);
      }
    },
  },
});

if (!axClient.isConfigured()) {
  console.warn(
    '[examples] Ax LLM provider not configured — the flow will fall back to scripted output.'
  );
}

const firecrawlSearchEndpoint =
  process.env.FIRECRAWL_SEARCH_URL ??
  'https://api.firecrawl.dev/v1/x402/search';
const firecrawlAuthToken = 'fc-c1e849dd9b9644f3ac8b2b6419ea793b';
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
const x402Network = (process.env.X402_NETWORK ?? 'base') as Parameters<
  typeof createSigner
>[0];

if (!privateKey) {
  console.warn(
    '[examples] Firecrawl pay-per-use search disabled — set PRIVATE_KEY to enable x402 payments.'
  );
}

type FetchWithPayment = (
  input: RequestInfo,
  init?: RequestInit
) => Promise<Response>;

let fetchWithPaymentInstance: FetchWithPayment | null = null;
let fetchWithPaymentPromise: Promise<FetchWithPayment> | null = null;

async function getFetchWithPayment(): Promise<FetchWithPayment> {
  const key = privateKey;
  if (!key) {
    throw new Error(
      'PRIVATE_KEY environment variable must be set to sign Firecrawl payments.'
    );
  }

  if (fetchWithPaymentInstance) {
    return fetchWithPaymentInstance;
  }

  if (!fetchWithPaymentPromise) {
    fetchWithPaymentPromise = createSigner(x402Network, key).then(signer => {
      const prepared = wrapFetchWithPayment(fetch, signer);
      fetchWithPaymentInstance = prepared;
      return prepared;
    });
  }

  return fetchWithPaymentPromise;
}

type FirecrawlSearchResult = {
  content: string;
  sourceUrl: string;
};

async function scrapePageContent(url: string): Promise<FirecrawlSearchResult> {
  const fetchWithPayment = await getFetchWithPayment();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (firecrawlAuthToken) {
    headers.Authorization = firecrawlAuthToken.startsWith('Bearer ')
      ? firecrawlAuthToken
      : `Bearer ${firecrawlAuthToken}`;
  }

  const response = await fetchWithPayment(firecrawlSearchEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: url,
      limit: 1,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Firecrawl pay-per-use search failed with status ${response.status}${
        errorBody ? `: ${errorBody}` : ''
      }`
    );
  }

  const paymentHeader = response.headers.get('x-payment-response');
  if (paymentHeader) {
    try {
      decodeXPaymentResponse(paymentHeader);
    } catch (error) {
      console.warn(
        '[examples] Failed to decode x-payment-response header.',
        error
      );
    }
  }

  type FirecrawlPayload = {
    success?: boolean;
    data?: Array<{
      url?: string;
      markdown?: string;
      content?: string;
      description?: string;
    }>;
    error?: string;
  };

  const payload = (await response.json()) as FirecrawlPayload;
  if (!payload?.success) {
    throw new Error(
      payload?.error ??
        'Firecrawl pay-per-use search returned an error payload.'
    );
  }

  const result = Array.isArray(payload.data) ? payload.data[0] : undefined;
  if (!result) {
    throw new Error(
      'Firecrawl returned no search results for the provided URL.'
    );
  }

  const markdown =
    typeof result.markdown === 'string' ? result.markdown.trim() : '';
  const rawContent =
    typeof result.content === 'string' ? result.content.trim() : '';
  const description =
    typeof result.description === 'string' ? result.description.trim() : '';

  const content = markdown || rawContent || description;
  if (!content) {
    throw new Error(
      'Firecrawl returned an empty payload for the provided URL.'
    );
  }

  return {
    content,
    sourceUrl: typeof result.url === 'string' ? result.url : url,
  };
}

const siteSummaryFlow = flow<{
  url: string;
  pageContent?: string;
  sourceUrl?: string;
}>()
  .map(async state => {
    if (!state.url) return state;
    const { content, sourceUrl } = await scrapePageContent(state.url);
    const trimmedContent =
      content.length > 12_000
        ? `${content.slice(0, 11_500)}\n\n[truncated for summarization]`
        : content;

    return {
      ...state,
      pageContent: trimmedContent,
      sourceUrl,
    };
  })
  .node(
    'summarizer',
    'pageContent:string -> summary:string "Summarise the page in three short paragraphs."'
  )
  .node(
    'highlighter',
    'summary:string -> highlights:string[] "List three concise takeaways that capture the essence of the page."'
  )
  .execute('summarizer', state => ({
    pageContent: state.pageContent ?? '',
  }))
  .execute('highlighter', state => ({
    summary: state.summarizerResult.summary as string,
  }))
  .returns(state => ({
    summary: String(state.summarizerResult.summary ?? ''),
    highlights: Array.isArray(state.highlighterResult.highlights)
      ? (state.highlighterResult.highlights as string[])
      : [],
    sourceUrl: state.sourceUrl ?? state.url,
  }));

const config: AgentKitConfig = {
  payments: {
    payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    network: 'base',
    defaultPrice: process.env.DEFAULT_PRICE ?? '0.03',
  },
};

const { app, addEntrypoint } = createAgentApp(
  {
    name: 'Summarisation Agent',
    version: '0.0.1',
    description: 'Summarises a URL with Firecrawl.',
  },
  { config }
);

addEntrypoint({
  key: 'summarize-url',
  description: 'Summarises a URL with Firecrawl.',
  input: z.object({
    url: z
      .string()
      .min(1, { message: 'Provide a URL to summarise.' })
      .describe('Public webpage to scrape and summarise.'),
  }),
  output: z.object({
    summary: z.string(),
    highlights: z.array(z.string()),
    sourceUrl: z.string(),
  }),
  async handler(ctx) {
    const rawUrl = String(ctx.input.url ?? '').trim();
    if (!rawUrl) {
      throw new Error('URL cannot be empty.');
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = new URL(rawUrl).toString();
    } catch {
      throw new Error('Provide a valid absolute URL (including protocol).');
    }

    if (!privateKey) {
      return {
        output: {
          summary:
            'Firecrawl pay-per-use search is not configured. Set PRIVATE_KEY to enable payment signing.',
          highlights: [
            'The agent cannot scrape websites without a PRIVATE_KEY for x402 payments.',
            'Optional: set FIRECRAWL_AUTH_TOKEN if the endpoint requires bearer authentication.',
            `Requested URL: ${normalizedUrl}`,
          ],
          sourceUrl: normalizedUrl,
        },
        model: 'firecrawl-not-configured',
      };
    }

    const llm = axClient.ax;
    if (!llm) {
      const fallbackSummary =
        'Ax LLM provider is not configured. Set OPENAI_API_KEY to enable summarisation.';
      return {
        output: {
          summary: fallbackSummary,
          highlights: [
            'Set OPENAI_API_KEY to enable the Ax integration.',
            'Provide a PRIVATE_KEY so x402 can sign Firecrawl payment requests.',
            'Re-run the request once credentials are configured.',
          ],
          sourceUrl: normalizedUrl,
        },
        model: 'axllm-fallback',
      };
    }

    try {
      const result = await siteSummaryFlow.forward(llm, { url: normalizedUrl });
      const usageEntry = siteSummaryFlow.getUsage().at(-1);
      siteSummaryFlow.resetUsage();

      return {
        output: {
          summary: result.summary ?? '',
          highlights: Array.isArray(result.highlights) ? result.highlights : [],
          sourceUrl: result.sourceUrl ?? normalizedUrl,
        },
        model: usageEntry?.model,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Unexpected error while summarising the page.');
    }
  },
});

const port = Number(process.env.PORT ?? 8787);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `🚀 Agent ready at https://${server.hostname}:${server.port}/.well-known/agent.json`
);
