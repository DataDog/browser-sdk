Collect and send browser data to Datadog.

## Getting Started

### Log collection

See the dedicated [Datadog Browser Log Collection documentation](https://docs.datadoghq.com/logs/log_collection/javascript) to learn how to forward logs from your browser application to Datadog.

### Real User Monitoring

See the dedicated [Datadog Browser RUM Collection documentation](https://docs.datadoghq.com/real_user_monitoring/browser/) to learn how to send RUM data from your browser application to Datadog.

## npm packages

This repository contains several packages:

| Package          | npm                                                                                                                                  | size                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| browser-logs     | [![npm version](https://badge.fury.io/js/%40datadog%2Fbrowser-logs.svg)](https://badge.fury.io/js/%40datadog%2Fbrowser-logs)         | [![bundle size](https://deno.bundlejs.com/badge?q=@datadog/browser-logs&treeshake=[*])](https://bundlejs.com/?q=@datadog/browser-logs&treeshake=[*])         |
| browser-rum      | [![npm version](https://badge.fury.io/js/%40datadog%2Fbrowser-rum.svg)](https://badge.fury.io/js/%40datadog%2Fbrowser-rum)           | [![bundle size](https://deno.bundlejs.com/badge?q=@datadog/browser-rum&treeshake=[*])](https://bundlejs.com/?q=@datadog/browser-rum&treeshake=[*])           |
| browser-rum-slim | [![npm version](https://badge.fury.io/js/%40datadog%2Fbrowser-rum-slim.svg)](https://badge.fury.io/js/%40datadog%2Fbrowser-rum-slim) | [![bundle size](https://deno.bundlejs.com/badge?q=@datadog/browser-rum-slim&treeshake=[*])](https://bundlejs.com/?q=@datadog/browser-rum-slim&treeshake=[*]) |
| browser-rum-core | [![npm version](https://badge.fury.io/js/%40datadog%2Fbrowser-rum-core.svg)](https://badge.fury.io/js/%40datadog%2Fbrowser-rum-core) | [![bundle size](https://deno.bundlejs.com/badge?q=@datadog/browser-rum-core&treeshake=[*])](https://bundlejs.com/?q=@datadog/browser-rum-core&treeshake=[*]) |
| browser-worker   | [![npm version](https://badge.fury.io/js/%40datadog%2Fbrowser-worker.svg)](https://badge.fury.io/js/%40datadog%2Fbrowser-worker)     | [![bundle size](https://deno.bundlejs.com/badge?q=@datadog/browser-worker&treeshake=[*])](https://bundlejs.com/?q=@datadog/browser-worker&treeshake=[*])     |
| browser-core     | [![npm version](https://badge.fury.io/js/%40datadog%2Fbrowser-core.svg)](https://badge.fury.io/js/%40datadog%2Fbrowser-core)         | [![bundle size](https://deno.bundlejs.com/badge?q=@datadog/browser-core&treeshake=[*])](https://bundlejs.com/?q=@datadog/browser-core&treeshake=[*])         |

## CDN bundles

Datadog provides one CDN bundle per [site](https://docs.datadoghq.com/getting_started/site/):

| Site    | logs                                                           | rum                                                           | rum-slim                                                           |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| US1     | https://www.datadoghq-browser-agent.com/us1/v6/datadog-logs.js | https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum.js | https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum-slim.js |
| US3     | https://www.datadoghq-browser-agent.com/us3/v6/datadog-logs.js | https://www.datadoghq-browser-agent.com/us3/v6/datadog-rum.js | https://www.datadoghq-browser-agent.com/us3/v6/datadog-rum-slim.js |
| US5     | https://www.datadoghq-browser-agent.com/us5/v6/datadog-logs.js | https://www.datadoghq-browser-agent.com/us5/v6/datadog-rum.js | https://www.datadoghq-browser-agent.com/us5/v6/datadog-rum-slim.js |
| EU1     | https://www.datadoghq-browser-agent.com/eu1/v6/datadog-logs.js | https://www.datadoghq-browser-agent.com/eu1/v6/datadog-rum.js | https://www.datadoghq-browser-agent.com/eu1/v6/datadog-rum-slim.js |
| AP1     | https://www.datadoghq-browser-agent.com/ap1/v6/datadog-logs.js | https://www.datadoghq-browser-agent.com/ap1/v6/datadog-rum.js | https://www.datadoghq-browser-agent.com/ap1/v6/datadog-rum-slim.js |
| US1-FED | https://www.datadoghq-browser-agent.com/datadog-logs-v6.js     | https://www.datadoghq-browser-agent.com/datadog-rum-v6.js     | https://www.datadoghq-browser-agent.com/datadog-rum-slim-v6.js     |
