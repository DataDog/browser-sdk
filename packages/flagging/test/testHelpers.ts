import mockPrecomputedConfig from './data/configuration-wire/precomputed-v1-deobfuscated.json'

const TEST_CONFIGURATION_WIRE_DATA_DIR = './test/data/configuration-wire/'
const MOCK_PRECOMPUTED_FILENAME = 'precomputed-v1'
export const MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE = `${MOCK_PRECOMPUTED_FILENAME}-deobfuscated.json`

export function readMockConfigurationWireResponse(filename: string): string {
  if (filename === MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE) {
    return JSON.stringify(mockPrecomputedConfig)
  }
  throw new Error(`Unknown test file: ${filename}`)
}
