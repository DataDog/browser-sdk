import type { ContextAttributes, Environment, FlagKey, PrecomputedFlag } from '../interfaces'
import { FormatEnum } from '../interfaces'

// Base interface for all configuration responses
interface IBasePrecomputedConfigurationResponse {
  readonly format: FormatEnum.PRECOMPUTED
  readonly obfuscated: boolean
  readonly createdAt: string
  readonly environment?: Environment
  readonly subjectKey: string
  readonly subjectAttributes?: ContextAttributes
}

export interface IPrecomputedConfigurationResponse extends IBasePrecomputedConfigurationResponse {
  readonly obfuscated: false // Always false
  readonly flags: Record<FlagKey, PrecomputedFlag>
}

export interface IPrecomputedConfiguration {
  // JSON encoded configuration response (obfuscated or unobfuscated)
  readonly response: string
  readonly subjectKey: string
  readonly subjectAttributes?: ContextAttributes
}

export function createPrecomputedConfiguration(
  response: string,
  subjectKey: string,
  subjectAttributes?: ContextAttributes
): IPrecomputedConfiguration {
  return {
    response,
    subjectKey,
    subjectAttributes,
  }
}

export function createUnobfuscatedPrecomputedConfiguration(
  subjectKey: string,
  flags: Record<FlagKey, PrecomputedFlag>,
  subjectAttributes?: ContextAttributes,
  environment?: Environment
): IPrecomputedConfiguration {
  const response = createPrecomputedConfigurationResponse(subjectKey, flags, subjectAttributes, environment)
  return createPrecomputedConfiguration(JSON.stringify(response), subjectKey, subjectAttributes)
}

export function createPrecomputedConfigurationResponse(
  subjectKey: string,
  flags: Record<FlagKey, PrecomputedFlag>,
  subjectAttributes?: ContextAttributes,
  environment?: Environment
): IPrecomputedConfigurationResponse {
  return {
    format: FormatEnum.PRECOMPUTED,
    obfuscated: false,
    createdAt: new Date().toISOString(),
    subjectKey,
    subjectAttributes,
    environment,
    flags,
  }
}

// "Wire" in the name means "in-transit"/"file" format.
// In-memory representation may differ significantly and is up to SDKs.
export interface IConfigurationWire {
  /**
   * Version field should be incremented for breaking format changes.
   * For example, removing required fields or changing field type/meaning.
   */
  readonly version: number
  readonly precomputed?: IPrecomputedConfiguration
}

export function createConfigurationWireV1(precomputed?: IPrecomputedConfiguration): IConfigurationWire {
  return {
    version: 1,
    precomputed,
  }
}

export const configurationWireV1 = {
  fromString(str: string): IConfigurationWire {
    return JSON.parse(str) as IConfigurationWire
  },

  precomputed(precomputedConfig: IPrecomputedConfiguration): IConfigurationWire {
    return createConfigurationWireV1(precomputedConfig)
  },

  empty(): IConfigurationWire {
    return createConfigurationWireV1()
  },

  toString(config: IConfigurationWire): string {
    return JSON.stringify(config)
  },
}
