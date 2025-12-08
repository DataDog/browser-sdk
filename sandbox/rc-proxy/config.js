import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration for the RC Proxy
 * 
 * Supports two modes:
 * 1. Agent mode (AGENT_URL): Polls local Datadog agent - for POC/development
 * 2. Backend mode (DD_API_KEY + DD_SITE): Polls Datadog RC backend directly - requires backend access
 */

// Determine mode
const AGENT_URL = process.env.AGENT_URL;
const DD_API_KEY = process.env.DD_API_KEY;

const useAgentMode = !!AGENT_URL;

if (!useAgentMode && !DD_API_KEY) {
  console.error('ERROR: Either AGENT_URL or DD_API_KEY must be set');
  console.error('  - AGENT_URL: URL of local Datadog agent (e.g., http://localhost:8126)');
  console.error('  - DD_API_KEY + DD_SITE: For direct RC backend access');
  process.exit(1);
}

// Optional configuration with defaults
const config = {
  mode: useAgentMode ? 'agent' : 'backend',
  agentUrl: AGENT_URL,
  apiKey: DD_API_KEY,
  site: process.env.DD_SITE || 'datadoghq.com',
  port: parseInt(process.env.PORT || '3030', 10),
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5000', 10),
  clientTTL: parseInt(process.env.CLIENT_TTL || '30000', 10)
};

// Validate numeric values
if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
  console.error('ERROR: PORT must be a valid port number (1-65535)');
  process.exit(1);
}

if (isNaN(config.pollInterval) || config.pollInterval < 1000) {
  console.error('ERROR: POLL_INTERVAL must be at least 1000ms');
  process.exit(1);
}

if (isNaN(config.clientTTL) || config.clientTTL < 1000) {
  console.error('ERROR: CLIENT_TTL must be at least 1000ms');
  process.exit(1);
}

console.log('[Config] Configuration loaded:');
console.log(`  - Mode: ${config.mode}`);
if (config.mode === 'agent') {
  console.log(`  - Agent URL: ${config.agentUrl}`);
} else {
  console.log(`  - Site: ${config.site}`);
  console.log(`  - API Key: ${config.apiKey.substring(0, 8)}...`);
}
console.log(`  - Port: ${config.port}`);
console.log(`  - Poll Interval: ${config.pollInterval}ms`);
console.log(`  - Client TTL: ${config.clientTTL}ms`);

export default config;

