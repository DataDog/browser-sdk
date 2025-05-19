import {
  ObfuscatedVariation,
  VariationType,
  Variation,
  PrecomputedFlag,
  DecodedPrecomputedFlag,
} from './interfaces';
import { decodeBase64 } from './obfuscation';

export function decodeVariations(
  variations: Record<string, ObfuscatedVariation>,
  variationType: VariationType,
): Record<string, Variation> {
  return Object.fromEntries(
    Object.entries(variations).map(([, variation]) => {
      const decodedKey = decodeBase64(variation.key);
      return [decodedKey, { key: decodedKey, value: decodeValue(variation.value, variationType) }];
    }),
  );
}

export function decodeValue(encodedValue: string, type: VariationType): string | number | boolean {
  switch (type) {
    case VariationType.INTEGER:
    case VariationType.NUMERIC:
      return Number(decodeBase64(encodedValue));
    case VariationType.BOOLEAN:
      return decodeBase64(encodedValue) === 'true';
    default:
      return decodeBase64(encodedValue);
  }
}

export function decodeObject(obj: Record<string, string>): Record<string, string> {
  return decodeObjectTo(obj, (v: string) => v);
}
export function decodeObjectTo<T>(
  obj: Record<string, string>,
  transform: (v: string) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [decodeBase64(key), transform(decodeBase64(value))]),
  );
}

export function decodePrecomputedFlag(precomputedFlag: PrecomputedFlag): DecodedPrecomputedFlag {
  return {
    ...precomputedFlag,
    allocationKey: decodeBase64(precomputedFlag.allocationKey ?? ''),
    variationKey: decodeBase64(precomputedFlag.variationKey ?? ''),
    variationValue: decodeValue(precomputedFlag.variationValue, precomputedFlag.variationType),
    extraLogging: decodeObject(precomputedFlag.extraLogging ?? {}),
  };
}


export function checkTypeMatch(expectedType?: VariationType, actualType?: VariationType): boolean {
  return expectedType === undefined || actualType === expectedType;
}