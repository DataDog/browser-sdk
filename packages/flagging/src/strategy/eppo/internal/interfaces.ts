import { ContextAttributes, FlagKey } from './types';

export enum VariationType {
  STRING = 'STRING',
  INTEGER = 'INTEGER',
  NUMERIC = 'NUMERIC',
  BOOLEAN = 'BOOLEAN',
  JSON = 'JSON',
}

export interface Variation {
  key: string;
  value: string | number | boolean;
}

export interface Environment {
  name: string;
}
export const UNKNOWN_ENVIRONMENT_NAME = 'UNKNOWN';

export interface ConfigDetails {
  configFetchedAt: string;
  configPublishedAt: string;
  configEnvironment: Environment;
  configFormat: string;
  salt?: string;
}

export interface ObfuscatedVariation {
  key: string;
  value: string;
}

export enum FormatEnum {
  PRECOMPUTED = 'PRECOMPUTED',
}

export type BasePrecomputedFlag = {
  flagKey?: string;
  allocationKey?: string;
  variationKey?: string;
  variationType: VariationType;
  extraLogging?: Record<string, string>;
  doLog: boolean;
};

type Base64 = string;

export interface PrecomputedFlag extends BasePrecomputedFlag {
  variationValue: Base64;
}

export interface DecodedPrecomputedFlag extends BasePrecomputedFlag {
  variationValue: Variation['value'];
}

export interface PrecomputedFlagsDetails {
  precomputedFlagsFetchedAt: string;
  precomputedFlagsPublishedAt: string;
  precomputedFlagsEnvironment: Environment;
}

export interface PrecomputedFlagsPayload {
  subject_key: string;
  subject_attributes: ContextAttributes;
  bandit_actions?: Record<FlagKey, Record<string, ContextAttributes>>;
}
