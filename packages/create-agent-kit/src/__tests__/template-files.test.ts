import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderTemplateTree } from "../template/files.js";

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-kit-template-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("renderTemplateTree", () => {
  it("replaces placeholders across directory tree", async () => {
    await withTempDir(async (dir) => {
      const srcDir = path.join(dir, "src");
      await fs.mkdir(srcDir);
      const filePath = path.join(srcDir, "agent.ts");
      await fs.writeFile(filePath, "const name = '{{NAME}}';\n", "utf8");

      await renderTemplateTree(dir, { NAME: "demo" });

      const result = await fs.readFile(filePath, "utf8");
      expect(result).toContain("const name = 'demo';");
    });
  });

  it("skips default ignored directories", async () => {
    await withTempDir(async (dir) => {
      const skipDir = path.join(dir, "node_modules");
      await fs.mkdir(skipDir);
      const skipFile = path.join(skipDir, "package.txt");
      await fs.writeFile(skipFile, "skip {{TOKEN}}", "utf8");

      await renderTemplateTree(dir, { TOKEN: "value" });

      const untouched = await fs.readFile(skipFile, "utf8");
      expect(untouched).toBe("skip {{TOKEN}}");
    });
  });
});
