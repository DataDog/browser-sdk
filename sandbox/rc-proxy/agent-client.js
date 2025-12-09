/**
 * Agent Client - Polls local Datadog agent for Remote Config updates
 *
 * This client connects to a local Datadog agent's /v0.7/config endpoint,
 * which is the same endpoint used by tracers (dd-trace-js, dd-trace-py, etc.)
 *
 * The agent endpoint uses JSON (not protobuf) and returns probe configurations
 * directly without requiring API keys or external network access.
 */

import { randomUUID } from 'crypto';

// Apply states for config_states
const UNACKNOWLEDGED = 0;
const ACKNOWLEDGED = 1;
const ERROR = 2;

export default class AgentClient {
  constructor(agentUrl) {
    this.agentUrl = agentUrl;
    this.endpoint = '/v0.7/config';

    // Generate stable client ID (represents the browser RC proxy)
    this.clientId = this._generateClientId();

    // Track RC state (using snake_case for agent JSON API)
    this.state = {
      root_version: 1,
      targets_version: 0,
      config_states: [],
      has_error: false,
      error: '',
      backend_client_state: ''
    };

    this.cachedTargetFiles = [];

    // Track applied configs (like dd-trace-js RemoteConfigManager)
    // Map<path, {path, version, hashes, length, apply_state, apply_error, probe}>
    this.appliedConfigs = new Map();
  }

  /**
   * Initialize the agent client (no-op for agent mode, kept for compatibility)
   */
  async initialize() {
    return Promise.resolve();
  }

  /**
   * Get all currently applied probes
   * @returns {Array} Array of probe objects
   */
  getAllProbes() {
    return Array.from(this.appliedConfigs.values())
      .map(config => config.probe)
      .filter(probe => probe != null);
  }

  /**
   * Poll the local agent for RC updates
   *
   * @param {Array} activeClients - Array of browser clients from ClientTracker
   * @returns {Promise<Array>} Array of probe objects
   */
  async poll(activeClients) {
    try {
      // Build client payload for each active browser client
      const clients = activeClients.map(client => this._buildClientPayload(client));

      // The agent expects a single client per request, but we have multiple browser clients
      // For POC, we'll merge all into one composite client
      const payload = this._buildAgentRequest(clients);

      const response = await fetch(`${this.agentUrl}${this.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('[AgentClient] Error response body:', errorBody);
        } catch (e) {
          // Ignore
        }
        throw new Error(`Agent returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Parse config update (similar to dd-trace-js RemoteConfigManager.parseConfig)
      const probes = this._parseConfigUpdate(data);

      if (probes.length > 0) {
        console.log(`[AgentClient] Received ${probes.length} new/updated probe(s)`);
      }

      return probes;
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        const error = new Error(`Cannot connect to agent at ${this.agentUrl} - connection refused. Is the agent running?`);
        error.cause = err.cause;
        throw error;
      } else if (err.name === 'TimeoutError' || err.cause?.code === 'ETIMEDOUT') {
        const error = new Error(`Agent request timed out at ${this.agentUrl}. The agent may be unreachable.`);
        error.cause = err.cause;
        throw error;
      } else if (err.cause?.code === 'ENOTFOUND') {
        const error = new Error(`Cannot resolve hostname for agent at ${this.agentUrl}. Check the agent URL.`);
        error.cause = err.cause;
        throw error;
      }

      console.error('[AgentClient] Poll failed:', err.message);
      throw err;
    }
  }

  /**
   * Parse config update from agent response (similar to dd-trace-js parseConfig)
   * @private
   */
  _parseConfigUpdate(data) {
    const clientConfigs = data.client_configs || [];
    const targetFiles = data.target_files || [];

    // Parse TUF targets metadata
    const targetsMetadata = this._fromBase64JSON(data.targets);

    if (!targetsMetadata || !targetsMetadata.signed) {
      return [];
    }

    const targets = targetsMetadata.signed.targets;
    const newVersion = targetsMetadata.signed.version;

    this.state.targets_version = newVersion;

    // Update backend client state if present
    if (targetsMetadata.signed.custom && targetsMetadata.signed.custom.opaque_backend_state) {
      this.state.backend_client_state = targetsMetadata.signed.custom.opaque_backend_state;
    }

    // Determine which configs to unapply, apply, or modify
    const toUnapply = [];
    const toApply = [];
    const toModify = [];

    // Find configs to unapply (in appliedConfigs but not in clientConfigs)
    for (const [path, appliedConfig] of this.appliedConfigs.entries()) {
      if (!clientConfigs.includes(path)) {
        toUnapply.push(appliedConfig);
      }
    }

    // Find configs to apply or modify
    for (const path of clientConfigs) {
      const meta = targets[path];
      if (!meta) {
        console.warn(`[AgentClient] Unable to find target for path ${path}`);
        continue;
      }

      const current = this.appliedConfigs.get(path);

      // If we already have this config with the same hash, skip it
      if (current && current.hashes.sha256 === meta.hashes.sha256) {
        continue;
      }

      // Find the target file with the probe data
      const file = targetFiles.find(f => f.path === path);
      if (!file) {
        console.warn(`[AgentClient] Unable to find file for path ${path}`);
        continue;
      }

      // Parse the probe from the file
      let probe;
      try {
        probe = this._extractProbeFromFile(file);
      } catch (err) {
        console.error(`[AgentClient] Failed to parse probe from ${path}:`, err.message);
        continue;
      }

      // Create config entry
      const config = {
        path,
        version: meta.custom?.v || 0,
        hashes: meta.hashes,
        length: meta.length,
        apply_state: ACKNOWLEDGED,
        apply_error: '',
        probe
      };

      if (current) {
        toModify.push(config);
      } else {
        toApply.push(config);
      }
    }

    // Apply changes to appliedConfigs map
    for (const config of toUnapply) {
      this.appliedConfigs.delete(config.path);
    }

    for (const config of [...toApply, ...toModify]) {
      this.appliedConfigs.set(config.path, config);
    }

    // Build config_states for next request
    this.state.config_states = Array.from(this.appliedConfigs.values()).map(config => ({
      product: 'LIVE_DEBUGGING',
      id: config.path,
      version: config.version,
      apply_state: config.apply_state,
      apply_error: config.apply_error
    }));

    // Build cached_target_files for next request
    this.cachedTargetFiles = Array.from(this.appliedConfigs.values()).map(config => {
      const hashes = [];
      if (config.hashes) {
        for (const [algorithm, hashValue] of Object.entries(config.hashes)) {
          hashes.push({ algorithm, hash: hashValue });
        }
      }
      return {
        path: config.path,
        length: config.length,
        hashes
      };
    });

    // Log summary if there were changes
    if (toApply.length > 0 || toModify.length > 0 || toUnapply.length > 0) {
      console.log(`[AgentClient] Config changes: +${toApply.length} new, ~${toModify.length} modified, -${toUnapply.length} removed (total: ${this.appliedConfigs.size})`);
    }

    // Return only the new/modified probes
    return [...toApply, ...toModify].map(c => c.probe);
  }

