import { WalletClient, Account, Abi, ContractFunctionName } from 'viem';
import { verifyMessage } from 'viem/actions';

type TrustModel = "feedback" | "inference-validation" | "tee-attestation" | string;
type RegistrationEntry = {
    agentId: number | string;
    agentAddress: string;
    signature?: string;
    [key: string]: unknown;
};
type TrustConfig = {
    registrations?: RegistrationEntry[];
    trustModels?: TrustModel[];
    validationRequestsUri?: string;
    validationResponsesUri?: string;
    feedbackDataUri?: string;
};

/**
 * Common type definitions
 */
type Hex = `0x${string}`;

/**
 * Address normalization and CAIP-10 utilities
 */

declare const ZERO_ADDRESS: Hex;
/**
 * Normalize an Ethereum address to lowercase hex format
 * Throws if the address is invalid
 */
declare function normalizeAddress(value: string | null | undefined): Hex;
/**
 * Sanitize an address - returns ZERO_ADDRESS if invalid instead of throwing
 */
declare function sanitizeAddress(value: string | null | undefined): Hex;
/**
 * Convert address to CAIP-10 format (Chain Agnostic Improvement Proposal)
 * Format: {namespace}:{chainId}:{address}
 * Example: "eip155:1:0x1234..."
 */
declare function toCaip10(params: {
    namespace?: string;
    chainId: number | string;
    address: string;
}): string;

/**
 * Domain normalization utilities
 */
/**
 * Normalize a domain to lowercase, trimmed format
 */
declare function normalizeDomain(domain: string): string;

/**
 * Signature helpers using Viem's proper action functions.
 * Supports EIP-191 (personal_sign) and EIP-712 (typed data) signing.
 */

/**
 * Viem WalletClient type for signature operations
 * Accepts any WalletClient with an account
 */
type SignerWalletClient = WalletClient & {
    account: Account;
};
/**
 * Sign a message using EIP-191 (personal_sign)
 * This is the standard way to sign plain text messages
 */
declare function signMessageWithViem(walletClient: SignerWalletClient, message: string): Promise<Hex>;
/**
 * Sign typed data using EIP-712
 * More structured and safer than plain message signing
 */
declare function signTypedDataWithViem<const TTypedData extends Record<string, unknown>, TPrimaryType extends string>(walletClient: SignerWalletClient, params: {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Hex;
    };
    types: TTypedData;
    primaryType: TPrimaryType;
    message: Record<string, unknown>;
}): Promise<Hex>;
/**
 * Verify a signature from either EOA or smart contract wallet
 * Handles both EIP-191 and ERC-1271 automatically
 */
declare function verifySignature(params: {
    address: Hex;
    message: string;
    signature: Hex;
    publicClient: {
        verifyMessage: typeof verifyMessage;
    };
}): Promise<boolean>;
/**
 * Hash a message according to EIP-191
 * Useful for debugging or manual signature verification
 */
declare function hashMessageEIP191(message: string): Hex;
/**
 * Recover the address that signed a message
 * Only works for EOA wallets (not smart contract wallets)
 */
declare function recoverSigner(message: string, signature: Hex): Promise<Hex>;
/**
 * Build ERC-8004 domain ownership proof message
 */
declare function buildDomainProofMessage(params: {
    domain: string;
    address: Hex;
    chainId: number;
    nonce?: string;
}): string;
/**
 * Build ERC-8004 feedback authorization message
 */
declare function buildFeedbackAuthMessage(params: {
    fromAddress: Hex;
    toAgentId: bigint;
    score: number;
    chainId: number;
    expiry: number;
    indexLimit: bigint;
}): string;
/**
 * Build ERC-8004 validation request message
 */
declare function buildValidationRequestMessage(params: {
    agentId: bigint;
    requestHash: Hex;
    validator: Hex;
    chainId: number;
    timestamp: number;
}): string;
/**
 * Sign ERC-8004 domain proof using Viem
 */
