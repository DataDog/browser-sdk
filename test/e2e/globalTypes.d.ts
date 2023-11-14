// When using WebdriverIO, a global 'expect' function is defined as a type, representing a
// jest-based version defined in the `expect-webdriverio` package. There is an option to opt-out of
// the actual global variable definition, but its *type* is still defined.
//
// Unfortunately, this type is not compatible with the Jasmine 'expect' function that we use.
//
// This file is here to make sure types that are defined in '@types/jasmine' take precedence over
// the ones that are implicitly pulled when using WebdriverIO.

/// <reference types="@types/jasmine" />
