import ApiEndpoints from './internal/api-endpoints';
import { IAssignmentEvent, IAssignmentLogger } from './assignment-logger';
import {
  ensureContextualSubjectAttributes,
  ensureNonContextualSubjectAttributes,
} from './internal/attributes';
import { AbstractAssignmentCache, AssignmentCache, AssignmentCacheEntry } from './internal/cache/abstract-assignment-cache';
import { NonExpiringInMemoryAssignmentCache } from './internal/cache/non-expiring-in-memory-cache-assignment';
import { IConfigurationStore, ISyncStore } from './internal/configuration-store/configuration-store';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_EVENT_QUEUE_SIZE,
  PRECOMPUTED_BASE_URL,
} from './internal/constants';
import { checkTypeMatch, decodePrecomputedFlag } from './internal/decoding';
import FetchHttpClient from './internal/http-client';
import {
  DecodedPrecomputedFlag,
  PrecomputedFlag,
  VariationType,
  Variation,
} from './internal/interfaces';
import { getMD5Hash } from './internal/obfuscation';
import PrecomputedRequestor from './internal/precomputed-requestor';
import SdkTokenDecoder from './internal/sdk-token-decoder';
import { Attributes, ContextAttributes, FlagEvaluationWithoutDetails, FlagKey } from './internal/types';
import { validateNotBlank } from './internal/validation';
import { IConfigurationWire } from './internal/configuration-wire/configuration-wire-types';
import { MemoryOnlyConfigurationStore } from './internal/configuration-store/memory.store';
import { IObfuscatedPrecomputedConfigurationResponse } from './internal/configuration-wire/configuration-wire-types';
import { precomputedFlagsStorageFactory } from './internal/configuration-factory';

export interface Subject {
  subjectKey: string;
  subjectAttributes: Attributes | ContextAttributes;
}

export type PrecomputedFlagsRequestParameters = {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  pollingIntervalMs?: number;
  numInitialRequestRetries?: number;
  numPollRequestRetries?: number;
  pollAfterSuccessfulInitialization?: boolean;
  pollAfterFailedInitialization?: boolean;
  throwOnFailedInitialization?: boolean;
  skipInitialPoll?: boolean;
};

export interface EppoPrecomputedClientOptions {
  precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
  subject: Subject;
  requestParameters?: PrecomputedFlagsRequestParameters;
}

export default class EppoPrecomputedClient {
  private readonly queuedAssignmentEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private assignmentCache?: AssignmentCache;
  private requestParameters?: PrecomputedFlagsRequestParameters;
  private subject: {
    subjectKey: string;
    subjectAttributes: ContextAttributes;
  };
  private precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
  public static initialized = false;

  public static instance = new EppoPrecomputedClient({
    precomputedFlagStore: new MemoryOnlyConfigurationStore(),
    subject: {
      subjectKey: '',
      subjectAttributes: {},
    },
  });

  public constructor(options: EppoPrecomputedClientOptions) {
    this.precomputedFlagStore = options.precomputedFlagStore;

    const { subjectKey, subjectAttributes } = options.subject;
    this.subject = {
      subjectKey,
      subjectAttributes: ensureContextualSubjectAttributes(subjectAttributes),
    };
    if (options.requestParameters) {
      // Online-mode
      this.requestParameters = options.requestParameters;
    } else {
      // Offline-mode -- depends on pre-populated IConfigurationStores (flags and bandits) to source configuration.

      // Allow an empty precomputedFlagStore to be passed in, but if it has items, ensure it was initialized properly.
      if (this.precomputedFlagStore.getKeys().length > 0) {
        if (!this.precomputedFlagStore.isInitialized()) {
          console.error(
            `EppoPrecomputedClient requires an initialized precomputedFlagStore if requestParameters are not provided`,
          );
        }

        if (!this.precomputedFlagStore.salt) {
          console.error(
            `EppoPrecomputedClient requires a precomputedFlagStore with a salt if requestParameters are not provided`,
          );
        }
      }
    }
  }

