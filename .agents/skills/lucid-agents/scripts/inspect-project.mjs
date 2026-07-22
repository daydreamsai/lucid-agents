#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const adaptersByPackage = new Map([
  ['@lucid-agents/express', 'express'],
  ['@lucid-agents/hono', 'hono'],
  ['@lucid-agents/tanstack', 'tanstack'],
]);
const nonExtensions = new Set([
  '@lucid-agents/api-sdk',
  '@lucid-agents/cli',
  '@lucid-agents/core',
  '@lucid-agents/deploy',
  '@lucid-agents/express',
  '@lucid-agents/hono',
  '@lucid-agents/tanstack',
  '@lucid-agents/types',
]);

function source(version) {
  if (version.startsWith('workspace:')) return 'workspace';
  if (version.startsWith('link:')) return 'link';
  if (version.startsWith('file:')) return 'file';
  if (/^(?:\^|~|>=?|<=?|=)?\d/u.test(version)) return 'registry';
  return 'other';
}

export async function inspectProject(inputRoot = '.') {
  const projectRoot = resolve(inputRoot);
  const packageJson = JSON.parse(
    await readFile(join(projectRoot, 'package.json'), 'utf8')
  );
  const dependencyGroups = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  const dependencies = Object.assign(
    {},
    ...dependencyGroups.map(key => packageJson[key] ?? {})
  );
  const packages = Object.entries(dependencies)
    .filter(
      ([name, version]) =>
        name.startsWith('@lucid-agents/') && typeof version === 'string'
    )
    .map(([name, version]) => ({ name, source: source(version), version }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasRegistry = packages.some(item => item.source === 'registry');
  const hasLocal = packages.some(item =>
    ['workspace', 'link', 'file'].includes(item.source)
  );
  const hasAmbiguous = packages.some(item => item.source === 'other');
  const channel =
    packages.length === 0
      ? 'unknown'
      : hasAmbiguous
        ? 'unknown'
        : hasRegistry && hasLocal
          ? 'mixed'
          : hasLocal
            ? 'next'
            : hasRegistry
              ? 'stable'
              : 'unknown';
  const blockingWarnings = hasAmbiguous
    ? [
        'Lucid dependencies include unsupported or ambiguous sources. Pin registry versions or use one local/workspace channel before editing.',
      ]
    : channel === 'mixed'
      ? [
          'Lucid dependencies mix local/workspace and registry sources. Select one release channel before editing.',
        ]
      : [];
  const adapters = packages
    .map(item => adaptersByPackage.get(item.name))
    .filter(Boolean)
    .sort();
  const extensions = packages
    .filter(item => !nonExtensions.has(item.name))
    .map(item => item.name.slice('@lucid-agents/'.length))
    .sort();
  let serviceUiConfig = null;
  for (const name of ['service-ui.config.ts', 'service-ui.config.js']) {
    try {
      const candidate = join(projectRoot, name);
      if ((await lstat(candidate)).isFile()) serviceUiConfig = candidate;
    } catch {
      /* optional */
    }
  }
  return {
    projectRoot,
    channel,
    packages,
    adapters,
    extensions,
    serviceUiConfig,
    blockingWarnings,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(await inspectProject(process.argv[2] ?? '.'), null, 2)
    );
  } catch (error) {
    console.error(
      `Unable to inspect Lucid project: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
