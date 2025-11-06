type RenderOptions = {
  context: Record<string, string | undefined>;
  onMissing?: (token: string) => string;
};

class MissingTemplateValueError extends Error {
  token: string;

  constructor(token: string) {
    super(`Missing template value for token "${token}"`);
    this.name = "MissingTemplateValueError";
    this.token = token;
  }
}

const TOKEN_PATTERN = /{{\s*([A-Z0-9_]+)\s*}}/g;

export function renderTemplate(
  template: string,
  options: RenderOptions
): string {
  const { context, onMissing } = options;

  return template.replace(TOKEN_PATTERN, (match, rawToken: string) => {
    const token = String(rawToken).trim();
    if (Object.prototype.hasOwnProperty.call(context, token)) {
      const value = context[token];
      return value ?? "";
    }
    if (onMissing) {
      return onMissing(token);
    }
    throw new MissingTemplateValueError(token);
  });
}

export { MissingTemplateValueError };
