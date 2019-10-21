/**
 * Constant provided by webpack at compile time
 */
declare const buildEnv: BuildEnv

interface BuildEnv {
  TARGET_DC: 'eu' | 'us'
  TARGET_ENV: 'e2e-test' | 'staging' | 'production'
  VERSION: string
}

export const defaultEnv = {
  datacenter: buildEnv ? buildEnv.TARGET_DC : 'us',
  env: buildEnv ? buildEnv.TARGET_ENV : 'production',
  version: buildEnv.VERSION,
}