declare function signDomainProof(walletClient: SignerWalletClient, params: {
    domain: string;
    address: Hex;
    chainId: number;
    nonce?: string;
}): Promise<Hex>;
/**
 * Sign ERC-8004 feedback authorization using Viem
 */
declare function signFeedbackAuth(walletClient: SignerWalletClient, params: {
    fromAddress: Hex;
    toAgentId: bigint;
    score: number;
    chainId: number;
    expiry: number;
    indexLimit: bigint;
}): Promise<Hex>;
/**
 * Sign ERC-8004 validation request using Viem
 */
declare function signValidationRequest(walletClient: SignerWalletClient, params: {
    agentId: bigint;
    requestHash: Hex;
    validator: Hex;
    chainId: number;
    timestamp: number;
}): Promise<Hex>;

/**
 * ERC-8004 v1.0 Configuration
 * Contract addresses and constants
 */

/**
 * Default ERC-8004 registry addresses (CREATE2 deterministic)
 *
 * These addresses are deployed via CREATE2, ensuring the same address across chains.
 * They are deterministic and can be verified on any EVM-compatible network.
 *
 * Reference: https://github.com/ChaosChain/trustless-agents-erc-ri
 */
declare const DEFAULT_ADDRESSES: {
    /**
     * Identity Registry - ERC-721 NFTs representing agent identities
     * Functions: register(), ownerOf(), tokenURI(), agentExists()
     */
    readonly IDENTITY_REGISTRY: Hex;
    /**
     * Reputation Registry - Peer feedback and reputation system
     * Functions: giveFeedback(), revokeFeedback(), getSummary(), getAllFeedback()
     */
    readonly REPUTATION_REGISTRY: Hex;
    /**
     * Validation Registry - Validation requests and responses
     * Functions: validationRequest(), validationResponse(), getRequest(), getSummary()
     */
    readonly VALIDATION_REGISTRY: Hex;
};
/**
 * Supported chain IDs for ERC-8004 registries
 */
declare const SUPPORTED_CHAINS: {
    readonly BASE_SEPOLIA: 84532;
    readonly ETHEREUM_MAINNET: 1;
    readonly SEPOLIA: 11155111;
    readonly BASE_MAINNET: 8453;
    readonly ARBITRUM: 42161;
    readonly OPTIMISM: 10;
    readonly POLYGON: 137;
    readonly POLYGON_AMOY: 80002;
};
type SupportedChainId = (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];
/**
 * Default network configuration
 */
declare const DEFAULT_CHAIN_ID = 84532;
declare const DEFAULT_NAMESPACE = "eip155";
/**
 * Default trust models supported by ERC-8004
 */
declare const DEFAULT_TRUST_MODELS: string[];
/**
 * Get all registry addresses for a specific chain
 * Returns default addresses with any chain-specific overrides applied
 */
declare function getRegistryAddresses(chainId: number): typeof DEFAULT_ADDRESSES;
/**
 * Get a specific registry address for a chain
 */
declare function getRegistryAddress(registry: "identity" | "reputation" | "validation", chainId: number): Hex;
/**
 * Check if a chain ID is supported by the ERC-8004 registries
 */
declare function isChainSupported(chainId: number): boolean;
/**
 * Verify if an address is a valid ERC-8004 registry on any supported chain
 */
declare function isERC8004Registry(address: Hex, chainId?: number): boolean;

/**
 * ERC-8004 Identity Registry ABI
 * Typed as viem's Abi for proper type inference with contract interactions
 */
declare const IDENTITY_REGISTRY_ABI: Abi;
/**
 * Valid read function names extracted from the Identity Registry ABI
 * Includes all view/pure functions from the contract
 */
type IdentityRegistryReadFunctionName = ContractFunctionName<typeof IDENTITY_REGISTRY_ABI, "view" | "pure">;
/**
 * Valid write function names extracted from the Identity Registry ABI
 * Includes all nonpayable/payable functions from the contract
 */
type IdentityRegistryWriteFunctionName = ContractFunctionName<typeof IDENTITY_REGISTRY_ABI, "nonpayable" | "payable">;

