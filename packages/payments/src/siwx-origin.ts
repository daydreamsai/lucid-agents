const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validate and normalize the browser-visible origin used by SIWX.
 *
 * The origin is configuration, never request metadata. This prevents reverse
 * proxy headers and internal service URLs from changing the signed authority.
 */
export function normalizeSIWxPublicOrigin(origin: string | undefined): string {
  const configured = origin?.trim();
  if (!configured) {
    throw new Error(
      'SIWX public origin is required when SIWX is enabled. Set siwx.origin, SIWX_PUBLIC_ORIGIN, or PAYMENTS_PUBLIC_ORIGIN.'
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(
      `Invalid SIWX public origin: "${configured}" is not a URL.`
    );
  }

  if (url.username || url.password) {
    throw new Error(
      `Invalid SIWX public origin: "${configured}" must not include credentials.`
    );
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `Invalid SIWX public origin: "${configured}" must not include a path, query, or fragment.`
    );
  }

  const isLoopback = LOOPBACK_HOSTNAMES.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error(
      `Invalid SIWX public origin: "${configured}" must use HTTPS (HTTP is allowed only for explicit localhost development origins).`
    );
  }

  return url.origin;
}

/** Rebase an internal request path onto the configured SIWX public origin. */
export function resolveSIWxResourceUri(
  origin: string,
  requestUrl: string
): string {
  const request = new URL(requestUrl);
  const resource = new URL(origin);
  resource.pathname = request.pathname;
  resource.search = request.search;
  return resource.toString();
}
