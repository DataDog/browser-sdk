# Datadog Browser SDK

The browser SDK is used to collect logs and RUM data from the browser.
It's bundled into four files which are distributed through Cloudfront:

- `https://www.datadoghq-browser-agent.com/datadog-logs-(eu|us).js`
- `https://www.datadoghq-browser-agent.com/datadog-rum-(eu|us).js`

## Packages

- [Logs API](./packages/logs/README.md)
- [RUM API](./packages/rum/README.md)

## Deploy

### Staging

Each commit on `master` branch is deployed to staging:

`https://www.datad0g-browser-agent.com/datadog-(logs|rum)-(eu|us).js`

### Prod

Each commit on `prod` branch is deployed to prod:

`https://www.datadoghq-browser-agent.com/datadog-(logs|rum)-(eu|us).js`
