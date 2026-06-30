import { command } from './command.ts'

export function getGithubDeployKey(): string {
  return getSecretKey('ci.browser-sdk.github_deploy_key')
}

export class OctoStsToken {
  readonly value: string

  constructor(name: string) {
    this.value = command`dd-octo-sts token --scope DataDog/browser-sdk --policy self.gitlab.${name}`.run().trim()
  }

  [Symbol.dispose]() {
    command`dd-octo-sts revoke --token ${this.value}`.run()
  }
}

/**
 * This token is scoped to main branch only.
 */
export function getGithubPullRequestToken() {
  return new OctoStsToken('pull_request')
}

/**
 * This token is scoped to tags only.
 */
export function getGithubReleaseToken() {
  return new OctoStsToken('release')
}

export function getGithubReadToken() {
  return new OctoStsToken('read')
}

export function getOrg2ApiKey(): string {
  return getSecretKey('ci.browser-sdk.datadog_ci_api_key')
}

export function getOrg2AppKey(): string {
  return getSecretKey('ci.browser-sdk.datadog_ci_application_key')
}

export function getTelemetryOrgApiKey(site: string): string | undefined {
  const normalizedSite = site.replaceAll('.', '-')
  try {
    return getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)
  } catch {
    return
  }
}

export function getTelemetryOrgApplicationKey(site: string): string | undefined {
  const normalizedSite = site.replaceAll('.', '-')
  try {
    return getSecretKey(`ci.browser-sdk.telemetry.${normalizedSite}.ci_app_key`)
  } catch {
    return
  }
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

export function getChromeWebStorePublisherId(): string {
  return getSecretKey('ci.browser-sdk.chrome_web_store.publisher_id')
}

export function getBrowserStackUsername(): string {
  return getSecretKey('ci.browser-sdk.bs_username')
}

export function getBrowserStackAccessKey(): string {
  return getSecretKey('ci.browser-sdk.bs_access_key')
}

export function getSfLwcClientId(): string {
  return process.env.SF_LWC_CLIENT_ID ?? getSecretKey('ci.browser-sdk.sf_lwc_client_id')
}

export function getSfLwcUsername(): string {
  return process.env.SF_LWC_USERNAME ?? getSecretKey('ci.browser-sdk.sf_lwc_username')
}

export function getSfLwcInstanceUrl(): string {
  return process.env.SF_LWC_INSTANCE_URL ?? getSecretKey('ci.browser-sdk.sf_lwc_instance_url')
}

export function getSfLwcJwtPrivateKey(): string {
  return process.env.SF_LWC_JWT_PRIVATE_KEY_B64 ?? getSecretKey('ci.browser-sdk.sf_lwc_jwt_private_key_b64')
}

function getSecretKey(name: string): string {
  return command`
    aws ssm get-parameter --region=us-east-1 --with-decryption --query=Parameter.Value --out=text --name=${name}
  `
    .run()
    .trim()
}
