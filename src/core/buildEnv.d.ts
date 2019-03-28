/**
 * Constant provided by webpack at compile time
 */
declare const buildEnv: BuildEnv

declare interface BuildEnv {
  TARGET_DC: 'eu' | 'us'
  TARGET_ENV: 'e2e-test' | 'staging' | 'production'
  VERSION: string
}