type IdentityRegistryClientOptions<PublicClient extends PublicClientLike, WalletClient extends WalletClientLike | undefined = undefined> = {
    address: Hex;
    chainId?: number;
    publicClient: PublicClient;
    walletClient?: WalletClient;
    namespace?: string;
};
/**
 * Identity record for an ERC-8004 agent
 * In v1.0, agents are ERC-721 NFTs with metadata stored off-chain
 */
type IdentityRecord = {
    agentId: bigint;
    owner: Hex;
    tokenURI: string;
};
type TrustOverridesInput = Partial<Pick<TrustConfig, "trustModels" | "validationRequestsUri" | "validationResponsesUri" | "feedbackDataUri">>;
type IdentityRegistryClient = {
    readonly address: Hex;
    readonly chainId?: number;
    get(agentId: bigint | number | string): Promise<IdentityRecord | null>;
    register(input: RegisterAgentInput): Promise<RegisterAgentResult>;
    toRegistrationEntry(record: IdentityRecord, signature?: string): RegistrationEntry;
};
type PublicClientLike = {
    readContract(args: {
        address: Hex;
        abi: typeof IDENTITY_REGISTRY_ABI;
        functionName: IdentityRegistryReadFunctionName;
        args?: readonly unknown[];
    }): Promise<any>;
};
type WalletClientLike = {
    account?: {
        address?: Hex;
    };
    writeContract(args: {
        address: Hex;
        abi: typeof IDENTITY_REGISTRY_ABI;
        functionName: IdentityRegistryWriteFunctionName;
        args?: readonly unknown[];
    }): Promise<Hex>;
};
type TransactionReceiptLike = {
    logs?: Array<{
        address: Hex;
        topics: Hex[];
        data: Hex;
    }>;
};
type PublicClientWithReceipt = PublicClientLike & {
    waitForTransactionReceipt?(args: {
        hash: Hex;
    }): Promise<TransactionReceiptLike>;
    getTransactionReceipt?(args: {
        hash: Hex;
    }): Promise<TransactionReceiptLike>;
    getContractEvents?(args: {
        address: Hex;
        abi: typeof IDENTITY_REGISTRY_ABI;
        eventName: string;
        fromBlock?: bigint;
        toBlock?: bigint;
    }): Promise<any[]>;
};
type RegisterAgentInput = {
    tokenURI: string;
    metadata?: Array<{
        key: string;
        value: Uint8Array;
    }>;
};
type RegisterAgentResult = {
    transactionHash: Hex;
    agentAddress: Hex;
    agentId?: bigint;
};
declare function createIdentityRegistryClient<PublicClient extends PublicClientLike, WalletClient extends WalletClientLike | undefined = undefined>(options: IdentityRegistryClientOptions<PublicClient, WalletClient>): IdentityRegistryClient;
type SignAgentDomainProofOptions = {
    domain: string;
    address: Hex;
    chainId: number;
    signer: MessageSignerLike;
    nonce?: string;
};
type MessageSignerLike = WalletClientLike;
declare function signAgentDomainProof(options: SignAgentDomainProofOptions): Promise<string>;
declare function buildTrustConfigFromIdentity(record: IdentityRecord, options?: {
    signature?: string;
    chainId: number | string;
    namespace?: string;
    trustOverrides?: TrustOverridesInput;
}): TrustConfig;
type BootstrapTrustMissingContext = {
    client: IdentityRegistryClient;
    normalizedDomain: string;
};
type BootstrapTrustOptions = {
    domain: string;
    chainId: number;
    registryAddress: Hex;
    publicClient: PublicClientLike;
    walletClient?: WalletClientLike;
    namespace?: string;
    signer?: MessageSignerLike;
    signatureNonce?: string;
    registerIfMissing?: boolean;
    skipRegister?: boolean;
    trustOverrides?: TrustOverridesInput;
    onMissing?: (context: BootstrapTrustMissingContext) => Promise<IdentityRecord | null | undefined> | IdentityRecord | null | undefined;
};
type BootstrapTrustResult = {
    trust?: TrustConfig;
    record?: IdentityRecord | null;
    transactionHash?: Hex;
    signature?: string;
    didRegister?: boolean;
};
/**
 * Constructs the metadata URI for an agent's domain
 * Points to /.well-known/agent-metadata.json
 */
