import { setNavigatorOnLine, setNavigatorConnection } from '../../../test'
import { getConnectivity } from './connectivity'

describe('connectivity', () => {
  describe('status', () => {
    it('should return `connected` when navigator.onLine is true', () => {
      setNavigatorOnLine(true)
      expect(getConnectivity().status).toEqual('connected')
    })

    it('should return `not_connected` when navigator.onLine is false', () => {
      setNavigatorOnLine(false)
      expect(getConnectivity().status).toEqual('not_connected')
    })
  })

  describe('interfaces', () => {
    it('should not be defined if navigator.connection is not available', () => {
      setNavigatorConnection(undefined)
      expect(getConnectivity().interfaces).toBeUndefined()
    })

    it('should not be defined if navigator.connection.type is not available', () => {
      setNavigatorConnection({})
      expect(getConnectivity().interfaces).toBeUndefined()
    })

    it('should return navigator.connection.type value', () => {
      setNavigatorConnection({ type: 'bluetooth' })
      expect(getConnectivity().interfaces).toEqual(['bluetooth'])
    })
  })

  describe('effective_type', () => {
    it('should not be defined if navigator.connection is not available', () => {
      setNavigatorConnection(undefined)
      expect(getConnectivity().effective_type).toBeUndefined()
    })

    it('should not be defined if navigator.connection.effective_type is not available', () => {
      setNavigatorConnection({})
      expect(getConnectivity().effective_type).toBeUndefined()
    })

    it('should return navigator.connection.effective_type value', () => {
      setNavigatorConnection({ effectiveType: '4g' })
      expect(getConnectivity().effective_type).toBe('4g')
    })
  })
})
