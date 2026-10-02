// Polyfill Object.hasOwn for browsers that don't support it (e.g. Chrome < 93, ES2022)
// Required because @angular/core >= 22.1.3 uses Object.hasOwn internally.
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = function (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  }
}