declare function buildMetadataURI(domain: string): string;
declare function bootstrapTrust(options: BootstrapTrustOptions): Promise<BootstrapTrustResult>;
type InferLogger = {
    info?(message: string): void;
    warn?(message: string, error?: unknown): void;
};
type BootstrapIdentityClients = {
    publicClient: PublicClientLike;
    walletClient?: WalletClientLike;
    signer?: MessageSignerLike;
};
type BootstrapIdentityClientFactory = (params: {
    chainId: number;
    rpcUrl: string;
    env: Record<string, string | undefined>;
}) => BootstrapIdentityClients | null | undefined | Promise<BootstrapIdentityClients | null | undefined>;
type BootstrapIdentityOptions = {
    domain?: string;
    chainId?: number;
    registryAddress?: Hex;
    namespace?: string;
    publicClient?: PublicClientLike;
    walletClient?: WalletClientLike;
    signer?: MessageSignerLike;
    rpcUrl?: string;
    makeClients?: BootstrapIdentityClientFactory;
    registerIfMissing?: boolean;
    skipRegister?: boolean;
    signatureNonce?: string;
    trustOverrides?: TrustOverridesInput;
    env?: Record<string, string | undefined>;
    logger?: InferLogger;
};
type BootstrapIdentityResult = BootstrapTrustResult & {
    synthetic?: boolean;
};
declare function bootstrapIdentity(options?: BootstrapIdentityOptions): Promise<BootstrapIdentityResult>;
type MakeViemClientsFromEnvOptions = {
    env?: Record<string, string | undefined>;
    rpcUrl?: string;
    privateKey?: `0x${string}` | string;
};
declare function makeViemClientsFromEnv(options?: MakeViemClientsFromEnvOptions): Promise<BootstrapIdentityClientFactory | undefined>;

/**
 * ERC-8004 Reputation Registry Client
 * Handles peer feedback system for agent reputation
 */

type ReputationRegistryClientOptions<PublicClient extends PublicClientLike, WalletClient extends WalletClientLike | undefined = undefined> = {
    address: Hex;
    chainId: number;
    publicClient: PublicClient;
    walletClient?: WalletClient;
    identityRegistryAddress: Hex;
};
/**
 * Feedback entry returned from the registry
 */
type FeedbackEntry = {
    agentId: bigint;
    clientAddress: Hex;
    feedbackIndex: bigint;
    score: number;
    tag1: Hex;
    tag2: Hex;
    fileUri: string;
    fileHash: Hex;
    isRevoked: boolean;
    responseCount?: bigint;
};
/**
 * Parameters for giving feedback
 */
type GiveFeedbackInput = {
    toAgentId: bigint;
    score: number;
    tag1?: string | Hex;
    tag2?: string | Hex;
    fileUri?: string;
    fileHash?: Hex;
    feedbackAuth?: Hex;
    expiry?: number;
    indexLimit?: bigint;
};
/**
 * Parameters for revoking feedback
 */
type RevokeFeedbackInput = {
    agentId: bigint;
    feedbackIndex: bigint;
};
/**
 * Parameters for appending a response to feedback
 */
type AppendResponseInput = {
    agentId: bigint;
    clientAddress: Hex;
    feedbackIndex: bigint;
    responseUri: string;
    responseHash: Hex;
};
/**
 * Summary statistics for an agent's reputation
 */
