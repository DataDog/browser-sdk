import { AbstractAssignmentCache } from './abstract-assignment-cache';

/**
 * A cache that never expires.
 *
 * The primary use case is for client-side SDKs, where the cache is only used
 * for a single user.
 */
export class NonExpiringInMemoryAssignmentCache extends AbstractAssignmentCache<
  Map<string, string>
> {
  constructor(store = new Map<string, string>()) {
    super(store);
  }
}
