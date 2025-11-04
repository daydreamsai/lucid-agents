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
    const existingMeta = JSON.parse(existingMetaRaw) as Record<
      string,
      unknown
    >;
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
  it("scaffolds a new project with placeholders replaced", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(["demo-agent", "--template=blank", "--env=no"], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, "demo-agent");
    const pkg = await readJson(join(projectDir, "package.json"));
    const readme = await readFile(join(projectDir, "README.md"), "utf8");
    const agentSrc = await readFile(join(projectDir, "src/agent.ts"), "utf8");
    const envExample = await readFile(
      join(projectDir, ".env.example"),
      "utf8"
    );

    expect(pkg.name).toBe("demo-agent");
    expect(readme).toContain("demo-agent");
    expect(readme).toContain("- `echo` – Returns text that you send to the agent.");
    expect(readme).not.toContain("{{");
    expect(agentSrc).toContain('name: "demo-agent"');
    expect(agentSrc).toContain('version: "0.1.0"');
    expect(agentSrc).toContain(
      'description: "Starter agent generated with create-agent-kit"'
    );
    expect(agentSrc).toContain("const agentOptions = {}");
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain('// price: "1000",');
    expect(agentSrc).not.toContain("{{APP_NAME}}");
    expect(envExample).toContain("NETWORK=base-sepolia");
    expect(envExample).not.toContain("{{");
    expect(envExample).toContain("PRIVATE_KEY=");
  });

  it("applies onboarding answers to the scaffolded template", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const inputResponses = new Map<string, string>([
      ["How would you describe your agent?", "Quote assistant for pricing."],
      ["What version should the agent start at?", "1.0.0"],
      ["Name the default entrypoint", "Quote Price"],
      ["Describe what the default entrypoint does", "Calculates quote totals."],
      ["Facilitator URL", "https://facilitator.example"],
      ["Preferred network (chain identifier)", "base"],
      ["Pay-to address", "0xabc0000000000000000000000000000000000000"],
      ["Default price in base units", "4200"],
      ["Set a price for the default entrypoint", "4500"],
    ]);

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? "",
      confirm: async ({ message, defaultValue }) =>
        message.includes("x402 payments")
          ? true
          : defaultValue ?? false,
      input: async ({ message, defaultValue = "" }) =>
        inputResponses.get(message) ?? defaultValue,
    };

    await runCli(["quote-agent", "--template=blank", "--env=no"], {
      cwd,
      logger,
      prompt,
    });

    const projectDir = join(cwd, "quote-agent");
    const agentSrc = await readFile(join(projectDir, "src/agent.ts"), "utf8");
    const readme = await readFile(join(projectDir, "README.md"), "utf8");
    const envExample = await readFile(
      join(projectDir, ".env.example"),
      "utf8"
    );

    expect(agentSrc).toContain('version: "1.0.0"');
    expect(agentSrc).toContain(
      'description: "Quote assistant for pricing."'
    );
    expect(agentSrc).toContain('key: "quote-price"');
    expect(agentSrc).toContain('price: "4500",');
    expect(agentSrc).toContain(
      'facilitatorUrl: "https://facilitator.example"'
    );
    expect(agentSrc).toContain(
      'defaultPrice: "4200",'
    );
    expect(readme).toContain("quote-price");
    expect(readme).toContain("(price: 4500 base units)");
    expect(envExample).toContain("NETWORK=base");
    expect(envExample).toContain(
      "FACILITATOR_URL=https://facilitator.example"
    );
    expect(envExample).toContain("PAY_TO=0xabc0000000000000000000000000000000000000");
    expect(envExample).toContain("DEFAULT_PRICE=4200");
    expect(envExample).toContain("PRIVATE_KEY=");
  });

  it("prompts for a project name when not provided and prompt is available", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? "",
      confirm: async () => false,
      input: async ({ message, defaultValue = "" }) =>
        message === "Project directory name:"
          ? "prompted-agent"
          : defaultValue,
    };

    await runCli(["--template=blank", "--env=no"], {
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

    await runCli(["--template=blank", "--env=no"], {
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
      runCli(["existing", "--template=blank", "--env=no"], { cwd, logger })
    ).rejects.toThrow(/already exists and is not empty/);
  });

  it("prints help and exits early when --help is passed", async () => {
    const cwd = await createTempDir();
    const { logger, messages } = createLogger();

    await runCli(["--help"], { cwd, logger });

    expect(messages.join("\n")).toContain(
      "Usage: npx create-agent-kit <app-name>"
    );
    const entries = await readdir(cwd);
    expect(entries.length).toBe(0);
  });

  it("copies env example when --env=yes", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(["env-agent", "--template=blank", "--env=yes"], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, "env-agent");
    const env = await readFile(join(projectDir, ".env"), "utf8");
    const envExample = await readFile(join(projectDir, ".env.example"), "utf8");
    expect(env).toBe(envExample);
  });

  it("prompts for env values when available", async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const responses = new Map<string, string>([
      ["PORT", "3333"],
      ["API_BASE_URL", "http://localhost:9999"],
      ["RPC_URL", "https://example"],
      ["REGISTER_IDENTITY", "true"],
      ["NETWORK", "base"],
      ["FACILITATOR_URL", "https://facilitator"],
      ["PAY_TO", "0x1234"],
      ["DEFAULT_PRICE", "5000"],
    ]);

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? "",
      confirm: async () => true,
      input: async ({ message, defaultValue = "" }) =>
        responses.get(message) ?? defaultValue,
    };

    await runCli(["env-agent"], { cwd, logger, prompt });

    const projectDir = join(cwd, "env-agent");
    const env = await readFile(join(projectDir, ".env"), "utf8");
    expect(env).toContain("PORT=3333");
    expect(env).toContain("API_BASE_URL=http://localhost:9999");
    expect(env).toContain("DEFAULT_PRICE=5000");
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
});
