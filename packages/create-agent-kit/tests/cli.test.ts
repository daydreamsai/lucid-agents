import { afterEach, describe, expect, it } from "bun:test";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, type PromptApi } from "../src/index.js";

const tempPaths: string[] = [];

afterEach(async () => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (!dir) continue;
    await rm(dir, { recursive: true, force: true });
  }
});

const createTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "create-agent-kit-"));
  tempPaths.push(dir);
  return dir;
};

const createLogger = () => {
  const messages: string[] = [];
  const logger = {
    log: (message: string) => {
      messages.push(message);
    },
    warn: (message: string) => {
      messages.push(message);
    },
    error: (message: string) => {
      messages.push(message);
    },
  };

  return { logger, messages };
};

const getRepoTemplatePath = (id: string) => {
  const currentDir = fileURLToPath(new URL("..", import.meta.url));
  return resolve(currentDir, "templates", id);
};

const createTemplateRoot = async (templateIds: string[]) => {
  const root = await createTempDir();
  for (const id of templateIds) {
    const target = join(root, id);
    await cp(getRepoTemplatePath("blank"), target, { recursive: true });
    const templateMetaPath = join(target, "template.json");
    const existingMetaRaw = await readFile(templateMetaPath, "utf8");
    const existingMeta = JSON.parse(existingMetaRaw) as Record<string, unknown>;
    const updatedMeta = {
      ...existingMeta,
      id,
      name: `Template ${id}`,
      description: `The ${id} template`,
    };
    await writeFile(
      templateMetaPath,
      JSON.stringify(updatedMeta, null, 2),
      "utf8"
    );
    const readmePath = join(target, "README.md");
    const originalReadme = await readFile(readmePath, "utf8");
    await writeFile(
      readmePath,
      `${originalReadme}\n<!-- template:${id} -->\n`,
      "utf8"
    );
  }
  return root;
};

const readJson = async (path: string) => {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
};

