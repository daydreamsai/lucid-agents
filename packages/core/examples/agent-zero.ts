import { z } from 'zod';
import { createAgentApp } from '@lucid-agents/hono';
import { AgentKitConfig, createAxLLMClient } from '@lucid-agents/core';
import { paymentsFromEnv } from '@lucid-agents/payments';
import { flow } from '@ax-llm/ax';

/**
 * Agent Zero now runs a lightweight quiz arcade. Players register for a session,
 * request questions, submit answers, and earn ARC tokens that can be cashed out
 * once a balance threshold is reached. Ax-powered flows generate questions,
 * adjudicate answers, and craft hints. When Ax isn't configured the agent falls
 * back to scripted content so local development still works.
 */

type Difficulty = 'easy' | 'medium' | 'hard';
type Verdict = 'correct' | 'partial' | 'wrong';

type ActiveQuestion = {
  id: string;
  prompt: string;
  answerKey: string;
  funFact?: string;
  category?: string;
  difficulty: Difficulty;
  generatedAt: number;
  expiresAt: number;
  hintsUsed: number;
};

type HistoryEntry = {
  questionId: string;
  verdict: Verdict | 'expired';
  earned: number;
  balanceAfter: number;
  category?: string;
  difficulty: Difficulty;
  timestamp: number;
};

type PlayerSession = {
  sessionToken: string;
  playerId: string;
  nickname?: string;
  balance: number;
  streak: number;
  rating: number;
  lastQuestion?: ActiveQuestion;
  history: HistoryEntry[];
  createdAt: number;
};

const QUESTION_TIMEOUT_MS = 120_000;
const HINT_COST = 5;
const CORRECT_BASE_REWARD = 10;
const PAYOUT_THRESHOLD = 100;
const MAX_HISTORY = 100;

const CATEGORIES = [
  'general knowledge',
  'sci-fi universe',
  'crypto lore',
  'pop culture',
  'tech history',
] as const;

const DEFAULT_FUN_FACT = 'Great effort! Keep the streak alive for bonus ARC.';

