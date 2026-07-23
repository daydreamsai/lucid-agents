/** One normalized client payment preference from `Accept-Payment`. */
export type MppPaymentPreference = {
  method: string | '*';
  intent: string | '*';
  q: number;
  index: number;
};

type NegotiableOffer = {
  method: string;
  intent: string;
};

type PreferenceMatch = MppPaymentPreference & {
  specificity: number;
};

function assertToken(value: string, label: string): void {
  if (value !== '*' && !/^[a-z0-9-]+$/.test(value)) {
    throw new Error(`Invalid Accept-Payment ${label}: ${value}`);
  }
}

function parseQuality(value: string, entry: string): number {
  if (!/^0(?:\.\d{0,3})?$|^1(?:\.0{0,3})?$/.test(value)) {
    throw new Error(
      `Invalid q-value for Accept-Payment entry "${entry}". Expected an HTTP qvalue.`
    );
  }
  return Number(value);
}

function parseEntry(value: string, index: number): MppPaymentPreference {
  const match =
    /^(?<method>[^/;\s]+|\*)\s*\/\s*(?<intent>[^/;\s]+|\*)(?<params>(?:\s*;\s*.+)?)$/u.exec(
      value
    );
  const method = match?.groups?.method;
  const intent = match?.groups?.intent;
  if (!method || !intent) {
    throw new Error(`Invalid Accept-Payment entry: ${value}`);
  }
  assertToken(method, 'method');
  assertToken(intent, 'intent');

  let q = 1;
  const parameters = match.groups?.params?.split(/\s*;\s*/).filter(Boolean);
  for (const parameter of parameters ?? []) {
    const parameterMatch =
      /^(?<name>[A-Za-z0-9_-]+)\s*=\s*(?<value>\S+)$/u.exec(parameter);
    const name = parameterMatch?.groups?.name;
    const rawValue = parameterMatch?.groups?.value;
    if (!name || !rawValue) {
      throw new Error(`Invalid Accept-Payment parameter: ${parameter}`);
    }
    if (name === 'q') q = parseQuality(rawValue, value);
  }

  return { method, intent, q, index };
}

/** Parse a Payment-Auth `Accept-Payment` header. */
export function parseAcceptPayment(header: string): MppPaymentPreference[] {
  const parts = header
    .split(/\s*,\s*/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Accept-Payment header is empty.');
  }
  return parts.map(parseEntry);
}

function bestMatch(
  offer: NegotiableOffer,
  preferences: readonly MppPaymentPreference[]
): PreferenceMatch | undefined {
  let best: PreferenceMatch | undefined;
  for (const preference of preferences) {
    if (
      (preference.method !== '*' && preference.method !== offer.method) ||
      (preference.intent !== '*' && preference.intent !== offer.intent)
    ) {
      continue;
    }
    const candidate = {
      ...preference,
      specificity:
        Number(preference.method !== '*') + Number(preference.intent !== '*'),
    };
    if (
      !best ||
      candidate.specificity > best.specificity ||
      (candidate.specificity === best.specificity && candidate.q > best.q) ||
      (candidate.specificity === best.specificity &&
        candidate.q === best.q &&
        candidate.index < best.index)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Filter and order server offers using Payment-Auth content negotiation.
 *
 * Absent or malformed headers preserve server order. A valid header with no
 * compatible entry also falls back to all server offers, matching the
 * protocol's deterministic "ignore the preference" behavior. Compatible
 * entries with q=0 remain explicit opt-outs.
 */
export function negotiateMppOffers<const T extends NegotiableOffer>(
  offers: readonly T[],
  acceptPayment: string | null | undefined
): T[] {
  if (!acceptPayment) return [...offers];

  let preferences: MppPaymentPreference[];
  try {
    preferences = parseAcceptPayment(acceptPayment);
  } catch {
    return [...offers];
  }

  const matches = offers.map((offer, index) => ({
    offer,
    index,
    match: bestMatch(offer, preferences),
  }));
  const hasCompatiblePreference = matches.some(
    value => value.match !== undefined
  );
  const ranked = matches
    .map(value =>
      value.match && value.match.q > 0
        ? { ...value, match: value.match }
        : undefined
    )
    .filter(
      (
        value
      ): value is {
        offer: T;
        index: number;
        match: PreferenceMatch;
      } => value !== undefined
    )
    .sort(
      (left, right) => right.match.q - left.match.q || left.index - right.index
    )
    .map(value => value.offer);

  return hasCompatiblePreference ? ranked : [...offers];
}