describe("create-agent-kit CLI", () => {
  it("scaffolds a new project with wizard defaults", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(["demo-agent", "--template=blank", "--wizard=no"], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, "demo-agent");
    const pkg = await readJson(join(projectDir, "package.json"));
    const readme = await readFile(join(projectDir, "README.md"), "utf8");
    const agentSrc = await readFile(join(projectDir, "src/agent.ts"), "utf8");
    const envFile = await readFile(join(projectDir, ".env"), "utf8");

    expect(pkg.name).toBe("demo-agent");
    expect(readme).toContain("demo-agent");
    expect(readme).not.toContain("{{");

    // agent.ts uses process.env
    expect(agentSrc).toContain("process.env.AGENT_NAME");
    expect(agentSrc).toContain("process.env.AGENT_VERSION");
    expect(agentSrc).toContain("process.env.AGENT_DESCRIPTION");
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain("useConfigPayments: true");
    expect(agentSrc).not.toContain("{{");

    // .env has defaults from template.json
    expect(envFile).toContain("AGENT_NAME=demo-agent");
    expect(envFile).toContain("AGENT_VERSION=0.1.0");
    expect(envFile).toContain("PAYMENTS_RECEIVABLE_ADDRESS=");
    expect(envFile).toContain("PRIVATE_KEY=");
  });

  it("applies wizard answers to generate .env file", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const inputResponses = new Map<string, string>([
      ["How would you describe your agent?", "Quote assistant for pricing."],
      ["What version should the agent start at?", "1.0.0"],
      ["Facilitator URL", "https://facilitator.example"],
      ["Payment network identifier", "base"],
      [
        "Receivable address (address that receives payments)",
        "0xabc0000000000000000000000000000000000000",
      ],
      ["Default price in base units", "4200"],
      ["Wallet private key (leave empty to add later)", ""],
    ]);

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? "",
      confirm: async ({ defaultValue }) => defaultValue ?? false,
      input: async ({ message, defaultValue = "" }) =>
        inputResponses.get(message) ?? defaultValue,
    };

    await runCli(["quote-agent", "--template=blank"], {
      cwd,
      logger,
      prompt,
    });

    const projectDir = join(cwd, "quote-agent");
    const agentSrc = await readFile(join(projectDir, "src/agent.ts"), "utf8");
    const envFile = await readFile(join(projectDir, ".env"), "utf8");
    const readme = await readFile(join(projectDir, "README.md"), "utf8");

    // agent.ts now uses process.env
    expect(agentSrc).toContain("process.env.AGENT_NAME");
    expect(agentSrc).toContain("process.env.AGENT_VERSION");
    expect(agentSrc).toContain("process.env.AGENT_DESCRIPTION");
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain("useConfigPayments: true");

    // .env contains wizard answers
    expect(envFile).toContain("AGENT_NAME=quote-agent");
    expect(envFile).toContain("AGENT_VERSION=1.0.0");
    expect(envFile).toContain("AGENT_DESCRIPTION=Quote assistant for pricing.");
    expect(envFile).toContain(
      "PAYMENTS_FACILITATOR_URL=https://facilitator.example"
    );
    expect(envFile).toContain(
      "PAYMENTS_RECEIVABLE_ADDRESS=0xabc0000000000000000000000000000000000000"
    );
    expect(envFile).toContain("PAYMENTS_NETWORK=base");
    expect(envFile).toContain("PAYMENTS_DEFAULT_PRICE=4200");
    expect(envFile).toContain("PRIVATE_KEY=");

    // README uses agent name
    expect(readme).toContain("quote-agent");
  });

  it("prompts for a project name when not provided and prompt is available", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? "",
      confirm: async () => false,
      input: async ({ message, defaultValue = "" }) =>
        message === "Project directory name:" ? "prompted-agent" : defaultValue,
    };

    await runCli(["--template=blank"], {
      cwd,
      logger,
      prompt,
    });

    const projectDir = join(cwd, "prompted-agent");
    const pkg = await readJson(join(projectDir, "package.json"));

    expect(pkg.name).toBe("prompted-agent");
  });

  it("falls back to a default project name when not provided in non-interactive mode", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(["--template=blank", "--wizard=no"], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, "blank-agent");
    const pkg = await readJson(join(projectDir, "package.json"));

    expect(pkg.name).toBe("blank-agent");
  });

  it("refuses to scaffold into a non-empty directory", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const targetDir = join(cwd, "existing");
    await mkdir(targetDir);
    await writeFile(join(targetDir, "README.md"), "hello");

    await expect(
      runCli(["existing", "--template=blank", "--wizard=no"], { cwd, logger })
    ).rejects.toThrow(/already exists and is not empty/);
  });

  it("prints help and exits early when --help is passed", async () => {
    const cwd = await createTempDir();
    const { logger, messages } = createLogger();

    await runCli(["--help"], { cwd, logger });

    expect(messages.join("\n")).toContain(
      "Usage: bunx @lucid-agents/create-agent-kit <app-name>"
    );
    const entries = await readdir(cwd);
    expect(entries.length).toBe(0);
  });

  it("generates .env from wizard answers with defaults", async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(["blank"]);
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? "",
      confirm: async () => false,
      input: async ({ message, defaultValue = "" }) => {
        // Just use defaults for all inputs
        return defaultValue;
      },
    };

    await runCli(["env-agent"], { cwd, logger, prompt, templateRoot });

    const projectDir = join(cwd, "env-agent");
    const env = await readFile(join(projectDir, ".env"), "utf8");

    // Should have values from wizard (defaults in this case)
    expect(env).toContain("AGENT_NAME=env-agent");
    expect(env).toContain("PAYMENTS_NETWORK=base-sepolia");
    expect(env).toContain(
      "PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems"
    );
    expect(env).toContain("PRIVATE_KEY=");
  });

  it("requires --template when multiple templates and no prompt", async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(["alpha", "beta"]);
    const { logger } = createLogger();

    await expect(
      runCli(["project"], { cwd, logger, templateRoot })
    ).rejects.toThrow(/Multiple templates available/);
  });

  it("allows selecting template via prompt", async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(["alpha", "beta"]);
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) =>
        choices.find((c) => c.value === "beta")!.value,
      confirm: async () => false,
      input: async ({ defaultValue = "" }) => defaultValue,
    };

    await runCli(["project"], { cwd, logger, templateRoot, prompt });

    const projectDir = join(cwd, "project");
    const readme = await readFile(join(projectDir, "README.md"), "utf8");
    expect(readme).toContain("<!-- template:beta -->");
  });

  it("does not invoke prompt API when --wizard=no is used", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    // Create a prompt that throws if any method is called
    const prompt: PromptApi = {
      select: async () => {
        throw new Error("select() should not be called with --wizard=no");
      },
      confirm: async () => {
        throw new Error("confirm() should not be called with --wizard=no");
      },
      input: async () => {
        throw new Error("input() should not be called with --wizard=no");
      },
    };

    // Should not throw because prompt is never invoked
    await runCli(["no-prompt-agent", "--template=blank", "--wizard=no"], {
      cwd,
      logger,
      prompt,
    });

    // Verify project was created successfully with defaults
    const projectDir = join(cwd, "no-prompt-agent");
    const pkg = await readJson(join(projectDir, "package.json"));
    const envFile = await readFile(join(projectDir, ".env"), "utf8");

    expect(pkg.name).toBe("no-prompt-agent");
    expect(envFile).toContain("AGENT_NAME=no-prompt-agent");
    expect(envFile).toContain("AGENT_VERSION=0.1.0");
    expect(envFile).toContain("PAYMENTS_NETWORK=base-sepolia");
  });
});
