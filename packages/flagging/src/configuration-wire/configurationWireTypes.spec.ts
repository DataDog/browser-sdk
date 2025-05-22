import { MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE, readMockConfigurationWireResponse } from '../../test/helpers'
import { configurationWireV1 } from './configurationWireTypes'

describe('Response String Type Safety', () => {
  const mockFlagConfig = readMockConfigurationWireResponse(MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE)

  describe('ConfigurationWireV1', () => {
    it('should create empty configuration', () => {
      const config = configurationWireV1.empty()

      expect(config.version).toBe(1)
      expect(config.precomputed).toBeUndefined()
    })

    it('should include fetchedAt timestamps', () => {
      const wirePacket = configurationWireV1.fromString(mockFlagConfig)

      expect(wirePacket.precomputed).toBeDefined()
      expect(wirePacket.precomputed?.response).toBeDefined()
      expect(wirePacket.precomputed?.subjectKey).toBeDefined()
      expect(wirePacket.precomputed?.subjectAttributes).toBeDefined()
    })
  })
})
