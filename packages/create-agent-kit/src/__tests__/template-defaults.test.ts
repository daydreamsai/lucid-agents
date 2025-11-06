import { describe, expect, it } from "bun:test";
import {
  GLOBAL_TEMPLATE_DEFAULTS,
  normalizeTemplateDefaults,
  resolveTemplateDefaults,
  TemplateDefaults,
} from "../template/defaults.js";

describe("normalizeTemplateDefaults", () => {
  it("converts non-string values to strings", () => {
    const result = normalizeTemplateDefaults({
      NUMBER: 42,
      BOOL: true,
      NULLISH: null,
    });
    expect(result).toEqual({
      NUMBER: "42",
      BOOL: "true",
    } satisfies TemplateDefaults);
  });

  it("returns empty object when input undefined", () => {
    expect(normalizeTemplateDefaults(undefined)).toEqual({});
  });
});

describe("resolveTemplateDefaults", () => {
  it("includes global defaults when no overrides provided", () => {
    expect(resolveTemplateDefaults(undefined)).toEqual(
      GLOBAL_TEMPLATE_DEFAULTS
    );
  });

  it("overrides global defaults with template values", () => {
    const result = resolveTemplateDefaults({
      AGENT_DESCRIPTION: "Custom",
      EXTRA: "value",
    });
    expect(result.AGENT_DESCRIPTION).toBe("Custom");
    expect(result.EXTRA).toBe("value");
    expect(result.ENTRYPOINT_KEY).toBe(GLOBAL_TEMPLATE_DEFAULTS.ENTRYPOINT_KEY);
  });
});
