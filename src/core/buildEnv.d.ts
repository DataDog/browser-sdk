/**
 * Constant provided by webpack at compile time
 */
declare const buildEnv: BuildEnv

declare interface BuildEnv {
  TARGET_ENV: 'staging' | 'production'
  VERSION: string
}
