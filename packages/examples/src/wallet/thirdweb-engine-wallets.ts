/**
 * Example: Using thirdweb Engine server wallets with Lucid Agents SDK
 *
 * This demonstrates:
 * 1. Configure thirdweb wallet using the wallets extension
 * 2. The connector automatically initializes the thirdweb client and account
 * 3. Verify the wallet works with challenge signing
 * 4. Send USDC transaction using the wallet
 *
 * Note: thirdweb server wallets sign through Engine's API, not locally.
 * The connector uses Engine.serverWallet() and converts it to a viem wallet client
 * using thirdweb's viem adapter for compatibility with the SDK.
 */

import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { wallets } from '@lucid-agents/wallet';
import { baseSepolia as thirdwebBaseSepolia } from 'thirdweb/chains';
import type { WalletClient } from 'viem';
import {
  createPublicClient,
  erc20Abi,
  http as viemHttp,
  parseUnits,
} from 'viem';

async function main() {
  // Step 1: Create agent with thirdweb wallet configured
  // The wallet will be automatically initialized on first use
  const agent = await createAgent({
    name: 'my-agent',
    version: '0.1.0',
    description: 'Agent using thirdweb Engine server wallet',
  })
    .use(http())
    .use(
      wallets({
        config: {
          agent: {
            type: 'thirdweb',
            secretKey: process.env.AGENT_WALLET_SECRET_KEY!,
            clientId: process.env.AGENT_WALLET_CLIENT_ID,
            walletLabel: process.env.AGENT_WALLET_LABEL || 'agent-wallet',
            chainId: thirdwebBaseSepolia.id, // 84532
          },
        },
      })
    )
    .build();

  // Step 2: Verify wallet works
  console.log('Success! Agent created with thirdweb Engine server wallet.');
  console.log('Wallet configured:', !!agent.wallets?.agent);

  if (!agent.wallets?.agent) {
    throw new Error('Agent wallet not configured');
  }

  // Step 3: Get wallet address (this will trigger initialization)
  console.log('\nInitializing wallet (this may take a moment)...');
  let address: string | null = null;
  try {
    address = await agent.wallets.agent.connector.getAddress();
    if (address) {
      console.log('Wallet address:', address);
    } else {
      console.log('Warning: Wallet address is null after initialization');
      // Try to get metadata to see what's happening
      const metadata = await agent.wallets.agent.connector.getWalletMetadata();
      console.log('Wallet metadata:', metadata);
    }
  } catch (error) {
    console.error('Error getting wallet address:', error);
    throw error;
  }

  // Step 4: Test signing a challenge to verify it works
  console.log('\nTesting challenge signing...');
  try {
    // Create a test challenge
    const testChallenge = {
      id: 'test-challenge',
      credential_id: null,
      payload: {
        message: 'Hello from Lucid Agents SDK!',
      },
      payload_hash: null,
      nonce: 'test-nonce',
      scopes: [],
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      server_signature: null,
    };

    const signature =
      await agent.wallets.agent.connector.signChallenge(testChallenge);
    console.log('Challenge signed successfully');
    console.log('Signature:', signature.slice(0, 20) + '...');
  } catch (error) {
    console.error('Challenge signing test failed:', error);
    throw error;
  }

  console.log('\n All tests passed! Wallet is fully functional.');

  // Step 5: Send USDC transaction
  console.log('\n=== Sending USDC Transaction ===');
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
  const RECEIVER_WALLET = '0x0000000000000000000000000000000000000000' as const; // placeholder
  const AMOUNT = '0.01'; // 0.01 USDC
  const USDC_DECIMALS = 6; // USDC has 6 decimals

  try {
    const connector = agent.wallets.agent?.connector;
    if (!connector) {
      throw new Error('Agent wallet connector not available');
    }

    const capabilities = connector.getCapabilities?.();
    if (!capabilities?.walletClient || !connector.getWalletClient) {
      throw new Error(
        'Configured wallet does not expose a contract-ready wallet client'
      );
    }

    const walletClient =
      (await connector.getWalletClient()) as WalletClient | null;
    if (!walletClient) {
      throw new Error('Wallet connector did not return a wallet client');
    }
    const chainForReads = walletClient.chain;

    // Create public client for reading
    const publicClient = createPublicClient({
      chain: chainForReads,
      transport: viemHttp(),
    });

    // Prepare the ERC20 transfer transaction
    const amount = parseUnits(AMOUNT, USDC_DECIMALS);

    const txHash = await walletClient.writeContract({
      account: walletClient.account,
      chain: walletClient.chain,
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [RECEIVER_WALLET, amount],
    });

    console.log('Transaction submitted!');
    console.log('Transaction hash:', txHash);

    console.log('\nWaiting for transaction confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30000,
    });
    console.log('Transaction confirmed!');
    console.log('Block number:', receipt.blockNumber.toString());
    console.log('Transaction hash:', receipt.transactionHash);
    console.log('Gas used:', receipt.gasUsed.toString());

    console.log('\n USDC transaction completed successfully!');
  } catch (error) {
    console.error('Error sending USDC transaction:', error);
    throw error;
  }

  return agent;
}

if (import.meta.main) {
  main().catch(console.error);
}

export { main };
