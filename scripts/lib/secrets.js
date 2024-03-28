const { command } = require('../lib/command')

function getGithubDeployKey() {
  return getSecretKey('ci.browser-sdk.github_deploy_key')
}

function getGithubAccessToken() {
  return getSecretKey('ci.browser-sdk.github_access_token')
}

function getOrg2ApiKey() {
  return getSecretKey('ci.browser-sdk.datadog_ci_api_key')
}

function getOrg2AppKey() {
  return getSecretKey('ci.browser-sdk.datadog_ci_application_key')
}

function getTelemetryOrgApiKey(site) {
  const normalizedSite = site.replaceAll('.', '-')
  return getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)
}

function getTelemetryOrgApplicationKey(site) {
  const normalizedSite = site.replaceAll('.', '-')
  return getSecretKey(`ci.browser-sdk.telemetry.${normalizedSite}.ci_app_key`)
}

function getNpmToken() {
  return getSecretKey('ci.browser-sdk.npm_token')
}

function getChromeWebStoreClientId() {
  return getSecretKey('ci.browser-sdk.chrome_web_store.client_id')
}

function getChromeWebStoreClientSecret() {
  return getSecretKey('ci.browser-sdk.chrome_web_store.client_secret')
}

function getChromeWebStoreRefreshToken() {
  return getSecretKey('ci.browser-sdk.chrome_web_store.refresh_token')
}

function getSecretKey(name) {
  return command`
    aws ssm get-parameter --region=us-east-1 --with-decryption --query=Parameter.Value --out=text --name=${name}
  `
    .run()
    .trim()
}

module.exports = {
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