type ReputationSummary = {
    count: bigint;
    averageScore: number;
};
type ReputationRegistryClient = {
    readonly address: Hex;
    readonly chainId: number;
    giveFeedback(input: GiveFeedbackInput): Promise<Hex>;
    revokeFeedback(input: RevokeFeedbackInput): Promise<Hex>;
    appendResponse(input: AppendResponseInput): Promise<Hex>;
    getFeedback(agentId: bigint, clientAddress: Hex, feedbackIndex: bigint): Promise<FeedbackEntry | null>;
    getAllFeedback(agentId: bigint, options?: {
        clientAddresses?: Hex[];
        tag1?: Hex;
        tag2?: Hex;
        includeRevoked?: boolean;
    }): Promise<FeedbackEntry[]>;
    getSummary(agentId: bigint, options?: {
        clientAddresses?: Hex[];
        tag1?: Hex;
        tag2?: Hex;
    }): Promise<ReputationSummary>;
    getClients(agentId: bigint): Promise<Hex[]>;
    getLastIndex(agentId: bigint, clientAddress: Hex): Promise<bigint>;
    getResponseCount(agentId: bigint, clientAddress: Hex, feedbackIndex: bigint, responders: Hex[]): Promise<bigint>;
};
/**
 * Create a Reputation Registry client
 */
declare function createReputationRegistryClient<PublicClient extends PublicClientLike, WalletClient extends WalletClientLike | undefined = undefined>(options: ReputationRegistryClientOptions<PublicClient, WalletClient>): ReputationRegistryClient;

/**
 * ERC-8004 Validation Registry Client
 * Handles validation requests and responses for agent work verification
 */

type ValidationRegistryClientOptions<PublicClient extends PublicClientLike, WalletClient extends WalletClientLike | undefined = undefined> = {
    address: Hex;
    chainId: number;
    publicClient: PublicClient;
    walletClient?: WalletClient;
    identityRegistryAddress: Hex;
};
/**
 * Validation request entry
 */
type ValidationRequest = {
    validatorAddress: Hex;
    agentId: bigint;
    requestUri: string;
    requestHash: Hex;
    timestamp: bigint;
};
/**
 * Validation status/response
 */
type ValidationStatus = {
    validatorAddress: Hex;
    agentId: bigint;
    response: number;
    tag: Hex;
    lastUpdate: bigint;
};
/**
 * Parameters for creating a validation request
 */
type CreateValidationRequestInput = {
    validatorAddress: Hex;
    agentId: bigint;
    requestUri: string;
    requestHash: Hex;
};
/**
 * Parameters for submitting a validation response
 */
type SubmitValidationResponseInput = {
    requestHash: Hex;
    response: number;
    responseUri: string;
    responseHash: Hex;
    tag?: Hex;
};
/**
 * Validation summary statistics
 */
type ValidationSummary = {
    count: bigint;
    avgResponse: number;
};
type ValidationRegistryClient = {
    readonly address: Hex;
    readonly chainId: number;
    createRequest(input: CreateValidationRequestInput): Promise<Hex>;
    submitResponse(input: SubmitValidationResponseInput): Promise<Hex>;
    getRequest(requestHash: Hex): Promise<ValidationRequest | null>;
    getValidationStatus(requestHash: Hex): Promise<ValidationStatus | null>;
    requestExists(requestHash: Hex): Promise<boolean>;
    getAgentValidations(agentId: bigint): Promise<Hex[]>;
    getValidatorRequests(validatorAddress: Hex): Promise<Hex[]>;
    getSummary(agentId: bigint, options?: {
        validatorAddresses?: Hex[];
        tag?: Hex;
    }): Promise<ValidationSummary>;
};
/**
 * Create a Validation Registry client
 */
declare function createValidationRegistryClient<PublicClient extends PublicClientLike, WalletClient extends WalletClientLike | undefined = undefined>(options: ValidationRegistryClientOptions<PublicClient, WalletClient>): ValidationRegistryClient;

/**
 * Simplified initialization helpers for agent identity.
 * These functions provide a streamlined API for common use cases.
 */

/**
 * Options for creating agent identity with automatic registration.
 */
