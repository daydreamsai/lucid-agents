export type AwalCliTransportConfig = {
  type: 'cli';
  /** Shell command used to invoke awal. Defaults to `npx -y awal@latest`. */
  command?: string;
  /** Optional argument override appended before the action name. */
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export type AwalTransportConfig = AwalCliTransportConfig;

export type AwalConfig = {
  transport?: AwalTransportConfig;
};

export type PayX402RequestOptions = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  timeoutMs?: number;
};

export type SendOptions = {
  asset?: string;
  network?: string;
  memo?: string;
};

export type TradeOptions = {
  slippageBps?: number;
  network?: string;
};

export type AwalWalletMetadata = {
  address: string | null;
  network: string | null;
  accountId: string | null;
  raw?: unknown;
};

export type AwalSendResult = {
  ok: boolean;
  raw: unknown;
};

export type AwalTradeResult = {
  ok: boolean;
  raw: unknown;
};

export type AwalBalanceResult = {
  raw: unknown;
};

export type AwalRuntime = {
  readonly config: AwalConfig;
  payX402Request: (url: string, options?: PayX402RequestOptions) => Promise<Response>;
  send: (amount: string, recipient: string, options?: SendOptions) => Promise<AwalSendResult>;
  balance: () => Promise<AwalBalanceResult>;
  trade: (
    amount: string,
    from: string,
    to: string,
    options?: TradeOptions
  ) => Promise<AwalTradeResult>;
  getWalletMetadata: () => Promise<AwalWalletMetadata>;
};
