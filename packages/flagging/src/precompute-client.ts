import { precomputedFlagsStorageFactory } from './configuration-factory'
import { IConfigurationStore } from './configuration-store/configuration-store'
import { IConfigurationWire, IPrecomputedConfigurationResponse } from './configuration-wire/configuration-wire-types'
import { FlagEvaluationWithoutDetails, PrecomputedFlag, Subject, VariationType } from './interfaces'

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
  private precomputedFlagStore: IConfigurationStore<PrecomputedFlag>

  public constructor({
    subject,
    precomputedFlagStore,
  }: {
    subject: Subject
    precomputedFlagStore: IConfigurationStore<PrecomputedFlag>
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
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.JSON, (value) =>
      typeof value === 'string' ? JSON.parse(value) : defaultValue
    )
  }

  private getPrecomputedAssignment<T>(
    flagKey: string,
    defaultValue: T,
    expectedType: VariationType,
    valueTransformer: (value: unknown) => T = (v) => v as T
  ): T {
    //validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank')

    const precomputedFlag = this.getPrecomputedFlag(flagKey)

    if (precomputedFlag == null) {
      console.warn(`No assigned variation. Flag not found: ${flagKey}`)
      return defaultValue
    }

    // Add type checking before proceeding
    // if (!checkTypeMatch(expectedType, precomputedFlag.variationType)) {
    //   const errorMessage = `${loggerPrefix} Type mismatch: expected ${expectedType} but flag ${flagKey} has type ${precomputedFlag.variationType}`
    //   logger.error(errorMessage)
    //   return defaultValue
    // }

    const result: FlagEvaluationWithoutDetails = {
      flagKey,
      format: this.precomputedFlagStore.getFormat() ?? '',
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

    // try {
    //   if (result?.doLog) {
    //     this.logAssignment(result)
    //   }
    // } catch (error) {
    //   logger.error(`${loggerPrefix} Error logging assignment event: ${error}`)
    // }

    try {
      return result.variation?.value !== undefined ? valueTransformer(result.variation.value) : defaultValue
    } catch (error) {
      console.error(`Error transforming value: ${error}`)
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
export function offlinePrecomputedInit(config: IPrecomputedClientConfigSync): PrecomputeClient {
  let configurationWire: IConfigurationWire
  try {
    configurationWire = JSON.parse(config.precomputedConfiguration)
    if (!configurationWire.precomputed) throw new Error()
  } catch (error) {
    const errorMessage = 'Invalid precomputed configuration wire'
    if (config.throwOnFailedInitialization) {
      throw new Error(errorMessage)
    }

    return PrecomputeClient.instance
  }

  const { subjectKey, subjectAttributes, response } = configurationWire.precomputed
  const parsedResponse: IPrecomputedConfigurationResponse = JSON.parse(response)

  // populate the caches
  const memoryOnlyPrecomputedStore = precomputedFlagsStorageFactory()
  memoryOnlyPrecomputedStore
    .setEntries(parsedResponse.flags)
    .catch((err: any) => console.warn('Error setting precomputed assignments for memory-only store', err))

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
