declare module 'jasmine-core/lib/jasmine-core/jasmine.js' {
  interface JasmineCore {
    getEnv(options?: { global?: typeof globalThis }): jasmine.Env
  }

  interface JasmineRequire {
    core(jasmineRequire: JasmineRequire): JasmineCore
    interface(jasmine: JasmineCore, env: jasmine.Env): any
  }

  const jasmineRequire: JasmineRequire

  // eslint-disable-next-line import/no-default-export
  export default jasmineRequire
}
