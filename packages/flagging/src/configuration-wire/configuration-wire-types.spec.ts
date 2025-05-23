import { MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE, readMockConfigurationWireResponse } from '../../test/testHelpers'
import { ConfigurationWireV1 } from './configuration-wire-types'

describe('Response String Type Safety', () => {
  const mockFlagConfig = readMockConfigurationWireResponse(MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE)

  describe('ConfigurationWireV1', () => {
    it('should create empty configuration', () => {
      const config = ConfigurationWireV1.empty()

      expect(config.version).toBe(1)
      expect(config.precomputed).toBeUndefined()
    })

    it('should include fetchedAt timestamps', () => {
      const wirePacket = ConfigurationWireV1.fromString(mockFlagConfig)

      expect(wirePacket.precomputed).toBeDefined()
      expect(wirePacket.precomputed?.response).toBeDefined()
      expect(wirePacket.precomputed?.subjectKey).toBeDefined()
      expect(wirePacket.precomputed?.subjectAttributes).toBeDefined()
    })
  })
})
