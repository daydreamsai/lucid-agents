export type MacroEventType =
  | 'CPI'
  | 'FED_RATE'
  | 'PMI'
  | 'UNEMPLOYMENT'
  | 'OIL_SUPPLY'
  | 'GEOPOLITICAL_RISK';

export type Geography = 'US' | 'EU' | 'APAC' | 'GLOBAL';
export type Horizon = '1w' | '1m' | '3m' | '6m' | '12m';
export type Sector = 'EQUITIES' | 'BONDS' | 'ENERGY' | 'TECH' | 'INDUSTRIALS';

export type ScenarioAssumptions = {
  inflationShock?: number;
  oilShock?: number;
  policySurprise?: number;
  demandShock?: number;
};

export type MacroInput = {
  eventTypes: MacroEventType[];
  geography: Geography;
  sectorSet: Sector[];
  horizon: Horizon;
};

export type EventQuery = {
  eventTypes: string[];
  geography: string;
  horizon: string;
  sectorSet?: string[];
};

export type ImpactVectorQuery = {
  eventTypes: string[];
  geography: string;
  sectorSet: string[];
  horizon: string;
};

export type ScenarioScoreRequest = {
  eventTypes: string[];
  geography: string;
  sectorSet: string[];
  horizon: string;
  scenarioAssumptions: ScenarioAssumptions;
};

export type Freshness = {
  as_of: string;
  age_ms: number;
  max_age_ms: number;
  is_stale: boolean;
};

export type Confidence = {
  score: number;
  band: 'low' | 'medium' | 'high';
  method: string;
};

export class ValidationError extends Error {
  constructor(
    message: string,
    public issues: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateNumberInRange(
  value: unknown,
  min: number,
  max: number,
  path: string,
  issues: Array<{ path: string; message: string }>
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    issues.push({ path, message: 'Expected number' });
    return undefined;
  }
  if (value < min || value > max) {
    issues.push({ path, message: `Expected number between ${min} and ${max}` });
    return undefined;
  }
  return value;
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>
): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Expected array' });
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== 'string') {
      issues.push({ path: `${path}[${i}]`, message: 'Expected string' });
      continue;
    }
    out.push(item);
  }
  return out;
}

function validateEventTypesRaw(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>
): string[] {
  const items = validateStringArray(value, path, issues);
  if (items.length === 0) {
    issues.push({ path, message: 'At least one event type is required' });
    return [];
  }
  return items;
}

function validateSectorsRaw(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>,
  required: boolean
): string[] | undefined {
  if (!required && value === undefined) return undefined;
  const items = validateStringArray(value, path, issues);
  if (required && items.length === 0) {
    issues.push({ path, message: 'At least one sector is required' });
    return [];
  }
  return items;
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({ path, message: 'Expected non-empty string' });
    return '';
  }
  return value;
}

export function parseEventQuery(input: unknown): EventQuery {
  if (!isRecord(input)) {
    throw new ValidationError('Request failed schema validation', [
      { path: 'query', message: 'Expected object' },
    ]);
  }

  const issues: Array<{ path: string; message: string }> = [];
  const parsed: EventQuery = {
    eventTypes: validateEventTypesRaw(input.eventTypes, 'eventTypes', issues),
    geography: validateNonEmptyString(input.geography, 'geography', issues),
    horizon: validateNonEmptyString(input.horizon, 'horizon', issues),
    sectorSet: validateSectorsRaw(input.sectorSet, 'sectorSet', issues, false),
  };

  if (issues.length > 0) {
    throw new ValidationError('Request failed schema validation', issues);
  }

  return parsed;
}

export function parseImpactVectorQuery(input: unknown): ImpactVectorQuery {
  if (!isRecord(input)) {
    throw new ValidationError('Request failed schema validation', [
      { path: 'query', message: 'Expected object' },
    ]);
  }

  const issues: Array<{ path: string; message: string }> = [];
  const sectors = validateSectorsRaw(input.sectorSet, 'sectorSet', issues, true);

  const parsed: ImpactVectorQuery = {
    eventTypes: validateEventTypesRaw(input.eventTypes, 'eventTypes', issues),
    geography: validateNonEmptyString(input.geography, 'geography', issues),
    sectorSet: sectors ?? [],
    horizon: validateNonEmptyString(input.horizon, 'horizon', issues),
  };

  if (issues.length > 0) {
    throw new ValidationError('Request failed schema validation', issues);
  }

  return parsed;
}

export function parseScenarioScoreRequest(input: unknown): ScenarioScoreRequest {
  if (!isRecord(input)) {
    throw new ValidationError('Request failed schema validation', [
      { path: 'body', message: 'Expected object' },
    ]);
  }

  const issues: Array<{ path: string; message: string }> = [];

  const assumptionsRaw = input.scenarioAssumptions;
  if (!isRecord(assumptionsRaw)) {
    issues.push({ path: 'scenarioAssumptions', message: 'Expected object' });
  }

  const assumptions: ScenarioAssumptions = {
    inflationShock: validateNumberInRange(
      (assumptionsRaw as Record<string, unknown>)?.inflationShock,
      0,
      1,
      'scenarioAssumptions.inflationShock',
      issues
    ),
    oilShock: validateNumberInRange(
      (assumptionsRaw as Record<string, unknown>)?.oilShock,
      0,
      1,
      'scenarioAssumptions.oilShock',
      issues
    ),
    policySurprise: validateNumberInRange(
      (assumptionsRaw as Record<string, unknown>)?.policySurprise,
      0,
      1,
      'scenarioAssumptions.policySurprise',
      issues
    ),
    demandShock: validateNumberInRange(
      (assumptionsRaw as Record<string, unknown>)?.demandShock,
      0,
      1,
      'scenarioAssumptions.demandShock',
      issues
    ),
  };

  const sectors = validateSectorsRaw(input.sectorSet, 'sectorSet', issues, true);

  const parsed: ScenarioScoreRequest = {
    eventTypes: validateEventTypesRaw(input.eventTypes, 'eventTypes', issues),
    geography: validateNonEmptyString(input.geography, 'geography', issues),
    sectorSet: sectors ?? [],
    horizon: validateNonEmptyString(input.horizon, 'horizon', issues),
    scenarioAssumptions: assumptions,
  };

  if (issues.length > 0) {
    throw new ValidationError('Request failed schema validation', issues);
  }

  return parsed;
}

export function parseErrorEnvelope(input: unknown): void {
  if (!isRecord(input) || !isRecord(input.error)) {
    throw new ValidationError('Invalid error envelope', [
      { path: 'error', message: 'Expected error object' },
    ]);
  }

  if (typeof input.error.code !== 'string' || typeof input.error.message !== 'string') {
    throw new ValidationError('Invalid error envelope', [
      { path: 'error.code', message: 'Expected string code and message' },
    ]);
  }
}
