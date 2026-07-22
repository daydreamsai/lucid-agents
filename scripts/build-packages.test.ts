import { describe, expect, it } from 'bun:test';

import {
  collectPackages,
  orderPackagesForBuild,
  type PackageInfo,
} from './build-packages';

function pkg(
  name: string,
  dependencies: Record<string, string> = {}
): PackageInfo {
  return {
    name,
    dir: `/workspace/${name}`,
    manifest: { name, dependencies },
  };
}

describe('workspace package build ordering', () => {
  it('includes every package discovered from the workspace', () => {
    const packages = collectPackages();
    const ordered = orderPackagesForBuild(packages);
    const names = ordered.map(item => item.name);

    expect(ordered).toHaveLength(packages.length);
    expect(names).toContain('@lucid-agents/api-sdk');
    expect(names).toContain('@lucid-agents/catalog');
    expect(names).toContain('@lucid-agents/mpp');
    expect(
      packages.find(item => item.name === '@lucid-agents/api-sdk')?.manifest
        .scripts?.build
    ).toBeDefined();
  });

  it('builds shared types before the CLI in the real workspace graph', () => {
    const ordered = orderPackagesForBuild(collectPackages()).map(
      item => item.name
    );

    expect(ordered.indexOf('@lucid-agents/types')).toBeLessThan(
      ordered.indexOf('@lucid-agents/cli')
    );
  });

  it('places runtime dependencies before their consumers', () => {
    const ordered = orderPackagesForBuild([
      pkg('adapter', { core: 'workspace:*' }),
      pkg('types'),
      pkg('core', { types: 'workspace:*' }),
    ]).map(item => item.name);

    expect(ordered.indexOf('types')).toBeLessThan(ordered.indexOf('core'));
    expect(ordered.indexOf('core')).toBeLessThan(ordered.indexOf('adapter'));
  });

  it('rejects published dependency cycles', () => {
    expect(() =>
      orderPackagesForBuild([
        pkg('left', { right: 'workspace:*' }),
        pkg('right', { left: 'workspace:*' }),
      ])
    ).toThrow('Workspace dependency cycle');
  });
});
