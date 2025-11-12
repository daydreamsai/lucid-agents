import { type CreateX402LLMOptions } from '@lucid-agents/agent-kit-payments';

export interface AIProvider {
  create(options: CreateX402LLMOptions): any;
}
