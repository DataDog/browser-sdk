// <reference types="jasmine" />

import type { MockInstance, MockInstance, TestContext } from "vitest";
import { vi, expect, beforeEach } from "vitest";

beforeEach(() => {
  (window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = "test";
  (window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_SETUP__ = "dev";
  // reset globals
  (window as any).DD_LOGS = {};
  (window as any).DD_RUM = {};
  // prevent 'Some of your tests did a full page reload!' issue
  // Note: clearing cookies should be done in `beforeEach` rather than `afterEach`, because in some
  // cases the test patches the `document.cookie` getter (ex: `spyOnProperty(document, 'cookie',
  // 'get')`), which would prevent the `clearAllCookies` function from working properly.
  clearAllCookies();
});

function clearAllCookies() {
  document.cookie.split(";").forEach((c) => {
    document.cookie = c.replace(
      /=.*/,
      `=;expires=${new Date().toUTCString()};path=/;samesite=strict`,
    );
  });
}

window.spyOn = (object, method) => {
  const mock = vi.spyOn(object, method);
  return mockToJasmineSpy(mock);
};

window.spyOnProperty = (object, property, accessType) => {
  if (accessType && !object.hasOwnProperty(property)) {
    throw new Error(
      `Cannot spy the property '${property}', it is not a property of the object`,
    );
  }
  const mock = vi.spyOn(object, property, accessType);
  return mockToJasmineSpy(mock);
};

window.pending = (reason) => {
  if (!currentContext) {
    throw new Error("pending() can only be called inside a test");
  }
  currentContext.skip(reason);
};

let currentContext: TestContext | undefined;
window.beforeEach = wrapTestApi(beforeEach);
window.it = wrapTestApi(it);
window.fit = wrapTestApi(it.only);
window.xit = wrapTestApi(it.skip);

function wrapTestApi(fn: (...args: any[]) => any) {
  function wrappedFn(...args: any[]) {
    const callback = args.at(-1);
    if (typeof callback !== "function") {
      throw new Error("Unexpected last argument");
    }
    function wrappedCallback(context: TestContext) {
      currentContext = context;
      if (callback.length === 1) {
        return new Promise((resolve) => callback(resolve));
      }
      return callback();
    }
    return fn(...args.slice(0, -1), wrappedCallback);
  }

  return wrappedFn;
}

window.jasmine = {
  clock: () => ({
    install() {
      vi.useFakeTimers();
    },
    uninstall() {
      vi.useRealTimers();
    },
    tick(ms) {
      vi.advanceTimersByTime(ms);
    },
    mockDate(date) {
      if (date) {
        vi.setSystemTime(date.getTime());
      }
    },
  }),
  createSpy(name, originalFn) {
    const mock = vi.fn();
    return mockToJasmineSpy(mock, originalFn);
  },
  stringContaining: expect.stringContaining,
  stringMatching: expect.stringMatching,
  objectContaining: expect.objectContaining,
  any: expect.any,
};

function mockToJasmineSpy(
  mock: MockInstance,
  originalFn?: () => void,
): jasmine.Spy {
  const spy = mock as jasmine.Spy;
  spy.and = {
    throwError(messageOrError) {
      mock.mockImplementation(() => {
        if (typeof messageOrError === "string") {
          throw new Error(messageOrError);
        } else {
          throw messageOrError;
        }
      });
      return spy;
    },
    callFake(fn) {
      mock.mockImplementation(fn);
      return spy;
    },
    callThrough() {
      if (originalFn) {
        mock.mockImplementation(originalFn);
      } else {
        mock.mockReset();
      }
      return spy;
    },
    returnValue(value) {
      mock.mockReturnValue(value);
      return spy;
    },
  };
  spy.calls = {
    all() {
      return mock.mock.calls.map((_args, index) => getCallInfo(index));
    },
    allArgs() {
      return mock.mock.calls;
    },
    count() {
      return mock.mock.calls.length;
    },
    argsFor(index) {
      return mock.mock.calls[index];
    },
    thisFor(index) {
      return mock.mock.contexts[index]
    },
    first() {
      return getCallInfo(0)
    },
    mostRecent() {
      return getCallInfo(mock.mock.calls.length - 1);
    },
    reset() {
      mock.mockClear();
    },
  };

  function getCallInfo(index: number): jasmine.CallInfo<any> {
    return {
      object: mock.mock.contexts[index],
      args: mock.mock.calls[index],
      returnValue: mock.mock.results[index].value,
    };
  }

  return spy;
}

expect.extend({
  toHaveBeenCalledOnceWith(received, ...expected) {
    const mock = received as MockInstance;
    if (mock.mock.calls.length !== 1) {
      return {
        pass: false,
        message: () =>
          `Expected mock to have been called exactly once, but it was called ${mock.mock.calls.length} times`,
      };
    }
    if (!this.equals(mock.mock.calls[0], expected)) {
      return {
        pass: false,
        message: () =>
          `Expected mock to have been called with ${expected} but was called with ${mock.mock.calls[0]}`,
      };
    }
    return {
      pass: true,
    };
  },
  toBeDefined(received) {
    return expectNotToBe(received, undefined);
  },
  toBeTrue(received) {
    return expectToBe(received, true);
  },
  toBeFalse(received) {
    return expectToBe(received, false);
  },
});

function expectToBe(received, expected) {
  return {
    pass: received === expected,
    message: () => `Expected ${received} to be ${expected}`,
  };
}

function expectNotToBe(received, expected) {
  return {
    pass: received !== expected,
    message: () => `Expected ${received} not to be ${expected}`,
  };
}
