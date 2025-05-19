import { FormatEnum } from './interfaces';

export const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
export const REQUEST_TIMEOUT_MILLIS = DEFAULT_REQUEST_TIMEOUT_MS; // for backwards compatibility
export const BASE_URL = 'https://fscdn.eppo.cloud/api';

export const PRECOMPUTED_BASE_URL = 'https://fs-edge-assignment.eppo.cloud';
export const PRECOMPUTED_FLAGS_ENDPOINT = '/assignments';

export const SESSION_ASSIGNMENT_CONFIG_LOADED = 'eppo-session-assignment-config-loaded';
export const NULL_SENTINEL = 'DATADOG_NULL';
// number of logging events that may be queued while waiting for initialization
export const MAX_EVENT_QUEUE_SIZE = 100;
export const BANDIT_ASSIGNMENT_SHARDS = 10000;
export const DEFAULT_TLRU_TTL_MS = 600_000;

/**
 * UFC Configuration formats which are obfuscated.
 *
 * We use string[] instead of FormatEnum[] to allow easy interaction with this value in its wire type (string).
 * Converting from string to enum requires a map lookup or array iteration and is much more awkward than the inverse.
 */
export const OBFUSCATED_FORMATS: string[] = [FormatEnum.PRECOMPUTED];
