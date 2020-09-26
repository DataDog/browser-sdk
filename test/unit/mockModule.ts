interface Exports {
  [name: string]: unknown
}

interface WebpackRequire {
  d(exports: Exports, name: string, getter: () => unknown): void
  o(object: unknown, name: string): boolean
}
declare const __webpack_require__: WebpackRequire

interface Module {
  exports: Exports
}
interface Require {
  cache: { [name: string]: Module }
}
declare const require: Require

const mocks = new Map<Exports, Exports | false>()

__webpack_require__.d = (exports, name, getter) => {
  if (!__webpack_require__.o(exports, name)) {
    if (!mocks.has(exports)) {
      mocks.set(exports, false)
    }

    Object.defineProperty(exports, name, {
      enumerable: true,

      get: () => {
        const currentMock = mocks.get(exports)
        if (currentMock && currentMock.hasOwnProperty(name)) {
          return currentMock[name]
        }
        return getter()
      },
    })
  }
}

export function mockModule<ModuleExports>(
  modulePath: string,
  factory: (exports: ModuleExports) => Partial<ModuleExports>
) {
  if (!require.cache.hasOwnProperty(modulePath)) {
    throw new Error(`Failed to mock ${modulePath}: the module is not yet loaded`)
  }

  const moduleExports = require.cache[modulePath].exports

  if (!mocks.has(moduleExports)) {
    throw new Error(`Failed to mock ${modulePath}: the module was loaded before module-mock`)
  }

  if (mocks.get(moduleExports) !== false) {
    throw new Error(`Failed to mock ${modulePath}: the module is already mocked`)
  }

  mocks.set(moduleExports, factory((moduleExports as unknown) as ModuleExports))

  return () => {
    mocks.set(moduleExports, false)
  }
}

export function unmockModules() {
  mocks.forEach((_, moduleExports) => mocks.set(moduleExports, false))
}
