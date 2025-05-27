/* eslint-disable local-rules/disallow-side-effects */
/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { ISyncStore } from './configuration-store/configurationStore'
import type { IConfigurationWire, IPrecomputedConfigurationResponse } from './configuration-wire/configurationWireTypes'
import { precomputedFlagsStorageFactory } from './configurationFactory'
import type { FlagEvaluationWithoutDetails, PrecomputedFlag, Subject } from './interfaces'
import { VariationType } from './interfaces'

// Instantiate the precomputed flags and bandits stores with memory-only implementation.
const memoryOnlyPrecomputedFlagsStore = precomputedFlagsStorageFactory()

/**
 * Configuration parameters for initializing the precomputed client.
 *
 * This interface is used for cases where precomputed assignments are available
 * from an external process that can bootstrap the SDK client.
 *
 * @param precomputedConfiguration - The configuration as a string to bootstrap the client.
 * @public
 */
export interface IPrecomputedClientConfigSync {
  precomputedConfiguration: string
  throwOnFailedInitialization?: boolean
}

export class PrecomputeClient {
  public static instance = new PrecomputeClient({
    subject: {
      key: '',
      attributes: {
        numericAttributes: {},
        categoricalAttributes: {},
      },
    },
    precomputedFlagStore: memoryOnlyPrecomputedFlagsStore,
  })

  public static initialized = false

  private subject: Subject
  private precomputedFlagStore: ISyncStore<PrecomputedFlag>

  public constructor({
    subject,
    precomputedFlagStore,
  }: {
    subject: Subject
    precomputedFlagStore: ISyncStore<PrecomputedFlag>
  }) {
    this.subject = subject
    this.precomputedFlagStore = precomputedFlagStore
  }

  public getStringAssignment(flagKey: string, defaultValue: string): string {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.STRING)
  }

  public getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.BOOLEAN)
  }

  public getIntegerAssignment(flagKey: string, defaultValue: number): number {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.INTEGER)
  }

  public getNumericAssignment(flagKey: string, defaultValue: number): number {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.NUMERIC)
  }

  public getJSONAssignment(flagKey: string, defaultValue: object): object {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.JSON, (value) => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          return typeof parsed === 'object' && parsed !== null ? parsed : defaultValue
        } catch {
          return defaultValue
        }
      }
      return typeof value === 'object' && value !== null ? value : defaultValue
    })
  }

  private getPrecomputedAssignment<T>(
    flagKey: string,
    defaultValue: T,
    _expectedType: VariationType,
    valueTransformer: (value: unknown) => T = (v) => v as T
  ): T {
    // validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank')

    const precomputedFlag = this.getPrecomputedFlag(flagKey)

    if (precomputedFlag === null) {
      return defaultValue
    }

    const result: FlagEvaluationWithoutDetails = {
      flagKey,
      format: 'PRECOMPUTED',
      subjectKey: this.subject.key ?? '',
      subjectAttributes: {
        ...this.subject.attributes?.numericAttributes,
        ...this.subject.attributes?.categoricalAttributes,
      },
      variation: {
        key: precomputedFlag.variationKey ?? '',
        value: precomputedFlag.variationValue,
      },
      allocationKey: precomputedFlag.allocationKey ?? '',
      extraLogging: precomputedFlag.extraLogging ?? {},
      doLog: precomputedFlag.doLog,
      entityId: null,
    }

    try {
      const transformedValue =
        result.variation?.value !== undefined ? valueTransformer(result.variation.value) : defaultValue
      // TODO: add logging or open feature hook
      // if (result?.doLog) {
      //   this.logAssignment(result)
      // }
      return transformedValue
    } catch {
      return defaultValue
    }
  }

  private getPrecomputedFlag(flagKey: string): PrecomputedFlag | null {
    return this.precomputedFlagStore.get(flagKey) ?? null
  }
}

/**
 * Initializes the precomputed client with configuration parameters.
 *
 * The purpose is for use-cases where the precomputed assignments are available from an external process
 * that can bootstrap the SDK.
 *
 * This method should be called once on application startup.
 *
 * @param config - precomputed client configuration
 * @returns a singleton precomputed client instance
 * @public
 */
export function offlinePrecomputedInit(config: IPrecomputedClientConfigSync): PrecomputeClient | null {
  let configurationWire: IConfigurationWire
  try {
    configurationWire = JSON.parse(config.precomputedConfiguration)
    if (!configurationWire.precomputed) {
      throw new Error('Invalid precomputed configuration wire: missing precomputed field')
    }
  } catch {
    if (config.throwOnFailedInitialization) {
      throw new Error('Invalid precomputed configuration wire')
    }
    return null
  }

  const { subjectKey, subjectAttributes, response } = configurationWire.precomputed
  const parsedResponse: IPrecomputedConfigurationResponse = JSON.parse(response)

  // populate the caches
  const memoryOnlyPrecomputedStore = precomputedFlagsStorageFactory()
  memoryOnlyPrecomputedStore.setEntries(parsedResponse.flags)

  const subject: Subject = {
    key: subjectKey,
    attributes: subjectAttributes ?? {
      numericAttributes: {},
      categoricalAttributes: {},
    },
  }

  PrecomputeClient.instance = new PrecomputeClient({
    subject,
    precomputedFlagStore: memoryOnlyPrecomputedStore,
  })
  PrecomputeClient.initialized = true
  return PrecomputeClient.instance
}
