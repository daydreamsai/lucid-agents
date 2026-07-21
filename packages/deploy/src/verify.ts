import { errorMessage, redact } from './redaction';

type VerificationContext = {
  sensitiveValues: ReadonlySet<string>;
  log: (message: string) => void;
};

const VERIFY_ATTEMPTS = 3;
const VERIFY_RETRY_DELAY_MS = 400;
const VERIFY_TIMEOUT_MS = 10_000;

export async function verifyDeployment(
  previewUrl: string,
  context: VerificationContext
): Promise<void> {
  const checks: Array<{
    path: string;
    validate?: (response: Response) => Promise<void>;
  }> = [
    { path: '/' },
    {
      path: '/health',
      validate: async response => {
        const body = await readJsonObject(response);
        if (body.ok !== true) {
          throw new Error('response does not report ok=true');
        }
      },
    },
    {
      path: '/.well-known/agent-card.json',
      validate: async response => {
        const body = await readJsonObject(response);
        if (
          typeof body.name !== 'string' ||
          body.name.trim().length === 0 ||
          typeof body.version !== 'string' ||
          body.version.trim().length === 0
        ) {
          throw new Error('response is not a valid Agent Card');
        }
      },
    },
  ];

  for (const check of checks) {
    await verifyEndpoint(
      previewUrl,
      check.path,
      context.sensitiveValues,
      check.validate
    );
    context.log(`Verified ${check.path}`);
  }
}

async function readJsonObject(
  response: Response
): Promise<Record<string, unknown>> {
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('response is not a JSON object');
  }
  return body as Record<string, unknown>;
}

async function verifyEndpoint(
  baseUrl: string,
  path: string,
  sensitiveValues: ReadonlySet<string>,
  validate?: (response: Response) => Promise<void>
): Promise<void> {
  let lastError: unknown;
  const url = new URL(path, `${baseUrl.replace(/\/$/u, '')}/`);
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = redact(
          (await response.text()).slice(0, 500),
          sensitiveValues
        );
        throw new Error(
          `received ${response.status}${body ? ` (${body})` : ''}`
        );
      }
      await validate?.(response);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < VERIFY_ATTEMPTS) {
        await new Promise(resolvePromise =>
          setTimeout(resolvePromise, VERIFY_RETRY_DELAY_MS)
        );
      }
    }
  }
  throw new Error(
    `Deployment verification failed for ${path}: ${redact(errorMessage(lastError), sensitiveValues)}`
  );
}
