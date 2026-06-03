// Base case, the page has the SDK in the init and the error stack is in the page.
export const STACK_WITH_INIT_IN_PAGE = `Error
    at Object.init (http://localhost:8080/datadog-rum.js:3919:16)
    at http://localhost:8080/:10:14`

// Base case for extension, the extension has the SDK in the init and the error stack is in the extension.
export const STACK_WITH_INIT_IN_EXTENSION = `Error
    at Object.init (chrome-extension://abcdef/dist/contentScript.js:254:14)
    at chrome-extension://abcdef/dist/contentScript.js:13304:14
    at chrome-extension://abcdef/dist/contentScript.js:13315:3`

export const STACK_WITH_INIT_IN_EXTENSION_FIREFOX = `Error
Object.init@moz-extension://abcdef/dist/contentScript.js:254:14
@moz-extension://abcdef/dist/contentScript.js:13304:14
@moz-extension://abcdef/dist/contentScript.js:13315:3`
