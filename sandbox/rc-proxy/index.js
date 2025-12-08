import express from 'express';
import config from './config.js';
import ClientTracker from './client-tracker.js';
import RCClient from './rc-client.js';
import AgentClient from './agent-client.js';

/**
 * Remote Config Proxy Server
 * 
 * Main server that:
 * - Tracks active browser clients
 * - Polls Datadog RC backend for LIVE_DEBUGGING probes
 * - Serves probes to browsers via HTTP GET
 */

const app = express();

// Initialize client tracker
const clientTracker = new ClientTracker(config.clientTTL);

// Initialize RC client based on mode
let rcClient;
if (config.mode === 'agent') {
  console.log('[Init] Using local agent mode');
  rcClient = new AgentClient(config.agentUrl);
} else {
  console.log('[Init] Using backend mode (direct RC access)');
  rcClient = new RCClient(config.apiKey, config.site);
}

// Probe cache
const probeCache = new Map(); // Key: probe ID, Value: probe object
let lastPollTime = null;
let lastPollError = null;

// CORS middleware - allow browser access from localhost
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// JSON middleware
app.use(express.json());

/**
 * GET /probes
 * 
 * Register a client and return all probes.
 * Query params:
 * - service (required): Service name
 * - env (optional): Environment
 * - version (optional): App version
 */
app.get('/probes', (req, res) => {
  const { service, env, version } = req.query;

  // Validate required params
  if (!service) {
    return res.status(400).json({
      error: 'Missing required query parameter: service'
    });
  }

  // Register/update client
  try {
    clientTracker.registerClient(service, env, version);
  } catch (err) {
    console.error('[Server] Error registering client:', err);
  }

  // Return all probes from cache
  const probes = Array.from(probeCache.values());
  
  res.json({
    probes,
    count: probes.length,
    lastPollTime
  });
});

/**
 * GET /health
 * 
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const activeClientCount = clientTracker.getActiveClientCount();
  
  res.json({
    ok: !lastPollError,
    lastPollTime,
    lastPollError: lastPollError ? lastPollError.message : null,
    activeClientCount,
    probeCount: probeCache.size,
    config: {
      mode: config.mode,
      agentUrl: config.agentUrl,
      site: config.site,
      pollInterval: config.pollInterval,
      clientTTL: config.clientTTL
    }
  });
});

/**
 * GET /
 * 
 * Welcome message and API documentation
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Datadog Remote Config Proxy',
    version: '1.0.0',
    description: 'Proxy for browser Live Debugger Remote Config (LIVE_DEBUGGING only)',
    endpoints: {
      '/probes': 'GET - Register client and fetch probes. Query params: service (required), env, version',
      '/health': 'GET - Health check and status',
      '/': 'GET - This information'
    },
    status: {
      activeClients: clientTracker.getActiveClientCount(),
      probes: probeCache.size,
      lastPoll: lastPollTime
    }
  });
});

/**
 * Background polling loop
 * 
 * Polls Datadog RC backend periodically and updates probe cache
 */
async function pollLoop() {
  try {
    // Get active clients
    const activeClients = clientTracker.getActiveClients();
    
    if (activeClients.length === 0) {
      lastPollError = null;
      return;
    }
    
    // Poll RC backend/agent (returns only new/modified probes)
    let deltaProbes;
    if (config.mode === 'agent') {
      // Agent mode: pass raw client data
      deltaProbes = await rcClient.poll(activeClients);
    } else {
      // Backend mode: build protobuf client messages
      const pbClientMessages = activeClients.map(client => 
        clientTracker.buildClientMessage(client)
      );
      deltaProbes = await rcClient.poll(pbClientMessages);
    }
    
    // Update probe cache with all currently applied probes (not just the delta)
    const allProbes = rcClient.getAllProbes();
    probeCache.clear();
    for (const probe of allProbes) {
      if (probe.id) {
        probeCache.set(probe.id, probe);
      }
    }
    
    lastPollTime = new Date().toISOString();
    lastPollError = null;
    
    if (deltaProbes.length > 0) {
      console.log(`[Polling] Updated: ${deltaProbes.length} probe(s) changed (total: ${allProbes.length})`);
    }
  } catch (err) {
    console.error('[Polling] Poll error:', err.message);
    lastPollError = err;
  }
}

/**
 * Start the server
 */
async function start() {
  console.log('🚀 Starting Remote Config Proxy...');
  
  // Initialize RC client (load protobuf)
  try {
    await rcClient.initialize();
  } catch (err) {
    console.error('Failed to initialize RC client:', err);
    process.exit(1);
  }

  // Start Express server
  app.listen(config.port, () => {
    console.log(`\n✅ Proxy running on http://localhost:${config.port}`);
    console.log(`   Polling agent at ${config.agentUrl} every ${config.pollInterval}ms\n`);
  });
  
  // Initial poll
  await pollLoop();
  
  // Set up interval
  setInterval(pollLoop, config.pollInterval);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

// Start the server
start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

