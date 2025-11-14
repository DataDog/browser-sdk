/* eslint-disable local-rules/disallow-side-effects */
import tracer from 'dd-trace'
import { app } from 'electron'

/*
// configuring metrics can help troubleshoot the setup
// but will generate spans for each request to the metrics intake
import metrics from 'datadog-metrics'
metrics.init({ prefix: 'electron-main-ps.' });

function collectMemoryStats() {
    const memUsage = process.memoryUsage();
    metrics.gauge('memory.rss', memUsage.rss);
    metrics.gauge('memory.heapTotal', memUsage.heapTotal);
    metrics.gauge('memory.heapUsed', memUsage.heapUsed);
}

setInterval(collectMemoryStats, 5000);
*/
tracer.init({
  tags: {
    electron: {
      appName: app.getName(),
      appVersion: app.getVersion(),
      version: process.versions.electron,
    },
    node: {
      version: process.versions.node,
    },
    os: {
      platform: process.platform,
      release: process.release,
    },
    chrome: {
      version: process.versions.chrome,
    },
    env: 'prod',
  },
})
// initialized in a different file to avoid hoisting.
export default tracer // eslint-disable-line import/no-default-export
