export interface Environment {
  name: string
}
export const UNKNOWN_ENVIRONMENT_NAME = 'UNKNOWN'

export enum FormatEnum {
  PRECOMPUTED = 'PRECOMPUTED',
}

export type BasePrecomputedFlag = {
  flagKey?: string
  allocationKey?: string
  variationKey?: string
  variationType: VariationType
  extraLogging?: Record<string, string>
  doLog: boolean
}

type Base64 = string

export interface FlagEvaluationWithoutDetails {
  flagKey: string
  format: string
  subjectKey: string
  subjectAttributes: Attributes
  allocationKey: string | null
  variation: Variation | null
  extraLogging: Record<string, string>
  // whether to log assignment event
  doLog: boolean
  entityId: number | null
}

export interface PrecomputedFlag extends BasePrecomputedFlag {
  variationValue: Base64
}

export interface Subject {
  key: string
  attributes: ContextAttributes
}

export interface Variation {
  key: string
  value: string | number | boolean
}

export enum VariationType {
  STRING = 'STRING',
  INTEGER = 'INTEGER',
  NUMERIC = 'NUMERIC',
  BOOLEAN = 'BOOLEAN',
  JSON = 'JSON',
}

// types

export type FlagKey = string

export type ValueType = string | number | boolean | JSON
export type AttributeType = string | number | boolean
export type ConditionValueType = AttributeType | AttributeType[]
export type Attributes = Record<string, AttributeType>
export type ContextAttributes = {
  numericAttributes: Attributes
  categoricalAttributes: Attributes
}
