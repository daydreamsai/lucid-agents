import { Account, Contract, RpcProvider, uint256 } from "starknet";
import { readStarknetConfig } from "./config";
import { AVAILABLE_TOKENS, TokenMetadata } from "./tokenRegistry";

type BalanceResult = {
  address: string;
  contractAddress: string;
  wei: string;
  formatted: string;
  decimals: number;
};

let provider: RpcProvider | null = null;
let account: Account | null = null;
let ethContract: Contract | null = null;

function getProvider(): RpcProvider {
  if (provider) {
    return provider;
  }

  const config = readStarknetConfig();
  provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  return provider;
}

export function getAccount(): Account {
  if (account) {
    return account;
  }

  const config = readStarknetConfig();
  if (!config.accountAddress || !config.privateKey) {
    throw new Error(
      "STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY must be set to use Account features"
    );
  }

  account = new Account({
    provider: getProvider(),
    address: config.accountAddress,
    signer: config.privateKey,
  });
  return account;
}

async function getEthContract(): Promise<Contract> {
  if (ethContract) {
    return ethContract;
  }

  const config = readStarknetConfig();
  const providerInstance = getProvider();
  const classInfo = await providerInstance.getClassAt(
    config.ethContractAddress
  );

  if (!classInfo.abi) {
    throw new Error("ETH contract ABI not found");
  }

  ethContract = new Contract({
    abi: classInfo.abi,
    address: config.ethContractAddress,
    providerOrAccount: providerInstance,
  });

  return ethContract;
}

function formatUnits(value: bigint, decimals: number): string {
  if (decimals === 0) {
    return value.toString();
  }

  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const str = absolute.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, -decimals) || "0";
  const fraction = str.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

type Uint256Like = {
  low: string;
  high: string;
};

const UINT_128 = 1n << 128n;
const UINT_128_MASK = UINT_128 - 1n;

function formatHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function splitBigIntToUint256(value: bigint): Uint256Like {
  if (value < 0n) {
    throw new Error("balanceOf response cannot contain negative values");
  }

  return {
    low: formatHex(value & UINT_128_MASK),
    high: formatHex(value >> 128n),
  };
}

function tryBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const str = (value as { toString: () => string }).toString();
    if (typeof str === "string" && str && str !== "[object Object]") {
      try {
        return BigInt(str);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeUintComponent(value: unknown, label: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`balanceOf ${label} component is empty`);
    }
    return trimmed;
  }

  if (typeof value === "bigint") {
    return formatHex(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `balanceOf ${label} component must be a non-negative finite number`
      );
    }
    return BigInt(Math.trunc(value)).toString();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const str = (value as { toString: () => string }).toString();
    if (typeof str === "string" && str && str !== "[object Object]") {
      return str.trim();
    }
  }

  throw new Error(
    `balanceOf ${label} component has unsupported type: ${describeValue(value)}`
  );
}

function describeValue(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_, v) => (typeof v === "bigint" ? v.toString() : v)
    );
  } catch {
    return String(value);
  }
}

function extractUint256(value: unknown): Uint256Like {
  if (value === null || value === undefined) {
    throw new Error("balanceOf response is empty");
  }

  if (Array.isArray(value)) {
    if (value.length >= 2) {
      return {
        low: normalizeUintComponent(value[0], "low"),
        high: normalizeUintComponent(value[1], "high"),
      };
    }

    if (value.length === 1) {
      return extractUint256(value[0]);
    }

    throw new Error(
      "balanceOf response array must contain at least one element"
    );
  }

  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if ("balance" in candidate) {
      return extractUint256(candidate.balance);
    }
    if ("result" in candidate) {
      return extractUint256(candidate.result);
    }
    if ("low" in candidate && "high" in candidate) {
      return {
        low: normalizeUintComponent(candidate.low, "low"),
        high: normalizeUintComponent(candidate.high, "high"),
      };
    }
  }

  const singleValue = tryBigInt(value);
  if (singleValue !== null) {
    return splitBigIntToUint256(singleValue);
  }

  throw new Error(
    `Unsupported balanceOf response type: ${describeValue(value).slice(0, 200)}`
  );
}

export type TokenBalanceResult = BalanceResult & {
  token: TokenMetadata;
};

async function callBalanceOf(contractAddress: string, address: string) {
  const provider = getProvider();
  return provider.callContract({
    contractAddress,
    entrypoint: "balanceOf",
    calldata: [address],
  });
}

export async function fetchTokenBalance(
  address: string,
  token: TokenMetadata
): Promise<TokenBalanceResult> {
  const response = await callBalanceOf(token.address, address);
  const rawBalance = extractUint256(
    (response as { result?: unknown }).result ?? response
  );
  const wei = uint256.uint256ToBN(rawBalance);
  const weiBigInt = BigInt(wei.toString());

  return {
    address,
    contractAddress: token.address,
    wei: weiBigInt.toString(),
    formatted: formatUnits(weiBigInt, token.decimals),
    decimals: token.decimals,
    token,
  };
}

export type TokenBalanceFetchError = {
  token: TokenMetadata;
  message: string;
};

export async function fetchAllTokenBalances(
  address: string,
  options?: { includeZero?: boolean }
): Promise<{
  balances: TokenBalanceResult[];
  errors: TokenBalanceFetchError[];
}> {
  const includeZero = options?.includeZero ?? false;
  const results = await Promise.all(
    AVAILABLE_TOKENS.map(async (token) => {
      try {
        const balance = await fetchTokenBalance(address, token);
        return { ok: true as const, balance };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? "Unknown");
        return { ok: false as const, token, message };
      }
    })
  );

  const balances = results
    .filter((result): result is { ok: true; balance: TokenBalanceResult } => {
      if (!result.ok) {
        return false;
      }
      if (includeZero) {
        return true;
      }
      return result.balance.wei !== "0";
    })
    .map((result) => result.balance);

  const errors = results
    .filter(
      (result): result is {
        ok: false;
        token: TokenMetadata;
        message: string;
      } => !result.ok
    )
    .map(({ token, message }) => ({ token, message }));

  return { balances, errors };
}

export async function fetchEthBalance(address: string): Promise<BalanceResult> {
  const contract = await getEthContract();
  let response: unknown;

  try {
    response = await contract.balanceOf(address);
    if (!response) {
      console.warn(
        `[starknet] balanceOf returned empty response via contract helper for ${address}`
      );
    }
  } catch (error) {
    console.warn(
      `[starknet] balanceOf call failed via contract helper for ${address}`,
      error
    );
  }

  if (!response) {
    const config = readStarknetConfig();
    const fallback = await callBalanceOf(config.ethContractAddress, address);
    response = (fallback as { result?: unknown }).result ?? fallback;
  }

  const rawBalance = extractUint256(response);
  const wei = uint256.uint256ToBN(rawBalance);
  const weiBigInt = BigInt(wei.toString());

  return {
    address,
    contractAddress: contract.address,
    wei: weiBigInt.toString(),
    formatted: formatUnits(weiBigInt, 18),
    decimals: 18,
  };
}
