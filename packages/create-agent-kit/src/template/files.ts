import fs from "node:fs/promises";
import path from "node:path";
import {
  MissingTemplateValueError,
  renderTemplate,
} from "./render.js";

const DEFAULT_SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

export async function renderTemplateFile(
  filePath: string,
  replacements: Record<string, string>
) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    let replaced = raw;
    try {
      replaced = renderTemplate(raw, { context: replacements });
    } catch (error: unknown) {
      if (error instanceof MissingTemplateValueError) {
        const message = `Missing template value for "{{${error.token}}}" in ${filePath}`;
        const wrapped = new Error(message);
        (wrapped as any).cause = error;
        throw wrapped;
      }
      throw error;
    }
    if (replaced === raw) return;
    await fs.writeFile(filePath, replaced, "utf8");
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") {
      throw err;
    }
  }
}

export async function renderTemplateTree(
  rootDir: string,
  replacements: Record<string, string>,
  options?: { skipDirs?: Set<string> }
) {
  const skipDirs = new Set([
    ...DEFAULT_SKIP_DIRS,
    ...(options?.skipDirs ?? []),
  ]);
  await renderRecursive(rootDir, replacements, skipDirs);
}

async function renderRecursive(
  currentDir: string,
  replacements: Record<string, string>,
  skipDirs: Set<string>
) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) {
          return;
        }
        await renderRecursive(fullPath, replacements, skipDirs);
      } else if (entry.isFile()) {
        await renderTemplateFile(fullPath, replacements);
      }
    })
  );
}
