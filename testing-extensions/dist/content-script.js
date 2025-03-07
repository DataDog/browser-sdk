"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // ../packages/core/src/tools/display.ts
  var ConsoleApiName, globalConsole, originalConsoleMethods, PREFIX, display, DOCS_ORIGIN, DOCS_TROUBLESHOOTING, MORE_DETAILS;
  var init_display = __esm({
    "../packages/core/src/tools/display.ts"() {
      "use strict";
      ConsoleApiName = {
        log: "log",
        debug: "debug",
        info: "info",
        warn: "warn",
        error: "error"
      };
      globalConsole = console;
      originalConsoleMethods = {};
      Object.keys(ConsoleApiName).forEach((name) => {
        originalConsoleMethods[name] = globalConsole[name];
      });
      PREFIX = "Datadog Browser SDK:";
      display = {
        debug: originalConsoleMethods.debug.bind(globalConsole, PREFIX),
        log: originalConsoleMethods.log.bind(globalConsole, PREFIX),
        info: originalConsoleMethods.info.bind(globalConsole, PREFIX),
        warn: originalConsoleMethods.warn.bind(globalConsole, PREFIX),
        error: originalConsoleMethods.error.bind(globalConsole, PREFIX)
      };
      DOCS_ORIGIN = "https://docs.datadoghq.com";
      DOCS_TROUBLESHOOTING = `${DOCS_ORIGIN}/real_user_monitoring/browser/troubleshooting`;
      MORE_DETAILS = "More details:";
    }
  });

  // ../packages/core/src/tools/catchUserErrors.ts
  function catchUserErrors(fn, errorMsg) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (err) {
        display.error(errorMsg, err);
      }
    };
  }
  var init_catchUserErrors = __esm({
    "../packages/core/src/tools/catchUserErrors.ts"() {
      "use strict";
      init_display();
    }
  });

  // ../packages/core/src/tools/utils/numberUtils.ts
  function performDraw(threshold) {
    return threshold !== 0 && Math.random() * 100 <= threshold;
  }
  function round(num, decimals) {
    return +num.toFixed(decimals);
  }
  function isPercentage(value) {
    return isNumber(value) && value >= 0 && value <= 100;
  }
  function isNumber(value) {
    return typeof value === "number";
  }
  var init_numberUtils = __esm({
    "../packages/core/src/tools/utils/numberUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/utils/timeUtils.ts
  function relativeToClocks(relative) {
    return { relative, timeStamp: getCorrectedTimeStamp(relative) };
  }
  function timeStampToClocks(timeStamp) {
    return { relative: getRelativeTime(timeStamp), timeStamp };
  }
  function getCorrectedTimeStamp(relativeTime) {
    const correctedOrigin = dateNow() - performance.now();
    if (correctedOrigin > getNavigationStart()) {
      return Math.round(addDuration(correctedOrigin, relativeTime));
    }
    return getTimeStamp(relativeTime);
  }
  function currentDrift() {
    return Math.round(dateNow() - addDuration(getNavigationStart(), performance.now()));
  }
  function toServerDuration(duration) {
    if (!isNumber(duration)) {
      return duration;
    }
    return round(duration * 1e6, 0);
  }
  function dateNow() {
    return (/* @__PURE__ */ new Date()).getTime();
  }
  function timeStampNow() {
    return dateNow();
  }
  function relativeNow() {
    return performance.now();
  }
  function clocksNow() {
    return { relative: relativeNow(), timeStamp: timeStampNow() };
  }
  function clocksOrigin() {
    return { relative: 0, timeStamp: getNavigationStart() };
  }
  function elapsed(start, end) {
    return end - start;
  }
  function addDuration(a, b) {
    return a + b;
  }
  function getRelativeTime(timestamp) {
    return timestamp - getNavigationStart();
  }
  function getTimeStamp(relativeTime) {
    return Math.round(addDuration(getNavigationStart(), relativeTime));
  }
  function looksLikeRelativeTime(time) {
    return time < ONE_YEAR;
  }
  function getNavigationStart() {
    if (navigationStart === void 0) {
      navigationStart = performance.timing.navigationStart;
    }
    return navigationStart;
  }
  var ONE_SECOND, ONE_MINUTE, ONE_HOUR, ONE_DAY, ONE_YEAR, navigationStart;
  var init_timeUtils = __esm({
    "../packages/core/src/tools/utils/timeUtils.ts"() {
      "use strict";
      init_numberUtils();
      ONE_SECOND = 1e3;
      ONE_MINUTE = 60 * ONE_SECOND;
      ONE_HOUR = 60 * ONE_MINUTE;
      ONE_DAY = 24 * ONE_HOUR;
      ONE_YEAR = 365 * ONE_DAY;
    }
  });

  // ../packages/core/src/tools/utils/byteUtils.ts
  function computeBytesCount(candidate) {
    if (!HAS_MULTI_BYTES_CHARACTERS.test(candidate)) {
      return candidate.length;
    }
    if (window.TextEncoder !== void 0) {
      return new TextEncoder().encode(candidate).length;
    }
    return new Blob([candidate]).size;
  }
  function concatBuffers(buffers) {
    const length = buffers.reduce((total, buffer) => total + buffer.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    return result;
  }
  var ONE_KIBI_BYTE, ONE_MEBI_BYTE, HAS_MULTI_BYTES_CHARACTERS;
  var init_byteUtils = __esm({
    "../packages/core/src/tools/utils/byteUtils.ts"() {
      "use strict";
      ONE_KIBI_BYTE = 1024;
      ONE_MEBI_BYTE = 1024 * ONE_KIBI_BYTE;
      HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/;
    }
  });

  // ../packages/core/src/tools/utils/objectUtils.ts
  function shallowClone(object) {
    return { ...object };
  }
  function objectHasValue(object, value) {
    return Object.keys(object).some((key) => object[key] === value);
  }
  function isEmptyObject(object) {
    return Object.keys(object).length === 0;
  }
  function mapValues(object, fn) {
    const newObject = {};
    for (const key of Object.keys(object)) {
      newObject[key] = fn(object[key]);
    }
    return newObject;
  }
  var init_objectUtils = __esm({
    "../packages/core/src/tools/utils/objectUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/getGlobalObject.ts
  function getGlobalObject() {
    if (typeof globalThis === "object") {
      return globalThis;
    }
    Object.defineProperty(Object.prototype, "_dd_temp_", {
      get() {
        return this;
      },
      configurable: true
    });
    let globalObject = _dd_temp_;
    delete Object.prototype._dd_temp_;
    if (typeof globalObject !== "object") {
      if (typeof self === "object") {
        globalObject = self;
      } else if (typeof window === "object") {
        globalObject = window;
      } else {
        globalObject = {};
      }
    }
    return globalObject;
  }
  var init_getGlobalObject = __esm({
    "../packages/core/src/tools/getGlobalObject.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/getZoneJsOriginalValue.ts
  function getZoneJsOriginalValue(target, name) {
    const browserWindow = getGlobalObject();
    let original;
    if (browserWindow.Zone && typeof browserWindow.Zone.__symbol__ === "function") {
      original = target[browserWindow.Zone.__symbol__(name)];
    }
    if (!original) {
      original = target[name];
    }
    return original;
  }
  var init_getZoneJsOriginalValue = __esm({
    "../packages/core/src/tools/getZoneJsOriginalValue.ts"() {
      "use strict";
      init_getGlobalObject();
    }
  });

  // ../packages/core/src/tools/monitor.ts
  function startMonitorErrorCollection(newOnMonitorErrorCollected) {
    onMonitorErrorCollected = newOnMonitorErrorCollected;
  }
  function setDebugMode(newDebugMode) {
    debugMode = newDebugMode;
  }
  function monitor(fn) {
    return function() {
      return callMonitored(fn, this, arguments);
    };
  }
  function callMonitored(fn, context, args) {
    try {
      return fn.apply(context, args);
    } catch (e) {
      monitorError(e);
    }
  }
  function monitorError(e) {
    displayIfDebugEnabled(e);
    if (onMonitorErrorCollected) {
      try {
        onMonitorErrorCollected(e);
      } catch (e2) {
        displayIfDebugEnabled(e2);
      }
    }
  }
  function displayIfDebugEnabled(...args) {
    if (debugMode) {
      display.error("[MONITOR]", ...args);
    }
  }
  var onMonitorErrorCollected, debugMode;
  var init_monitor = __esm({
    "../packages/core/src/tools/monitor.ts"() {
      "use strict";
      init_display();
      debugMode = false;
    }
  });

  // ../packages/core/src/tools/timer.ts
  function setTimeout(callback, delay) {
    return getZoneJsOriginalValue(getGlobalObject(), "setTimeout")(monitor(callback), delay);
  }
  function clearTimeout(timeoutId) {
    getZoneJsOriginalValue(getGlobalObject(), "clearTimeout")(timeoutId);
  }
  function setInterval(callback, delay) {
    return getZoneJsOriginalValue(getGlobalObject(), "setInterval")(monitor(callback), delay);
  }
  function clearInterval(timeoutId) {
    getZoneJsOriginalValue(getGlobalObject(), "clearInterval")(timeoutId);
  }
  var init_timer = __esm({
    "../packages/core/src/tools/timer.ts"() {
      "use strict";
      init_getZoneJsOriginalValue();
      init_monitor();
      init_getGlobalObject();
    }
  });

  // ../packages/core/src/tools/observable.ts
  function mergeObservables(...observables) {
    return new Observable((globalObservable) => {
      const subscriptions = observables.map(
        (observable) => observable.subscribe((data) => globalObservable.notify(data))
      );
      return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
    });
  }
  var Observable;
  var init_observable = __esm({
    "../packages/core/src/tools/observable.ts"() {
      "use strict";
      Observable = class {
        constructor(onFirstSubscribe) {
          this.onFirstSubscribe = onFirstSubscribe;
          this.observers = [];
        }
        subscribe(f) {
          this.observers.push(f);
          if (this.observers.length === 1 && this.onFirstSubscribe) {
            this.onLastUnsubscribe = this.onFirstSubscribe(this) || void 0;
          }
          return {
            unsubscribe: () => {
              this.observers = this.observers.filter((other) => f !== other);
              if (!this.observers.length && this.onLastUnsubscribe) {
                this.onLastUnsubscribe();
              }
            }
          };
        }
        notify(data) {
          this.observers.forEach((observer2) => observer2(data));
        }
      };
    }
  });

  // ../packages/core/src/tools/utils/functionUtils.ts
  function throttle(fn, wait, options) {
    const needLeadingExecution = options && options.leading !== void 0 ? options.leading : true;
    const needTrailingExecution = options && options.trailing !== void 0 ? options.trailing : true;
    let inWaitPeriod = false;
    let pendingExecutionWithParameters;
    let pendingTimeoutId;
    return {
      throttled: (...parameters) => {
        if (inWaitPeriod) {
          pendingExecutionWithParameters = parameters;
          return;
        }
        if (needLeadingExecution) {
          fn(...parameters);
        } else {
          pendingExecutionWithParameters = parameters;
        }
        inWaitPeriod = true;
        pendingTimeoutId = setTimeout(() => {
          if (needTrailingExecution && pendingExecutionWithParameters) {
            fn(...pendingExecutionWithParameters);
          }
          inWaitPeriod = false;
          pendingExecutionWithParameters = void 0;
        }, wait);
      },
      cancel: () => {
        clearTimeout(pendingTimeoutId);
        inWaitPeriod = false;
        pendingExecutionWithParameters = void 0;
      }
    };
  }
  function noop() {
  }
  var init_functionUtils = __esm({
    "../packages/core/src/tools/utils/functionUtils.ts"() {
      "use strict";
      init_timer();
    }
  });

  // ../packages/core/src/tools/utils/stringUtils.ts
  function generateUUID(placeholder) {
    return placeholder ? (
      // eslint-disable-next-line  no-bitwise
      (parseInt(placeholder, 10) ^ Math.random() * 16 >> parseInt(placeholder, 10) / 4).toString(16)
    ) : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID);
  }
  function findCommaSeparatedValue(rawString, name) {
    COMMA_SEPARATED_KEY_VALUE.lastIndex = 0;
    while (true) {
      const match = COMMA_SEPARATED_KEY_VALUE.exec(rawString);
      if (match) {
        if (match[1] === name) {
          return match[2];
        }
      } else {
        break;
      }
    }
  }
  function findCommaSeparatedValues(rawString) {
    const result = /* @__PURE__ */ new Map();
    COMMA_SEPARATED_KEY_VALUE.lastIndex = 0;
    while (true) {
      const match = COMMA_SEPARATED_KEY_VALUE.exec(rawString);
      if (match) {
        result.set(match[1], match[2]);
      } else {
        break;
      }
    }
    return result;
  }
  function safeTruncate(candidate, length, suffix = "") {
    const lastChar = candidate.charCodeAt(length - 1);
    const isLastCharSurrogatePair = lastChar >= 55296 && lastChar <= 56319;
    const correctedLength = isLastCharSurrogatePair ? length + 1 : length;
    if (candidate.length <= correctedLength) {
      return candidate;
    }
    return `${candidate.slice(0, correctedLength)}${suffix}`;
  }
  var COMMA_SEPARATED_KEY_VALUE;
  var init_stringUtils = __esm({
    "../packages/core/src/tools/utils/stringUtils.ts"() {
      "use strict";
      COMMA_SEPARATED_KEY_VALUE = /([\w-]+)\s*=\s*([^;]+)/g;
    }
  });

  // ../packages/core/src/tools/utils/browserDetection.ts
  function isChromium() {
    return detectBrowserCached() === 0 /* CHROMIUM */;
  }
  function isSafari() {
    return detectBrowserCached() === 1 /* SAFARI */;
  }
  function detectBrowserCached() {
    return browserCache ?? (browserCache = detectBrowser());
  }
  function detectBrowser(browserWindow = window) {
    const userAgent = browserWindow.navigator.userAgent;
    if (browserWindow.chrome || /HeadlessChrome/.test(userAgent)) {
      return 0 /* CHROMIUM */;
    }
    if (
      // navigator.vendor is deprecated, but it is the most resilient way we found to detect
      // "Apple maintained browsers" (AKA Safari). If one day it gets removed, we still have the
      // useragent test as a semi-working fallback.
      browserWindow.navigator.vendor?.indexOf("Apple") === 0 || /safari/i.test(userAgent) && !/chrome|android/i.test(userAgent)
    ) {
      return 1 /* SAFARI */;
    }
    return 2 /* OTHER */;
  }
  var browserCache;
  var init_browserDetection = __esm({
    "../packages/core/src/tools/utils/browserDetection.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/browser/cookie.ts
  function setCookie(name, value, expireDelay = 0, options) {
    const date = /* @__PURE__ */ new Date();
    date.setTime(date.getTime() + expireDelay);
    const expires = `expires=${date.toUTCString()}`;
    const sameSite = options && options.crossSite ? "none" : "strict";
    const domain = options && options.domain ? `;domain=${options.domain}` : "";
    const secure = options && options.secure ? ";secure" : "";
    const partitioned = options && options.partitioned ? ";partitioned" : "";
    document.cookie = `${name}=${value};${expires};path=/;samesite=${sameSite}${domain}${secure}${partitioned}`;
  }
  function getCookie(name) {
    return findCommaSeparatedValue(document.cookie, name);
  }
  function getInitCookie(name) {
    if (!initCookieParsed) {
      initCookieParsed = findCommaSeparatedValues(document.cookie);
    }
    return initCookieParsed.get(name);
  }
  function deleteCookie(name, options) {
    setCookie(name, "", 0, options);
  }
  function areCookiesAuthorized(options) {
    if (document.cookie === void 0 || document.cookie === null) {
      return false;
    }
    try {
      const testCookieName = `dd_cookie_test_${generateUUID()}`;
      const testCookieValue = "test";
      setCookie(testCookieName, testCookieValue, ONE_MINUTE, options);
      const isCookieCorrectlySet = getCookie(testCookieName) === testCookieValue;
      deleteCookie(testCookieName, options);
      return isCookieCorrectlySet;
    } catch (error) {
      display.error(error);
      return false;
    }
  }
  function getCurrentSite() {
    if (getCurrentSiteCache === void 0) {
      const testCookieName = `dd_site_test_${generateUUID()}`;
      const testCookieValue = "test";
      const domainLevels = window.location.hostname.split(".");
      let candidateDomain = domainLevels.pop();
      while (domainLevels.length && !getCookie(testCookieName)) {
        candidateDomain = `${domainLevels.pop()}.${candidateDomain}`;
        setCookie(testCookieName, testCookieValue, ONE_SECOND, { domain: candidateDomain });
      }
      deleteCookie(testCookieName, { domain: candidateDomain });
      getCurrentSiteCache = candidateDomain;
    }
    return getCurrentSiteCache;
  }
  var initCookieParsed, getCurrentSiteCache;
  var init_cookie = __esm({
    "../packages/core/src/browser/cookie.ts"() {
      "use strict";
      init_display();
      init_timeUtils();
      init_stringUtils();
    }
  });

  // ../packages/core/src/domain/session/storeStrategies/sessionStoreStrategy.ts
  var SESSION_STORE_KEY;
  var init_sessionStoreStrategy = __esm({
    "../packages/core/src/domain/session/storeStrategies/sessionStoreStrategy.ts"() {
      "use strict";
      SESSION_STORE_KEY = "_dd_s";
    }
  });

  // ../packages/core/src/tools/utils/polyfills.ts
  function findLast(array, predicate) {
    for (let i = array.length - 1; i >= 0; i -= 1) {
      const item = array[i];
      if (predicate(item, i, array)) {
        return item;
      }
    }
    return void 0;
  }
  function objectValues(object) {
    return Object.values(object);
  }
  function objectEntries(object) {
    return Object.entries(object);
  }
  var init_polyfills = __esm({
    "../packages/core/src/tools/utils/polyfills.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/domain/session/sessionConstants.ts
  var SESSION_TIME_OUT_DELAY, SESSION_EXPIRATION_DELAY, SESSION_COOKIE_EXPIRATION_DELAY, SessionPersistence;
  var init_sessionConstants = __esm({
    "../packages/core/src/domain/session/sessionConstants.ts"() {
      "use strict";
      init_timeUtils();
      SESSION_TIME_OUT_DELAY = 4 * ONE_HOUR;
      SESSION_EXPIRATION_DELAY = 15 * ONE_MINUTE;
      SESSION_COOKIE_EXPIRATION_DELAY = ONE_YEAR;
      SessionPersistence = {
        COOKIE: "cookie",
        LOCAL_STORAGE: "local-storage"
      };
    }
  });

  // ../packages/core/src/domain/session/sessionStateValidation.ts
  function isValidSessionString(sessionString) {
    return !!sessionString && (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString));
  }
  var SESSION_ENTRY_REGEXP, SESSION_ENTRY_SEPARATOR;
  var init_sessionStateValidation = __esm({
    "../packages/core/src/domain/session/sessionStateValidation.ts"() {
      "use strict";
      SESSION_ENTRY_REGEXP = /^([a-zA-Z]+)=([a-z0-9-]+)$/;
      SESSION_ENTRY_SEPARATOR = "&";
    }
  });

  // ../packages/core/src/domain/session/sessionState.ts
  function getExpiredSessionState(previousSessionState, configuration) {
    const expiredSessionState = {
      isExpired: EXPIRED
    };
    if (configuration.trackAnonymousUser) {
      if (previousSessionState?.anonymousId) {
        expiredSessionState.anonymousId = previousSessionState?.anonymousId;
      } else {
        expiredSessionState.anonymousId = generateUUID();
      }
    }
    return expiredSessionState;
  }
  function isSessionInNotStartedState(session) {
    return isEmptyObject(session);
  }
  function isSessionStarted(session) {
    return !isSessionInNotStartedState(session);
  }
  function isSessionInExpiredState(session) {
    return session.isExpired !== void 0 || !isActiveSession(session);
  }
  function isActiveSession(sessionState) {
    return (sessionState.created === void 0 || dateNow() - Number(sessionState.created) < SESSION_TIME_OUT_DELAY) && (sessionState.expire === void 0 || dateNow() < Number(sessionState.expire));
  }
  function expandSessionState(session) {
    session.expire = String(dateNow() + SESSION_EXPIRATION_DELAY);
  }
  function toSessionString(session) {
    return objectEntries(session).map(([key, value]) => key === "anonymousId" ? `aid=${value}` : `${key}=${value}`).join(SESSION_ENTRY_SEPARATOR);
  }
  function toSessionState(sessionString) {
    const session = {};
    if (isValidSessionString(sessionString)) {
      sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
        const matches = SESSION_ENTRY_REGEXP.exec(entry);
        if (matches !== null) {
          const [, key, value] = matches;
          if (key === "aid") {
            session.anonymousId = value;
          } else {
            session[key] = value;
          }
        }
      });
    }
    return session;
  }
  var EXPIRED;
  var init_sessionState = __esm({
    "../packages/core/src/domain/session/sessionState.ts"() {
      "use strict";
      init_objectUtils();
      init_polyfills();
      init_timeUtils();
      init_stringUtils();
      init_sessionConstants();
      init_sessionStateValidation();
      EXPIRED = "1";
    }
  });

  // ../packages/core/src/domain/session/oldCookiesMigration.ts
  function tryOldCookiesMigration(cookieStoreStrategy) {
    const sessionString = getInitCookie(SESSION_STORE_KEY);
    if (!sessionString) {
      const oldSessionId = getInitCookie(OLD_SESSION_COOKIE_NAME);
      const oldRumType = getInitCookie(OLD_RUM_COOKIE_NAME);
      const oldLogsType = getInitCookie(OLD_LOGS_COOKIE_NAME);
      const session = {};
      if (oldSessionId) {
        session.id = oldSessionId;
      }
      if (oldLogsType && /^[01]$/.test(oldLogsType)) {
        session[LOGS_SESSION_KEY] = oldLogsType;
      }
      if (oldRumType && /^[012]$/.test(oldRumType)) {
        session[RUM_SESSION_KEY] = oldRumType;
      }
      if (isSessionStarted(session)) {
        expandSessionState(session);
        cookieStoreStrategy.persistSession(session);
      }
    }
  }
  var OLD_SESSION_COOKIE_NAME, OLD_RUM_COOKIE_NAME, OLD_LOGS_COOKIE_NAME, RUM_SESSION_KEY, LOGS_SESSION_KEY;
  var init_oldCookiesMigration = __esm({
    "../packages/core/src/domain/session/oldCookiesMigration.ts"() {
      "use strict";
      init_cookie();
      init_sessionStoreStrategy();
      init_sessionState();
      OLD_SESSION_COOKIE_NAME = "_dd";
      OLD_RUM_COOKIE_NAME = "_dd_r";
      OLD_LOGS_COOKIE_NAME = "_dd_l";
      RUM_SESSION_KEY = "rum";
      LOGS_SESSION_KEY = "logs";
    }
  });

  // ../packages/core/src/domain/session/storeStrategies/sessionInCookie.ts
  function selectCookieStrategy(initConfiguration) {
    const cookieOptions = buildCookieOptions(initConfiguration);
    return areCookiesAuthorized(cookieOptions) ? { type: SessionPersistence.COOKIE, cookieOptions } : void 0;
  }
  function initCookieStrategy(configuration, cookieOptions) {
    const cookieStore = {
      /**
       * Lock strategy allows mitigating issues due to concurrent access to cookie.
       * This issue concerns only chromium browsers and enabling this on firefox increases cookie write failures.
       */
      isLockEnabled: isChromium(),
      persistSession: persistSessionCookie(cookieOptions),
      retrieveSession: retrieveSessionCookie,
      expireSession: (sessionState) => expireSessionCookie(cookieOptions, sessionState, configuration)
    };
    tryOldCookiesMigration(cookieStore);
    return cookieStore;
  }
  function persistSessionCookie(options) {
    return (session) => {
      setCookie(SESSION_STORE_KEY, toSessionString(session), SESSION_EXPIRATION_DELAY, options);
    };
  }
  function expireSessionCookie(options, sessionState, configuration) {
    const expiredSessionState = getExpiredSessionState(sessionState, configuration);
    setCookie(
      SESSION_STORE_KEY,
      toSessionString(expiredSessionState),
      configuration.trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : SESSION_TIME_OUT_DELAY,
      options
    );
  }
  function retrieveSessionCookie() {
    const sessionString = getCookie(SESSION_STORE_KEY);
    const sessionState = toSessionState(sessionString);
    return sessionState;
  }
  function buildCookieOptions(initConfiguration) {
    const cookieOptions = {};
    cookieOptions.secure = !!initConfiguration.useSecureSessionCookie || !!initConfiguration.usePartitionedCrossSiteSessionCookie;
    cookieOptions.crossSite = !!initConfiguration.usePartitionedCrossSiteSessionCookie;
    cookieOptions.partitioned = !!initConfiguration.usePartitionedCrossSiteSessionCookie;
    if (initConfiguration.trackSessionAcrossSubdomains) {
      cookieOptions.domain = getCurrentSite();
    }
    return cookieOptions;
  }
  var init_sessionInCookie = __esm({
    "../packages/core/src/domain/session/storeStrategies/sessionInCookie.ts"() {
      "use strict";
      init_browserDetection();
      init_cookie();
      init_oldCookiesMigration();
      init_sessionConstants();
      init_sessionState();
      init_sessionStoreStrategy();
    }
  });

  // ../packages/core/src/domain/session/storeStrategies/sessionInLocalStorage.ts
  function selectLocalStorageStrategy() {
    try {
      const id = generateUUID();
      const testKey = `${LOCAL_STORAGE_TEST_KEY}${id}`;
      localStorage.setItem(testKey, id);
      const retrievedId = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      return id === retrievedId ? { type: SessionPersistence.LOCAL_STORAGE } : void 0;
    } catch {
      return void 0;
    }
  }
  function initLocalStorageStrategy(configuration) {
    return {
      isLockEnabled: false,
      persistSession: persistInLocalStorage,
      retrieveSession: retrieveSessionFromLocalStorage,
      expireSession: (sessionState) => expireSessionFromLocalStorage(sessionState, configuration)
    };
  }
  function persistInLocalStorage(sessionState) {
    localStorage.setItem(SESSION_STORE_KEY, toSessionString(sessionState));
  }
  function retrieveSessionFromLocalStorage() {
    const sessionString = localStorage.getItem(SESSION_STORE_KEY);
    return toSessionState(sessionString);
  }
  function expireSessionFromLocalStorage(previousSessionState, configuration) {
    persistInLocalStorage(getExpiredSessionState(previousSessionState, configuration));
  }
  var LOCAL_STORAGE_TEST_KEY;
  var init_sessionInLocalStorage = __esm({
    "../packages/core/src/domain/session/storeStrategies/sessionInLocalStorage.ts"() {
      "use strict";
      init_stringUtils();
      init_sessionConstants();
      init_sessionState();
      init_sessionStoreStrategy();
      LOCAL_STORAGE_TEST_KEY = "_dd_test_";
    }
  });

  // ../packages/core/src/domain/session/sessionStoreOperations.ts
  function processSessionStoreOperations(operations, sessionStoreStrategy, numberOfRetries = 0) {
    const { isLockEnabled, persistSession, expireSession } = sessionStoreStrategy;
    const persistWithLock = (session) => persistSession({ ...session, lock: currentLock });
    const retrieveStore = () => {
      const session = sessionStoreStrategy.retrieveSession();
      const lock = session.lock;
      if (session.lock) {
        delete session.lock;
      }
      return {
        session,
        lock
      };
    };
    if (!ongoingOperations) {
      ongoingOperations = operations;
    }
    if (operations !== ongoingOperations) {
      bufferedOperations.push(operations);
      return;
    }
    if (isLockEnabled && numberOfRetries >= LOCK_MAX_TRIES) {
      next(sessionStoreStrategy);
      return;
    }
    let currentLock;
    let currentStore = retrieveStore();
    if (isLockEnabled) {
      if (currentStore.lock) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries);
        return;
      }
      currentLock = generateUUID();
      persistWithLock(currentStore.session);
      currentStore = retrieveStore();
      if (currentStore.lock !== currentLock) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries);
        return;
      }
    }
    let processedSession = operations.process(currentStore.session);
    if (isLockEnabled) {
      currentStore = retrieveStore();
      if (currentStore.lock !== currentLock) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries);
        return;
      }
    }
    if (processedSession) {
      if (isSessionInExpiredState(processedSession)) {
        expireSession(processedSession);
      } else {
        expandSessionState(processedSession);
        if (isLockEnabled) {
          persistWithLock(processedSession);
        } else {
          persistSession(processedSession);
        }
      }
    }
    if (isLockEnabled) {
      if (!(processedSession && isSessionInExpiredState(processedSession))) {
        currentStore = retrieveStore();
        if (currentStore.lock !== currentLock) {
          retryLater(operations, sessionStoreStrategy, numberOfRetries);
          return;
        }
        persistSession(currentStore.session);
        processedSession = currentStore.session;
      }
    }
    operations.after?.(processedSession || currentStore.session);
    next(sessionStoreStrategy);
  }
  function retryLater(operations, sessionStore, currentNumberOfRetries) {
    setTimeout(() => {
      processSessionStoreOperations(operations, sessionStore, currentNumberOfRetries + 1);
    }, LOCK_RETRY_DELAY);
  }
  function next(sessionStore) {
    ongoingOperations = void 0;
    const nextOperations = bufferedOperations.shift();
    if (nextOperations) {
      processSessionStoreOperations(nextOperations, sessionStore);
    }
  }
  var LOCK_RETRY_DELAY, LOCK_MAX_TRIES, bufferedOperations, ongoingOperations;
  var init_sessionStoreOperations = __esm({
    "../packages/core/src/domain/session/sessionStoreOperations.ts"() {
      "use strict";
      init_timer();
      init_stringUtils();
      init_sessionState();
      LOCK_RETRY_DELAY = 10;
      LOCK_MAX_TRIES = 100;
      bufferedOperations = [];
    }
  });

  // ../packages/core/src/domain/session/sessionStore.ts
  function selectSessionStoreStrategyType(initConfiguration) {
    switch (initConfiguration.sessionPersistence) {
      case SessionPersistence.COOKIE:
        return selectCookieStrategy(initConfiguration);
      case SessionPersistence.LOCAL_STORAGE:
        return selectLocalStorageStrategy();
      case void 0: {
        let sessionStoreStrategyType = selectCookieStrategy(initConfiguration);
        if (!sessionStoreStrategyType && initConfiguration.allowFallbackToLocalStorage) {
          sessionStoreStrategyType = selectLocalStorageStrategy();
        }
        return sessionStoreStrategyType;
      }
      default:
        display.error(`Invalid session persistence '${String(initConfiguration.sessionPersistence)}'`);
    }
  }
  function startSessionStore(sessionStoreStrategyType, configuration, productKey, computeSessionState2) {
    const renewObservable = new Observable();
    const expireObservable = new Observable();
    const sessionStateUpdateObservable = new Observable();
    const sessionStoreStrategy = sessionStoreStrategyType.type === SessionPersistence.COOKIE ? initCookieStrategy(configuration, sessionStoreStrategyType.cookieOptions) : initLocalStorageStrategy(configuration);
    const { expireSession } = sessionStoreStrategy;
    const watchSessionTimeoutId = setInterval(watchSession, STORAGE_POLL_DELAY);
    let sessionCache;
    startSession();
    const { throttled: throttledExpandOrRenewSession, cancel: cancelExpandOrRenewSession } = throttle(() => {
      processSessionStoreOperations(
        {
          process: (sessionState) => {
            if (isSessionInNotStartedState(sessionState)) {
              return;
            }
            const synchronizedSession = synchronizeSession(sessionState);
            expandOrRenewSessionState(synchronizedSession);
            return synchronizedSession;
          },
          after: (sessionState) => {
            if (isSessionStarted(sessionState) && !hasSessionInCache()) {
              renewSessionInCache(sessionState);
            }
            sessionCache = sessionState;
          }
        },
        sessionStoreStrategy
      );
    }, STORAGE_POLL_DELAY);
    function expandSession() {
      processSessionStoreOperations(
        {
          process: (sessionState) => hasSessionInCache() ? synchronizeSession(sessionState) : void 0
        },
        sessionStoreStrategy
      );
    }
    function watchSession() {
      processSessionStoreOperations(
        {
          process: (sessionState) => isSessionInExpiredState(sessionState) ? getExpiredSessionState(sessionState, configuration) : void 0,
          after: synchronizeSession
        },
        sessionStoreStrategy
      );
    }
    function synchronizeSession(sessionState) {
      if (isSessionInExpiredState(sessionState)) {
        sessionState = getExpiredSessionState(sessionState, configuration);
      }
      if (hasSessionInCache()) {
        if (isSessionInCacheOutdated(sessionState)) {
          expireSessionInCache();
        } else {
          sessionStateUpdateObservable.notify({ previousState: sessionCache, newState: sessionState });
          sessionCache = sessionState;
        }
      }
      return sessionState;
    }
    function startSession() {
      processSessionStoreOperations(
        {
          process: (sessionState) => {
            if (isSessionInNotStartedState(sessionState)) {
              return getExpiredSessionState(sessionState, configuration);
            }
          },
          after: (sessionState) => {
            sessionCache = sessionState;
          }
        },
        sessionStoreStrategy
      );
    }
    function expandOrRenewSessionState(sessionState) {
      if (isSessionInNotStartedState(sessionState)) {
        return false;
      }
      const { trackingType, isTracked } = computeSessionState2(sessionState[productKey]);
      sessionState[productKey] = trackingType;
      delete sessionState.isExpired;
      if (isTracked && !sessionState.id) {
        sessionState.id = generateUUID();
        sessionState.created = String(dateNow());
      }
    }
    function hasSessionInCache() {
      return sessionCache[productKey] !== void 0;
    }
    function isSessionInCacheOutdated(sessionState) {
      return sessionCache.id !== sessionState.id || sessionCache[productKey] !== sessionState[productKey];
    }
    function expireSessionInCache() {
      sessionCache = getExpiredSessionState(sessionCache, configuration);
      expireObservable.notify();
    }
    function renewSessionInCache(sessionState) {
      sessionCache = sessionState;
      renewObservable.notify();
    }
    function updateSessionState(partialSessionState) {
      processSessionStoreOperations(
        {
          process: (sessionState) => ({ ...sessionState, ...partialSessionState }),
          after: synchronizeSession
        },
        sessionStoreStrategy
      );
    }
    return {
      expandOrRenewSession: throttledExpandOrRenewSession,
      expandSession,
      getSession: () => sessionCache,
      renewObservable,
      expireObservable,
      sessionStateUpdateObservable,
      restartSession: startSession,
      expire: () => {
        cancelExpandOrRenewSession();
        expireSession(sessionCache);
        synchronizeSession(getExpiredSessionState(sessionCache, configuration));
      },
      stop: () => {
        clearInterval(watchSessionTimeoutId);
      },
      updateSessionState
    };
  }
  var STORAGE_POLL_DELAY;
  var init_sessionStore = __esm({
    "../packages/core/src/domain/session/sessionStore.ts"() {
      "use strict";
      init_timer();
      init_observable();
      init_timeUtils();
      init_functionUtils();
      init_stringUtils();
      init_display();
      init_sessionInCookie();
      init_sessionState();
      init_sessionInLocalStorage();
      init_sessionStoreOperations();
      init_sessionConstants();
      STORAGE_POLL_DELAY = ONE_SECOND;
    }
  });

  // ../packages/core/src/domain/trackingConsent.ts
  function createTrackingConsentState(currentConsent) {
    const observable = new Observable();
    return {
      tryToInit(trackingConsent) {
        if (!currentConsent) {
          currentConsent = trackingConsent;
        }
      },
      update(trackingConsent) {
        currentConsent = trackingConsent;
        observable.notify();
      },
      isGranted() {
        return currentConsent === TrackingConsent.GRANTED;
      },
      observable
    };
  }
  var TrackingConsent;
  var init_trackingConsent = __esm({
    "../packages/core/src/domain/trackingConsent.ts"() {
      "use strict";
      init_observable();
      TrackingConsent = {
        GRANTED: "granted",
        NOT_GRANTED: "not-granted"
      };
    }
  });

  // ../packages/core/src/tools/serialisation/jsonStringify.ts
  function jsonStringify(value, replacer, space) {
    if (typeof value !== "object" || value === null) {
      return JSON.stringify(value);
    }
    const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype);
    const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype);
    const restoreValuePrototypeToJson = detachToJsonMethod(Object.getPrototypeOf(value));
    const restoreValueToJson = detachToJsonMethod(value);
    try {
      return JSON.stringify(value, replacer, space);
    } catch {
      return "<error: unable to serialize object>";
    } finally {
      restoreObjectPrototypeToJson();
      restoreArrayPrototypeToJson();
      restoreValuePrototypeToJson();
      restoreValueToJson();
    }
  }
  function detachToJsonMethod(value) {
    const object = value;
    const objectToJson = object.toJSON;
    if (objectToJson) {
      delete object.toJSON;
      return () => {
        object.toJSON = objectToJson;
      };
    }
    return noop;
  }
  var init_jsonStringify = __esm({
    "../packages/core/src/tools/serialisation/jsonStringify.ts"() {
      "use strict";
      init_functionUtils();
    }
  });

  // ../packages/core/src/tools/utils/urlPolyfill.ts
  function normalizeUrl(url) {
    return buildUrl(url, location.href).href;
  }
  function isValidUrl(url) {
    try {
      return !!buildUrl(url);
    } catch {
      return false;
    }
  }
  function getPathName(url) {
    const pathname = buildUrl(url).pathname;
    return pathname[0] === "/" ? pathname : `/${pathname}`;
  }
  function buildUrl(url, base) {
    const supportedURL = getSupportedUrl();
    if (supportedURL) {
      try {
        return base !== void 0 ? new supportedURL(url, base) : new supportedURL(url);
      } catch (error) {
        throw new Error(`Failed to construct URL: ${String(error)} ${jsonStringify({ url, base })}`);
      }
    }
    if (base === void 0 && !/:/.test(url)) {
      throw new Error(`Invalid URL: '${url}'`);
    }
    let doc = document;
    const anchorElement = doc.createElement("a");
    if (base !== void 0) {
      doc = document.implementation.createHTMLDocument("");
      const baseElement = doc.createElement("base");
      baseElement.href = base;
      doc.head.appendChild(baseElement);
      doc.body.appendChild(anchorElement);
    }
    anchorElement.href = url;
    return anchorElement;
  }
  function getSupportedUrl() {
    if (isURLSupported === void 0) {
      try {
        const url = new originalURL("http://test/path");
        isURLSupported = url.href === "http://test/path";
      } catch {
        isURLSupported = false;
      }
    }
    return isURLSupported ? originalURL : void 0;
  }
  var originalURL, isURLSupported;
  var init_urlPolyfill = __esm({
    "../packages/core/src/tools/utils/urlPolyfill.ts"() {
      "use strict";
      init_jsonStringify();
      originalURL = URL;
    }
  });

  // ../packages/core/src/domain/configuration/intakeSites.ts
  var INTAKE_SITE_STAGING, INTAKE_SITE_FED_STAGING, INTAKE_SITE_US1, INTAKE_SITE_EU1, INTAKE_SITE_US1_FED, PCI_INTAKE_HOST_US1, INTAKE_URL_PARAMETERS;
  var init_intakeSites = __esm({
    "../packages/core/src/domain/configuration/intakeSites.ts"() {
      "use strict";
      INTAKE_SITE_STAGING = "datad0g.com";
      INTAKE_SITE_FED_STAGING = "dd0g-gov.com";
      INTAKE_SITE_US1 = "datadoghq.com";
      INTAKE_SITE_EU1 = "datadoghq.eu";
      INTAKE_SITE_US1_FED = "ddog-gov.com";
      PCI_INTAKE_HOST_US1 = "pci.browser-intake-datadoghq.com";
      INTAKE_URL_PARAMETERS = ["ddsource", "ddtags"];
    }
  });

  // ../packages/core/src/domain/configuration/endpointBuilder.ts
  function createEndpointBuilder(initConfiguration, trackType, configurationTags) {
    const buildUrlWithParameters = createEndpointUrlWithParametersBuilder(initConfiguration, trackType);
    return {
      build(api, payload) {
        const parameters = buildEndpointParameters(initConfiguration, trackType, configurationTags, api, payload);
        return buildUrlWithParameters(parameters);
      },
      urlPrefix: buildUrlWithParameters(""),
      trackType
    };
  }
  function createEndpointUrlWithParametersBuilder(initConfiguration, trackType) {
    const path = `/api/v2/${trackType}`;
    const proxy = initConfiguration.proxy;
    if (typeof proxy === "string") {
      const normalizedProxyUrl = normalizeUrl(proxy);
      return (parameters) => `${normalizedProxyUrl}?ddforward=${encodeURIComponent(`${path}?${parameters}`)}`;
    }
    if (typeof proxy === "function") {
      return (parameters) => proxy({ path, parameters });
    }
    const host = buildEndpointHost(trackType, initConfiguration);
    return (parameters) => `https://${host}${path}?${parameters}`;
  }
  function buildEndpointHost(trackType, initConfiguration) {
    const { site = INTAKE_SITE_US1, internalAnalyticsSubdomain } = initConfiguration;
    if (trackType === "logs" && initConfiguration.usePciIntake && site === INTAKE_SITE_US1) {
      return PCI_INTAKE_HOST_US1;
    }
    if (internalAnalyticsSubdomain && site === INTAKE_SITE_US1) {
      return `${internalAnalyticsSubdomain}.${INTAKE_SITE_US1}`;
    }
    if (site === INTAKE_SITE_FED_STAGING) {
      return `http-intake.logs.${site}`;
    }
    const domainParts = site.split(".");
    const extension = domainParts.pop();
    return `browser-intake-${domainParts.join("-")}.${extension}`;
  }
  function buildEndpointParameters({ clientToken, internalAnalyticsSubdomain }, trackType, configurationTags, api, { retry, encoding }) {
    const tags = [`sdk_version:${"env"}`, `api:${api}`].concat(configurationTags);
    if (retry) {
      tags.push(`retry_count:${retry.count}`, `retry_after:${retry.lastFailureStatus}`);
    }
    const parameters = [
      "ddsource=browser",
      `ddtags=${encodeURIComponent(tags.join(","))}`,
      `dd-api-key=${clientToken}`,
      `dd-evp-origin-version=${encodeURIComponent("env")}`,
      "dd-evp-origin=browser",
      `dd-request-id=${generateUUID()}`
    ];
    if (encoding) {
      parameters.push(`dd-evp-encoding=${encoding}`);
    }
    if (trackType === "rum") {
      parameters.push(`batch_time=${timeStampNow()}`);
    }
    if (internalAnalyticsSubdomain) {
      parameters.reverse();
    }
    return parameters.join("&");
  }
  var init_endpointBuilder = __esm({
    "../packages/core/src/domain/configuration/endpointBuilder.ts"() {
      "use strict";
      init_timeUtils();
      init_urlPolyfill();
      init_stringUtils();
      init_intakeSites();
    }
  });

  // ../packages/core/src/domain/configuration/tags.ts
  function buildTags(configuration) {
    const { env, service, version, datacenter } = configuration;
    const tags = [];
    if (env) {
      tags.push(buildTag("env", env));
    }
    if (service) {
      tags.push(buildTag("service", service));
    }
    if (version) {
      tags.push(buildTag("version", version));
    }
    if (datacenter) {
      tags.push(buildTag("datacenter", datacenter));
    }
    return tags;
  }
  function buildTag(key, rawValue) {
    const valueSizeLimit = TAG_SIZE_LIMIT - key.length - 1;
    if (rawValue.length > valueSizeLimit || hasForbiddenCharacters(rawValue)) {
      display.warn(
        `${key} value doesn't meet tag requirements and will be sanitized. ${MORE_DETAILS} ${DOCS_ORIGIN}/getting_started/tagging/#defining-tags`
      );
    }
    const sanitizedValue = rawValue.replace(/,/g, "_");
    return `${key}:${sanitizedValue}`;
  }
  function hasForbiddenCharacters(rawValue) {
    if (!supportUnicodePropertyEscapes()) {
      return false;
    }
    return new RegExp("[^\\p{Ll}\\p{Lo}0-9_:./-]", "u").test(rawValue);
  }
  function supportUnicodePropertyEscapes() {
    try {
      new RegExp("[\\p{Ll}]", "u");
      return true;
    } catch {
      return false;
    }
  }
  var TAG_SIZE_LIMIT;
  var init_tags = __esm({
    "../packages/core/src/domain/configuration/tags.ts"() {
      "use strict";
      init_display();
      TAG_SIZE_LIMIT = 200;
    }
  });

  // ../packages/core/src/domain/configuration/transportConfiguration.ts
  function computeTransportConfiguration(initConfiguration) {
    const site = initConfiguration.site || INTAKE_SITE_US1;
    const tags = buildTags(initConfiguration);
    const endpointBuilders = computeEndpointBuilders(initConfiguration, tags);
    const replicaConfiguration = computeReplicaConfiguration(initConfiguration, tags);
    return {
      replica: replicaConfiguration,
      site,
      ...endpointBuilders
    };
  }
  function computeEndpointBuilders(initConfiguration, tags) {
    return {
      logsEndpointBuilder: createEndpointBuilder(initConfiguration, "logs", tags),
      rumEndpointBuilder: createEndpointBuilder(initConfiguration, "rum", tags),
      sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, "replay", tags)
    };
  }
  function computeReplicaConfiguration(initConfiguration, tags) {
    if (!initConfiguration.replica) {
      return;
    }
    const replicaConfiguration = {
      ...initConfiguration,
      site: INTAKE_SITE_US1,
      clientToken: initConfiguration.replica.clientToken
    };
    const replicaEndpointBuilders = {
      logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, "logs", tags),
      rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, "rum", tags)
    };
    return { applicationId: initConfiguration.replica.applicationId, ...replicaEndpointBuilders };
  }
  function isIntakeUrl(url) {
    return INTAKE_URL_PARAMETERS.every((param) => url.includes(param));
  }
  var init_transportConfiguration = __esm({
    "../packages/core/src/domain/configuration/transportConfiguration.ts"() {
      "use strict";
      init_endpointBuilder();
      init_tags();
      init_intakeSites();
    }
  });

  // ../packages/core/src/domain/configuration/configuration.ts
  function isString(tag, tagName) {
    if (tag !== void 0 && tag !== null && typeof tag !== "string") {
      display.error(`${tagName} must be defined as a string`);
      return false;
    }
    return true;
  }
  function isDatadogSite(site) {
    if (site && typeof site === "string" && !/(datadog|ddog|datad0g|dd0g)/.test(site)) {
      display.error(`Site should be a valid Datadog site. ${MORE_DETAILS} ${DOCS_ORIGIN}/getting_started/site/.`);
      return false;
    }
    return true;
  }
  function isSampleRate(sampleRate, name) {
    if (sampleRate !== void 0 && !isPercentage(sampleRate)) {
      display.error(`${name} Sample Rate should be a number between 0 and 100`);
      return false;
    }
    return true;
  }
  function validateAndBuildConfiguration(initConfiguration) {
    if (!initConfiguration || !initConfiguration.clientToken) {
      display.error("Client Token is not configured, we will not send any data.");
      return;
    }
    if (!isDatadogSite(initConfiguration.site) || !isSampleRate(initConfiguration.sessionSampleRate, "Session") || !isSampleRate(initConfiguration.telemetrySampleRate, "Telemetry") || !isSampleRate(initConfiguration.telemetryConfigurationSampleRate, "Telemetry Configuration") || !isSampleRate(initConfiguration.telemetryUsageSampleRate, "Telemetry Usage") || !isString(initConfiguration.version, "Version") || !isString(initConfiguration.env, "Env") || !isString(initConfiguration.service, "Service")) {
      return;
    }
    if (initConfiguration.trackingConsent !== void 0 && !objectHasValue(TrackingConsent, initConfiguration.trackingConsent)) {
      display.error('Tracking Consent should be either "granted" or "not-granted"');
      return;
    }
    return {
      beforeSend: initConfiguration.beforeSend && catchUserErrors(initConfiguration.beforeSend, "beforeSend threw an error:"),
      sessionStoreStrategyType: selectSessionStoreStrategyType(initConfiguration),
      sessionSampleRate: initConfiguration.sessionSampleRate ?? 100,
      telemetrySampleRate: initConfiguration.telemetrySampleRate ?? 20,
      telemetryConfigurationSampleRate: initConfiguration.telemetryConfigurationSampleRate ?? 5,
      telemetryUsageSampleRate: initConfiguration.telemetryUsageSampleRate ?? 5,
      service: initConfiguration.service || void 0,
      silentMultipleInit: !!initConfiguration.silentMultipleInit,
      allowUntrustedEvents: !!initConfiguration.allowUntrustedEvents,
      trackingConsent: initConfiguration.trackingConsent ?? TrackingConsent.GRANTED,
      trackAnonymousUser: initConfiguration.trackAnonymousUser ?? true,
      storeContextsAcrossPages: !!initConfiguration.storeContextsAcrossPages,
      /**
       * beacon payload max queue size implementation is 64kb
       * ensure that we leave room for logs, rum and potential other users
       */
      batchBytesLimit: 16 * ONE_KIBI_BYTE,
      eventRateLimiterThreshold: 3e3,
      maxTelemetryEventsPerPage: 15,
      /**
       * flush automatically, aim to be lower than ALB connection timeout
       * to maximize connection reuse.
       */
      flushTimeout: 30 * ONE_SECOND,
      /**
       * Logs intake limit
       */
      batchMessagesLimit: 50,
      messageBytesLimit: 256 * ONE_KIBI_BYTE,
      ...computeTransportConfiguration(initConfiguration)
    };
  }
  function serializeConfiguration(initConfiguration) {
    return {
      session_sample_rate: initConfiguration.sessionSampleRate,
      telemetry_sample_rate: initConfiguration.telemetrySampleRate,
      telemetry_configuration_sample_rate: initConfiguration.telemetryConfigurationSampleRate,
      telemetry_usage_sample_rate: initConfiguration.telemetryUsageSampleRate,
      use_before_send: !!initConfiguration.beforeSend,
      use_partitioned_cross_site_session_cookie: initConfiguration.usePartitionedCrossSiteSessionCookie,
      use_secure_session_cookie: initConfiguration.useSecureSessionCookie,
      use_proxy: !!initConfiguration.proxy,
      silent_multiple_init: initConfiguration.silentMultipleInit,
      track_session_across_subdomains: initConfiguration.trackSessionAcrossSubdomains,
      track_anonymous_user: initConfiguration.trackAnonymousUser,
      session_persistence: initConfiguration.sessionPersistence,
      allow_fallback_to_local_storage: !!initConfiguration.allowFallbackToLocalStorage,
      store_contexts_across_pages: !!initConfiguration.storeContextsAcrossPages,
      allow_untrusted_events: !!initConfiguration.allowUntrustedEvents,
      tracking_consent: initConfiguration.trackingConsent
    };
  }
  var DefaultPrivacyLevel, TraceContextInjection;
  var init_configuration = __esm({
    "../packages/core/src/domain/configuration/configuration.ts"() {
      "use strict";
      init_catchUserErrors();
      init_display();
      init_timeUtils();
      init_numberUtils();
      init_byteUtils();
      init_objectUtils();
      init_sessionStore();
      init_trackingConsent();
      init_transportConfiguration();
      DefaultPrivacyLevel = {
        ALLOW: "allow",
        MASK: "mask",
        MASK_USER_INPUT: "mask-user-input"
      };
      TraceContextInjection = {
        ALL: "all",
        SAMPLED: "sampled"
      };
    }
  });

  // ../packages/core/src/domain/configuration/index.ts
  var init_configuration2 = __esm({
    "../packages/core/src/domain/configuration/index.ts"() {
      "use strict";
      init_configuration();
      init_endpointBuilder();
      init_intakeSites();
      init_transportConfiguration();
    }
  });

  // ../packages/core/src/tools/experimentalFeatures.ts
  function initFeatureFlags(enableExperimentalFeatures) {
    if (Array.isArray(enableExperimentalFeatures)) {
      addExperimentalFeatures(
        enableExperimentalFeatures.filter(
          (flag) => objectHasValue(ExperimentalFeature, flag)
        )
      );
    }
  }
  function addExperimentalFeatures(enabledFeatures) {
    enabledFeatures.forEach((flag) => {
      enabledExperimentalFeatures.add(flag);
    });
  }
  function isExperimentalFeatureEnabled(featureName) {
    return enabledExperimentalFeatures.has(featureName);
  }
  function getExperimentalFeatures() {
    return enabledExperimentalFeatures;
  }
  var ExperimentalFeature, enabledExperimentalFeatures;
  var init_experimentalFeatures = __esm({
    "../packages/core/src/tools/experimentalFeatures.ts"() {
      "use strict";
      init_objectUtils();
      ExperimentalFeature = /* @__PURE__ */ ((ExperimentalFeature2) => {
        ExperimentalFeature2["WRITABLE_RESOURCE_GRAPHQL"] = "writable_resource_graphql";
        ExperimentalFeature2["MISSING_URL_CONTEXT_TELEMETRY"] = "missing_url_context_telemetry";
        return ExperimentalFeature2;
      })(ExperimentalFeature || {});
      enabledExperimentalFeatures = /* @__PURE__ */ new Set();
    }
  });

  // ../packages/core/src/tools/stackTrace/computeStackTrace.ts
  function computeStackTrace(ex) {
    const stack = [];
    let stackProperty = tryToGetString(ex, "stack");
    const exString = String(ex);
    if (stackProperty && stackProperty.startsWith(exString)) {
      stackProperty = stackProperty.slice(exString.length);
    }
    if (stackProperty) {
      stackProperty.split("\n").forEach((line) => {
        const stackFrame = parseChromeLine(line) || parseChromeAnonymousLine(line) || parseWinLine(line) || parseGeckoLine(line);
        if (stackFrame) {
          if (!stackFrame.func && stackFrame.line) {
            stackFrame.func = UNKNOWN_FUNCTION;
          }
          stack.push(stackFrame);
        }
      });
    }
    return {
      message: tryToGetString(ex, "message"),
      name: tryToGetString(ex, "name"),
      stack
    };
  }
  function parseChromeLine(line) {
    const parts = CHROME_LINE_RE.exec(line);
    if (!parts) {
      return;
    }
    const isNative = parts[2] && parts[2].indexOf("native") === 0;
    const isEval = parts[2] && parts[2].indexOf("eval") === 0;
    const submatch = CHROME_EVAL_RE.exec(parts[2]);
    if (isEval && submatch) {
      parts[2] = submatch[1];
      parts[3] = submatch[2];
      parts[4] = submatch[3];
    }
    return {
      args: isNative ? [parts[2]] : [],
      column: parts[4] ? +parts[4] : void 0,
      func: parts[1] || UNKNOWN_FUNCTION,
      line: parts[3] ? +parts[3] : void 0,
      url: !isNative ? parts[2] : void 0
    };
  }
  function parseChromeAnonymousLine(line) {
    const parts = CHROME_ANONYMOUS_FUNCTION_RE.exec(line);
    if (!parts) {
      return;
    }
    return {
      args: [],
      column: parts[3] ? +parts[3] : void 0,
      func: UNKNOWN_FUNCTION,
      line: parts[2] ? +parts[2] : void 0,
      url: parts[1]
    };
  }
  function parseWinLine(line) {
    const parts = WINJS_LINE_RE.exec(line);
    if (!parts) {
      return;
    }
    return {
      args: [],
      column: parts[4] ? +parts[4] : void 0,
      func: parts[1] || UNKNOWN_FUNCTION,
      line: +parts[3],
      url: parts[2]
    };
  }
  function parseGeckoLine(line) {
    const parts = GECKO_LINE_RE.exec(line);
    if (!parts) {
      return;
    }
    const isEval = parts[3] && parts[3].indexOf(" > eval") > -1;
    const submatch = GECKO_EVAL_RE.exec(parts[3]);
    if (isEval && submatch) {
      parts[3] = submatch[1];
      parts[4] = submatch[2];
      parts[5] = void 0;
    }
    return {
      args: parts[2] ? parts[2].split(",") : [],
      column: parts[5] ? +parts[5] : void 0,
      func: parts[1] || UNKNOWN_FUNCTION,
      line: parts[4] ? +parts[4] : void 0,
      url: parts[3]
    };
  }
  function tryToGetString(candidate, property) {
    if (typeof candidate !== "object" || !candidate || !(property in candidate)) {
      return void 0;
    }
    const value = candidate[property];
    return typeof value === "string" ? value : void 0;
  }
  function computeStackTraceFromOnErrorMessage(messageObj, url, line, column) {
    const stack = [{ url, column, line }];
    const { name, message } = tryToParseMessage(messageObj);
    return {
      name,
      message,
      stack
    };
  }
  function tryToParseMessage(messageObj) {
    let name;
    let message;
    if ({}.toString.call(messageObj) === "[object String]") {
      ;
      [, name, message] = ERROR_TYPES_RE.exec(messageObj);
    }
    return { name, message };
  }
  var UNKNOWN_FUNCTION, fileUrl, filePosition, CHROME_LINE_RE, CHROME_EVAL_RE, CHROME_ANONYMOUS_FUNCTION_RE, WINJS_LINE_RE, GECKO_LINE_RE, GECKO_EVAL_RE, ERROR_TYPES_RE;
  var init_computeStackTrace = __esm({
    "../packages/core/src/tools/stackTrace/computeStackTrace.ts"() {
      "use strict";
      UNKNOWN_FUNCTION = "?";
      fileUrl = "((?:file|https?|blob|chrome-extension|electron|native|eval|webpack|snippet|<anonymous>|\\w+\\.|\\/).*?)";
      filePosition = "(?::(\\d+))";
      CHROME_LINE_RE = new RegExp(`^\\s*at (.*?) ?\\(${fileUrl}${filePosition}?${filePosition}?\\)?\\s*$`, "i");
      CHROME_EVAL_RE = new RegExp(`\\((\\S*)${filePosition}${filePosition}\\)`);
      CHROME_ANONYMOUS_FUNCTION_RE = new RegExp(`^\\s*at ?${fileUrl}${filePosition}?${filePosition}??\\s*$`, "i");
      WINJS_LINE_RE = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
      GECKO_LINE_RE = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|capacitor|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i;
      GECKO_EVAL_RE = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
      ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?([\s\S]*)$/;
    }
  });

  // ../packages/core/src/tools/stackTrace/handlingStack.ts
  function createHandlingStack(type) {
    const internalFramesToSkip = 2;
    const error = new Error(type);
    error.name = "HandlingStack";
    let formattedStack;
    callMonitored(() => {
      const stackTrace = computeStackTrace(error);
      stackTrace.stack = stackTrace.stack.slice(internalFramesToSkip);
      formattedStack = toStackTraceString(stackTrace);
    });
    return formattedStack;
  }
  function toStackTraceString(stack) {
    let result = formatErrorMessage(stack);
    stack.stack.forEach((frame) => {
      const func = frame.func === "?" ? "<anonymous>" : frame.func;
      const args = frame.args && frame.args.length > 0 ? `(${frame.args.join(", ")})` : "";
      const line = frame.line ? `:${frame.line}` : "";
      const column = frame.line && frame.column ? `:${frame.column}` : "";
      result += `
  at ${func}${args} @ ${frame.url}${line}${column}`;
    });
    return result;
  }
  function formatErrorMessage(stack) {
    return `${stack.name || "Error"}: ${stack.message}`;
  }
  var init_handlingStack = __esm({
    "../packages/core/src/tools/stackTrace/handlingStack.ts"() {
      "use strict";
      init_monitor();
      init_computeStackTrace();
    }
  });

  // ../packages/core/src/tools/instrumentMethod.ts
  function instrumentMethod(targetPrototype, method, onPreCall, { computeHandlingStack } = {}) {
    let original = targetPrototype[method];
    if (typeof original !== "function") {
      if (method in targetPrototype && method.startsWith("on")) {
        original = noop;
      } else {
        return { stop: noop };
      }
    }
    let stopped = false;
    const instrumentation = function() {
      if (stopped) {
        return original.apply(this, arguments);
      }
      const parameters = Array.from(arguments);
      let postCallCallback;
      callMonitored(onPreCall, null, [
        {
          target: this,
          parameters,
          onPostCall: (callback) => {
            postCallCallback = callback;
          },
          handlingStack: computeHandlingStack ? createHandlingStack("instrumented method") : void 0
        }
      ]);
      const result = original.apply(this, parameters);
      if (postCallCallback) {
        callMonitored(postCallCallback, null, [result]);
      }
      return result;
    };
    targetPrototype[method] = instrumentation;
    return {
      stop: () => {
        stopped = true;
        if (targetPrototype[method] === instrumentation) {
          targetPrototype[method] = original;
        }
      }
    };
  }
  function instrumentSetter(targetPrototype, property, after) {
    const originalDescriptor = Object.getOwnPropertyDescriptor(targetPrototype, property);
    if (!originalDescriptor || !originalDescriptor.set || !originalDescriptor.configurable) {
      return { stop: noop };
    }
    const stoppedInstrumentation = noop;
    let instrumentation = (target, value) => {
      setTimeout(() => {
        if (instrumentation !== stoppedInstrumentation) {
          after(target, value);
        }
      }, 0);
    };
    const instrumentationWrapper = function(value) {
      originalDescriptor.set.call(this, value);
      instrumentation(this, value);
    };
    Object.defineProperty(targetPrototype, property, {
      set: instrumentationWrapper
    });
    return {
      stop: () => {
        if (Object.getOwnPropertyDescriptor(targetPrototype, property)?.set === instrumentationWrapper) {
          Object.defineProperty(targetPrototype, property, originalDescriptor);
        }
        instrumentation = stoppedInstrumentation;
      }
    };
  }
  var init_instrumentMethod = __esm({
    "../packages/core/src/tools/instrumentMethod.ts"() {
      "use strict";
      init_timer();
      init_monitor();
      init_functionUtils();
      init_handlingStack();
    }
  });

  // ../packages/core/src/tools/serialisation/sanitize.ts
  function sanitize(source, maxCharacterCount = SANITIZE_DEFAULT_MAX_CHARACTER_COUNT) {
    const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype);
    const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype);
    const containerQueue = [];
    const visitedObjectsWithPath = /* @__PURE__ */ new WeakMap();
    const sanitizedData = sanitizeProcessor(
      source,
      JSON_PATH_ROOT_ELEMENT,
      void 0,
      containerQueue,
      visitedObjectsWithPath
    );
    const serializedSanitizedData = JSON.stringify(sanitizedData);
    let accumulatedCharacterCount = serializedSanitizedData ? serializedSanitizedData.length : 0;
    if (accumulatedCharacterCount > maxCharacterCount) {
      warnOverCharacterLimit(maxCharacterCount, "discarded", source);
      return void 0;
    }
    while (containerQueue.length > 0 && accumulatedCharacterCount < maxCharacterCount) {
      const containerToProcess = containerQueue.shift();
      let separatorLength = 0;
      if (Array.isArray(containerToProcess.source)) {
        for (let key = 0; key < containerToProcess.source.length; key++) {
          const targetData = sanitizeProcessor(
            containerToProcess.source[key],
            containerToProcess.path,
            key,
            containerQueue,
            visitedObjectsWithPath
          );
          if (targetData !== void 0) {
            accumulatedCharacterCount += JSON.stringify(targetData).length;
          } else {
            accumulatedCharacterCount += 4;
          }
          accumulatedCharacterCount += separatorLength;
          separatorLength = 1;
          if (accumulatedCharacterCount > maxCharacterCount) {
            warnOverCharacterLimit(maxCharacterCount, "truncated", source);
            break;
          }
          ;
          containerToProcess.target[key] = targetData;
        }
      } else {
        for (const key in containerToProcess.source) {
          if (Object.prototype.hasOwnProperty.call(containerToProcess.source, key)) {
            const targetData = sanitizeProcessor(
              containerToProcess.source[key],
              containerToProcess.path,
              key,
              containerQueue,
              visitedObjectsWithPath
            );
            if (targetData !== void 0) {
              accumulatedCharacterCount += JSON.stringify(targetData).length + separatorLength + key.length + KEY_DECORATION_LENGTH;
              separatorLength = 1;
            }
            if (accumulatedCharacterCount > maxCharacterCount) {
              warnOverCharacterLimit(maxCharacterCount, "truncated", source);
              break;
            }
            ;
            containerToProcess.target[key] = targetData;
          }
        }
      }
    }
    restoreObjectPrototypeToJson();
    restoreArrayPrototypeToJson();
    return sanitizedData;
  }
  function sanitizeProcessor(source, parentPath, key, queue, visitedObjectsWithPath) {
    const sourceToSanitize = tryToApplyToJSON(source);
    if (!sourceToSanitize || typeof sourceToSanitize !== "object") {
      return sanitizePrimitivesAndFunctions(sourceToSanitize);
    }
    const sanitizedSource = sanitizeObjects(sourceToSanitize);
    if (sanitizedSource !== "[Object]" && sanitizedSource !== "[Array]" && sanitizedSource !== "[Error]") {
      return sanitizedSource;
    }
    const sourceAsObject = source;
    if (visitedObjectsWithPath.has(sourceAsObject)) {
      return `[Reference seen at ${visitedObjectsWithPath.get(sourceAsObject)}]`;
    }
    const currentPath = key !== void 0 ? `${parentPath}.${key}` : parentPath;
    const target = Array.isArray(sourceToSanitize) ? [] : {};
    visitedObjectsWithPath.set(sourceAsObject, currentPath);
    queue.push({ source: sourceToSanitize, target, path: currentPath });
    return target;
  }
  function sanitizePrimitivesAndFunctions(value) {
    if (typeof value === "bigint") {
      return `[BigInt] ${value.toString()}`;
    }
    if (typeof value === "function") {
      return `[Function] ${value.name || "unknown"}`;
    }
    if (typeof value === "symbol") {
      return `[Symbol] ${value.description || value.toString()}`;
    }
    return value;
  }
  function sanitizeObjects(value) {
    try {
      if (value instanceof Event) {
        return sanitizeEvent(value);
      }
      if (value instanceof RegExp) {
        return `[RegExp] ${value.toString()}`;
      }
      const result = Object.prototype.toString.call(value);
      const match = result.match(/\[object (.*)\]/);
      if (match && match[1]) {
        return `[${match[1]}]`;
      }
    } catch {
    }
    return "[Unserializable]";
  }
  function sanitizeEvent(event) {
    return {
      type: event.type,
      isTrusted: event.isTrusted,
      currentTarget: event.currentTarget ? sanitizeObjects(event.currentTarget) : null,
      target: event.target ? sanitizeObjects(event.target) : null
    };
  }
  function tryToApplyToJSON(value) {
    const object = value;
    if (object && typeof object.toJSON === "function") {
      try {
        return object.toJSON();
      } catch {
      }
    }
    return value;
  }
  function warnOverCharacterLimit(maxCharacterCount, changeType, source) {
    display.warn(
      `The data provided has been ${changeType} as it is over the limit of ${maxCharacterCount} characters:`,
      source
    );
  }
  var SANITIZE_DEFAULT_MAX_CHARACTER_COUNT, JSON_PATH_ROOT_ELEMENT, KEY_DECORATION_LENGTH;
  var init_sanitize = __esm({
    "../packages/core/src/tools/serialisation/sanitize.ts"() {
      "use strict";
      init_display();
      init_byteUtils();
      init_jsonStringify();
      SANITIZE_DEFAULT_MAX_CHARACTER_COUNT = 220 * ONE_KIBI_BYTE;
      JSON_PATH_ROOT_ELEMENT = "$";
      KEY_DECORATION_LENGTH = 3;
    }
  });

  // ../packages/core/src/domain/error/error.ts
  function computeRawError({
    stackTrace,
    originalError,
    handlingStack,
    componentStack,
    startClocks,
    nonErrorPrefix,
    source,
    handling
  }) {
    const isErrorInstance = isError(originalError);
    const message = computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError);
    const stack = hasUsableStack(isErrorInstance, stackTrace) ? toStackTraceString(stackTrace) : NO_ERROR_STACK_PRESENT_MESSAGE;
    const causes = isErrorInstance ? flattenErrorCauses(originalError, source) : void 0;
    const type = stackTrace ? stackTrace.name : void 0;
    const fingerprint = tryToGetFingerprint(originalError);
    const context = tryToGetErrorContext(originalError);
    return {
      startClocks,
      source,
      handling,
      handlingStack,
      componentStack,
      originalError,
      type,
      message,
      stack,
      causes,
      fingerprint,
      context
    };
  }
  function computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError) {
    return stackTrace?.message && stackTrace?.name ? stackTrace.message : !isErrorInstance ? `${nonErrorPrefix} ${jsonStringify(sanitize(originalError))}` : "Empty message";
  }
  function hasUsableStack(isErrorInstance, stackTrace) {
    if (stackTrace === void 0) {
      return false;
    }
    if (isErrorInstance) {
      return true;
    }
    return stackTrace.stack.length > 0 && (stackTrace.stack.length > 1 || stackTrace.stack[0].url !== void 0);
  }
  function tryToGetFingerprint(originalError) {
    return isError(originalError) && "dd_fingerprint" in originalError ? String(originalError.dd_fingerprint) : void 0;
  }
  function tryToGetErrorContext(originalError) {
    if (originalError !== null && typeof originalError === "object" && "dd_context" in originalError) {
      return originalError.dd_context;
    }
  }
  function isError(error) {
    return error instanceof Error || Object.prototype.toString.call(error) === "[object Error]";
  }
  function flattenErrorCauses(error, parentSource) {
    let currentError = error;
    const causes = [];
    while (isError(currentError?.cause) && causes.length < 10) {
      const stackTrace = computeStackTrace(currentError.cause);
      causes.push({
        message: currentError.cause.message,
        source: parentSource,
        type: stackTrace?.name,
        stack: stackTrace && toStackTraceString(stackTrace)
      });
      currentError = currentError.cause;
    }
    return causes.length ? causes : void 0;
  }
  var NO_ERROR_STACK_PRESENT_MESSAGE;
  var init_error = __esm({
    "../packages/core/src/domain/error/error.ts"() {
      "use strict";
      init_sanitize();
      init_jsonStringify();
      init_computeStackTrace();
      init_handlingStack();
      NO_ERROR_STACK_PRESENT_MESSAGE = "No stack, consider using an instance of Error";
    }
  });

  // ../packages/core/src/domain/error/error.types.ts
  var ErrorSource;
  var init_error_types = __esm({
    "../packages/core/src/domain/error/error.types.ts"() {
      "use strict";
      ErrorSource = {
        AGENT: "agent",
        CONSOLE: "console",
        CUSTOM: "custom",
        LOGGER: "logger",
        NETWORK: "network",
        SOURCE: "source",
        REPORT: "report"
      };
    }
  });

  // ../packages/core/src/domain/error/trackRuntimeError.ts
  function trackRuntimeError(errorObservable) {
    const handleRuntimeError = (stackTrace, originalError) => {
      const rawError = computeRawError({
        stackTrace,
        originalError,
        startClocks: clocksNow(),
        nonErrorPrefix: "Uncaught" /* UNCAUGHT */,
        source: ErrorSource.SOURCE,
        handling: "unhandled" /* UNHANDLED */
      });
      errorObservable.notify(rawError);
    };
    const { stop: stopInstrumentingOnError } = instrumentOnError(handleRuntimeError);
    const { stop: stopInstrumentingOnUnhandledRejection } = instrumentUnhandledRejection(handleRuntimeError);
    return {
      stop: () => {
        stopInstrumentingOnError();
        stopInstrumentingOnUnhandledRejection();
      }
    };
  }
  function instrumentOnError(callback) {
    return instrumentMethod(window, "onerror", ({ parameters: [messageObj, url, line, column, errorObj] }) => {
      let stackTrace;
      if (isError(errorObj)) {
        stackTrace = computeStackTrace(errorObj);
      } else {
        stackTrace = computeStackTraceFromOnErrorMessage(messageObj, url, line, column);
      }
      callback(stackTrace, errorObj ?? messageObj);
    });
  }
  function instrumentUnhandledRejection(callback) {
    return instrumentMethod(window, "onunhandledrejection", ({ parameters: [e] }) => {
      const reason = e.reason || "Empty reason";
      const stack = computeStackTrace(reason);
      callback(stack, reason);
    });
  }
  var init_trackRuntimeError = __esm({
    "../packages/core/src/domain/error/trackRuntimeError.ts"() {
      "use strict";
      init_instrumentMethod();
      init_timeUtils();
      init_computeStackTrace();
      init_error();
      init_error_types();
    }
  });

  // ../packages/core/src/boot/init.ts
  function makePublicApi(stub) {
    const publicApi = {
      version: "env",
      // This API method is intentionally not monitored, since the only thing executed is the
      // user-provided 'callback'.  All SDK usages executed in the callback should be monitored, and
      // we don't want to interfere with the user uncaught exceptions.
      onReady(callback) {
        callback();
      },
      ...stub
    };
    Object.defineProperty(publicApi, "_setDebug", {
      get() {
        return setDebugMode;
      },
      enumerable: false
    });
    return publicApi;
  }
  function defineGlobal(global, name, api) {
    const existingGlobalVariable = global[name];
    if (existingGlobalVariable && !existingGlobalVariable.q && existingGlobalVariable.version) {
      display.warn("SDK is loaded more than once. This is unsupported and might have unexpected behavior.");
    }
    global[name] = api;
    if (existingGlobalVariable && existingGlobalVariable.q) {
      existingGlobalVariable.q.forEach((fn) => catchUserErrors(fn, "onReady callback threw an error:")());
    }
  }
  var init_init = __esm({
    "../packages/core/src/boot/init.ts"() {
      "use strict";
      init_catchUserErrors();
      init_monitor();
      init_display();
    }
  });

  // ../packages/core/src/boot/displayAlreadyInitializedError.ts
  function displayAlreadyInitializedError(sdkName, initConfiguration) {
    if (!initConfiguration.silentMultipleInit) {
      display.error(`${sdkName} is already initialized.`);
    }
  }
  var init_displayAlreadyInitializedError = __esm({
    "../packages/core/src/boot/displayAlreadyInitializedError.ts"() {
      "use strict";
      init_display();
    }
  });

  // ../packages/core/src/browser/addEventListener.ts
  function addEventListener(configuration, eventTarget, eventName, listener, options) {
    return addEventListeners(configuration, eventTarget, [eventName], listener, options);
  }
  function addEventListeners(configuration, eventTarget, eventNames, listener, { once, capture, passive } = {}) {
    const listenerWithMonitor = monitor((event) => {
      if (!event.isTrusted && !event.__ddIsTrusted && !configuration.allowUntrustedEvents) {
        return;
      }
      if (once) {
        stop();
      }
      listener(event);
    });
    const options = passive ? { capture, passive } : capture;
    const listenerTarget = window.EventTarget && eventTarget instanceof EventTarget ? window.EventTarget.prototype : eventTarget;
    const add = getZoneJsOriginalValue(listenerTarget, "addEventListener");
    eventNames.forEach((eventName) => add.call(eventTarget, eventName, listenerWithMonitor, options));
    function stop() {
      const remove = getZoneJsOriginalValue(listenerTarget, "removeEventListener");
      eventNames.forEach((eventName) => remove.call(eventTarget, eventName, listenerWithMonitor, options));
    }
    return {
      stop
    };
  }
  var init_addEventListener = __esm({
    "../packages/core/src/browser/addEventListener.ts"() {
      "use strict";
      init_monitor();
      init_getZoneJsOriginalValue();
    }
  });

  // ../packages/core/src/domain/report/reportObservable.ts
  function initReportObservable(configuration, apis) {
    const observables = [];
    if (apis.includes(RawReportType.cspViolation)) {
      observables.push(createCspViolationReportObservable(configuration));
    }
    const reportTypes = apis.filter((api) => api !== RawReportType.cspViolation);
    if (reportTypes.length) {
      observables.push(createReportObservable(reportTypes));
    }
    return mergeObservables(...observables);
  }
  function createReportObservable(reportTypes) {
    return new Observable((observable) => {
      if (!window.ReportingObserver) {
        return;
      }
      const handleReports = monitor(
        (reports, _) => reports.forEach((report) => observable.notify(buildRawReportErrorFromReport(report)))
      );
      const observer2 = new window.ReportingObserver(handleReports, {
        types: reportTypes,
        buffered: true
      });
      observer2.observe();
      return () => {
        observer2.disconnect();
      };
    });
  }
  function createCspViolationReportObservable(configuration) {
    return new Observable((observable) => {
      const { stop } = addEventListener(configuration, document, "securitypolicyviolation" /* SECURITY_POLICY_VIOLATION */, (event) => {
        observable.notify(buildRawReportErrorFromCspViolation(event));
      });
      return stop;
    });
  }
  function buildRawReportErrorFromReport(report) {
    const { type, body } = report;
    return buildRawReportError({
      type: body.id,
      message: `${type}: ${body.message}`,
      originalError: report,
      stack: buildStack(body.id, body.message, body.sourceFile, body.lineNumber, body.columnNumber)
    });
  }
  function buildRawReportErrorFromCspViolation(event) {
    const message = `'${event.blockedURI}' blocked by '${event.effectiveDirective}' directive`;
    return buildRawReportError({
      type: event.effectiveDirective,
      message: `${RawReportType.cspViolation}: ${message}`,
      originalError: event,
      csp: {
        disposition: event.disposition
      },
      stack: buildStack(
        event.effectiveDirective,
        event.originalPolicy ? `${message} of the policy "${safeTruncate(event.originalPolicy, 100, "...")}"` : "no policy",
        event.sourceFile,
        event.lineNumber,
        event.columnNumber
      )
    });
  }
  function buildRawReportError(partial) {
    return {
      startClocks: clocksNow(),
      source: ErrorSource.REPORT,
      handling: "unhandled" /* UNHANDLED */,
      ...partial
    };
  }
  function buildStack(name, message, sourceFile, lineNumber, columnNumber) {
    return sourceFile ? toStackTraceString({
      name,
      message,
      stack: [
        {
          func: "?",
          url: sourceFile,
          line: lineNumber ?? void 0,
          column: columnNumber ?? void 0
        }
      ]
    }) : void 0;
  }
  var RawReportType;
  var init_reportObservable = __esm({
    "../packages/core/src/domain/report/reportObservable.ts"() {
      "use strict";
      init_handlingStack();
      init_monitor();
      init_observable();
      init_addEventListener();
      init_stringUtils();
      init_error_types();
      init_timeUtils();
      RawReportType = {
        intervention: "intervention",
        deprecation: "deprecation",
        cspViolation: "csp_violation"
      };
    }
  });

  // ../packages/core/src/tools/sendToExtension.ts
  function sendToExtension(type, payload) {
    const callback = window.__ddBrowserSdkExtensionCallback;
    if (callback) {
      callback({ type, payload });
    }
  }
  var init_sendToExtension = __esm({
    "../packages/core/src/tools/sendToExtension.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/utils/typeUtils.ts
  function getType(value) {
    if (value === null) {
      return "null";
    }
    if (Array.isArray(value)) {
      return "array";
    }
    return typeof value;
  }
  var init_typeUtils = __esm({
    "../packages/core/src/tools/utils/typeUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/mergeInto.ts
  function mergeInto(destination, source, circularReferenceChecker = createCircularReferenceChecker()) {
    if (source === void 0) {
      return destination;
    }
    if (typeof source !== "object" || source === null) {
      return source;
    } else if (source instanceof Date) {
      return new Date(source.getTime());
    } else if (source instanceof RegExp) {
      const flags = source.flags || // old browsers compatibility
      [
        source.global ? "g" : "",
        source.ignoreCase ? "i" : "",
        source.multiline ? "m" : "",
        source.sticky ? "y" : "",
        source.unicode ? "u" : ""
      ].join("");
      return new RegExp(source.source, flags);
    }
    if (circularReferenceChecker.hasAlreadyBeenSeen(source)) {
      return void 0;
    } else if (Array.isArray(source)) {
      const merged2 = Array.isArray(destination) ? destination : [];
      for (let i = 0; i < source.length; ++i) {
        merged2[i] = mergeInto(merged2[i], source[i], circularReferenceChecker);
      }
      return merged2;
    }
    const merged = getType(destination) === "object" ? destination : {};
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        merged[key] = mergeInto(merged[key], source[key], circularReferenceChecker);
      }
    }
    return merged;
  }
  function deepClone(value) {
    return mergeInto(void 0, value);
  }
  function combine(...sources) {
    let destination;
    for (const source of sources) {
      if (source === void 0 || source === null) {
        continue;
      }
      destination = mergeInto(destination, source);
    }
    return destination;
  }
  function createCircularReferenceChecker() {
    if (typeof WeakSet !== "undefined") {
      const set = /* @__PURE__ */ new WeakSet();
      return {
        hasAlreadyBeenSeen(value) {
          const has = set.has(value);
          if (!has) {
            set.add(value);
          }
          return has;
        }
      };
    }
    const array = [];
    return {
      hasAlreadyBeenSeen(value) {
        const has = array.indexOf(value) >= 0;
        if (!has) {
          array.push(value);
        }
        return has;
      }
    };
  }
  var init_mergeInto = __esm({
    "../packages/core/src/tools/mergeInto.ts"() {
      "use strict";
      init_typeUtils();
    }
  });

  // ../packages/core/src/domain/connectivity/connectivity.ts
  function getConnectivity() {
    const navigator2 = window.navigator;
    return {
      status: navigator2.onLine ? "connected" : "not_connected",
      interfaces: navigator2.connection && navigator2.connection.type ? [navigator2.connection.type] : void 0,
      effective_type: navigator2.connection?.effectiveType
    };
  }
  var init_connectivity = __esm({
    "../packages/core/src/domain/connectivity/connectivity.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/domain/connectivity/index.ts
  var init_connectivity2 = __esm({
    "../packages/core/src/domain/connectivity/index.ts"() {
      "use strict";
      init_connectivity();
    }
  });

  // ../packages/core/src/tools/utils/arrayUtils.ts
  function removeItem(array, item) {
    const index = array.indexOf(item);
    if (index >= 0) {
      array.splice(index, 1);
    }
  }
  var init_arrayUtils = __esm({
    "../packages/core/src/tools/utils/arrayUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/boundedBuffer.ts
  function createBoundedBuffer() {
    const buffer = [];
    const add = (callback) => {
      const length = buffer.push(callback);
      if (length > BUFFER_LIMIT) {
        buffer.splice(0, 1);
      }
    };
    const remove = (callback) => {
      removeItem(buffer, callback);
    };
    const drain = (arg) => {
      buffer.forEach((callback) => callback(arg));
      buffer.length = 0;
    };
    return {
      add,
      remove,
      drain
    };
  }
  var BUFFER_LIMIT;
  var init_boundedBuffer = __esm({
    "../packages/core/src/tools/boundedBuffer.ts"() {
      "use strict";
      init_arrayUtils();
      BUFFER_LIMIT = 500;
    }
  });

  // ../packages/core/src/domain/telemetry/rawTelemetryEvent.types.ts
  var TelemetryType;
  var init_rawTelemetryEvent_types = __esm({
    "../packages/core/src/domain/telemetry/rawTelemetryEvent.types.ts"() {
      "use strict";
      TelemetryType = {
        log: "log",
        configuration: "configuration",
        usage: "usage"
      };
    }
  });

  // ../packages/core/src/domain/telemetry/telemetry.ts
  function startTelemetry(telemetryService, configuration) {
    let contextProvider;
    const observable = new Observable();
    const alreadySentEvents = /* @__PURE__ */ new Set();
    const telemetryEnabled = !TELEMETRY_EXCLUDED_SITES.includes(configuration.site) && performDraw(configuration.telemetrySampleRate);
    const telemetryEnabledPerType = {
      [TelemetryType.log]: telemetryEnabled,
      [TelemetryType.configuration]: telemetryEnabled && performDraw(configuration.telemetryConfigurationSampleRate),
      [TelemetryType.usage]: telemetryEnabled && performDraw(configuration.telemetryUsageSampleRate)
    };
    const runtimeEnvInfo = getRuntimeEnvInfo();
    onRawTelemetryEventCollected = (rawEvent) => {
      const stringifiedEvent = jsonStringify(rawEvent);
      if (telemetryEnabledPerType[rawEvent.type] && alreadySentEvents.size < configuration.maxTelemetryEventsPerPage && !alreadySentEvents.has(stringifiedEvent)) {
        const event = toTelemetryEvent(telemetryService, rawEvent, runtimeEnvInfo);
        observable.notify(event);
        sendToExtension("telemetry", event);
        alreadySentEvents.add(stringifiedEvent);
      }
    };
    startMonitorErrorCollection(addTelemetryError);
    function toTelemetryEvent(telemetryService2, event, runtimeEnvInfo2) {
      return combine(
        {
          type: "telemetry",
          date: timeStampNow(),
          service: telemetryService2,
          version: "env",
          source: "browser",
          _dd: {
            format_version: 2
          },
          telemetry: combine(event, {
            runtime_env: runtimeEnvInfo2,
            connectivity: getConnectivity(),
            sdk_setup: __BUILD_ENV__SDK_SETUP__
          }),
          experimental_features: Array.from(getExperimentalFeatures())
        },
        contextProvider !== void 0 ? contextProvider() : {}
      );
    }
    return {
      setContextProvider: (provider) => {
        contextProvider = provider;
      },
      observable,
      enabled: telemetryEnabled
    };
  }
  function getRuntimeEnvInfo() {
    return {
      is_local_file: window.location.protocol === "file:",
      is_worker: "WorkerGlobalScope" in self
    };
  }
  function drainPreStartTelemetry() {
    preStartTelemetryBuffer.drain();
  }
  function isTelemetryReplicationAllowed(configuration) {
    return configuration.site === INTAKE_SITE_STAGING;
  }
  function addTelemetryDebug(message, context) {
    displayIfDebugEnabled(ConsoleApiName.debug, message, context);
    onRawTelemetryEventCollected({
      type: TelemetryType.log,
      message,
      status: "debug" /* debug */,
      ...context
    });
  }
  function addTelemetryError(e, context) {
    onRawTelemetryEventCollected({
      type: TelemetryType.log,
      status: "error" /* error */,
      ...formatError(e),
      ...context
    });
  }
  function addTelemetryConfiguration(configuration) {
    onRawTelemetryEventCollected({
      type: TelemetryType.configuration,
      configuration
    });
  }
  function addTelemetryUsage(usage) {
    onRawTelemetryEventCollected({
      type: TelemetryType.usage,
      usage
    });
  }
  function formatError(e) {
    if (isError(e)) {
      const stackTrace = computeStackTrace(e);
      return {
        error: {
          kind: stackTrace.name,
          stack: toStackTraceString(scrubCustomerFrames(stackTrace))
        },
        message: stackTrace.message
      };
    }
    return {
      error: {
        stack: NO_ERROR_STACK_PRESENT_MESSAGE
      },
      message: `${"Uncaught" /* UNCAUGHT */} ${jsonStringify(e)}`
    };
  }
  function scrubCustomerFrames(stackTrace) {
    stackTrace.stack = stackTrace.stack.filter(
      (frame) => !frame.url || ALLOWED_FRAME_URLS.some((allowedFrameUrl) => frame.url.startsWith(allowedFrameUrl))
    );
    return stackTrace;
  }
  var ALLOWED_FRAME_URLS, TELEMETRY_EXCLUDED_SITES, preStartTelemetryBuffer, onRawTelemetryEventCollected;
  var init_telemetry = __esm({
    "../packages/core/src/domain/telemetry/telemetry.ts"() {
      "use strict";
      init_display();
      init_error();
      init_handlingStack();
      init_experimentalFeatures();
      init_configuration2();
      init_observable();
      init_timeUtils();
      init_monitor();
      init_sendToExtension();
      init_numberUtils();
      init_jsonStringify();
      init_mergeInto();
      init_computeStackTrace();
      init_connectivity2();
      init_boundedBuffer();
      init_rawTelemetryEvent_types();
      ALLOWED_FRAME_URLS = [
        "https://www.datadoghq-browser-agent.com",
        "https://www.datad0g-browser-agent.com",
        "https://d3uc069fcn7uxw.cloudfront.net",
        "https://d20xtzwzcl0ceb.cloudfront.net",
        "http://localhost",
        "<anonymous>"
      ];
      TELEMETRY_EXCLUDED_SITES = [INTAKE_SITE_US1_FED];
      preStartTelemetryBuffer = createBoundedBuffer();
      onRawTelemetryEventCollected = (event) => {
        preStartTelemetryBuffer.add(() => onRawTelemetryEventCollected(event));
      };
    }
  });

  // ../packages/core/src/domain/telemetry/index.ts
  var init_telemetry2 = __esm({
    "../packages/core/src/domain/telemetry/index.ts"() {
      "use strict";
      init_telemetry();
      init_rawTelemetryEvent_types();
    }
  });

  // ../packages/core/src/tools/valueHistory.ts
  function cleanupHistories() {
    cleanupTasks.forEach((task) => task());
  }
  function createValueHistory({
    expireDelay,
    maxEntries
  }) {
    let entries = [];
    const deletedEntries = [];
    if (!cleanupHistoriesInterval) {
      cleanupHistoriesInterval = setInterval(() => cleanupHistories(), CLEAR_OLD_VALUES_INTERVAL);
    }
    const clearExpiredValues = () => {
      const oldTimeThreshold = relativeNow() - expireDelay;
      while (entries.length > 0 && entries[entries.length - 1].endTime < oldTimeThreshold) {
        const entry = entries.pop();
        if (entry) {
          deletedEntries.push(entry.startTime);
        }
      }
    };
    cleanupTasks.add(clearExpiredValues);
    function add(value, startTime) {
      const entry = {
        value,
        startTime,
        endTime: END_OF_TIMES,
        remove: () => {
          removeItem(entries, entry);
        },
        close: (endTime2) => {
          entry.endTime = endTime2;
        }
      };
      if (maxEntries && entries.length >= maxEntries) {
        entries.pop();
      }
      entries.unshift(entry);
      return entry;
    }
    function find(startTime = END_OF_TIMES, options = { returnInactive: false }) {
      for (const entry of entries) {
        if (entry.startTime <= startTime) {
          if (options.returnInactive || startTime <= entry.endTime) {
            return entry.value;
          }
          break;
        }
      }
    }
    function closeActive(endTime2) {
      const latestEntry = entries[0];
      if (latestEntry && latestEntry.endTime === END_OF_TIMES) {
        latestEntry.close(endTime2);
      }
    }
    function findAll(startTime = END_OF_TIMES, duration = 0) {
      const endTime2 = addDuration(startTime, duration);
      return entries.filter((entry) => entry.startTime <= endTime2 && startTime <= entry.endTime).map((entry) => entry.value);
    }
    function getAllEntries() {
      return entries.map(({ startTime, endTime: endTime2, value }) => ({
        startTime,
        endTime: endTime2 === END_OF_TIMES ? "Infinity" : endTime2,
        value
      }));
    }
    function getDeletedEntries() {
      return deletedEntries;
    }
    function reset() {
      entries = [];
    }
    function stop() {
      cleanupTasks.delete(clearExpiredValues);
      if (cleanupTasks.size === 0 && cleanupHistoriesInterval) {
        clearInterval(cleanupHistoriesInterval);
        cleanupHistoriesInterval = null;
      }
    }
    return { add, find, closeActive, findAll, reset, stop, getAllEntries, getDeletedEntries };
  }
  var END_OF_TIMES, CLEAR_OLD_VALUES_INTERVAL, cleanupHistoriesInterval, cleanupTasks;
  var init_valueHistory = __esm({
    "../packages/core/src/tools/valueHistory.ts"() {
      "use strict";
      init_timer();
      init_arrayUtils();
      init_timeUtils();
      END_OF_TIMES = Infinity;
      CLEAR_OLD_VALUES_INTERVAL = ONE_MINUTE;
      cleanupHistoriesInterval = null;
      cleanupTasks = /* @__PURE__ */ new Set();
    }
  });

  // ../packages/core/src/domain/session/sessionManager.ts
  function startSessionManager(configuration, productKey, computeSessionState2, trackingConsentState) {
    const renewObservable = new Observable();
    const expireObservable = new Observable();
    const sessionStore = startSessionStore(
      configuration.sessionStoreStrategyType,
      configuration,
      productKey,
      computeSessionState2
    );
    stopCallbacks.push(() => sessionStore.stop());
    const sessionContextHistory = createValueHistory({
      expireDelay: SESSION_CONTEXT_TIMEOUT_DELAY
    });
    stopCallbacks.push(() => sessionContextHistory.stop());
    sessionStore.renewObservable.subscribe(() => {
      sessionContextHistory.add(buildSessionContext(), relativeNow());
      renewObservable.notify();
    });
    sessionStore.expireObservable.subscribe(() => {
      expireObservable.notify();
      sessionContextHistory.closeActive(relativeNow());
    });
    sessionStore.expandOrRenewSession();
    sessionContextHistory.add(buildSessionContext(), clocksOrigin().relative);
    trackingConsentState.observable.subscribe(() => {
      if (trackingConsentState.isGranted()) {
        sessionStore.expandOrRenewSession();
      } else {
        sessionStore.expire();
      }
    });
    trackActivity(configuration, () => {
      if (trackingConsentState.isGranted()) {
        sessionStore.expandOrRenewSession();
      }
    });
    trackVisibility(configuration, () => sessionStore.expandSession());
    trackResume(configuration, () => sessionStore.restartSession());
    function buildSessionContext() {
      return {
        id: sessionStore.getSession().id,
        trackingType: sessionStore.getSession()[productKey],
        isReplayForced: !!sessionStore.getSession().forcedReplay,
        anonymousId: sessionStore.getSession().anonymousId
      };
    }
    return {
      findSession: (startTime, options) => sessionContextHistory.find(startTime, options),
      renewObservable,
      expireObservable,
      sessionStateUpdateObservable: sessionStore.sessionStateUpdateObservable,
      expire: sessionStore.expire,
      updateSessionState: sessionStore.updateSessionState
    };
  }
  function trackActivity(configuration, expandOrRenewSession) {
    const { stop } = addEventListeners(
      configuration,
      window,
      ["click" /* CLICK */, "touchstart" /* TOUCH_START */, "keydown" /* KEY_DOWN */, "scroll" /* SCROLL */],
      expandOrRenewSession,
      { capture: true, passive: true }
    );
    stopCallbacks.push(stop);
  }
  function trackVisibility(configuration, expandSession) {
    const expandSessionWhenVisible = () => {
      if (document.visibilityState === "visible") {
        expandSession();
      }
    };
    const { stop } = addEventListener(configuration, document, "visibilitychange" /* VISIBILITY_CHANGE */, expandSessionWhenVisible);
    stopCallbacks.push(stop);
    const visibilityCheckInterval = setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY);
    stopCallbacks.push(() => {
      clearInterval(visibilityCheckInterval);
    });
  }
  function trackResume(configuration, cb) {
    const { stop } = addEventListener(configuration, window, "resume" /* RESUME */, cb, { capture: true });
    stopCallbacks.push(stop);
  }
  var VISIBILITY_CHECK_DELAY, SESSION_CONTEXT_TIMEOUT_DELAY, stopCallbacks;
  var init_sessionManager = __esm({
    "../packages/core/src/domain/session/sessionManager.ts"() {
      "use strict";
      init_observable();
      init_valueHistory();
      init_timeUtils();
      init_addEventListener();
      init_timer();
      init_sessionConstants();
      init_sessionStore();
      VISIBILITY_CHECK_DELAY = ONE_MINUTE;
      SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY;
      stopCallbacks = [];
    }
  });

  // ../packages/core/src/tools/utils/responseUtils.ts
  function isServerError(status) {
    return status >= 500;
  }
  function tryToClone(response) {
    try {
      return response.clone();
    } catch {
      return;
    }
  }
  var init_responseUtils = __esm({
    "../packages/core/src/tools/utils/responseUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/transport/sendWithRetryStrategy.ts
  function sendWithRetryStrategy(payload, state2, sendStrategy, trackType, reportError) {
    if (state2.transportStatus === 0 /* UP */ && state2.queuedPayloads.size() === 0 && state2.bandwidthMonitor.canHandle(payload)) {
      send(payload, state2, sendStrategy, {
        onSuccess: () => retryQueuedPayloads(0 /* AFTER_SUCCESS */, state2, sendStrategy, trackType, reportError),
        onFailure: () => {
          state2.queuedPayloads.enqueue(payload);
          scheduleRetry(state2, sendStrategy, trackType, reportError);
        }
      });
    } else {
      state2.queuedPayloads.enqueue(payload);
    }
  }
  function scheduleRetry(state2, sendStrategy, trackType, reportError) {
    if (state2.transportStatus !== 2 /* DOWN */) {
      return;
    }
    setTimeout(() => {
      const payload = state2.queuedPayloads.first();
      send(payload, state2, sendStrategy, {
        onSuccess: () => {
          state2.queuedPayloads.dequeue();
          state2.currentBackoffTime = INITIAL_BACKOFF_TIME;
          retryQueuedPayloads(1 /* AFTER_RESUME */, state2, sendStrategy, trackType, reportError);
        },
        onFailure: () => {
          state2.currentBackoffTime = Math.min(MAX_BACKOFF_TIME, state2.currentBackoffTime * 2);
          scheduleRetry(state2, sendStrategy, trackType, reportError);
        }
      });
    }, state2.currentBackoffTime);
  }
  function send(payload, state2, sendStrategy, { onSuccess, onFailure }) {
    state2.bandwidthMonitor.add(payload);
    sendStrategy(payload, (response) => {
      state2.bandwidthMonitor.remove(payload);
      if (!shouldRetryRequest(response)) {
        state2.transportStatus = 0 /* UP */;
        onSuccess();
      } else {
        state2.transportStatus = state2.bandwidthMonitor.ongoingRequestCount > 0 ? 1 /* FAILURE_DETECTED */ : 2 /* DOWN */;
        payload.retry = {
          count: payload.retry ? payload.retry.count + 1 : 1,
          lastFailureStatus: response.status
        };
        onFailure();
      }
    });
  }
  function retryQueuedPayloads(reason, state2, sendStrategy, trackType, reportError) {
    if (reason === 0 /* AFTER_SUCCESS */ && state2.queuedPayloads.isFull() && !state2.queueFullReported) {
      reportError({
        message: `Reached max ${trackType} events size queued for upload: ${MAX_QUEUE_BYTES_COUNT / ONE_MEBI_BYTE}MiB`,
        source: ErrorSource.AGENT,
        startClocks: clocksNow()
      });
      state2.queueFullReported = true;
    }
    const previousQueue = state2.queuedPayloads;
    state2.queuedPayloads = newPayloadQueue();
    while (previousQueue.size() > 0) {
      sendWithRetryStrategy(previousQueue.dequeue(), state2, sendStrategy, trackType, reportError);
    }
  }
  function shouldRetryRequest(response) {
    return response.type !== "opaque" && (response.status === 0 && !navigator.onLine || response.status === 408 || response.status === 429 || isServerError(response.status));
  }
  function newRetryState() {
    return {
      transportStatus: 0 /* UP */,
      currentBackoffTime: INITIAL_BACKOFF_TIME,
      bandwidthMonitor: newBandwidthMonitor(),
      queuedPayloads: newPayloadQueue(),
      queueFullReported: false
    };
  }
  function newPayloadQueue() {
    const queue = [];
    return {
      bytesCount: 0,
      enqueue(payload) {
        if (this.isFull()) {
          return;
        }
        queue.push(payload);
        this.bytesCount += payload.bytesCount;
      },
      first() {
        return queue[0];
      },
      dequeue() {
        const payload = queue.shift();
        if (payload) {
          this.bytesCount -= payload.bytesCount;
        }
        return payload;
      },
      size() {
        return queue.length;
      },
      isFull() {
        return this.bytesCount >= MAX_QUEUE_BYTES_COUNT;
      }
    };
  }
  function newBandwidthMonitor() {
    return {
      ongoingRequestCount: 0,
      ongoingByteCount: 0,
      canHandle(payload) {
        return this.ongoingRequestCount === 0 || this.ongoingByteCount + payload.bytesCount <= MAX_ONGOING_BYTES_COUNT && this.ongoingRequestCount < MAX_ONGOING_REQUESTS;
      },
      add(payload) {
        this.ongoingRequestCount += 1;
        this.ongoingByteCount += payload.bytesCount;
      },
      remove(payload) {
        this.ongoingRequestCount -= 1;
        this.ongoingByteCount -= payload.bytesCount;
      }
    };
  }
  var MAX_ONGOING_BYTES_COUNT, MAX_ONGOING_REQUESTS, MAX_QUEUE_BYTES_COUNT, MAX_BACKOFF_TIME, INITIAL_BACKOFF_TIME;
  var init_sendWithRetryStrategy = __esm({
    "../packages/core/src/transport/sendWithRetryStrategy.ts"() {
      "use strict";
      init_timer();
      init_timeUtils();
      init_byteUtils();
      init_responseUtils();
      init_error_types();
      MAX_ONGOING_BYTES_COUNT = 80 * ONE_KIBI_BYTE;
      MAX_ONGOING_REQUESTS = 32;
      MAX_QUEUE_BYTES_COUNT = 3 * ONE_MEBI_BYTE;
      MAX_BACKOFF_TIME = ONE_MINUTE;
      INITIAL_BACKOFF_TIME = ONE_SECOND;
    }
  });

  // ../packages/core/src/transport/httpRequest.ts
  function createHttpRequest(endpointBuilder, bytesLimit, reportError) {
    const retryState = newRetryState();
    const sendStrategyForRetry = (payload, onResponse) => fetchKeepAliveStrategy(endpointBuilder, bytesLimit, payload, onResponse);
    return {
      send: (payload) => {
        sendWithRetryStrategy(payload, retryState, sendStrategyForRetry, endpointBuilder.trackType, reportError);
      },
      /**
       * Since fetch keepalive behaves like regular fetch on Firefox,
       * keep using sendBeaconStrategy on exit
       */
      sendOnExit: (payload) => {
        sendBeaconStrategy(endpointBuilder, bytesLimit, payload);
      }
    };
  }
  function sendBeaconStrategy(endpointBuilder, bytesLimit, payload) {
    const canUseBeacon = !!navigator.sendBeacon && payload.bytesCount < bytesLimit;
    if (canUseBeacon) {
      try {
        const beaconUrl = endpointBuilder.build("beacon", payload);
        const isQueued = navigator.sendBeacon(beaconUrl, payload.data);
        if (isQueued) {
          return;
        }
      } catch (e) {
        reportBeaconError(e);
      }
    }
    const xhrUrl = endpointBuilder.build("xhr", payload);
    sendXHR(xhrUrl, payload.data);
  }
  function reportBeaconError(e) {
    if (!hasReportedBeaconError) {
      hasReportedBeaconError = true;
      addTelemetryError(e);
    }
  }
  function fetchKeepAliveStrategy(endpointBuilder, bytesLimit, payload, onResponse) {
    const canUseKeepAlive = isKeepAliveSupported() && payload.bytesCount < bytesLimit;
    if (canUseKeepAlive) {
      const fetchUrl = endpointBuilder.build("fetch", payload);
      fetch(fetchUrl, { method: "POST", body: payload.data, keepalive: true, mode: "cors" }).then(
        monitor((response) => onResponse?.({ status: response.status, type: response.type })),
        monitor(() => {
          const xhrUrl = endpointBuilder.build("xhr", payload);
          sendXHR(xhrUrl, payload.data, onResponse);
        })
      );
    } else {
      const xhrUrl = endpointBuilder.build("xhr", payload);
      sendXHR(xhrUrl, payload.data, onResponse);
    }
  }
  function isKeepAliveSupported() {
    try {
      return window.Request && "keepalive" in new Request("http://a");
    } catch {
      return false;
    }
  }
  function sendXHR(url, data, onResponse) {
    const request = new XMLHttpRequest();
    request.open("POST", url, true);
    if (data instanceof Blob) {
      request.setRequestHeader("Content-Type", data.type);
    }
    addEventListener(
      // allow untrusted event to acount for synthetic event dispatched by third party xhr wrapper
      { allowUntrustedEvents: true },
      request,
      "loadend",
      () => {
        onResponse?.({ status: request.status });
      },
      {
        // prevent multiple onResponse callbacks
        // if the xhr instance is reused by a third party
        once: true
      }
    );
    request.send(data);
  }
  var hasReportedBeaconError;
  var init_httpRequest = __esm({
    "../packages/core/src/transport/httpRequest.ts"() {
      "use strict";
      init_telemetry2();
      init_monitor();
      init_addEventListener();
      init_sendWithRetryStrategy();
      hasReportedBeaconError = false;
    }
  });

  // ../packages/core/src/transport/eventBridge.ts
  function getEventBridge() {
    const eventBridgeGlobal = getEventBridgeGlobal();
    if (!eventBridgeGlobal) {
      return;
    }
    return {
      getCapabilities() {
        return JSON.parse(eventBridgeGlobal.getCapabilities?.() || "[]");
      },
      getPrivacyLevel() {
        return eventBridgeGlobal.getPrivacyLevel?.();
      },
      getAllowedWebViewHosts() {
        return JSON.parse(eventBridgeGlobal.getAllowedWebViewHosts());
      },
      send(eventType, event, viewId) {
        const view = viewId ? { id: viewId } : void 0;
        eventBridgeGlobal.send(JSON.stringify({ eventType, event, view }));
      }
    };
  }
  function bridgeSupports(capability) {
    const bridge = getEventBridge();
    return !!bridge && bridge.getCapabilities().includes(capability);
  }
  function canUseEventBridge(currentHost = getGlobalObject().location?.hostname) {
    const bridge = getEventBridge();
    return !!bridge && bridge.getAllowedWebViewHosts().some((allowedHost) => currentHost === allowedHost || currentHost.endsWith(`.${allowedHost}`));
  }
  function getEventBridgeGlobal() {
    return getGlobalObject().DatadogEventBridge;
  }
  var init_eventBridge = __esm({
    "../packages/core/src/transport/eventBridge.ts"() {
      "use strict";
      init_getGlobalObject();
    }
  });

  // ../packages/core/src/browser/pageExitObservable.ts
  function createPageExitObservable(configuration) {
    return new Observable((observable) => {
      const { stop: stopListeners } = addEventListeners(
        configuration,
        window,
        ["visibilitychange" /* VISIBILITY_CHANGE */, "freeze" /* FREEZE */],
        (event) => {
          if (event.type === "visibilitychange" /* VISIBILITY_CHANGE */ && document.visibilityState === "hidden") {
            observable.notify({ reason: PageExitReason.HIDDEN });
          } else if (event.type === "freeze" /* FREEZE */) {
            observable.notify({ reason: PageExitReason.FROZEN });
          }
        },
        { capture: true }
      );
      const stopBeforeUnloadListener = addEventListener(configuration, window, "beforeunload" /* BEFORE_UNLOAD */, () => {
        observable.notify({ reason: PageExitReason.UNLOADING });
      }).stop;
      return () => {
        stopListeners();
        stopBeforeUnloadListener();
      };
    });
  }
  function isPageExitReason(reason) {
    return objectValues(PageExitReason).includes(reason);
  }
  var PageExitReason;
  var init_pageExitObservable = __esm({
    "../packages/core/src/browser/pageExitObservable.ts"() {
      "use strict";
      init_observable();
      init_polyfills();
      init_addEventListener();
      PageExitReason = {
        HIDDEN: "visibility_hidden",
        UNLOADING: "before_unload",
        PAGEHIDE: "page_hide",
        FROZEN: "page_frozen"
      };
    }
  });

  // ../packages/core/src/transport/batch.ts
  function createBatch({
    encoder,
    request,
    flushController,
    messageBytesLimit
  }) {
    let upsertBuffer = {};
    const flushSubscription = flushController.flushObservable.subscribe((event) => flush(event));
    function push(serializedMessage, estimatedMessageBytesCount, key) {
      flushController.notifyBeforeAddMessage(estimatedMessageBytesCount);
      if (key !== void 0) {
        upsertBuffer[key] = serializedMessage;
        flushController.notifyAfterAddMessage();
      } else {
        encoder.write(encoder.isEmpty ? serializedMessage : `
${serializedMessage}`, (realMessageBytesCount) => {
          flushController.notifyAfterAddMessage(realMessageBytesCount - estimatedMessageBytesCount);
        });
      }
    }
    function hasMessageFor(key) {
      return key !== void 0 && upsertBuffer[key] !== void 0;
    }
    function remove(key) {
      const removedMessage = upsertBuffer[key];
      delete upsertBuffer[key];
      const messageBytesCount = encoder.estimateEncodedBytesCount(removedMessage);
      flushController.notifyAfterRemoveMessage(messageBytesCount);
    }
    function addOrUpdate(message, key) {
      const serializedMessage = jsonStringify(message);
      const estimatedMessageBytesCount = encoder.estimateEncodedBytesCount(serializedMessage);
      if (estimatedMessageBytesCount >= messageBytesLimit) {
        display.warn(
          `Discarded a message whose size was bigger than the maximum allowed size ${messageBytesLimit}KB. ${MORE_DETAILS} ${DOCS_TROUBLESHOOTING}/#technical-limitations`
        );
        return;
      }
      if (hasMessageFor(key)) {
        remove(key);
      }
      push(serializedMessage, estimatedMessageBytesCount, key);
    }
    function flush(event) {
      const upsertMessages = objectValues(upsertBuffer).join("\n");
      upsertBuffer = {};
      const isPageExit = isPageExitReason(event.reason);
      const send2 = isPageExit ? request.sendOnExit : request.send;
      if (isPageExit && // Note: checking that the encoder is async is not strictly needed, but it's an optimization:
      // if the encoder is async we need to send two requests in some cases (one for encoded data
      // and the other for non-encoded data). But if it's not async, we don't have to worry about
      // it and always send a single request.
      encoder.isAsync) {
        const encoderResult = encoder.finishSync();
        if (encoderResult.outputBytesCount) {
          send2(formatPayloadFromEncoder(encoderResult));
        }
        const pendingMessages = [encoderResult.pendingData, upsertMessages].filter(Boolean).join("\n");
        if (pendingMessages) {
          send2({
            data: pendingMessages,
            bytesCount: computeBytesCount(pendingMessages)
          });
        }
      } else {
        if (upsertMessages) {
          encoder.write(encoder.isEmpty ? upsertMessages : `
${upsertMessages}`);
        }
        encoder.finish((encoderResult) => {
          send2(formatPayloadFromEncoder(encoderResult));
        });
      }
    }
    return {
      flushController,
      add: addOrUpdate,
      upsert: addOrUpdate,
      stop: flushSubscription.unsubscribe
    };
  }
  function formatPayloadFromEncoder(encoderResult) {
    let data;
    if (typeof encoderResult.output === "string") {
      data = encoderResult.output;
    } else {
      data = new Blob([encoderResult.output], {
        // This will set the 'Content-Type: text/plain' header. Reasoning:
        // * The intake rejects the request if there is no content type.
        // * The browser will issue CORS preflight requests if we set it to 'application/json', which
        // could induce higher intake load (and maybe has other impacts).
        // * Also it's not quite JSON, since we are concatenating multiple JSON objects separated by
        // new lines.
        type: "text/plain"
      });
    }
    return {
      data,
      bytesCount: encoderResult.outputBytesCount,
      encoding: encoderResult.encoding
    };
  }
  var init_batch = __esm({
    "../packages/core/src/transport/batch.ts"() {
      "use strict";
      init_display();
      init_polyfills();
      init_pageExitObservable();
      init_jsonStringify();
      init_byteUtils();
    }
  });

  // ../packages/core/src/transport/flushController.ts
  function createFlushController({
    messagesLimit,
    bytesLimit,
    durationLimit,
    pageExitObservable,
    sessionExpireObservable
  }) {
    const pageExitSubscription = pageExitObservable.subscribe((event) => flush(event.reason));
    const sessionExpireSubscription = sessionExpireObservable.subscribe(() => flush("session_expire"));
    const flushObservable = new Observable(() => () => {
      pageExitSubscription.unsubscribe();
      sessionExpireSubscription.unsubscribe();
    });
    let currentBytesCount = 0;
    let currentMessagesCount = 0;
    function flush(flushReason) {
      if (currentMessagesCount === 0) {
        return;
      }
      const messagesCount = currentMessagesCount;
      const bytesCount = currentBytesCount;
      currentMessagesCount = 0;
      currentBytesCount = 0;
      cancelDurationLimitTimeout();
      flushObservable.notify({
        reason: flushReason,
        messagesCount,
        bytesCount
      });
    }
    let durationLimitTimeoutId;
    function scheduleDurationLimitTimeout() {
      if (durationLimitTimeoutId === void 0) {
        durationLimitTimeoutId = setTimeout(() => {
          flush("duration_limit");
        }, durationLimit);
      }
    }
    function cancelDurationLimitTimeout() {
      clearTimeout(durationLimitTimeoutId);
      durationLimitTimeoutId = void 0;
    }
    return {
      flushObservable,
      get messagesCount() {
        return currentMessagesCount;
      },
      /**
       * Notifies that a message will be added to a pool of pending messages waiting to be flushed.
       *
       * This function needs to be called synchronously, right before adding the message, so no flush
       * event can happen after `notifyBeforeAddMessage` and before adding the message.
       *
       * @param estimatedMessageBytesCount: an estimation of the message bytes count once it is
       * actually added.
       */
      notifyBeforeAddMessage(estimatedMessageBytesCount) {
        if (currentBytesCount + estimatedMessageBytesCount >= bytesLimit) {
          flush("bytes_limit");
        }
        currentMessagesCount += 1;
        currentBytesCount += estimatedMessageBytesCount;
        scheduleDurationLimitTimeout();
      },
      /**
       * Notifies that a message *was* added to a pool of pending messages waiting to be flushed.
       *
       * This function can be called asynchronously after the message was added, but in this case it
       * should not be called if a flush event occurred in between.
       *
       * @param messageBytesCountDiff: the difference between the estimated message bytes count and
       * its actual bytes count once added to the pool.
       */
      notifyAfterAddMessage(messageBytesCountDiff = 0) {
        currentBytesCount += messageBytesCountDiff;
        if (currentMessagesCount >= messagesLimit) {
          flush("messages_limit");
        } else if (currentBytesCount >= bytesLimit) {
          flush("bytes_limit");
        }
      },
      /**
       * Notifies that a message was removed from a pool of pending messages waiting to be flushed.
       *
       * This function needs to be called synchronously, right after removing the message, so no flush
       * event can happen after removing the message and before `notifyAfterRemoveMessage`.
       *
       * @param messageBytesCount: the message bytes count that was added to the pool. Should
       * correspond to the sum of bytes counts passed to `notifyBeforeAddMessage` and
       * `notifyAfterAddMessage`.
       */
      notifyAfterRemoveMessage(messageBytesCount) {
        currentBytesCount -= messageBytesCount;
        currentMessagesCount -= 1;
        if (currentMessagesCount === 0) {
          cancelDurationLimitTimeout();
        }
      }
    };
  }
  var init_flushController = __esm({
    "../packages/core/src/transport/flushController.ts"() {
      "use strict";
      init_observable();
      init_timer();
    }
  });

  // ../packages/core/src/transport/startBatchWithReplica.ts
  function startBatchWithReplica(configuration, primary, replica, reportError, pageExitObservable, sessionExpireObservable, batchFactoryImp = createBatch) {
    const primaryBatch = createBatchFromConfig(configuration, primary);
    const replicaBatch = replica && createBatchFromConfig(configuration, replica);
    function createBatchFromConfig(configuration2, { endpoint, encoder }) {
      return batchFactoryImp({
        encoder,
        request: createHttpRequest(endpoint, configuration2.batchBytesLimit, reportError),
        flushController: createFlushController({
          messagesLimit: configuration2.batchMessagesLimit,
          bytesLimit: configuration2.batchBytesLimit,
          durationLimit: configuration2.flushTimeout,
          pageExitObservable,
          sessionExpireObservable
        }),
        messageBytesLimit: configuration2.messageBytesLimit
      });
    }
    return {
      flushObservable: primaryBatch.flushController.flushObservable,
      add(message, replicated = true) {
        primaryBatch.add(message);
        if (replicaBatch && replicated) {
          replicaBatch.add(replica.transformMessage ? replica.transformMessage(message) : message);
        }
      },
      upsert: (message, key) => {
        primaryBatch.upsert(message, key);
        if (replicaBatch) {
          replicaBatch.upsert(replica.transformMessage ? replica.transformMessage(message) : message, key);
        }
      },
      stop: () => {
        primaryBatch.stop();
        if (replicaBatch) {
          replicaBatch.stop();
        }
      }
    };
  }
  var init_startBatchWithReplica = __esm({
    "../packages/core/src/transport/startBatchWithReplica.ts"() {
      "use strict";
      init_batch();
      init_httpRequest();
      init_flushController();
    }
  });

  // ../packages/core/src/transport/index.ts
  var init_transport = __esm({
    "../packages/core/src/transport/index.ts"() {
      "use strict";
      init_httpRequest();
      init_eventBridge();
      init_startBatchWithReplica();
    }
  });

  // ../packages/core/src/tools/encoder.ts
  function createIdentityEncoder() {
    let output = "";
    let outputBytesCount = 0;
    return {
      isAsync: false,
      get isEmpty() {
        return !output;
      },
      write(data, callback) {
        const additionalEncodedBytesCount = computeBytesCount(data);
        outputBytesCount += additionalEncodedBytesCount;
        output += data;
        if (callback) {
          callback(additionalEncodedBytesCount);
        }
      },
      finish(callback) {
        callback(this.finishSync());
      },
      finishSync() {
        const result = {
          output,
          outputBytesCount,
          rawBytesCount: outputBytesCount,
          pendingData: ""
        };
        output = "";
        outputBytesCount = 0;
        return result;
      },
      estimateEncodedBytesCount(data) {
        return data.length;
      }
    };
  }
  var init_encoder = __esm({
    "../packages/core/src/tools/encoder.ts"() {
      "use strict";
      init_byteUtils();
    }
  });

  // ../packages/core/src/tools/abstractLifeCycle.ts
  var AbstractLifeCycle;
  var init_abstractLifeCycle = __esm({
    "../packages/core/src/tools/abstractLifeCycle.ts"() {
      "use strict";
      AbstractLifeCycle = class {
        constructor() {
          this.callbacks = {};
        }
        notify(eventType, data) {
          const eventCallbacks = this.callbacks[eventType];
          if (eventCallbacks) {
            eventCallbacks.forEach((callback) => callback(data));
          }
        }
        subscribe(eventType, callback) {
          if (!this.callbacks[eventType]) {
            this.callbacks[eventType] = [];
          }
          this.callbacks[eventType].push(callback);
          return {
            unsubscribe: () => {
              this.callbacks[eventType] = this.callbacks[eventType].filter((other) => callback !== other);
            }
          };
        }
      };
    }
  });

  // ../packages/core/src/domain/eventRateLimiter/createEventRateLimiter.ts
  function createEventRateLimiter(eventType, limit, onLimitReached) {
    let eventCount = 0;
    let allowNextEvent = false;
    return {
      isLimitReached() {
        if (eventCount === 0) {
          setTimeout(() => {
            eventCount = 0;
          }, ONE_MINUTE);
        }
        eventCount += 1;
        if (eventCount <= limit || allowNextEvent) {
          allowNextEvent = false;
          return false;
        }
        if (eventCount === limit + 1) {
          allowNextEvent = true;
          try {
            onLimitReached({
              message: `Reached max number of ${eventType}s by minute: ${limit}`,
              source: ErrorSource.AGENT,
              startClocks: clocksNow()
            });
          } finally {
            allowNextEvent = false;
          }
        }
        return true;
      }
    };
  }
  var init_createEventRateLimiter = __esm({
    "../packages/core/src/domain/eventRateLimiter/createEventRateLimiter.ts"() {
      "use strict";
      init_timer();
      init_timeUtils();
      init_error_types();
    }
  });

  // ../packages/core/src/browser/runOnReadyState.ts
  function runOnReadyState(configuration, expectedReadyState, callback) {
    if (document.readyState === expectedReadyState || document.readyState === "complete") {
      callback();
      return { stop: noop };
    }
    const eventName = expectedReadyState === "complete" ? "load" /* LOAD */ : "DOMContentLoaded" /* DOM_CONTENT_LOADED */;
    return addEventListener(configuration, window, eventName, callback, { once: true });
  }
  function asyncRunOnReadyState(configuration, expectedReadyState) {
    return new Promise((resolve) => {
      runOnReadyState(configuration, expectedReadyState, resolve);
    });
  }
  var init_runOnReadyState = __esm({
    "../packages/core/src/browser/runOnReadyState.ts"() {
      "use strict";
      init_functionUtils();
      init_addEventListener();
    }
  });

  // ../packages/core/src/browser/xhrObservable.ts
  function initXhrObservable(configuration) {
    if (!xhrObservable) {
      xhrObservable = createXhrObservable(configuration);
    }
    return xhrObservable;
  }
  function createXhrObservable(configuration) {
    return new Observable((observable) => {
      const { stop: stopInstrumentingStart } = instrumentMethod(XMLHttpRequest.prototype, "open", openXhr);
      const { stop: stopInstrumentingSend } = instrumentMethod(
        XMLHttpRequest.prototype,
        "send",
        (call) => {
          sendXhr(call, configuration, observable);
        },
        { computeHandlingStack: true }
      );
      const { stop: stopInstrumentingAbort } = instrumentMethod(XMLHttpRequest.prototype, "abort", abortXhr);
      return () => {
        stopInstrumentingStart();
        stopInstrumentingSend();
        stopInstrumentingAbort();
      };
    });
  }
  function openXhr({ target: xhr, parameters: [method, url] }) {
    xhrContexts.set(xhr, {
      state: "open",
      method: String(method).toUpperCase(),
      url: normalizeUrl(String(url))
    });
  }
  function sendXhr({ target: xhr, handlingStack }, configuration, observable) {
    const context = xhrContexts.get(xhr);
    if (!context) {
      return;
    }
    const startContext = context;
    startContext.state = "start";
    startContext.startClocks = clocksNow();
    startContext.isAborted = false;
    startContext.xhr = xhr;
    startContext.handlingStack = handlingStack;
    let hasBeenReported = false;
    const { stop: stopInstrumentingOnReadyStateChange } = instrumentMethod(xhr, "onreadystatechange", () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        onEnd();
      }
    });
    const onEnd = () => {
      unsubscribeLoadEndListener();
      stopInstrumentingOnReadyStateChange();
      if (hasBeenReported) {
        return;
      }
      hasBeenReported = true;
      const completeContext = context;
      completeContext.state = "complete";
      completeContext.duration = elapsed(startContext.startClocks.timeStamp, timeStampNow());
      completeContext.status = xhr.status;
      observable.notify(shallowClone(completeContext));
    };
    const { stop: unsubscribeLoadEndListener } = addEventListener(configuration, xhr, "loadend", onEnd);
    observable.notify(startContext);
  }
  function abortXhr({ target: xhr }) {
    const context = xhrContexts.get(xhr);
    if (context) {
      context.isAborted = true;
    }
  }
  var xhrObservable, xhrContexts;
  var init_xhrObservable = __esm({
    "../packages/core/src/browser/xhrObservable.ts"() {
      "use strict";
      init_instrumentMethod();
      init_observable();
      init_timeUtils();
      init_urlPolyfill();
      init_objectUtils();
      init_addEventListener();
      xhrContexts = /* @__PURE__ */ new WeakMap();
    }
  });

  // ../packages/core/src/browser/fetchObservable.ts
  function initFetchObservable() {
    if (!fetchObservable) {
      fetchObservable = createFetchObservable();
    }
    return fetchObservable;
  }
  function createFetchObservable() {
    return new Observable((observable) => {
      if (!window.fetch) {
        return;
      }
      const { stop } = instrumentMethod(window, "fetch", (call) => beforeSend(call, observable), {
        computeHandlingStack: true
      });
      return stop;
    });
  }
  function beforeSend({ parameters, onPostCall, handlingStack }, observable) {
    const [input, init] = parameters;
    let methodFromParams = init && init.method;
    if (methodFromParams === void 0 && input instanceof Request) {
      methodFromParams = input.method;
    }
    const method = methodFromParams !== void 0 ? String(methodFromParams).toUpperCase() : "GET";
    const url = input instanceof Request ? input.url : normalizeUrl(String(input));
    const startClocks = clocksNow();
    const context = {
      state: "start",
      init,
      input,
      method,
      startClocks,
      url,
      handlingStack
    };
    observable.notify(context);
    parameters[0] = context.input;
    parameters[1] = context.init;
    onPostCall((responsePromise) => afterSend(observable, responsePromise, context));
  }
  function afterSend(observable, responsePromise, startContext) {
    const context = startContext;
    function reportFetch(partialContext) {
      context.state = "resolve";
      Object.assign(context, partialContext);
      observable.notify(context);
    }
    responsePromise.then(
      monitor((response) => {
        reportFetch({
          response,
          responseType: response.type,
          status: response.status,
          isAborted: false
        });
      }),
      monitor((error) => {
        reportFetch({
          status: 0,
          isAborted: context.init?.signal?.aborted || error instanceof DOMException && error.code === DOMException.ABORT_ERR,
          error
        });
      })
    );
  }
  var fetchObservable;
  var init_fetchObservable = __esm({
    "../packages/core/src/browser/fetchObservable.ts"() {
      "use strict";
      init_instrumentMethod();
      init_monitor();
      init_observable();
      init_timeUtils();
      init_urlPolyfill();
    }
  });

  // ../packages/core/src/tools/requestIdleCallback.ts
  function requestIdleCallback(callback, opts) {
    if (window.requestIdleCallback && window.cancelIdleCallback) {
      const id = window.requestIdleCallback(monitor(callback), opts);
      return () => window.cancelIdleCallback(id);
    }
    return requestIdleCallbackShim(callback);
  }
  function requestIdleCallbackShim(callback) {
    const start = dateNow();
    const timeoutId = setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, MAX_TASK_TIME - (dateNow() - start))
      });
    }, 0);
    return () => clearTimeout(timeoutId);
  }
  var MAX_TASK_TIME;
  var init_requestIdleCallback = __esm({
    "../packages/core/src/tools/requestIdleCallback.ts"() {
      "use strict";
      init_timer();
      init_monitor();
      init_timeUtils();
      MAX_TASK_TIME = 50;
    }
  });

  // ../packages/core/src/tools/taskQueue.ts
  function createTaskQueue() {
    const pendingTasks = [];
    function run(deadline) {
      let executionTimeRemaining;
      if (deadline.didTimeout) {
        const start = performance.now();
        executionTimeRemaining = () => MAX_EXECUTION_TIME_ON_TIMEOUT - (performance.now() - start);
      } else {
        executionTimeRemaining = deadline.timeRemaining.bind(deadline);
      }
      while (executionTimeRemaining() > 0 && pendingTasks.length) {
        pendingTasks.shift()();
      }
      if (pendingTasks.length) {
        scheduleNextRun();
      }
    }
    function scheduleNextRun() {
      requestIdleCallback(run, { timeout: IDLE_CALLBACK_TIMEOUT });
    }
    return {
      push(task) {
        if (pendingTasks.push(task) === 1) {
          scheduleNextRun();
        }
      }
    };
  }
  var IDLE_CALLBACK_TIMEOUT, MAX_EXECUTION_TIME_ON_TIMEOUT;
  var init_taskQueue = __esm({
    "../packages/core/src/tools/taskQueue.ts"() {
      "use strict";
      init_timeUtils();
      init_requestIdleCallback();
      IDLE_CALLBACK_TIMEOUT = ONE_SECOND;
      MAX_EXECUTION_TIME_ON_TIMEOUT = 30;
    }
  });

  // ../packages/core/src/domain/console/consoleObservable.ts
  function initConsoleObservable(apis) {
    const consoleObservables = apis.map((api) => {
      if (!consoleObservablesByApi[api]) {
        consoleObservablesByApi[api] = createConsoleObservable(api);
      }
      return consoleObservablesByApi[api];
    });
    return mergeObservables(...consoleObservables);
  }
  function createConsoleObservable(api) {
    return new Observable((observable) => {
      const originalConsoleApi = globalConsole[api];
      globalConsole[api] = (...params) => {
        originalConsoleApi.apply(console, params);
        const handlingStack = createHandlingStack("console error");
        callMonitored(() => {
          observable.notify(buildConsoleLog(params, api, handlingStack));
        });
      };
      return () => {
        globalConsole[api] = originalConsoleApi;
      };
    });
  }
  function buildConsoleLog(params, api, handlingStack) {
    const message = params.map((param) => formatConsoleParameters(param)).join(" ");
    let error;
    if (api === ConsoleApiName.error) {
      const firstErrorParam = params.find(isError);
      error = {
        stack: firstErrorParam ? toStackTraceString(computeStackTrace(firstErrorParam)) : void 0,
        fingerprint: tryToGetFingerprint(firstErrorParam),
        causes: firstErrorParam ? flattenErrorCauses(firstErrorParam, "console") : void 0,
        startClocks: clocksNow(),
        message,
        source: ErrorSource.CONSOLE,
        handling: "handled" /* HANDLED */,
        handlingStack,
        context: tryToGetErrorContext(firstErrorParam)
      };
    }
    return {
      api,
      message,
      error,
      handlingStack
    };
  }
  function formatConsoleParameters(param) {
    if (typeof param === "string") {
      return sanitize(param);
    }
    if (isError(param)) {
      return formatErrorMessage(computeStackTrace(param));
    }
    return jsonStringify(sanitize(param), void 0, 2);
  }
  var consoleObservablesByApi;
  var init_consoleObservable = __esm({
    "../packages/core/src/domain/console/consoleObservable.ts"() {
      "use strict";
      init_error();
      init_observable();
      init_display();
      init_monitor();
      init_sanitize();
      init_jsonStringify();
      init_error_types();
      init_computeStackTrace();
      init_handlingStack();
      init_timeUtils();
      consoleObservablesByApi = {};
    }
  });

  // ../packages/core/src/domain/context/contextUtils.ts
  function checkContext(maybeContext) {
    const isValid = getType(maybeContext) === "object";
    if (!isValid) {
      display.error("Unsupported context:", maybeContext);
    }
    return isValid;
  }
  var init_contextUtils = __esm({
    "../packages/core/src/domain/context/contextUtils.ts"() {
      "use strict";
      init_display();
      init_typeUtils();
    }
  });

  // ../packages/core/src/domain/context/contextManager.ts
  function ensureProperties(context, propertiesConfig, name) {
    const newContext = { ...context };
    for (const [key, { required, type }] of Object.entries(propertiesConfig)) {
      if (type === "string" && key in newContext) {
        newContext[key] = String(newContext[key]);
      }
      if (required && !(key in context)) {
        display.warn(`The property ${key} of ${name} is required; context will not be sent to the intake.`);
      }
    }
    return newContext;
  }
  function createContextManager(name = "", {
    customerDataTracker,
    propertiesConfig = {}
  } = {}) {
    let context = {};
    const changeObservable = new Observable();
    const contextManager = {
      getContext: () => deepClone(context),
      setContext: (newContext) => {
        if (checkContext(newContext)) {
          context = sanitize(ensureProperties(newContext, propertiesConfig, name));
          customerDataTracker?.updateCustomerData(context);
        } else {
          contextManager.clearContext();
        }
        changeObservable.notify();
      },
      setContextProperty: (key, property) => {
        context[key] = sanitize(ensureProperties({ [key]: property }, propertiesConfig, name)[key]);
        customerDataTracker?.updateCustomerData(context);
        changeObservable.notify();
      },
      removeContextProperty: (key) => {
        delete context[key];
        customerDataTracker?.updateCustomerData(context);
        ensureProperties(context, propertiesConfig, name);
        changeObservable.notify();
      },
      clearContext: () => {
        context = {};
        customerDataTracker?.resetCustomerData();
        changeObservable.notify();
      },
      changeObservable
    };
    return contextManager;
  }
  var init_contextManager = __esm({
    "../packages/core/src/domain/context/contextManager.ts"() {
      "use strict";
      init_mergeInto();
      init_sanitize();
      init_observable();
      init_display();
      init_contextUtils();
    }
  });

  // ../packages/core/src/domain/context/storeContextManager.ts
  function storeContextManager(configuration, contextManager, productKey, customerDataType) {
    const storageKey = buildStorageKey(productKey, customerDataType);
    storageListeners.push(
      addEventListener(configuration, window, "storage" /* STORAGE */, ({ key }) => {
        if (storageKey === key) {
          synchronizeWithStorage();
        }
      })
    );
    contextManager.changeObservable.subscribe(dumpToStorage);
    contextManager.setContext(combine(getFromStorage(), contextManager.getContext()));
    function synchronizeWithStorage() {
      contextManager.setContext(getFromStorage());
    }
    function dumpToStorage() {
      localStorage.setItem(storageKey, JSON.stringify(contextManager.getContext()));
    }
    function getFromStorage() {
      const rawContext = localStorage.getItem(storageKey);
      return rawContext !== null ? JSON.parse(rawContext) : {};
    }
  }
  function buildStorageKey(productKey, customerDataType) {
    return `${CONTEXT_STORE_KEY_PREFIX}_${productKey}_${customerDataType}`;
  }
  var CONTEXT_STORE_KEY_PREFIX, storageListeners;
  var init_storeContextManager = __esm({
    "../packages/core/src/domain/context/storeContextManager.ts"() {
      "use strict";
      init_addEventListener();
      init_mergeInto();
      CONTEXT_STORE_KEY_PREFIX = "_dd_c";
      storageListeners = [];
    }
  });

  // ../packages/core/src/domain/context/customerDataTracker.ts
  function createCustomerDataTrackerManager(compressionStatus = 2 /* Disabled */) {
    const customerDataTrackers = /* @__PURE__ */ new Map();
    let alreadyWarned = false;
    function checkCustomerDataLimit(initialBytesCount = 0) {
      if (alreadyWarned || compressionStatus === 0 /* Unknown */) {
        return;
      }
      const bytesCountLimit = compressionStatus === 2 /* Disabled */ ? CUSTOMER_DATA_BYTES_LIMIT : CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT;
      let bytesCount = initialBytesCount;
      customerDataTrackers.forEach((tracker) => {
        bytesCount += tracker.getBytesCount();
      });
      if (bytesCount > bytesCountLimit) {
        displayCustomerDataLimitReachedWarning(bytesCountLimit);
        alreadyWarned = true;
      }
    }
    return {
      /**
       * Creates a detached tracker. The manager will not store a reference to that tracker, and the
       * bytes count will be counted independently from other detached trackers.
       *
       * This is particularly useful when we don't know when the tracker will be unused, so we don't
       * leak memory (ex: when used in Logger instances).
       */
      createDetachedTracker: () => {
        const tracker = createCustomerDataTracker(() => checkCustomerDataLimit(tracker.getBytesCount()));
        return tracker;
      },
      /**
       * Creates a tracker if it doesn't exist, and returns it.
       */
      getOrCreateTracker: (type) => {
        if (!customerDataTrackers.has(type)) {
          customerDataTrackers.set(type, createCustomerDataTracker(checkCustomerDataLimit));
        }
        return customerDataTrackers.get(type);
      },
      setCompressionStatus: (newCompressionStatus) => {
        if (compressionStatus === 0 /* Unknown */) {
          compressionStatus = newCompressionStatus;
          checkCustomerDataLimit();
        }
      },
      getCompressionStatus: () => compressionStatus,
      stop: () => {
        customerDataTrackers.forEach((tracker) => tracker.stop());
        customerDataTrackers.clear();
      }
    };
  }
  function createCustomerDataTracker(checkCustomerDataLimit) {
    let bytesCountCache = 0;
    const { throttled: computeBytesCountThrottled, cancel: cancelComputeBytesCount } = throttle((context) => {
      bytesCountCache = computeBytesCount(jsonStringify(context));
      checkCustomerDataLimit();
    }, BYTES_COMPUTATION_THROTTLING_DELAY);
    const resetBytesCount = () => {
      cancelComputeBytesCount();
      bytesCountCache = 0;
    };
    return {
      updateCustomerData: (context) => {
        if (isEmptyObject(context)) {
          resetBytesCount();
        } else {
          computeBytesCountThrottled(context);
        }
      },
      resetCustomerData: resetBytesCount,
      getBytesCount: () => bytesCountCache,
      stop: () => {
        cancelComputeBytesCount();
      }
    };
  }
  function displayCustomerDataLimitReachedWarning(bytesCountLimit) {
    display.warn(
      `Customer data exceeds the recommended ${bytesCountLimit / ONE_KIBI_BYTE}KiB threshold. ${MORE_DETAILS} ${DOCS_TROUBLESHOOTING}/#customer-data-exceeds-the-recommended-threshold-warning`
    );
  }
  var CUSTOMER_DATA_BYTES_LIMIT, CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT, BYTES_COMPUTATION_THROTTLING_DELAY;
  var init_customerDataTracker = __esm({
    "../packages/core/src/domain/context/customerDataTracker.ts"() {
      "use strict";
      init_byteUtils();
      init_functionUtils();
      init_jsonStringify();
      init_display();
      init_objectUtils();
      CUSTOMER_DATA_BYTES_LIMIT = 3 * ONE_KIBI_BYTE;
      CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT = 16 * ONE_KIBI_BYTE;
      BYTES_COMPUTATION_THROTTLING_DELAY = 200;
    }
  });

  // ../packages/core/src/tools/readBytesFromStream.ts
  function readBytesFromStream(stream, callback, options) {
    const reader = stream.getReader();
    const chunks = [];
    let readBytesCount = 0;
    readMore();
    function readMore() {
      reader.read().then(
        monitor((result) => {
          if (result.done) {
            onDone();
            return;
          }
          if (options.collectStreamBody) {
            chunks.push(result.value);
          }
          readBytesCount += result.value.length;
          if (readBytesCount > options.bytesLimit) {
            onDone();
          } else {
            readMore();
          }
        }),
        monitor((error) => callback(error))
      );
    }
    function onDone() {
      reader.cancel().catch(
        // we don't care if cancel fails, but we still need to catch the error to avoid reporting it
        // as an unhandled rejection
        noop
      );
      let bytes;
      let limitExceeded;
      if (options.collectStreamBody) {
        let completeBuffer;
        if (chunks.length === 1) {
          completeBuffer = chunks[0];
        } else {
          completeBuffer = new Uint8Array(readBytesCount);
          let offset = 0;
          chunks.forEach((chunk) => {
            completeBuffer.set(chunk, offset);
            offset += chunk.length;
          });
        }
        bytes = completeBuffer.slice(0, options.bytesLimit);
        limitExceeded = completeBuffer.length > options.bytesLimit;
      }
      callback(void 0, bytes, limitExceeded);
    }
  }
  var init_readBytesFromStream = __esm({
    "../packages/core/src/tools/readBytesFromStream.ts"() {
      "use strict";
      init_monitor();
      init_functionUtils();
    }
  });

  // ../packages/core/src/domain/synthetics/syntheticsWorkerValues.ts
  function willSyntheticsInjectRum() {
    return Boolean(
      window._DATADOG_SYNTHETICS_INJECTS_RUM || getInitCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
    );
  }
  function getSyntheticsTestId() {
    const value = window._DATADOG_SYNTHETICS_PUBLIC_ID || getInitCookie(SYNTHETICS_TEST_ID_COOKIE_NAME);
    return typeof value === "string" ? value : void 0;
  }
  function getSyntheticsResultId() {
    const value = window._DATADOG_SYNTHETICS_RESULT_ID || getInitCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME);
    return typeof value === "string" ? value : void 0;
  }
  var SYNTHETICS_TEST_ID_COOKIE_NAME, SYNTHETICS_RESULT_ID_COOKIE_NAME, SYNTHETICS_INJECTS_RUM_COOKIE_NAME;
  var init_syntheticsWorkerValues = __esm({
    "../packages/core/src/domain/synthetics/syntheticsWorkerValues.ts"() {
      "use strict";
      init_cookie();
      SYNTHETICS_TEST_ID_COOKIE_NAME = "datadog-synthetics-public-id";
      SYNTHETICS_RESULT_ID_COOKIE_NAME = "datadog-synthetics-result-id";
      SYNTHETICS_INJECTS_RUM_COOKIE_NAME = "datadog-synthetics-injects-rum";
    }
  });

  // ../packages/core/src/domain/resourceUtils.ts
  var init_resourceUtils = __esm({
    "../packages/core/src/domain/resourceUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/tools/matchOption.ts
  function isMatchOption(item) {
    const itemType = getType(item);
    return itemType === "string" || itemType === "function" || item instanceof RegExp;
  }
  function matchList(list, value, useStartsWith = false) {
    return list.some((item) => {
      try {
        if (typeof item === "function") {
          return item(value);
        } else if (item instanceof RegExp) {
          return item.test(value);
        } else if (typeof item === "string") {
          return useStartsWith ? value.startsWith(item) : item === value;
        }
      } catch (e) {
        display.error(e);
      }
      return false;
    });
  }
  var init_matchOption = __esm({
    "../packages/core/src/tools/matchOption.ts"() {
      "use strict";
      init_display();
      init_typeUtils();
    }
  });

  // ../packages/core/src/domain/deflate/deflate.types.ts
  var init_deflate_types = __esm({
    "../packages/core/src/domain/deflate/deflate.types.ts"() {
      "use strict";
    }
  });

  // ../packages/core/src/domain/deflate/index.ts
  var init_deflate = __esm({
    "../packages/core/src/domain/deflate/index.ts"() {
      "use strict";
      init_deflate_types();
    }
  });

  // ../packages/core/src/index.ts
  var init_src = __esm({
    "../packages/core/src/index.ts"() {
      "use strict";
      init_configuration2();
      init_trackingConsent();
      init_experimentalFeatures();
      init_trackRuntimeError();
      init_computeStackTrace();
      init_init();
      init_displayAlreadyInitializedError();
      init_reportObservable();
      init_telemetry2();
      init_monitor();
      init_observable();
      init_sessionManager();
      init_sessionConstants();
      init_transport();
      init_display();
      init_encoder();
      init_urlPolyfill();
      init_timeUtils();
      init_arrayUtils();
      init_sanitize();
      init_getGlobalObject();
      init_abstractLifeCycle();
      init_createEventRateLimiter();
      init_browserDetection();
      init_sendToExtension();
      init_runOnReadyState();
      init_getZoneJsOriginalValue();
      init_instrumentMethod();
      init_error();
      init_cookie();
      init_xhrObservable();
      init_fetchObservable();
      init_pageExitObservable();
      init_addEventListener();
      init_requestIdleCallback();
      init_taskQueue();
      init_timer();
      init_consoleObservable();
      init_boundedBuffer();
      init_contextManager();
      init_storeContextManager();
      init_customerDataTracker();
      init_valueHistory();
      init_readBytesFromStream();
      init_syntheticsWorkerValues();
      init_resourceUtils();
      init_polyfills();
      init_numberUtils();
      init_byteUtils();
      init_objectUtils();
      init_functionUtils();
      init_jsonStringify();
      init_mergeInto();
      init_stringUtils();
      init_matchOption();
      init_responseUtils();
      init_typeUtils();
      init_error_types();
      init_deflate();
      init_connectivity2();
      init_handlingStack();
    }
  });

  // ../packages/rum-core/src/rawRumEvent.types.ts
  var init_rawRumEvent_types = __esm({
    "../packages/rum-core/src/rawRumEvent.types.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/domain/contexts/commonContext.ts
  function buildCommonContext(globalContextManager, userContextManager, accountContextManager, recorderApi2) {
    return {
      context: globalContextManager.getContext(),
      user: userContextManager.getContext(),
      account: accountContextManager.getContext(),
      hasReplay: recorderApi2.isRecording() ? true : void 0
    };
  }
  var init_commonContext = __esm({
    "../packages/rum-core/src/domain/contexts/commonContext.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/domain/lifeCycle.ts
  var LifeCycle;
  var init_lifeCycle = __esm({
    "../packages/rum-core/src/domain/lifeCycle.ts"() {
      "use strict";
      init_src();
      LifeCycle = AbstractLifeCycle;
    }
  });

  // ../packages/rum-core/src/hooks.ts
  function createHooks() {
    const callbacks = {};
    return {
      register(hookName, callback) {
        if (!callbacks[hookName]) {
          callbacks[hookName] = [];
        }
        callbacks[hookName].push(callback);
        return {
          unregister: () => {
            callbacks[hookName] = callbacks[hookName].filter((cb) => cb !== callback);
          }
        };
      },
      triggerHook(hookName, param) {
        const hookCallbacks = callbacks[hookName] || [];
        const results = hookCallbacks.map((callback) => callback(param));
        return combine(...results);
      }
    };
  }
  var init_hooks = __esm({
    "../packages/rum-core/src/hooks.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/contexts/pageStateHistory.ts
  function startPageStateHistory(hooks, configuration, maxPageStateEntriesSelectable = MAX_PAGE_STATE_ENTRIES_SELECTABLE) {
    const pageStateEntryHistory = createValueHistory({
      expireDelay: PAGE_STATE_CONTEXT_TIME_OUT_DELAY,
      maxEntries: MAX_PAGE_STATE_ENTRIES
    });
    let currentPageState;
    addPageState(getPageState(), relativeNow());
    const { stop: stopEventListeners } = addEventListeners(
      configuration,
      window,
      [
        "pageshow" /* PAGE_SHOW */,
        "focus" /* FOCUS */,
        "blur" /* BLUR */,
        "visibilitychange" /* VISIBILITY_CHANGE */,
        "resume" /* RESUME */,
        "freeze" /* FREEZE */,
        "pagehide" /* PAGE_HIDE */
      ],
      (event) => {
        addPageState(computePageState(event), event.timeStamp);
      },
      { capture: true }
    );
    function addPageState(nextPageState, startTime = relativeNow()) {
      if (nextPageState === currentPageState) {
        return;
      }
      currentPageState = nextPageState;
      pageStateEntryHistory.closeActive(startTime);
      pageStateEntryHistory.add({ state: currentPageState, startTime }, startTime);
    }
    function wasInPageStateDuringPeriod(state2, startTime, duration) {
      return pageStateEntryHistory.findAll(startTime, duration).some((pageState) => pageState.state === state2);
    }
    hooks.register(
      0 /* Assemble */,
      ({ startTime, duration = 0, eventType }) => {
        if (eventType === "view" /* VIEW */) {
          const pageStates = pageStateEntryHistory.findAll(startTime, duration);
          return {
            type: eventType,
            _dd: { page_states: processPageStates(pageStates, startTime, maxPageStateEntriesSelectable) }
          };
        }
        if (eventType === "action" /* ACTION */ || eventType === "error" /* ERROR */) {
          return {
            type: eventType,
            view: { in_foreground: wasInPageStateDuringPeriod("active" /* ACTIVE */, startTime, 0) }
          };
        }
      }
    );
    return {
      wasInPageStateDuringPeriod,
      addPageState,
      stop: () => {
        stopEventListeners();
        pageStateEntryHistory.stop();
      }
    };
  }
  function processPageStates(pageStateEntries, eventStartTime, maxPageStateEntriesSelectable) {
    if (pageStateEntries.length === 0) {
      return;
    }
    return pageStateEntries.slice(-maxPageStateEntriesSelectable).reverse().map(({ state: state2, startTime }) => ({
      state: state2,
      start: toServerDuration(elapsed(eventStartTime, startTime))
    }));
  }
  function computePageState(event) {
    if (event.type === "freeze" /* FREEZE */) {
      return "frozen" /* FROZEN */;
    } else if (event.type === "pagehide" /* PAGE_HIDE */) {
      return event.persisted ? "frozen" /* FROZEN */ : "terminated" /* TERMINATED */;
    }
    return getPageState();
  }
  function getPageState() {
    if (document.visibilityState === "hidden") {
      return "hidden" /* HIDDEN */;
    }
    if (document.hasFocus()) {
      return "active" /* ACTIVE */;
    }
    return "passive" /* PASSIVE */;
  }
  var MAX_PAGE_STATE_ENTRIES, MAX_PAGE_STATE_ENTRIES_SELECTABLE, PAGE_STATE_CONTEXT_TIME_OUT_DELAY;
  var init_pageStateHistory = __esm({
    "../packages/rum-core/src/domain/contexts/pageStateHistory.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_hooks();
      MAX_PAGE_STATE_ENTRIES = 4e3;
      MAX_PAGE_STATE_ENTRIES_SELECTABLE = 500;
      PAGE_STATE_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
    }
  });

  // ../packages/rum-core/src/domain/vital/vitalCollection.ts
  function createCustomVitalsState() {
    const vitalsByName = /* @__PURE__ */ new Map();
    const vitalsByReference = /* @__PURE__ */ new WeakMap();
    return { vitalsByName, vitalsByReference };
  }
  function startVitalCollection(lifeCycle, pageStateHistory, customVitalsState) {
    function isValid(vital) {
      return !pageStateHistory.wasInPageStateDuringPeriod("frozen" /* FROZEN */, vital.startClocks.relative, vital.duration);
    }
    function addDurationVital(vital) {
      if (isValid(vital)) {
        lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, processVital(vital, true));
      }
    }
    return {
      addDurationVital,
      startDurationVital: (name, options = {}) => startDurationVital(customVitalsState, name, options),
      stopDurationVital: (nameOrRef, options = {}) => {
        stopDurationVital(addDurationVital, customVitalsState, nameOrRef, options);
      }
    };
  }
  function startDurationVital({ vitalsByName, vitalsByReference }, name, options = {}) {
    const vital = {
      name,
      startClocks: clocksNow(),
      context: options.context,
      description: options.description
    };
    const reference = { __dd_vital_reference: true };
    vitalsByName.set(name, vital);
    vitalsByReference.set(reference, vital);
    return reference;
  }
  function stopDurationVital(stopCallback, { vitalsByName, vitalsByReference }, nameOrRef, options = {}) {
    const vitalStart = typeof nameOrRef === "string" ? vitalsByName.get(nameOrRef) : vitalsByReference.get(nameOrRef);
    if (!vitalStart) {
      return;
    }
    stopCallback(buildDurationVital(vitalStart, vitalStart.startClocks, options, clocksNow()));
    if (typeof nameOrRef === "string") {
      vitalsByName.delete(nameOrRef);
    } else {
      vitalsByReference.delete(nameOrRef);
    }
  }
  function buildDurationVital(vitalStart, startClocks, stopOptions, stopClocks) {
    return {
      name: vitalStart.name,
      type: "duration" /* DURATION */,
      startClocks,
      duration: elapsed(startClocks.timeStamp, stopClocks.timeStamp),
      context: combine(vitalStart.context, stopOptions.context),
      description: stopOptions.description ?? vitalStart.description
    };
  }
  function processVital(vital, valueComputedBySdk) {
    const rawRumEvent = {
      date: vital.startClocks.timeStamp,
      vital: {
        id: generateUUID(),
        type: vital.type,
        name: vital.name,
        duration: toServerDuration(vital.duration),
        description: vital.description
      },
      type: "vital" /* VITAL */
    };
    if (valueComputedBySdk) {
      rawRumEvent._dd = {
        vital: {
          computed_value: true
        }
      };
    }
    return {
      rawRumEvent,
      startTime: vital.startClocks.relative,
      duration: vital.duration,
      customerContext: vital.context,
      domainContext: {}
    };
  }
  var init_vitalCollection = __esm({
    "../packages/rum-core/src/domain/vital/vitalCollection.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      init_rawRumEvent_types();
      init_pageStateHistory();
    }
  });

  // ../packages/rum-core/src/domain/plugins.ts
  function callPluginsMethod(plugins, methodName, parameter) {
    if (!plugins) {
      return;
    }
    for (const plugin of plugins) {
      const method = plugin[methodName];
      if (method) {
        method(parameter);
      }
    }
  }
  var init_plugins = __esm({
    "../packages/rum-core/src/domain/plugins.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/domain/tracing/identifier.ts
  function createTraceIdentifier() {
    return createIdentifier(64);
  }
  function createSpanIdentifier() {
    return createIdentifier(63);
  }
  function createIdentifier(bits) {
    const buffer = crypto.getRandomValues(new Uint32Array(2));
    if (bits === 63) {
      buffer[buffer.length - 1] >>>= 1;
    }
    return {
      toString(radix = 10) {
        let high = buffer[1];
        let low = buffer[0];
        let str = "";
        do {
          const mod = high % radix * 4294967296 + low;
          high = Math.floor(high / radix);
          low = Math.floor(mod / radix);
          str = (mod % radix).toString(radix) + str;
        } while (high || low);
        return str;
      }
    };
  }
  function toPaddedHexadecimalString(id) {
    return id.toString(16).padStart(16, "0");
  }
  var init_identifier = __esm({
    "../packages/rum-core/src/domain/tracing/identifier.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/domain/tracing/sampler.ts
  function isTraceSampled(sessionId, sampleRate) {
    if (sampleRate === 100) {
      return true;
    }
    if (sampleRate === 0) {
      return false;
    }
    if (sampleDecisionCache && sessionId === sampleDecisionCache.sessionId) {
      return sampleDecisionCache.decision;
    }
    let decision;
    if (window.BigInt) {
      decision = sampleUsingKnuthFactor(BigInt(`0x${sessionId.split("-")[4]}`), sampleRate);
    } else {
      decision = performDraw(sampleRate);
    }
    sampleDecisionCache = { sessionId, decision };
    return decision;
  }
  function sampleUsingKnuthFactor(identifier, sampleRate) {
    const knuthFactor = BigInt("1111111111111111111");
    const twoPow64 = BigInt("0x10000000000000000");
    const hash = identifier * knuthFactor % twoPow64;
    return Number(hash) <= sampleRate / 100 * Number(twoPow64);
  }
  var sampleDecisionCache;
  var init_sampler = __esm({
    "../packages/rum-core/src/domain/tracing/sampler.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/tracing/tracer.ts
  function isTracingOption(item) {
    const expectedItem = item;
    return getType(expectedItem) === "object" && isMatchOption(expectedItem.match) && Array.isArray(expectedItem.propagatorTypes);
  }
  function clearTracingIfNeeded(context) {
    if (context.status === 0 && !context.isAborted) {
      context.traceId = void 0;
      context.spanId = void 0;
      context.traceSampled = void 0;
    }
  }
  function startTracer(configuration, sessionManager) {
    return {
      clearTracingIfNeeded,
      traceFetch: (context) => injectHeadersIfTracingAllowed(configuration, context, sessionManager, (tracingHeaders) => {
        if (context.input instanceof Request && !context.init?.headers) {
          context.input = new Request(context.input);
          Object.keys(tracingHeaders).forEach((key) => {
            ;
            context.input.headers.append(key, tracingHeaders[key]);
          });
        } else {
          context.init = shallowClone(context.init);
          const headers = [];
          if (context.init.headers instanceof Headers) {
            context.init.headers.forEach((value, key) => {
              headers.push([key, value]);
            });
          } else if (Array.isArray(context.init.headers)) {
            context.init.headers.forEach((header) => {
              headers.push(header);
            });
          } else if (context.init.headers) {
            Object.keys(context.init.headers).forEach((key) => {
              headers.push([key, context.init.headers[key]]);
            });
          }
          context.init.headers = headers.concat(objectEntries(tracingHeaders));
        }
      }),
      traceXhr: (context, xhr) => injectHeadersIfTracingAllowed(configuration, context, sessionManager, (tracingHeaders) => {
        Object.keys(tracingHeaders).forEach((name) => {
          xhr.setRequestHeader(name, tracingHeaders[name]);
        });
      })
    };
  }
  function injectHeadersIfTracingAllowed(configuration, context, sessionManager, inject) {
    const session = sessionManager.findTrackedSession();
    if (!session) {
      return;
    }
    const tracingOption = configuration.allowedTracingUrls.find(
      (tracingOption2) => matchList([tracingOption2.match], context.url, true)
    );
    if (!tracingOption) {
      return;
    }
    const traceSampled = isTraceSampled(session.id, configuration.traceSampleRate);
    const shouldInjectHeaders = traceSampled || configuration.traceContextInjection === TraceContextInjection.ALL;
    if (!shouldInjectHeaders) {
      return;
    }
    context.traceSampled = traceSampled;
    context.traceId = createTraceIdentifier();
    context.spanId = createSpanIdentifier();
    inject(makeTracingHeaders(context.traceId, context.spanId, context.traceSampled, tracingOption.propagatorTypes));
  }
  function makeTracingHeaders(traceId, spanId, traceSampled, propagatorTypes) {
    const tracingHeaders = {};
    propagatorTypes.forEach((propagatorType) => {
      switch (propagatorType) {
        case "datadog": {
          Object.assign(tracingHeaders, {
            "x-datadog-origin": "rum",
            "x-datadog-parent-id": spanId.toString(),
            "x-datadog-sampling-priority": traceSampled ? "1" : "0",
            "x-datadog-trace-id": traceId.toString()
          });
          break;
        }
        // https://www.w3.org/TR/trace-context/
        case "tracecontext": {
          Object.assign(tracingHeaders, {
            traceparent: `00-0000000000000000${toPaddedHexadecimalString(traceId)}-${toPaddedHexadecimalString(spanId)}-0${traceSampled ? "1" : "0"}`,
            tracestate: `dd=s:${traceSampled ? "1" : "0"};o:rum`
          });
          break;
        }
        // https://github.com/openzipkin/b3-propagation
        case "b3": {
          Object.assign(tracingHeaders, {
            b3: `${toPaddedHexadecimalString(traceId)}-${toPaddedHexadecimalString(spanId)}-${traceSampled ? "1" : "0"}`
          });
          break;
        }
        case "b3multi": {
          Object.assign(tracingHeaders, {
            "X-B3-TraceId": toPaddedHexadecimalString(traceId),
            "X-B3-SpanId": toPaddedHexadecimalString(spanId),
            "X-B3-Sampled": traceSampled ? "1" : "0"
          });
          break;
        }
      }
    });
    return tracingHeaders;
  }
  var init_tracer = __esm({
    "../packages/rum-core/src/domain/tracing/tracer.ts"() {
      "use strict";
      init_src();
      init_identifier();
      init_sampler();
    }
  });

  // ../packages/rum-core/src/domain/configuration/configuration.ts
  function validateAndBuildRumConfiguration(initConfiguration) {
    if (initConfiguration.trackFeatureFlagsForEvents !== void 0 && !Array.isArray(initConfiguration.trackFeatureFlagsForEvents)) {
      display.warn("trackFeatureFlagsForEvents should be an array");
    }
    if (!initConfiguration.applicationId) {
      display.error("Application ID is not configured, no RUM data will be collected.");
      return;
    }
    if (!isSampleRate(initConfiguration.sessionReplaySampleRate, "Session Replay") || !isSampleRate(initConfiguration.traceSampleRate, "Trace")) {
      return;
    }
    if (initConfiguration.excludedActivityUrls !== void 0 && !Array.isArray(initConfiguration.excludedActivityUrls)) {
      display.error("Excluded Activity Urls should be an array");
      return;
    }
    const allowedTracingUrls = validateAndBuildTracingOptions(initConfiguration);
    if (!allowedTracingUrls) {
      return;
    }
    const baseConfiguration = validateAndBuildConfiguration(initConfiguration);
    if (!baseConfiguration) {
      return;
    }
    const sessionReplaySampleRate = initConfiguration.sessionReplaySampleRate ?? 0;
    return {
      applicationId: initConfiguration.applicationId,
      version: initConfiguration.version || void 0,
      actionNameAttribute: initConfiguration.actionNameAttribute,
      sessionReplaySampleRate,
      startSessionReplayRecordingManually: initConfiguration.startSessionReplayRecordingManually !== void 0 ? !!initConfiguration.startSessionReplayRecordingManually : sessionReplaySampleRate === 0,
      traceSampleRate: initConfiguration.traceSampleRate ?? 100,
      rulePsr: isNumber(initConfiguration.traceSampleRate) ? initConfiguration.traceSampleRate / 100 : void 0,
      allowedTracingUrls,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
      workerUrl: initConfiguration.workerUrl,
      compressIntakeRequests: !!initConfiguration.compressIntakeRequests,
      trackUserInteractions: !!(initConfiguration.trackUserInteractions ?? true),
      trackViewsManually: !!initConfiguration.trackViewsManually,
      trackResources: !!(initConfiguration.trackResources ?? true),
      trackLongTasks: !!(initConfiguration.trackLongTasks ?? true),
      subdomain: initConfiguration.subdomain,
      defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel) ? initConfiguration.defaultPrivacyLevel : DefaultPrivacyLevel.MASK,
      enablePrivacyForActionName: !!initConfiguration.enablePrivacyForActionName,
      customerDataTelemetrySampleRate: 1,
      traceContextInjection: objectHasValue(TraceContextInjection, initConfiguration.traceContextInjection) ? initConfiguration.traceContextInjection : TraceContextInjection.SAMPLED,
      plugins: initConfiguration.plugins || [],
      trackFeatureFlagsForEvents: initConfiguration.trackFeatureFlagsForEvents || [],
      ...baseConfiguration
    };
  }
  function validateAndBuildTracingOptions(initConfiguration) {
    if (initConfiguration.allowedTracingUrls === void 0) {
      return [];
    }
    if (!Array.isArray(initConfiguration.allowedTracingUrls)) {
      display.error("Allowed Tracing URLs should be an array");
      return;
    }
    if (initConfiguration.allowedTracingUrls.length !== 0 && initConfiguration.service === void 0) {
      display.error("Service needs to be configured when tracing is enabled");
      return;
    }
    const tracingOptions = [];
    initConfiguration.allowedTracingUrls.forEach((option) => {
      if (isMatchOption(option)) {
        tracingOptions.push({ match: option, propagatorTypes: DEFAULT_PROPAGATOR_TYPES });
      } else if (isTracingOption(option)) {
        tracingOptions.push(option);
      } else {
        display.warn(
          "Allowed Tracing Urls parameters should be a string, RegExp, function, or an object. Ignoring parameter",
          option
        );
      }
    });
    return tracingOptions;
  }
  function getSelectedTracingPropagators(configuration) {
    const usedTracingPropagators = /* @__PURE__ */ new Set();
    if (Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0) {
      configuration.allowedTracingUrls.forEach((option) => {
        if (isMatchOption(option)) {
          DEFAULT_PROPAGATOR_TYPES.forEach((propagatorType) => usedTracingPropagators.add(propagatorType));
        } else if (getType(option) === "object" && Array.isArray(option.propagatorTypes)) {
          option.propagatorTypes.forEach((propagatorType) => usedTracingPropagators.add(propagatorType));
        }
      });
    }
    return Array.from(usedTracingPropagators);
  }
  function serializeRumConfiguration(configuration) {
    const baseSerializedConfiguration = serializeConfiguration(configuration);
    return {
      session_replay_sample_rate: configuration.sessionReplaySampleRate,
      start_session_replay_recording_manually: configuration.startSessionReplayRecordingManually,
      trace_sample_rate: configuration.traceSampleRate,
      trace_context_injection: configuration.traceContextInjection,
      action_name_attribute: configuration.actionNameAttribute,
      use_allowed_tracing_urls: Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0,
      selected_tracing_propagators: getSelectedTracingPropagators(configuration),
      default_privacy_level: configuration.defaultPrivacyLevel,
      enable_privacy_for_action_name: configuration.enablePrivacyForActionName,
      use_excluded_activity_urls: Array.isArray(configuration.excludedActivityUrls) && configuration.excludedActivityUrls.length > 0,
      use_worker_url: !!configuration.workerUrl,
      compress_intake_requests: configuration.compressIntakeRequests,
      track_views_manually: configuration.trackViewsManually,
      track_user_interactions: configuration.trackUserInteractions,
      track_resources: configuration.trackResources,
      track_long_task: configuration.trackLongTasks,
      plugins: configuration.plugins?.map((plugin) => ({
        name: plugin.name,
        ...plugin.getConfigurationTelemetry?.()
      })),
      track_feature_flags_for_events: configuration.trackFeatureFlagsForEvents,
      ...baseSerializedConfiguration
    };
  }
  var DEFAULT_PROPAGATOR_TYPES;
  var init_configuration3 = __esm({
    "../packages/rum-core/src/domain/configuration/configuration.ts"() {
      "use strict";
      init_src();
      init_tracer();
      DEFAULT_PROPAGATOR_TYPES = ["tracecontext", "datadog"];
    }
  });

  // ../packages/rum-core/src/domain/configuration/remoteConfiguration.ts
  function fetchAndApplyRemoteConfiguration(initConfiguration, callback) {
    fetchRemoteConfiguration(initConfiguration, (remoteInitConfiguration) => {
      callback(applyRemoteConfiguration(initConfiguration, remoteInitConfiguration));
    });
  }
  function applyRemoteConfiguration(initConfiguration, remoteInitConfiguration) {
    return { ...initConfiguration, ...remoteInitConfiguration };
  }
  function fetchRemoteConfiguration(configuration, callback) {
    const xhr = new XMLHttpRequest();
    addEventListener(configuration, xhr, "load", function() {
      if (xhr.status === 200) {
        const remoteConfiguration = JSON.parse(xhr.responseText);
        callback(remoteConfiguration.rum);
      } else {
        displayRemoteConfigurationFetchingError();
      }
    });
    addEventListener(configuration, xhr, "error", function() {
      displayRemoteConfigurationFetchingError();
    });
    xhr.open("GET", buildEndpoint(configuration));
    xhr.send();
  }
  function buildEndpoint(configuration) {
    return `https://sdk-configuration.${buildEndpointHost("rum", configuration)}/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(configuration.remoteConfigurationId)}.json`;
  }
  function displayRemoteConfigurationFetchingError() {
    display.error("Error fetching the remote configuration.");
  }
  var REMOTE_CONFIGURATION_VERSION;
  var init_remoteConfiguration = __esm({
    "../packages/rum-core/src/domain/configuration/remoteConfiguration.ts"() {
      "use strict";
      init_src();
      REMOTE_CONFIGURATION_VERSION = "v1";
    }
  });

  // ../packages/rum-core/src/domain/configuration/index.ts
  var init_configuration4 = __esm({
    "../packages/rum-core/src/domain/configuration/index.ts"() {
      "use strict";
      init_configuration3();
      init_remoteConfiguration();
    }
  });

  // ../packages/rum-core/src/boot/preStartRum.ts
  function createPreStartStrategy({ ignoreInitIfSyntheticsWillInjectRum, startDeflateWorker: startDeflateWorker2 }, getCommonContext, trackingConsentState, customVitalsState, doStartRum) {
    const bufferApiCalls = createBoundedBuffer();
    let firstStartViewCall;
    let deflateWorker;
    let cachedInitConfiguration;
    let cachedConfiguration;
    const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartRum);
    const emptyContext = {};
    function tryStartRum() {
      if (!cachedInitConfiguration || !cachedConfiguration || !trackingConsentState.isGranted()) {
        return;
      }
      trackingConsentStateSubscription.unsubscribe();
      let initialViewOptions;
      if (cachedConfiguration.trackViewsManually) {
        if (!firstStartViewCall) {
          return;
        }
        bufferApiCalls.remove(firstStartViewCall.callback);
        initialViewOptions = firstStartViewCall.options;
      }
      const startRumResult = doStartRum(cachedConfiguration, deflateWorker, initialViewOptions);
      bufferApiCalls.drain(startRumResult);
    }
    function doInit(initConfiguration) {
      const eventBridgeAvailable = canUseEventBridge();
      if (eventBridgeAvailable) {
        initConfiguration = overrideInitConfigurationForBridge(initConfiguration);
      }
      cachedInitConfiguration = initConfiguration;
      addTelemetryConfiguration(serializeRumConfiguration(initConfiguration));
      if (cachedConfiguration) {
        displayAlreadyInitializedError("DD_RUM", initConfiguration);
        return;
      }
      const configuration = validateAndBuildRumConfiguration(initConfiguration);
      if (!configuration) {
        return;
      }
      if (!eventBridgeAvailable && !configuration.sessionStoreStrategyType) {
        display.warn("No storage available for session. We will not send any data.");
        return;
      }
      if (configuration.compressIntakeRequests && !eventBridgeAvailable && startDeflateWorker2) {
        deflateWorker = startDeflateWorker2(
          configuration,
          "Datadog RUM",
          // Worker initialization can fail asynchronously, especially in Firefox where even CSP
          // issues are reported asynchronously. For now, the SDK will continue its execution even if
          // data won't be sent to Datadog. We could improve this behavior in the future.
          noop
        );
        if (!deflateWorker) {
          return;
        }
      }
      cachedConfiguration = configuration;
      initFetchObservable().subscribe(noop);
      trackingConsentState.tryToInit(configuration.trackingConsent);
      tryStartRum();
    }
    const addDurationVital = (vital) => {
      bufferApiCalls.add((startRumResult) => startRumResult.addDurationVital(vital));
    };
    const strategy = {
      init(initConfiguration, publicApi) {
        if (!initConfiguration) {
          display.error("Missing configuration");
          return;
        }
        initFeatureFlags(initConfiguration.enableExperimentalFeatures);
        cachedInitConfiguration = initConfiguration;
        if (ignoreInitIfSyntheticsWillInjectRum && willSyntheticsInjectRum()) {
          return;
        }
        callPluginsMethod(initConfiguration.plugins, "onInit", { initConfiguration, publicApi });
        if (initConfiguration.remoteConfigurationId) {
          fetchAndApplyRemoteConfiguration(initConfiguration, doInit);
        } else {
          doInit(initConfiguration);
        }
      },
      get initConfiguration() {
        return cachedInitConfiguration;
      },
      getInternalContext: noop,
      stopSession: noop,
      addTiming(name, time = timeStampNow()) {
        bufferApiCalls.add((startRumResult) => startRumResult.addTiming(name, time));
      },
      startView(options, startClocks = clocksNow()) {
        const callback = (startRumResult) => {
          startRumResult.startView(options, startClocks);
        };
        bufferApiCalls.add(callback);
        if (!firstStartViewCall) {
          firstStartViewCall = { options, callback };
          tryStartRum();
        }
      },
      setViewName(name) {
        bufferApiCalls.add((startRumResult) => startRumResult.setViewName(name));
      },
      setViewContext(context) {
        bufferApiCalls.add((startRumResult) => startRumResult.setViewContext(context));
      },
      setViewContextProperty(key, value) {
        bufferApiCalls.add((startRumResult) => startRumResult.setViewContextProperty(key, value));
      },
      getViewContext: () => emptyContext,
      addAction(action, commonContext = getCommonContext()) {
        bufferApiCalls.add((startRumResult) => startRumResult.addAction(action, commonContext));
      },
      addError(providedError, commonContext = getCommonContext()) {
        bufferApiCalls.add((startRumResult) => startRumResult.addError(providedError, commonContext));
      },
      addFeatureFlagEvaluation(key, value) {
        bufferApiCalls.add((startRumResult) => startRumResult.addFeatureFlagEvaluation(key, value));
      },
      startDurationVital(name, options) {
        return startDurationVital(customVitalsState, name, options);
      },
      stopDurationVital(name, options) {
        stopDurationVital(addDurationVital, customVitalsState, name, options);
      },
      addDurationVital
    };
    return strategy;
  }
  function overrideInitConfigurationForBridge(initConfiguration) {
    return {
      ...initConfiguration,
      applicationId: "00000000-aaaa-0000-aaaa-000000000000",
      clientToken: "empty",
      sessionSampleRate: 100,
      defaultPrivacyLevel: initConfiguration.defaultPrivacyLevel ?? getEventBridge()?.getPrivacyLevel()
    };
  }
  var init_preStartRum = __esm({
    "../packages/rum-core/src/boot/preStartRum.ts"() {
      "use strict";
      init_src();
      init_configuration4();
      init_vitalCollection();
      init_configuration4();
      init_plugins();
    }
  });

  // ../packages/rum-core/src/boot/rumPublicApi.ts
  function makeRumPublicApi(startRumImpl, recorderApi2, options = {}) {
    const customerDataTrackerManager = createCustomerDataTrackerManager(0 /* Unknown */);
    const globalContextManager = createContextManager("global context", {
      customerDataTracker: customerDataTrackerManager.getOrCreateTracker(2 /* GlobalContext */)
    });
    const userContextManager = createContextManager("user", {
      customerDataTracker: customerDataTrackerManager.getOrCreateTracker(1 /* User */),
      propertiesConfig: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" }
      }
    });
    const accountContextManager = createContextManager("account", {
      customerDataTracker: customerDataTrackerManager.getOrCreateTracker(1 /* User */),
      propertiesConfig: {
        id: { type: "string", required: true },
        name: { type: "string" }
      }
    });
    const trackingConsentState = createTrackingConsentState();
    const customVitalsState = createCustomVitalsState();
    function getCommonContext() {
      return buildCommonContext(globalContextManager, userContextManager, accountContextManager, recorderApi2);
    }
    let strategy = createPreStartStrategy(
      options,
      getCommonContext,
      trackingConsentState,
      customVitalsState,
      (configuration, deflateWorker, initialViewOptions) => {
        if (configuration.storeContextsAcrossPages) {
          storeContextManager(configuration, globalContextManager, RUM_STORAGE_KEY, 2 /* GlobalContext */);
          storeContextManager(configuration, userContextManager, RUM_STORAGE_KEY, 1 /* User */);
          storeContextManager(configuration, accountContextManager, RUM_STORAGE_KEY, 4 /* Account */);
        }
        customerDataTrackerManager.setCompressionStatus(
          deflateWorker ? 1 /* Enabled */ : 2 /* Disabled */
        );
        const startRumResult = startRumImpl(
          configuration,
          recorderApi2,
          customerDataTrackerManager,
          getCommonContext,
          initialViewOptions,
          deflateWorker && options.createDeflateEncoder ? (streamId) => options.createDeflateEncoder(configuration, deflateWorker, streamId) : createIdentityEncoder,
          trackingConsentState,
          customVitalsState
        );
        recorderApi2.onRumStart(
          startRumResult.lifeCycle,
          configuration,
          startRumResult.session,
          startRumResult.viewHistory,
          deflateWorker
        );
        strategy = createPostStartStrategy(strategy, startRumResult);
        callPluginsMethod(configuration.plugins, "onRumStart", { strategy });
        return startRumResult;
      }
    );
    const startView = monitor((options2) => {
      const sanitizedOptions = typeof options2 === "object" ? options2 : { name: options2 };
      if (sanitizedOptions.context) {
        customerDataTrackerManager.getOrCreateTracker(3 /* View */).updateCustomerData(sanitizedOptions.context);
      }
      strategy.startView(sanitizedOptions);
      addTelemetryUsage({ feature: "start-view" });
    });
    const rumPublicApi = makePublicApi({
      init: monitor((initConfiguration) => {
        strategy.init(initConfiguration, rumPublicApi);
      }),
      setTrackingConsent: monitor((trackingConsent) => {
        trackingConsentState.update(trackingConsent);
        addTelemetryUsage({ feature: "set-tracking-consent", tracking_consent: trackingConsent });
      }),
      setViewName: monitor((name) => {
        strategy.setViewName(name);
        addTelemetryUsage({ feature: "set-view-name" });
      }),
      setViewContext: monitor((context) => {
        strategy.setViewContext(context);
        addTelemetryUsage({ feature: "set-view-context" });
      }),
      setViewContextProperty: monitor((key, value) => {
        strategy.setViewContextProperty(key, value);
        addTelemetryUsage({ feature: "set-view-context-property" });
      }),
      getViewContext: monitor(() => {
        addTelemetryUsage({ feature: "set-view-context-property" });
        return strategy.getViewContext();
      }),
      setGlobalContext: monitor((context) => {
        globalContextManager.setContext(context);
        addTelemetryUsage({ feature: "set-global-context" });
      }),
      getGlobalContext: monitor(() => globalContextManager.getContext()),
      setGlobalContextProperty: monitor((key, value) => {
        globalContextManager.setContextProperty(key, value);
        addTelemetryUsage({ feature: "set-global-context" });
      }),
      removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),
      clearGlobalContext: monitor(() => globalContextManager.clearContext()),
      getInternalContext: monitor((startTime) => strategy.getInternalContext(startTime)),
      getInitConfiguration: monitor(() => deepClone(strategy.initConfiguration)),
      addAction: (name, context) => {
        const handlingStack = createHandlingStack("action");
        callMonitored(() => {
          strategy.addAction({
            name: sanitize(name),
            context: sanitize(context),
            startClocks: clocksNow(),
            type: "custom" /* CUSTOM */,
            handlingStack
          });
          addTelemetryUsage({ feature: "add-action" });
        });
      },
      addError: (error, context) => {
        const handlingStack = createHandlingStack("error");
        callMonitored(() => {
          strategy.addError({
            error,
            // Do not sanitize error here, it is needed unserialized by computeRawError()
            handlingStack,
            context: sanitize(context),
            startClocks: clocksNow()
          });
          addTelemetryUsage({ feature: "add-error" });
        });
      },
      addTiming: monitor((name, time) => {
        strategy.addTiming(sanitize(name), time);
      }),
      setUser: monitor((newUser) => {
        userContextManager.setContext(newUser);
        addTelemetryUsage({ feature: "set-user" });
      }),
      getUser: monitor(userContextManager.getContext),
      setUserProperty: monitor((key, property) => {
        userContextManager.setContextProperty(key, property);
        addTelemetryUsage({ feature: "set-user" });
      }),
      removeUserProperty: monitor(userContextManager.removeContextProperty),
      clearUser: monitor(userContextManager.clearContext),
      setAccount: monitor(accountContextManager.setContext),
      getAccount: monitor(accountContextManager.getContext),
      setAccountProperty: monitor(accountContextManager.setContextProperty),
      removeAccountProperty: monitor(accountContextManager.removeContextProperty),
      clearAccount: monitor(accountContextManager.clearContext),
      startView,
      stopSession: monitor(() => {
        strategy.stopSession();
        addTelemetryUsage({ feature: "stop-session" });
      }),
      addFeatureFlagEvaluation: monitor((key, value) => {
        strategy.addFeatureFlagEvaluation(sanitize(key), sanitize(value));
        addTelemetryUsage({ feature: "add-feature-flag-evaluation" });
      }),
      getSessionReplayLink: monitor(() => recorderApi2.getSessionReplayLink()),
      startSessionReplayRecording: monitor((options2) => {
        recorderApi2.start(options2);
        addTelemetryUsage({ feature: "start-session-replay-recording", force: options2 && options2.force });
      }),
      stopSessionReplayRecording: monitor(() => recorderApi2.stop()),
      addDurationVital: monitor((name, options2) => {
        addTelemetryUsage({ feature: "add-duration-vital" });
        strategy.addDurationVital({
          name: sanitize(name),
          type: "duration" /* DURATION */,
          startClocks: timeStampToClocks(options2.startTime),
          duration: options2.duration,
          context: sanitize(options2 && options2.context),
          description: sanitize(options2 && options2.description)
        });
      }),
      startDurationVital: monitor((name, options2) => {
        addTelemetryUsage({ feature: "start-duration-vital" });
        return strategy.startDurationVital(sanitize(name), {
          context: sanitize(options2 && options2.context),
          description: sanitize(options2 && options2.description)
        });
      }),
      stopDurationVital: monitor((nameOrRef, options2) => {
        addTelemetryUsage({ feature: "stop-duration-vital" });
        strategy.stopDurationVital(typeof nameOrRef === "string" ? sanitize(nameOrRef) : nameOrRef, {
          context: sanitize(options2 && options2.context),
          description: sanitize(options2 && options2.description)
        });
      })
    });
    return rumPublicApi;
  }
  function createPostStartStrategy(preStartStrategy, startRumResult) {
    return {
      init: (initConfiguration) => {
        displayAlreadyInitializedError("DD_RUM", initConfiguration);
      },
      initConfiguration: preStartStrategy.initConfiguration,
      ...startRumResult
    };
  }
  var RUM_STORAGE_KEY;
  var init_rumPublicApi = __esm({
    "../packages/rum-core/src/boot/rumPublicApi.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_commonContext();
      init_vitalCollection();
      init_plugins();
      init_preStartRum();
      RUM_STORAGE_KEY = "rum";
    }
  });

  // ../packages/rum-core/src/browser/domMutationObservable.ts
  function createDOMMutationObservable() {
    const MutationObserver = getMutationObserverConstructor();
    return new Observable((observable) => {
      if (!MutationObserver) {
        return;
      }
      const observer2 = new MutationObserver(monitor(() => observable.notify()));
      observer2.observe(document, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true
      });
      return () => observer2.disconnect();
    });
  }
  function getMutationObserverConstructor() {
    let constructor;
    const browserWindow = window;
    if (browserWindow.Zone) {
      constructor = getZoneJsOriginalValue(browserWindow, "MutationObserver");
      if (browserWindow.MutationObserver && constructor === browserWindow.MutationObserver) {
        const patchedInstance = new browserWindow.MutationObserver(noop);
        const originalInstance = getZoneJsOriginalValue(patchedInstance, "originalInstance");
        constructor = originalInstance && originalInstance.constructor;
      }
    }
    if (!constructor) {
      constructor = browserWindow.MutationObserver;
    }
    return constructor;
  }
  var init_domMutationObservable = __esm({
    "../packages/rum-core/src/browser/domMutationObservable.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/browser/windowOpenObservable.ts
  function createWindowOpenObservable() {
    const observable = new Observable();
    const { stop } = instrumentMethod(window, "open", () => observable.notify());
    return { observable, stop };
  }
  var init_windowOpenObservable = __esm({
    "../packages/rum-core/src/browser/windowOpenObservable.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/rumSessionManager.ts
  function startRumSessionManager(configuration, lifeCycle, trackingConsentState) {
    const sessionManager = startSessionManager(
      configuration,
      RUM_SESSION_KEY2,
      (rawTrackingType) => computeSessionState(configuration, rawTrackingType),
      trackingConsentState
    );
    sessionManager.expireObservable.subscribe(() => {
      lifeCycle.notify(9 /* SESSION_EXPIRED */);
    });
    sessionManager.renewObservable.subscribe(() => {
      lifeCycle.notify(10 /* SESSION_RENEWED */);
    });
    sessionManager.sessionStateUpdateObservable.subscribe(({ previousState, newState }) => {
      if (!previousState.forcedReplay && newState.forcedReplay) {
        const sessionEntity = sessionManager.findSession();
        if (sessionEntity) {
          sessionEntity.isReplayForced = true;
        }
      }
    });
    return {
      findTrackedSession: (startTime) => {
        const session = sessionManager.findSession(startTime);
        if (!session || !isTypeTracked(session.trackingType)) {
          return;
        }
        return {
          id: session.id,
          sessionReplay: session.trackingType === "1" /* TRACKED_WITH_SESSION_REPLAY */ ? 1 /* SAMPLED */ : session.isReplayForced ? 2 /* FORCED */ : 0 /* OFF */,
          anonymousId: session.anonymousId
        };
      },
      expire: sessionManager.expire,
      expireObservable: sessionManager.expireObservable,
      setForcedReplay: () => sessionManager.updateSessionState({ forcedReplay: "1" })
    };
  }
  function startRumSessionManagerStub() {
    const session = {
      id: "00000000-aaaa-0000-aaaa-000000000000",
      sessionReplay: bridgeSupports("records" /* RECORDS */) ? 1 /* SAMPLED */ : 0 /* OFF */
    };
    return {
      findTrackedSession: () => session,
      expire: noop,
      expireObservable: new Observable(),
      setForcedReplay: noop
    };
  }
  function computeSessionState(configuration, rawTrackingType) {
    let trackingType;
    if (hasValidRumSession(rawTrackingType)) {
      trackingType = rawTrackingType;
    } else if (!performDraw(configuration.sessionSampleRate)) {
      trackingType = "0" /* NOT_TRACKED */;
    } else if (!performDraw(configuration.sessionReplaySampleRate)) {
      trackingType = "2" /* TRACKED_WITHOUT_SESSION_REPLAY */;
    } else {
      trackingType = "1" /* TRACKED_WITH_SESSION_REPLAY */;
    }
    return {
      trackingType,
      isTracked: isTypeTracked(trackingType)
    };
  }
  function hasValidRumSession(trackingType) {
    return trackingType === "0" /* NOT_TRACKED */ || trackingType === "1" /* TRACKED_WITH_SESSION_REPLAY */ || trackingType === "2" /* TRACKED_WITHOUT_SESSION_REPLAY */;
  }
  function isTypeTracked(rumSessionType) {
    return rumSessionType === "2" /* TRACKED_WITHOUT_SESSION_REPLAY */ || rumSessionType === "1" /* TRACKED_WITH_SESSION_REPLAY */;
  }
  var RUM_SESSION_KEY2;
  var init_rumSessionManager = __esm({
    "../packages/rum-core/src/domain/rumSessionManager.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      RUM_SESSION_KEY2 = "rum";
    }
  });

  // ../packages/rum-core/src/domain/limitModification.ts
  function limitModification(object, modifiableFieldPaths, modifier) {
    const clone = deepClone(object);
    const result = modifier(clone);
    objectEntries(modifiableFieldPaths).forEach(
      ([fieldPath, fieldType]) => (
        // Traverse both object and clone simultaneously up to the path and apply the modification from the clone to the original object when the type is valid
        setValueAtPath(object, clone, fieldPath.split(/\.|(?=\[\])/), fieldType)
      )
    );
    return result;
  }
  function setValueAtPath(object, clone, pathSegments, fieldType) {
    const [field, ...restPathSegments] = pathSegments;
    if (field === "[]") {
      if (Array.isArray(object) && Array.isArray(clone)) {
        object.forEach((item, i) => setValueAtPath(item, clone[i], restPathSegments, fieldType));
      }
      return;
    }
    if (!isValidObject(object) || !isValidObject(clone)) {
      return;
    }
    if (restPathSegments.length > 0) {
      return setValueAtPath(object[field], clone[field], restPathSegments, fieldType);
    }
    setNestedValue(object, field, clone[field], fieldType);
  }
  function setNestedValue(object, field, value, fieldType) {
    const newType = getType(value);
    if (newType === fieldType) {
      object[field] = sanitize(value);
    } else if (fieldType === "object" && (newType === "undefined" || newType === "null")) {
      object[field] = {};
    }
  }
  function isValidObject(object) {
    return getType(object) === "object";
  }
  var init_limitModification = __esm({
    "../packages/rum-core/src/domain/limitModification.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/assembly.ts
  function startRumAssembly(configuration, lifeCycle, hooks, sessionManager, viewHistory, urlContexts, displayContext, getCommonContext, reportError) {
    modifiableFieldPathsByEvent = {
      ["view" /* VIEW */]: {
        "view.performance.lcp.resource_url": "string",
        ...USER_CUSTOMIZABLE_FIELD_PATHS,
        ...VIEW_MODIFIABLE_FIELD_PATHS
      },
      ["error" /* ERROR */]: {
        "error.message": "string",
        "error.stack": "string",
        "error.resource.url": "string",
        "error.fingerprint": "string",
        ...USER_CUSTOMIZABLE_FIELD_PATHS,
        ...VIEW_MODIFIABLE_FIELD_PATHS,
        ...ROOT_MODIFIABLE_FIELD_PATHS
      },
      ["resource" /* RESOURCE */]: {
        "resource.url": "string",
        ...isExperimentalFeatureEnabled("writable_resource_graphql" /* WRITABLE_RESOURCE_GRAPHQL */) ? { "resource.graphql": "object" } : {},
        ...USER_CUSTOMIZABLE_FIELD_PATHS,
        ...VIEW_MODIFIABLE_FIELD_PATHS,
        ...ROOT_MODIFIABLE_FIELD_PATHS
      },
      ["action" /* ACTION */]: {
        "action.target.name": "string",
        ...USER_CUSTOMIZABLE_FIELD_PATHS,
        ...VIEW_MODIFIABLE_FIELD_PATHS,
        ...ROOT_MODIFIABLE_FIELD_PATHS
      },
      ["long_task" /* LONG_TASK */]: {
        "long_task.scripts[].source_url": "string",
        "long_task.scripts[].invoker": "string",
        ...USER_CUSTOMIZABLE_FIELD_PATHS,
        ...VIEW_MODIFIABLE_FIELD_PATHS
      },
      ["vital" /* VITAL */]: {
        ...USER_CUSTOMIZABLE_FIELD_PATHS,
        ...VIEW_MODIFIABLE_FIELD_PATHS
      }
    };
    const eventRateLimiters = {
      ["error" /* ERROR */]: createEventRateLimiter(
        "error" /* ERROR */,
        configuration.eventRateLimiterThreshold,
        reportError
      ),
      ["action" /* ACTION */]: createEventRateLimiter(
        "action" /* ACTION */,
        configuration.eventRateLimiterThreshold,
        reportError
      ),
      ["vital" /* VITAL */]: createEventRateLimiter(
        "vital" /* VITAL */,
        configuration.eventRateLimiterThreshold,
        reportError
      )
    };
    lifeCycle.subscribe(
      12 /* RAW_RUM_EVENT_COLLECTED */,
      ({ startTime, duration, rawRumEvent, domainContext, savedCommonContext, customerContext }) => {
        const viewHistoryEntry = viewHistory.findView(startTime);
        const urlContext = urlContexts.findUrl(startTime);
        const session = sessionManager.findTrackedSession(startTime);
        if (session && viewHistoryEntry && !urlContext && isExperimentalFeatureEnabled("missing_url_context_telemetry" /* MISSING_URL_CONTEXT_TELEMETRY */)) {
          addTelemetryDebug("Missing URL entry", {
            debug: {
              eventType: rawRumEvent.type,
              startTime,
              urlEntries: urlContexts.getAllEntries(),
              urlDeletedEntries: urlContexts.getDeletedEntries(),
              viewEntries: viewHistory.getAllEntries(),
              viewDeletedEntries: viewHistory.getDeletedEntries()
            }
          });
        }
        if (session && viewHistoryEntry && urlContext) {
          const commonContext = savedCommonContext || getCommonContext();
          const rumContext = {
            _dd: {
              format_version: 2,
              drift: currentDrift(),
              configuration: {
                session_sample_rate: round(configuration.sessionSampleRate, 3),
                session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3)
              },
              browser_sdk_version: canUseEventBridge() ? "env" : void 0
            },
            application: {
              id: configuration.applicationId
            },
            date: timeStampNow(),
            source: "browser",
            session: {
              id: session.id,
              type: "user" /* USER */
            },
            display: displayContext.get(),
            connectivity: getConnectivity(),
            context: commonContext.context
          };
          const serverRumEvent = combine(
            rumContext,
            hooks.triggerHook(0 /* Assemble */, {
              eventType: rawRumEvent.type,
              startTime,
              duration
            }),
            { context: customerContext },
            rawRumEvent
          );
          if (!("has_replay" in serverRumEvent.session)) {
            ;
            serverRumEvent.session.has_replay = commonContext.hasReplay;
          }
          if (serverRumEvent.type === "view") {
            ;
            serverRumEvent.session.sampled_for_replay = session.sessionReplay === 1 /* SAMPLED */;
          }
          if (session.anonymousId && !commonContext.user.anonymous_id && !!configuration.trackAnonymousUser) {
            commonContext.user.anonymous_id = session.anonymousId;
          }
          if (!isEmptyObject(commonContext.user)) {
            ;
            serverRumEvent.usr = commonContext.user;
          }
          if (!isEmptyObject(commonContext.account) && commonContext.account.id) {
            ;
            serverRumEvent.account = commonContext.account;
          }
          if (shouldSend(serverRumEvent, configuration.beforeSend, domainContext, eventRateLimiters)) {
            if (isEmptyObject(serverRumEvent.context)) {
              delete serverRumEvent.context;
            }
            lifeCycle.notify(13 /* RUM_EVENT_COLLECTED */, serverRumEvent);
          }
        }
      }
    );
  }
  function shouldSend(event, beforeSend2, domainContext, eventRateLimiters) {
    if (beforeSend2) {
      const result = limitModification(
        event,
        modifiableFieldPathsByEvent[event.type],
        (event2) => beforeSend2(event2, domainContext)
      );
      if (result === false && event.type !== "view" /* VIEW */) {
        return false;
      }
      if (result === false) {
        display.warn("Can't dismiss view events using beforeSend!");
      }
    }
    const rateLimitReached = eventRateLimiters[event.type]?.isLimitReached();
    return !rateLimitReached;
  }
  var VIEW_MODIFIABLE_FIELD_PATHS, USER_CUSTOMIZABLE_FIELD_PATHS, ROOT_MODIFIABLE_FIELD_PATHS, modifiableFieldPathsByEvent;
  var init_assembly = __esm({
    "../packages/rum-core/src/domain/assembly.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_hooks();
      init_lifeCycle();
      init_rumSessionManager();
      init_limitModification();
      VIEW_MODIFIABLE_FIELD_PATHS = {
        "view.name": "string",
        "view.url": "string",
        "view.referrer": "string"
      };
      USER_CUSTOMIZABLE_FIELD_PATHS = {
        context: "object"
      };
      ROOT_MODIFIABLE_FIELD_PATHS = {
        service: "string",
        version: "string"
      };
    }
  });

  // ../packages/rum-core/src/domain/contexts/internalContext.ts
  function startInternalContext(applicationId, sessionManager, viewHistory, actionContexts, urlContexts) {
    return {
      get: (startTime) => {
        const viewContext = viewHistory.findView(startTime);
        const urlContext = urlContexts.findUrl(startTime);
        const session = sessionManager.findTrackedSession(startTime);
        if (session && viewContext && urlContext) {
          const actionId = actionContexts.findActionId(startTime);
          return {
            application_id: applicationId,
            session_id: session.id,
            user_action: actionId ? { id: actionId } : void 0,
            view: { id: viewContext.id, name: viewContext.name, referrer: urlContext.referrer, url: urlContext.url }
          };
        }
      }
    };
  }
  var init_internalContext = __esm({
    "../packages/rum-core/src/domain/contexts/internalContext.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/domain/contexts/viewHistory.ts
  function startViewHistory(lifeCycle) {
    const viewValueHistory = createValueHistory({ expireDelay: VIEW_CONTEXT_TIME_OUT_DELAY });
    lifeCycle.subscribe(1 /* BEFORE_VIEW_CREATED */, (view) => {
      viewValueHistory.add(buildViewHistoryEntry(view), view.startClocks.relative);
    });
    lifeCycle.subscribe(6 /* AFTER_VIEW_ENDED */, ({ endClocks }) => {
      viewValueHistory.closeActive(endClocks.relative);
    });
    lifeCycle.subscribe(3 /* BEFORE_VIEW_UPDATED */, (viewUpdate) => {
      const currentView = viewValueHistory.find(viewUpdate.startClocks.relative);
      if (currentView && viewUpdate.name) {
        currentView.name = viewUpdate.name;
      }
      if (currentView && viewUpdate.context) {
        currentView.context = viewUpdate.context;
      }
    });
    lifeCycle.subscribe(10 /* SESSION_RENEWED */, () => {
      viewValueHistory.reset();
    });
    function buildViewHistoryEntry(view) {
      return {
        service: view.service,
        version: view.version,
        context: view.context,
        id: view.id,
        name: view.name,
        startClocks: view.startClocks
      };
    }
    return {
      findView: (startTime) => viewValueHistory.find(startTime),
      getAllEntries: () => viewValueHistory.getAllEntries(),
      getDeletedEntries: () => viewValueHistory.getDeletedEntries(),
      stop: () => {
        viewValueHistory.stop();
      }
    };
  }
  var VIEW_CONTEXT_TIME_OUT_DELAY;
  var init_viewHistory = __esm({
    "../packages/rum-core/src/domain/contexts/viewHistory.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
    }
  });

  // ../packages/rum-core/src/domain/resource/resourceUtils.ts
  function computeResourceEntryType(entry) {
    const url = entry.name;
    if (!isValidUrl(url)) {
      addTelemetryDebug(`Failed to construct URL for "${entry.name}"`);
      return "other" /* OTHER */;
    }
    const path = getPathName(url);
    for (const [type, isType] of RESOURCE_TYPES) {
      if (isType(entry.initiatorType, path)) {
        return type;
      }
    }
    return "other" /* OTHER */;
  }
  function areInOrder(...numbers) {
    for (let i = 1; i < numbers.length; i += 1) {
      if (numbers[i - 1] > numbers[i]) {
        return false;
      }
    }
    return true;
  }
  function isResourceEntryRequestType(entry) {
    return entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch";
  }
  function computeResourceEntryDuration(entry) {
    const { duration, startTime, responseEnd } = entry;
    if (duration === 0 && startTime < responseEnd) {
      return elapsed(startTime, responseEnd);
    }
    return duration;
  }
  function computeResourceEntryDetails(entry) {
    if (!hasValidResourceEntryTimings(entry)) {
      return void 0;
    }
    const {
      startTime,
      fetchStart,
      workerStart,
      redirectStart,
      redirectEnd,
      domainLookupStart,
      domainLookupEnd,
      connectStart,
      secureConnectionStart,
      connectEnd,
      requestStart,
      responseStart,
      responseEnd
    } = entry;
    const details = {
      download: formatTiming(startTime, responseStart, responseEnd),
      first_byte: formatTiming(startTime, requestStart, responseStart)
    };
    if (0 < workerStart && workerStart < fetchStart) {
      details.worker = formatTiming(startTime, workerStart, fetchStart);
    }
    if (fetchStart < connectEnd) {
      details.connect = formatTiming(startTime, connectStart, connectEnd);
      if (connectStart <= secureConnectionStart && secureConnectionStart <= connectEnd) {
        details.ssl = formatTiming(startTime, secureConnectionStart, connectEnd);
      }
    }
    if (fetchStart < domainLookupEnd) {
      details.dns = formatTiming(startTime, domainLookupStart, domainLookupEnd);
    }
    if (startTime < redirectEnd) {
      details.redirect = formatTiming(startTime, redirectStart, redirectEnd);
    }
    return details;
  }
  function hasValidResourceEntryDuration(entry) {
    return entry.duration >= 0;
  }
  function hasValidResourceEntryTimings(entry) {
    const areCommonTimingsInOrder = areInOrder(
      entry.startTime,
      entry.fetchStart,
      entry.domainLookupStart,
      entry.domainLookupEnd,
      entry.connectStart,
      entry.connectEnd,
      entry.requestStart,
      entry.responseStart,
      entry.responseEnd
    );
    const areRedirectionTimingsInOrder = hasRedirection(entry) ? areInOrder(entry.startTime, entry.redirectStart, entry.redirectEnd, entry.fetchStart) : true;
    return areCommonTimingsInOrder && areRedirectionTimingsInOrder;
  }
  function hasRedirection(entry) {
    return entry.redirectEnd > entry.startTime;
  }
  function formatTiming(origin, start, end) {
    if (origin <= start && start <= end) {
      return {
        duration: toServerDuration(elapsed(start, end)),
        start: toServerDuration(elapsed(origin, start))
      };
    }
  }
  function computeResourceEntryProtocol(entry) {
    return entry.nextHopProtocol === "" ? void 0 : entry.nextHopProtocol;
  }
  function computeResourceEntryDeliveryType(entry) {
    return entry.deliveryType === "" ? "other" : entry.deliveryType;
  }
  function computeResourceEntrySize(entry) {
    if (entry.startTime < entry.responseStart) {
      const { encodedBodySize, decodedBodySize, transferSize } = entry;
      return {
        size: decodedBodySize,
        encoded_body_size: encodedBodySize,
        decoded_body_size: decodedBodySize,
        transfer_size: transferSize
      };
    }
    return {
      size: void 0,
      encoded_body_size: void 0,
      decoded_body_size: void 0,
      transfer_size: void 0
    };
  }
  function isAllowedRequestUrl(url) {
    return url && !isIntakeUrl(url);
  }
  function isLongDataUrl(url) {
    if (url.length <= MAX_ATTRIBUTE_VALUE_CHAR_LENGTH) {
      return false;
    } else if (url.substring(0, 5) === "data:") {
      url = url.substring(0, MAX_ATTRIBUTE_VALUE_CHAR_LENGTH);
      return true;
    }
    return false;
  }
  function sanitizeDataUrl(url) {
    return `${url.match(DATA_URL_REGEX)[0]}[...]`;
  }
  var FAKE_INITIAL_DOCUMENT, RESOURCE_TYPES, DATA_URL_REGEX, MAX_ATTRIBUTE_VALUE_CHAR_LENGTH;
  var init_resourceUtils2 = __esm({
    "../packages/rum-core/src/domain/resource/resourceUtils.ts"() {
      "use strict";
      init_src();
      FAKE_INITIAL_DOCUMENT = "initial_document";
      RESOURCE_TYPES = [
        ["document" /* DOCUMENT */, (initiatorType) => FAKE_INITIAL_DOCUMENT === initiatorType],
        ["xhr" /* XHR */, (initiatorType) => "xmlhttprequest" === initiatorType],
        ["fetch" /* FETCH */, (initiatorType) => "fetch" === initiatorType],
        ["beacon" /* BEACON */, (initiatorType) => "beacon" === initiatorType],
        ["css" /* CSS */, (_, path) => /\.css$/i.test(path)],
        ["js" /* JS */, (_, path) => /\.js$/i.test(path)],
        [
          "image" /* IMAGE */,
          (initiatorType, path) => ["image", "img", "icon"].includes(initiatorType) || /\.(gif|jpg|jpeg|tiff|png|svg|ico)$/i.exec(path) !== null
        ],
        ["font" /* FONT */, (_, path) => /\.(woff|eot|woff2|ttf)$/i.exec(path) !== null],
        [
          "media" /* MEDIA */,
          (initiatorType, path) => ["audio", "video"].includes(initiatorType) || /\.(mp3|mp4)$/i.exec(path) !== null
        ]
      ];
      DATA_URL_REGEX = /data:(.+)?(;base64)?,/g;
      MAX_ATTRIBUTE_VALUE_CHAR_LENGTH = 24e3;
    }
  });

  // ../packages/rum-core/src/domain/requestCollection.ts
  function startRequestCollection(lifeCycle, configuration, sessionManager) {
    const tracer = startTracer(configuration, sessionManager);
    trackXhr(lifeCycle, configuration, tracer);
    trackFetch(lifeCycle, tracer);
  }
  function trackXhr(lifeCycle, configuration, tracer) {
    const subscription = initXhrObservable(configuration).subscribe((rawContext) => {
      const context = rawContext;
      if (!isAllowedRequestUrl(context.url)) {
        return;
      }
      switch (context.state) {
        case "start":
          tracer.traceXhr(context, context.xhr);
          context.requestIndex = getNextRequestIndex();
          lifeCycle.notify(7 /* REQUEST_STARTED */, {
            requestIndex: context.requestIndex,
            url: context.url
          });
          break;
        case "complete":
          tracer.clearTracingIfNeeded(context);
          lifeCycle.notify(8 /* REQUEST_COMPLETED */, {
            duration: context.duration,
            method: context.method,
            requestIndex: context.requestIndex,
            spanId: context.spanId,
            startClocks: context.startClocks,
            status: context.status,
            traceId: context.traceId,
            traceSampled: context.traceSampled,
            type: "xhr" /* XHR */,
            url: context.url,
            xhr: context.xhr,
            isAborted: context.isAborted,
            handlingStack: context.handlingStack
          });
          break;
      }
    });
    return { stop: () => subscription.unsubscribe() };
  }
  function trackFetch(lifeCycle, tracer) {
    const subscription = initFetchObservable().subscribe((rawContext) => {
      const context = rawContext;
      if (!isAllowedRequestUrl(context.url)) {
        return;
      }
      switch (context.state) {
        case "start":
          tracer.traceFetch(context);
          context.requestIndex = getNextRequestIndex();
          lifeCycle.notify(7 /* REQUEST_STARTED */, {
            requestIndex: context.requestIndex,
            url: context.url
          });
          break;
        case "resolve":
          waitForResponseToComplete(context, (duration) => {
            tracer.clearTracingIfNeeded(context);
            lifeCycle.notify(8 /* REQUEST_COMPLETED */, {
              duration,
              method: context.method,
              requestIndex: context.requestIndex,
              responseType: context.responseType,
              spanId: context.spanId,
              startClocks: context.startClocks,
              status: context.status,
              traceId: context.traceId,
              traceSampled: context.traceSampled,
              type: "fetch" /* FETCH */,
              url: context.url,
              response: context.response,
              init: context.init,
              input: context.input,
              isAborted: context.isAborted,
              handlingStack: context.handlingStack
            });
          });
          break;
      }
    });
    return { stop: () => subscription.unsubscribe() };
  }
  function getNextRequestIndex() {
    const result = nextRequestIndex;
    nextRequestIndex += 1;
    return result;
  }
  function waitForResponseToComplete(context, callback) {
    const clonedResponse = context.response && tryToClone(context.response);
    if (!clonedResponse || !clonedResponse.body) {
      callback(elapsed(context.startClocks.timeStamp, timeStampNow()));
    } else {
      readBytesFromStream(
        clonedResponse.body,
        () => {
          callback(elapsed(context.startClocks.timeStamp, timeStampNow()));
        },
        {
          bytesLimit: Number.POSITIVE_INFINITY,
          collectStreamBody: false
        }
      );
    }
  }
  var nextRequestIndex;
  var init_requestCollection = __esm({
    "../packages/rum-core/src/domain/requestCollection.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      init_resourceUtils2();
      init_tracer();
      nextRequestIndex = 1;
    }
  });

  // ../packages/rum-core/src/domain/discardNegativeDuration.ts
  function discardNegativeDuration(duration) {
    return isNumber(duration) && duration < 0 ? void 0 : duration;
  }
  var init_discardNegativeDuration = __esm({
    "../packages/rum-core/src/domain/discardNegativeDuration.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/trackEventCounts.ts
  function trackEventCounts({
    lifeCycle,
    isChildEvent,
    onChange: callback = noop
  }) {
    const eventCounts = {
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      actionCount: 0,
      frustrationCount: 0
    };
    const subscription = lifeCycle.subscribe(13 /* RUM_EVENT_COLLECTED */, (event) => {
      if (event.type === "view" || event.type === "vital" || !isChildEvent(event)) {
        return;
      }
      switch (event.type) {
        case "error" /* ERROR */:
          eventCounts.errorCount += 1;
          callback();
          break;
        case "action" /* ACTION */:
          eventCounts.actionCount += 1;
          if (event.action.frustration) {
            eventCounts.frustrationCount += event.action.frustration.type.length;
          }
          callback();
          break;
        case "long_task" /* LONG_TASK */:
          eventCounts.longTaskCount += 1;
          callback();
          break;
        case "resource" /* RESOURCE */:
          if (!event._dd?.discarded) {
            eventCounts.resourceCount += 1;
            callback();
          }
          break;
      }
    });
    return {
      stop: () => {
        subscription.unsubscribe();
      },
      eventCounts
    };
  }
  var init_trackEventCounts = __esm({
    "../packages/rum-core/src/domain/trackEventCounts.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
    }
  });

  // ../packages/rum-core/src/browser/firstInputPolyfill.ts
  function retrieveFirstInputTiming(configuration, callback) {
    const startTimeStamp = dateNow();
    let timingSent = false;
    const { stop: removeEventListeners } = addEventListeners(
      configuration,
      window,
      ["click" /* CLICK */, "mousedown" /* MOUSE_DOWN */, "keydown" /* KEY_DOWN */, "touchstart" /* TOUCH_START */, "pointerdown" /* POINTER_DOWN */],
      (evt) => {
        if (!evt.cancelable) {
          return;
        }
        const timing = {
          entryType: "first-input",
          processingStart: relativeNow(),
          processingEnd: relativeNow(),
          startTime: evt.timeStamp,
          duration: 0,
          // arbitrary value to avoid nullable duration and simplify INP logic
          name: "",
          cancelable: false,
          target: null,
          toJSON: () => ({})
        };
        if (evt.type === "pointerdown" /* POINTER_DOWN */) {
          sendTimingIfPointerIsNotCancelled(configuration, timing);
        } else {
          sendTiming(timing);
        }
      },
      { passive: true, capture: true }
    );
    return { stop: removeEventListeners };
    function sendTimingIfPointerIsNotCancelled(configuration2, timing) {
      addEventListeners(
        configuration2,
        window,
        ["pointerup" /* POINTER_UP */, "pointercancel" /* POINTER_CANCEL */],
        (event) => {
          if (event.type === "pointerup" /* POINTER_UP */) {
            sendTiming(timing);
          }
        },
        { once: true }
      );
    }
    function sendTiming(timing) {
      if (!timingSent) {
        timingSent = true;
        removeEventListeners();
        const delay = timing.processingStart - timing.startTime;
        if (delay >= 0 && delay < dateNow() - startTimeStamp) {
          callback(timing);
        }
      }
    }
  }
  var init_firstInputPolyfill = __esm({
    "../packages/rum-core/src/browser/firstInputPolyfill.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/browser/performanceObservable.ts
  function createPerformanceObservable(configuration, options) {
    return new Observable((observable) => {
      if (!window.PerformanceObserver) {
        return;
      }
      const handlePerformanceEntries = (entries) => {
        const rumPerformanceEntries = filterRumPerformanceEntries(entries);
        if (rumPerformanceEntries.length > 0) {
          observable.notify(rumPerformanceEntries);
        }
      };
      let timeoutId;
      let isObserverInitializing = true;
      const observer2 = new PerformanceObserver(
        monitor((entries) => {
          if (isObserverInitializing) {
            timeoutId = setTimeout(() => handlePerformanceEntries(entries.getEntries()));
          } else {
            handlePerformanceEntries(entries.getEntries());
          }
        })
      );
      try {
        observer2.observe(options);
      } catch {
        const fallbackSupportedEntryTypes = [
          "resource" /* RESOURCE */,
          "navigation" /* NAVIGATION */,
          "longtask" /* LONG_TASK */,
          "paint" /* PAINT */
        ];
        if (fallbackSupportedEntryTypes.includes(options.type)) {
          if (options.buffered) {
            timeoutId = setTimeout(() => handlePerformanceEntries(performance.getEntriesByType(options.type)));
          }
          try {
            observer2.observe({ entryTypes: [options.type] });
          } catch {
            return;
          }
        }
      }
      isObserverInitializing = false;
      manageResourceTimingBufferFull(configuration);
      let stopFirstInputTiming;
      if (!supportPerformanceTimingEvent("first-input" /* FIRST_INPUT */) && options.type === "first-input" /* FIRST_INPUT */) {
        ;
        ({ stop: stopFirstInputTiming } = retrieveFirstInputTiming(configuration, (timing) => {
          handlePerformanceEntries([timing]);
        }));
      }
      return () => {
        observer2.disconnect();
        if (stopFirstInputTiming) {
          stopFirstInputTiming();
        }
        clearTimeout(timeoutId);
      };
    });
  }
  function manageResourceTimingBufferFull(configuration) {
    if (!resourceTimingBufferFullListener && supportPerformanceObject() && "addEventListener" in performance) {
      resourceTimingBufferFullListener = addEventListener(configuration, performance, "resourcetimingbufferfull", () => {
        performance.clearResourceTimings();
      });
    }
    return () => {
      resourceTimingBufferFullListener?.stop();
    };
  }
  function supportPerformanceObject() {
    return window.performance !== void 0 && "getEntries" in performance;
  }
  function supportPerformanceTimingEvent(entryType) {
    return window.PerformanceObserver && PerformanceObserver.supportedEntryTypes !== void 0 && PerformanceObserver.supportedEntryTypes.includes(entryType);
  }
  function filterRumPerformanceEntries(entries) {
    return entries.filter((entry) => !isForbiddenResource(entry));
  }
  function isForbiddenResource(entry) {
    return entry.entryType === "resource" /* RESOURCE */ && (!isAllowedRequestUrl(entry.name) || !hasValidResourceEntryDuration(entry));
  }
  var resourceTimingBufferFullListener;
  var init_performanceObservable = __esm({
    "../packages/rum-core/src/browser/performanceObservable.ts"() {
      "use strict";
      init_src();
      init_resourceUtils2();
      init_firstInputPolyfill();
    }
  });

  // ../packages/rum-core/src/domain/waitPageActivityEnd.ts
  function waitPageActivityEnd(lifeCycle, domMutationObservable, windowOpenObservable, configuration, pageActivityEndCallback, maxDuration) {
    const pageActivityObservable = createPageActivityObservable(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration
    );
    return doWaitPageActivityEnd(pageActivityObservable, pageActivityEndCallback, maxDuration);
  }
  function doWaitPageActivityEnd(pageActivityObservable, pageActivityEndCallback, maxDuration) {
    let pageActivityEndTimeoutId;
    let hasCompleted = false;
    const validationTimeoutId = setTimeout(
      monitor(() => complete({ hadActivity: false })),
      PAGE_ACTIVITY_VALIDATION_DELAY
    );
    const maxDurationTimeoutId = maxDuration !== void 0 ? setTimeout(
      monitor(() => complete({ hadActivity: true, end: timeStampNow() })),
      maxDuration
    ) : void 0;
    const pageActivitySubscription = pageActivityObservable.subscribe(({ isBusy }) => {
      clearTimeout(validationTimeoutId);
      clearTimeout(pageActivityEndTimeoutId);
      const lastChangeTime = timeStampNow();
      if (!isBusy) {
        pageActivityEndTimeoutId = setTimeout(
          monitor(() => complete({ hadActivity: true, end: lastChangeTime })),
          PAGE_ACTIVITY_END_DELAY
        );
      }
    });
    const stop = () => {
      hasCompleted = true;
      clearTimeout(validationTimeoutId);
      clearTimeout(pageActivityEndTimeoutId);
      clearTimeout(maxDurationTimeoutId);
      pageActivitySubscription.unsubscribe();
    };
    function complete(event) {
      if (hasCompleted) {
        return;
      }
      stop();
      pageActivityEndCallback(event);
    }
    return { stop };
  }
  function createPageActivityObservable(lifeCycle, domMutationObservable, windowOpenObservable, configuration) {
    return new Observable((observable) => {
      const subscriptions = [];
      let firstRequestIndex;
      let pendingRequestsCount = 0;
      subscriptions.push(
        domMutationObservable.subscribe(notifyPageActivity),
        windowOpenObservable.subscribe(notifyPageActivity),
        createPerformanceObservable(configuration, { type: "resource" /* RESOURCE */ }).subscribe((entries) => {
          if (entries.some((entry) => !isExcludedUrl(configuration, entry.name))) {
            notifyPageActivity();
          }
        }),
        lifeCycle.subscribe(7 /* REQUEST_STARTED */, (startEvent) => {
          if (isExcludedUrl(configuration, startEvent.url)) {
            return;
          }
          if (firstRequestIndex === void 0) {
            firstRequestIndex = startEvent.requestIndex;
          }
          pendingRequestsCount += 1;
          notifyPageActivity();
        }),
        lifeCycle.subscribe(8 /* REQUEST_COMPLETED */, (request) => {
          if (isExcludedUrl(configuration, request.url) || firstRequestIndex === void 0 || // If the request started before the tracking start, ignore it
          request.requestIndex < firstRequestIndex) {
            return;
          }
          pendingRequestsCount -= 1;
          notifyPageActivity();
        })
      );
      return () => {
        subscriptions.forEach((s) => s.unsubscribe());
      };
      function notifyPageActivity() {
        observable.notify({ isBusy: pendingRequestsCount > 0 });
      }
    });
  }
  function isExcludedUrl(configuration, requestUrl) {
    return matchList(configuration.excludedActivityUrls, requestUrl);
  }
  var PAGE_ACTIVITY_VALIDATION_DELAY, PAGE_ACTIVITY_END_DELAY;
  var init_waitPageActivityEnd = __esm({
    "../packages/rum-core/src/domain/waitPageActivityEnd.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
      init_lifeCycle();
      PAGE_ACTIVITY_VALIDATION_DELAY = 100;
      PAGE_ACTIVITY_END_DELAY = 100;
    }
  });

  // ../packages/rum-core/src/browser/htmlDomUtils.ts
  function isTextNode(node) {
    return node.nodeType === Node.TEXT_NODE;
  }
  function isCommentNode(node) {
    return node.nodeType === Node.COMMENT_NODE;
  }
  function isElementNode(node) {
    return node.nodeType === Node.ELEMENT_NODE;
  }
  function isNodeShadowHost(node) {
    return isElementNode(node) && Boolean(node.shadowRoot);
  }
  function isNodeShadowRoot(node) {
    const shadowRoot = node;
    return !!shadowRoot.host && shadowRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE && isElementNode(shadowRoot.host);
  }
  function hasChildNodes(node) {
    return node.childNodes.length > 0 || isNodeShadowHost(node);
  }
  function forEachChildNodes(node, callback) {
    let child = node.firstChild;
    while (child) {
      callback(child);
      child = child.nextSibling;
    }
    if (isNodeShadowHost(node)) {
      callback(node.shadowRoot);
    }
  }
  function getParentNode(node) {
    return isNodeShadowRoot(node) ? node.host : node.parentNode;
  }
  var init_htmlDomUtils = __esm({
    "../packages/rum-core/src/browser/htmlDomUtils.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/domain/privacy.ts
  function getNodePrivacyLevel(node, defaultPrivacyLevel, cache) {
    if (cache && cache.has(node)) {
      return cache.get(node);
    }
    const parentNode = getParentNode(node);
    const parentNodePrivacyLevel = parentNode ? getNodePrivacyLevel(parentNode, defaultPrivacyLevel, cache) : defaultPrivacyLevel;
    const selfNodePrivacyLevel = getNodeSelfPrivacyLevel(node);
    const nodePrivacyLevel = reducePrivacyLevel(selfNodePrivacyLevel, parentNodePrivacyLevel);
    if (cache) {
      cache.set(node, nodePrivacyLevel);
    }
    return nodePrivacyLevel;
  }
  function reducePrivacyLevel(childPrivacyLevel, parentNodePrivacyLevel) {
    switch (parentNodePrivacyLevel) {
      // These values cannot be overridden
      case NodePrivacyLevel.HIDDEN:
      case NodePrivacyLevel.IGNORE:
        return parentNodePrivacyLevel;
    }
    switch (childPrivacyLevel) {
      case NodePrivacyLevel.ALLOW:
      case NodePrivacyLevel.MASK:
      case NodePrivacyLevel.MASK_USER_INPUT:
      case NodePrivacyLevel.HIDDEN:
      case NodePrivacyLevel.IGNORE:
        return childPrivacyLevel;
      default:
        return parentNodePrivacyLevel;
    }
  }
  function getNodeSelfPrivacyLevel(node) {
    if (!isElementNode(node)) {
      return;
    }
    if (node.tagName === "BASE") {
      return NodePrivacyLevel.ALLOW;
    }
    if (node.tagName === "INPUT") {
      const inputElement = node;
      if (inputElement.type === "password" || inputElement.type === "email" || inputElement.type === "tel") {
        return NodePrivacyLevel.MASK;
      }
      if (inputElement.type === "hidden") {
        return NodePrivacyLevel.MASK;
      }
      const autocomplete = inputElement.getAttribute("autocomplete");
      if (autocomplete && (autocomplete.startsWith("cc-") || autocomplete.endsWith("-password"))) {
        return NodePrivacyLevel.MASK;
      }
    }
    if (node.matches(getPrivacySelector(NodePrivacyLevel.HIDDEN))) {
      return NodePrivacyLevel.HIDDEN;
    }
    if (node.matches(getPrivacySelector(NodePrivacyLevel.MASK))) {
      return NodePrivacyLevel.MASK;
    }
    if (node.matches(getPrivacySelector(NodePrivacyLevel.MASK_USER_INPUT))) {
      return NodePrivacyLevel.MASK_USER_INPUT;
    }
    if (node.matches(getPrivacySelector(NodePrivacyLevel.ALLOW))) {
      return NodePrivacyLevel.ALLOW;
    }
    if (shouldIgnoreElement(node)) {
      return NodePrivacyLevel.IGNORE;
    }
  }
  function shouldMaskNode(node, privacyLevel) {
    switch (privacyLevel) {
      case NodePrivacyLevel.MASK:
      case NodePrivacyLevel.HIDDEN:
      case NodePrivacyLevel.IGNORE:
        return true;
      case NodePrivacyLevel.MASK_USER_INPUT:
        return isTextNode(node) ? isFormElement(node.parentNode) : isFormElement(node);
      default:
        return false;
    }
  }
  function isFormElement(node) {
    if (!node || node.nodeType !== node.ELEMENT_NODE) {
      return false;
    }
    const element = node;
    if (element.tagName === "INPUT") {
      switch (element.type) {
        case "button":
        case "color":
        case "reset":
        case "submit":
          return false;
      }
    }
    return !!FORM_PRIVATE_TAG_NAMES[element.tagName];
  }
  function getTextContent(textNode, ignoreWhiteSpace, parentNodePrivacyLevel) {
    const parentTagName = textNode.parentElement?.tagName;
    let textContent = textNode.textContent || "";
    if (ignoreWhiteSpace && !textContent.trim()) {
      return;
    }
    const nodePrivacyLevel = parentNodePrivacyLevel;
    const isScript = parentTagName === "SCRIPT";
    if (isScript) {
      textContent = CENSORED_STRING_MARK;
    } else if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      textContent = CENSORED_STRING_MARK;
    } else if (shouldMaskNode(textNode, nodePrivacyLevel)) {
      if (
        // Scrambling the child list breaks text nodes for DATALIST/SELECT/OPTGROUP
        parentTagName === "DATALIST" || parentTagName === "SELECT" || parentTagName === "OPTGROUP"
      ) {
        if (!textContent.trim()) {
          return;
        }
      } else if (parentTagName === "OPTION") {
        textContent = CENSORED_STRING_MARK;
      } else {
        textContent = censorText(textContent);
      }
    }
    return textContent;
  }
  function shouldIgnoreElement(element) {
    if (element.nodeName === "SCRIPT") {
      return true;
    }
    if (element.nodeName === "LINK") {
      const relAttribute = getLowerCaseAttribute("rel");
      return (
        // Link as script - Ignore only when rel=preload, modulepreload or prefetch
        /preload|prefetch/i.test(relAttribute) && getLowerCaseAttribute("as") === "script" || // Favicons
        relAttribute === "shortcut icon" || relAttribute === "icon"
      );
    }
    if (element.nodeName === "META") {
      const nameAttribute = getLowerCaseAttribute("name");
      const relAttribute = getLowerCaseAttribute("rel");
      const propertyAttribute = getLowerCaseAttribute("property");
      return (
        // Favicons
        /^msapplication-tile(image|color)$/.test(nameAttribute) || nameAttribute === "application-name" || relAttribute === "icon" || relAttribute === "apple-touch-icon" || relAttribute === "shortcut icon" || // Description
        nameAttribute === "keywords" || nameAttribute === "description" || // Social
        /^(og|twitter|fb):/.test(propertyAttribute) || /^(og|twitter):/.test(nameAttribute) || nameAttribute === "pinterest" || // Robots
        nameAttribute === "robots" || nameAttribute === "googlebot" || nameAttribute === "bingbot" || // Http headers. Ex: X-UA-Compatible, Content-Type, Content-Language, cache-control,
        // X-Translated-By
        element.hasAttribute("http-equiv") || // Authorship
        nameAttribute === "author" || nameAttribute === "generator" || nameAttribute === "framework" || nameAttribute === "publisher" || nameAttribute === "progid" || /^article:/.test(propertyAttribute) || /^product:/.test(propertyAttribute) || // Verification
        nameAttribute === "google-site-verification" || nameAttribute === "yandex-verification" || nameAttribute === "csrf-token" || nameAttribute === "p:domain_verify" || nameAttribute === "verify-v1" || nameAttribute === "verification" || nameAttribute === "shopify-checkout-api-token"
      );
    }
    function getLowerCaseAttribute(name) {
      return (element.getAttribute(name) || "").toLowerCase();
    }
    return false;
  }
  function getPrivacySelector(privacyLevel) {
    return `[${PRIVACY_ATTR_NAME}="${privacyLevel}"], .${PRIVACY_CLASS_PREFIX}${privacyLevel}`;
  }
  var NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN, PRIVACY_CLASS_PREFIX, CENSORED_STRING_MARK, CENSORED_IMG_MARK, FORM_PRIVATE_TAG_NAMES, TEXT_MASKING_CHAR, censorText;
  var init_privacy = __esm({
    "../packages/rum-core/src/domain/privacy.ts"() {
      "use strict";
      init_src();
      init_htmlDomUtils();
      NodePrivacyLevel = {
        IGNORE: "ignore",
        HIDDEN: "hidden",
        ALLOW: DefaultPrivacyLevel.ALLOW,
        MASK: DefaultPrivacyLevel.MASK,
        MASK_USER_INPUT: DefaultPrivacyLevel.MASK_USER_INPUT
      };
      PRIVACY_ATTR_NAME = "data-dd-privacy";
      PRIVACY_ATTR_VALUE_HIDDEN = "hidden";
      PRIVACY_CLASS_PREFIX = "dd-privacy-";
      CENSORED_STRING_MARK = "***";
      CENSORED_IMG_MARK = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
      FORM_PRIVATE_TAG_NAMES = {
        INPUT: true,
        OUTPUT: true,
        TEXTAREA: true,
        SELECT: true,
        OPTION: true,
        DATALIST: true,
        OPTGROUP: true
      };
      TEXT_MASKING_CHAR = "x";
      censorText = (text) => text.replace(/\S/g, TEXT_MASKING_CHAR);
    }
  });

  // ../packages/rum-core/src/domain/action/getActionNameFromElement.ts
  function getActionNameFromElement(element, { enablePrivacyForActionName, actionNameAttribute: userProgrammaticAttribute }, nodePrivacyLevel) {
    const defaultActionName = getActionNameFromElementProgrammatically(element, DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE) || userProgrammaticAttribute && getActionNameFromElementProgrammatically(element, userProgrammaticAttribute);
    if (defaultActionName) {
      return { name: defaultActionName, nameSource: "custom_attribute" /* CUSTOM_ATTRIBUTE */ };
    } else if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
      return { name: ACTION_NAME_PLACEHOLDER, nameSource: "mask_placeholder" /* MASK_PLACEHOLDER */ };
    }
    return getActionNameFromElementForStrategies(
      element,
      userProgrammaticAttribute,
      priorityStrategies,
      enablePrivacyForActionName
    ) || getActionNameFromElementForStrategies(
      element,
      userProgrammaticAttribute,
      fallbackStrategies,
      enablePrivacyForActionName
    ) || { name: "", nameSource: "blank" /* BLANK */ };
  }
  function getActionNameFromElementProgrammatically(targetElement, programmaticAttribute) {
    const elementWithAttribute = targetElement.closest(`[${programmaticAttribute}]`);
    if (!elementWithAttribute) {
      return;
    }
    const name = elementWithAttribute.getAttribute(programmaticAttribute);
    return truncate(normalizeWhitespace(name.trim()));
  }
  function getActionNameFromElementForStrategies(targetElement, userProgrammaticAttribute, strategies, privacyEnabledActionName) {
    let element = targetElement;
    let recursionCounter = 0;
    while (recursionCounter <= MAX_PARENTS_TO_CONSIDER && element && element.nodeName !== "BODY" && element.nodeName !== "HTML" && element.nodeName !== "HEAD") {
      for (const strategy of strategies) {
        const actionName = strategy(element, userProgrammaticAttribute, privacyEnabledActionName);
        if (actionName) {
          const { name, nameSource } = actionName;
          const trimmedName = name && name.trim();
          if (trimmedName) {
            return { name: truncate(normalizeWhitespace(trimmedName)), nameSource };
          }
        }
      }
      if (element.nodeName === "FORM") {
        break;
      }
      element = element.parentElement;
      recursionCounter += 1;
    }
  }
  function normalizeWhitespace(s) {
    return s.replace(/\s+/g, " ");
  }
  function truncate(s) {
    return s.length > 100 ? `${safeTruncate(s, 100)} [...]` : s;
  }
  function getElementById(refElement, id) {
    return refElement.ownerDocument ? refElement.ownerDocument.getElementById(id) : null;
  }
  function getActionNameFromStandardAttribute(element, attribute) {
    return {
      name: element.getAttribute(attribute) || "",
      nameSource: "standard_attribute" /* STANDARD_ATTRIBUTE */
    };
  }
  function getActionNameFromTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName) {
    return {
      name: getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName) || "",
      nameSource: "text_content" /* TEXT_CONTENT */
    };
  }
  function getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName) {
    if (element.isContentEditable) {
      return;
    }
    if ("innerText" in element) {
      let text = element.innerText;
      const removeTextFromElements = (query) => {
        const list = element.querySelectorAll(query);
        for (let index = 0; index < list.length; index += 1) {
          const element2 = list[index];
          if ("innerText" in element2) {
            const textToReplace = element2.innerText;
            if (textToReplace && textToReplace.trim().length > 0) {
              text = text.replace(textToReplace, "");
            }
          }
        }
      };
      removeTextFromElements(`[${DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE}]`);
      if (userProgrammaticAttribute) {
        removeTextFromElements(`[${userProgrammaticAttribute}]`);
      }
      if (privacyEnabledActionName) {
        removeTextFromElements(
          `${getPrivacySelector(NodePrivacyLevel.HIDDEN)}, ${getPrivacySelector(NodePrivacyLevel.MASK)}`
        );
      }
      return text;
    }
    return element.textContent;
  }
  var DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE, ACTION_NAME_PLACEHOLDER, priorityStrategies, fallbackStrategies, MAX_PARENTS_TO_CONSIDER;
  var init_getActionNameFromElement = __esm({
    "../packages/rum-core/src/domain/action/getActionNameFromElement.ts"() {
      "use strict";
      init_src();
      init_privacy();
      DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE = "data-dd-action-name";
      ACTION_NAME_PLACEHOLDER = "Masked Element";
      priorityStrategies = [
        // associated LABEL text
        (element, userProgrammaticAttribute) => {
          if ("labels" in element && element.labels && element.labels.length > 0) {
            return getActionNameFromTextualContent(element.labels[0], userProgrammaticAttribute);
          }
        },
        // INPUT button (and associated) value
        (element) => {
          if (element.nodeName === "INPUT") {
            const input = element;
            const type = input.getAttribute("type");
            if (type === "button" || type === "submit" || type === "reset") {
              return { name: input.value, nameSource: "text_content" /* TEXT_CONTENT */ };
            }
          }
        },
        // BUTTON, LABEL or button-like element text
        (element, userProgrammaticAttribute, privacyEnabledActionName) => {
          if (element.nodeName === "BUTTON" || element.nodeName === "LABEL" || element.getAttribute("role") === "button") {
            return getActionNameFromTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName);
          }
        },
        (element) => getActionNameFromStandardAttribute(element, "aria-label"),
        // associated element text designated by the aria-labelledby attribute
        (element, userProgrammaticAttribute, privacyEnabledActionName) => {
          const labelledByAttribute = element.getAttribute("aria-labelledby");
          if (labelledByAttribute) {
            return {
              name: labelledByAttribute.split(/\s+/).map((id) => getElementById(element, id)).filter((label) => Boolean(label)).map((element2) => getTextualContent(element2, userProgrammaticAttribute, privacyEnabledActionName)).join(" "),
              nameSource: "text_content" /* TEXT_CONTENT */
            };
          }
        },
        (element) => getActionNameFromStandardAttribute(element, "alt"),
        (element) => getActionNameFromStandardAttribute(element, "name"),
        (element) => getActionNameFromStandardAttribute(element, "title"),
        (element) => getActionNameFromStandardAttribute(element, "placeholder"),
        // SELECT first OPTION text
        (element, userProgrammaticAttribute) => {
          if ("options" in element && element.options.length > 0) {
            return getActionNameFromTextualContent(element.options[0], userProgrammaticAttribute);
          }
        }
      ];
      fallbackStrategies = [
        (element, userProgrammaticAttribute, privacyEnabledActionName) => getActionNameFromTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName)
      ];
      MAX_PARENTS_TO_CONSIDER = 10;
    }
  });

  // ../packages/rum-core/src/domain/getSelectorFromElement.ts
  function getSelectorFromElement(targetElement, actionNameAttribute) {
    if (!targetElement.isConnected) {
      return;
    }
    let targetElementSelector;
    let currentElement = targetElement;
    while (currentElement && currentElement.nodeName !== "HTML") {
      const globallyUniqueSelector = findSelector(
        currentElement,
        GLOBALLY_UNIQUE_SELECTOR_GETTERS,
        isSelectorUniqueGlobally,
        actionNameAttribute,
        targetElementSelector
      );
      if (globallyUniqueSelector) {
        return globallyUniqueSelector;
      }
      const uniqueSelectorAmongChildren = findSelector(
        currentElement,
        UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS,
        isSelectorUniqueAmongSiblings,
        actionNameAttribute,
        targetElementSelector
      );
      targetElementSelector = uniqueSelectorAmongChildren || combineSelector(getPositionSelector(currentElement), targetElementSelector);
      currentElement = currentElement.parentElement;
    }
    return targetElementSelector;
  }
  function isGeneratedValue(value) {
    return /[0-9]/.test(value);
  }
  function getIDSelector(element) {
    if (element.id && !isGeneratedValue(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }
  }
  function getClassSelector(element) {
    if (element.tagName === "BODY") {
      return;
    }
    const classList = element.classList;
    for (let i = 0; i < classList.length; i += 1) {
      const className = classList[i];
      if (isGeneratedValue(className)) {
        continue;
      }
      return `${CSS.escape(element.tagName)}.${CSS.escape(className)}`;
    }
  }
  function getTagNameSelector(element) {
    return CSS.escape(element.tagName);
  }
  function getStableAttributeSelector(element, actionNameAttribute) {
    if (actionNameAttribute) {
      const selector = getAttributeSelector(actionNameAttribute);
      if (selector) {
        return selector;
      }
    }
    for (const attributeName of STABLE_ATTRIBUTES) {
      const selector = getAttributeSelector(attributeName);
      if (selector) {
        return selector;
      }
    }
    function getAttributeSelector(attributeName) {
      if (element.hasAttribute(attributeName)) {
        return `${CSS.escape(element.tagName)}[${attributeName}="${CSS.escape(element.getAttribute(attributeName))}"]`;
      }
    }
  }
  function getPositionSelector(element) {
    let sibling = element.parentElement.firstElementChild;
    let elementIndex = 1;
    while (sibling && sibling !== element) {
      if (sibling.tagName === element.tagName) {
        elementIndex += 1;
      }
      sibling = sibling.nextElementSibling;
    }
    return `${CSS.escape(element.tagName)}:nth-of-type(${elementIndex})`;
  }
  function findSelector(element, selectorGetters, predicate, actionNameAttribute, childSelector) {
    for (const selectorGetter of selectorGetters) {
      const elementSelector = selectorGetter(element, actionNameAttribute);
      if (!elementSelector) {
        continue;
      }
      if (predicate(element, elementSelector, childSelector)) {
        return combineSelector(elementSelector, childSelector);
      }
    }
  }
  function isSelectorUniqueGlobally(element, elementSelector, childSelector) {
    return element.ownerDocument.querySelectorAll(combineSelector(elementSelector, childSelector)).length === 1;
  }
  function isSelectorUniqueAmongSiblings(currentElement, currentElementSelector, childSelector) {
    let isSiblingMatching;
    if (childSelector === void 0) {
      isSiblingMatching = (sibling2) => sibling2.matches(currentElementSelector);
    } else {
      const scopedSelector = combineSelector(`${currentElementSelector}:scope`, childSelector);
      isSiblingMatching = (sibling2) => sibling2.querySelector(scopedSelector) !== null;
    }
    const parent = currentElement.parentElement;
    let sibling = parent.firstElementChild;
    while (sibling) {
      if (sibling !== currentElement && isSiblingMatching(sibling)) {
        return false;
      }
      sibling = sibling.nextElementSibling;
    }
    return true;
  }
  function combineSelector(parent, child) {
    return child ? `${parent}>${child}` : parent;
  }
  var STABLE_ATTRIBUTES, GLOBALLY_UNIQUE_SELECTOR_GETTERS, UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS;
  var init_getSelectorFromElement = __esm({
    "../packages/rum-core/src/domain/getSelectorFromElement.ts"() {
      "use strict";
      init_getActionNameFromElement();
      STABLE_ATTRIBUTES = [
        DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE,
        // Common test attributes (list provided by google recorder)
        "data-testid",
        "data-test",
        "data-qa",
        "data-cy",
        "data-test-id",
        "data-qa-id",
        "data-testing",
        // FullStory decorator attributes:
        "data-component",
        "data-element",
        "data-source-file"
      ];
      GLOBALLY_UNIQUE_SELECTOR_GETTERS = [getStableAttributeSelector, getIDSelector];
      UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS = [
        getStableAttributeSelector,
        getClassSelector,
        getTagNameSelector
      ];
    }
  });

  // ../packages/rum-core/src/domain/action/clickChain.ts
  function createClickChain(firstClick, onFinalize) {
    const bufferedClicks = [];
    let status = 0 /* WaitingForMoreClicks */;
    let maxDurationBetweenClicksTimeoutId;
    appendClick(firstClick);
    function appendClick(click) {
      click.stopObservable.subscribe(tryFinalize);
      bufferedClicks.push(click);
      clearTimeout(maxDurationBetweenClicksTimeoutId);
      maxDurationBetweenClicksTimeoutId = setTimeout(dontAcceptMoreClick, MAX_DURATION_BETWEEN_CLICKS);
    }
    function tryFinalize() {
      if (status === 1 /* WaitingForClicksToStop */ && bufferedClicks.every((click) => click.isStopped())) {
        status = 2 /* Finalized */;
        onFinalize(bufferedClicks);
      }
    }
    function dontAcceptMoreClick() {
      clearTimeout(maxDurationBetweenClicksTimeoutId);
      if (status === 0 /* WaitingForMoreClicks */) {
        status = 1 /* WaitingForClicksToStop */;
        tryFinalize();
      }
    }
    return {
      tryAppend: (click) => {
        if (status !== 0 /* WaitingForMoreClicks */) {
          return false;
        }
        if (bufferedClicks.length > 0 && !areEventsSimilar(bufferedClicks[bufferedClicks.length - 1].event, click.event)) {
          dontAcceptMoreClick();
          return false;
        }
        appendClick(click);
        return true;
      },
      stop: () => {
        dontAcceptMoreClick();
      }
    };
  }
  function areEventsSimilar(first, second) {
    return first.target === second.target && mouseEventDistance(first, second) <= MAX_DISTANCE_BETWEEN_CLICKS && first.timeStamp - second.timeStamp <= MAX_DURATION_BETWEEN_CLICKS;
  }
  function mouseEventDistance(origin, other) {
    return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2));
  }
  var MAX_DURATION_BETWEEN_CLICKS, MAX_DISTANCE_BETWEEN_CLICKS;
  var init_clickChain = __esm({
    "../packages/rum-core/src/domain/action/clickChain.ts"() {
      "use strict";
      init_src();
      MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND;
      MAX_DISTANCE_BETWEEN_CLICKS = 100;
    }
  });

  // ../packages/rum-core/src/domain/action/listenActionEvents.ts
  function listenActionEvents(configuration, { onPointerDown, onPointerUp }) {
    let selectionEmptyAtPointerDown;
    let userActivity = {
      selection: false,
      input: false,
      scroll: false
    };
    let clickContext;
    const listeners = [
      addEventListener(
        configuration,
        window,
        "pointerdown" /* POINTER_DOWN */,
        (event) => {
          if (isValidPointerEvent(event)) {
            selectionEmptyAtPointerDown = isSelectionEmpty();
            userActivity = {
              selection: false,
              input: false,
              scroll: false
            };
            clickContext = onPointerDown(event);
          }
        },
        { capture: true }
      ),
      addEventListener(
        configuration,
        window,
        "selectionchange" /* SELECTION_CHANGE */,
        () => {
          if (!selectionEmptyAtPointerDown || !isSelectionEmpty()) {
            userActivity.selection = true;
          }
        },
        { capture: true }
      ),
      addEventListener(
        configuration,
        window,
        "scroll" /* SCROLL */,
        () => {
          userActivity.scroll = true;
        },
        { capture: true, passive: true }
      ),
      addEventListener(
        configuration,
        window,
        "pointerup" /* POINTER_UP */,
        (event) => {
          if (isValidPointerEvent(event) && clickContext) {
            const localUserActivity = userActivity;
            onPointerUp(clickContext, event, () => localUserActivity);
            clickContext = void 0;
          }
        },
        { capture: true }
      ),
      addEventListener(
        configuration,
        window,
        "input" /* INPUT */,
        () => {
          userActivity.input = true;
        },
        { capture: true }
      )
    ];
    return {
      stop: () => {
        listeners.forEach((listener) => listener.stop());
      }
    };
  }
  function isSelectionEmpty() {
    const selection = window.getSelection();
    return !selection || selection.isCollapsed;
  }
  function isValidPointerEvent(event) {
    return event.target instanceof Element && // Only consider 'primary' pointer events for now. Multi-touch support could be implemented in
    // the future.
    event.isPrimary !== false;
  }
  var init_listenActionEvents = __esm({
    "../packages/rum-core/src/domain/action/listenActionEvents.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/action/computeFrustration.ts
  function computeFrustration(clicks, rageClick) {
    if (isRage(clicks)) {
      rageClick.addFrustration("rage_click" /* RAGE_CLICK */);
      if (clicks.some(isDead)) {
        rageClick.addFrustration("dead_click" /* DEAD_CLICK */);
      }
      if (rageClick.hasError) {
        rageClick.addFrustration("error_click" /* ERROR_CLICK */);
      }
      return { isRage: true };
    }
    const hasSelectionChanged = clicks.some((click) => click.getUserActivity().selection);
    clicks.forEach((click) => {
      if (click.hasError) {
        click.addFrustration("error_click" /* ERROR_CLICK */);
      }
      if (isDead(click) && // Avoid considering clicks part of a double-click or triple-click selections as dead clicks
      !hasSelectionChanged) {
        click.addFrustration("dead_click" /* DEAD_CLICK */);
      }
    });
    return { isRage: false };
  }
  function isRage(clicks) {
    if (clicks.some((click) => click.getUserActivity().selection || click.getUserActivity().scroll)) {
      return false;
    }
    for (let i = 0; i < clicks.length - (MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1); i += 1) {
      if (clicks[i + MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1].event.timeStamp - clicks[i].event.timeStamp <= ONE_SECOND) {
        return true;
      }
    }
    return false;
  }
  function isDead(click) {
    if (click.hasPageActivity || click.getUserActivity().input || click.getUserActivity().scroll) {
      return false;
    }
    return !click.event.target.matches(DEAD_CLICK_EXCLUDE_SELECTOR);
  }
  var MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE, DEAD_CLICK_EXCLUDE_SELECTOR;
  var init_computeFrustration = __esm({
    "../packages/rum-core/src/domain/action/computeFrustration.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE = 3;
      DEAD_CLICK_EXCLUDE_SELECTOR = // inputs that don't trigger a meaningful event like "input" when clicked, including textual
      // inputs (using a negative selector is shorter here)
      'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]),textarea,select,[contenteditable],[contenteditable] *,canvas,a[href],a[href] *';
    }
  });

  // ../packages/rum-core/src/domain/action/interactionSelectorCache.ts
  function getInteractionSelector(relativeTimestamp) {
    const selector = interactionSelectorCache.get(relativeTimestamp);
    interactionSelectorCache.delete(relativeTimestamp);
    return selector;
  }
  function updateInteractionSelector(relativeTimestamp, selector) {
    interactionSelectorCache.set(relativeTimestamp, selector);
    interactionSelectorCache.forEach((_, relativeTimestamp2) => {
      if (elapsed(relativeTimestamp2, relativeNow()) > CLICK_ACTION_MAX_DURATION) {
        interactionSelectorCache.delete(relativeTimestamp2);
      }
    });
  }
  var CLICK_ACTION_MAX_DURATION, interactionSelectorCache;
  var init_interactionSelectorCache = __esm({
    "../packages/rum-core/src/domain/action/interactionSelectorCache.ts"() {
      "use strict";
      init_src();
      CLICK_ACTION_MAX_DURATION = 10 * ONE_SECOND;
      interactionSelectorCache = /* @__PURE__ */ new Map();
    }
  });

  // ../packages/rum-core/src/domain/action/trackClickActions.ts
  function trackClickActions(lifeCycle, domMutationObservable, windowOpenObservable, configuration) {
    const history2 = createValueHistory({ expireDelay: ACTION_CONTEXT_TIME_OUT_DELAY });
    const stopObservable = new Observable();
    let currentClickChain;
    lifeCycle.subscribe(10 /* SESSION_RENEWED */, () => {
      history2.reset();
    });
    lifeCycle.subscribe(5 /* VIEW_ENDED */, stopClickChain);
    const { stop: stopActionEventsListener } = listenActionEvents(configuration, {
      onPointerDown: (pointerDownEvent) => processPointerDown(configuration, lifeCycle, domMutationObservable, pointerDownEvent, windowOpenObservable),
      onPointerUp: ({ clickActionBase, hadActivityOnPointerDown }, startEvent, getUserActivity) => {
        startClickAction(
          configuration,
          lifeCycle,
          domMutationObservable,
          windowOpenObservable,
          history2,
          stopObservable,
          appendClickToClickChain,
          clickActionBase,
          startEvent,
          getUserActivity,
          hadActivityOnPointerDown
        );
      }
    });
    const actionContexts = {
      findActionId: (startTime) => history2.findAll(startTime)
    };
    return {
      stop: () => {
        stopClickChain();
        stopObservable.notify();
        stopActionEventsListener();
      },
      actionContexts
    };
    function appendClickToClickChain(click) {
      if (!currentClickChain || !currentClickChain.tryAppend(click)) {
        const rageClick = click.clone();
        currentClickChain = createClickChain(click, (clicks) => {
          finalizeClicks(clicks, rageClick);
        });
      }
    }
    function stopClickChain() {
      if (currentClickChain) {
        currentClickChain.stop();
      }
    }
  }
  function processPointerDown(configuration, lifeCycle, domMutationObservable, pointerDownEvent, windowOpenObservable) {
    const nodePrivacyLevel = configuration.enablePrivacyForActionName ? getNodePrivacyLevel(pointerDownEvent.target, configuration.defaultPrivacyLevel) : NodePrivacyLevel.ALLOW;
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      return void 0;
    }
    const clickActionBase = computeClickActionBase(pointerDownEvent, nodePrivacyLevel, configuration);
    let hadActivityOnPointerDown = false;
    waitPageActivityEnd(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      (pageActivityEndEvent) => {
        hadActivityOnPointerDown = pageActivityEndEvent.hadActivity;
      },
      // We don't care about the activity duration, we just want to know whether an activity did happen
      // within the "validation delay" or not. Limit the duration so the callback is called sooner.
      PAGE_ACTIVITY_VALIDATION_DELAY
    );
    return { clickActionBase, hadActivityOnPointerDown: () => hadActivityOnPointerDown };
  }
  function startClickAction(configuration, lifeCycle, domMutationObservable, windowOpenObservable, history2, stopObservable, appendClickToClickChain, clickActionBase, startEvent, getUserActivity, hadActivityOnPointerDown) {
    const click = newClick(lifeCycle, history2, getUserActivity, clickActionBase, startEvent);
    appendClickToClickChain(click);
    const selector = clickActionBase?.target?.selector;
    if (selector) {
      updateInteractionSelector(startEvent.timeStamp, selector);
    }
    const { stop: stopWaitPageActivityEnd } = waitPageActivityEnd(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      (pageActivityEndEvent) => {
        if (pageActivityEndEvent.hadActivity && pageActivityEndEvent.end < click.startClocks.timeStamp) {
          click.discard();
        } else {
          if (pageActivityEndEvent.hadActivity) {
            click.stop(pageActivityEndEvent.end);
          } else if (hadActivityOnPointerDown()) {
            click.stop(
              // using the click start as activity end, so the click will have some activity but its
              // duration will be 0 (as the activity started before the click start)
              click.startClocks.timeStamp
            );
          } else {
            click.stop();
          }
        }
      },
      CLICK_ACTION_MAX_DURATION
    );
    const viewEndedSubscription = lifeCycle.subscribe(5 /* VIEW_ENDED */, ({ endClocks }) => {
      click.stop(endClocks.timeStamp);
    });
    const stopSubscription = stopObservable.subscribe(() => {
      click.stop();
    });
    click.stopObservable.subscribe(() => {
      viewEndedSubscription.unsubscribe();
      stopWaitPageActivityEnd();
      stopSubscription.unsubscribe();
    });
  }
  function computeClickActionBase(event, nodePrivacyLevel, configuration) {
    const rect = event.target.getBoundingClientRect();
    const selector = getSelectorFromElement(event.target, configuration.actionNameAttribute);
    if (selector) {
      updateInteractionSelector(event.timeStamp, selector);
    }
    const actionName = getActionNameFromElement(event.target, configuration, nodePrivacyLevel);
    return {
      type: "click" /* CLICK */,
      target: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        selector
      },
      position: {
        // Use clientX and Y because for SVG element offsetX and Y are relatives to the <svg> element
        x: Math.round(event.clientX - rect.left),
        y: Math.round(event.clientY - rect.top)
      },
      name: actionName.name,
      nameSource: actionName.nameSource
    };
  }
  function newClick(lifeCycle, history2, getUserActivity, clickActionBase, startEvent) {
    const id = generateUUID();
    const startClocks = clocksNow();
    const historyEntry = history2.add(id, startClocks.relative);
    const eventCountsSubscription = trackEventCounts({
      lifeCycle,
      isChildEvent: (event) => event.action !== void 0 && (Array.isArray(event.action.id) ? event.action.id.includes(id) : event.action.id === id)
    });
    let status = 0 /* ONGOING */;
    let activityEndTime;
    const frustrationTypes = [];
    const stopObservable = new Observable();
    function stop(newActivityEndTime) {
      if (status !== 0 /* ONGOING */) {
        return;
      }
      activityEndTime = newActivityEndTime;
      status = 1 /* STOPPED */;
      if (activityEndTime) {
        historyEntry.close(getRelativeTime(activityEndTime));
      } else {
        historyEntry.remove();
      }
      eventCountsSubscription.stop();
      stopObservable.notify();
    }
    return {
      event: startEvent,
      stop,
      stopObservable,
      get hasError() {
        return eventCountsSubscription.eventCounts.errorCount > 0;
      },
      get hasPageActivity() {
        return activityEndTime !== void 0;
      },
      getUserActivity,
      addFrustration: (frustrationType) => {
        frustrationTypes.push(frustrationType);
      },
      startClocks,
      isStopped: () => status === 1 /* STOPPED */ || status === 2 /* FINALIZED */,
      clone: () => newClick(lifeCycle, history2, getUserActivity, clickActionBase, startEvent),
      validate: (domEvents) => {
        stop();
        if (status !== 1 /* STOPPED */) {
          return;
        }
        const { resourceCount, errorCount, longTaskCount } = eventCountsSubscription.eventCounts;
        const clickAction = {
          duration: activityEndTime && elapsed(startClocks.timeStamp, activityEndTime),
          startClocks,
          id,
          frustrationTypes,
          counts: {
            resourceCount,
            errorCount,
            longTaskCount
          },
          events: domEvents ?? [startEvent],
          event: startEvent,
          ...clickActionBase
        };
        lifeCycle.notify(0 /* AUTO_ACTION_COMPLETED */, clickAction);
        status = 2 /* FINALIZED */;
      },
      discard: () => {
        stop();
        status = 2 /* FINALIZED */;
      }
    };
  }
  function finalizeClicks(clicks, rageClick) {
    const { isRage: isRage2 } = computeFrustration(clicks, rageClick);
    if (isRage2) {
      clicks.forEach((click) => click.discard());
      rageClick.stop(timeStampNow());
      rageClick.validate(clicks.map((click) => click.event));
    } else {
      rageClick.discard();
      clicks.forEach((click) => click.validate());
    }
  }
  var ACTION_CONTEXT_TIME_OUT_DELAY;
  var init_trackClickActions = __esm({
    "../packages/rum-core/src/domain/action/trackClickActions.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_trackEventCounts();
      init_waitPageActivityEnd();
      init_getSelectorFromElement();
      init_privacy();
      init_clickChain();
      init_getActionNameFromElement();
      init_listenActionEvents();
      init_computeFrustration();
      init_interactionSelectorCache();
      ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE;
    }
  });

  // ../packages/rum-core/src/domain/action/actionCollection.ts
  function startActionCollection(lifeCycle, hooks, domMutationObservable, windowOpenObservable, configuration) {
    lifeCycle.subscribe(
      0 /* AUTO_ACTION_COMPLETED */,
      (action) => lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, processAction(action))
    );
    hooks.register(0 /* Assemble */, ({ startTime, eventType }) => {
      if (eventType !== "error" /* ERROR */ && eventType !== "resource" /* RESOURCE */ && eventType !== "long_task" /* LONG_TASK */) {
        return;
      }
      const actionId = actionContexts.findActionId(startTime);
      if (!actionId) {
        return;
      }
      return {
        type: eventType,
        action: { id: actionId }
      };
    });
    let actionContexts = { findActionId: noop };
    let stop = noop;
    if (configuration.trackUserInteractions) {
      ;
      ({ actionContexts, stop } = trackClickActions(
        lifeCycle,
        domMutationObservable,
        windowOpenObservable,
        configuration
      ));
    }
    return {
      addAction: (action, savedCommonContext) => {
        lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, {
          savedCommonContext,
          ...processAction(action)
        });
      },
      actionContexts,
      stop
    };
  }
  function processAction(action) {
    const autoActionProperties = isAutoAction(action) ? {
      action: {
        id: action.id,
        loading_time: discardNegativeDuration(toServerDuration(action.duration)),
        frustration: {
          type: action.frustrationTypes
        },
        error: {
          count: action.counts.errorCount
        },
        long_task: {
          count: action.counts.longTaskCount
        },
        resource: {
          count: action.counts.resourceCount
        }
      },
      _dd: {
        action: {
          target: action.target,
          position: action.position,
          name_source: action.nameSource
        }
      }
    } : void 0;
    const actionEvent = combine(
      {
        action: { id: generateUUID(), target: { name: action.name }, type: action.type },
        date: action.startClocks.timeStamp,
        type: "action" /* ACTION */
      },
      autoActionProperties
    );
    const duration = isAutoAction(action) ? action.duration : void 0;
    const customerContext = !isAutoAction(action) ? action.context : void 0;
    const domainContext = isAutoAction(action) ? { events: action.events } : { handlingStack: action.handlingStack };
    return {
      customerContext,
      rawRumEvent: actionEvent,
      duration,
      startTime: action.startClocks.relative,
      domainContext
    };
  }
  function isAutoAction(action) {
    return action.type !== "custom" /* CUSTOM */;
  }
  var init_actionCollection = __esm({
    "../packages/rum-core/src/domain/action/actionCollection.ts"() {
      "use strict";
      init_src();
      init_discardNegativeDuration();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_hooks();
      init_trackClickActions();
    }
  });

  // ../packages/rum-core/src/domain/error/trackConsoleError.ts
  function trackConsoleError(errorObservable) {
    const subscription = initConsoleObservable([ConsoleApiName.error]).subscribe(
      (consoleLog) => errorObservable.notify(consoleLog.error)
    );
    return {
      stop: () => {
        subscription.unsubscribe();
      }
    };
  }
  var init_trackConsoleError = __esm({
    "../packages/rum-core/src/domain/error/trackConsoleError.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/error/trackReportError.ts
  function trackReportError(configuration, errorObservable) {
    const subscription = initReportObservable(configuration, [
      RawReportType.cspViolation,
      RawReportType.intervention
    ]).subscribe((rawError) => errorObservable.notify(rawError));
    return {
      stop: () => {
        subscription.unsubscribe();
      }
    };
  }
  var init_trackReportError = __esm({
    "../packages/rum-core/src/domain/error/trackReportError.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/error/errorCollection.ts
  function startErrorCollection(lifeCycle, configuration) {
    const errorObservable = new Observable();
    trackConsoleError(errorObservable);
    trackRuntimeError(errorObservable);
    trackReportError(configuration, errorObservable);
    errorObservable.subscribe((error) => lifeCycle.notify(14 /* RAW_ERROR_COLLECTED */, { error }));
    return doStartErrorCollection(lifeCycle);
  }
  function doStartErrorCollection(lifeCycle) {
    lifeCycle.subscribe(14 /* RAW_ERROR_COLLECTED */, ({ error, customerContext, savedCommonContext }) => {
      customerContext = combine(error.context, customerContext);
      lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, {
        customerContext,
        savedCommonContext,
        ...processError(error)
      });
    });
    return {
      addError: ({ error, handlingStack, componentStack, startClocks, context: customerContext }, savedCommonContext) => {
        const stackTrace = isError(error) ? computeStackTrace(error) : void 0;
        const rawError = computeRawError({
          stackTrace,
          originalError: error,
          handlingStack,
          componentStack,
          startClocks,
          nonErrorPrefix: "Provided" /* PROVIDED */,
          source: ErrorSource.CUSTOM,
          handling: "handled" /* HANDLED */
        });
        lifeCycle.notify(14 /* RAW_ERROR_COLLECTED */, {
          customerContext,
          savedCommonContext,
          error: rawError
        });
      }
    };
  }
  function processError(error) {
    const rawRumEvent = {
      date: error.startClocks.timeStamp,
      error: {
        id: generateUUID(),
        message: error.message,
        source: error.source,
        stack: error.stack,
        handling_stack: error.handlingStack,
        component_stack: error.componentStack,
        type: error.type,
        handling: error.handling,
        causes: error.causes,
        source_type: "browser",
        fingerprint: error.fingerprint,
        csp: error.csp
      },
      type: "error" /* ERROR */
    };
    const domainContext = {
      error: error.originalError,
      handlingStack: error.handlingStack
    };
    return {
      rawRumEvent,
      startTime: error.startClocks.relative,
      domainContext
    };
  }
  var init_errorCollection = __esm({
    "../packages/rum-core/src/domain/error/errorCollection.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_trackConsoleError();
      init_trackReportError();
    }
  });

  // ../packages/rum-core/src/domain/resource/matchRequestResourceEntry.ts
  function matchRequestResourceEntry(request) {
    if (!performance || !("getEntriesByName" in performance)) {
      return;
    }
    const sameNameEntries = performance.getEntriesByName(request.url, "resource");
    if (!sameNameEntries.length || !("toJSON" in sameNameEntries[0])) {
      return;
    }
    const candidates = sameNameEntries.filter((entry) => !alreadyMatchedEntries.has(entry)).filter((entry) => hasValidResourceEntryDuration(entry) && hasValidResourceEntryTimings(entry)).filter(
      (entry) => isBetween(
        entry,
        request.startClocks.relative,
        endTime({ startTime: request.startClocks.relative, duration: request.duration })
      )
    );
    if (candidates.length === 1) {
      alreadyMatchedEntries.add(candidates[0]);
      return candidates[0].toJSON();
    }
    return;
  }
  function endTime(timing) {
    return addDuration(timing.startTime, timing.duration);
  }
  function isBetween(timing, start, end) {
    const errorMargin = 1;
    return timing.startTime >= start - errorMargin && endTime(timing) <= addDuration(end, errorMargin);
  }
  var alreadyMatchedEntries;
  var init_matchRequestResourceEntry = __esm({
    "../packages/rum-core/src/domain/resource/matchRequestResourceEntry.ts"() {
      "use strict";
      init_src();
      init_resourceUtils2();
      alreadyMatchedEntries = /* @__PURE__ */ new WeakSet();
    }
  });

  // ../packages/rum-core/src/domain/tracing/getDocumentTraceId.ts
  function getDocumentTraceId(document2) {
    const data = getDocumentTraceDataFromMeta(document2) || getDocumentTraceDataFromComment(document2);
    if (!data || data.traceTime <= dateNow() - INITIAL_DOCUMENT_OUTDATED_TRACE_ID_THRESHOLD) {
      return void 0;
    }
    return data.traceId;
  }
  function getDocumentTraceDataFromMeta(document2) {
    const traceIdMeta = document2.querySelector("meta[name=dd-trace-id]");
    const traceTimeMeta = document2.querySelector("meta[name=dd-trace-time]");
    return createDocumentTraceData(traceIdMeta && traceIdMeta.content, traceTimeMeta && traceTimeMeta.content);
  }
  function getDocumentTraceDataFromComment(document2) {
    const comment = findTraceComment(document2);
    if (!comment) {
      return void 0;
    }
    return createDocumentTraceData(
      findCommaSeparatedValue(comment, "trace-id"),
      findCommaSeparatedValue(comment, "trace-time")
    );
  }
  function createDocumentTraceData(traceId, rawTraceTime) {
    const traceTime = rawTraceTime && Number(rawTraceTime);
    if (!traceId || !traceTime) {
      return void 0;
    }
    return {
      traceId,
      traceTime
    };
  }
  function findTraceComment(document2) {
    for (let i = 0; i < document2.childNodes.length; i += 1) {
      const comment = getTraceCommentFromNode(document2.childNodes[i]);
      if (comment) {
        return comment;
      }
    }
    if (document2.body) {
      for (let i = document2.body.childNodes.length - 1; i >= 0; i -= 1) {
        const node = document2.body.childNodes[i];
        const comment = getTraceCommentFromNode(node);
        if (comment) {
          return comment;
        }
        if (!isTextNode(node)) {
          break;
        }
      }
    }
  }
  function getTraceCommentFromNode(node) {
    if (node && isCommentNode(node)) {
      const match = /^\s*DATADOG;(.*?)\s*$/.exec(node.data);
      if (match) {
        return match[1];
      }
    }
  }
  var INITIAL_DOCUMENT_OUTDATED_TRACE_ID_THRESHOLD;
  var init_getDocumentTraceId = __esm({
    "../packages/rum-core/src/domain/tracing/getDocumentTraceId.ts"() {
      "use strict";
      init_src();
      init_htmlDomUtils();
      INITIAL_DOCUMENT_OUTDATED_TRACE_ID_THRESHOLD = 2 * ONE_MINUTE;
    }
  });

  // ../packages/rum-core/src/browser/performanceUtils.ts
  function getNavigationEntry() {
    if (supportPerformanceTimingEvent("navigation" /* NAVIGATION */)) {
      const navigationEntry = performance.getEntriesByType(
        "navigation" /* NAVIGATION */
      )[0];
      if (navigationEntry) {
        return navigationEntry;
      }
    }
    const timings = computeTimingsFromDeprecatedPerformanceTiming();
    const entry = {
      entryType: "navigation" /* NAVIGATION */,
      initiatorType: "navigation",
      name: window.location.href,
      startTime: 0,
      duration: timings.loadEventEnd,
      decodedBodySize: 0,
      encodedBodySize: 0,
      transferSize: 0,
      workerStart: 0,
      toJSON: () => ({ ...entry, toJSON: void 0 }),
      ...timings
    };
    return entry;
  }
  function computeTimingsFromDeprecatedPerformanceTiming() {
    const result = {};
    const timing = performance.timing;
    for (const key in timing) {
      if (isNumber(timing[key])) {
        const numberKey = key;
        const timingElement = timing[numberKey];
        result[numberKey] = timingElement === 0 ? 0 : getRelativeTime(timingElement);
      }
    }
    return result;
  }
  var init_performanceUtils = __esm({
    "../packages/rum-core/src/browser/performanceUtils.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
    }
  });

  // ../packages/rum-core/src/domain/resource/retrieveInitialDocumentResourceTiming.ts
  function retrieveInitialDocumentResourceTiming(configuration, callback, getNavigationEntryImpl = getNavigationEntry) {
    runOnReadyState(configuration, "interactive", () => {
      const navigationEntry = getNavigationEntryImpl();
      const entry = Object.assign(navigationEntry.toJSON(), {
        entryType: "resource" /* RESOURCE */,
        initiatorType: FAKE_INITIAL_DOCUMENT,
        // The ResourceTiming duration entry should be `responseEnd - startTime`. With
        // NavigationTiming entries, `startTime` is always 0, so set it to `responseEnd`.
        duration: navigationEntry.responseEnd,
        traceId: getDocumentTraceId(document),
        toJSON: () => ({ ...entry, toJSON: void 0 })
      });
      callback(entry);
    });
  }
  var init_retrieveInitialDocumentResourceTiming = __esm({
    "../packages/rum-core/src/domain/resource/retrieveInitialDocumentResourceTiming.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
      init_getDocumentTraceId();
      init_performanceUtils();
      init_resourceUtils2();
    }
  });

  // ../packages/rum-core/src/domain/resource/resourceCollection.ts
  function startResourceCollection(lifeCycle, configuration, pageStateHistory, taskQueue = createTaskQueue(), retrieveInitialDocumentResourceTimingImpl = retrieveInitialDocumentResourceTiming) {
    lifeCycle.subscribe(8 /* REQUEST_COMPLETED */, (request) => {
      handleResource(() => processRequest(request, configuration, pageStateHistory));
    });
    const performanceResourceSubscription = createPerformanceObservable(configuration, {
      type: "resource" /* RESOURCE */,
      buffered: true
    }).subscribe((entries) => {
      for (const entry of entries) {
        if (!isResourceEntryRequestType(entry)) {
          handleResource(() => processResourceEntry(entry, configuration));
        }
      }
    });
    retrieveInitialDocumentResourceTimingImpl(configuration, (timing) => {
      handleResource(() => processResourceEntry(timing, configuration));
    });
    function handleResource(computeRawEvent) {
      taskQueue.push(() => {
        const rawEvent = computeRawEvent();
        if (rawEvent) {
          lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, rawEvent);
        }
      });
    }
    return {
      stop: () => {
        performanceResourceSubscription.unsubscribe();
      }
    };
  }
  function processRequest(request, configuration, pageStateHistory) {
    const matchingTiming = matchRequestResourceEntry(request);
    const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks;
    const tracingInfo = computeRequestTracingInfo(request, configuration);
    if (!configuration.trackResources && !tracingInfo) {
      return;
    }
    const type = request.type === "xhr" /* XHR */ ? "xhr" /* XHR */ : "fetch" /* FETCH */;
    const correspondingTimingOverrides = matchingTiming ? computeResourceEntryMetrics(matchingTiming) : void 0;
    const duration = matchingTiming ? computeResourceEntryDuration(matchingTiming) : computeRequestDuration(pageStateHistory, startClocks, request.duration);
    const resourceEvent = combine(
      {
        date: startClocks.timeStamp,
        resource: {
          id: generateUUID(),
          type,
          duration: toServerDuration(duration),
          method: request.method,
          status_code: request.status,
          protocol: matchingTiming && computeResourceEntryProtocol(matchingTiming),
          url: isLongDataUrl(request.url) ? sanitizeDataUrl(request.url) : request.url,
          delivery_type: matchingTiming && computeResourceEntryDeliveryType(matchingTiming)
        },
        type: "resource" /* RESOURCE */,
        _dd: {
          discarded: !configuration.trackResources
        }
      },
      tracingInfo,
      correspondingTimingOverrides
    );
    return {
      startTime: startClocks.relative,
      duration,
      rawRumEvent: resourceEvent,
      domainContext: {
        performanceEntry: matchingTiming,
        xhr: request.xhr,
        response: request.response,
        requestInput: request.input,
        requestInit: request.init,
        error: request.error,
        isAborted: request.isAborted,
        handlingStack: request.handlingStack
      }
    };
  }
  function processResourceEntry(entry, configuration) {
    const startClocks = relativeToClocks(entry.startTime);
    const tracingInfo = computeResourceEntryTracingInfo(entry, configuration);
    if (!configuration.trackResources && !tracingInfo) {
      return;
    }
    const type = computeResourceEntryType(entry);
    const entryMetrics = computeResourceEntryMetrics(entry);
    const duration = computeResourceEntryDuration(entry);
    const resourceEvent = combine(
      {
        date: startClocks.timeStamp,
        resource: {
          id: generateUUID(),
          type,
          duration: toServerDuration(duration),
          url: entry.name,
          status_code: discardZeroStatus(entry.responseStatus),
          protocol: computeResourceEntryProtocol(entry),
          delivery_type: computeResourceEntryDeliveryType(entry)
        },
        type: "resource" /* RESOURCE */,
        _dd: {
          discarded: !configuration.trackResources
        }
      },
      tracingInfo,
      entryMetrics
    );
    return {
      startTime: startClocks.relative,
      duration,
      rawRumEvent: resourceEvent,
      domainContext: {
        performanceEntry: entry
      }
    };
  }
  function computeResourceEntryMetrics(entry) {
    const { renderBlockingStatus } = entry;
    return {
      resource: {
        render_blocking_status: renderBlockingStatus,
        ...computeResourceEntrySize(entry),
        ...computeResourceEntryDetails(entry)
      }
    };
  }
  function computeRequestTracingInfo(request, configuration) {
    const hasBeenTraced = request.traceSampled && request.traceId && request.spanId;
    if (!hasBeenTraced) {
      return void 0;
    }
    return {
      _dd: {
        span_id: request.spanId.toString(),
        trace_id: request.traceId.toString(),
        rule_psr: configuration.rulePsr
      }
    };
  }
  function computeResourceEntryTracingInfo(entry, configuration) {
    const hasBeenTraced = entry.traceId;
    if (!hasBeenTraced) {
      return void 0;
    }
    return {
      _dd: {
        trace_id: entry.traceId,
        span_id: createSpanIdentifier().toString(),
        rule_psr: configuration.rulePsr
      }
    };
  }
  function computeRequestDuration(pageStateHistory, startClocks, duration) {
    return !pageStateHistory.wasInPageStateDuringPeriod("frozen" /* FROZEN */, startClocks.relative, duration) ? duration : void 0;
  }
  function discardZeroStatus(statusCode) {
    return statusCode === 0 ? void 0 : statusCode;
  }
  var init_resourceCollection = __esm({
    "../packages/rum-core/src/domain/resource/resourceCollection.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_pageStateHistory();
      init_identifier();
      init_matchRequestResourceEntry();
      init_resourceUtils2();
      init_retrieveInitialDocumentResourceTiming();
    }
  });

  // ../packages/rum-core/src/domain/view/trackViewEventCounts.ts
  function trackViewEventCounts(lifeCycle, viewId, onChange) {
    const { stop, eventCounts } = trackEventCounts({
      lifeCycle,
      isChildEvent: (event) => event.view.id === viewId,
      onChange
    });
    return {
      stop,
      eventCounts
    };
  }
  var init_trackViewEventCounts = __esm({
    "../packages/rum-core/src/domain/view/trackViewEventCounts.ts"() {
      "use strict";
      init_trackEventCounts();
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackFirstContentfulPaint.ts
  function trackFirstContentfulPaint(configuration, firstHidden, callback) {
    const performanceSubscription = createPerformanceObservable(configuration, {
      type: "paint" /* PAINT */,
      buffered: true
    }).subscribe((entries) => {
      const fcpEntry = entries.find(
        (entry) => entry.name === "first-contentful-paint" && entry.startTime < firstHidden.timeStamp && entry.startTime < FCP_MAXIMUM_DELAY
      );
      if (fcpEntry) {
        callback(fcpEntry.startTime);
      }
    });
    return {
      stop: performanceSubscription.unsubscribe
    };
  }
  var FCP_MAXIMUM_DELAY;
  var init_trackFirstContentfulPaint = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackFirstContentfulPaint.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
      FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE;
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackFirstInput.ts
  function trackFirstInput(configuration, firstHidden, callback) {
    const performanceFirstInputSubscription = createPerformanceObservable(configuration, {
      type: "first-input" /* FIRST_INPUT */,
      buffered: true
    }).subscribe((entries) => {
      const firstInputEntry = entries.find(
        (entry) => entry.startTime < firstHidden.timeStamp
      );
      if (firstInputEntry) {
        const firstInputDelay = elapsed(firstInputEntry.startTime, firstInputEntry.processingStart);
        let firstInputTargetSelector;
        if (firstInputEntry.target && isElementNode(firstInputEntry.target)) {
          firstInputTargetSelector = getSelectorFromElement(firstInputEntry.target, configuration.actionNameAttribute);
        }
        callback({
          // Ensure firstInputDelay to be positive, see
          // https://bugs.chromium.org/p/chromium/issues/detail?id=1185815
          delay: firstInputDelay >= 0 ? firstInputDelay : 0,
          time: firstInputEntry.startTime,
          targetSelector: firstInputTargetSelector
        });
      }
    });
    return {
      stop: () => {
        performanceFirstInputSubscription.unsubscribe();
      }
    };
  }
  var init_trackFirstInput = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackFirstInput.ts"() {
      "use strict";
      init_src();
      init_htmlDomUtils();
      init_performanceObservable();
      init_getSelectorFromElement();
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackNavigationTimings.ts
  function trackNavigationTimings(configuration, callback, getNavigationEntryImpl = getNavigationEntry) {
    return waitAfterLoadEvent(configuration, () => {
      const entry = getNavigationEntryImpl();
      if (!isIncompleteNavigation(entry)) {
        callback(processNavigationEntry(entry));
      }
    });
  }
  function processNavigationEntry(entry) {
    return {
      domComplete: entry.domComplete,
      domContentLoaded: entry.domContentLoadedEventEnd,
      domInteractive: entry.domInteractive,
      loadEvent: entry.loadEventEnd,
      // In some cases the value reported is negative or is larger
      // than the current page time. Ignore these cases:
      // https://github.com/GoogleChrome/web-vitals/issues/137
      // https://github.com/GoogleChrome/web-vitals/issues/162
      firstByte: entry.responseStart >= 0 && entry.responseStart <= relativeNow() ? entry.responseStart : void 0
    };
  }
  function isIncompleteNavigation(entry) {
    return entry.loadEventEnd <= 0;
  }
  function waitAfterLoadEvent(configuration, callback) {
    let timeoutId;
    const { stop: stopOnReadyState } = runOnReadyState(configuration, "complete", () => {
      timeoutId = setTimeout(() => callback());
    });
    return {
      stop: () => {
        stopOnReadyState();
        clearTimeout(timeoutId);
      }
    };
  }
  var init_trackNavigationTimings = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackNavigationTimings.ts"() {
      "use strict";
      init_src();
      init_performanceUtils();
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackLargestContentfulPaint.ts
  function trackLargestContentfulPaint(configuration, firstHidden, eventTarget, callback) {
    let firstInteractionTimestamp = Infinity;
    const { stop: stopEventListener } = addEventListeners(
      configuration,
      eventTarget,
      ["pointerdown" /* POINTER_DOWN */, "keydown" /* KEY_DOWN */],
      (event) => {
        firstInteractionTimestamp = event.timeStamp;
      },
      { capture: true, once: true }
    );
    let biggestLcpSize = 0;
    const performanceLcpSubscription = createPerformanceObservable(configuration, {
      type: "largest-contentful-paint" /* LARGEST_CONTENTFUL_PAINT */,
      buffered: true
    }).subscribe((entries) => {
      const lcpEntry = findLast(
        entries,
        (entry) => entry.entryType === "largest-contentful-paint" /* LARGEST_CONTENTFUL_PAINT */ && entry.startTime < firstInteractionTimestamp && entry.startTime < firstHidden.timeStamp && entry.startTime < LCP_MAXIMUM_DELAY && // Ensure to get the LCP entry with the biggest size, see
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1516655
        entry.size > biggestLcpSize
      );
      if (lcpEntry) {
        let lcpTargetSelector;
        if (lcpEntry.element) {
          lcpTargetSelector = getSelectorFromElement(lcpEntry.element, configuration.actionNameAttribute);
        }
        callback({
          value: lcpEntry.startTime,
          targetSelector: lcpTargetSelector,
          resourceUrl: computeLcpEntryUrl(lcpEntry)
        });
        biggestLcpSize = lcpEntry.size;
      }
    });
    return {
      stop: () => {
        stopEventListener();
        performanceLcpSubscription.unsubscribe();
      }
    };
  }
  function computeLcpEntryUrl(entry) {
    return entry.url === "" ? void 0 : entry.url;
  }
  var LCP_MAXIMUM_DELAY;
  var init_trackLargestContentfulPaint = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackLargestContentfulPaint.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
      init_getSelectorFromElement();
      LCP_MAXIMUM_DELAY = 10 * ONE_MINUTE;
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackFirstHidden.ts
  function trackFirstHidden(configuration, eventTarget = window) {
    let timeStamp;
    let stopListeners;
    if (document.visibilityState === "hidden") {
      timeStamp = 0;
    } else {
      timeStamp = Infinity;
      ({ stop: stopListeners } = addEventListeners(
        configuration,
        eventTarget,
        ["pagehide" /* PAGE_HIDE */, "visibilitychange" /* VISIBILITY_CHANGE */],
        (event) => {
          if (event.type === "pagehide" /* PAGE_HIDE */ || document.visibilityState === "hidden") {
            timeStamp = event.timeStamp;
            stopListeners();
          }
        },
        { capture: true }
      ));
    }
    return {
      get timeStamp() {
        return timeStamp;
      },
      stop() {
        stopListeners?.();
      }
    };
  }
  var init_trackFirstHidden = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackFirstHidden.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackInitialViewMetrics.ts
  function trackInitialViewMetrics(configuration, setLoadEvent, scheduleViewUpdate) {
    const initialViewMetrics = {};
    const { stop: stopNavigationTracking } = trackNavigationTimings(configuration, (navigationTimings) => {
      setLoadEvent(navigationTimings.loadEvent);
      initialViewMetrics.navigationTimings = navigationTimings;
      scheduleViewUpdate();
    });
    const firstHidden = trackFirstHidden(configuration);
    const { stop: stopFCPTracking } = trackFirstContentfulPaint(configuration, firstHidden, (firstContentfulPaint) => {
      initialViewMetrics.firstContentfulPaint = firstContentfulPaint;
      scheduleViewUpdate();
    });
    const { stop: stopLCPTracking } = trackLargestContentfulPaint(
      configuration,
      firstHidden,
      window,
      (largestContentfulPaint) => {
        initialViewMetrics.largestContentfulPaint = largestContentfulPaint;
        scheduleViewUpdate();
      }
    );
    const { stop: stopFIDTracking } = trackFirstInput(configuration, firstHidden, (firstInput) => {
      initialViewMetrics.firstInput = firstInput;
      scheduleViewUpdate();
    });
    function stop() {
      stopNavigationTracking();
      stopFCPTracking();
      stopLCPTracking();
      stopFIDTracking();
      firstHidden.stop();
    }
    return {
      stop,
      initialViewMetrics
    };
  }
  var init_trackInitialViewMetrics = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackInitialViewMetrics.ts"() {
      "use strict";
      init_trackFirstContentfulPaint();
      init_trackFirstInput();
      init_trackNavigationTimings();
      init_trackLargestContentfulPaint();
      init_trackFirstHidden();
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackCumulativeLayoutShift.ts
  function trackCumulativeLayoutShift(configuration, viewStart, callback) {
    if (!isLayoutShiftSupported()) {
      return {
        stop: noop
      };
    }
    let maxClsValue = 0;
    let biggestShift;
    callback({
      value: 0
    });
    const window2 = slidingSessionWindow();
    const performanceSubscription = createPerformanceObservable(configuration, {
      type: "layout-shift" /* LAYOUT_SHIFT */,
      buffered: true
    }).subscribe((entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput || entry.startTime < viewStart) {
          continue;
        }
        const { cumulatedValue, isMaxValue } = window2.update(entry);
        if (isMaxValue) {
          const attribution = getFirstElementAttribution(entry.sources);
          biggestShift = {
            target: attribution?.node ? new WeakRef(attribution.node) : void 0,
            time: elapsed(viewStart, entry.startTime),
            previousRect: attribution?.previousRect,
            currentRect: attribution?.currentRect
          };
        }
        if (cumulatedValue > maxClsValue) {
          maxClsValue = cumulatedValue;
          const target = biggestShift?.target?.deref();
          callback({
            value: round(maxClsValue, 4),
            targetSelector: target && getSelectorFromElement(target, configuration.actionNameAttribute),
            time: biggestShift?.time,
            previousRect: biggestShift?.previousRect ? asRumRect(biggestShift.previousRect) : void 0,
            currentRect: biggestShift?.currentRect ? asRumRect(biggestShift.currentRect) : void 0
          });
        }
      }
    });
    return {
      stop: () => {
        performanceSubscription.unsubscribe();
      }
    };
  }
  function getFirstElementAttribution(sources) {
    return sources.find(
      (source) => !!source.node && isElementNode(source.node)
    );
  }
  function asRumRect({ x, y, width, height }) {
    return { x, y, width, height };
  }
  function slidingSessionWindow() {
    let cumulatedValue = 0;
    let startTime;
    let endTime2;
    let maxValue = 0;
    return {
      update: (entry) => {
        const shouldCreateNewWindow = startTime === void 0 || entry.startTime - endTime2 >= MAX_UPDATE_GAP || entry.startTime - startTime >= MAX_WINDOW_DURATION;
        let isMaxValue;
        if (shouldCreateNewWindow) {
          startTime = endTime2 = entry.startTime;
          maxValue = cumulatedValue = entry.value;
          isMaxValue = true;
        } else {
          cumulatedValue += entry.value;
          endTime2 = entry.startTime;
          isMaxValue = entry.value > maxValue;
          if (isMaxValue) {
            maxValue = entry.value;
          }
        }
        return {
          cumulatedValue,
          isMaxValue
        };
      }
    };
  }
  function isLayoutShiftSupported() {
    return supportPerformanceTimingEvent("layout-shift" /* LAYOUT_SHIFT */) && "WeakRef" in window;
  }
  var MAX_WINDOW_DURATION, MAX_UPDATE_GAP;
  var init_trackCumulativeLayoutShift = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackCumulativeLayoutShift.ts"() {
      "use strict";
      init_src();
      init_htmlDomUtils();
      init_performanceObservable();
      init_getSelectorFromElement();
      MAX_WINDOW_DURATION = 5 * ONE_SECOND;
      MAX_UPDATE_GAP = ONE_SECOND;
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/interactionCountPolyfill.ts
  function initInteractionCountPolyfill() {
    if ("interactionCount" in performance || observer) {
      return;
    }
    observer = new window.PerformanceObserver(
      monitor((entries) => {
        entries.getEntries().forEach((e) => {
          const entry = e;
          if (entry.interactionId) {
            minKnownInteractionId = Math.min(minKnownInteractionId, entry.interactionId);
            maxKnownInteractionId = Math.max(maxKnownInteractionId, entry.interactionId);
            interactionCountEstimate = (maxKnownInteractionId - minKnownInteractionId) / 7 + 1;
          }
        });
      })
    );
    observer.observe({ type: "event", buffered: true, durationThreshold: 0 });
  }
  var observer, interactionCountEstimate, minKnownInteractionId, maxKnownInteractionId, getInteractionCount;
  var init_interactionCountPolyfill = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/interactionCountPolyfill.ts"() {
      "use strict";
      init_src();
      interactionCountEstimate = 0;
      minKnownInteractionId = Infinity;
      maxKnownInteractionId = 0;
      getInteractionCount = () => observer ? interactionCountEstimate : window.performance.interactionCount || 0;
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackInteractionToNextPaint.ts
  function trackInteractionToNextPaint(configuration, viewStart, viewLoadingType) {
    if (!isInteractionToNextPaintSupported()) {
      return {
        getInteractionToNextPaint: () => void 0,
        setViewEnd: noop,
        stop: noop
      };
    }
    const { getViewInteractionCount, stopViewInteractionCount } = trackViewInteractionCount(viewLoadingType);
    let viewEnd = Infinity;
    const longestInteractions = trackLongestInteractions(getViewInteractionCount);
    let interactionToNextPaint = -1;
    let interactionToNextPaintTargetSelector;
    let interactionToNextPaintStartTime;
    function handleEntries(entries) {
      for (const entry of entries) {
        if (entry.interactionId && // Check the entry start time is inside the view bounds because some view interactions can be reported after the view end (if long duration).
        entry.startTime >= viewStart && entry.startTime <= viewEnd) {
          longestInteractions.process(entry);
        }
      }
      const newInteraction = longestInteractions.estimateP98Interaction();
      if (newInteraction && newInteraction.duration !== interactionToNextPaint) {
        interactionToNextPaint = newInteraction.duration;
        interactionToNextPaintStartTime = elapsed(viewStart, newInteraction.startTime);
        interactionToNextPaintTargetSelector = getInteractionSelector(newInteraction.startTime);
        if (!interactionToNextPaintTargetSelector && newInteraction.target && isElementNode(newInteraction.target)) {
          interactionToNextPaintTargetSelector = getSelectorFromElement(
            newInteraction.target,
            configuration.actionNameAttribute
          );
        }
      }
    }
    const firstInputSubscription = createPerformanceObservable(configuration, {
      type: "first-input" /* FIRST_INPUT */,
      buffered: true
    }).subscribe(handleEntries);
    const eventSubscription = createPerformanceObservable(configuration, {
      type: "event" /* EVENT */,
      // durationThreshold only impact PerformanceEventTiming entries used for INP computation which requires a threshold at 40 (default is 104ms)
      // cf: https://github.com/GoogleChrome/web-vitals/blob/3806160ffbc93c3c4abf210a167b81228172b31c/src/onINP.ts#L202-L210
      durationThreshold: 40,
      buffered: true
    }).subscribe(handleEntries);
    return {
      getInteractionToNextPaint: () => {
        if (interactionToNextPaint >= 0) {
          return {
            value: Math.min(interactionToNextPaint, MAX_INP_VALUE),
            targetSelector: interactionToNextPaintTargetSelector,
            time: interactionToNextPaintStartTime
          };
        } else if (getViewInteractionCount()) {
          return {
            value: 0
          };
        }
      },
      setViewEnd: (viewEndTime) => {
        viewEnd = viewEndTime;
        stopViewInteractionCount();
      },
      stop: () => {
        eventSubscription.unsubscribe();
        firstInputSubscription.unsubscribe();
      }
    };
  }
  function trackLongestInteractions(getViewInteractionCount) {
    const longestInteractions = [];
    function sortAndTrimLongestInteractions() {
      longestInteractions.sort((a, b) => b.duration - a.duration).splice(MAX_INTERACTION_ENTRIES);
    }
    return {
      /**
       * Process the performance entry:
       * - if its duration is long enough, add the performance entry to the list of worst interactions
       * - if an entry with the same interaction id exists and its duration is lower than the new one, then replace it in the list of worst interactions
       */
      process(entry) {
        const interactionIndex = longestInteractions.findIndex(
          (interaction) => entry.interactionId === interaction.interactionId
        );
        const minLongestInteraction = longestInteractions[longestInteractions.length - 1];
        if (interactionIndex !== -1) {
          if (entry.duration > longestInteractions[interactionIndex].duration) {
            longestInteractions[interactionIndex] = entry;
            sortAndTrimLongestInteractions();
          }
        } else if (longestInteractions.length < MAX_INTERACTION_ENTRIES || entry.duration > minLongestInteraction.duration) {
          longestInteractions.push(entry);
          sortAndTrimLongestInteractions();
        }
      },
      /**
       * Compute the p98 longest interaction.
       * For better performance the computation is based on 10 longest interactions and the interaction count of the current view.
       */
      estimateP98Interaction() {
        const interactionIndex = Math.min(longestInteractions.length - 1, Math.floor(getViewInteractionCount() / 50));
        return longestInteractions[interactionIndex];
      }
    };
  }
  function trackViewInteractionCount(viewLoadingType) {
    initInteractionCountPolyfill();
    const previousInteractionCount = viewLoadingType === "initial_load" /* INITIAL_LOAD */ ? 0 : getInteractionCount();
    let state2 = { stopped: false };
    function computeViewInteractionCount() {
      return getInteractionCount() - previousInteractionCount;
    }
    return {
      getViewInteractionCount: () => {
        if (state2.stopped) {
          return state2.interactionCount;
        }
        return computeViewInteractionCount();
      },
      stopViewInteractionCount: () => {
        state2 = { stopped: true, interactionCount: computeViewInteractionCount() };
      }
    };
  }
  function isInteractionToNextPaintSupported() {
    return supportPerformanceTimingEvent("event" /* EVENT */) && window.PerformanceEventTiming && "interactionId" in PerformanceEventTiming.prototype;
  }
  var MAX_INTERACTION_ENTRIES, MAX_INP_VALUE;
  var init_trackInteractionToNextPaint = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackInteractionToNextPaint.ts"() {
      "use strict";
      init_src();
      init_performanceObservable();
      init_rawRumEvent_types();
      init_getSelectorFromElement();
      init_htmlDomUtils();
      init_interactionSelectorCache();
      init_interactionCountPolyfill();
      MAX_INTERACTION_ENTRIES = 10;
      MAX_INP_VALUE = 1 * ONE_MINUTE;
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackLoadingTime.ts
  function trackLoadingTime(lifeCycle, domMutationObservable, windowOpenObservable, configuration, loadType, viewStart, callback) {
    let isWaitingForLoadEvent = loadType === "initial_load" /* INITIAL_LOAD */;
    let isWaitingForActivityLoadingTime = true;
    const loadingTimeCandidates = [];
    const firstHidden = trackFirstHidden(configuration);
    function invokeCallbackIfAllCandidatesAreReceived() {
      if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
        const loadingTime = Math.max(...loadingTimeCandidates);
        if (loadingTime < firstHidden.timeStamp) {
          callback(loadingTime);
        }
      }
    }
    const { stop } = waitPageActivityEnd(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      (event) => {
        if (isWaitingForActivityLoadingTime) {
          isWaitingForActivityLoadingTime = false;
          if (event.hadActivity) {
            loadingTimeCandidates.push(elapsed(viewStart.timeStamp, event.end));
          }
          invokeCallbackIfAllCandidatesAreReceived();
        }
      }
    );
    return {
      stop: () => {
        stop();
        firstHidden.stop();
      },
      setLoadEvent: (loadEvent) => {
        if (isWaitingForLoadEvent) {
          isWaitingForLoadEvent = false;
          loadingTimeCandidates.push(loadEvent);
          invokeCallbackIfAllCandidatesAreReceived();
        }
      }
    };
  }
  var init_trackLoadingTime = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackLoadingTime.ts"() {
      "use strict";
      init_src();
      init_waitPageActivityEnd();
      init_rawRumEvent_types();
      init_trackFirstHidden();
    }
  });

  // ../packages/rum-core/src/browser/scroll.ts
  function getScrollX() {
    let scrollX;
    const visual = window.visualViewport;
    if (visual) {
      scrollX = visual.pageLeft - visual.offsetLeft;
    } else if (window.scrollX !== void 0) {
      scrollX = window.scrollX;
    } else {
      scrollX = window.pageXOffset || 0;
    }
    return Math.round(scrollX);
  }
  function getScrollY() {
    let scrollY;
    const visual = window.visualViewport;
    if (visual) {
      scrollY = visual.pageTop - visual.offsetTop;
    } else if (window.scrollY !== void 0) {
      scrollY = window.scrollY;
    } else {
      scrollY = window.pageYOffset || 0;
    }
    return Math.round(scrollY);
  }
  var init_scroll = __esm({
    "../packages/rum-core/src/browser/scroll.ts"() {
      "use strict";
    }
  });

  // ../packages/rum-core/src/browser/viewportObservable.ts
  function initViewportObservable(configuration) {
    if (!viewportObservable) {
      viewportObservable = createViewportObservable(configuration);
    }
    return viewportObservable;
  }
  function createViewportObservable(configuration) {
    return new Observable((observable) => {
      const { throttled: updateDimension } = throttle(() => {
        observable.notify(getViewportDimension());
      }, 200);
      return addEventListener(configuration, window, "resize" /* RESIZE */, updateDimension, { capture: true, passive: true }).stop;
    });
  }
  function getViewportDimension() {
    const visual = window.visualViewport;
    if (visual) {
      return {
        width: Number(visual.width * visual.scale),
        height: Number(visual.height * visual.scale)
      };
    }
    return {
      width: Number(window.innerWidth || 0),
      height: Number(window.innerHeight || 0)
    };
  }
  var viewportObservable;
  var init_viewportObservable = __esm({
    "../packages/rum-core/src/browser/viewportObservable.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackScrollMetrics.ts
  function trackScrollMetrics(configuration, viewStart, callback, scrollValues = createScrollValuesObservable(configuration)) {
    let maxScrollDepth = 0;
    let maxScrollHeight = 0;
    let maxScrollHeightTime = 0;
    const subscription = scrollValues.subscribe(({ scrollDepth, scrollTop, scrollHeight }) => {
      let shouldUpdate = false;
      if (scrollDepth > maxScrollDepth) {
        maxScrollDepth = scrollDepth;
        shouldUpdate = true;
      }
      if (scrollHeight > maxScrollHeight) {
        maxScrollHeight = scrollHeight;
        const now = relativeNow();
        maxScrollHeightTime = elapsed(viewStart.relative, now);
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        callback({
          maxDepth: Math.min(maxScrollDepth, maxScrollHeight),
          maxDepthScrollTop: scrollTop,
          maxScrollHeight,
          maxScrollHeightTime
        });
      }
    });
    return {
      stop: () => subscription.unsubscribe()
    };
  }
  function computeScrollValues() {
    const scrollTop = getScrollY();
    const { height } = getViewportDimension();
    const scrollHeight = Math.round((document.scrollingElement || document.documentElement).scrollHeight);
    const scrollDepth = Math.round(height + scrollTop);
    return {
      scrollHeight,
      scrollDepth,
      scrollTop
    };
  }
  function createScrollValuesObservable(configuration, throttleDuration = THROTTLE_SCROLL_DURATION) {
    return new Observable((observable) => {
      function notify() {
        observable.notify(computeScrollValues());
      }
      if (window.ResizeObserver) {
        const throttledNotify = throttle(notify, throttleDuration, {
          leading: false,
          trailing: true
        });
        const observerTarget = document.scrollingElement || document.documentElement;
        const resizeObserver = new ResizeObserver(monitor(throttledNotify.throttled));
        if (observerTarget) {
          resizeObserver.observe(observerTarget);
        }
        const eventListener = addEventListener(configuration, window, "scroll" /* SCROLL */, throttledNotify.throttled, {
          passive: true
        });
        return () => {
          throttledNotify.cancel();
          resizeObserver.disconnect();
          eventListener.stop();
        };
      }
    });
  }
  var THROTTLE_SCROLL_DURATION;
  var init_trackScrollMetrics = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackScrollMetrics.ts"() {
      "use strict";
      init_src();
      init_scroll();
      init_viewportObservable();
      THROTTLE_SCROLL_DURATION = ONE_SECOND;
    }
  });

  // ../packages/rum-core/src/domain/view/viewMetrics/trackCommonViewMetrics.ts
  function trackCommonViewMetrics(lifeCycle, domMutationObservable, windowOpenObservable, configuration, scheduleViewUpdate, loadingType, viewStart) {
    const commonViewMetrics = {};
    const { stop: stopLoadingTimeTracking, setLoadEvent } = trackLoadingTime(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      loadingType,
      viewStart,
      (newLoadingTime) => {
        commonViewMetrics.loadingTime = newLoadingTime;
        scheduleViewUpdate();
      }
    );
    const { stop: stopScrollMetricsTracking } = trackScrollMetrics(configuration, viewStart, (newScrollMetrics) => {
      commonViewMetrics.scroll = newScrollMetrics;
    });
    const { stop: stopCLSTracking } = trackCumulativeLayoutShift(
      configuration,
      viewStart.relative,
      (cumulativeLayoutShift) => {
        commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift;
        scheduleViewUpdate();
      }
    );
    const {
      stop: stopINPTracking,
      getInteractionToNextPaint,
      setViewEnd
    } = trackInteractionToNextPaint(configuration, viewStart.relative, loadingType);
    return {
      stop: () => {
        stopLoadingTimeTracking();
        stopCLSTracking();
        stopScrollMetricsTracking();
      },
      stopINPTracking,
      setLoadEvent,
      setViewEnd,
      getCommonViewMetrics: () => {
        commonViewMetrics.interactionToNextPaint = getInteractionToNextPaint();
        return commonViewMetrics;
      }
    };
  }
  var init_trackCommonViewMetrics = __esm({
    "../packages/rum-core/src/domain/view/viewMetrics/trackCommonViewMetrics.ts"() {
      "use strict";
      init_trackCumulativeLayoutShift();
      init_trackInteractionToNextPaint();
      init_trackLoadingTime();
      init_trackScrollMetrics();
    }
  });

  // ../packages/rum-core/src/domain/view/trackViews.ts
  function trackViews(location2, lifeCycle, domMutationObservable, windowOpenObservable, configuration, locationChangeObservable, areViewsTrackedAutomatically, initialViewOptions) {
    const activeViews = /* @__PURE__ */ new Set();
    let currentView = startNewView("initial_load" /* INITIAL_LOAD */, clocksOrigin(), initialViewOptions);
    startViewLifeCycle();
    let locationChangeSubscription;
    if (areViewsTrackedAutomatically) {
      locationChangeSubscription = renewViewOnLocationChange(locationChangeObservable);
    }
    function startNewView(loadingType, startClocks, viewOptions) {
      const newlyCreatedView = newView(
        lifeCycle,
        domMutationObservable,
        windowOpenObservable,
        configuration,
        location2,
        loadingType,
        startClocks,
        viewOptions
      );
      activeViews.add(newlyCreatedView);
      newlyCreatedView.stopObservable.subscribe(() => {
        activeViews.delete(newlyCreatedView);
      });
      return newlyCreatedView;
    }
    function startViewLifeCycle() {
      lifeCycle.subscribe(10 /* SESSION_RENEWED */, () => {
        currentView = startNewView("route_change" /* ROUTE_CHANGE */, void 0, {
          name: currentView.name,
          service: currentView.service,
          version: currentView.version,
          context: currentView.contextManager.getContext()
        });
      });
      lifeCycle.subscribe(9 /* SESSION_EXPIRED */, () => {
        currentView.end({ sessionIsActive: false });
      });
      lifeCycle.subscribe(11 /* PAGE_EXITED */, (pageExitEvent) => {
        if (pageExitEvent.reason === PageExitReason.UNLOADING) {
          currentView.end();
        }
      });
    }
    function renewViewOnLocationChange(locationChangeObservable2) {
      return locationChangeObservable2.subscribe(({ oldLocation, newLocation }) => {
        if (areDifferentLocation(oldLocation, newLocation)) {
          currentView.end();
          currentView = startNewView("route_change" /* ROUTE_CHANGE */);
        }
      });
    }
    return {
      addTiming: (name, time = timeStampNow()) => {
        currentView.addTiming(name, time);
      },
      startView: (options, startClocks) => {
        currentView.end({ endClocks: startClocks });
        currentView = startNewView("route_change" /* ROUTE_CHANGE */, startClocks, options);
      },
      setViewContext: (context) => {
        currentView.contextManager.setContext(context);
      },
      setViewContextProperty: (key, value) => {
        currentView.contextManager.setContextProperty(key, value);
      },
      setViewName: (name) => {
        currentView.setViewName(name);
      },
      getViewContext: () => currentView.contextManager.getContext(),
      stop: () => {
        if (locationChangeSubscription) {
          locationChangeSubscription.unsubscribe();
        }
        currentView.end();
        activeViews.forEach((view) => view.stop());
      }
    };
  }
  function newView(lifeCycle, domMutationObservable, windowOpenObservable, configuration, initialLocation, loadingType, startClocks = clocksNow(), viewOptions) {
    const id = generateUUID();
    const stopObservable = new Observable();
    const customTimings = {};
    let documentVersion = 0;
    let endClocks;
    const location2 = shallowClone(initialLocation);
    const contextManager = createContextManager();
    let sessionIsActive = true;
    let name = viewOptions?.name;
    const service = viewOptions?.service || configuration.service;
    const version = viewOptions?.version || configuration.version;
    const context = viewOptions?.context;
    if (context) {
      contextManager.setContext(context);
    }
    const viewCreatedEvent = {
      id,
      name,
      startClocks,
      service,
      version,
      context
    };
    lifeCycle.notify(1 /* BEFORE_VIEW_CREATED */, viewCreatedEvent);
    lifeCycle.notify(2 /* VIEW_CREATED */, viewCreatedEvent);
    const { throttled, cancel: cancelScheduleViewUpdate } = throttle(triggerViewUpdate, THROTTLE_VIEW_UPDATE_PERIOD, {
      leading: false
    });
    const {
      setLoadEvent,
      setViewEnd,
      stop: stopCommonViewMetricsTracking,
      stopINPTracking,
      getCommonViewMetrics
    } = trackCommonViewMetrics(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      scheduleViewUpdate,
      loadingType,
      startClocks
    );
    const { stop: stopInitialViewMetricsTracking, initialViewMetrics } = loadingType === "initial_load" /* INITIAL_LOAD */ ? trackInitialViewMetrics(configuration, setLoadEvent, scheduleViewUpdate) : { stop: noop, initialViewMetrics: {} };
    const { stop: stopEventCountsTracking, eventCounts } = trackViewEventCounts(lifeCycle, id, scheduleViewUpdate);
    const keepAliveIntervalId = setInterval(triggerViewUpdate, SESSION_KEEP_ALIVE_INTERVAL);
    triggerViewUpdate();
    contextManager.changeObservable.subscribe(scheduleViewUpdate);
    function triggerBeforeViewUpdate() {
      lifeCycle.notify(3 /* BEFORE_VIEW_UPDATED */, {
        id,
        name,
        context: contextManager.getContext(),
        startClocks
      });
    }
    function scheduleViewUpdate() {
      triggerBeforeViewUpdate();
      throttled();
    }
    function triggerViewUpdate() {
      cancelScheduleViewUpdate();
      triggerBeforeViewUpdate();
      documentVersion += 1;
      const currentEnd = endClocks === void 0 ? timeStampNow() : endClocks.timeStamp;
      lifeCycle.notify(4 /* VIEW_UPDATED */, {
        customTimings,
        documentVersion,
        id,
        name,
        service,
        version,
        context: contextManager.getContext(),
        loadingType,
        location: location2,
        startClocks,
        commonViewMetrics: getCommonViewMetrics(),
        initialViewMetrics,
        duration: elapsed(startClocks.timeStamp, currentEnd),
        isActive: endClocks === void 0,
        sessionIsActive,
        eventCounts
      });
    }
    return {
      get name() {
        return name;
      },
      service,
      version,
      contextManager,
      stopObservable,
      end(options = {}) {
        if (endClocks) {
          return;
        }
        endClocks = options.endClocks ?? clocksNow();
        sessionIsActive = options.sessionIsActive ?? true;
        lifeCycle.notify(5 /* VIEW_ENDED */, { endClocks });
        lifeCycle.notify(6 /* AFTER_VIEW_ENDED */, { endClocks });
        clearInterval(keepAliveIntervalId);
        setViewEnd(endClocks.relative);
        stopCommonViewMetricsTracking();
        triggerViewUpdate();
        setTimeout(() => {
          this.stop();
        }, KEEP_TRACKING_AFTER_VIEW_DELAY);
      },
      stop() {
        stopInitialViewMetricsTracking();
        stopEventCountsTracking();
        stopINPTracking();
        stopObservable.notify();
      },
      addTiming(name2, time) {
        if (endClocks) {
          return;
        }
        const relativeTime = looksLikeRelativeTime(time) ? time : elapsed(startClocks.timeStamp, time);
        customTimings[sanitizeTiming(name2)] = relativeTime;
        scheduleViewUpdate();
      },
      setViewName(updatedName) {
        name = updatedName;
        triggerViewUpdate();
      }
    };
  }
  function sanitizeTiming(name) {
    const sanitized = name.replace(/[^a-zA-Z0-9-_.@$]/g, "_");
    if (sanitized !== name) {
      display.warn(`Invalid timing name: ${name}, sanitized to: ${sanitized}`);
    }
    return sanitized;
  }
  function areDifferentLocation(currentLocation, otherLocation) {
    return currentLocation.pathname !== otherLocation.pathname || !isHashAnAnchor(otherLocation.hash) && getPathFromHash(otherLocation.hash) !== getPathFromHash(currentLocation.hash);
  }
  function isHashAnAnchor(hash) {
    const correspondingId = hash.substring(1);
    return correspondingId !== "" && !!document.getElementById(correspondingId);
  }
  function getPathFromHash(hash) {
    const index = hash.indexOf("?");
    return index < 0 ? hash : hash.slice(0, index);
  }
  var THROTTLE_VIEW_UPDATE_PERIOD, SESSION_KEEP_ALIVE_INTERVAL, KEEP_TRACKING_AFTER_VIEW_DELAY;
  var init_trackViews = __esm({
    "../packages/rum-core/src/domain/view/trackViews.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_trackViewEventCounts();
      init_trackInitialViewMetrics();
      init_trackCommonViewMetrics();
      THROTTLE_VIEW_UPDATE_PERIOD = 3e3;
      SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE;
      KEEP_TRACKING_AFTER_VIEW_DELAY = 5 * ONE_MINUTE;
    }
  });

  // ../packages/rum-core/src/domain/view/viewCollection.ts
  function startViewCollection(lifeCycle, hooks, configuration, location2, domMutationObservable, pageOpenObservable, locationChangeObservable, recorderApi2, viewHistory, initialViewOptions) {
    lifeCycle.subscribe(
      4 /* VIEW_UPDATED */,
      (view) => lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, processViewUpdate(view, configuration, recorderApi2))
    );
    hooks.register(0 /* Assemble */, ({ startTime, eventType }) => {
      const { service, version, id, name, context } = viewHistory.findView(startTime);
      return {
        type: eventType,
        service,
        version,
        context,
        view: {
          id,
          name
        }
      };
    });
    return trackViews(
      location2,
      lifeCycle,
      domMutationObservable,
      pageOpenObservable,
      configuration,
      locationChangeObservable,
      !configuration.trackViewsManually,
      initialViewOptions
    );
  }
  function processViewUpdate(view, configuration, recorderApi2) {
    const replayStats = recorderApi2.getReplayStats(view.id);
    const viewEvent = {
      _dd: {
        document_version: view.documentVersion,
        replay_stats: replayStats,
        configuration: {
          start_session_replay_recording_manually: configuration.startSessionReplayRecordingManually
        }
      },
      date: view.startClocks.timeStamp,
      type: "view" /* VIEW */,
      view: {
        action: {
          count: view.eventCounts.actionCount
        },
        frustration: {
          count: view.eventCounts.frustrationCount
        },
        cumulative_layout_shift: view.commonViewMetrics.cumulativeLayoutShift?.value,
        cumulative_layout_shift_time: toServerDuration(view.commonViewMetrics.cumulativeLayoutShift?.time),
        cumulative_layout_shift_target_selector: view.commonViewMetrics.cumulativeLayoutShift?.targetSelector,
        first_byte: toServerDuration(view.initialViewMetrics.navigationTimings?.firstByte),
        dom_complete: toServerDuration(view.initialViewMetrics.navigationTimings?.domComplete),
        dom_content_loaded: toServerDuration(view.initialViewMetrics.navigationTimings?.domContentLoaded),
        dom_interactive: toServerDuration(view.initialViewMetrics.navigationTimings?.domInteractive),
        error: {
          count: view.eventCounts.errorCount
        },
        first_contentful_paint: toServerDuration(view.initialViewMetrics.firstContentfulPaint),
        first_input_delay: toServerDuration(view.initialViewMetrics.firstInput?.delay),
        first_input_time: toServerDuration(view.initialViewMetrics.firstInput?.time),
        first_input_target_selector: view.initialViewMetrics.firstInput?.targetSelector,
        interaction_to_next_paint: toServerDuration(view.commonViewMetrics.interactionToNextPaint?.value),
        interaction_to_next_paint_time: toServerDuration(view.commonViewMetrics.interactionToNextPaint?.time),
        interaction_to_next_paint_target_selector: view.commonViewMetrics.interactionToNextPaint?.targetSelector,
        is_active: view.isActive,
        name: view.name,
        largest_contentful_paint: toServerDuration(view.initialViewMetrics.largestContentfulPaint?.value),
        largest_contentful_paint_target_selector: view.initialViewMetrics.largestContentfulPaint?.targetSelector,
        load_event: toServerDuration(view.initialViewMetrics.navigationTimings?.loadEvent),
        loading_time: discardNegativeDuration(toServerDuration(view.commonViewMetrics.loadingTime)),
        loading_type: view.loadingType,
        long_task: {
          count: view.eventCounts.longTaskCount
        },
        performance: computeViewPerformanceData(view.commonViewMetrics, view.initialViewMetrics),
        resource: {
          count: view.eventCounts.resourceCount
        },
        time_spent: toServerDuration(view.duration)
      },
      display: view.commonViewMetrics.scroll ? {
        scroll: {
          max_depth: view.commonViewMetrics.scroll.maxDepth,
          max_depth_scroll_top: view.commonViewMetrics.scroll.maxDepthScrollTop,
          max_scroll_height: view.commonViewMetrics.scroll.maxScrollHeight,
          max_scroll_height_time: toServerDuration(view.commonViewMetrics.scroll.maxScrollHeightTime)
        }
      } : void 0,
      session: {
        has_replay: replayStats ? true : void 0,
        is_active: view.sessionIsActive ? void 0 : false
      },
      privacy: {
        replay_level: configuration.defaultPrivacyLevel
      }
    };
    if (!isEmptyObject(view.customTimings)) {
      viewEvent.view.custom_timings = mapValues(
        view.customTimings,
        toServerDuration
      );
    }
    return {
      rawRumEvent: viewEvent,
      startTime: view.startClocks.relative,
      duration: view.duration,
      domainContext: {
        location: view.location
      }
    };
  }
  function computeViewPerformanceData({ cumulativeLayoutShift, interactionToNextPaint }, { firstContentfulPaint, firstInput, largestContentfulPaint }) {
    return {
      cls: cumulativeLayoutShift && {
        score: cumulativeLayoutShift.value,
        timestamp: toServerDuration(cumulativeLayoutShift.time),
        target_selector: cumulativeLayoutShift.targetSelector,
        previous_rect: cumulativeLayoutShift.previousRect,
        current_rect: cumulativeLayoutShift.currentRect
      },
      fcp: firstContentfulPaint && { timestamp: toServerDuration(firstContentfulPaint) },
      fid: firstInput && {
        duration: toServerDuration(firstInput.delay),
        timestamp: toServerDuration(firstInput.time),
        target_selector: firstInput.targetSelector
      },
      inp: interactionToNextPaint && {
        duration: toServerDuration(interactionToNextPaint.value),
        timestamp: toServerDuration(interactionToNextPaint.time),
        target_selector: interactionToNextPaint.targetSelector
      },
      lcp: largestContentfulPaint && {
        timestamp: toServerDuration(largestContentfulPaint.value),
        target_selector: largestContentfulPaint.targetSelector,
        resource_url: largestContentfulPaint.resourceUrl
      }
    };
  }
  var init_viewCollection = __esm({
    "../packages/rum-core/src/domain/view/viewCollection.ts"() {
      "use strict";
      init_src();
      init_discardNegativeDuration();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_hooks();
      init_trackViews();
    }
  });

  // ../packages/rum-core/src/transport/startRumBatch.ts
  function startRumBatch(configuration, lifeCycle, telemetryEventObservable, reportError, pageExitObservable, sessionExpireObservable, createEncoder) {
    const replica = configuration.replica;
    const batch = startBatchWithReplica(
      configuration,
      {
        endpoint: configuration.rumEndpointBuilder,
        encoder: createEncoder(2 /* RUM */)
      },
      replica && {
        endpoint: replica.rumEndpointBuilder,
        transformMessage: (message) => combine(message, { application: { id: replica.applicationId } }),
        encoder: createEncoder(3 /* RUM_REPLICA */)
      },
      reportError,
      pageExitObservable,
      sessionExpireObservable
    );
    lifeCycle.subscribe(13 /* RUM_EVENT_COLLECTED */, (serverRumEvent) => {
      if (serverRumEvent.type === "view" /* VIEW */) {
        batch.upsert(serverRumEvent, serverRumEvent.view.id);
      } else {
        batch.add(serverRumEvent);
      }
    });
    telemetryEventObservable.subscribe((event) => batch.add(event, isTelemetryReplicationAllowed(configuration)));
    return batch;
  }
  var init_startRumBatch = __esm({
    "../packages/rum-core/src/transport/startRumBatch.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      init_rawRumEvent_types();
    }
  });

  // ../packages/rum-core/src/transport/startRumEventBridge.ts
  function startRumEventBridge(lifeCycle) {
    const bridge = getEventBridge();
    lifeCycle.subscribe(13 /* RUM_EVENT_COLLECTED */, (serverRumEvent) => {
      bridge.send("rum", serverRumEvent);
    });
  }
  var init_startRumEventBridge = __esm({
    "../packages/rum-core/src/transport/startRumEventBridge.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
    }
  });

  // ../packages/rum-core/src/domain/contexts/urlContexts.ts
  function startUrlContexts(lifeCycle, hooks, locationChangeObservable, location2) {
    const urlContextHistory = createValueHistory({ expireDelay: URL_CONTEXT_TIME_OUT_DELAY });
    let previousViewUrl;
    lifeCycle.subscribe(1 /* BEFORE_VIEW_CREATED */, ({ startClocks }) => {
      const viewUrl = location2.href;
      urlContextHistory.add(
        buildUrlContext({
          url: viewUrl,
          referrer: !previousViewUrl ? document.referrer : previousViewUrl
        }),
        startClocks.relative
      );
      previousViewUrl = viewUrl;
    });
    lifeCycle.subscribe(6 /* AFTER_VIEW_ENDED */, ({ endClocks }) => {
      urlContextHistory.closeActive(endClocks.relative);
    });
    const locationChangeSubscription = locationChangeObservable.subscribe(({ newLocation }) => {
      const current = urlContextHistory.find();
      if (current) {
        const changeTime = relativeNow();
        urlContextHistory.closeActive(changeTime);
        urlContextHistory.add(
          buildUrlContext({
            url: newLocation.href,
            referrer: current.referrer
          }),
          changeTime
        );
      }
    });
    function buildUrlContext({ url, referrer }) {
      return {
        url,
        referrer
      };
    }
    hooks.register(0 /* Assemble */, ({ startTime, eventType }) => {
      const { url, referrer } = urlContextHistory.find(startTime);
      return {
        type: eventType,
        view: {
          url,
          referrer
        }
      };
    });
    return {
      findUrl: (startTime) => urlContextHistory.find(startTime),
      getAllEntries: () => urlContextHistory.getAllEntries(),
      getDeletedEntries: () => urlContextHistory.getDeletedEntries(),
      stop: () => {
        locationChangeSubscription.unsubscribe();
        urlContextHistory.stop();
      }
    };
  }
  var URL_CONTEXT_TIME_OUT_DELAY;
  var init_urlContexts = __esm({
    "../packages/rum-core/src/domain/contexts/urlContexts.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      init_hooks();
      URL_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
    }
  });

  // ../packages/rum-core/src/browser/locationChangeObservable.ts
  function createLocationChangeObservable(configuration, location2) {
    let currentLocation = shallowClone(location2);
    return new Observable((observable) => {
      const { stop: stopHistoryTracking } = trackHistory(configuration, onLocationChange);
      const { stop: stopHashTracking } = trackHash(configuration, onLocationChange);
      function onLocationChange() {
        if (currentLocation.href === location2.href) {
          return;
        }
        const newLocation = shallowClone(location2);
        observable.notify({
          newLocation,
          oldLocation: currentLocation
        });
        currentLocation = newLocation;
      }
      return () => {
        stopHistoryTracking();
        stopHashTracking();
      };
    });
  }
  function trackHistory(configuration, onHistoryChange) {
    const { stop: stopInstrumentingPushState } = instrumentMethod(
      getHistoryInstrumentationTarget("pushState"),
      "pushState",
      ({ onPostCall }) => {
        onPostCall(onHistoryChange);
      }
    );
    const { stop: stopInstrumentingReplaceState } = instrumentMethod(
      getHistoryInstrumentationTarget("replaceState"),
      "replaceState",
      ({ onPostCall }) => {
        onPostCall(onHistoryChange);
      }
    );
    const { stop: removeListener } = addEventListener(configuration, window, "popstate" /* POP_STATE */, onHistoryChange);
    return {
      stop: () => {
        stopInstrumentingPushState();
        stopInstrumentingReplaceState();
        removeListener();
      }
    };
  }
  function trackHash(configuration, onHashChange) {
    return addEventListener(configuration, window, "hashchange" /* HASH_CHANGE */, onHashChange);
  }
  function getHistoryInstrumentationTarget(methodName) {
    return Object.prototype.hasOwnProperty.call(history, methodName) ? history : History.prototype;
  }
  var init_locationChangeObservable = __esm({
    "../packages/rum-core/src/browser/locationChangeObservable.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/domain/contexts/featureFlagContext.ts
  function startFeatureFlagContexts(lifeCycle, hooks, configuration, customerDataTracker) {
    const featureFlagContexts = createValueHistory({
      expireDelay: FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY
    });
    lifeCycle.subscribe(1 /* BEFORE_VIEW_CREATED */, ({ startClocks }) => {
      featureFlagContexts.add({}, startClocks.relative);
      customerDataTracker.resetCustomerData();
    });
    lifeCycle.subscribe(6 /* AFTER_VIEW_ENDED */, ({ endClocks }) => {
      featureFlagContexts.closeActive(endClocks.relative);
    });
    hooks.register(0 /* Assemble */, ({ startTime, eventType }) => {
      const trackFeatureFlagsForEvents = configuration.trackFeatureFlagsForEvents.concat([
        "view" /* VIEW */,
        "error" /* ERROR */
      ]);
      if (!trackFeatureFlagsForEvents.includes(eventType)) {
        return;
      }
      const featureFlagContext = featureFlagContexts.find(startTime);
      if (!featureFlagContext || isEmptyObject(featureFlagContext)) {
        return;
      }
      return {
        type: eventType,
        feature_flags: featureFlagContext
      };
    });
    return {
      addFeatureFlagEvaluation: (key, value) => {
        const currentContext = featureFlagContexts.find();
        if (currentContext) {
          currentContext[key] = value;
          customerDataTracker.updateCustomerData(currentContext);
        }
      },
      stop: () => customerDataTracker.stop()
    };
  }
  var FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY;
  var init_featureFlagContext = __esm({
    "../packages/rum-core/src/domain/contexts/featureFlagContext.ts"() {
      "use strict";
      init_src();
      init_lifeCycle();
      init_hooks();
      init_rawRumEvent_types();
      FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
    }
  });

  // ../packages/rum-core/src/domain/startCustomerDataTelemetry.ts
  function startCustomerDataTelemetry(configuration, telemetry, lifeCycle, customerDataTrackerManager, batchFlushObservable) {
    const customerDataTelemetryEnabled = telemetry.enabled && performDraw(configuration.customerDataTelemetrySampleRate);
    if (!customerDataTelemetryEnabled) {
      return;
    }
    initCurrentPeriodMeasures();
    initCurrentBatchMeasures();
    lifeCycle.subscribe(13 /* RUM_EVENT_COLLECTED */, (event) => {
      batchHasRumEvent = true;
      updateMeasure(
        currentBatchMeasures.globalContextBytes,
        customerDataTrackerManager.getOrCreateTracker(2 /* GlobalContext */).getBytesCount()
      );
      updateMeasure(
        currentBatchMeasures.userContextBytes,
        customerDataTrackerManager.getOrCreateTracker(1 /* User */).getBytesCount()
      );
      updateMeasure(
        currentBatchMeasures.featureFlagBytes,
        ["view" /* VIEW */, "error" /* ERROR */].includes(event.type) ? customerDataTrackerManager.getOrCreateTracker(0 /* FeatureFlag */).getBytesCount() : 0
      );
    });
    batchFlushObservable.subscribe(({ bytesCount, messagesCount }) => {
      if (!batchHasRumEvent) {
        return;
      }
      currentPeriodMeasures.batchCount += 1;
      updateMeasure(currentPeriodMeasures.batchBytesCount, bytesCount);
      updateMeasure(currentPeriodMeasures.batchMessagesCount, messagesCount);
      mergeMeasure(currentPeriodMeasures.globalContextBytes, currentBatchMeasures.globalContextBytes);
      mergeMeasure(currentPeriodMeasures.userContextBytes, currentBatchMeasures.userContextBytes);
      mergeMeasure(currentPeriodMeasures.featureFlagBytes, currentBatchMeasures.featureFlagBytes);
      initCurrentBatchMeasures();
    });
    setInterval(sendCurrentPeriodMeasures, MEASURES_PERIOD_DURATION);
  }
  function sendCurrentPeriodMeasures() {
    if (currentPeriodMeasures.batchCount === 0) {
      return;
    }
    addTelemetryDebug("Customer data measures", currentPeriodMeasures);
    initCurrentPeriodMeasures();
  }
  function createMeasure() {
    return { min: Infinity, max: 0, sum: 0 };
  }
  function updateMeasure(measure, value) {
    measure.sum += value;
    measure.min = Math.min(measure.min, value);
    measure.max = Math.max(measure.max, value);
  }
  function mergeMeasure(target, source) {
    target.sum += source.sum;
    target.min = Math.min(target.min, source.min);
    target.max = Math.max(target.max, source.max);
  }
  function initCurrentPeriodMeasures() {
    currentPeriodMeasures = {
      batchCount: 0,
      batchBytesCount: createMeasure(),
      batchMessagesCount: createMeasure(),
      globalContextBytes: createMeasure(),
      userContextBytes: createMeasure(),
      featureFlagBytes: createMeasure()
    };
  }
  function initCurrentBatchMeasures() {
    batchHasRumEvent = false;
    currentBatchMeasures = {
      globalContextBytes: createMeasure(),
      userContextBytes: createMeasure(),
      featureFlagBytes: createMeasure()
    };
  }
  var MEASURES_PERIOD_DURATION, currentPeriodMeasures, currentBatchMeasures, batchHasRumEvent;
  var init_startCustomerDataTelemetry = __esm({
    "../packages/rum-core/src/domain/startCustomerDataTelemetry.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
      MEASURES_PERIOD_DURATION = 10 * ONE_SECOND;
    }
  });

  // ../packages/rum-core/src/domain/contexts/displayContext.ts
  function startDisplayContext(configuration) {
    let viewport;
    const animationFrameId = requestAnimationFrame(
      monitor(() => {
        viewport = getViewportDimension();
      })
    );
    const unsubscribeViewport = initViewportObservable(configuration).subscribe((viewportDimension) => {
      viewport = viewportDimension;
    }).unsubscribe;
    return {
      get: () => viewport ? { viewport } : void 0,
      stop: () => {
        unsubscribeViewport();
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      }
    };
  }
  var init_displayContext = __esm({
    "../packages/rum-core/src/domain/contexts/displayContext.ts"() {
      "use strict";
      init_src();
      init_viewportObservable();
    }
  });

  // ../packages/rum-core/src/browser/cookieObservable.ts
  function createCookieObservable(configuration, cookieName) {
    const detectCookieChangeStrategy = window.cookieStore ? listenToCookieStoreChange(configuration) : watchCookieFallback;
    return new Observable(
      (observable) => detectCookieChangeStrategy(cookieName, (event) => observable.notify(event))
    );
  }
  function listenToCookieStoreChange(configuration) {
    return (cookieName, callback) => {
      const listener = addEventListener(
        configuration,
        window.cookieStore,
        "change" /* CHANGE */,
        (event) => {
          const changeEvent = event.changed.find((event2) => event2.name === cookieName) || event.deleted.find((event2) => event2.name === cookieName);
          if (changeEvent) {
            callback(changeEvent.value);
          }
        }
      );
      return listener.stop;
    };
  }
  function watchCookieFallback(cookieName, callback) {
    const previousCookieValue = findCommaSeparatedValue(document.cookie, cookieName);
    const watchCookieIntervalId = setInterval(() => {
      const cookieValue = findCommaSeparatedValue(document.cookie, cookieName);
      if (cookieValue !== previousCookieValue) {
        callback(cookieValue);
      }
    }, WATCH_COOKIE_INTERVAL_DELAY);
    return () => {
      clearInterval(watchCookieIntervalId);
    };
  }
  var WATCH_COOKIE_INTERVAL_DELAY;
  var init_cookieObservable = __esm({
    "../packages/rum-core/src/browser/cookieObservable.ts"() {
      "use strict";
      init_src();
      WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND;
    }
  });

  // ../packages/rum-core/src/domain/contexts/ciVisibilityContext.ts
  function startCiVisibilityContext(configuration, hooks, cookieObservable = createCookieObservable(configuration, CI_VISIBILITY_TEST_ID_COOKIE_NAME)) {
    let testExecutionId = getInitCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME) || window.Cypress?.env("traceId");
    const cookieObservableSubscription = cookieObservable.subscribe((value) => {
      testExecutionId = value;
    });
    hooks.register(0 /* Assemble */, ({ eventType }) => {
      if (typeof testExecutionId !== "string") {
        return;
      }
      return {
        type: eventType,
        session: {
          type: "ci_test" /* CI_TEST */
        },
        ci_test: {
          test_execution_id: testExecutionId
        }
      };
    });
    return {
      stop: () => {
        cookieObservableSubscription.unsubscribe();
      }
    };
  }
  var CI_VISIBILITY_TEST_ID_COOKIE_NAME;
  var init_ciVisibilityContext = __esm({
    "../packages/rum-core/src/domain/contexts/ciVisibilityContext.ts"() {
      "use strict";
      init_src();
      init_cookieObservable();
      init_hooks();
      init_rumSessionManager();
      CI_VISIBILITY_TEST_ID_COOKIE_NAME = "datadog-ci-visibility-test-execution-id";
    }
  });

  // ../packages/rum-core/src/domain/longAnimationFrame/longAnimationFrameCollection.ts
  function startLongAnimationFrameCollection(lifeCycle, configuration) {
    const performanceResourceSubscription = createPerformanceObservable(configuration, {
      type: "long-animation-frame" /* LONG_ANIMATION_FRAME */,
      buffered: true
    }).subscribe((entries) => {
      for (const entry of entries) {
        const startClocks = relativeToClocks(entry.startTime);
        const rawRumEvent = {
          date: startClocks.timeStamp,
          long_task: {
            id: generateUUID(),
            entry_type: "long-animation-frame" /* LONG_ANIMATION_FRAME */,
            duration: toServerDuration(entry.duration),
            blocking_duration: toServerDuration(entry.blockingDuration),
            first_ui_event_timestamp: toServerDuration(entry.firstUIEventTimestamp),
            render_start: toServerDuration(entry.renderStart),
            style_and_layout_start: toServerDuration(entry.styleAndLayoutStart),
            start_time: toServerDuration(entry.startTime),
            scripts: entry.scripts.map((script) => ({
              duration: toServerDuration(script.duration),
              pause_duration: toServerDuration(script.pauseDuration),
              forced_style_and_layout_duration: toServerDuration(script.forcedStyleAndLayoutDuration),
              start_time: toServerDuration(script.startTime),
              execution_start: toServerDuration(script.executionStart),
              source_url: script.sourceURL,
              source_function_name: script.sourceFunctionName,
              source_char_position: script.sourceCharPosition,
              invoker: script.invoker,
              invoker_type: script.invokerType,
              window_attribution: script.windowAttribution
            }))
          },
          type: "long_task" /* LONG_TASK */,
          _dd: {
            discarded: false
          }
        };
        lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, {
          rawRumEvent,
          startTime: startClocks.relative,
          duration: entry.duration,
          domainContext: { performanceEntry: entry }
        });
      }
    });
    return { stop: () => performanceResourceSubscription.unsubscribe() };
  }
  var init_longAnimationFrameCollection = __esm({
    "../packages/rum-core/src/domain/longAnimationFrame/longAnimationFrameCollection.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_performanceObservable();
    }
  });

  // ../packages/rum-core/src/domain/longTask/longTaskCollection.ts
  function startLongTaskCollection(lifeCycle, configuration) {
    const performanceLongTaskSubscription = createPerformanceObservable(configuration, {
      type: "longtask" /* LONG_TASK */,
      buffered: true
    }).subscribe((entries) => {
      for (const entry of entries) {
        if (entry.entryType !== "longtask" /* LONG_TASK */) {
          break;
        }
        if (!configuration.trackLongTasks) {
          break;
        }
        const startClocks = relativeToClocks(entry.startTime);
        const rawRumEvent = {
          date: startClocks.timeStamp,
          long_task: {
            id: generateUUID(),
            entry_type: "long-task" /* LONG_TASK */,
            duration: toServerDuration(entry.duration)
          },
          type: "long_task" /* LONG_TASK */,
          _dd: {
            discarded: false
          }
        };
        lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, {
          rawRumEvent,
          startTime: startClocks.relative,
          duration: entry.duration,
          domainContext: { performanceEntry: entry }
        });
      }
    });
    return {
      stop() {
        performanceLongTaskSubscription.unsubscribe();
      }
    };
  }
  var init_longTaskCollection = __esm({
    "../packages/rum-core/src/domain/longTask/longTaskCollection.ts"() {
      "use strict";
      init_src();
      init_rawRumEvent_types();
      init_lifeCycle();
      init_performanceObservable();
    }
  });

  // ../packages/rum-core/src/domain/contexts/syntheticsContext.ts
  function startSyntheticsContext(hooks) {
    hooks.register(0 /* Assemble */, ({ eventType }) => {
      const testId = getSyntheticsTestId();
      const resultId = getSyntheticsResultId();
      if (!testId || !resultId) {
        return;
      }
      return {
        type: eventType,
        session: {
          type: "synthetics" /* SYNTHETICS */
        },
        synthetics: {
          test_id: testId,
          result_id: resultId,
          injected: willSyntheticsInjectRum()
        }
      };
    });
  }
  var init_syntheticsContext = __esm({
    "../packages/rum-core/src/domain/contexts/syntheticsContext.ts"() {
      "use strict";
      init_src();
      init_hooks();
      init_rumSessionManager();
    }
  });

  // ../packages/rum-core/src/boot/startRum.ts
  function startRum(configuration, recorderApi2, customerDataTrackerManager, getCommonContext, initialViewOptions, createEncoder, trackingConsentState, customVitalsState) {
    const cleanupTasks2 = [];
    const lifeCycle = new LifeCycle();
    const hooks = createHooks();
    lifeCycle.subscribe(13 /* RUM_EVENT_COLLECTED */, (event) => sendToExtension("rum", event));
    const telemetry = startRumTelemetry(configuration);
    telemetry.setContextProvider(() => ({
      application: {
        id: configuration.applicationId
      },
      session: {
        id: session.findTrackedSession()?.id
      },
      view: {
        id: viewHistory.findView()?.id
      },
      action: {
        id: actionContexts.findActionId()
      }
    }));
    const reportError = (error) => {
      lifeCycle.notify(14 /* RAW_ERROR_COLLECTED */, { error });
      addTelemetryDebug("Error reported to customer", { "error.message": error.message });
    };
    const pageExitObservable = createPageExitObservable(configuration);
    const pageExitSubscription = pageExitObservable.subscribe((event) => {
      lifeCycle.notify(11 /* PAGE_EXITED */, event);
    });
    cleanupTasks2.push(() => pageExitSubscription.unsubscribe());
    const session = !canUseEventBridge() ? startRumSessionManager(configuration, lifeCycle, trackingConsentState) : startRumSessionManagerStub();
    if (!canUseEventBridge()) {
      const batch = startRumBatch(
        configuration,
        lifeCycle,
        telemetry.observable,
        reportError,
        pageExitObservable,
        session.expireObservable,
        createEncoder
      );
      cleanupTasks2.push(() => batch.stop());
      startCustomerDataTelemetry(configuration, telemetry, lifeCycle, customerDataTrackerManager, batch.flushObservable);
    } else {
      startRumEventBridge(lifeCycle);
    }
    const domMutationObservable = createDOMMutationObservable();
    const locationChangeObservable = createLocationChangeObservable(configuration, location);
    const pageStateHistory = startPageStateHistory(hooks, configuration);
    const viewHistory = startViewHistory(lifeCycle);
    const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable, location);
    const featureFlagContexts = startFeatureFlagContexts(
      lifeCycle,
      hooks,
      configuration,
      customerDataTrackerManager.getOrCreateTracker(0 /* FeatureFlag */)
    );
    cleanupTasks2.push(() => featureFlagContexts.stop());
    const { observable: windowOpenObservable, stop: stopWindowOpen } = createWindowOpenObservable();
    cleanupTasks2.push(stopWindowOpen);
    const {
      actionContexts,
      addAction,
      stop: stopRumEventCollection
    } = startRumEventCollection(
      lifeCycle,
      hooks,
      configuration,
      session,
      pageStateHistory,
      domMutationObservable,
      windowOpenObservable,
      urlContexts,
      viewHistory,
      getCommonContext,
      reportError
    );
    cleanupTasks2.push(stopRumEventCollection);
    drainPreStartTelemetry();
    const {
      addTiming,
      startView,
      setViewName,
      setViewContext,
      setViewContextProperty,
      getViewContext,
      stop: stopViewCollection
    } = startViewCollection(
      lifeCycle,
      hooks,
      configuration,
      location,
      domMutationObservable,
      windowOpenObservable,
      locationChangeObservable,
      recorderApi2,
      viewHistory,
      initialViewOptions
    );
    cleanupTasks2.push(stopViewCollection);
    const { stop: stopResourceCollection } = startResourceCollection(lifeCycle, configuration, pageStateHistory);
    cleanupTasks2.push(stopResourceCollection);
    if (configuration.trackLongTasks) {
      if (PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame" /* LONG_ANIMATION_FRAME */)) {
        const { stop: stopLongAnimationFrameCollection } = startLongAnimationFrameCollection(lifeCycle, configuration);
        cleanupTasks2.push(stopLongAnimationFrameCollection);
      } else {
        startLongTaskCollection(lifeCycle, configuration);
      }
    }
    const { addError } = startErrorCollection(lifeCycle, configuration);
    startRequestCollection(lifeCycle, configuration, session);
    const vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, customVitalsState);
    const internalContext = startInternalContext(
      configuration.applicationId,
      session,
      viewHistory,
      actionContexts,
      urlContexts
    );
    return {
      addAction,
      addError,
      addTiming,
      addFeatureFlagEvaluation: featureFlagContexts.addFeatureFlagEvaluation,
      startView,
      setViewContext,
      setViewContextProperty,
      getViewContext,
      setViewName,
      lifeCycle,
      viewHistory,
      session,
      stopSession: () => session.expire(),
      getInternalContext: internalContext.get,
      startDurationVital: vitalCollection.startDurationVital,
      stopDurationVital: vitalCollection.stopDurationVital,
      addDurationVital: vitalCollection.addDurationVital,
      stop: () => {
        cleanupTasks2.forEach((task) => task());
      }
    };
  }
  function startRumTelemetry(configuration) {
    const telemetry = startTelemetry("browser-rum-sdk" /* RUM */, configuration);
    if (canUseEventBridge()) {
      const bridge = getEventBridge();
      telemetry.observable.subscribe((event) => bridge.send("internal_telemetry", event));
    }
    return telemetry;
  }
  function startRumEventCollection(lifeCycle, hooks, configuration, sessionManager, pageStateHistory, domMutationObservable, windowOpenObservable, urlContexts, viewHistory, getCommonContext, reportError) {
    const actionCollection = startActionCollection(
      lifeCycle,
      hooks,
      domMutationObservable,
      windowOpenObservable,
      configuration
    );
    const displayContext = startDisplayContext(configuration);
    const ciVisibilityContext = startCiVisibilityContext(configuration, hooks);
    startSyntheticsContext(hooks);
    startRumAssembly(
      configuration,
      lifeCycle,
      hooks,
      sessionManager,
      viewHistory,
      urlContexts,
      displayContext,
      getCommonContext,
      reportError
    );
    return {
      pageStateHistory,
      addAction: actionCollection.addAction,
      actionContexts: actionCollection.actionContexts,
      stop: () => {
        actionCollection.stop();
        ciVisibilityContext.stop();
        displayContext.stop();
        viewHistory.stop();
        pageStateHistory.stop();
      }
    };
  }
  var init_startRum = __esm({
    "../packages/rum-core/src/boot/startRum.ts"() {
      "use strict";
      init_src();
      init_domMutationObservable();
      init_windowOpenObservable();
      init_assembly();
      init_internalContext();
      init_lifeCycle();
      init_viewHistory();
      init_requestCollection();
      init_actionCollection();
      init_errorCollection();
      init_resourceCollection();
      init_viewCollection();
      init_rumSessionManager();
      init_startRumBatch();
      init_startRumEventBridge();
      init_urlContexts();
      init_locationChangeObservable();
      init_featureFlagContext();
      init_startCustomerDataTelemetry();
      init_pageStateHistory();
      init_displayContext();
      init_vitalCollection();
      init_ciVisibilityContext();
      init_longAnimationFrameCollection();
      init_performanceObservable();
      init_longTaskCollection();
      init_hooks();
      init_syntheticsContext();
    }
  });

  // ../packages/rum-core/src/domain/getSessionReplayUrl.ts
  function getSessionReplayUrl(configuration, {
    session,
    viewContext,
    errorType
  }) {
    const sessionId = session ? session.id : "no-session-id";
    const parameters = [];
    if (errorType !== void 0) {
      parameters.push(`error-type=${errorType}`);
    }
    if (viewContext) {
      parameters.push(`seed=${viewContext.id}`);
      parameters.push(`from=${viewContext.startClocks.timeStamp}`);
    }
    const origin = getDatadogSiteUrl(configuration);
    const path = `/rum/replay/sessions/${sessionId}`;
    return `${origin}${path}?${parameters.join("&")}`;
  }
  function getDatadogSiteUrl(rumConfiguration) {
    const site = rumConfiguration.site;
    const subdomain = rumConfiguration.subdomain || getSiteDefaultSubdomain(rumConfiguration);
    return `https://${subdomain ? `${subdomain}.` : ""}${site}`;
  }
  function getSiteDefaultSubdomain(configuration) {
    switch (configuration.site) {
      case INTAKE_SITE_US1:
      case INTAKE_SITE_EU1:
        return "app";
      case INTAKE_SITE_STAGING:
        return "dd";
      default:
        return void 0;
    }
  }
  var init_getSessionReplayUrl = __esm({
    "../packages/rum-core/src/domain/getSessionReplayUrl.ts"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum-core/src/index.ts
  var init_src2 = __esm({
    "../packages/rum-core/src/index.ts"() {
      "use strict";
      init_rumPublicApi();
      init_rawRumEvent_types();
      init_startRum();
      init_lifeCycle();
      init_viewHistory();
      init_domMutationObservable();
      init_viewportObservable();
      init_scroll();
      init_getActionNameFromElement();
      init_getSelectorFromElement();
      init_htmlDomUtils();
      init_getSessionReplayUrl();
      init_resourceUtils2();
      init_privacy();
      init_rumSessionManager();
    }
  });

  // ../packages/rum/esm/domain/replayStats.js
  function getSegmentsCount(viewId) {
    return getOrCreateReplayStats(viewId).segments_count;
  }
  function addSegment(viewId) {
    getOrCreateReplayStats(viewId).segments_count += 1;
  }
  function addRecord(viewId) {
    getOrCreateReplayStats(viewId).records_count += 1;
  }
  function addWroteData(viewId, additionalBytesCount) {
    getOrCreateReplayStats(viewId).segments_total_raw_size += additionalBytesCount;
  }
  function getReplayStats(viewId) {
    return statsPerView === null || statsPerView === void 0 ? void 0 : statsPerView.get(viewId);
  }
  function getOrCreateReplayStats(viewId) {
    if (!statsPerView) {
      statsPerView = /* @__PURE__ */ new Map();
    }
    let replayStats;
    if (statsPerView.has(viewId)) {
      replayStats = statsPerView.get(viewId);
    } else {
      replayStats = {
        records_count: 0,
        segments_count: 0,
        segments_total_raw_size: 0
      };
      statsPerView.set(viewId, replayStats);
      if (statsPerView.size > MAX_STATS_HISTORY) {
        deleteOldestStats();
      }
    }
    return replayStats;
  }
  function deleteOldestStats() {
    if (!statsPerView) {
      return;
    }
    const toDelete = statsPerView.keys().next().value;
    if (toDelete) {
      statsPerView.delete(toDelete);
    }
  }
  var MAX_STATS_HISTORY, statsPerView;
  var init_replayStats = __esm({
    "../packages/rum/esm/domain/replayStats.js"() {
      "use strict";
      MAX_STATS_HISTORY = 1e3;
    }
  });

  // ../packages/rum/esm/domain/record/serialization/serializationUtils.js
  function hasSerializedNode(node) {
    return serializedNodeIds.has(node);
  }
  function nodeAndAncestorsHaveSerializedNode(node) {
    let current = node;
    while (current) {
      if (!hasSerializedNode(current) && !isNodeShadowRoot(current)) {
        return false;
      }
      current = getParentNode(current);
    }
    return true;
  }
  function getSerializedNodeId(node) {
    return serializedNodeIds.get(node);
  }
  function setSerializedNodeId(node, serializeNodeId) {
    serializedNodeIds.set(node, serializeNodeId);
  }
  function getElementInputValue(element, nodePrivacyLevel) {
    const tagName = element.tagName;
    const value = element.value;
    if (shouldMaskNode(element, nodePrivacyLevel)) {
      const type = element.type;
      if (tagName === "INPUT" && (type === "button" || type === "submit" || type === "reset")) {
        return value;
      } else if (!value || tagName === "OPTION") {
        return;
      }
      return CENSORED_STRING_MARK;
    }
    if (tagName === "OPTION" || tagName === "SELECT") {
      return element.value;
    }
    if (tagName !== "INPUT" && tagName !== "TEXTAREA") {
      return;
    }
    return value;
  }
  function switchToAbsoluteUrl(cssText, cssHref) {
    return cssText.replace(URL_IN_CSS_REF, (matchingSubstring, singleQuote, urlWrappedInSingleQuotes, doubleQuote, urlWrappedInDoubleQuotes, urlNotWrappedInQuotes) => {
      const url = urlWrappedInSingleQuotes || urlWrappedInDoubleQuotes || urlNotWrappedInQuotes;
      if (!cssHref || !url || ABSOLUTE_URL.test(url) || DATA_URI.test(url)) {
        return matchingSubstring;
      }
      const quote = singleQuote || doubleQuote || "";
      return `url(${quote}${makeUrlAbsolute(url, cssHref)}${quote})`;
    });
  }
  function makeUrlAbsolute(url, baseUrl) {
    try {
      return buildUrl(url, baseUrl).href;
    } catch (_a) {
      return url;
    }
  }
  function getValidTagName(tagName) {
    const processedTagName = tagName.toLowerCase().trim();
    if (TAG_NAME_REGEX.test(processedTagName)) {
      return "div";
    }
    return processedTagName;
  }
  function censoredImageForSize(width, height) {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' style='background-color:silver'%3E%3C/svg%3E`;
  }
  var serializedNodeIds, URL_IN_CSS_REF, ABSOLUTE_URL, DATA_URI, TAG_NAME_REGEX;
  var init_serializationUtils = __esm({
    "../packages/rum/esm/domain/record/serialization/serializationUtils.js"() {
      "use strict";
      init_src();
      init_src2();
      serializedNodeIds = /* @__PURE__ */ new WeakMap();
      URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm;
      ABSOLUTE_URL = /^[A-Za-z]+:|^\/\//;
      DATA_URI = /^data:.*,/i;
      TAG_NAME_REGEX = /[^a-z1-6-_]/;
    }
  });

  // ../packages/rum/esm/types/sessionReplayConstants.js
  var RecordType, NodeType, IncrementalSource, MouseInteractionType, MediaInteractionType;
  var init_sessionReplayConstants = __esm({
    "../packages/rum/esm/types/sessionReplayConstants.js"() {
      "use strict";
      RecordType = {
        FullSnapshot: 2,
        IncrementalSnapshot: 3,
        Meta: 4,
        Focus: 6,
        ViewEnd: 7,
        VisualViewport: 8,
        FrustrationRecord: 9
      };
      NodeType = {
        Document: 0,
        DocumentType: 1,
        Element: 2,
        Text: 3,
        CDATA: 4,
        DocumentFragment: 11
      };
      IncrementalSource = {
        Mutation: 0,
        MouseMove: 1,
        MouseInteraction: 2,
        Scroll: 3,
        ViewportResize: 4,
        Input: 5,
        TouchMove: 6,
        MediaInteraction: 7,
        StyleSheetRule: 8
        // CanvasMutation : 9,
        // Font : 10,
      };
      MouseInteractionType = {
        MouseUp: 0,
        MouseDown: 1,
        Click: 2,
        ContextMenu: 3,
        DblClick: 4,
        Focus: 5,
        Blur: 6,
        TouchStart: 7,
        TouchEnd: 9
      };
      MediaInteractionType = {
        Play: 0,
        Pause: 1
      };
    }
  });

  // ../packages/rum/esm/types/index.js
  var init_types = __esm({
    "../packages/rum/esm/types/index.js"() {
      "use strict";
      init_sessionReplayConstants();
    }
  });

  // ../packages/rum/esm/domain/record/serialization/serializeStyleSheets.js
  function serializeStyleSheets(cssStyleSheets) {
    if (cssStyleSheets === void 0 || cssStyleSheets.length === 0) {
      return void 0;
    }
    return cssStyleSheets.map((cssStyleSheet) => {
      const rules = cssStyleSheet.cssRules || cssStyleSheet.rules;
      const cssRules = Array.from(rules, (cssRule) => cssRule.cssText);
      const styleSheet = {
        cssRules,
        disabled: cssStyleSheet.disabled || void 0,
        media: cssStyleSheet.media.length > 0 ? Array.from(cssStyleSheet.media) : void 0
      };
      return styleSheet;
    });
  }
  var init_serializeStyleSheets = __esm({
    "../packages/rum/esm/domain/record/serialization/serializeStyleSheets.js"() {
      "use strict";
    }
  });

  // ../packages/rum/esm/domain/record/serialization/serializeAttribute.js
  function serializeAttribute(element, nodePrivacyLevel, attributeName, configuration) {
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      return null;
    }
    const attributeValue = element.getAttribute(attributeName);
    if (nodePrivacyLevel === NodePrivacyLevel.MASK && attributeName !== PRIVACY_ATTR_NAME && !STABLE_ATTRIBUTES.includes(attributeName) && attributeName !== configuration.actionNameAttribute) {
      const tagName = element.tagName;
      switch (attributeName) {
        // Mask Attribute text content
        case "title":
        case "alt":
        case "placeholder":
          return CENSORED_STRING_MARK;
      }
      if (tagName === "IMG" && (attributeName === "src" || attributeName === "srcset")) {
        const image = element;
        if (image.naturalWidth > 0) {
          return censoredImageForSize(image.naturalWidth, image.naturalHeight);
        }
        const { width, height } = element.getBoundingClientRect();
        if (width > 0 || height > 0) {
          return censoredImageForSize(width, height);
        }
        return CENSORED_IMG_MARK;
      }
      if (tagName === "SOURCE" && (attributeName === "src" || attributeName === "srcset")) {
        return CENSORED_IMG_MARK;
      }
      if (tagName === "A" && attributeName === "href") {
        return CENSORED_STRING_MARK;
      }
      if (attributeValue && attributeName.startsWith("data-")) {
        return CENSORED_STRING_MARK;
      }
      if (tagName === "IFRAME" && attributeName === "srcdoc") {
        return CENSORED_STRING_MARK;
      }
    }
    if (!attributeValue || typeof attributeValue !== "string") {
      return attributeValue;
    }
    if (isLongDataUrl(attributeValue)) {
      return sanitizeDataUrl(attributeValue);
    }
    return attributeValue;
  }
  var init_serializeAttribute = __esm({
    "../packages/rum/esm/domain/record/serialization/serializeAttribute.js"() {
      "use strict";
      init_src2();
      init_serializationUtils();
    }
  });

  // ../packages/rum/esm/domain/record/serialization/serializeAttributes.js
  function serializeAttributes(element, nodePrivacyLevel, options) {
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      return {};
    }
    const safeAttrs = {};
    const tagName = getValidTagName(element.tagName);
    const doc = element.ownerDocument;
    for (let i = 0; i < element.attributes.length; i += 1) {
      const attribute = element.attributes.item(i);
      const attributeName = attribute.name;
      const attributeValue = serializeAttribute(element, nodePrivacyLevel, attributeName, options.configuration);
      if (attributeValue !== null) {
        safeAttrs[attributeName] = attributeValue;
      }
    }
    if (element.value && (tagName === "textarea" || tagName === "select" || tagName === "option" || tagName === "input")) {
      const formValue = getElementInputValue(element, nodePrivacyLevel);
      if (formValue !== void 0) {
        safeAttrs.value = formValue;
      }
    }
    if (tagName === "option" && nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
      const optionElement = element;
      if (optionElement.selected) {
        safeAttrs.selected = optionElement.selected;
      }
    }
    if (tagName === "link") {
      const stylesheet = Array.from(doc.styleSheets).find((s) => s.href === element.href);
      const cssText = getCssRulesString(stylesheet);
      if (cssText && stylesheet) {
        safeAttrs._cssText = cssText;
      }
    }
    if (tagName === "style" && element.sheet) {
      const cssText = getCssRulesString(element.sheet);
      if (cssText) {
        safeAttrs._cssText = cssText;
      }
    }
    const inputElement = element;
    if (tagName === "input" && (inputElement.type === "radio" || inputElement.type === "checkbox")) {
      if (nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
        safeAttrs.checked = !!inputElement.checked;
      } else if (shouldMaskNode(inputElement, nodePrivacyLevel)) {
        delete safeAttrs.checked;
      }
    }
    if (tagName === "audio" || tagName === "video") {
      const mediaElement = element;
      safeAttrs.rr_mediaState = mediaElement.paused ? "paused" : "played";
    }
    let scrollTop;
    let scrollLeft;
    const serializationContext = options.serializationContext;
    switch (serializationContext.status) {
      case 0:
        scrollTop = Math.round(element.scrollTop);
        scrollLeft = Math.round(element.scrollLeft);
        if (scrollTop || scrollLeft) {
          serializationContext.elementsScrollPositions.set(element, { scrollTop, scrollLeft });
        }
        break;
      case 1:
        if (serializationContext.elementsScrollPositions.has(element)) {
          ;
          ({ scrollTop, scrollLeft } = serializationContext.elementsScrollPositions.get(element));
        }
        break;
    }
    if (scrollLeft) {
      safeAttrs.rr_scrollLeft = scrollLeft;
    }
    if (scrollTop) {
      safeAttrs.rr_scrollTop = scrollTop;
    }
    return safeAttrs;
  }
  function getCssRulesString(cssStyleSheet) {
    if (!cssStyleSheet) {
      return null;
    }
    let rules;
    try {
      rules = cssStyleSheet.rules || cssStyleSheet.cssRules;
    } catch (_a) {
    }
    if (!rules) {
      return null;
    }
    const styleSheetCssText = Array.from(rules, isSafari() ? getCssRuleStringForSafari : getCssRuleString).join("");
    return switchToAbsoluteUrl(styleSheetCssText, cssStyleSheet.href);
  }
  function getCssRuleStringForSafari(rule) {
    if (isCSSStyleRule(rule) && rule.selectorText.includes(":")) {
      const escapeColon = /(\[[\w-]+[^\\])(:[^\]]+\])/g;
      return rule.cssText.replace(escapeColon, "$1\\$2");
    }
    return getCssRuleString(rule);
  }
  function getCssRuleString(rule) {
    return isCSSImportRule(rule) && getCssRulesString(rule.styleSheet) || rule.cssText;
  }
  function isCSSImportRule(rule) {
    return "styleSheet" in rule;
  }
  function isCSSStyleRule(rule) {
    return "selectorText" in rule;
  }
  var init_serializeAttributes = __esm({
    "../packages/rum/esm/domain/record/serialization/serializeAttributes.js"() {
      "use strict";
      init_src2();
      init_src();
      init_serializationUtils();
      init_serializeAttribute();
    }
  });

  // ../packages/rum/esm/domain/record/serialization/serializeNode.js
  function serializeNodeWithId(node, options) {
    const serializedNode = serializeNode(node, options);
    if (!serializedNode) {
      return null;
    }
    const id = getSerializedNodeId(node) || generateNextId();
    const serializedNodeWithId = serializedNode;
    serializedNodeWithId.id = id;
    setSerializedNodeId(node, id);
    if (options.serializedNodeIds) {
      options.serializedNodeIds.add(id);
    }
    return serializedNodeWithId;
  }
  function generateNextId() {
    return _nextId++;
  }
  function serializeChildNodes(node, options) {
    const result = [];
    forEachChildNodes(node, (childNode) => {
      const serializedChildNode = serializeNodeWithId(childNode, options);
      if (serializedChildNode) {
        result.push(serializedChildNode);
      }
    });
    return result;
  }
  function serializeNode(node, options) {
    switch (node.nodeType) {
      case node.DOCUMENT_NODE:
        return serializeDocumentNode(node, options);
      case node.DOCUMENT_FRAGMENT_NODE:
        return serializeDocumentFragmentNode(node, options);
      case node.DOCUMENT_TYPE_NODE:
        return serializeDocumentTypeNode(node);
      case node.ELEMENT_NODE:
        return serializeElementNode(node, options);
      case node.TEXT_NODE:
        return serializeTextNode(node, options);
      case node.CDATA_SECTION_NODE:
        return serializeCDataNode();
    }
  }
  function serializeDocumentNode(document2, options) {
    return {
      type: NodeType.Document,
      childNodes: serializeChildNodes(document2, options),
      adoptedStyleSheets: serializeStyleSheets(document2.adoptedStyleSheets)
    };
  }
  function serializeDocumentFragmentNode(element, options) {
    const isShadowRoot = isNodeShadowRoot(element);
    if (isShadowRoot) {
      options.serializationContext.shadowRootsController.addShadowRoot(element);
    }
    return {
      type: NodeType.DocumentFragment,
      childNodes: serializeChildNodes(element, options),
      isShadowRoot,
      adoptedStyleSheets: isShadowRoot ? serializeStyleSheets(element.adoptedStyleSheets) : void 0
    };
  }
  function serializeDocumentTypeNode(documentType) {
    return {
      type: NodeType.DocumentType,
      name: documentType.name,
      publicId: documentType.publicId,
      systemId: documentType.systemId
    };
  }
  function serializeElementNode(element, options) {
    const tagName = getValidTagName(element.tagName);
    const isSVG = isSVGElement(element) || void 0;
    const nodePrivacyLevel = reducePrivacyLevel(getNodeSelfPrivacyLevel(element), options.parentNodePrivacyLevel);
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      const { width, height } = element.getBoundingClientRect();
      return {
        type: NodeType.Element,
        tagName,
        attributes: {
          rr_width: `${width}px`,
          rr_height: `${height}px`,
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_HIDDEN
        },
        childNodes: [],
        isSVG
      };
    }
    if (nodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      return;
    }
    const attributes = serializeAttributes(element, nodePrivacyLevel, options);
    let childNodes = [];
    if (hasChildNodes(element) && // Do not serialize style children as the css rules are already in the _cssText attribute
    tagName !== "style") {
      let childNodesSerializationOptions;
      if (options.parentNodePrivacyLevel === nodePrivacyLevel && options.ignoreWhiteSpace === (tagName === "head")) {
        childNodesSerializationOptions = options;
      } else {
        childNodesSerializationOptions = {
          ...options,
          parentNodePrivacyLevel: nodePrivacyLevel,
          ignoreWhiteSpace: tagName === "head"
        };
      }
      childNodes = serializeChildNodes(element, childNodesSerializationOptions);
    }
    return {
      type: NodeType.Element,
      tagName,
      attributes,
      childNodes,
      isSVG
    };
  }
  function isSVGElement(el) {
    return el.tagName === "svg" || el instanceof SVGElement;
  }
  function serializeTextNode(textNode, options) {
    const textContent = getTextContent(textNode, options.ignoreWhiteSpace || false, options.parentNodePrivacyLevel);
    if (textContent === void 0) {
      return;
    }
    return {
      type: NodeType.Text,
      textContent
    };
  }
  function serializeCDataNode() {
    return {
      type: NodeType.CDATA,
      textContent: ""
    };
  }
  var _nextId;
  var init_serializeNode = __esm({
    "../packages/rum/esm/domain/record/serialization/serializeNode.js"() {
      "use strict";
      init_src2();
      init_types();
      init_serializationUtils();
      init_serializeStyleSheets();
      init_serializeAttributes();
      _nextId = 1;
    }
  });

  // ../packages/rum/esm/domain/record/serialization/serializeDocument.js
  function serializeDocument(document2, configuration, serializationContext) {
    return serializeNodeWithId(document2, {
      serializationContext,
      parentNodePrivacyLevel: configuration.defaultPrivacyLevel,
      configuration
    });
  }
  var init_serializeDocument = __esm({
    "../packages/rum/esm/domain/record/serialization/serializeDocument.js"() {
      "use strict";
      init_serializeNode();
    }
  });

  // ../packages/rum/esm/domain/record/serialization/index.js
  var init_serialization = __esm({
    "../packages/rum/esm/domain/record/serialization/index.js"() {
      "use strict";
      init_serializationUtils();
      init_serializeDocument();
      init_serializeNode();
      init_serializeAttribute();
    }
  });

  // ../packages/rum/esm/domain/record/eventsUtils.js
  function isTouchEvent(event) {
    return Boolean(event.changedTouches);
  }
  function getEventTarget(event) {
    if (event.composed === true && isNodeShadowHost(event.target)) {
      return event.composedPath()[0];
    }
    return event.target;
  }
  var init_eventsUtils = __esm({
    "../packages/rum/esm/domain/record/eventsUtils.js"() {
      "use strict";
      init_src2();
    }
  });

  // ../packages/rum/esm/domain/record/viewports.js
  function isVisualViewportFactoredIn(visualViewport) {
    return Math.abs(visualViewport.pageTop - visualViewport.offsetTop - window.scrollY) > TOLERANCE || Math.abs(visualViewport.pageLeft - visualViewport.offsetLeft - window.scrollX) > TOLERANCE;
  }
  var TOLERANCE, convertMouseEventToLayoutCoordinates, getVisualViewport;
  var init_viewports = __esm({
    "../packages/rum/esm/domain/record/viewports.js"() {
      "use strict";
      TOLERANCE = 25;
      convertMouseEventToLayoutCoordinates = (clientX, clientY) => {
        const visualViewport = window.visualViewport;
        const normalized = {
          layoutViewportX: clientX,
          layoutViewportY: clientY,
          visualViewportX: clientX,
          visualViewportY: clientY
        };
        if (!visualViewport) {
          return normalized;
        } else if (isVisualViewportFactoredIn(visualViewport)) {
          normalized.layoutViewportX = Math.round(clientX + visualViewport.offsetLeft);
          normalized.layoutViewportY = Math.round(clientY + visualViewport.offsetTop);
        } else {
          normalized.visualViewportX = Math.round(clientX - visualViewport.offsetLeft);
          normalized.visualViewportY = Math.round(clientY - visualViewport.offsetTop);
        }
        return normalized;
      };
      getVisualViewport = (visualViewport) => ({
        scale: visualViewport.scale,
        offsetLeft: visualViewport.offsetLeft,
        offsetTop: visualViewport.offsetTop,
        pageLeft: visualViewport.pageLeft,
        pageTop: visualViewport.pageTop,
        height: visualViewport.height,
        width: visualViewport.width
      });
    }
  });

  // ../packages/rum/esm/domain/record/assembly.js
  function assembleIncrementalSnapshot(source, data) {
    return {
      data: {
        source,
        ...data
      },
      type: RecordType.IncrementalSnapshot,
      timestamp: timeStampNow()
    };
  }
  var init_assembly2 = __esm({
    "../packages/rum/esm/domain/record/assembly.js"() {
      "use strict";
      init_src();
      init_types();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackMove.js
  function trackMove(configuration, moveCb) {
    const { throttled: updatePosition, cancel: cancelThrottle } = throttle((event) => {
      const target = getEventTarget(event);
      if (hasSerializedNode(target)) {
        const coordinates = tryToComputeCoordinates(event);
        if (!coordinates) {
          return;
        }
        const position = {
          id: getSerializedNodeId(target),
          timeOffset: 0,
          x: coordinates.x,
          y: coordinates.y
        };
        moveCb(assembleIncrementalSnapshot(isTouchEvent(event) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove, { positions: [position] }));
      }
    }, MOUSE_MOVE_OBSERVER_THRESHOLD, {
      trailing: false
    });
    const { stop: removeListener } = addEventListeners(configuration, document, [
      "mousemove",
      "touchmove"
      /* DOM_EVENT.TOUCH_MOVE */
    ], updatePosition, {
      capture: true,
      passive: true
    });
    return {
      stop: () => {
        removeListener();
        cancelThrottle();
      }
    };
  }
  function tryToComputeCoordinates(event) {
    let { clientX: x, clientY: y } = isTouchEvent(event) ? event.changedTouches[0] : event;
    if (window.visualViewport) {
      const { visualViewportX, visualViewportY } = convertMouseEventToLayoutCoordinates(x, y);
      x = visualViewportX;
      y = visualViewportY;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (event.isTrusted) {
        addTelemetryDebug("mouse/touch event without x/y");
      }
      return void 0;
    }
    return { x, y };
  }
  var MOUSE_MOVE_OBSERVER_THRESHOLD;
  var init_trackMove = __esm({
    "../packages/rum/esm/domain/record/trackers/trackMove.js"() {
      "use strict";
      init_src();
      init_serialization();
      init_types();
      init_eventsUtils();
      init_viewports();
      init_assembly2();
      MOUSE_MOVE_OBSERVER_THRESHOLD = 50;
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackMouseInteraction.js
  function trackMouseInteraction(configuration, mouseInteractionCb, recordIds) {
    const handler = (event) => {
      const target = getEventTarget(event);
      if (getNodePrivacyLevel(target, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target)) {
        return;
      }
      const id = getSerializedNodeId(target);
      const type = eventTypeToMouseInteraction[event.type];
      let interaction;
      if (type !== MouseInteractionType.Blur && type !== MouseInteractionType.Focus) {
        const coordinates = tryToComputeCoordinates(event);
        if (!coordinates) {
          return;
        }
        interaction = { id, type, x: coordinates.x, y: coordinates.y };
      } else {
        interaction = { id, type };
      }
      const record2 = {
        id: recordIds.getIdForEvent(event),
        ...assembleIncrementalSnapshot(IncrementalSource.MouseInteraction, interaction)
      };
      mouseInteractionCb(record2);
    };
    return addEventListeners(configuration, document, Object.keys(eventTypeToMouseInteraction), handler, {
      capture: true,
      passive: true
    });
  }
  var eventTypeToMouseInteraction;
  var init_trackMouseInteraction = __esm({
    "../packages/rum/esm/domain/record/trackers/trackMouseInteraction.js"() {
      "use strict";
      init_src();
      init_src2();
      init_types();
      init_assembly2();
      init_eventsUtils();
      init_serialization();
      init_trackMove();
      eventTypeToMouseInteraction = {
        // Listen for pointerup DOM events instead of mouseup for MouseInteraction/MouseUp records. This
        // allows to reference such records from Frustration records.
        //
        // In the context of supporting Mobile Session Replay, we introduced `PointerInteraction` records
        // used by the Mobile SDKs in place of `MouseInteraction`. In the future, we should replace
        // `MouseInteraction` by `PointerInteraction` in the Browser SDK so we have an uniform way to
        // convey such interaction. This would cleanly solve the issue since we would have
        // `PointerInteraction/Up` records that we could reference from `Frustration` records.
        [
          "pointerup"
          /* DOM_EVENT.POINTER_UP */
        ]: MouseInteractionType.MouseUp,
        [
          "mousedown"
          /* DOM_EVENT.MOUSE_DOWN */
        ]: MouseInteractionType.MouseDown,
        [
          "click"
          /* DOM_EVENT.CLICK */
        ]: MouseInteractionType.Click,
        [
          "contextmenu"
          /* DOM_EVENT.CONTEXT_MENU */
        ]: MouseInteractionType.ContextMenu,
        [
          "dblclick"
          /* DOM_EVENT.DBL_CLICK */
        ]: MouseInteractionType.DblClick,
        [
          "focus"
          /* DOM_EVENT.FOCUS */
        ]: MouseInteractionType.Focus,
        [
          "blur"
          /* DOM_EVENT.BLUR */
        ]: MouseInteractionType.Blur,
        [
          "touchstart"
          /* DOM_EVENT.TOUCH_START */
        ]: MouseInteractionType.TouchStart,
        [
          "touchend"
          /* DOM_EVENT.TOUCH_END */
        ]: MouseInteractionType.TouchEnd
      };
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackScroll.js
  function trackScroll(configuration, scrollCb, elementsScrollPositions, target = document) {
    const { throttled: updatePosition, cancel: cancelThrottle } = throttle((event) => {
      const target2 = getEventTarget(event);
      if (!target2 || getNodePrivacyLevel(target2, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target2)) {
        return;
      }
      const id = getSerializedNodeId(target2);
      const scrollPositions = target2 === document ? {
        scrollTop: getScrollY(),
        scrollLeft: getScrollX()
      } : {
        scrollTop: Math.round(target2.scrollTop),
        scrollLeft: Math.round(target2.scrollLeft)
      };
      elementsScrollPositions.set(target2, scrollPositions);
      scrollCb(assembleIncrementalSnapshot(IncrementalSource.Scroll, {
        id,
        x: scrollPositions.scrollLeft,
        y: scrollPositions.scrollTop
      }));
    }, SCROLL_OBSERVER_THRESHOLD);
    const { stop: removeListener } = addEventListener(configuration, target, "scroll", updatePosition, {
      capture: true,
      passive: true
    });
    return {
      stop: () => {
        removeListener();
        cancelThrottle();
      }
    };
  }
  var SCROLL_OBSERVER_THRESHOLD;
  var init_trackScroll = __esm({
    "../packages/rum/esm/domain/record/trackers/trackScroll.js"() {
      "use strict";
      init_src();
      init_src2();
      init_eventsUtils();
      init_serialization();
      init_types();
      init_assembly2();
      SCROLL_OBSERVER_THRESHOLD = 100;
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackViewportResize.js
  function trackViewportResize(configuration, viewportResizeCb) {
    const viewportResizeSubscription = initViewportObservable(configuration).subscribe((data) => {
      viewportResizeCb(assembleIncrementalSnapshot(IncrementalSource.ViewportResize, data));
    });
    return {
      stop: () => {
        viewportResizeSubscription.unsubscribe();
      }
    };
  }
  function trackVisualViewportResize(configuration, visualViewportResizeCb) {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return { stop: noop };
    }
    const { throttled: updateDimension, cancel: cancelThrottle } = throttle(() => {
      visualViewportResizeCb({
        data: getVisualViewport(visualViewport),
        type: RecordType.VisualViewport,
        timestamp: timeStampNow()
      });
    }, VISUAL_VIEWPORT_OBSERVER_THRESHOLD, {
      trailing: false
    });
    const { stop: removeListener } = addEventListeners(configuration, visualViewport, [
      "resize",
      "scroll"
      /* DOM_EVENT.SCROLL */
    ], updateDimension, {
      capture: true,
      passive: true
    });
    return {
      stop: () => {
        removeListener();
        cancelThrottle();
      }
    };
  }
  var VISUAL_VIEWPORT_OBSERVER_THRESHOLD;
  var init_trackViewportResize = __esm({
    "../packages/rum/esm/domain/record/trackers/trackViewportResize.js"() {
      "use strict";
      init_src();
      init_src2();
      init_types();
      init_viewports();
      init_assembly2();
      VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200;
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackMediaInteraction.js
  function trackMediaInteraction(configuration, mediaInteractionCb) {
    return addEventListeners(configuration, document, [
      "play",
      "pause"
      /* DOM_EVENT.PAUSE */
    ], (event) => {
      const target = getEventTarget(event);
      if (!target || getNodePrivacyLevel(target, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target)) {
        return;
      }
      mediaInteractionCb(assembleIncrementalSnapshot(IncrementalSource.MediaInteraction, {
        id: getSerializedNodeId(target),
        type: event.type === "play" ? MediaInteractionType.Play : MediaInteractionType.Pause
      }));
    }, {
      capture: true,
      passive: true
    });
  }
  var init_trackMediaInteraction = __esm({
    "../packages/rum/esm/domain/record/trackers/trackMediaInteraction.js"() {
      "use strict";
      init_src();
      init_src2();
      init_types();
      init_eventsUtils();
      init_serialization();
      init_assembly2();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackStyleSheet.js
  function trackStyleSheet(styleSheetCb) {
    function checkStyleSheetAndCallback(styleSheet, callback) {
      if (styleSheet && hasSerializedNode(styleSheet.ownerNode)) {
        callback(getSerializedNodeId(styleSheet.ownerNode));
      }
    }
    const instrumentationStoppers = [
      instrumentMethod(CSSStyleSheet.prototype, "insertRule", ({ target: styleSheet, parameters: [rule, index] }) => {
        checkStyleSheetAndCallback(styleSheet, (id) => styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
          id,
          adds: [{ rule, index }]
        })));
      }),
      instrumentMethod(CSSStyleSheet.prototype, "deleteRule", ({ target: styleSheet, parameters: [index] }) => {
        checkStyleSheetAndCallback(styleSheet, (id) => styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
          id,
          removes: [{ index }]
        })));
      })
    ];
    if (typeof CSSGroupingRule !== "undefined") {
      instrumentGroupingCSSRuleClass(CSSGroupingRule);
    } else {
      instrumentGroupingCSSRuleClass(CSSMediaRule);
      instrumentGroupingCSSRuleClass(CSSSupportsRule);
    }
    function instrumentGroupingCSSRuleClass(cls) {
      instrumentationStoppers.push(instrumentMethod(cls.prototype, "insertRule", ({ target: styleSheet, parameters: [rule, index] }) => {
        checkStyleSheetAndCallback(styleSheet.parentStyleSheet, (id) => {
          const path = getPathToNestedCSSRule(styleSheet);
          if (path) {
            path.push(index || 0);
            styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
              id,
              adds: [{ rule, index: path }]
            }));
          }
        });
      }), instrumentMethod(cls.prototype, "deleteRule", ({ target: styleSheet, parameters: [index] }) => {
        checkStyleSheetAndCallback(styleSheet.parentStyleSheet, (id) => {
          const path = getPathToNestedCSSRule(styleSheet);
          if (path) {
            path.push(index);
            styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
              id,
              removes: [{ index: path }]
            }));
          }
        });
      }));
    }
    return {
      stop: () => {
        instrumentationStoppers.forEach((stopper) => stopper.stop());
      }
    };
  }
  function getPathToNestedCSSRule(rule) {
    const path = [];
    let currentRule = rule;
    while (currentRule.parentRule) {
      const rules2 = Array.from(currentRule.parentRule.cssRules);
      const index2 = rules2.indexOf(currentRule);
      path.unshift(index2);
      currentRule = currentRule.parentRule;
    }
    if (!currentRule.parentStyleSheet) {
      return;
    }
    const rules = Array.from(currentRule.parentStyleSheet.cssRules);
    const index = rules.indexOf(currentRule);
    path.unshift(index);
    return path;
  }
  var init_trackStyleSheet = __esm({
    "../packages/rum/esm/domain/record/trackers/trackStyleSheet.js"() {
      "use strict";
      init_src();
      init_types();
      init_serialization();
      init_assembly2();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackFocus.js
  function trackFocus(configuration, focusCb) {
    return addEventListeners(configuration, window, [
      "focus",
      "blur"
      /* DOM_EVENT.BLUR */
    ], () => {
      focusCb({
        data: { has_focus: document.hasFocus() },
        type: RecordType.Focus,
        timestamp: timeStampNow()
      });
    });
  }
  var init_trackFocus = __esm({
    "../packages/rum/esm/domain/record/trackers/trackFocus.js"() {
      "use strict";
      init_src();
      init_types();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackFrustration.js
  function trackFrustration(lifeCycle, frustrationCb, recordIds) {
    const frustrationSubscription = lifeCycle.subscribe(12, (data) => {
      var _a, _b;
      if (data.rawRumEvent.type === "action" && data.rawRumEvent.action.type === "click" && ((_b = (_a = data.rawRumEvent.action.frustration) === null || _a === void 0 ? void 0 : _a.type) === null || _b === void 0 ? void 0 : _b.length) && "events" in data.domainContext && data.domainContext.events && data.domainContext.events.length) {
        frustrationCb({
          timestamp: data.rawRumEvent.date,
          type: RecordType.FrustrationRecord,
          data: {
            frustrationTypes: data.rawRumEvent.action.frustration.type,
            recordIds: data.domainContext.events.map((e) => recordIds.getIdForEvent(e))
          }
        });
      }
    });
    return {
      stop: () => {
        frustrationSubscription.unsubscribe();
      }
    };
  }
  var init_trackFrustration = __esm({
    "../packages/rum/esm/domain/record/trackers/trackFrustration.js"() {
      "use strict";
      init_types();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackViewEnd.js
  function trackViewEnd(lifeCycle, viewEndCb) {
    const viewEndSubscription = lifeCycle.subscribe(5, () => {
      viewEndCb({
        timestamp: timeStampNow(),
        type: RecordType.ViewEnd
      });
    });
    return {
      stop: () => {
        viewEndSubscription.unsubscribe();
      }
    };
  }
  var init_trackViewEnd = __esm({
    "../packages/rum/esm/domain/record/trackers/trackViewEnd.js"() {
      "use strict";
      init_src();
      init_types();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackInput.js
  function trackInput(configuration, inputCb, target = document) {
    const defaultPrivacyLevel = configuration.defaultPrivacyLevel;
    const lastInputStateMap = /* @__PURE__ */ new WeakMap();
    const isShadowRoot = target !== document;
    const { stop: stopEventListeners } = addEventListeners(
      configuration,
      target,
      // The 'input' event bubbles across shadow roots, so we don't have to listen for it on shadow
      // roots since it will be handled by the event listener that we did add to the document. Only
      // the 'change' event is blocked and needs to be handled on shadow roots.
      isShadowRoot ? [
        "change"
        /* DOM_EVENT.CHANGE */
      ] : [
        "input",
        "change"
        /* DOM_EVENT.CHANGE */
      ],
      (event) => {
        const target2 = getEventTarget(event);
        if (target2 instanceof HTMLInputElement || target2 instanceof HTMLTextAreaElement || target2 instanceof HTMLSelectElement) {
          onElementChange(target2);
        }
      },
      {
        capture: true,
        passive: true
      }
    );
    let stopPropertySetterInstrumentation;
    if (!isShadowRoot) {
      const instrumentationStoppers = [
        instrumentSetter(HTMLInputElement.prototype, "value", onElementChange),
        instrumentSetter(HTMLInputElement.prototype, "checked", onElementChange),
        instrumentSetter(HTMLSelectElement.prototype, "value", onElementChange),
        instrumentSetter(HTMLTextAreaElement.prototype, "value", onElementChange),
        instrumentSetter(HTMLSelectElement.prototype, "selectedIndex", onElementChange)
      ];
      stopPropertySetterInstrumentation = () => {
        instrumentationStoppers.forEach((stopper) => stopper.stop());
      };
    } else {
      stopPropertySetterInstrumentation = noop;
    }
    return {
      stop: () => {
        stopPropertySetterInstrumentation();
        stopEventListeners();
      }
    };
    function onElementChange(target2) {
      const nodePrivacyLevel = getNodePrivacyLevel(target2, defaultPrivacyLevel);
      if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
        return;
      }
      const type = target2.type;
      let inputState;
      if (type === "radio" || type === "checkbox") {
        if (shouldMaskNode(target2, nodePrivacyLevel)) {
          return;
        }
        inputState = { isChecked: target2.checked };
      } else {
        const value = getElementInputValue(target2, nodePrivacyLevel);
        if (value === void 0) {
          return;
        }
        inputState = { text: value };
      }
      cbWithDedup(target2, inputState);
      const name = target2.name;
      if (type === "radio" && name && target2.checked) {
        document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`).forEach((el) => {
          if (el !== target2) {
            cbWithDedup(el, { isChecked: false });
          }
        });
      }
    }
    function cbWithDedup(target2, inputState) {
      if (!hasSerializedNode(target2)) {
        return;
      }
      const lastInputState = lastInputStateMap.get(target2);
      if (!lastInputState || lastInputState.text !== inputState.text || lastInputState.isChecked !== inputState.isChecked) {
        lastInputStateMap.set(target2, inputState);
        inputCb(assembleIncrementalSnapshot(IncrementalSource.Input, {
          id: getSerializedNodeId(target2),
          ...inputState
        }));
      }
    }
  }
  var init_trackInput = __esm({
    "../packages/rum/esm/domain/record/trackers/trackInput.js"() {
      "use strict";
      init_src();
      init_src2();
      init_types();
      init_eventsUtils();
      init_serialization();
      init_assembly2();
    }
  });

  // ../packages/rum/esm/domain/record/mutationBatch.js
  function createMutationBatch(processMutationBatch) {
    let cancelScheduledFlush = noop;
    let pendingMutations = [];
    function flush() {
      cancelScheduledFlush();
      processMutationBatch(pendingMutations);
      pendingMutations = [];
    }
    const { throttled: throttledFlush, cancel: cancelThrottle } = throttle(flush, MUTATION_PROCESS_MIN_DELAY, {
      leading: false
    });
    return {
      addMutations: (mutations) => {
        if (pendingMutations.length === 0) {
          cancelScheduledFlush = requestIdleCallback(throttledFlush, { timeout: MUTATION_PROCESS_MAX_DELAY });
        }
        pendingMutations.push(...mutations);
      },
      flush,
      stop: () => {
        cancelScheduledFlush();
        cancelThrottle();
      }
    };
  }
  var MUTATION_PROCESS_MAX_DELAY, MUTATION_PROCESS_MIN_DELAY;
  var init_mutationBatch = __esm({
    "../packages/rum/esm/domain/record/mutationBatch.js"() {
      "use strict";
      init_src();
      MUTATION_PROCESS_MAX_DELAY = 100;
      MUTATION_PROCESS_MIN_DELAY = 16;
    }
  });

  // ../packages/rum/esm/domain/record/trackers/trackMutation.js
  function trackMutation(mutationCallback, configuration, shadowRootsController, target) {
    const MutationObserver = getMutationObserverConstructor();
    if (!MutationObserver) {
      return { stop: noop, flush: noop };
    }
    const mutationBatch = createMutationBatch((mutations) => {
      processMutations(mutations.concat(observer2.takeRecords()), mutationCallback, configuration, shadowRootsController);
    });
    const observer2 = new MutationObserver(monitor(mutationBatch.addMutations));
    observer2.observe(target, {
      attributeOldValue: true,
      attributes: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      subtree: true
    });
    return {
      stop: () => {
        observer2.disconnect();
        mutationBatch.stop();
      },
      flush: () => {
        mutationBatch.flush();
      }
    };
  }
  function processMutations(mutations, mutationCallback, configuration, shadowRootsController) {
    const nodePrivacyLevelCache = /* @__PURE__ */ new Map();
    mutations.filter((mutation) => mutation.type === "childList").forEach((mutation) => {
      mutation.removedNodes.forEach((removedNode) => {
        traverseRemovedShadowDom(removedNode, shadowRootsController.removeShadowRoot);
      });
    });
    const filteredMutations = mutations.filter((mutation) => mutation.target.isConnected && nodeAndAncestorsHaveSerializedNode(mutation.target) && getNodePrivacyLevel(mutation.target, configuration.defaultPrivacyLevel, nodePrivacyLevelCache) !== NodePrivacyLevel.HIDDEN);
    const { adds, removes, hasBeenSerialized } = processChildListMutations(filteredMutations.filter((mutation) => mutation.type === "childList"), configuration, shadowRootsController, nodePrivacyLevelCache);
    const texts = processCharacterDataMutations(filteredMutations.filter((mutation) => mutation.type === "characterData" && !hasBeenSerialized(mutation.target)), configuration, nodePrivacyLevelCache);
    const attributes = processAttributesMutations(filteredMutations.filter((mutation) => mutation.type === "attributes" && !hasBeenSerialized(mutation.target)), configuration, nodePrivacyLevelCache);
    if (!texts.length && !attributes.length && !removes.length && !adds.length) {
      return;
    }
    mutationCallback(assembleIncrementalSnapshot(IncrementalSource.Mutation, { adds, removes, texts, attributes }));
  }
  function processChildListMutations(mutations, configuration, shadowRootsController, nodePrivacyLevelCache) {
    const addedAndMovedNodes = /* @__PURE__ */ new Set();
    const removedNodes = /* @__PURE__ */ new Map();
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        addedAndMovedNodes.add(node);
      });
      mutation.removedNodes.forEach((node) => {
        if (!addedAndMovedNodes.has(node)) {
          removedNodes.set(node, mutation.target);
        }
        addedAndMovedNodes.delete(node);
      });
    }
    const sortedAddedAndMovedNodes = Array.from(addedAndMovedNodes);
    sortAddedAndMovedNodes(sortedAddedAndMovedNodes);
    const serializedNodeIds2 = /* @__PURE__ */ new Set();
    const addedNodeMutations = [];
    for (const node of sortedAddedAndMovedNodes) {
      if (hasBeenSerialized(node)) {
        continue;
      }
      const parentNodePrivacyLevel = getNodePrivacyLevel(node.parentNode, configuration.defaultPrivacyLevel, nodePrivacyLevelCache);
      if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
        continue;
      }
      const serializedNode = serializeNodeWithId(node, {
        serializedNodeIds: serializedNodeIds2,
        parentNodePrivacyLevel,
        serializationContext: { status: 2, shadowRootsController },
        configuration
      });
      if (!serializedNode) {
        continue;
      }
      const parentNode = getParentNode(node);
      addedNodeMutations.push({
        nextId: getNextSibling(node),
        parentId: getSerializedNodeId(parentNode),
        node: serializedNode
      });
    }
    const removedNodeMutations = [];
    removedNodes.forEach((parent, node) => {
      if (hasSerializedNode(node)) {
        removedNodeMutations.push({
          parentId: getSerializedNodeId(parent),
          id: getSerializedNodeId(node)
        });
      }
    });
    return { adds: addedNodeMutations, removes: removedNodeMutations, hasBeenSerialized };
    function hasBeenSerialized(node) {
      return hasSerializedNode(node) && serializedNodeIds2.has(getSerializedNodeId(node));
    }
    function getNextSibling(node) {
      let nextSibling = node.nextSibling;
      while (nextSibling) {
        if (hasSerializedNode(nextSibling)) {
          return getSerializedNodeId(nextSibling);
        }
        nextSibling = nextSibling.nextSibling;
      }
      return null;
    }
  }
  function processCharacterDataMutations(mutations, configuration, nodePrivacyLevelCache) {
    var _a;
    const textMutations = [];
    const handledNodes = /* @__PURE__ */ new Set();
    const filteredMutations = mutations.filter((mutation) => {
      if (handledNodes.has(mutation.target)) {
        return false;
      }
      handledNodes.add(mutation.target);
      return true;
    });
    for (const mutation of filteredMutations) {
      const value = mutation.target.textContent;
      if (value === mutation.oldValue) {
        continue;
      }
      const parentNodePrivacyLevel = getNodePrivacyLevel(getParentNode(mutation.target), configuration.defaultPrivacyLevel, nodePrivacyLevelCache);
      if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
        continue;
      }
      textMutations.push({
        id: getSerializedNodeId(mutation.target),
        // TODO: pass a valid "ignoreWhiteSpace" argument
        value: (_a = getTextContent(mutation.target, false, parentNodePrivacyLevel)) !== null && _a !== void 0 ? _a : null
      });
    }
    return textMutations;
  }
  function processAttributesMutations(mutations, configuration, nodePrivacyLevelCache) {
    const attributeMutations = [];
    const handledElements = /* @__PURE__ */ new Map();
    const filteredMutations = mutations.filter((mutation) => {
      const handledAttributes = handledElements.get(mutation.target);
      if (handledAttributes && handledAttributes.has(mutation.attributeName)) {
        return false;
      }
      if (!handledAttributes) {
        handledElements.set(mutation.target, /* @__PURE__ */ new Set([mutation.attributeName]));
      } else {
        handledAttributes.add(mutation.attributeName);
      }
      return true;
    });
    const emittedMutations = /* @__PURE__ */ new Map();
    for (const mutation of filteredMutations) {
      const uncensoredValue = mutation.target.getAttribute(mutation.attributeName);
      if (uncensoredValue === mutation.oldValue) {
        continue;
      }
      const privacyLevel = getNodePrivacyLevel(mutation.target, configuration.defaultPrivacyLevel, nodePrivacyLevelCache);
      const attributeValue = serializeAttribute(mutation.target, privacyLevel, mutation.attributeName, configuration);
      let transformedValue;
      if (mutation.attributeName === "value") {
        const inputValue = getElementInputValue(mutation.target, privacyLevel);
        if (inputValue === void 0) {
          continue;
        }
        transformedValue = inputValue;
      } else if (typeof attributeValue === "string") {
        transformedValue = attributeValue;
      } else {
        transformedValue = null;
      }
      let emittedMutation = emittedMutations.get(mutation.target);
      if (!emittedMutation) {
        emittedMutation = {
          id: getSerializedNodeId(mutation.target),
          attributes: {}
        };
        attributeMutations.push(emittedMutation);
        emittedMutations.set(mutation.target, emittedMutation);
      }
      emittedMutation.attributes[mutation.attributeName] = transformedValue;
    }
    return attributeMutations;
  }
  function sortAddedAndMovedNodes(nodes) {
    nodes.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
        return -1;
      } else if (position & Node.DOCUMENT_POSITION_CONTAINS) {
        return 1;
      } else if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return 1;
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return -1;
      }
      return 0;
    });
  }
  function traverseRemovedShadowDom(removedNode, shadowDomRemovedCallback) {
    if (isNodeShadowHost(removedNode)) {
      shadowDomRemovedCallback(removedNode.shadowRoot);
    }
    forEachChildNodes(removedNode, (childNode) => traverseRemovedShadowDom(childNode, shadowDomRemovedCallback));
  }
  var init_trackMutation = __esm({
    "../packages/rum/esm/domain/record/trackers/trackMutation.js"() {
      "use strict";
      init_src();
      init_src2();
      init_types();
      init_serialization();
      init_mutationBatch();
      init_assembly2();
    }
  });

  // ../packages/rum/esm/domain/record/trackers/index.js
  var init_trackers = __esm({
    "../packages/rum/esm/domain/record/trackers/index.js"() {
      "use strict";
      init_trackMove();
      init_trackMouseInteraction();
      init_trackScroll();
      init_trackViewportResize();
      init_trackMediaInteraction();
      init_trackStyleSheet();
      init_trackFocus();
      init_trackFrustration();
      init_trackViewEnd();
      init_trackInput();
      init_trackMutation();
    }
  });

  // ../packages/rum/esm/domain/record/elementsScrollPositions.js
  function createElementsScrollPositions() {
    const scrollPositionsByElement = /* @__PURE__ */ new WeakMap();
    return {
      set(element, scrollPositions) {
        if (element === document && !document.scrollingElement) {
          return;
        }
        scrollPositionsByElement.set(element === document ? document.scrollingElement : element, scrollPositions);
      },
      get(element) {
        return scrollPositionsByElement.get(element);
      },
      has(element) {
        return scrollPositionsByElement.has(element);
      }
    };
  }
  var init_elementsScrollPositions = __esm({
    "../packages/rum/esm/domain/record/elementsScrollPositions.js"() {
      "use strict";
    }
  });

  // ../packages/rum/esm/domain/record/shadowRootsController.js
  var initShadowRootsController;
  var init_shadowRootsController = __esm({
    "../packages/rum/esm/domain/record/shadowRootsController.js"() {
      "use strict";
      init_trackers();
      initShadowRootsController = (configuration, callback, elementsScrollPositions) => {
        const controllerByShadowRoot = /* @__PURE__ */ new Map();
        const shadowRootsController = {
          addShadowRoot: (shadowRoot) => {
            if (controllerByShadowRoot.has(shadowRoot)) {
              return;
            }
            const mutationTracker = trackMutation(callback, configuration, shadowRootsController, shadowRoot);
            const inputTracker = trackInput(configuration, callback, shadowRoot);
            const scrollTracker = trackScroll(configuration, callback, elementsScrollPositions, shadowRoot);
            controllerByShadowRoot.set(shadowRoot, {
              flush: () => mutationTracker.flush(),
              stop: () => {
                mutationTracker.stop();
                inputTracker.stop();
                scrollTracker.stop();
              }
            });
          },
          removeShadowRoot: (shadowRoot) => {
            const entry = controllerByShadowRoot.get(shadowRoot);
            if (!entry) {
              return;
            }
            entry.stop();
            controllerByShadowRoot.delete(shadowRoot);
          },
          stop: () => {
            controllerByShadowRoot.forEach(({ stop }) => stop());
          },
          flush: () => {
            controllerByShadowRoot.forEach(({ flush }) => flush());
          }
        };
        return shadowRootsController;
      };
    }
  });

  // ../packages/rum/esm/domain/record/startFullSnapshots.js
  function startFullSnapshots(elementsScrollPositions, shadowRootsController, lifeCycle, configuration, flushMutations, fullSnapshotCallback) {
    const takeFullSnapshot = (timestamp = timeStampNow(), serializationContext = {
      status: 0,
      elementsScrollPositions,
      shadowRootsController
    }) => {
      const { width, height } = getViewportDimension();
      const records = [
        {
          data: {
            height,
            href: window.location.href,
            width
          },
          type: RecordType.Meta,
          timestamp
        },
        {
          data: {
            has_focus: document.hasFocus()
          },
          type: RecordType.Focus,
          timestamp
        },
        {
          data: {
            node: serializeDocument(document, configuration, serializationContext),
            initialOffset: {
              left: getScrollX(),
              top: getScrollY()
            }
          },
          type: RecordType.FullSnapshot,
          timestamp
        }
      ];
      if (window.visualViewport) {
        records.push({
          data: getVisualViewport(window.visualViewport),
          type: RecordType.VisualViewport,
          timestamp
        });
      }
      return records;
    };
    fullSnapshotCallback(takeFullSnapshot());
    const { unsubscribe } = lifeCycle.subscribe(2, (view) => {
      flushMutations();
      fullSnapshotCallback(takeFullSnapshot(view.startClocks.timeStamp, {
        shadowRootsController,
        status: 1,
        elementsScrollPositions
      }));
    });
    return {
      stop: unsubscribe
    };
  }
  var init_startFullSnapshots = __esm({
    "../packages/rum/esm/domain/record/startFullSnapshots.js"() {
      "use strict";
      init_src2();
      init_src();
      init_types();
      init_serialization();
      init_viewports();
    }
  });

  // ../packages/rum/esm/domain/record/recordIds.js
  function initRecordIds() {
    const recordIds = /* @__PURE__ */ new WeakMap();
    let nextId = 1;
    return {
      getIdForEvent(event) {
        if (!recordIds.has(event)) {
          recordIds.set(event, nextId++);
        }
        return recordIds.get(event);
      }
    };
  }
  var init_recordIds = __esm({
    "../packages/rum/esm/domain/record/recordIds.js"() {
      "use strict";
    }
  });

  // ../packages/rum/esm/domain/record/record.js
  function record(options) {
    const { emit, configuration, lifeCycle } = options;
    if (!emit) {
      throw new Error("emit function is required");
    }
    const emitAndComputeStats = (record2) => {
      emit(record2);
      sendToExtension("record", { record: record2 });
      const view = options.viewHistory.findView();
      addRecord(view.id);
    };
    const elementsScrollPositions = createElementsScrollPositions();
    const shadowRootsController = initShadowRootsController(configuration, emitAndComputeStats, elementsScrollPositions);
    const { stop: stopFullSnapshots } = startFullSnapshots(elementsScrollPositions, shadowRootsController, lifeCycle, configuration, flushMutations, (records) => records.forEach((record2) => emitAndComputeStats(record2)));
    function flushMutations() {
      shadowRootsController.flush();
      mutationTracker.flush();
    }
    const recordIds = initRecordIds();
    const mutationTracker = trackMutation(emitAndComputeStats, configuration, shadowRootsController, document);
    const trackers = [
      mutationTracker,
      trackMove(configuration, emitAndComputeStats),
      trackMouseInteraction(configuration, emitAndComputeStats, recordIds),
      trackScroll(configuration, emitAndComputeStats, elementsScrollPositions, document),
      trackViewportResize(configuration, emitAndComputeStats),
      trackInput(configuration, emitAndComputeStats),
      trackMediaInteraction(configuration, emitAndComputeStats),
      trackStyleSheet(emitAndComputeStats),
      trackFocus(configuration, emitAndComputeStats),
      trackVisualViewportResize(configuration, emitAndComputeStats),
      trackFrustration(lifeCycle, emitAndComputeStats, recordIds),
      trackViewEnd(lifeCycle, (viewEndRecord) => {
        flushMutations();
        emitAndComputeStats(viewEndRecord);
      })
    ];
    return {
      stop: () => {
        shadowRootsController.stop();
        trackers.forEach((tracker) => tracker.stop());
        stopFullSnapshots();
      },
      flushMutations,
      shadowRootsController
    };
  }
  var init_record = __esm({
    "../packages/rum/esm/domain/record/record.js"() {
      "use strict";
      init_src();
      init_replayStats();
      init_trackers();
      init_elementsScrollPositions();
      init_shadowRootsController();
      init_startFullSnapshots();
      init_recordIds();
    }
  });

  // ../packages/rum/esm/domain/record/index.js
  var init_record2 = __esm({
    "../packages/rum/esm/domain/record/index.js"() {
      "use strict";
      init_record();
      init_serialization();
      init_elementsScrollPositions();
    }
  });

  // ../packages/rum/esm/domain/segmentCollection/buildReplayPayload.js
  function buildReplayPayload(data, metadata, rawSegmentBytesCount) {
    const formData = new FormData();
    formData.append("segment", new Blob([data], {
      type: "application/octet-stream"
    }), `${metadata.session.id}-${metadata.start}`);
    const metadataAndSegmentSizes = {
      raw_segment_size: rawSegmentBytesCount,
      compressed_segment_size: data.byteLength,
      ...metadata
    };
    const serializedMetadataAndSegmentSizes = JSON.stringify(metadataAndSegmentSizes);
    formData.append("event", new Blob([serializedMetadataAndSegmentSizes], { type: "application/json" }));
    return { data: formData, bytesCount: data.byteLength };
  }
  var init_buildReplayPayload = __esm({
    "../packages/rum/esm/domain/segmentCollection/buildReplayPayload.js"() {
      "use strict";
    }
  });

  // ../packages/rum/esm/domain/segmentCollection/segment.js
  function createSegment({ context, creationReason, encoder }) {
    let encodedBytesCount = 0;
    const viewId = context.view.id;
    const metadata = {
      start: Infinity,
      end: -Infinity,
      creation_reason: creationReason,
      records_count: 0,
      has_full_snapshot: false,
      index_in_view: getSegmentsCount(viewId),
      source: "browser",
      ...context
    };
    addSegment(viewId);
    function addRecord2(record2, callback) {
      metadata.start = Math.min(metadata.start, record2.timestamp);
      metadata.end = Math.max(metadata.end, record2.timestamp);
      metadata.records_count += 1;
      metadata.has_full_snapshot || (metadata.has_full_snapshot = record2.type === RecordType.FullSnapshot);
      const prefix = encoder.isEmpty ? '{"records":[' : ",";
      encoder.write(prefix + JSON.stringify(record2), (additionalEncodedBytesCount) => {
        encodedBytesCount += additionalEncodedBytesCount;
        callback(encodedBytesCount);
      });
    }
    function flush(callback) {
      if (encoder.isEmpty) {
        throw new Error("Empty segment flushed");
      }
      encoder.write(`],${JSON.stringify(metadata).slice(1)}
`);
      encoder.finish((encoderResult) => {
        addWroteData(metadata.view.id, encoderResult.rawBytesCount);
        callback(metadata, encoderResult);
      });
    }
    return { addRecord: addRecord2, flush };
  }
  var init_segment = __esm({
    "../packages/rum/esm/domain/segmentCollection/segment.js"() {
      "use strict";
      init_types();
      init_replayStats();
    }
  });

  // ../packages/rum/esm/domain/segmentCollection/segmentCollection.js
  function startSegmentCollection(lifeCycle, configuration, sessionManager, viewHistory, httpRequest, encoder) {
    return doStartSegmentCollection(lifeCycle, () => computeSegmentContext(configuration.applicationId, sessionManager, viewHistory), httpRequest, encoder);
  }
  function doStartSegmentCollection(lifeCycle, getSegmentContext, httpRequest, encoder) {
    let state2 = {
      status: 0,
      nextSegmentCreationReason: "init"
    };
    const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(2, () => {
      flushSegment("view_change");
    });
    const { unsubscribe: unsubscribePageExited } = lifeCycle.subscribe(11, (pageExitEvent) => {
      flushSegment(pageExitEvent.reason);
    });
    function flushSegment(flushReason) {
      if (state2.status === 1) {
        state2.segment.flush((metadata, encoderResult) => {
          const payload = buildReplayPayload(encoderResult.output, metadata, encoderResult.rawBytesCount);
          if (isPageExitReason(flushReason)) {
            httpRequest.sendOnExit(payload);
          } else {
            httpRequest.send(payload);
          }
        });
        clearTimeout(state2.expirationTimeoutId);
      }
      if (flushReason !== "stop") {
        state2 = {
          status: 0,
          nextSegmentCreationReason: flushReason
        };
      } else {
        state2 = {
          status: 2
        };
      }
    }
    return {
      addRecord: (record2) => {
        if (state2.status === 2) {
          return;
        }
        if (state2.status === 0) {
          const context = getSegmentContext();
          if (!context) {
            return;
          }
          state2 = {
            status: 1,
            segment: createSegment({ encoder, context, creationReason: state2.nextSegmentCreationReason }),
            expirationTimeoutId: setTimeout(() => {
              flushSegment("segment_duration_limit");
            }, SEGMENT_DURATION_LIMIT)
          };
        }
        state2.segment.addRecord(record2, (encodedBytesCount) => {
          if (encodedBytesCount > SEGMENT_BYTES_LIMIT) {
            flushSegment("segment_bytes_limit");
          }
        });
      },
      stop: () => {
        flushSegment("stop");
        unsubscribeViewCreated();
        unsubscribePageExited();
      }
    };
  }
  function computeSegmentContext(applicationId, sessionManager, viewHistory) {
    const session = sessionManager.findTrackedSession();
    const viewContext = viewHistory.findView();
    if (!session || !viewContext) {
      return void 0;
    }
    return {
      application: {
        id: applicationId
      },
      session: {
        id: session.id
      },
      view: {
        id: viewContext.id
      }
    };
  }
  var SEGMENT_DURATION_LIMIT, SEGMENT_BYTES_LIMIT;
  var init_segmentCollection = __esm({
    "../packages/rum/esm/domain/segmentCollection/segmentCollection.js"() {
      "use strict";
      init_src();
      init_buildReplayPayload();
      init_segment();
      SEGMENT_DURATION_LIMIT = 5 * ONE_SECOND;
      SEGMENT_BYTES_LIMIT = 6e4;
    }
  });

  // ../packages/rum/esm/domain/segmentCollection/index.js
  var init_segmentCollection2 = __esm({
    "../packages/rum/esm/domain/segmentCollection/index.js"() {
      "use strict";
      init_segmentCollection();
      init_segmentCollection();
    }
  });

  // ../packages/rum/esm/domain/startRecordBridge.js
  function startRecordBridge(viewHistory) {
    const bridge = getEventBridge();
    return {
      addRecord: (record2) => {
        const view = viewHistory.findView();
        bridge.send("record", record2, view.id);
      }
    };
  }
  var init_startRecordBridge = __esm({
    "../packages/rum/esm/domain/startRecordBridge.js"() {
      "use strict";
      init_src();
    }
  });

  // ../packages/rum/esm/boot/startRecording.js
  var startRecording_exports = {};
  __export(startRecording_exports, {
    startRecording: () => startRecording
  });
  function startRecording(lifeCycle, configuration, sessionManager, viewHistory, encoder, httpRequest) {
    const cleanupTasks2 = [];
    const reportError = (error) => {
      lifeCycle.notify(14, { error });
      addTelemetryDebug("Error reported to customer", { "error.message": error.message });
    };
    const replayRequest = httpRequest || createHttpRequest(configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError);
    let addRecord2;
    if (!canUseEventBridge()) {
      const segmentCollection = startSegmentCollection(lifeCycle, configuration, sessionManager, viewHistory, replayRequest, encoder);
      addRecord2 = segmentCollection.addRecord;
      cleanupTasks2.push(segmentCollection.stop);
    } else {
      ;
      ({ addRecord: addRecord2 } = startRecordBridge(viewHistory));
    }
    const { stop: stopRecording } = record({
      emit: addRecord2,
      configuration,
      lifeCycle,
      viewHistory
    });
    cleanupTasks2.push(stopRecording);
    return {
      stop: () => {
        cleanupTasks2.forEach((task) => task());
      }
    };
  }
  var init_startRecording = __esm({
    "../packages/rum/esm/boot/startRecording.js"() {
      "use strict";
      init_src();
      init_record2();
      init_segmentCollection2();
      init_startRecordBridge();
    }
  });

  // ../packages/rum/esm/entries/main.js
  init_src();
  init_src2();

  // ../packages/rum/esm/boot/recorderApi.js
  init_src();
  init_replayStats();

  // ../packages/rum/esm/domain/deflate/deflateEncoder.js
  init_src();
  function createDeflateEncoder(configuration, worker, streamId) {
    let rawBytesCount = 0;
    let compressedData = [];
    let compressedDataTrailer;
    let nextWriteActionId = 0;
    const pendingWriteActions = [];
    const { stop: removeMessageListener } = addEventListener(configuration, worker, "message", ({ data: workerResponse }) => {
      if (workerResponse.type !== "wrote" || workerResponse.streamId !== streamId) {
        return;
      }
      rawBytesCount += workerResponse.additionalBytesCount;
      compressedData.push(workerResponse.result);
      compressedDataTrailer = workerResponse.trailer;
      const nextPendingAction = pendingWriteActions.shift();
      if (nextPendingAction && nextPendingAction.id === workerResponse.id) {
        if (nextPendingAction.writeCallback) {
          nextPendingAction.writeCallback(workerResponse.result.byteLength);
        } else if (nextPendingAction.finishCallback) {
          nextPendingAction.finishCallback();
        }
      } else {
        removeMessageListener();
        addTelemetryDebug("Worker responses received out of order.");
      }
    });
    function consumeResult() {
      const output = compressedData.length === 0 ? new Uint8Array(0) : concatBuffers(compressedData.concat(compressedDataTrailer));
      const result = {
        rawBytesCount,
        output,
        outputBytesCount: output.byteLength,
        encoding: "deflate"
      };
      rawBytesCount = 0;
      compressedData = [];
      return result;
    }
    function sendResetIfNeeded() {
      if (nextWriteActionId > 0) {
        worker.postMessage({
          action: "reset",
          streamId
        });
        nextWriteActionId = 0;
      }
    }
    return {
      isAsync: true,
      get isEmpty() {
        return nextWriteActionId === 0;
      },
      write(data, callback) {
        worker.postMessage({
          action: "write",
          id: nextWriteActionId,
          data,
          streamId
        });
        pendingWriteActions.push({
          id: nextWriteActionId,
          writeCallback: callback,
          data
        });
        nextWriteActionId += 1;
      },
      finish(callback) {
        sendResetIfNeeded();
        if (!pendingWriteActions.length) {
          callback(consumeResult());
        } else {
          pendingWriteActions.forEach((pendingWriteAction) => {
            delete pendingWriteAction.writeCallback;
          });
          pendingWriteActions[pendingWriteActions.length - 1].finishCallback = () => callback(consumeResult());
        }
      },
      finishSync() {
        sendResetIfNeeded();
        const pendingData = pendingWriteActions.map((pendingWriteAction) => {
          delete pendingWriteAction.writeCallback;
          delete pendingWriteAction.finishCallback;
          return pendingWriteAction.data;
        }).join("");
        return { ...consumeResult(), pendingData };
      },
      estimateEncodedBytesCount(data) {
        return data.length / 8;
      },
      stop() {
        removeMessageListener();
      }
    };
  }

  // ../packages/rum/esm/domain/deflate/deflateWorker.js
  init_src();

  // ../packages/rum/esm/domain/scriptLoadingError.js
  init_src();
  function reportScriptLoadingError({ configuredUrl, error, source, scriptType }) {
    display.error(`${source} failed to start: an error occurred while initializing the ${scriptType}:`, error);
    if (error instanceof Event || error instanceof Error && isMessageCspRelated(error.message)) {
      let baseMessage;
      if (configuredUrl) {
        baseMessage = `Please make sure the ${scriptType} URL ${configuredUrl} is correct and CSP is correctly configured.`;
      } else {
        baseMessage = "Please make sure CSP is correctly configured.";
      }
      display.error(`${baseMessage} See documentation at ${DOCS_ORIGIN}/integrations/content_security_policy_logs/#use-csp-with-real-user-monitoring-and-session-replay`);
    } else if (scriptType === "worker") {
      addTelemetryError(error);
    }
  }
  function isMessageCspRelated(message) {
    return message.includes("Content Security Policy") || // Related to `require-trusted-types-for` CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for
    message.includes("requires 'TrustedScriptURL'");
  }

  // ../packages/rum/esm/domain/deflate/deflateWorker.js
  var INITIALIZATION_TIME_OUT_DELAY = 30 * ONE_SECOND;
  function createDeflateWorker(configuration) {
    return new Worker(configuration.workerUrl || URL.createObjectURL(new Blob(['(()=>{"use strict";function t(t){const e=t.reduce(((t,e)=>t+e.length),0),a=new Uint8Array(e);let n=0;for(const e of t)a.set(e,n),n+=e.length;return a}function e(t){for(var e=t.length;--e>=0;)t[e]=0}var a=256,n=286,r=30,i=15,s=new Uint8Array([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]),h=new Uint8Array([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]),l=new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7]),_=new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),o=new Array(576);e(o);var d=new Array(60);e(d);var u=new Array(512);e(u);var f=new Array(256);e(f);var c=new Array(29);e(c);var p,g,w,v=new Array(r);function b(t,e,a,n,r){this.static_tree=t,this.extra_bits=e,this.extra_base=a,this.elems=n,this.max_length=r,this.has_stree=t&&t.length}function m(t,e){this.dyn_tree=t,this.max_code=0,this.stat_desc=e}e(v);var y=function(t){return t<256?u[t]:u[256+(t>>>7)]},k=function(t,e){t.pending_buf[t.pending++]=255&e,t.pending_buf[t.pending++]=e>>>8&255},z=function(t,e,a){t.bi_valid>16-a?(t.bi_buf|=e<<t.bi_valid&65535,k(t,t.bi_buf),t.bi_buf=e>>16-t.bi_valid,t.bi_valid+=a-16):(t.bi_buf|=e<<t.bi_valid&65535,t.bi_valid+=a)},x=function(t,e,a){z(t,a[2*e],a[2*e+1])},A=function(t,e){var a=0;do{a|=1&t,t>>>=1,a<<=1}while(--e>0);return a>>>1},U=function(t,e,a){var n,r,s=new Array(16),h=0;for(n=1;n<=i;n++)s[n]=h=h+a[n-1]<<1;for(r=0;r<=e;r++){var l=t[2*r+1];0!==l&&(t[2*r]=A(s[l]++,l))}},I=function(t){var e;for(e=0;e<n;e++)t.dyn_ltree[2*e]=0;for(e=0;e<r;e++)t.dyn_dtree[2*e]=0;for(e=0;e<19;e++)t.bl_tree[2*e]=0;t.dyn_ltree[512]=1,t.opt_len=t.static_len=0,t.last_lit=t.matches=0},B=function(t){t.bi_valid>8?k(t,t.bi_buf):t.bi_valid>0&&(t.pending_buf[t.pending++]=t.bi_buf),t.bi_buf=0,t.bi_valid=0},E=function(t,e,a,n){var r=2*e,i=2*a;return t[r]<t[i]||t[r]===t[i]&&n[e]<=n[a]},S=function(t,e,a){for(var n=t.heap[a],r=a<<1;r<=t.heap_len&&(r<t.heap_len&&E(e,t.heap[r+1],t.heap[r],t.depth)&&r++,!E(e,n,t.heap[r],t.depth));)t.heap[a]=t.heap[r],a=r,r<<=1;t.heap[a]=n},C=function(t,e,n){var r,i,l,_,o=0;if(0!==t.last_lit)do{r=t.pending_buf[t.d_buf+2*o]<<8|t.pending_buf[t.d_buf+2*o+1],i=t.pending_buf[t.l_buf+o],o++,0===r?x(t,i,e):(l=f[i],x(t,l+a+1,e),0!==(_=s[l])&&(i-=c[l],z(t,i,_)),r--,l=y(r),x(t,l,n),0!==(_=h[l])&&(r-=v[l],z(t,r,_)))}while(o<t.last_lit);x(t,256,e)},D=function(t,e){var a,n,r,s=e.dyn_tree,h=e.stat_desc.static_tree,l=e.stat_desc.has_stree,_=e.stat_desc.elems,o=-1;for(t.heap_len=0,t.heap_max=573,a=0;a<_;a++)0!==s[2*a]?(t.heap[++t.heap_len]=o=a,t.depth[a]=0):s[2*a+1]=0;for(;t.heap_len<2;)s[2*(r=t.heap[++t.heap_len]=o<2?++o:0)]=1,t.depth[r]=0,t.opt_len--,l&&(t.static_len-=h[2*r+1]);for(e.max_code=o,a=t.heap_len>>1;a>=1;a--)S(t,s,a);r=_;do{a=t.heap[1],t.heap[1]=t.heap[t.heap_len--],S(t,s,1),n=t.heap[1],t.heap[--t.heap_max]=a,t.heap[--t.heap_max]=n,s[2*r]=s[2*a]+s[2*n],t.depth[r]=(t.depth[a]>=t.depth[n]?t.depth[a]:t.depth[n])+1,s[2*a+1]=s[2*n+1]=r,t.heap[1]=r++,S(t,s,1)}while(t.heap_len>=2);t.heap[--t.heap_max]=t.heap[1],function(t,e){var a,n,r,s,h,l,_=e.dyn_tree,o=e.max_code,d=e.stat_desc.static_tree,u=e.stat_desc.has_stree,f=e.stat_desc.extra_bits,c=e.stat_desc.extra_base,p=e.stat_desc.max_length,g=0;for(s=0;s<=i;s++)t.bl_count[s]=0;for(_[2*t.heap[t.heap_max]+1]=0,a=t.heap_max+1;a<573;a++)(s=_[2*_[2*(n=t.heap[a])+1]+1]+1)>p&&(s=p,g++),_[2*n+1]=s,n>o||(t.bl_count[s]++,h=0,n>=c&&(h=f[n-c]),l=_[2*n],t.opt_len+=l*(s+h),u&&(t.static_len+=l*(d[2*n+1]+h)));if(0!==g){do{for(s=p-1;0===t.bl_count[s];)s--;t.bl_count[s]--,t.bl_count[s+1]+=2,t.bl_count[p]--,g-=2}while(g>0);for(s=p;0!==s;s--)for(n=t.bl_count[s];0!==n;)(r=t.heap[--a])>o||(_[2*r+1]!==s&&(t.opt_len+=(s-_[2*r+1])*_[2*r],_[2*r+1]=s),n--)}}(t,e),U(s,o,t.bl_count)},j=function(t,e,a){var n,r,i=-1,s=e[1],h=0,l=7,_=4;for(0===s&&(l=138,_=3),e[2*(a+1)+1]=65535,n=0;n<=a;n++)r=s,s=e[2*(n+1)+1],++h<l&&r===s||(h<_?t.bl_tree[2*r]+=h:0!==r?(r!==i&&t.bl_tree[2*r]++,t.bl_tree[32]++):h<=10?t.bl_tree[34]++:t.bl_tree[36]++,h=0,i=r,0===s?(l=138,_=3):r===s?(l=6,_=3):(l=7,_=4))},M=function(t,e,a){var n,r,i=-1,s=e[1],h=0,l=7,_=4;for(0===s&&(l=138,_=3),n=0;n<=a;n++)if(r=s,s=e[2*(n+1)+1],!(++h<l&&r===s)){if(h<_)do{x(t,r,t.bl_tree)}while(0!=--h);else 0!==r?(r!==i&&(x(t,r,t.bl_tree),h--),x(t,16,t.bl_tree),z(t,h-3,2)):h<=10?(x(t,17,t.bl_tree),z(t,h-3,3)):(x(t,18,t.bl_tree),z(t,h-11,7));h=0,i=r,0===s?(l=138,_=3):r===s?(l=6,_=3):(l=7,_=4)}},L=!1,T=function(t,e,a,n){z(t,0+(n?1:0),3),function(t,e,a,n){B(t),n&&(k(t,a),k(t,~a)),t.pending_buf.set(t.window.subarray(e,e+a),t.pending),t.pending+=a}(t,e,a,!0)},H=function(t,e,n,r){var i,s,h=0;t.level>0?(2===t.strm.data_type&&(t.strm.data_type=function(t){var e,n=4093624447;for(e=0;e<=31;e++,n>>>=1)if(1&n&&0!==t.dyn_ltree[2*e])return 0;if(0!==t.dyn_ltree[18]||0!==t.dyn_ltree[20]||0!==t.dyn_ltree[26])return 1;for(e=32;e<a;e++)if(0!==t.dyn_ltree[2*e])return 1;return 0}(t)),D(t,t.l_desc),D(t,t.d_desc),h=function(t){var e;for(j(t,t.dyn_ltree,t.l_desc.max_code),j(t,t.dyn_dtree,t.d_desc.max_code),D(t,t.bl_desc),e=18;e>=3&&0===t.bl_tree[2*_[e]+1];e--);return t.opt_len+=3*(e+1)+5+5+4,e}(t),i=t.opt_len+3+7>>>3,(s=t.static_len+3+7>>>3)<=i&&(i=s)):i=s=n+5,n+4<=i&&-1!==e?T(t,e,n,r):4===t.strategy||s===i?(z(t,2+(r?1:0),3),C(t,o,d)):(z(t,4+(r?1:0),3),function(t,e,a,n){var r;for(z(t,e-257,5),z(t,a-1,5),z(t,n-4,4),r=0;r<n;r++)z(t,t.bl_tree[2*_[r]+1],3);M(t,t.dyn_ltree,e-1),M(t,t.dyn_dtree,a-1)}(t,t.l_desc.max_code+1,t.d_desc.max_code+1,h+1),C(t,t.dyn_ltree,t.dyn_dtree)),I(t),r&&B(t)},R={_tr_init:function(t){L||(!function(){var t,e,a,_,m,y=new Array(16);for(a=0,_=0;_<28;_++)for(c[_]=a,t=0;t<1<<s[_];t++)f[a++]=_;for(f[a-1]=_,m=0,_=0;_<16;_++)for(v[_]=m,t=0;t<1<<h[_];t++)u[m++]=_;for(m>>=7;_<r;_++)for(v[_]=m<<7,t=0;t<1<<h[_]-7;t++)u[256+m++]=_;for(e=0;e<=i;e++)y[e]=0;for(t=0;t<=143;)o[2*t+1]=8,t++,y[8]++;for(;t<=255;)o[2*t+1]=9,t++,y[9]++;for(;t<=279;)o[2*t+1]=7,t++,y[7]++;for(;t<=287;)o[2*t+1]=8,t++,y[8]++;for(U(o,287,y),t=0;t<r;t++)d[2*t+1]=5,d[2*t]=A(t,5);p=new b(o,s,257,n,i),g=new b(d,h,0,r,i),w=new b(new Array(0),l,0,19,7)}(),L=!0),t.l_desc=new m(t.dyn_ltree,p),t.d_desc=new m(t.dyn_dtree,g),t.bl_desc=new m(t.bl_tree,w),t.bi_buf=0,t.bi_valid=0,I(t)},_tr_stored_block:T,_tr_flush_block:H,_tr_tally:function(t,e,n){return t.pending_buf[t.d_buf+2*t.last_lit]=e>>>8&255,t.pending_buf[t.d_buf+2*t.last_lit+1]=255&e,t.pending_buf[t.l_buf+t.last_lit]=255&n,t.last_lit++,0===e?t.dyn_ltree[2*n]++:(t.matches++,e--,t.dyn_ltree[2*(f[n]+a+1)]++,t.dyn_dtree[2*y(e)]++),t.last_lit===t.lit_bufsize-1},_tr_align:function(t){z(t,2,3),x(t,256,o),function(t){16===t.bi_valid?(k(t,t.bi_buf),t.bi_buf=0,t.bi_valid=0):t.bi_valid>=8&&(t.pending_buf[t.pending++]=255&t.bi_buf,t.bi_buf>>=8,t.bi_valid-=8)}(t)}},K=function(t,e,a,n){for(var r=65535&t,i=t>>>16&65535,s=0;0!==a;){a-=s=a>2e3?2e3:a;do{i=i+(r=r+e[n++]|0)|0}while(--s);r%=65521,i%=65521}return r|i<<16},N=new Uint32Array(function(){for(var t,e=[],a=0;a<256;a++){t=a;for(var n=0;n<8;n++)t=1&t?3988292384^t>>>1:t>>>1;e[a]=t}return e}()),O=function(t,e,a,n){var r=N,i=n+a;t^=-1;for(var s=n;s<i;s++)t=t>>>8^r[255&(t^e[s])];return~t},q={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"},F=0,G=2,J=3,P=4,Q=0,V=1,W=-1,X=0,Y=8,Z=R._tr_init,$=R._tr_stored_block,tt=R._tr_flush_block,et=R._tr_tally,at=R._tr_align,nt=F,rt=1,it=J,st=P,ht=5,lt=Q,_t=V,ot=-2,dt=-3,ut=-5,ft=W,ct=1,pt=2,gt=3,wt=4,vt=X,bt=2,mt=Y,yt=258,kt=262,zt=103,xt=113,At=666,Ut=function(t,e){return t.msg=q[e],e},It=function(t){return(t<<1)-(t>4?9:0)},Bt=function(t){for(var e=t.length;--e>=0;)t[e]=0},Et=function(t,e,a){return(e<<t.hash_shift^a)&t.hash_mask},St=function(t){var e=t.state,a=e.pending;a>t.avail_out&&(a=t.avail_out),0!==a&&(t.output.set(e.pending_buf.subarray(e.pending_out,e.pending_out+a),t.next_out),t.next_out+=a,e.pending_out+=a,t.total_out+=a,t.avail_out-=a,e.pending-=a,0===e.pending&&(e.pending_out=0))},Ct=function(t,e){tt(t,t.block_start>=0?t.block_start:-1,t.strstart-t.block_start,e),t.block_start=t.strstart,St(t.strm)},Dt=function(t,e){t.pending_buf[t.pending++]=e},jt=function(t,e){t.pending_buf[t.pending++]=e>>>8&255,t.pending_buf[t.pending++]=255&e},Mt=function(t,e){var a,n,r=t.max_chain_length,i=t.strstart,s=t.prev_length,h=t.nice_match,l=t.strstart>t.w_size-kt?t.strstart-(t.w_size-kt):0,_=t.window,o=t.w_mask,d=t.prev,u=t.strstart+yt,f=_[i+s-1],c=_[i+s];t.prev_length>=t.good_match&&(r>>=2),h>t.lookahead&&(h=t.lookahead);do{if(_[(a=e)+s]===c&&_[a+s-1]===f&&_[a]===_[i]&&_[++a]===_[i+1]){i+=2,a++;do{}while(_[++i]===_[++a]&&_[++i]===_[++a]&&_[++i]===_[++a]&&_[++i]===_[++a]&&_[++i]===_[++a]&&_[++i]===_[++a]&&_[++i]===_[++a]&&_[++i]===_[++a]&&i<u);if(n=yt-(u-i),i=u-yt,n>s){if(t.match_start=e,s=n,n>=h)break;f=_[i+s-1],c=_[i+s]}}}while((e=d[e&o])>l&&0!=--r);return s<=t.lookahead?s:t.lookahead},Lt=function(t){var e,a,n,r,i,s,h,l,_,o,d=t.w_size;do{if(r=t.window_size-t.lookahead-t.strstart,t.strstart>=d+(d-kt)){t.window.set(t.window.subarray(d,d+d),0),t.match_start-=d,t.strstart-=d,t.block_start-=d,e=a=t.hash_size;do{n=t.head[--e],t.head[e]=n>=d?n-d:0}while(--a);e=a=d;do{n=t.prev[--e],t.prev[e]=n>=d?n-d:0}while(--a);r+=d}if(0===t.strm.avail_in)break;if(s=t.strm,h=t.window,l=t.strstart+t.lookahead,_=r,o=void 0,(o=s.avail_in)>_&&(o=_),a=0===o?0:(s.avail_in-=o,h.set(s.input.subarray(s.next_in,s.next_in+o),l),1===s.state.wrap?s.adler=K(s.adler,h,o,l):2===s.state.wrap&&(s.adler=O(s.adler,h,o,l)),s.next_in+=o,s.total_in+=o,o),t.lookahead+=a,t.lookahead+t.insert>=3)for(i=t.strstart-t.insert,t.ins_h=t.window[i],t.ins_h=Et(t,t.ins_h,t.window[i+1]);t.insert&&(t.ins_h=Et(t,t.ins_h,t.window[i+3-1]),t.prev[i&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=i,i++,t.insert--,!(t.lookahead+t.insert<3)););}while(t.lookahead<kt&&0!==t.strm.avail_in)},Tt=function(t,e){for(var a,n;;){if(t.lookahead<kt){if(Lt(t),t.lookahead<kt&&e===nt)return 1;if(0===t.lookahead)break}if(a=0,t.lookahead>=3&&(t.ins_h=Et(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart),0!==a&&t.strstart-a<=t.w_size-kt&&(t.match_length=Mt(t,a)),t.match_length>=3)if(n=et(t,t.strstart-t.match_start,t.match_length-3),t.lookahead-=t.match_length,t.match_length<=t.max_lazy_match&&t.lookahead>=3){t.match_length--;do{t.strstart++,t.ins_h=Et(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart}while(0!=--t.match_length);t.strstart++}else t.strstart+=t.match_length,t.match_length=0,t.ins_h=t.window[t.strstart],t.ins_h=Et(t,t.ins_h,t.window[t.strstart+1]);else n=et(t,0,t.window[t.strstart]),t.lookahead--,t.strstart++;if(n&&(Ct(t,!1),0===t.strm.avail_out))return 1}return t.insert=t.strstart<2?t.strstart:2,e===st?(Ct(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(Ct(t,!1),0===t.strm.avail_out)?1:2},Ht=function(t,e){for(var a,n,r;;){if(t.lookahead<kt){if(Lt(t),t.lookahead<kt&&e===nt)return 1;if(0===t.lookahead)break}if(a=0,t.lookahead>=3&&(t.ins_h=Et(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart),t.prev_length=t.match_length,t.prev_match=t.match_start,t.match_length=2,0!==a&&t.prev_length<t.max_lazy_match&&t.strstart-a<=t.w_size-kt&&(t.match_length=Mt(t,a),t.match_length<=5&&(t.strategy===ct||3===t.match_length&&t.strstart-t.match_start>4096)&&(t.match_length=2)),t.prev_length>=3&&t.match_length<=t.prev_length){r=t.strstart+t.lookahead-3,n=et(t,t.strstart-1-t.prev_match,t.prev_length-3),t.lookahead-=t.prev_length-1,t.prev_length-=2;do{++t.strstart<=r&&(t.ins_h=Et(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart)}while(0!=--t.prev_length);if(t.match_available=0,t.match_length=2,t.strstart++,n&&(Ct(t,!1),0===t.strm.avail_out))return 1}else if(t.match_available){if((n=et(t,0,t.window[t.strstart-1]))&&Ct(t,!1),t.strstart++,t.lookahead--,0===t.strm.avail_out)return 1}else t.match_available=1,t.strstart++,t.lookahead--}return t.match_available&&(n=et(t,0,t.window[t.strstart-1]),t.match_available=0),t.insert=t.strstart<2?t.strstart:2,e===st?(Ct(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(Ct(t,!1),0===t.strm.avail_out)?1:2};function Rt(t,e,a,n,r){this.good_length=t,this.max_lazy=e,this.nice_length=a,this.max_chain=n,this.func=r}var Kt=[new Rt(0,0,0,0,(function(t,e){var a=65535;for(a>t.pending_buf_size-5&&(a=t.pending_buf_size-5);;){if(t.lookahead<=1){if(Lt(t),0===t.lookahead&&e===nt)return 1;if(0===t.lookahead)break}t.strstart+=t.lookahead,t.lookahead=0;var n=t.block_start+a;if((0===t.strstart||t.strstart>=n)&&(t.lookahead=t.strstart-n,t.strstart=n,Ct(t,!1),0===t.strm.avail_out))return 1;if(t.strstart-t.block_start>=t.w_size-kt&&(Ct(t,!1),0===t.strm.avail_out))return 1}return t.insert=0,e===st?(Ct(t,!0),0===t.strm.avail_out?3:4):(t.strstart>t.block_start&&(Ct(t,!1),t.strm.avail_out),1)})),new Rt(4,4,8,4,Tt),new Rt(4,5,16,8,Tt),new Rt(4,6,32,32,Tt),new Rt(4,4,16,16,Ht),new Rt(8,16,32,32,Ht),new Rt(8,16,128,128,Ht),new Rt(8,32,128,256,Ht),new Rt(32,128,258,1024,Ht),new Rt(32,258,258,4096,Ht)];function Nt(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=mt,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new Uint16Array(1146),this.dyn_dtree=new Uint16Array(122),this.bl_tree=new Uint16Array(78),Bt(this.dyn_ltree),Bt(this.dyn_dtree),Bt(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new Uint16Array(16),this.heap=new Uint16Array(573),Bt(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new Uint16Array(573),Bt(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}var Ot=function(t){if(!t||!t.state)return Ut(t,ot);t.total_in=t.total_out=0,t.data_type=bt;var e=t.state;return e.pending=0,e.pending_out=0,e.wrap<0&&(e.wrap=-e.wrap),e.status=e.wrap?42:xt,t.adler=2===e.wrap?0:1,e.last_flush=nt,Z(e),lt},qt=function(t){var e,a=Ot(t);return a===lt&&((e=t.state).window_size=2*e.w_size,Bt(e.head),e.max_lazy_match=Kt[e.level].max_lazy,e.good_match=Kt[e.level].good_length,e.nice_match=Kt[e.level].nice_length,e.max_chain_length=Kt[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=2,e.match_available=0,e.ins_h=0),a},Ft=function(t,e,a,n,r,i){if(!t)return ot;var s=1;if(e===ft&&(e=6),n<0?(s=0,n=-n):n>15&&(s=2,n-=16),r<1||r>9||a!==mt||n<8||n>15||e<0||e>9||i<0||i>wt)return Ut(t,ot);8===n&&(n=9);var h=new Nt;return t.state=h,h.strm=t,h.wrap=s,h.gzhead=null,h.w_bits=n,h.w_size=1<<h.w_bits,h.w_mask=h.w_size-1,h.hash_bits=r+7,h.hash_size=1<<h.hash_bits,h.hash_mask=h.hash_size-1,h.hash_shift=~~((h.hash_bits+3-1)/3),h.window=new Uint8Array(2*h.w_size),h.head=new Uint16Array(h.hash_size),h.prev=new Uint16Array(h.w_size),h.lit_bufsize=1<<r+6,h.pending_buf_size=4*h.lit_bufsize,h.pending_buf=new Uint8Array(h.pending_buf_size),h.d_buf=1*h.lit_bufsize,h.l_buf=3*h.lit_bufsize,h.level=e,h.strategy=i,h.method=a,qt(t)},Gt={deflateInit:function(t,e){return Ft(t,e,mt,15,8,vt)},deflateInit2:Ft,deflateReset:qt,deflateResetKeep:Ot,deflateSetHeader:function(t,e){return t&&t.state?2!==t.state.wrap?ot:(t.state.gzhead=e,lt):ot},deflate:function(t,e){var a,n;if(!t||!t.state||e>ht||e<0)return t?Ut(t,ot):ot;var r=t.state;if(!t.output||!t.input&&0!==t.avail_in||r.status===At&&e!==st)return Ut(t,0===t.avail_out?ut:ot);r.strm=t;var i=r.last_flush;if(r.last_flush=e,42===r.status)if(2===r.wrap)t.adler=0,Dt(r,31),Dt(r,139),Dt(r,8),r.gzhead?(Dt(r,(r.gzhead.text?1:0)+(r.gzhead.hcrc?2:0)+(r.gzhead.extra?4:0)+(r.gzhead.name?8:0)+(r.gzhead.comment?16:0)),Dt(r,255&r.gzhead.time),Dt(r,r.gzhead.time>>8&255),Dt(r,r.gzhead.time>>16&255),Dt(r,r.gzhead.time>>24&255),Dt(r,9===r.level?2:r.strategy>=pt||r.level<2?4:0),Dt(r,255&r.gzhead.os),r.gzhead.extra&&r.gzhead.extra.length&&(Dt(r,255&r.gzhead.extra.length),Dt(r,r.gzhead.extra.length>>8&255)),r.gzhead.hcrc&&(t.adler=O(t.adler,r.pending_buf,r.pending,0)),r.gzindex=0,r.status=69):(Dt(r,0),Dt(r,0),Dt(r,0),Dt(r,0),Dt(r,0),Dt(r,9===r.level?2:r.strategy>=pt||r.level<2?4:0),Dt(r,3),r.status=xt);else{var s=mt+(r.w_bits-8<<4)<<8;s|=(r.strategy>=pt||r.level<2?0:r.level<6?1:6===r.level?2:3)<<6,0!==r.strstart&&(s|=32),s+=31-s%31,r.status=xt,jt(r,s),0!==r.strstart&&(jt(r,t.adler>>>16),jt(r,65535&t.adler)),t.adler=1}if(69===r.status)if(r.gzhead.extra){for(a=r.pending;r.gzindex<(65535&r.gzhead.extra.length)&&(r.pending!==r.pending_buf_size||(r.gzhead.hcrc&&r.pending>a&&(t.adler=O(t.adler,r.pending_buf,r.pending-a,a)),St(t),a=r.pending,r.pending!==r.pending_buf_size));)Dt(r,255&r.gzhead.extra[r.gzindex]),r.gzindex++;r.gzhead.hcrc&&r.pending>a&&(t.adler=O(t.adler,r.pending_buf,r.pending-a,a)),r.gzindex===r.gzhead.extra.length&&(r.gzindex=0,r.status=73)}else r.status=73;if(73===r.status)if(r.gzhead.name){a=r.pending;do{if(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(t.adler=O(t.adler,r.pending_buf,r.pending-a,a)),St(t),a=r.pending,r.pending===r.pending_buf_size)){n=1;break}n=r.gzindex<r.gzhead.name.length?255&r.gzhead.name.charCodeAt(r.gzindex++):0,Dt(r,n)}while(0!==n);r.gzhead.hcrc&&r.pending>a&&(t.adler=O(t.adler,r.pending_buf,r.pending-a,a)),0===n&&(r.gzindex=0,r.status=91)}else r.status=91;if(91===r.status)if(r.gzhead.comment){a=r.pending;do{if(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(t.adler=O(t.adler,r.pending_buf,r.pending-a,a)),St(t),a=r.pending,r.pending===r.pending_buf_size)){n=1;break}n=r.gzindex<r.gzhead.comment.length?255&r.gzhead.comment.charCodeAt(r.gzindex++):0,Dt(r,n)}while(0!==n);r.gzhead.hcrc&&r.pending>a&&(t.adler=O(t.adler,r.pending_buf,r.pending-a,a)),0===n&&(r.status=zt)}else r.status=zt;if(r.status===zt&&(r.gzhead.hcrc?(r.pending+2>r.pending_buf_size&&St(t),r.pending+2<=r.pending_buf_size&&(Dt(r,255&t.adler),Dt(r,t.adler>>8&255),t.adler=0,r.status=xt)):r.status=xt),0!==r.pending){if(St(t),0===t.avail_out)return r.last_flush=-1,lt}else if(0===t.avail_in&&It(e)<=It(i)&&e!==st)return Ut(t,ut);if(r.status===At&&0!==t.avail_in)return Ut(t,ut);if(0!==t.avail_in||0!==r.lookahead||e!==nt&&r.status!==At){var h=r.strategy===pt?function(t,e){for(var a;;){if(0===t.lookahead&&(Lt(t),0===t.lookahead)){if(e===nt)return 1;break}if(t.match_length=0,a=et(t,0,t.window[t.strstart]),t.lookahead--,t.strstart++,a&&(Ct(t,!1),0===t.strm.avail_out))return 1}return t.insert=0,e===st?(Ct(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(Ct(t,!1),0===t.strm.avail_out)?1:2}(r,e):r.strategy===gt?function(t,e){for(var a,n,r,i,s=t.window;;){if(t.lookahead<=yt){if(Lt(t),t.lookahead<=yt&&e===nt)return 1;if(0===t.lookahead)break}if(t.match_length=0,t.lookahead>=3&&t.strstart>0&&(n=s[r=t.strstart-1])===s[++r]&&n===s[++r]&&n===s[++r]){i=t.strstart+yt;do{}while(n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&r<i);t.match_length=yt-(i-r),t.match_length>t.lookahead&&(t.match_length=t.lookahead)}if(t.match_length>=3?(a=et(t,1,t.match_length-3),t.lookahead-=t.match_length,t.strstart+=t.match_length,t.match_length=0):(a=et(t,0,t.window[t.strstart]),t.lookahead--,t.strstart++),a&&(Ct(t,!1),0===t.strm.avail_out))return 1}return t.insert=0,e===st?(Ct(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(Ct(t,!1),0===t.strm.avail_out)?1:2}(r,e):Kt[r.level].func(r,e);if(3!==h&&4!==h||(r.status=At),1===h||3===h)return 0===t.avail_out&&(r.last_flush=-1),lt;if(2===h&&(e===rt?at(r):e!==ht&&($(r,0,0,!1),e===it&&(Bt(r.head),0===r.lookahead&&(r.strstart=0,r.block_start=0,r.insert=0))),St(t),0===t.avail_out))return r.last_flush=-1,lt}return e!==st?lt:r.wrap<=0?_t:(2===r.wrap?(Dt(r,255&t.adler),Dt(r,t.adler>>8&255),Dt(r,t.adler>>16&255),Dt(r,t.adler>>24&255),Dt(r,255&t.total_in),Dt(r,t.total_in>>8&255),Dt(r,t.total_in>>16&255),Dt(r,t.total_in>>24&255)):(jt(r,t.adler>>>16),jt(r,65535&t.adler)),St(t),r.wrap>0&&(r.wrap=-r.wrap),0!==r.pending?lt:_t)},deflateEnd:function(t){if(!t||!t.state)return ot;var e=t.state.status;return 42!==e&&69!==e&&73!==e&&91!==e&&e!==zt&&e!==xt&&e!==At?Ut(t,ot):(t.state=null,e===xt?Ut(t,dt):lt)},deflateSetDictionary:function(t,e){var a=e.length;if(!t||!t.state)return ot;var n=t.state,r=n.wrap;if(2===r||1===r&&42!==n.status||n.lookahead)return ot;if(1===r&&(t.adler=K(t.adler,e,a,0)),n.wrap=0,a>=n.w_size){0===r&&(Bt(n.head),n.strstart=0,n.block_start=0,n.insert=0);var i=new Uint8Array(n.w_size);i.set(e.subarray(a-n.w_size,a),0),e=i,a=n.w_size}var s=t.avail_in,h=t.next_in,l=t.input;for(t.avail_in=a,t.next_in=0,t.input=e,Lt(n);n.lookahead>=3;){var _=n.strstart,o=n.lookahead-2;do{n.ins_h=Et(n,n.ins_h,n.window[_+3-1]),n.prev[_&n.w_mask]=n.head[n.ins_h],n.head[n.ins_h]=_,_++}while(--o);n.strstart=_,n.lookahead=2,Lt(n)}return n.strstart+=n.lookahead,n.block_start=n.strstart,n.insert=n.lookahead,n.lookahead=0,n.match_length=n.prev_length=2,n.match_available=0,t.next_in=h,t.input=l,t.avail_in=s,n.wrap=r,lt},deflateInfo:"pako deflate (from Nodeca project)"};for(var Jt=new Uint8Array(256),Pt=0;Pt<256;Pt++)Jt[Pt]=Pt>=252?6:Pt>=248?5:Pt>=240?4:Pt>=224?3:Pt>=192?2:1;Jt[254]=Jt[254]=1;var Qt=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0},Vt=Object.prototype.toString,Wt=F,Xt=G,Yt=J,Zt=P,$t=Q,te=V,ee=W,ae=X,ne=Y;function re(){this.options={level:ee,method:ne,chunkSize:16384,windowBits:15,memLevel:8,strategy:ae};var t=this.options;t.raw&&t.windowBits>0?t.windowBits=-t.windowBits:t.gzip&&t.windowBits>0&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new Qt,this.strm.avail_out=0;var e=Gt.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(e!==$t)throw new Error(q[e]);if(t.header&&Gt.deflateSetHeader(this.strm,t.header),t.dictionary){var a;if(a="[object ArrayBuffer]"===Vt.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(e=Gt.deflateSetDictionary(this.strm,a))!==$t)throw new Error(q[e]);this._dict_set=!0}}function ie(t,e,a){try{t.postMessage({type:"errored",error:e,streamId:a})}catch(n){t.postMessage({type:"errored",error:String(e),streamId:a})}}function se(t){const e=t.strm.adler;return new Uint8Array([3,0,e>>>24&255,e>>>16&255,e>>>8&255,255&e])}re.prototype.push=function(t,e){var a,n,r=this.strm,i=this.options.chunkSize;if(this.ended)return!1;for(n=e===~~e?e:!0===e?Zt:Wt,"[object ArrayBuffer]"===Vt.call(t)?r.input=new Uint8Array(t):r.input=t,r.next_in=0,r.avail_in=r.input.length;;)if(0===r.avail_out&&(r.output=new Uint8Array(i),r.next_out=0,r.avail_out=i),(n===Xt||n===Yt)&&r.avail_out<=6)this.onData(r.output.subarray(0,r.next_out)),r.avail_out=0;else{if((a=Gt.deflate(r,n))===te)return r.next_out>0&&this.onData(r.output.subarray(0,r.next_out)),a=Gt.deflateEnd(this.strm),this.onEnd(a),this.ended=!0,a===$t;if(0!==r.avail_out){if(n>0&&r.next_out>0)this.onData(r.output.subarray(0,r.next_out)),r.avail_out=0;else if(0===r.avail_in)break}else this.onData(r.output)}return!0},re.prototype.onData=function(t){this.chunks.push(t)},re.prototype.onEnd=function(t){t===$t&&(this.result=function(t){for(var e=0,a=0,n=t.length;a<n;a++)e+=t[a].length;for(var r=new Uint8Array(e),i=0,s=0,h=t.length;i<h;i++){var l=t[i];r.set(l,s),s+=l.length}return r}(this.chunks)),this.chunks=[],this.err=t,this.msg=this.strm.msg},function(e=self){try{const a=new Map;e.addEventListener("message",(n=>{try{const r=function(e,a){switch(a.action){case"init":return{type:"initialized",version:"dev"};case"write":{let n=e.get(a.streamId);n||(n=new re,e.set(a.streamId,n));const r=n.chunks.length,i=function(t){if("function"==typeof TextEncoder&&TextEncoder.prototype.encode)return(new TextEncoder).encode(t);let e,a,n,r,i,s=t.length,h=0;for(r=0;r<s;r++)a=t.charCodeAt(r),55296==(64512&a)&&r+1<s&&(n=t.charCodeAt(r+1),56320==(64512&n)&&(a=65536+(a-55296<<10)+(n-56320),r++)),h+=a<128?1:a<2048?2:a<65536?3:4;for(e=new Uint8Array(h),i=0,r=0;i<h;r++)a=t.charCodeAt(r),55296==(64512&a)&&r+1<s&&(n=t.charCodeAt(r+1),56320==(64512&n)&&(a=65536+(a-55296<<10)+(n-56320),r++)),a<128?e[i++]=a:a<2048?(e[i++]=192|a>>>6,e[i++]=128|63&a):a<65536?(e[i++]=224|a>>>12,e[i++]=128|a>>>6&63,e[i++]=128|63&a):(e[i++]=240|a>>>18,e[i++]=128|a>>>12&63,e[i++]=128|a>>>6&63,e[i++]=128|63&a);return e}(a.data);return n.push(i,G),{type:"wrote",id:a.id,streamId:a.streamId,result:t(n.chunks.slice(r)),trailer:se(n),additionalBytesCount:i.length}}case"reset":e.delete(a.streamId)}}(a,n.data);r&&e.postMessage(r)}catch(t){ie(e,t,n.data&&"streamId"in n.data?n.data.streamId:void 0)}}))}catch(t){ie(e,t)}}()})();'])));
  }
  var state = {
    status: 0
    /* DeflateWorkerStatus.Nil */
  };
  function startDeflateWorker(configuration, source, onInitializationFailure, createDeflateWorkerImpl = createDeflateWorker) {
    if (state.status === 0) {
      doStartDeflateWorker(configuration, source, createDeflateWorkerImpl);
    }
    switch (state.status) {
      case 1:
        state.initializationFailureCallbacks.push(onInitializationFailure);
        return state.worker;
      case 3:
        return state.worker;
    }
  }
  function getDeflateWorkerStatus() {
    return state.status;
  }
  function doStartDeflateWorker(configuration, source, createDeflateWorkerImpl = createDeflateWorker) {
    try {
      const worker = createDeflateWorkerImpl(configuration);
      const { stop: removeErrorListener } = addEventListener(configuration, worker, "error", (error) => {
        onError(configuration, source, error);
      });
      const { stop: removeMessageListener } = addEventListener(configuration, worker, "message", ({ data }) => {
        if (data.type === "errored") {
          onError(configuration, source, data.error, data.streamId);
        } else if (data.type === "initialized") {
          onInitialized(data.version);
        }
      });
      worker.postMessage({ action: "init" });
      setTimeout(() => onTimeout(source), INITIALIZATION_TIME_OUT_DELAY);
      const stop = () => {
        removeErrorListener();
        removeMessageListener();
      };
      state = { status: 1, worker, stop, initializationFailureCallbacks: [] };
    } catch (error) {
      onError(configuration, source, error);
    }
  }
  function onTimeout(source) {
    if (state.status === 1) {
      display.error(`${source} failed to start: a timeout occurred while initializing the Worker`);
      state.initializationFailureCallbacks.forEach((callback) => callback());
      state = {
        status: 2
        /* DeflateWorkerStatus.Error */
      };
    }
  }
  function onInitialized(version) {
    if (state.status === 1) {
      state = { status: 3, worker: state.worker, stop: state.stop, version };
    }
  }
  function onError(configuration, source, error, streamId) {
    if (state.status === 1 || state.status === 0) {
      reportScriptLoadingError({
        configuredUrl: configuration.workerUrl,
        error,
        source,
        scriptType: "worker"
      });
      if (state.status === 1) {
        state.initializationFailureCallbacks.forEach((callback) => callback());
      }
      state = {
        status: 2
        /* DeflateWorkerStatus.Error */
      };
    } else {
      addTelemetryError(error, {
        worker_version: state.status === 3 && state.version,
        stream_id: streamId
      });
    }
  }

  // ../packages/rum/esm/boot/isBrowserSupported.js
  function isBrowserSupported() {
    return (
      // Array.from is a bit less supported by browsers than CSSSupportsRule, but has higher chances
      // to be polyfilled. Test for both to be more confident. We could add more things if we find out
      // this test is not sufficient.
      typeof Array.from === "function" && typeof CSSSupportsRule === "function" && typeof URL.createObjectURL === "function" && "forEach" in NodeList.prototype
    );
  }

  // ../packages/rum/esm/boot/postStartStrategy.js
  init_src();

  // ../packages/rum/esm/domain/getSessionReplayLink.js
  init_src2();
  function getSessionReplayLink(configuration, sessionManager, viewHistory, isRecordingStarted) {
    const session = sessionManager.findTrackedSession();
    const errorType = getErrorType(session, isRecordingStarted);
    const viewContext = viewHistory.findView();
    return getSessionReplayUrl(configuration, {
      viewContext,
      errorType,
      session
    });
  }
  function getErrorType(session, isRecordingStarted) {
    if (!isBrowserSupported()) {
      return "browser-not-supported";
    }
    if (!session) {
      return "rum-not-tracked";
    }
    if (session.sessionReplay === 0) {
      return "incorrect-session-plan";
    }
    if (!isRecordingStarted) {
      return "replay-not-started";
    }
  }

  // ../packages/rum/esm/boot/postStartStrategy.js
  function createPostStartStrategy2(configuration, lifeCycle, sessionManager, viewHistory, loadRecorder, getOrCreateDeflateEncoder) {
    let status = 0;
    let stopRecording;
    lifeCycle.subscribe(9, () => {
      if (status === 2 || status === 3) {
        stop();
        status = 1;
      }
    });
    lifeCycle.subscribe(11, (pageExitEvent) => {
      if (pageExitEvent.reason === PageExitReason.UNLOADING) {
        stop();
      }
    });
    lifeCycle.subscribe(10, () => {
      if (status === 1) {
        start();
      }
    });
    const doStart = async () => {
      const [startRecordingImpl] = await Promise.all([loadRecorder(), asyncRunOnReadyState(configuration, "interactive")]);
      if (status !== 2) {
        return;
      }
      const deflateEncoder = getOrCreateDeflateEncoder();
      if (!deflateEncoder || !startRecordingImpl) {
        status = 0;
        return;
      }
      ;
      ({ stop: stopRecording } = startRecordingImpl(lifeCycle, configuration, sessionManager, viewHistory, deflateEncoder));
      status = 3;
    };
    function start(options) {
      const session = sessionManager.findTrackedSession();
      if (canStartRecording(session, options)) {
        status = 1;
        return;
      }
      if (isRecordingInProgress(status)) {
        return;
      }
      status = 2;
      doStart().catch(monitorError);
      if (shouldForceReplay(session, options)) {
        sessionManager.setForcedReplay();
      }
    }
    function stop() {
      if (status === 3) {
        stopRecording === null || stopRecording === void 0 ? void 0 : stopRecording();
      }
      status = 0;
    }
    return {
      start,
      stop,
      getSessionReplayLink() {
        return getSessionReplayLink(
          configuration,
          sessionManager,
          viewHistory,
          status !== 0
          /* RecorderStatus.Stopped */
        );
      },
      isRecording: () => status === 3
    };
  }
  function canStartRecording(session, options) {
    return !session || session.sessionReplay === 0 && (!options || !options.force);
  }
  function isRecordingInProgress(status) {
    return status === 2 || status === 3;
  }
  function shouldForceReplay(session, options) {
    return options && options.force && session.sessionReplay === 0;
  }

  // ../packages/rum/esm/boot/preStartStrategy.js
  init_src();
  function createPreStartStrategy2() {
    let status = 0;
    return {
      strategy: {
        start() {
          status = 1;
        },
        stop() {
          status = 2;
        },
        isRecording: () => false,
        getSessionReplayLink: noop
      },
      shouldStartImmediately(configuration) {
        return status === 1 || status === 0 && !configuration.startSessionReplayRecordingManually;
      }
    };
  }

  // ../packages/rum/esm/boot/recorderApi.js
  function makeRecorderApi(loadRecorder, createDeflateWorkerImpl) {
    if (canUseEventBridge() && !bridgeSupports(
      "records"
      /* BridgeCapability.RECORDS */
    ) || !isBrowserSupported()) {
      return {
        start: noop,
        stop: noop,
        getReplayStats: () => void 0,
        onRumStart: noop,
        isRecording: () => false,
        getSessionReplayLink: () => void 0
      };
    }
    let { strategy, shouldStartImmediately } = createPreStartStrategy2();
    return {
      start: (options) => strategy.start(options),
      stop: () => strategy.stop(),
      getSessionReplayLink: () => strategy.getSessionReplayLink(),
      onRumStart,
      isRecording: () => (
        // The worker is started optimistically, meaning we could have started to record but its
        // initialization fails a bit later. This could happen when:
        // * the worker URL (blob or plain URL) is blocked by CSP in Firefox only (Chromium and Safari
        // throw an exception when instantiating the worker, and IE doesn't care about CSP)
        // * the browser fails to load the worker in case the workerUrl is used
        // * an unexpected error occurs in the Worker before initialization, ex:
        //   * a runtime exception collected by monitor()
        //   * a syntax error notified by the browser via an error event
        // * the worker is unresponsive for some reason and timeouts
        //
        // It is not expected to happen often. Nonetheless, the "replayable" status on RUM events is
        // an important part of the Datadog App:
        // * If we have a false positive (we set has_replay: true even if no replay data is present),
        // we might display broken links to the Session Replay player.
        // * If we have a false negative (we don't set has_replay: true even if replay data is
        // available), it is less noticeable because no link will be displayed.
        //
        // Thus, it is better to have false negative, so let's make sure the worker is correctly
        // initialized before advertizing that we are recording.
        //
        // In the future, when the compression worker will also be used for RUM data, this will be
        // less important since no RUM event will be sent when the worker fails to initialize.
        getDeflateWorkerStatus() === 3 && strategy.isRecording()
      ),
      getReplayStats: (viewId) => getDeflateWorkerStatus() === 3 ? getReplayStats(viewId) : void 0
    };
    function onRumStart(lifeCycle, configuration, sessionManager, viewHistory, worker) {
      let cachedDeflateEncoder;
      function getOrCreateDeflateEncoder() {
        if (!cachedDeflateEncoder) {
          worker !== null && worker !== void 0 ? worker : worker = startDeflateWorker(configuration, "Datadog Session Replay", () => {
            strategy.stop();
          }, createDeflateWorkerImpl);
          if (worker) {
            cachedDeflateEncoder = createDeflateEncoder(
              configuration,
              worker,
              1
              /* DeflateEncoderStreamId.REPLAY */
            );
          }
        }
        return cachedDeflateEncoder;
      }
      strategy = createPostStartStrategy2(configuration, lifeCycle, sessionManager, viewHistory, loadRecorder, getOrCreateDeflateEncoder);
      if (shouldStartImmediately(configuration)) {
        strategy.start();
      }
    }
  }

  // ../packages/rum/esm/boot/lazyLoadRecorder.js
  async function lazyLoadRecorder(importRecorderImpl = importRecorder) {
    try {
      return await importRecorderImpl();
    } catch (error) {
      reportScriptLoadingError({
        error,
        source: "Recorder",
        scriptType: "module"
      });
    }
  }
  async function importRecorder() {
    const module = await Promise.resolve().then(() => (init_startRecording(), startRecording_exports));
    return module.startRecording;
  }

  // ../packages/rum/esm/entries/main.js
  var recorderApi = makeRecorderApi(lazyLoadRecorder);
  var datadogRum = makeRumPublicApi(startRum, recorderApi, { startDeflateWorker, createDeflateEncoder });
  defineGlobal(getGlobalObject(), "DD_RUM", datadogRum);

  // src/content-scripts.js
  console.log("Content script loaded. Initializing RUM...");
  datadogRum.init({
    applicationId: "bd3472ea-efc2-45e1-8dff-be4cea9429b3",
    clientToken: "pub7216f8a2d1091e263c95c1205882474e",
    site: "datad0g.com",
    service: "benoit-test-1",
    env: "dev",
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: "mask-user-input"
  });
  datadogRum.setUser({
    id: "1234",
    name: "Beltran",
    email: "beltran@mail.com"
  });
  console.log("[Testing] Running test code.");
  var isolatedErrorStack = new Error().stack || "";
  console.log(">>> [Main] Error stack:", isolatedErrorStack);
  var hasExtensionURLIsolated = isolatedErrorStack.includes("chrome-extension://");
  console.log("hasExtensionURL:", hasExtensionURLIsolated);
  console.log("Current URL:", window.location.href);
  console.log("Document title:", document.title);
  console.log("Extension ID (if available):", chrome.runtime.id || "Unknown");
  window.addEventListener("error", (event) => {
    console.log("[Testing] Uncaught error:", event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.log("[Testing] Unhandled Promise Rejection:", event.reason);
  });
  datadogRum.startSessionReplayRecording();
})();