type CreateAgentIdentityOptions = {
    /**
     * Agent domain (e.g., "agent.example.com").
     * Falls back to AGENT_DOMAIN env var if not provided.
     */
    domain?: string;
    /**
     * Whether to automatically register if not found in registry.
     * Defaults to true.
     */
    autoRegister?: boolean;
    /**
     * Chain ID for the ERC-8004 registry.
     * Falls back to CHAIN_ID env var or defaults to Base Sepolia (84532).
     */
    chainId?: number;
    /**
     * Registry contract address.
     * Falls back to IDENTITY_REGISTRY_ADDRESS env var.
     */
    registryAddress?: `0x${string}`;
    /**
     * RPC URL for blockchain connection.
     * Falls back to RPC_URL env var.
     */
    rpcUrl?: string;
    /**
     * Private key for wallet operations.
     * Falls back to PRIVATE_KEY env var.
     * Required for registration operations.
     */
    privateKey?: `0x${string}` | string;
    /**
     * Trust models to advertise (e.g., ["feedback", "inference-validation"]).
     * Defaults to ["feedback", "inference-validation"].
     */
    trustModels?: string[];
    /**
     * Optional custom trust config overrides.
     */
    trustOverrides?: {
        validationRequestsUri?: string;
        validationResponsesUri?: string;
        feedbackDataUri?: string;
    };
    /**
     * Custom environment variables object.
     * Defaults to process.env.
     */
    env?: Record<string, string | undefined>;
    /**
     * Optional client factory (useful for testing).
     * If provided, this will be used instead of makeViemClientsFromEnv.
     */
    makeClients?: BootstrapIdentityClientFactory;
    /**
     * Logger for diagnostic messages.
     */
    logger?: {
        info?(message: string): void;
        warn?(message: string, error?: unknown): void;
    };
};
/**
 * Registry clients for interacting with ERC-8004 contracts
 */
type RegistryClients = {
    identity: IdentityRegistryClient;
    reputation: ReputationRegistryClient;
    validation: ValidationRegistryClient;
};
/**
 * Result of agent identity creation.
 */
type AgentIdentity = BootstrapIdentityResult & {
    /**
     * Human-readable status message.
     */
    status: string;
    /**
     * The resolved domain.
     */
    domain?: string;
    /**
     * Whether this is the first registration.
     */
    isNewRegistration?: boolean;
    /**
     * Registry clients for all three ERC-8004 registries.
     * Available when registry address and clients are configured.
     */
    clients?: RegistryClients;
};
/**
 * Create agent identity with automatic registration and sensible defaults.
 *
 * This is the recommended way to set up ERC-8004 identity for your agent.
 * It handles:
 * - Viem client creation from environment variables
 * - Automatic registry lookup
 * - Optional auto-registration when not found
 * - Domain proof signature generation
 * - Creation of all three registry clients (identity, reputation, validation)
 *
 * @example
 * ```ts
 * import { createAgentIdentity } from "@lucid-dreams/agent-kit-identity";
 *
 * // Minimal usage - uses env vars for everything
 * const identity = await createAgentIdentity({ autoRegister: true });
 *
 * if (identity.trust) {
 *   console.log("Agent registered with ID:", identity.record?.agentId);
 * }
 *
 * // Use registry clients
 * if (identity.clients) {
 *   // Give feedback to another agent
 *   await identity.clients.reputation.giveFeedback({
 *     toAgentId: 42n,
 *     score: 90,
 *     tags: ["reliable", "fast"],
 *   });
 *
 *   // Request validation
 *   await identity.clients.validation.createRequest({
 *     validatorAddress: "0x...",
 *     agentId: identity.record!.agentId,
 *     requestURI: "ipfs://...",
 *     requestHash: "0x...",
 *   });
 * }
 * ```
 *
 * @example
 * ```ts
 * // With explicit config
 * const identity = await createAgentIdentity({
 *   domain: "agent.example.com",
 *   registryAddress: "0x1234...",
 *   chainId: 84532,
 *   autoRegister: true,
 *   trustModels: ["feedback", "inference-validation", "tee-attestation"]
 * });
 *
 * console.log(identity.status);
 * // Use identity.trust in your agent manifest
 * // Use identity.clients for reputation and validation
 * ```
 */
