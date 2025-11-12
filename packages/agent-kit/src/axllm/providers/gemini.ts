import {
  createX402LLM,
  type CreateX402LLMOptions,
} from '@lucid-agents/agent-kit-payments';
import type { AIProvider } from './provider';

export class GeminiProvider implements AIProvider {
  create(options: CreateX402LLMOptions) {
    return createX402LLM(options);
  }
}
