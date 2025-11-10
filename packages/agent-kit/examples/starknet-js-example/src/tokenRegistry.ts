import { z } from "zod";
import tokenList from "./token_list.json";

const tokenSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, "Token address must be 0x-prefixed hex"),
  decimals: z.number().int().nonnegative(),
});

const tokenListSchema = z.object({
  availableTokens: z.array(tokenSchema).min(1),
});

const parsed = tokenListSchema.parse(tokenList);

export type TokenMetadata = z.infer<typeof tokenSchema>;

export const AVAILABLE_TOKENS: TokenMetadata[] = parsed.availableTokens;
