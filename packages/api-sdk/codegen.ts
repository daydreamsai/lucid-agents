import { createClient } from '@hey-api/openapi-ts';

const OPENAPI_URL =
  process.env.OPENAPI_URL || 'https://api-lucid-dev.daydreams.systems/doc';

// Validate URL format
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Retry with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

// Validate URL before proceeding
if (!isValidUrl(OPENAPI_URL)) {
  console.error(`Invalid OpenAPI URL: ${OPENAPI_URL}`);
  process.exit(1);
}

console.log(`Generating SDK from OpenAPI spec: ${OPENAPI_URL}`);

try {
  await withRetry(async () => {
    await createClient({
      input: OPENAPI_URL,
      output: './src/sdk',
      plugins: ['@tanstack/react-query'],
    });
  });
  console.log('✅ SDK generated successfully');
} catch (error) {
  console.error('❌ Failed to generate SDK:', error);
  process.exit(1);
}