  /**
   * Extract a single probe from a target file
   * @private
   */
  _extractProbeFromFile(file) {
    if (!file.raw) {
      throw new Error(`File ${file.path} has no raw content`);
    }

    // Parse the raw probe config (base64-encoded JSON from agent)
    let probeConfig;
    if (typeof file.raw === 'string') {
      probeConfig = this._fromBase64JSON(file.raw);
    } else if (Buffer.isBuffer(file.raw)) {
      probeConfig = this._fromBase64JSON(file.raw.toString('utf8'));
    } else if (file.raw.type === 'Buffer' && Array.isArray(file.raw.data)) {
      probeConfig = this._fromBase64JSON(Buffer.from(file.raw.data).toString('utf8'));
    } else {
      throw new Error(`Unknown raw format for ${file.path}`);
    }

    if (!probeConfig) {
      throw new Error(`Failed to decode base64 JSON for ${file.path}`);
    }

    return probeConfig;
  }

  /**
   * Build the client payload for the agent endpoint (uses snake_case for JSON)
   * @private
   */
  _buildClientPayload(browserClient) {
    return {
      state: this.state,
      id: this.clientId,
      products: ['LIVE_DEBUGGING'],
      is_tracer: true,
      client_tracer: {
        runtime_id: browserClient.runtimeId,
        language: 'node', // Match dd-trace-js to avoid agent filtering
        tracer_version: '6.0.0-pre', // Match dd-trace-js
        service: browserClient.service,
        env: browserClient.env || '',
        app_version: browserClient.version || '6.0.0-pre', // Match dd-trace-js
        extra_services: [],
        tags: [
          `service:${browserClient.service}`,
          ...(browserClient.env ? [`env:${browserClient.env}`] : []),
          ...(browserClient.version ? [`version:${browserClient.version}`] : []),
          `runtime-id:${browserClient.runtimeId}`,
          `_dd.rc.client_id:${this.clientId}`
        ]
      },
      capabilities: Buffer.alloc(1).toString('base64')
    };
  }

  /**
   * Build the agent request (using first client, as agent expects single client)
   * @private
   */
  _buildAgentRequest(clients) {
    // For simplicity, use the first client's metadata
    // In production, we might need multiple requests or merge strategies
    const client = clients.length > 0 ? clients[0] : this._buildDefaultClient();

    return {
      client: client,
      cached_target_files: this.cachedTargetFiles
    };
  }

  /**
   * Build a default client when no browser clients are active
   * @private
   */
  _buildDefaultClient() {
    return {
      state: this.state,
      id: this.clientId,
      // Subscribe to same products as dd-trace-js to match its behavior
      products: ['ASM_FEATURES', 'APM_TRACING', 'AGENT_CONFIG', 'AGENT_TASK', 'LIVE_DEBUGGING'],
      is_tracer: true,
      client_tracer: {
        runtime_id: this._generateRuntimeId(),
        language: 'node', // Match dd-trace-js
        tracer_version: '6.0.0-pre', // Match dd-trace-js
        service: 'browser-live-debugger-proxy',
        env: '',
        app_version: '6.0.0-pre', // Match dd-trace-js
        extra_services: [],
        tags: []
      },
      capabilities: Buffer.alloc(1).toString('base64')
    };
  }


  /**
   * Generate a unique client ID (like dd-trace-js does with uuid())
   * @private
   */
  _generateClientId() {
    // Generate a new UUID on each proxy startup (agent caches client state)
    // Using a deterministic ID would cause the agent to think we already have all configs
    return randomUUID();
  }

  /**
   * Generate a runtime ID
   * @private
   */
  _generateRuntimeId() {
    return 'runtime-' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Decode base64-encoded JSON (used for TUF targets)
   * @private
   */
  _fromBase64JSON(str) {
    if (!str) return null;
    try {
      return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
    } catch (err) {
      console.error('[AgentClient] Failed to decode base64 JSON:', err.message);
      return null;
    }
  }
}

