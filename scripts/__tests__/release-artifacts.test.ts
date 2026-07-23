import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  assertExactPublicArtifactSet,
  assertNoUnresolvedDependencyProtocols,
  assertPackedManifestTargets,
  discoverWorkspacePackages,
  parseNpmPackDryRun,
} from '../release-artifacts';
import type {
  PackedArtifact,
  ValidPackageManifest,
  WorkspacePackage,
} from '../release-artifacts';

const temporaryRoots: string[] = [];

function temporaryRepo(): string {
  const repo = mkdtempSync(path.join(tmpdir(), 'lucid-release-artifacts-'));
  temporaryRoots.push(repo);
  mkdirSync(path.join(repo, 'packages'), { recursive: true });
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ workspaces: { packages: ['packages/*'] } })
  );
  return repo;
}

function writeWorkspace(
  repo: string,
  directory: string,
  manifest?: Record<string, unknown> | string
): void {
  const workspace = path.join(repo, 'packages', directory);
  mkdirSync(workspace, { recursive: true });
  if (manifest !== undefined) {
    writeFileSync(
      path.join(workspace, 'package.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    );
  }
}

function workspace(
  name: string,
  version: string,
  isPrivate = false
): WorkspacePackage {
  const manifest: ValidPackageManifest = {
    name,
    version,
    private: isPrivate,
  };
  return {
    dir: `/repo/${name}`,
    manifestPath: `/repo/${name}/package.json`,
    manifest,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('discoverWorkspacePackages', () => {
  test('derives the exact workspace set from root package.json', () => {
    const repo = temporaryRepo();
    writeWorkspace(repo, 'one', {
      name: '@test/one',
      version: '1.0.0',
    });
    writeWorkspace(repo, 'two', {
      name: '@test/two',
      version: '2.0.0',
      private: true,
    });

    expect(
      discoverWorkspacePackages(repo).map(item => item.manifest.name)
    ).toEqual(['@test/one', '@test/two']);
  });

  test.each([
    {
      label: 'malformed',
      manifest: '{',
      message: 'Invalid JSON in workspace manifest',
    },
    {
      label: 'missing name',
      manifest: { version: '1.0.0' },
      message: 'is missing a name',
    },
    {
      label: 'missing version',
      manifest: { name: '@test/missing-version' },
      message: 'is missing a version',
    },
    {
      label: 'missing manifest',
      manifest: undefined,
      message: 'is missing its package.json manifest',
    },
  ])('fails closed for a $label workspace', ({ manifest, message }) => {
    const repo = temporaryRepo();
    writeWorkspace(repo, 'invalid', manifest);

    expect(() => discoverWorkspacePackages(repo)).toThrow(message);
  });

  test('rejects duplicate package names', () => {
    const repo = temporaryRepo();
    writeWorkspace(repo, 'one', {
      name: '@test/duplicate',
      version: '1.0.0',
    });
    writeWorkspace(repo, 'two', {
      name: '@test/duplicate',
      version: '2.0.0',
    });

    expect(() => discoverWorkspacePackages(repo)).toThrow(
      'Duplicate workspace package name "@test/duplicate"'
    );
  });
});

describe('packed artifact validation', () => {
  const completeManifest = {
    name: '@test/package',
    version: '1.2.3',
    main: './dist/index.js',
    module: './dist/index.mjs',
    types: './dist/index.d.ts',
    typings: './dist/legacy.d.ts',
    bin: { test: './dist/cli.js' },
    exports: {
      '.': {
        import: './dist/index.mjs',
        default: './dist/index.js',
        types: './dist/index.d.ts',
      },
      './feature': './dist/feature.js',
      './package.json': './package.json',
    },
  } satisfies ValidPackageManifest;
  const completeFiles = new Set([
    'dist/index.js',
    'dist/index.mjs',
    'dist/index.d.ts',
    'dist/legacy.d.ts',
    'dist/cli.js',
    'dist/feature.js',
    'package.json',
  ]);

  test('parses npm pack JSON and validates all public manifest targets', () => {
    const artifact = parseNpmPackDryRun(
      JSON.stringify([
        {
          name: '@test/package',
          version: '1.2.3',
          files: [...completeFiles].map(file => ({ path: file })),
        },
      ]),
      '@test/package'
    );

    expect(artifact.name).toBe('@test/package');
    expect(() =>
      assertPackedManifestTargets(completeManifest, artifact.files)
    ).not.toThrow();
  });

  test.each([
    ['main', 'dist/index.js'],
    ['types', 'dist/index.d.ts'],
    ['exports', 'dist/feature.js'],
    ['bin.test', 'dist/cli.js'],
  ])('rejects a missing %s target', (field, missingFile) => {
    const files = new Set(completeFiles);
    files.delete(missingFile);

    expect(() => assertPackedManifestTargets(completeManifest, files)).toThrow(
      `missing ${field} target`
    );
  });

  test('requires exactly one artifact for every public workspace', () => {
    const packages = [
      workspace('@test/one', '1.0.0'),
      workspace('@test/two', '2.0.0'),
      workspace('@test/private', '3.0.0', true),
    ];
    const artifacts: PackedArtifact[] = [
      {
        name: '@test/one',
        version: '1.0.0',
        files: new Set(),
      },
    ];

    expect(() => assertExactPublicArtifactSet(packages, artifacts)).toThrow(
      'missing: @test/two'
    );
  });

  test('rejects unresolved workspace and catalog dependency ranges', () => {
    expect(() =>
      assertNoUnresolvedDependencyProtocols({
        name: '@test/package',
        dependencies: { '@test/internal': 'workspace:*' },
      })
    ).toThrow('still has unresolved dependencies.@test/internal');

    expect(() =>
      assertNoUnresolvedDependencyProtocols({
        name: '@test/package',
        peerDependencies: { zod: 'catalog:' },
      })
    ).toThrow('still has unresolved peerDependencies.zod');
  });
});
