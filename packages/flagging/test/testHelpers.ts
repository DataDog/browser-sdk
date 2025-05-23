import mockPrecomputedConfig from './data/configuration-wire/precomputed-v1-deobfuscated.json'

const MOCK_PRECOMPUTED_FILENAME = 'precomputed-v1'
export const MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE = `${MOCK_PRECOMPUTED_FILENAME}-deobfuscated.json`

export function readMockConfigurationWireResponse(filename: string): string {
  if (filename === MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE) {
    return JSON.stringify(mockPrecomputedConfig)
  }
  throw new Error(`Unknown test file: ${filename}`)
}
