import { describe, expect, it } from "bun:test";
import {
  MissingTemplateValueError,
  renderTemplate,
} from "../template/render.js";

describe("renderTemplate", () => {
  it("replaces tokens with provided values", () => {
    const output = renderTemplate("Hello {{NAME}}!", {
      context: { NAME: "Agent" },
    });
    expect(output).toBe("Hello Agent!");
  });

  it("uses empty string for undefined values", () => {
    const output = renderTemplate("{{GREETING}}, world!", {
      context: { GREETING: undefined },
    });
    expect(output).toBe(", world!");
  });

  it("throws when token missing and no onMissing handler", () => {
    expect(() =>
      renderTemplate("Value: {{UNKNOWN}}", { context: {} })
    ).toThrowError(MissingTemplateValueError);
  });

  it("delegates to onMissing handler when provided", () => {
    const output = renderTemplate("{{FOO}} {{BAR}}", {
      context: { FOO: "hi" },
      onMissing: (token) => `[${token}]`,
    });
    expect(output).toBe("hi [BAR]");
  });
});
