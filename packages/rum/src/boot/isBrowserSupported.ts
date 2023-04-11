/**
 * Test for Browser features used while recording
 */
export function isBrowserSupported() {
  return (
    // Array.from is a bit less supported by browsers than CSSSupportsRule, but has higher chances
    // to be polyfilled. Test for both to be more confident. We could add more things if we find out
    // this test is not sufficient.
    typeof Array.from === 'function' &&
    typeof CSSSupportsRule === 'function' &&
    typeof URL.createObjectURL === 'function' &&
    'forEach' in NodeList.prototype
  )
}
