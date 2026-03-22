type NpmFailureContext = {
  output: string;
  packageName?: string;
  scope: string;
};

export function getPackageScope(packageName: string): string | undefined {
  if (!packageName.startsWith("@")) return undefined;
  const slashIndex = packageName.indexOf("/");
  if (slashIndex <= 1) return undefined;
  return packageName.slice(0, slashIndex);
}

export function describeNpmAccessFailure({
  output,
  packageName,
  scope,
}: NpmFailureContext): string | undefined {
  if (/\bE401\b/i.test(output) || /Unable to authenticate/i.test(output)) {
    return [
      `NPM_TOKEN is missing or invalid.`,
      packageName
        ? `npm access preflight failed for ${packageName}.`
        : "npm access preflight failed.",
      "Use an npm automation token with publish access to this scope.",
    ].join(" ");
  }

  if (
    /\bE403\b/i.test(output) ||
    /\bE404\b/i.test(output) ||
    /collaborators/i.test(output)
  ) {
    return [
      `NPM_TOKEN authenticates, but it lacks collaborator or publish access for ${scope}.`,
      packageName
        ? `The preflight probe against ${packageName} was rejected by npm.`
        : "The publish access probe was rejected by npm.",
      `Use a token from an npm owner or package collaborator that can publish ${scope} packages.`,
    ].join(" ");
  }

  return undefined;
}

export function describeNpmPublishFailure({
  output,
  scope,
}: NpmFailureContext): string | undefined {
  if (
    /\bE401\b/i.test(output) ||
    /Unable to authenticate/i.test(output) ||
    /ENEEDAUTH/i.test(output)
  ) {
    return `npm rejected the publish because NPM_TOKEN is missing or invalid for ${scope}.`;
  }

  if (
    /\bE404\b/i.test(output) &&
    /Not Found - PUT https:\/\/registry\.npmjs\.org\//i.test(output)
  ) {
    return [
      `npm returned a PUT 404 while publishing ${scope} packages.`,
      `For scoped packages that already exist on npm, this is likely a permissions problem with NPM_TOKEN rather than missing package metadata.`,
      `Verify that the token belongs to an npm owner or collaborator with publish access to ${scope}.`,
    ].join(" ");
  }

  return undefined;
}

export function partitionPublishArgs(argv: string[]): {
  preflightOnly: boolean;
  passthroughArgs: string[];
} {
  const passthroughArgs: string[] = [];
  let preflightOnly = false;

  for (const arg of argv) {
    if (arg === "--preflight-only") {
      preflightOnly = true;
      continue;
    }
    passthroughArgs.push(arg);
  }

  return { preflightOnly, passthroughArgs };
}