  public async fetchPrecomputedFlags() {
    if (!this.requestParameters) {
      throw new Error('Eppo SDK unable to fetch precomputed flags without the request parameters');
    }

    const {
      apiKey,
      sdkName,
      sdkVersion,
      baseUrl, // Default is set before passing to ApiEndpoints constructor if undefined
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    } = this.requestParameters;
    const { subjectKey, subjectAttributes } = this.subject;

    // todo: Inject the chain of dependencies below
    const apiEndpoints = new ApiEndpoints({
      defaultUrl: PRECOMPUTED_BASE_URL,
      baseUrl,
      queryParams: { apiKey, sdkName, sdkVersion },
      sdkTokenDecoder: new SdkTokenDecoder(apiKey),
    });
    const httpClient = new FetchHttpClient(apiEndpoints, requestTimeoutMs);
    const precomputedRequestor = new PrecomputedRequestor(
      httpClient,
      this.precomputedFlagStore,
      subjectKey,
      subjectAttributes,
    );

    return precomputedRequestor.fetchAndStorePrecomputedFlags();
  }

  private getPrecomputedAssignment<T>(
    flagKey: string,
    defaultValue: T,
    expectedType: VariationType,
    valueTransformer: (value: unknown) => T = (v) => v as T,
  ): T {
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const precomputedFlag = this.getPrecomputedFlag(flagKey);

    if (precomputedFlag == null) {
      console.warn(`No assigned variation. Flag not found: ${flagKey}`);
      return defaultValue;
    }

    // Add type checking before proceeding
    if (!checkTypeMatch(expectedType, precomputedFlag.variationType)) {
      const errorMessage = `Type mismatch: expected ${expectedType} but flag ${flagKey} has type ${precomputedFlag.variationType}`;
      console.error(errorMessage);
      return defaultValue;
    }

    const result: FlagEvaluationWithoutDetails = {
      flagKey,
      format: this.precomputedFlagStore.getFormat() ?? '',
      subjectKey: this.subject.subjectKey ?? '',
      subjectAttributes: ensureNonContextualSubjectAttributes(this.subject.subjectAttributes ?? {}),
      variation: {
        key: precomputedFlag.variationKey ?? '',
        value: precomputedFlag.variationValue,
      },
      allocationKey: precomputedFlag.allocationKey ?? '',
      extraLogging: precomputedFlag.extraLogging ?? {},
      doLog: precomputedFlag.doLog,
      entityId: null,
    };

    try {
      if (result?.doLog) {
        this.logAssignment(result);
      }
    } catch (error) {
      console.error(`Error logging assignment event: ${error}`);
    }

    try {
      return result.variation?.value !== undefined
        ? valueTransformer(result.variation.value)
        : defaultValue;
    } catch (error) {
      console.error(`Error transforming value: ${error}`);
      return defaultValue;
    }
  }

  /**
   * Maps a subject to a string variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getStringAssignment(flagKey: string, defaultValue: string): string {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.STRING);
  }

  /**
   * Maps a subject to a boolean variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.BOOLEAN);
  }

  /**
   * Maps a subject to an integer variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getIntegerAssignment(flagKey: string, defaultValue: number): number {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.INTEGER);
  }

  /**
   * Maps a subject to a numeric (floating point) variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getNumericAssignment(flagKey: string, defaultValue: number): number {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.NUMERIC);
  }

  /**
   * Maps a subject to a JSON object variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a parsed JSON object if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getJSONAssignment(flagKey: string, defaultValue: object): object {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.JSON, (value) =>
      typeof value === 'string' ? JSON.parse(value) : defaultValue,
    );
  }

  private getPrecomputedFlag(flagKey: string): DecodedPrecomputedFlag | null {
    return this.getObfuscatedFlag(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): DecodedPrecomputedFlag | null {
    const salt = this.precomputedFlagStore.salt;
    const saltedAndHashedFlagKey = getMD5Hash(flagKey, salt);
    const precomputedFlag: PrecomputedFlag | null = this.precomputedFlagStore.get(
      saltedAndHashedFlagKey,
    ) as PrecomputedFlag;
    return precomputedFlag ? decodePrecomputedFlag(precomputedFlag) : null;
  }

  public isInitialized() {
    return this.precomputedFlagStore.isInitialized();
  }

  public setAssignmentLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    // log any assignment events that may have been queued while initializing
    this.flushQueuedEvents(this.queuedAssignmentEvents, this.assignmentLogger?.logAssignment);
  }

  /**
   * Assignment cache methods.
   */
  public disableAssignmentCache() {
    this.assignmentCache = undefined;
  }

