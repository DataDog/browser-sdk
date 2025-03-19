import { datadogRum } from '@datadog/browser-rum';
import { init_rum_extensions } from '../../init_rum_extensions'

console.log('[Background] Script loaded - Firefox extension with manifest v2');

const logs = [];
function addLog(message, type = 'info') {
  const log = {
    timestamp: new Date().toISOString(),
    type,
    message
  };
  logs.push(log);

  if (logs.length > 100) {
    logs.shift();
  }

  console.log(`[Background] ${type.toUpperCase()}: ${message}`);
  return log;
}

function initRUM() {
  try {
    addLog('Attempting to initialize RUM...');

    init_rum_extensions();

    datadogRum.setUser({
      id: 'firefox-test-user',
      name: 'Firefox Background Worker',
      email: 'firefox-test@example.com'
    });

    datadogRum.addAction('rum_initialized', {
      source: 'background_worker',
      timestamp: new Date().toISOString()
    });

    const errorStack = new Error().stack || "";
    addLog(`Background script error stack: ${errorStack}`);
    addLog(`Contains moz-extension: ${errorStack.includes('moz-extension://')}`);
    addLog(`Current URL: ${window.location.href}`);

    addLog('RUM initialized successfully');
    return true;
  } catch (error) {
    addLog(`Error initializing RUM: ${error.message}`, 'error');
    addLog(`Error stack: ${error.stack}`, 'error');
    return false;
  }
}

initRUM()

addLog(`Extension ID: ${chrome.runtime.id}`);
addLog(`Browser information: ${navigator.userAgent}`);
addLog(`Firefox extension with manifest v2 - Background script loaded and running`);