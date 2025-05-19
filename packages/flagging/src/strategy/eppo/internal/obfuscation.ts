import * as base64 from 'js-base64';
import * as SparkMD5 from 'spark-md5';

import { PrecomputedFlag } from './interfaces';
import { Attributes, AttributeType, Base64String, MD5String } from './types';

export function getMD5Hash(input: string, salt = ''): string {
  const spark = new SparkMD5.default();
  return spark.append(salt).append(input).end();
}

/**
 * Builds a storage key suffix from an API key.
 * @param apiKey - The API key to build the suffix from
 * @returns A string suffix for storage keys
 * @public
 */
export function buildStorageKeySuffix(apiKey: string): string {
  // Note that we hash the API key and use the first 16 characters of the digest.
  const hashed = getMD5Hash(apiKey);
  return hashed.slice(0, 16);
}

export function encodeBase64(input: string) {
  return base64.encode(input);
}
export function attributeEncodeBase64(input: AttributeType) {
  if (typeof input !== 'string') {
    return encodeBase64(String(input));
  }
  return encodeBase64(input);
}

export function decodeBase64(input: string) {
  return base64.decode(input);
}

export function obfuscatePrecomputedFlags(
  salt: string,
  precomputedFlags: Record<string, PrecomputedFlag>,
): Record<MD5String, PrecomputedFlag> {
  const response: Record<string, PrecomputedFlag> = {};

  Object.keys(precomputedFlags).forEach((flagKey) => {
    const assignment = precomputedFlags[flagKey];

    // Encode extraLogging keys and values.
    const encodedExtraLogging = Object.fromEntries(
      Object.entries(assignment.extraLogging ?? {}).map((kvArr) => kvArr.map(encodeBase64)),
    );

    const hashedKey = getMD5Hash(flagKey, salt);
    response[hashedKey] = {
      flagKey: hashedKey,
      variationType: assignment.variationType,
      extraLogging: encodedExtraLogging,
      doLog: assignment.doLog,
      allocationKey: encodeBase64(assignment.allocationKey ?? ''),
      variationKey: encodeBase64(assignment.variationKey ?? ''),
      variationValue: encodeBase64(assignment.variationValue),
    };
  });
  return response;
}
