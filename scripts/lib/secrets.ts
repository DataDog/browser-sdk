import { command } from './command.ts'

function getGithubDeployKey(): string {
  return getSecretKey('ci.browser-sdk.github_deploy_key')
}

function getGithubAccessToken(): string {
  return getSecretKey('ci.browser-sdk.github_access_token')
}

function getOrg2ApiKey(): string {
  return getSecretKey('ci.browser-sdk.datadog_ci_api_key')
}

function getOrg2AppKey(): string {
  return getSecretKey('ci.browser-sdk.datadog_ci_application_key')
}

function getTelemetryOrgApiKey(site: string): string {
  const normalizedSite = site.replaceAll('.', '-')
  return getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)
}

function getTelemetryOrgApplicationKey(site: string): string {
  const normalizedSite = site.replaceAll('.', '-')
  return getSecretKey(`ci.browser-sdk.telemetry.${normalizedSite}.ci_app_key`)
}

function getNpmToken(): string {
  return getSecretKey('ci.browser-sdk.npm_token')
}

function getChromeWebStoreClientId(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.client_id')
}

function getChromeWebStoreClientSecret(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.client_secret')
}

function getChromeWebStoreRefreshToken(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.refresh_token')
}

function getSecretKey(name: string): string {
  return command`
    aws ssm get-parameter --region=us-east-1 --with-decryption --query=Parameter.Value --out=text --name=${name}
  `
    .run()
    .trim()
}

export {
  getChromeWebStoreClientId,
  getChromeWebStoreClientSecret,
  getChromeWebStoreRefreshToken,
  getGithubDeployKey,
  getGithubAccessToken,
  getNpmToken,
  getOrg2ApiKey,
  getOrg2AppKey,
  getTelemetryOrgApiKey,
  getTelemetryOrgApplicationKey,
}
