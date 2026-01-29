declare module 'jasmine-core/lib/jasmine-core/jasmine.js' {
  interface JasmineRequire {
    core(jasmineRequire: JasmineRequire): any
    interface(jasmine: any, env: any): any
  }

  const jasmineRequire: JasmineRequire
  export default jasmineRequire
}
