import protobuf from 'protobufjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Remote Config Client
 *
 * Communicates with Datadog's Remote Config backend using protobuf protocol.
 * Hardcoded to LIVE_DEBUGGING product only.
 */

class RCClient {
  constructor(apiKey, site = 'datadoghq.com') {
    this.apiKey = apiKey
    this.site = site
    this.baseURL = `https://config.${site}`
    this.endpoint = '/api/v0.1/configurations'

    // Version tracking for RC protocol
    this.versions = {
      config_snapshot: 0,
      config_root: 0,
      director_root: 0,
    }

    // Track products - first request uses new_products, then moves to products
    this.products = new Set()
    this.isFirstRequest = true

    // Protobuf types (loaded async)
    this.proto = null
    this.initialized = false
  }

  /**
   * Load and compile protobuf definitions
   */
  async initialize() {
    if (this.initialized) return

    try {
      const protoPath = join(__dirname, 'remoteconfig.proto')
      const root = await protobuf.load(protoPath)

      this.proto = {
        LatestConfigsRequest: root.lookupType('datadog.config.LatestConfigsRequest'),
        LatestConfigsResponse: root.lookupType('datadog.config.LatestConfigsResponse'),
        Client: root.lookupType('datadog.config.Client'),
        ClientState: root.lookupType('datadog.config.ClientState'),
        ClientTracer: root.lookupType('datadog.config.ClientTracer'),
      }

      this.initialized = true
      console.log('[RCClient] Protobuf definitions loaded')
    } catch (err) {
      console.error('[RCClient] Failed to load protobuf definitions:', err)
      throw err
    }
  }

  /**
   * Poll Remote Config backend for updates
   * @param {Array} activeClients - Array of active client info from ClientTracker
   * @returns {Promise<Array>} Array of parsed probe objects
   */
  async poll(activeClients = []) {
    if (!this.initialized) {
      await this.initialize()
    }

    // Build active_clients protobuf messages
    const pbClients = activeClients.map((clientInfo) => {
      return this.proto.Client.create(clientInfo)
    })

    // On first request, LIVE_DEBUGGING goes in newProducts
    // On subsequent requests, it goes in products
    const products = this.isFirstRequest ? [] : ['LIVE_DEBUGGING']
    const newProducts = this.isFirstRequest ? ['LIVE_DEBUGGING'] : []

    // Build the request
    const request = this.proto.LatestConfigsRequest.create({
      hostname: 'browser-rc-proxy',
      agentVersion: 'browser-rc-proxy/1.0.0',
      currentConfigSnapshotVersion: this.versions.config_snapshot,
      currentConfigRootVersion: this.versions.config_root,
      currentDirectorRootVersion: this.versions.director_root,
      products: products,
      newProducts: newProducts,
      activeClients: pbClients,
      backendClientState: Buffer.alloc(0),
      hasError: false,
      error: '',
      traceAgentEnv: '',
      orgUuid: '',
      tags: [],
      agentUuid: '',
    })

    // Debug log the request structure before encoding
    console.log(
      '[RCClient] Request structure:',
      JSON.stringify(
        {
          hostname: request.hostname,
          agentVersion: request.agentVersion,
          products: request.products,
          newProducts: request.newProducts,
          activeClients: request.activeClients.map((c) => ({
            id: c.id,
            service: c.clientTracer?.service,
            env: c.clientTracer?.env,
            isTracer: c.isTracer,
          })),
          currentConfigSnapshotVersion: request.currentConfigSnapshotVersion,
          currentConfigRootVersion: request.currentConfigRootVersion,
          currentDirectorRootVersion: request.currentDirectorRootVersion,
        },
        null,
        2
      )
    )

    // Encode to protobuf
    const requestBuffer = this.proto.LatestConfigsRequest.encode(request).finish()

    console.log('[RCClient] Encoded protobuf size:', requestBuffer.length, 'bytes')

    // Make HTTP request to Datadog
    const url = `${this.baseURL}${this.endpoint}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'DD-Api-Key': this.apiKey,
          'Content-Type': 'application/x-protobuf',
          'User-Agent': 'browser-rc-proxy/1.0.0',
        },
        body: requestBuffer,
      })

      if (!response.ok) {
        // Try to get response body for debugging
        let errorBody = ''
        try {
          errorBody = await response.text()
        } catch (e) {
          // Ignore
        }
        console.error(`[RCClient] RC backend error response body: ${errorBody}`)
        throw new Error(`RC backend returned ${response.status}: ${response.statusText}`)
      }

      // Decode protobuf response
      const responseBuffer = Buffer.from(await response.arrayBuffer())
      const decodedResponse = this.proto.LatestConfigsResponse.decode(responseBuffer)

      // Update version tracking
      if (decodedResponse.configMetas) {
        if (decodedResponse.configMetas.snapshot) {
          this.versions.config_snapshot = decodedResponse.configMetas.snapshot.version || 0
        }
        if (decodedResponse.configMetas.roots && decodedResponse.configMetas.roots.length > 0) {
          const latestRoot = decodedResponse.configMetas.roots[decodedResponse.configMetas.roots.length - 1]
          this.versions.config_root = latestRoot.version || 0
        }
      }
      if (decodedResponse.directorMetas) {
        if (decodedResponse.directorMetas.roots && decodedResponse.directorMetas.roots.length > 0) {
          const latestRoot = decodedResponse.directorMetas.roots[decodedResponse.directorMetas.roots.length - 1]
          this.versions.director_root = latestRoot.version || 0
        }
      }

      // Mark that first request is complete
      if (this.isFirstRequest) {
        this.isFirstRequest = false
        this.products.add('LIVE_DEBUGGING')
      }

      // Extract and parse target files (probes)
      const probes = this._extractProbes(decodedResponse.targetFiles || [])

      console.log(
        `[RCClient] Poll successful. Received ${probes.length} probes. Versions: ${JSON.stringify(this.versions)}`
      )

      return probes
    } catch (err) {
      console.error('[RCClient] Poll failed:', err.message)
      throw err
    }
  }

  /**
   * Extract and parse probes from target files
   * @param {Array} targetFiles - Array of File messages from RC response
   * @returns {Array} Array of parsed probe objects
   */
  _extractProbes(targetFiles) {
    const probes = []

    for (const file of targetFiles) {
      try {
        // Target files contain base64-encoded JSON
        const jsonStr = file.raw.toString('utf-8')
        const config = JSON.parse(jsonStr)

        // LIVE_DEBUGGING configs typically have a structure like:
        // { "probe": { ... probe data ... } }
        // or could be an array of probes

        if (config.probe) {
          probes.push(config.probe)
        } else if (Array.isArray(config)) {
          probes.push(...config)
        } else if (config.probes && Array.isArray(config.probes)) {
          probes.push(...config.probes)
        } else {
          // Assume the entire config is a probe
          probes.push(config)
        }
      } catch (err) {
        console.error(`[RCClient] Failed to parse target file ${file.path}:`, err.message)
      }
    }

    return probes
  }
}

export default RCClient
