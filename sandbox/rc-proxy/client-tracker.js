import { randomUUID } from 'crypto';

/**
 * Client Tracker
 * 
 * Tracks active browser clients (similar to how the Datadog Agent tracks tracer clients).
 * Each client has a TTL and is expired if not seen within the configured timeout.
 */

class ClientTracker {
  constructor(clientTTL = 30000) {
    this.clientTTL = clientTTL;
    this.clients = new Map(); // Key: clientKey (service:env:version), Value: client info
  }

  /**
   * Generate a unique key for a client based on service, env, and version
   */
  _getClientKey(service, env, version) {
    return `${service}:${env || 'none'}:${version || 'none'}`;
  }

  /**
   * Register or update a client
   * @param {string} service - Service name
   * @param {string} env - Environment (optional)
   * @param {string} version - App version (optional)
   * @returns {object} The registered client
   */
  registerClient(service, env = '', version = '') {
    const clientKey = this._getClientKey(service, env, version);
    const now = Date.now();

    let client = this.clients.get(clientKey);
    
    if (!client) {
      // New client - generate runtime ID
      client = {
        id: randomUUID(),
        runtimeId: randomUUID(),
        service,
        env,
        version,
        lastSeen: now,
        createdAt: now
      };
      this.clients.set(clientKey, client);
      console.log(`[ClientTracker] New client registered: ${clientKey}`);
    } else {
      // Update last seen timestamp
      client.lastSeen = now;
    }

    return client;
  }

  /**
   * Get all active clients (not expired)
   * Prunes expired clients as a side effect
   * @returns {Array} Array of active clients
   */
  getActiveClients() {
    const now = Date.now();
    const activeClients = [];

    for (const [key, client] of this.clients.entries()) {
      if (now - client.lastSeen > this.clientTTL) {
        // Client has expired
        this.clients.delete(key);
        console.log(`[ClientTracker] Client expired: ${key}`);
      } else {
        activeClients.push(client);
      }
    }

    return activeClients;
  }

  /**
   * Build protobuf Client message for a browser client
   * @param {object} client - Client info from tracker
   * @returns {object} Protobuf Client message structure
   */
  buildClientMessage(client) {
    return {
      state: {
        rootVersion: 1,
        targetsVersion: 0,
        configStates: [],
        hasError: false,
        error: '',
        backendClientState: Buffer.alloc(0)
      },
      id: client.id,
      products: ['LIVE_DEBUGGING'], // Hardcoded to LIVE_DEBUGGING only
      isTracer: true,
      clientTracer: {
        runtimeId: client.runtimeId,
        language: 'javascript',
        tracerVersion: 'browser-live-debugger/1.0.0',
        service: client.service,
        env: client.env || '',
        appVersion: client.version || '',
        tags: [],
        extraServices: [],
        processTags: [],
        containerTags: []
      },
      isAgent: false,
      isUpdater: false,
      lastSeen: Math.floor(client.lastSeen / 1000), // Convert to seconds
      capabilities: Buffer.alloc(1) // Default capability
    };
  }

  /**
   * Get count of active clients (without expiring)
   */
  getActiveClientCount() {
    const now = Date.now();
    let count = 0;
    for (const client of this.clients.values()) {
      if (now - client.lastSeen <= this.clientTTL) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all clients (useful for testing)
   */
  clear() {
    this.clients.clear();
  }
}

export default ClientTracker;