  public useNonExpiringInMemoryAssignmentCache() {
    this.assignmentCache = new NonExpiringInMemoryAssignmentCache();
  }

  private flushQueuedEvents<T>(eventQueue: T[], logFunction?: (event: T) => void) {
    const eventsToFlush = [...eventQueue]; // defensive copy
    eventQueue.length = 0; // Truncate the array

    if (!logFunction) {
      return;
    }

    eventsToFlush.forEach((event) => {
      try {
        logFunction(event);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error(`Error flushing event to logger: ${error.message}`);
      }
    });
  }

  private logAssignment(result: FlagEvaluationWithoutDetails) {
    const { flagKey, subjectKey, allocationKey, subjectAttributes, variation, format } = result;
    const event: IAssignmentEvent = {
      ...(result.extraLogging ?? {}),
      allocation: allocationKey ?? null,
      experiment: allocationKey ? `${flagKey}-${allocationKey}` : null,
      featureFlag: flagKey,
      format,
      variation: variation?.key ?? null,
      subject: subjectKey,
      timestamp: new Date().toISOString(),
      subjectAttributes,
      metaData: this.buildLoggerMetadata(),
      evaluationDetails: null,
    };

    if (variation && allocationKey) {
      const hasLoggedAssignment = this.assignmentCache?.has({
        flagKey,
        subjectKey,
        allocationKey,
        variationKey: variation.key,
      });
      if (hasLoggedAssignment) {
        return;
      }
    }

    try {
      if (this.assignmentLogger) {
        this.assignmentLogger.logAssignment(event);
      } else if (this.queuedAssignmentEvents.length < MAX_EVENT_QUEUE_SIZE) {
        // assignment logger may be null while waiting for initialization, queue up events (up to a max)
        // to be flushed when set
        this.queuedAssignmentEvents.push(event);
      }
      this.assignmentCache?.set({
        flagKey,
        subjectKey,
        allocationKey: allocationKey ?? '__eppo_no_allocation',
        variationKey: variation?.key ?? '__eppo_no_variation',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error(`Error logging assignment event: ${error.message}`);
    }
  }

  private buildLoggerMetadata(): Record<string, unknown> {
    return {
      obfuscated: true,
      sdkLanguage: 'javascript',
      sdkLibVersion: '1.0.0',
    };
  }
}

/**
 * Configuration parameters for initializing the Eppo precomputed client.
 *
 * This interface is used for cases where precomputed assignments are available
 * from an external process that can bootstrap the SDK client.
 *
 * @param precomputedConfiguration - The configuration as a string to bootstrap the client.
 * @param assignmentLogger - Optional logger for assignment events.
 * @param banditLogger - Optional logger for bandit events.
 * @param throwOnFailedInitialization - Optional flag to throw an error if initialization fails.
 * @public
 */
export interface IPrecomputedClientConfigSync {
  precomputedConfiguration: string;
  assignmentLogger?: IAssignmentLogger;
  throwOnFailedInitialization?: boolean;
}

/**
 * Initializes the Eppo precomputed client with configuration parameters.
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
export function offlinePrecomputedInit(
  config: IPrecomputedClientConfigSync,
): EppoPrecomputedClient {
  const throwOnFailedInitialization = config.throwOnFailedInitialization ?? true;

  let configurationWire: IConfigurationWire;
  try {
    configurationWire = JSON.parse(config.precomputedConfiguration);
    if (!configurationWire.precomputed) throw new Error();
  } catch (error) {
    const errorMessage = 'Invalid precomputed configuration wire';
    if (throwOnFailedInitialization) {
      throw new Error(errorMessage);
    }
    console.error(`[Eppo SDK] ${errorMessage}`);
    return EppoPrecomputedClient.instance;
  }
  const { subjectKey, subjectAttributes, response } = configurationWire.precomputed;
  const parsedResponse: IObfuscatedPrecomputedConfigurationResponse = JSON.parse(response);

  try {
    const memoryOnlyPrecomputedStore = precomputedFlagsStorageFactory();
    memoryOnlyPrecomputedStore
      .setEntries(parsedResponse.flags)
      .catch((err) =>
        console.warn('Error setting precomputed assignments for memory-only store', err),
      );
    memoryOnlyPrecomputedStore.salt = parsedResponse.salt;

    const subject: Subject = {
      subjectKey,
      subjectAttributes: subjectAttributes ?? {},
    };

    // shutdownEppoPrecomputedClient();

    // Add memory-only assignment cache for offline mode
    const assignmentCache = assignmentCacheFactory();

    EppoPrecomputedClient.instance = new EppoPrecomputedClient({
      precomputedFlagStore: memoryOnlyPrecomputedStore,
      subject,
    });

    if (config.assignmentLogger) {
      EppoPrecomputedClient.instance.setAssignmentLogger(config.assignmentLogger);
    }

    //EppoPrecomputedClient.instance.useCustomAssignmentCache(assignmentCache);
  } catch (error) {
    console.warn(
      '[Eppo SDK] Encountered an error initializing precomputed client, assignment calls will return the default value and not be logged',
    );
    if (throwOnFailedInitialization) {
      throw error;
    }
  }

  EppoPrecomputedClient.initialized = true;
  return EppoPrecomputedClient.instance;
}

export function assignmentCacheFactory(): AssignmentCache {
  return new SimpleAssignmentCache();
}

/** An {@link AssignmentCache} that can write (set) multiple entries at once (in bulk). */
export type BulkWriteAssignmentCache = AssignmentCache & {
  /** Sets all entries in the cache to the provided array of [key, value] pairs. */
  setEntries(entries: [string, string][]): void;
};

/** An {@link AssignmentCache} that can read (get) all entries at once. */
export type BulkReadAssignmentCache = AssignmentCache & {
  /** Returns all entries in the cache as an array of [key, value] pairs. */
  getEntries(): Promise<[string, string][]>;
};

export class SimpleAssignmentCache
  implements BulkWriteAssignmentCache, BulkReadAssignmentCache {
  private readonly store: Map<string, string>;
  private readonly cache: AbstractAssignmentCache<Map<string, string>>;

  constructor() {
    this.store = new Map<string, string>();
    this.cache = new NonExpiringInMemoryAssignmentCache(this.store);
  }

  set(key: AssignmentCacheEntry): void {
    this.cache.set(key);
  }

  has(key: AssignmentCacheEntry): boolean {
    return this.cache.has(key);
  }

  setEntries(entries: [string, string][]): void {
    const { store } = this;
    // it's important to call store.set() directly here because we want to set the raw entries into the cache, bypassing
    // the AbstractAssignmentCache logic, which takes an AssignmentCacheKey instead.
    entries.forEach(([key, value]) => store.set(key, value));
  }

  getEntries(): Promise<[string, string][]> {
    return Promise.resolve(Array.from(this.cache.entries()));
  }
}