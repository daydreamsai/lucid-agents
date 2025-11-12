import {
  createX402LLM,
  type CreateX402LLMOptions,
} from '@lucid-agents/agent-kit-payments';
import type { AIProvider } from './provider';

export class LocalProvider implements AIProvider {
  create(options: CreateX402LLMOptions) {
    if (!options.ai) {
      throw new Error('Missing AI configuration for local provider');
    }

    const { apiKey, apiURL, ...rest } = options.ai;

    return createX402LLM({
      ...options,
      ai: {
        ...rest,
        apiURL: apiURL || 'http://localhost:11434/v1',
        apiKey: apiKey || 'ollama',
      },
    });
  }
}