declare function createAgentIdentity(options?: CreateAgentIdentityOptions): Promise<AgentIdentity>;
/**
 * Quick registration helper for agents.
 * This is a convenience wrapper around createAgentIdentity that forces registration.
 *
 * @example
 * ```ts
 * import { registerAgent } from "@lucid-dreams/agent-kit-identity";
 *
 * const result = await registerAgent({
 *   domain: "my-agent.example.com"
 * });
 *
 * if (result.isNewRegistration) {
 *   console.log("Registered! TX:", result.transactionHash);
 * } else {
 *   console.log("Already registered with ID:", result.record?.agentId);
 * }
 * ```
 */
declare function registerAgent(options: CreateAgentIdentityOptions): Promise<AgentIdentity>;
/**
 * Helper to extract trust config from created identity.
 * Useful when you need just the trust config for your agent manifest.
 *
 * @example
 * ```ts
 * import { createAgentIdentity, getTrustConfig } from "@lucid-dreams/agent-kit-identity";
 *
 * const identity = await createAgentIdentity({ autoRegister: true });
 * const trustConfig = getTrustConfig(identity);
 *
 * // Use in createAgentApp
 * createAgentApp({ name: "my-agent", version: "1.0.0" }, {
 *   trust: trustConfig
 * });
 * ```
 */
declare function getTrustConfig(result: AgentIdentity): TrustConfig | undefined;
/**
 * Generate agent metadata JSON for hosting at /.well-known/agent-metadata.json
 *
 * @example
 * ```ts
 * const identity = await createAgentIdentity({ autoRegister: true });
 * const metadata = generateAgentMetadata(identity, {
 *   name: "My Agent",
 *   description: "An intelligent assistant",
 *   capabilities: [{ name: "chat", description: "Natural language conversation" }]
 * });
 * // Host this JSON at https://your-domain/.well-known/agent-metadata.json
 * ```
 */
declare function generateAgentMetadata(identity: AgentIdentity, options?: {
    name?: string;
    description?: string;
    capabilities?: Array<{
        name: string;
        description: string;
    }>;
}): Record<string, unknown>;

export { type AgentIdentity, type AppendResponseInput, type BootstrapIdentityClientFactory, type BootstrapIdentityClients, type BootstrapIdentityOptions, type BootstrapIdentityResult, type BootstrapTrustMissingContext, type BootstrapTrustOptions, type BootstrapTrustResult, type CreateAgentIdentityOptions, type CreateValidationRequestInput, DEFAULT_CHAIN_ID, DEFAULT_NAMESPACE, DEFAULT_TRUST_MODELS, type FeedbackEntry, type GiveFeedbackInput, type Hex, type IdentityRecord, type IdentityRegistryClient, type IdentityRegistryClientOptions, type MakeViemClientsFromEnvOptions, type MessageSignerLike, type PublicClientLike, type PublicClientWithReceipt, type RegisterAgentInput, type RegisterAgentResult, type RegistrationEntry, type RegistryClients, type ReputationRegistryClient, type ReputationRegistryClientOptions, type ReputationSummary, type RevokeFeedbackInput, SUPPORTED_CHAINS, type SignAgentDomainProofOptions, type SignerWalletClient, type SubmitValidationResponseInput, type SupportedChainId, type TransactionReceiptLike, type TrustConfig, type TrustModel, type ValidationRegistryClient, type ValidationRegistryClientOptions, type ValidationRequest, type ValidationStatus, type ValidationSummary, type WalletClientLike, ZERO_ADDRESS, bootstrapIdentity, bootstrapTrust, buildDomainProofMessage, buildFeedbackAuthMessage, buildMetadataURI, buildTrustConfigFromIdentity, buildValidationRequestMessage, createAgentIdentity, createIdentityRegistryClient, createReputationRegistryClient, createValidationRegistryClient, generateAgentMetadata, getRegistryAddress, getRegistryAddresses, getTrustConfig, hashMessageEIP191, isChainSupported, isERC8004Registry, makeViemClientsFromEnv, normalizeAddress, normalizeDomain, recoverSigner, registerAgent, sanitizeAddress, signAgentDomainProof, signDomainProof, signFeedbackAuth, signMessageWithViem, signTypedDataWithViem, signValidationRequest, toCaip10, verifySignature };
