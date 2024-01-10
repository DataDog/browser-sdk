# Datadog Browser SDK

Collect and send browser data to Datadog.

## Getting Started

### Log collection

See the dedicated [Datadog Browser Log Collection documentation][08] to learn how to forward logs from your browser application to Datadog.

### Real User Monitoring

See the dedicated [Datadog Browser RUM Collection documentation][18] to learn how to send RUM data from your browser application to Datadog.

## npm packages

This repository contains several packages:

| Package          | npm                      | size                     |
| ---------------- | ------------------------ | ------------------------ |
| browser-logs     | [![npm version][01]][02] | [![bundle size][03]][04] |
| browser-rum      | [![npm version][11]][12] | [![bundle size][13]][14] |
| browser-rum-slim | [![npm version][21]][22] | [![bundle size][23]][24] |
| browser-rum-core | [![npm version][51]][52] | [![bundle size][53]][54] |
| browser-worker   | [![npm version][61]][62] | [![bundle size][63]][64] |
| browser-core     | [![npm version][41]][42] | [![bundle size][43]][44] |

## CDN bundles

Datadog provides one CDN bundle per [site][70]:

| Site    | logs                                                           | rum                                                           | rum-slim                                                           |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| US1     | https://www.datadoghq-browser-agent.com/us1/v5/datadog-logs.js | https://www.datadoghq-browser-agent.com/us1/v5/datadog-rum.js | https://www.datadoghq-browser-agent.com/us1/v5/datadog-rum-slim.js |
| US3     | https://www.datadoghq-browser-agent.com/us3/v5/datadog-logs.js | https://www.datadoghq-browser-agent.com/us3/v5/datadog-rum.js | https://www.datadoghq-browser-agent.com/us3/v5/datadog-rum-slim.js |
| US5     | https://www.datadoghq-browser-agent.com/us5/v5/datadog-logs.js | https://www.datadoghq-browser-agent.com/us5/v5/datadog-rum.js | https://www.datadoghq-browser-agent.com/us5/v5/datadog-rum-slim.js |
| EU1     | https://www.datadoghq-browser-agent.com/eu1/v5/datadog-logs.js | https://www.datadoghq-browser-agent.com/eu1/v5/datadog-rum.js | https://www.datadoghq-browser-agent.com/eu1/v5/datadog-rum-slim.js |
| US1-FED | https://www.datadoghq-browser-agent.com/datadog-logs-v5.js     | https://www.datadoghq-browser-agent.com/datadog-rum-v5.js     | https://www.datadoghq-browser-agent.com/datadog-rum-slim-v5.js     |

[1]: https://github.githubassets.com/favicons/favicon.png
[2]: https://imgix.datadoghq.com/img/favicons/favicon-32x32.png
[01]: https://badge.fury.io/js/%40datadog%2Fbrowser-logs.svg
[02]: https://badge.fury.io/js/%40datadog%2Fbrowser-logs
[03]: https://badgen.net/bundlephobia/minzip/@datadog/browser-logs
[04]: https://bundlephobia.com/result?p=@datadog/browser-logs
[08]: https://docs.datadoghq.com/logs/log_collection/javascript
[11]: https://badge.fury.io/js/%40datadog%2Fbrowser-rum.svg
[12]: https://badge.fury.io/js/%40datadog%2Fbrowser-rum
[13]: https://badgen.net/bundlephobia/minzip/@datadog/browser-rum
[14]: https://bundlephobia.com/result?p=@datadog/browser-rum
[18]: https://docs.datadoghq.com/real_user_monitoring/browser/
[21]: https://badge.fury.io/js/%40datadog%2Fbrowser-rum-slim.svg
[22]: https://badge.fury.io/js/%40datadog%2Fbrowser-rum-slim
[23]: https://badgen.net/bundlephobia/minzip/@datadog/browser-rum-slim
[24]: https://bundlephobia.com/result?p=@datadog/browser-rum-slim
[41]: https://badge.fury.io/js/%40datadog%2Fbrowser-core.svg
[42]: https://badge.fury.io/js/%40datadog%2Fbrowser-core
[43]: https://badgen.net/bundlephobia/minzip/@datadog/browser-core
[44]: https://bundlephobia.com/result?p=@datadog/browser-core
[51]: https://badge.fury.io/js/%40datadog%2Fbrowser-rum-core.svg
[52]: https://badge.fury.io/js/%40datadog%2Fbrowser-rum-core
[53]: https://badgen.net/bundlephobia/minzip/@datadog/browser-rum-core
[54]: https://bundlephobia.com/result?p=@datadog/browser-rum-core
[61]: https://badge.fury.io/js/%40datadog%2Fbrowser-worker.svg
[62]: https://badge.fury.io/js/%40datadog%2Fbrowser-worker
[63]: https://badgen.net/bundlephobia/minzip/@datadog/browser-worker
[64]: https://bundlephobia.com/result?p=@datadog/browser-worker
[70]: https://docs.datadoghq.com/getting_started/site/