const axClient = createAxLLMClient({
  apiUrl: 'https://api-beta.daydreams.systems/v1',
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[examples] ${message}`, error);
      } else {
        console.warn(`[examples] ${message}`);
      }
    },
  },
});

if (!axClient.isConfigured()) {
  console.warn(
    '[examples] Ax LLM provider not configured — gameplay will fall back to scripted questions.'
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __agentZeroSessions: Map<string, PlayerSession> | undefined;
}

const sessions =
  globalThis.__agentZeroSessions ?? new Map<string, PlayerSession>();
if (!globalThis.__agentZeroSessions) {
  globalThis.__agentZeroSessions = sessions;
}

const questionFlow = flow<
  { category?: string; difficulty: Difficulty },
  { question: string; answerKey: string; funFact?: string }
>()
  .node(
    'questionSmith',
    'category?:string, difficulty:string -> prompt:string "Question text only", answer_key:string "Canonical answer", fun_fact?:string "Optional reveal"'
  )
  .execute('questionSmith', state => ({
    category: state.category,
    difficulty: state.difficulty,
  }))
  .returns(state => ({
    question: String(state.questionSmithResult.prompt ?? '').trim(),
    answerKey: String(state.questionSmithResult.answer_key ?? '').trim(),
    funFact: state.questionSmithResult.fun_fact
      ? String(state.questionSmithResult.fun_fact).trim()
      : undefined,
  }));

const judgeFlow = flow<
  {
    question: string;
    answerKey: string;
    playerAnswer: string;
  },
  { verdict: Verdict; rationale: string; normalizedExpected: string }
>()
  .node(
    'judgeJury',
    'question:string, player_answer:string, answer_key:string -> verdict:class "correct, partial, wrong", rationale:string, normalized_expected:string'
  )
  .execute('judgeJury', state => ({
    question: state.question,
    player_answer: state.playerAnswer,
    answer_key: state.answerKey,
  }))
  .returns(state => ({
    verdict: (state.judgeJuryResult.verdict as Verdict) ?? 'wrong',
    rationale: String(state.judgeJuryResult.rationale ?? '').trim(),
    normalizedExpected: String(
      state.judgeJuryResult.normalized_expected ?? state.answerKey
    ).trim(),
  }));

const hintFlow = flow<
  { question: string; answerKey: string; hintNumber: number },
  { hint: string; encouragement?: string }
>()
  .node(
    'hintForge',
    'question:string, answer_key:string, hint_number:number -> hint:string, encouragement?:string'
  )
  .execute('hintForge', state => ({
    question: state.question,
    answer_key: state.answerKey,
    hint_number: state.hintNumber,
  }))
  .returns(state => ({
    hint: String(state.hintForgeResult.hint ?? '').trim(),
    encouragement: state.hintForgeResult.encouragement
      ? String(state.hintForgeResult.encouragement).trim()
      : undefined,
  }));

const config: AgentKitConfig = {
  payments: {
    payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    network: 'base',
  },
};

const { app, addEntrypoint } = createAgentApp(
  {
    name: 'Agent Zero Arcade',
    version: '1.0.0',
    description:
      'A playful quiz agent where GPT runs the arcade, awards ARC tokens, and celebrates streaks.',
    image: 'https://agent-zero-arcade.example.com/og-image.png',
    url: 'https://agent-zero-arcade.example.com',
    type: 'website',
  },
  {
    config,
    payments: {
      register: false,
      question: true,
      answer: true,
      hint: true,
      leaderboard: false,
    },
    trust: {
      trustModels: ['arcade-fair-play'],
    },
  }
);

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);

const questionPayloadSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  category: z.string().optional(),
  difficulty: difficultyEnum,
  expires_at: z.number(),
  fun_fact_available: z.boolean(),
  hint_cost: z.number(),
});

const registerInputSchema = z.object({
  player_id: z.string().min(1, { message: 'player_id is required' }),
  nickname: z
    .string()
    .trim()
    .min(1, { message: 'Nickname cannot be empty' })
    .max(32, { message: 'Nickname too long' })
    .optional(),
});

const questionInputSchema = z.object({
  session_token: z.string().min(1),
  category: z.string().trim().pipe(z.string().min(1)).optional(),
  difficulty: difficultyEnum.optional(),
});

const answerInputSchema = z.object({
  session_token: z.string().min(1),
  answer: z.string().trim().min(1, { message: 'Answer cannot be empty' }),
});

const hintInputSchema = z.object({
  session_token: z.string().min(1),
});

const leaderboardItemSchema = z.object({
  nickname: z.string().optional(),
  player_id: z.string(),
  balance: z.number(),
  streak: z.number(),
  rating: z.number(),
  themes_unlocked: z.array(z.string()).optional(),
});

const leaderboardOutputSchema = z.object({
  updated_at: z.number(),
  items: z.array(leaderboardItemSchema),
});

const welcomeGrant = 20;

function randomPick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function ensureSession(sessionToken: string): PlayerSession {
  const session = sessions.get(sessionToken);
  if (!session) {
    throw new Error(
      'Session not found. Register first to get a session token.'
    );
  }
  return session;
}

function assignSession(input: {
  playerId: string;
  nickname?: string;
}): PlayerSession {
  const sessionToken = crypto.randomUUID();
  const session: PlayerSession = {
    sessionToken,
    playerId: input.playerId,
    nickname: input.nickname,
    balance: welcomeGrant,
    streak: 0,
    rating: 1150,
    history: [],
    createdAt: Date.now(),
  };
  sessions.set(sessionToken, session);
  return session;
}

function determineDifficulty(session: PlayerSession): Difficulty {
  if (session.rating >= 1350) return 'hard';
  if (session.rating >= 1200) return 'medium';
  return 'easy';
}

function difficultyMultiplier(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'easy':
      return 1;
    case 'medium':
      return 1.5;
    case 'hard':
      return 2.25;
    default:
      return 1;
  }
}

function streakBonus(streak: number) {
  return streak > 1 ? Math.floor(Math.log2(streak) * 4) : 0;
}

function adjustRating(
  session: PlayerSession,
  verdict: Verdict,
  difficulty: Difficulty
): void {
  const multiplier = difficultyMultiplier(difficulty);
  const base =
    verdict === 'correct' ? 20 : verdict === 'partial' ? 5 : -15 * multiplier;
  const delta =
    verdict === 'correct'
      ? Math.round(multiplier * (25 + streakBonus(session.streak + 1)))
      : verdict === 'partial'
        ? Math.round(multiplier * 5)
        : Math.round(-20 * multiplier);
  const nextRating = session.rating + Math.round(base + delta / 3);
  session.rating = Math.min(1600, Math.max(900, nextRating));
}

function computeThemes(session: PlayerSession): string[] {
  const themes: string[] = [];
  if (session.balance >= 50) themes.push('bonus-round');
  if (session.streak >= 3) themes.push('streak-fury');
  if (session.rating >= 1350) themes.push('galactic-challenge');
  if (session.history.length >= 10) themes.push('quiz-marathon');
  return themes;
}

function trimHistory(session: PlayerSession) {
  if (session.history.length > MAX_HISTORY) {
    session.history.splice(0, session.history.length - MAX_HISTORY);
  }
}

function fallbackQuestion(difficulty: Difficulty, category?: string) {
  const fallbackBank: Array<
    Omit<ActiveQuestion, 'id' | 'generatedAt' | 'expiresAt' | 'hintsUsed'>
  > = [
    {
      prompt:
        'Which planet in our solar system is famous for its rings and is named after the Roman god of agriculture?',
      answerKey: 'Saturn',
      funFact:
        "Saturn could float in a bathtub if you could find one big enough—it's less dense than water!",
      category: 'general knowledge',
      difficulty: 'easy',
    },
    {
      prompt:
        'In the original Star Wars trilogy, what is the name of the moon-sized battle station capable of destroying planets?',
      answerKey: 'The Death Star',
      funFact:
        'The Death Star design is rumored to have inspired countless sci-fi mega-structures.',
      category: 'sci-fi universe',
      difficulty: 'medium',
    },
    {
      prompt:
        'What cryptographic concept, named after a British mathematician, involves breaking problems down using a diagonalization argument?',
      answerKey: 'Turing diagonalization',
      funFact:
        'Alan Turing introduced diagonalization while exploring the limits of computation.',
      category: 'crypto lore',
      difficulty: 'hard',
    },
    {
      prompt:
        "Which pop icon released the album '1989', sparking a wave of synth-pop nostalgia?",
      answerKey: 'Taylor Swift',
      funFact:
        "The album is named after the artist's birth year and marked her shift into pop.",
      category: 'pop culture',
      difficulty: 'easy',
    },
  ];

  const candidates = fallbackBank.filter(item => {
    if (category && item.category !== category) return false;
    return item.difficulty === difficulty;
  });
  const chosen = (candidates.length ? candidates : fallbackBank)[
    Math.floor(
      Math.random() *
        (candidates.length ? candidates.length : fallbackBank.length)
    )
  ];
  return {
    ...chosen,
    difficulty,
    category: category ?? chosen.category,
  };
}

async function generateQuestion(options: {
  difficulty: Difficulty;
  category?: string;
}): Promise<
  Omit<ActiveQuestion, 'id' | 'generatedAt' | 'expiresAt' | 'hintsUsed'>
> {
  const llm = axClient.ax;
  if (!llm) {
    const fallback = fallbackQuestion(options.difficulty, options.category);
    return fallback;
  }

  try {
    const fallback = fallbackQuestion(options.difficulty, options.category);
    const result = await questionFlow.forward(llm, {
      category: options.category,
      difficulty: options.difficulty,
    });
    questionFlow.resetUsage();

    const question =
      result.question.length > 0 ? result.question : fallback.prompt;
    const answerKey =
      result.answerKey.length > 0 ? result.answerKey : fallback.answerKey;

    return {
      prompt: question,
      answerKey,
      funFact: result.funFact || fallback.funFact || DEFAULT_FUN_FACT,
      category: options.category ?? fallback.category ?? randomPick(CATEGORIES),
      difficulty: options.difficulty,
    };
  } catch (error) {
    console.warn(
      '[examples] Question generation failed, using fallback',
      error
    );
    return fallbackQuestion(options.difficulty, options.category);
  }
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function simpleVerdict(playerAnswer: string, answerKey: string): Verdict {
  const normalizedAnswer = normalizeText(playerAnswer);
  const normalizedKey = normalizeText(answerKey);
  if (normalizedAnswer === normalizedKey) return 'correct';
  if (
    normalizedKey.includes(normalizedAnswer) ||
    normalizedAnswer.includes(normalizedKey)
  ) {
    return 'partial';
  }
  return 'wrong';
}

async function judgeAnswer(input: {
  question: string;
  answerKey: string;
  playerAnswer: string;
}): Promise<{
  verdict: Verdict;
  rationale: string;
  normalizedExpected: string;
}> {
  const llm = axClient.ax;
  if (!llm) {
    const verdict = simpleVerdict(input.playerAnswer, input.answerKey);
    return {
      verdict,
      rationale:
        verdict === 'correct'
          ? 'Spot on! That matches the expected answer.'
          : verdict === 'partial'
            ? "Close! You're circling the right idea, add a bit more detail."
            : 'Not quite. Compare your answer to the canonical answer for clues.',
      normalizedExpected: input.answerKey,
    };
  }

  try {
    const result = await judgeFlow.forward(llm, {
      question: input.question,
      answerKey: input.answerKey,
      playerAnswer: input.playerAnswer,
    });
    judgeFlow.resetUsage();
    return result;
  } catch (error) {
    console.warn('[examples] Judge flow failed, using fallback verdict', error);
    const verdict = simpleVerdict(input.playerAnswer, input.answerKey);
    return {
      verdict,
      rationale:
        verdict === 'correct'
          ? 'Correct according to the fallback checker.'
          : verdict === 'partial'
            ? 'Partially correct per fallback checker.'
            : 'Incorrect according to the fallback checker.',
      normalizedExpected: input.answerKey,
    };
  }
}

async function buildHint(input: {
  question: string;
  answerKey: string;
  hintNumber: number;
}): Promise<{ hint: string; encouragement?: string }> {
  const llm = axClient.ax;
  if (!llm) {
    return {
      hint:
        input.hintNumber === 1
          ? 'Think about the most iconic aspect related to this topic.'
          : 'Try narrowing your answer to a specific proper noun or title.',
      encouragement: 'You got this! One more thought and the ARC is yours.',
    };
  }

  try {
    const result = await hintFlow.forward(llm, input);
    hintFlow.resetUsage();
    if (!result.hint) {
      return {
        hint: 'The answer is within reach—focus on the unique identifier!',
        encouragement: result.encouragement ?? 'Trust your instincts.',
      };
    }
    return result;
  } catch (error) {
    console.warn('[examples] Hint flow failed, using fallback hint', error);
    return {
      hint: 'Consider the main theme and reframe your guess through that lens.',
      encouragement: 'Keep at it! Even legends need a hint sometimes.',
    };
  }
}

function ensureActiveQuestion(session: PlayerSession) {
  const current = session.lastQuestion;
  if (!current) {
    throw new Error('No active question. Request a new question first.');
  }
  return current;
}

function handleExpiration(
  session: PlayerSession,
  question: ActiveQuestion
): HistoryEntry {
  session.streak = 0;
  session.balance = Math.max(0, session.balance - 3);
  const historyEntry: HistoryEntry = {
    questionId: question.id,
    verdict: 'expired',
    earned: -3,
    balanceAfter: session.balance,
    category: question.category,
    difficulty: question.difficulty,
    timestamp: Date.now(),
  };
  session.history.push(historyEntry);
  trimHistory(session);
  session.lastQuestion = undefined;
  return historyEntry;
}

function sessionQuestionToPayload(question: ActiveQuestion) {
  return questionPayloadSchema.parse({
    id: question.id,
    prompt: question.prompt,
    category: question.category,
    difficulty: question.difficulty,
    expires_at: question.expiresAt,
    fun_fact_available: Boolean(question.funFact),
    hint_cost: HINT_COST,
  });
}

function maybeCreatePayout(balance: number) {
  if (balance < PAYOUT_THRESHOLD) return undefined;
  const payments = paymentsFromEnv(config.payments);
  if (!payments) {
    return {
      threshold: PAYOUT_THRESHOLD,
      status: 'pending-config',
      message:
        'Balance reached payout threshold, but x402 payments are not configured for this environment.',
    };
  }
  return {
    threshold: PAYOUT_THRESHOLD,
    status: 'ready',
    payments,
  };
}

function chunkMessage(text: string, size = 64) {
  const chunks: string[] = [];
  let pointer = 0;
  while (pointer < text.length) {
    chunks.push(text.slice(pointer, pointer + size));
    pointer += size;
  }
  return chunks.length ? chunks : [text];
}

addEntrypoint({
  key: 'register',
  description: 'Register a new player and receive a welcome ARC grant.',
  input: registerInputSchema,
  output: z.object({
    session_token: z.string(),
    nickname: z.string().optional(),
    balance: z.number(),
    streak: z.number(),
    active_question: questionPayloadSchema.optional(),
  }),
  async handler(ctx) {
    const payload = registerInputSchema.parse(ctx.input);
    const session = assignSession({
      playerId: payload.player_id,
      nickname: payload.nickname,
    });

    const difficulty = determineDifficulty(session);
    const category = randomPick(CATEGORIES);
    const generated = await generateQuestion({ difficulty, category });
    const question: ActiveQuestion = {
      id: crypto.randomUUID(),
      prompt: generated.prompt,
      answerKey: generated.answerKey,
      funFact: generated.funFact ?? DEFAULT_FUN_FACT,
      category: generated.category ?? category,
      difficulty,
      generatedAt: Date.now(),
      expiresAt: Date.now() + QUESTION_TIMEOUT_MS,
      hintsUsed: 0,
    };
    session.lastQuestion = question;

    console.log(generated);

    return {
      output: {
        session_token: session.sessionToken,
        nickname: session.nickname,
        balance: session.balance,
        streak: session.streak,
        active_question: sessionQuestionToPayload(question),
      },
    };
  },
});

addEntrypoint({
  key: 'question',
  description: 'Request a fresh quiz question from the Agent Zero arcade.',
  input: questionInputSchema,
  output: z.object({
    active_question: questionPayloadSchema,
    balance: z.number(),
    streak: z.number(),
  }),
  async handler(ctx) {
    const payload = questionInputSchema.parse(ctx.input);
    const session = ensureSession(payload.session_token);

    const difficulty =
      payload.difficulty ?? determineDifficulty(session ?? undefined);
    const category =
      payload.category && payload.category.length > 0
        ? payload.category
        : randomPick(CATEGORIES);

    const generated = await generateQuestion({
      difficulty,
      category,
    });
    const question: ActiveQuestion = {
      id: crypto.randomUUID(),
      prompt: generated.prompt,
      answerKey: generated.answerKey,
      funFact: generated.funFact ?? DEFAULT_FUN_FACT,
      category: generated.category ?? category,
      difficulty,
      generatedAt: Date.now(),
      expiresAt: Date.now() + QUESTION_TIMEOUT_MS,
      hintsUsed: 0,
    };
    session.lastQuestion = question;

    return {
      output: {
        active_question: sessionQuestionToPayload(question),
        balance: session.balance,
        streak: session.streak,
      },
    };
  },
});

addEntrypoint({
  key: 'answer',
  description:
    'Submit an answer. Tokens are awarded based on correctness, difficulty, and streak.',
  input: answerInputSchema,
  output: z.object({
    verdict: z.enum(['correct', 'partial', 'wrong', 'expired']),
    explanation: z.string(),
    earned_arc: z.number(),
    balance: z.number(),
    streak: z.number(),
    normalized_expected: z.string().optional(),
    fun_fact: z.string().optional(),
    payout: z
      .object({
        threshold: z.number(),
        status: z.enum(['ready', 'pending-config']),
        payments: z
          .object({
            facilitatorUrl: z.string(),
            payTo: z.string(),
            network: z.string(),
            defaultPrice: z.string().optional(),
          })
          .optional(),
        message: z.string().optional(),
      })
      .optional(),
    next_hint_cost: z.number(),
  }),
  async handler(ctx) {
    const payload = answerInputSchema.parse(ctx.input);
    const session = ensureSession(payload.session_token);
    const question = ensureActiveQuestion(session);

    if (Date.now() > question.expiresAt) {
      const historyEntry = handleExpiration(session, question);
      return {
        output: {
          verdict: 'expired',
          explanation:
            "Time's up! ARC slipped away. Request a new question to jump back in.",
          earned_arc: historyEntry.earned,
          balance: session.balance,
          streak: session.streak,
          normalized_expected: question.answerKey,
          fun_fact: question.funFact,
          payout: maybeCreatePayout(session.balance),
          next_hint_cost: HINT_COST,
        },
      };
    }

    const judge = await judgeAnswer({
      question: question.prompt,
      answerKey: question.answerKey,
      playerAnswer: payload.answer,
    });

    let earned = 0;
    if (judge.verdict === 'correct') {
      session.streak += 1;
      earned =
        Math.round(
          CORRECT_BASE_REWARD * difficultyMultiplier(question.difficulty)
        ) + streakBonus(session.streak);
      session.balance += earned;
    } else if (judge.verdict === 'partial') {
      session.streak = 0;
      earned = Math.max(
        2,
        Math.round(
          CORRECT_BASE_REWARD * 0.4 * difficultyMultiplier(question.difficulty)
        )
      );
      session.balance += earned;
    } else {
      session.streak = 0;
      earned = -Math.min(
        3,
        Math.round(difficultyMultiplier(question.difficulty))
      );
      session.balance = Math.max(0, session.balance + earned);
    }

    adjustRating(session, judge.verdict, question.difficulty);

    const historyEntry: HistoryEntry = {
      questionId: question.id,
      verdict: judge.verdict,
      earned,
      balanceAfter: session.balance,
      category: question.category,
      difficulty: question.difficulty,
      timestamp: Date.now(),
    };
    session.history.push(historyEntry);
    trimHistory(session);

    const payout = maybeCreatePayout(session.balance);
    if (payout?.status === 'ready') {
      // Reset balance after exposing payout payload to avoid double counting.
      session.balance = 0;
      session.streak = 0;
    }

    session.lastQuestion = undefined;

    return {
      output: {
        verdict: judge.verdict,
        explanation: judge.rationale,
        earned_arc: earned,
        balance: session.balance,
        streak: session.streak,
        normalized_expected: judge.normalizedExpected ?? question.answerKey,
        fun_fact: judge.verdict === 'correct' ? question.funFact : undefined,
        payout,
        next_hint_cost: HINT_COST,
      },
    };
  },
});

addEntrypoint({
  key: 'hint',
  description:
    'Spend ARC to receive a hint. Hints become progressively more specific.',
  input: hintInputSchema,
  output: z.object({
    balance: z.number(),
    hint_number: z.number(),
  }),
  streaming: true,
  async stream(ctx, emit) {
    const payload = hintInputSchema.parse(ctx.input);
    const session = ensureSession(payload.session_token);
    const question = ensureActiveQuestion(session);

    if (Date.now() > question.expiresAt) {
      handleExpiration(session, question);
      await emit({
        kind: 'delta',
        delta: 'This question expired. Request a new challenge!',
        mime: 'text/plain',
      });
      return {
        output: {
          balance: session.balance,
          hint_number: question.hintsUsed,
        },
      };
    }

    if (question.hintsUsed >= 2) {
      await emit({
        kind: 'delta',
        delta: 'Hint limit reached. Try submitting an answer!',
        mime: 'text/plain',
      });
      return {
        output: {
          balance: session.balance,
          hint_number: question.hintsUsed,
        },
      };
    }

    if (session.balance < HINT_COST) {
      await emit({
        kind: 'delta',
        delta: 'Not enough ARC for a hint. Win a round or cash-in soon!',
        mime: 'text/plain',
      });
      return {
        output: {
          balance: session.balance,
          hint_number: question.hintsUsed,
        },
      };
    }

    session.balance -= HINT_COST;
    question.hintsUsed += 1;

    const hintResult = await buildHint({
      question: question.prompt,
      answerKey: question.answerKey,
      hintNumber: question.hintsUsed,
    });

    const chunks = chunkMessage(hintResult.hint);
    for (const chunk of chunks) {
      await emit({
        kind: 'delta',
        delta: chunk,
        mime: 'text/plain',
      });
    }
    if (hintResult.encouragement) {
      await emit({
        kind: 'text',
        text: hintResult.encouragement,
        mime: 'text/plain',
      });
    }

    return {
      output: {
        balance: session.balance,
        hint_number: question.hintsUsed,
      },
    };
  },
});

addEntrypoint({
  key: 'leaderboard',
  description: 'View top players, streaks, and unlocked quiz themes.',
  input: z.object({}).optional().default({}),
  output: leaderboardOutputSchema,
  async handler() {
    const now = Date.now();
    const items = Array.from(sessions.values())
      .sort((a, b) => b.balance - a.balance || b.rating - a.rating)
      .slice(0, 10)
      .map(session =>
        leaderboardItemSchema.parse({
          nickname: session.nickname,
          player_id: session.playerId,
          balance: session.balance,
          streak: session.streak,
          rating: session.rating,
          themes_unlocked: computeThemes(session),
        })
      );

    return {
      output: {
        updated_at: now,
        items,
      },
    };
  },
});

const port = Number(process.env.PORT ?? 8787);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `🎯 Agent Zero Arcade ready at https://${server.hostname}:${server.port}/entrypoints/register/invoke`
);
