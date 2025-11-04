import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  wrapFetchWithPayment,
  createSigner,
  decodeXPaymentResponse,
  type Hex,
} from "x402-fetch";

type EntrypointKey = "register" | "question" | "answer" | "hint" | "leaderboard";

const BASE_URL = process.env.AGENT_ZERO_URL ?? "https://localhost:8787";
let fetchClient: typeof fetch = fetch;

async function callEntrypoint<TInput, TResult>(
  key: EntrypointKey,
  inputPayload: TInput
): Promise<TResult> {
  const url = `${BASE_URL}/entrypoints/${key}/invoke`;
  const response = await fetchClient(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: inputPayload }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request to ${key} failed: ${response.status} ${text}`);
  }

  const paymentHeader = response.headers.get("x-payment-response");
  if (paymentHeader) {
    try {
      const paymentSummary = decodeXPaymentResponse(paymentHeader);
      console.log("💳 Payment summary:", paymentSummary);
    } catch (error) {
      console.warn("Failed to decode x-payment-response header:", error);
    }
  }

  const raw = (await response.json()) as { output?: TResult };
  console.log(`\n↩️ Response [${key}]:`);
  console.dir(raw, { depth: null });

  if (raw && typeof raw === "object" && "output" in raw && raw.output) {
    return raw.output;
  }
  return raw as unknown as TResult;
}

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  if (privateKey) {
    console.log("🔐 Using x402 payments with supplied PRIVATE_KEY.");
    const signer = await createSigner(
      (process.env.X402_NETWORK ?? "base") as Parameters<typeof createSigner>[0],
      privateKey
    );
    fetchClient = wrapFetchWithPayment(fetch, signer);
  } else {
    console.warn(
      "⚠️ PRIVATE_KEY not set — paid endpoints will fail with 402 responses."
    );
  }

  const rl = readline.createInterface({ input, output });

  const playerId = `player-${Math.random().toString(16).slice(2, 8)}`;
  const nickname =
    (await rl.question(
      "Arcade nickname (leave blank for auto-generated): "
    )) || undefined;

  const registerResult = await callEntrypoint<
    { player_id: string; nickname?: string },
    {
      session_token: string;
      nickname?: string;
      balance: number;
      streak: number;
      active_question?: {
        id: string;
        prompt: string;
        category?: string;
        difficulty: string;
        expires_at: number;
        fun_fact_available: boolean;
        hint_cost: number;
      };
    }
  >("register", { player_id: playerId, nickname });

  console.log("\n🎯 Welcome to the Agent Zero Arcade!");
  console.log(`Session token: ${registerResult.session_token}`);
  console.log(`Balance: ${registerResult.balance} ARC`);

  let activeQuestion = registerResult.active_question;
  if (!activeQuestion) {
    const questionResult = await callEntrypoint<
      { session_token: string },
      {
        active_question: {
          id: string;
          prompt: string;
          category?: string;
          difficulty: string;
          expires_at: number;
          fun_fact_available: boolean;
          hint_cost: number;
        };
      }
    >("question", { session_token: registerResult.session_token });
    activeQuestion = questionResult.active_question;
  }

  console.log("\n🧠 Challenge unlocked!");
  console.log(`Category: ${activeQuestion?.category ?? "mystery"}`);
  console.log(`Difficulty: ${activeQuestion?.difficulty}`);
  console.log(`Question: ${activeQuestion?.prompt}`);

  const answer = await rl.question("\nYour answer: ");

  const answerResult = await callEntrypoint<
    { session_token: string; answer: string },
    {
      verdict: string;
      explanation: string;
      earned_arc: number;
      balance: number;
      streak: number;
      normalized_expected?: string;
      fun_fact?: string;
      payout?: unknown;
      next_hint_cost: number;
    }
  >("answer", { session_token: registerResult.session_token, answer });

  console.log("\n📊 Results");
  console.log(`Verdict: ${answerResult.verdict}`);
  console.log(`Explanation: ${answerResult.explanation}`);
  console.log(`Earned ARC: ${answerResult.earned_arc}`);
  console.log(`New balance: ${answerResult.balance}`);
  console.log(`Current streak: ${answerResult.streak}`);

  if (answerResult.fun_fact) {
    console.log(`Fun fact: ${answerResult.fun_fact}`);
  } else if (answerResult.normalized_expected) {
    console.log(`Expected answer: ${answerResult.normalized_expected}`);
  }

  if (answerResult.payout) {
    console.log("\n💸 Payout info:");
    console.dir(answerResult.payout, { depth: null });
  }

  const leaderboardResult = await callEntrypoint<Record<string, never>, {
    updated_at: number;
    items: Array<{ player_id: string; balance: number; streak: number }>;
  }>("leaderboard", {});

  console.log("\n🏆 Leaderboard Preview");
  leaderboardResult.items.slice(0, 5).forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.player_id} — balance: ${item.balance} ARC (streak ${item.streak})`
    );
  });

  rl.close();
}

main().catch((error) => {
  if (
    error instanceof Error &&
    /402/.test(error.message) &&
    !process.env.PRIVATE_KEY
  ) {
    console.error(
      "Client failed due to missing payment credentials. Set PRIVATE_KEY to automatically settle x402 invoices."
    );
    return;
  }
  console.error("Client run failed:", error);
  process.exit(1);
});
