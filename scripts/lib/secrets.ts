import { command } from './command'

export function getGithubDeployKey(): string {
  return getSecretKey('ci.browser-sdk.github_deploy_key')
}

export function getGithubAccessToken(): string {
  return getSecretKey('ci.browser-sdk.github_access_token')
}

export function getOrg2ApiKey(): string {
  return getSecretKey('ci.browser-sdk.datadog_ci_api_key')
}

export function getOrg2AppKey(): string {
  return getSecretKey('ci.browser-sdk.datadog_ci_application_key')
}

export function getTelemetryOrgApiKey(site: string): string {
  const normalizedSite = site.replace(/\./g, '-')
  return getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)
}

export function getTelemetryOrgApplicationKey(site: string): string {
  const normalizedSite = site.replace(/\./g, '-')
  return getSecretKey(`ci.browser-sdk.telemetry.${normalizedSite}.ci_app_key`)
}

export function getNpmToken(): string {
  return getSecretKey('ci.browser-sdk.npm_token')
}

export function getChromeWebStoreClientId(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.client_id')
}

export function getChromeWebStoreClientSecret(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.client_secret')
}

export function getChromeWebStoreRefreshToken(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.refresh_token')
}

function getSecretKey(name: string): string {
  return command`
    aws ssm get-parameter --region=us-east-1 --with-decryption --query=Parameter.Value --out=text --name=${name}
  `
    .run()
    .trim()
}
