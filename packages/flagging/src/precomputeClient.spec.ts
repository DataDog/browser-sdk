import mockPrecomputedConfig from '../test/data/configuration-wire/precomputed-v1-deobfuscated.json'
import { precomputedFlagsStorageFactory } from './configurationFactory'
import { VariationType } from './interfaces'
import { offlinePrecomputedInit, PrecomputeClient } from './precomputeClient'

type TestCase<T = unknown> = {
  name: string
  flagKey: string
  defaultValue: T
  expectedValue: T
  variationType: VariationType
}

type DefaultTestCase<T = unknown> = Omit<TestCase<T>, 'flagKey'>

describe('PrecomputeClient', () => {
  beforeEach(() => {
    // Reset the singleton instance before each test
    PrecomputeClient.instance = new PrecomputeClient({
      subject: {
        key: '',
        attributes: {
          numericAttributes: {},
          categoricalAttributes: {},
        },
      },
      precomputedFlagStore: precomputedFlagsStorageFactory(),
    })
    PrecomputeClient.initialized = false
  })

  describe('evaluate', () => {
    describe('flag evaluations', () => {
      const testCases: TestCase[] = [
        {
          name: 'string flag',
          flagKey: 'string-flag',
          defaultValue: 'default-value',
          expectedValue: 'red',
          variationType: VariationType.STRING,
        },
        {
          name: 'boolean flag',
          flagKey: 'boolean-flag',
          defaultValue: false,
          expectedValue: true,
          variationType: VariationType.BOOLEAN,
        },
        {
          name: 'integer flag',
          flagKey: 'integer-flag',
          defaultValue: 0,
          expectedValue: 42,
          variationType: VariationType.INTEGER,
        },
        {
          name: 'numeric flag',
          flagKey: 'numeric-flag',
          defaultValue: 0,
          expectedValue: 3.14,
          variationType: VariationType.NUMERIC,
        },
        {
          name: 'JSON flag',
          flagKey: 'json-flag',
          defaultValue: {},
          expectedValue: { key: 'value', prop: 123 },
          variationType: VariationType.JSON,
        },
      ]

      testCases.forEach(({ name, flagKey, defaultValue, expectedValue, variationType }) => {
        it(`should evaluate ${name}`, () => {
          const client = offlinePrecomputedInit({ precomputedConfiguration: JSON.stringify(mockPrecomputedConfig) })
          switch (variationType) {
            case VariationType.STRING:
              expect(client!.getStringAssignment(flagKey, defaultValue as string)).toEqual(expectedValue as string)
              break
            case VariationType.BOOLEAN:
              expect(client!.getBooleanAssignment(flagKey, defaultValue as boolean)).toEqual(expectedValue as boolean)
              break
            case VariationType.INTEGER:
              expect(client!.getIntegerAssignment(flagKey, defaultValue as number)).toEqual(expectedValue as number)
              break
            case VariationType.NUMERIC:
              expect(client!.getNumericAssignment(flagKey, defaultValue as number)).toEqual(expectedValue as number)
              break
            case VariationType.JSON:
              expect(client!.getJSONAssignment(flagKey, defaultValue as object)).toEqual(expectedValue as object)
              break
          }
        })
      })
    })

    describe('default value behavior', () => {
      const defaultTestCases: DefaultTestCase[] = [
        {
          name: 'string default',
          defaultValue: 'default-value',
          expectedValue: 'default-value',
          variationType: VariationType.STRING,
        },
        {
          name: 'boolean default',
          defaultValue: false,
          expectedValue: false,
          variationType: VariationType.BOOLEAN,
        },
        {
          name: 'integer default',
          defaultValue: 0,
          expectedValue: 0,
          variationType: VariationType.INTEGER,
        },
        {
          name: 'numeric default',
          defaultValue: 0,
          expectedValue: 0,
          variationType: VariationType.NUMERIC,
        },
        {
          name: 'JSON default',
          defaultValue: {},
          expectedValue: {},
          variationType: VariationType.JSON,
        },
      ]

      defaultTestCases.forEach(({ name, defaultValue, expectedValue, variationType }) => {
        it(`should return ${name} for non-existent flag`, () => {
          const client = offlinePrecomputedInit({ precomputedConfiguration: JSON.stringify(mockPrecomputedConfig) })
          switch (variationType) {
            case VariationType.STRING:
              expect(client!.getStringAssignment('non-existent-flag', defaultValue as string)).toEqual(
                expectedValue as string
              )
              break
            case VariationType.BOOLEAN:
              expect(client!.getBooleanAssignment('non-existent-flag', defaultValue as boolean)).toEqual(
                expectedValue as boolean
              )
              break
            case VariationType.INTEGER:
              expect(client!.getIntegerAssignment('non-existent-flag', defaultValue as number)).toEqual(
                expectedValue as number
              )
              break
            case VariationType.NUMERIC:
              expect(client!.getNumericAssignment('non-existent-flag', defaultValue as number)).toEqual(
                expectedValue as number
              )
              break
            case VariationType.JSON:
              expect(client!.getJSONAssignment('non-existent-flag', defaultValue as object)).toEqual(
                expectedValue as object
              )
          }
        })
      })
    })
  })
})
