import { Variation } from "./interfaces";

export type ValueType = string | number | boolean | JSON;
export type AttributeType = string | number | boolean;
export type ConditionValueType = AttributeType | AttributeType[];
export type Attributes = Record<string, AttributeType>;
export type ContextAttributes = {
  numericAttributes: Attributes;
  categoricalAttributes: Attributes;
};
export type BanditSubjectAttributes = Attributes | ContextAttributes;
export type BanditActions =
  | string[]
  | Record<string, Attributes>
  | Record<string, ContextAttributes>;
export type Base64String = string;
export type MD5String = string;
export type FlagKey = string;
export type BanditKey = string;
export type HashedFlagKey = FlagKey;

export interface IAssignmentDetails<T extends Variation['value'] | object> {
  variation: T;
  action: string | null;
}

export interface FlagEvaluationWithoutDetails {
  flagKey: string;
  format: string;
  subjectKey: string;
  subjectAttributes: Attributes;
  allocationKey: string | null;
  variation: Variation | null;
  extraLogging: Record<string, string>;
  // whether to log assignment event
  doLog: boolean;
  entityId: number | null;
}