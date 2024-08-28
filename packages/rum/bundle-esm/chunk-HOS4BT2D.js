// ../core/src/tools/utils/numberUtils.ts
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

// ../core/src/tools/utils/timeUtils.ts
var ONE_SECOND = 1e3;
var ONE_MINUTE = 60 * ONE_SECOND;
var ONE_HOUR = 60 * ONE_MINUTE;
var ONE_DAY = 24 * ONE_HOUR;
var ONE_YEAR = 365 * ONE_DAY;
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
var navigationStart;
function getNavigationStart() {
  if (navigationStart === void 0) {
    navigationStart = performance.timing.navigationStart;
  }
  return navigationStart;
}

// ../core/src/tools/getGlobalObject.ts
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

// ../core/src/tools/utils/stringUtils.ts
function generateUUID(placeholder) {
  return placeholder ? (
    // eslint-disable-next-line  no-bitwise
    (parseInt(placeholder, 10) ^ Math.random() * 16 >> parseInt(placeholder, 10) / 4).toString(16)
  ) : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID);
}
var COMMA_SEPARATED_KEY_VALUE = /([\w-]+)\s*=\s*([^;]+)/g;
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

// ../core/src/tools/display.ts
var ConsoleApiName = {
  log: "log",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error"
};
var globalConsole = console;
var originalConsoleMethods = {};
Object.keys(ConsoleApiName).forEach((name) => {
  originalConsoleMethods[name] = globalConsole[name];
});
var PREFIX = "Datadog Browser SDK:";
var display = {
  debug: originalConsoleMethods.debug.bind(globalConsole, PREFIX),
  log: originalConsoleMethods.log.bind(globalConsole, PREFIX),
  info: originalConsoleMethods.info.bind(globalConsole, PREFIX),
  warn: originalConsoleMethods.warn.bind(globalConsole, PREFIX),
  error: originalConsoleMethods.error.bind(globalConsole, PREFIX)
};
var DOCS_ORIGIN = "https://docs.datadoghq.com";
var DOCS_TROUBLESHOOTING = `${DOCS_ORIGIN}/real_user_monitoring/browser/troubleshooting`;
var MORE_DETAILS = "More details:";

// ../core/src/tools/catchUserErrors.ts
function catchUserErrors(fn, errorMsg) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      display.error(errorMsg, err);
    }
  };
}

// ../core/src/tools/utils/byteUtils.ts
var ONE_KIBI_BYTE = 1024;
var ONE_MEBI_BYTE = 1024 * ONE_KIBI_BYTE;
var HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/;
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

// ../core/src/tools/utils/polyfills.ts
function includes(candidate, search) {
  return candidate.indexOf(search) !== -1;
}
function arrayFrom(arrayLike) {
  if (Array.from) {
    return Array.from(arrayLike);
  }
  const array = [];
  if (arrayLike instanceof Set) {
    arrayLike.forEach((item) => array.push(item));
  } else {
    for (let i = 0; i < arrayLike.length; i++) {
      array.push(arrayLike[i]);
    }
  }
  return array;
}
function find(array, predicate) {
  for (let i = 0; i < array.length; i += 1) {
    const item = array[i];
    if (predicate(item, i)) {
      return item;
    }
  }
  return void 0;
}
function findLast(array, predicate) {
  for (let i = array.length - 1; i >= 0; i -= 1) {
    const item = array[i];
    if (predicate(item, i, array)) {
      return item;
    }
  }
  return void 0;
}
function forEach(list, callback) {
  Array.prototype.forEach.call(list, callback);
}
function objectValues(object) {
  return Object.keys(object).map((key) => object[key]);
}
function objectEntries(object) {
  return Object.keys(object).map((key) => [key, object[key]]);
}
function startsWith(candidate, search) {
  return candidate.slice(0, search.length) === search;
}
function endsWith(candidate, search) {
  return candidate.slice(-search.length) === search;
}
function assign(target, ...toAssign) {
  toAssign.forEach((source) => {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  });
  return target;
}

// ../core/src/tools/utils/objectUtils.ts
function shallowClone(object) {
  return assign({}, object);
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

// ../core/src/tools/getZoneJsOriginalValue.ts
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

// ../core/src/tools/monitor.ts
var onMonitorErrorCollected;
var debugMode = false;
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
    displayIfDebugEnabled(e);
    if (onMonitorErrorCollected) {
      try {
        onMonitorErrorCollected(e);
      } catch (e2) {
        displayIfDebugEnabled(e2);
      }
    }
  }
}
function displayIfDebugEnabled(...args) {
  if (debugMode) {
    display.error("[MONITOR]", ...args);
  }
}

// ../core/src/tools/timer.ts
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

// ../core/src/tools/observable.ts
var Observable = class {
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
    this.observers.forEach((observer) => observer(data));
  }
};
function mergeObservables(...observables) {
  return new Observable((globalObservable) => {
    const subscriptions = observables.map(
      (observable) => observable.subscribe((data) => globalObservable.notify(data))
    );
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  });
}

// ../core/src/tools/utils/functionUtils.ts
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

// ../core/src/tools/utils/browserDetection.ts
function isIE() {
  return detectBrowserCached() === 0 /* IE */;
}
function isChromium() {
  return detectBrowserCached() === 1 /* CHROMIUM */;
}
function isSafari() {
  return detectBrowserCached() === 2 /* SAFARI */;
}
var browserCache;
function detectBrowserCached() {
  return browserCache ?? (browserCache = detectBrowser());
}
function detectBrowser(browserWindow = window) {
  const userAgent = browserWindow.navigator.userAgent;
  if (browserWindow.chrome || /HeadlessChrome/.test(userAgent)) {
    return 1 /* CHROMIUM */;
  }
  if (
    // navigator.vendor is deprecated, but it is the most resilient way we found to detect
    // "Apple maintained browsers" (AKA Safari). If one day it gets removed, we still have the
    // useragent test as a semi-working fallback.
    browserWindow.navigator.vendor?.indexOf("Apple") === 0 || /safari/i.test(userAgent) && !/chrome|android/i.test(userAgent)
  ) {
    return 2 /* SAFARI */;
  }
  if (browserWindow.document.documentMode) {
    return 0 /* IE */;
  }
  return 3 /* OTHER */;
}

// ../core/src/browser/cookie.ts
function setCookie(name, value, expireDelay, options) {
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
var initCookieParsed;
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
var getCurrentSiteCache;
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

// ../core/src/domain/session/storeStrategies/sessionStoreStrategy.ts
var SESSION_STORE_KEY = "_dd_s";

// ../core/src/domain/session/sessionConstants.ts
var SESSION_TIME_OUT_DELAY = 4 * ONE_HOUR;
var SESSION_EXPIRATION_DELAY = 15 * ONE_MINUTE;

// ../core/src/domain/session/sessionState.ts
var SESSION_ENTRY_REGEXP = /^([a-zA-Z]+)=([a-z0-9-]+)$/;
var SESSION_ENTRY_SEPARATOR = "&";
var EXPIRED = "1";
function getExpiredSessionState() {
  return {
    isExpired: EXPIRED
  };
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
  return objectEntries(session).map(([key, value]) => `${key}=${value}`).join(SESSION_ENTRY_SEPARATOR);
}
function toSessionState(sessionString) {
  const session = {};
  if (isValidSessionString(sessionString)) {
    sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
      const matches = SESSION_ENTRY_REGEXP.exec(entry);
      if (matches !== null) {
        const [, key, value] = matches;
        session[key] = value;
      }
    });
  }
  return session;
}
function isValidSessionString(sessionString) {
  return !!sessionString && (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString));
}

// ../core/src/domain/session/oldCookiesMigration.ts
var OLD_SESSION_COOKIE_NAME = "_dd";
var OLD_RUM_COOKIE_NAME = "_dd_r";
var OLD_LOGS_COOKIE_NAME = "_dd_l";
var RUM_SESSION_KEY = "rum";
var LOGS_SESSION_KEY = "logs";
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

// ../core/src/domain/session/storeStrategies/sessionInCookie.ts
function selectCookieStrategy(initConfiguration) {
  const cookieOptions = buildCookieOptions(initConfiguration);
  return areCookiesAuthorized(cookieOptions) ? { type: "Cookie", cookieOptions } : void 0;
}
function initCookieStrategy(cookieOptions) {
  const cookieStore = {
    /**
     * Lock strategy allows mitigating issues due to concurrent access to cookie.
     * This issue concerns only chromium browsers and enabling this on firefox increases cookie write failures.
     */
    isLockEnabled: isChromium(),
    persistSession: persistSessionCookie(cookieOptions),
    retrieveSession: retrieveSessionCookie,
    expireSession: () => expireSessionCookie(cookieOptions)
  };
  tryOldCookiesMigration(cookieStore);
  return cookieStore;
}
function persistSessionCookie(options) {
  return (session) => {
    setCookie(SESSION_STORE_KEY, toSessionString(session), SESSION_EXPIRATION_DELAY, options);
  };
}
function expireSessionCookie(options) {
  setCookie(SESSION_STORE_KEY, toSessionString(getExpiredSessionState()), SESSION_TIME_OUT_DELAY, options);
}
function retrieveSessionCookie() {
  const sessionString = getCookie(SESSION_STORE_KEY);
  return toSessionState(sessionString);
}
function buildCookieOptions(initConfiguration) {
  const cookieOptions = {};
  cookieOptions.secure = !!initConfiguration.useSecureSessionCookie || !!initConfiguration.usePartitionedCrossSiteSessionCookie || !!initConfiguration.useCrossSiteSessionCookie;
  cookieOptions.crossSite = !!initConfiguration.usePartitionedCrossSiteSessionCookie || !!initConfiguration.useCrossSiteSessionCookie;
  cookieOptions.partitioned = !!initConfiguration.usePartitionedCrossSiteSessionCookie;
  if (initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite();
  }
  return cookieOptions;
}

// ../core/src/domain/session/storeStrategies/sessionInLocalStorage.ts
var LOCAL_STORAGE_TEST_KEY = "_dd_test_";
function selectLocalStorageStrategy() {
  try {
    const id = generateUUID();
    const testKey = `${LOCAL_STORAGE_TEST_KEY}${id}`;
    localStorage.setItem(testKey, id);
    const retrievedId = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    return id === retrievedId ? { type: "LocalStorage" } : void 0;
  } catch (e) {
    return void 0;
  }
}
function initLocalStorageStrategy() {
  return {
    isLockEnabled: false,
    persistSession: persistInLocalStorage,
    retrieveSession: retrieveSessionFromLocalStorage,
    expireSession: expireSessionFromLocalStorage
  };
}
function persistInLocalStorage(sessionState) {
  localStorage.setItem(SESSION_STORE_KEY, toSessionString(sessionState));
}
function retrieveSessionFromLocalStorage() {
  const sessionString = localStorage.getItem(SESSION_STORE_KEY);
  return toSessionState(sessionString);
}
function expireSessionFromLocalStorage() {
  persistInLocalStorage(getExpiredSessionState());
}

// ../core/src/domain/session/sessionStoreOperations.ts
var LOCK_RETRY_DELAY = 10;
var LOCK_MAX_TRIES = 100;
var bufferedOperations = [];
var ongoingOperations;
function processSessionStoreOperations(operations, sessionStoreStrategy, numberOfRetries = 0) {
  const { isLockEnabled, persistSession, expireSession } = sessionStoreStrategy;
  const persistWithLock = (session) => persistSession(assign({}, session, { lock: currentLock }));
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
      expireSession();
    } else {
      expandSessionState(processedSession);
      isLockEnabled ? persistWithLock(processedSession) : persistSession(processedSession);
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

// ../core/src/domain/session/sessionStore.ts
var STORAGE_POLL_DELAY = ONE_SECOND;
function selectSessionStoreStrategyType(initConfiguration) {
  let sessionStoreStrategyType = selectCookieStrategy(initConfiguration);
  if (!sessionStoreStrategyType && initConfiguration.allowFallbackToLocalStorage) {
    sessionStoreStrategyType = selectLocalStorageStrategy();
  }
  return sessionStoreStrategyType;
}
function startSessionStore(sessionStoreStrategyType, productKey, computeSessionState) {
  const renewObservable = new Observable();
  const expireObservable = new Observable();
  const sessionStateUpdateObservable = new Observable();
  const sessionStoreStrategy = sessionStoreStrategyType.type === "Cookie" ? initCookieStrategy(sessionStoreStrategyType.cookieOptions) : initLocalStorageStrategy();
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
        process: (sessionState) => isSessionInExpiredState(sessionState) ? getExpiredSessionState() : void 0,
        after: synchronizeSession
      },
      sessionStoreStrategy
    );
  }
  function synchronizeSession(sessionState) {
    if (isSessionInExpiredState(sessionState)) {
      sessionState = getExpiredSessionState();
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
            return getExpiredSessionState();
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
    const { trackingType, isTracked } = computeSessionState(sessionState[productKey]);
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
    sessionCache = getExpiredSessionState();
    expireObservable.notify();
  }
  function renewSessionInCache(sessionState) {
    sessionCache = sessionState;
    renewObservable.notify();
  }
  function updateSessionState(partialSessionState) {
    processSessionStoreOperations(
      {
        process: (sessionState) => assign({}, sessionState, partialSessionState),
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
      expireSession();
      synchronizeSession(getExpiredSessionState());
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId);
    },
    updateSessionState
  };
}

// ../core/src/domain/trackingConsent.ts
var TrackingConsent = {
  GRANTED: "granted",
  NOT_GRANTED: "not-granted"
};
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

// ../core/src/tools/serialisation/jsonStringify.ts
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

// ../core/src/tools/utils/urlPolyfill.ts
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
var originalURL = URL;
var isURLSupported;
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

// ../core/src/domain/configuration/intakeSites.ts
var INTAKE_SITE_STAGING = "datad0g.com";
var INTAKE_SITE_FED_STAGING = "dd0g-gov.com";
var INTAKE_SITE_US1 = "datadoghq.com";
var INTAKE_SITE_EU1 = "datadoghq.eu";
var INTAKE_SITE_US1_FED = "ddog-gov.com";
var PCI_INTAKE_HOST_US1 = "pci.browser-intake-datadoghq.com";

// ../core/src/domain/configuration/endpointBuilder.ts
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
  const tags = [`sdk_version:${"dev"}`, `api:${api}`].concat(configurationTags);
  if (retry) {
    tags.push(`retry_count:${retry.count}`, `retry_after:${retry.lastFailureStatus}`);
  }
  const parameters = [
    "ddsource=browser",
    `ddtags=${encodeURIComponent(tags.join(","))}`,
    `dd-api-key=${clientToken}`,
    `dd-evp-origin-version=${encodeURIComponent("dev")}`,
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

// ../core/src/domain/configuration/tags.ts
var TAG_SIZE_LIMIT = 200;
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
var FORBIDDEN_CHARACTERS = /[^a-z0-9_:./-]/;
function buildTag(key, rawValue) {
  const valueSizeLimit = TAG_SIZE_LIMIT - key.length - 1;
  if (rawValue.length > valueSizeLimit || FORBIDDEN_CHARACTERS.test(rawValue)) {
    display.warn(
      `${key} value doesn't meet tag requirements and will be sanitized. ${MORE_DETAILS} ${DOCS_ORIGIN}/getting_started/tagging/#defining-tags`
    );
  }
  const sanitizedValue = rawValue.replace(/,/g, "_");
  return `${key}:${sanitizedValue}`;
}

// ../core/src/domain/configuration/transportConfiguration.ts
function computeTransportConfiguration(initConfiguration) {
  const site = initConfiguration.site || INTAKE_SITE_US1;
  const tags = buildTags(initConfiguration);
  const endpointBuilders = computeEndpointBuilders(initConfiguration, tags);
  const intakeUrlPrefixes = computeIntakeUrlPrefixes(endpointBuilders, site);
  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, intakeUrlPrefixes, tags);
  return assign(
    {
      isIntakeUrl: (url) => intakeUrlPrefixes.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0),
      replica: replicaConfiguration,
      site
    },
    endpointBuilders
  );
}
function computeEndpointBuilders(initConfiguration, tags) {
  return {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, "logs", tags),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, "rum", tags),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, "replay", tags)
  };
}
function computeReplicaConfiguration(initConfiguration, intakeUrlPrefixes, tags) {
  if (!initConfiguration.replica) {
    return;
  }
  const replicaConfiguration = assign({}, initConfiguration, {
    site: INTAKE_SITE_US1,
    clientToken: initConfiguration.replica.clientToken
  });
  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, "logs", tags),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, "rum", tags)
  };
  intakeUrlPrefixes.push(...objectValues(replicaEndpointBuilders).map((builder) => builder.urlPrefix));
  return assign({ applicationId: initConfiguration.replica.applicationId }, replicaEndpointBuilders);
}
function computeIntakeUrlPrefixes(endpointBuilders, site) {
  const intakeUrlPrefixes = objectValues(endpointBuilders).map((builder) => builder.urlPrefix);
  if (site === INTAKE_SITE_US1) {
    intakeUrlPrefixes.push(`https://${PCI_INTAKE_HOST_US1}/`);
  }
  return intakeUrlPrefixes;
}

// ../core/src/domain/configuration/configuration.ts
var DefaultPrivacyLevel = {
  ALLOW: "allow",
  MASK: "mask",
  MASK_USER_INPUT: "mask-user-input"
};
var TraceContextInjection = {
  ALL: "all",
  SAMPLED: "sampled"
};
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
  return assign(
    {
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
      messageBytesLimit: 256 * ONE_KIBI_BYTE
    },
    computeTransportConfiguration(initConfiguration)
  );
}
function serializeConfiguration(initConfiguration) {
  return {
    session_sample_rate: initConfiguration.sessionSampleRate,
    telemetry_sample_rate: initConfiguration.telemetrySampleRate,
    telemetry_configuration_sample_rate: initConfiguration.telemetryConfigurationSampleRate,
    telemetry_usage_sample_rate: initConfiguration.telemetryUsageSampleRate,
    use_before_send: !!initConfiguration.beforeSend,
    use_cross_site_session_cookie: initConfiguration.useCrossSiteSessionCookie,
    use_partitioned_cross_site_session_cookie: initConfiguration.usePartitionedCrossSiteSessionCookie,
    use_secure_session_cookie: initConfiguration.useSecureSessionCookie,
    use_proxy: !!initConfiguration.proxy,
    silent_multiple_init: initConfiguration.silentMultipleInit,
    track_session_across_subdomains: initConfiguration.trackSessionAcrossSubdomains,
    allow_fallback_to_local_storage: !!initConfiguration.allowFallbackToLocalStorage,
    store_contexts_across_pages: !!initConfiguration.storeContextsAcrossPages,
    allow_untrusted_events: !!initConfiguration.allowUntrustedEvents,
    tracking_consent: initConfiguration.trackingConsent
  };
}

// ../core/src/boot/init.ts
function makePublicApi(stub) {
  const publicApi = assign(
    {
      version: "dev",
      // This API method is intentionally not monitored, since the only thing executed is the
      // user-provided 'callback'.  All SDK usages executed in the callback should be monitored, and
      // we don't want to interfere with the user uncaught exceptions.
      onReady(callback) {
        callback();
      }
    },
    stub
  );
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

// ../core/src/tools/experimentalFeatures.ts
var ExperimentalFeature = /* @__PURE__ */ ((ExperimentalFeature2) => {
  ExperimentalFeature2["WRITABLE_RESOURCE_GRAPHQL"] = "writable_resource_graphql";
  ExperimentalFeature2["CUSTOM_VITALS"] = "custom_vitals";
  ExperimentalFeature2["TOLERANT_RESOURCE_TIMINGS"] = "tolerant_resource_timings";
  ExperimentalFeature2["REMOTE_CONFIGURATION"] = "remote_configuration";
  ExperimentalFeature2["UPDATE_VIEW_NAME"] = "update_view_name";
  ExperimentalFeature2["NULL_INP_TELEMETRY"] = "null_inp_telemetry";
  ExperimentalFeature2["LONG_ANIMATION_FRAME"] = "long_animation_frame";
  return ExperimentalFeature2;
})(ExperimentalFeature || {});
var enabledExperimentalFeatures = /* @__PURE__ */ new Set();
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

// ../core/src/tools/stackTrace/computeStackTrace.ts
var UNKNOWN_FUNCTION = "?";
function computeStackTrace(ex) {
  const stack = [];
  let stackProperty = tryToGetString(ex, "stack");
  const exString = String(ex);
  if (stackProperty && startsWith(stackProperty, exString)) {
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
var fileUrl = "((?:file|https?|blob|chrome-extension|native|eval|webpack|snippet|<anonymous>|\\w+\\.|\\/).*?)";
var filePosition = "(?::(\\d+))";
var CHROME_LINE_RE = new RegExp(`^\\s*at (.*?) ?\\(${fileUrl}${filePosition}?${filePosition}?\\)?\\s*$`, "i");
var CHROME_EVAL_RE = new RegExp(`\\((\\S*)${filePosition}${filePosition}\\)`);
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
var CHROME_ANONYMOUS_FUNCTION_RE = new RegExp(`^\\s*at ?${fileUrl}${filePosition}?${filePosition}??\\s*$`, "i");
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
var WINJS_LINE_RE = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
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
var GECKO_LINE_RE = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|capacitor|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i;
var GECKO_EVAL_RE = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
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
var ERROR_TYPES_RE = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?([\s\S]*)$/;
function tryToParseMessage(messageObj) {
  let name;
  let message;
  if ({}.toString.call(messageObj) === "[object String]") {
    ;
    [, name, message] = ERROR_TYPES_RE.exec(messageObj);
  }
  return { name, message };
}

// ../core/src/tools/stackTrace/handlingStack.ts
function createHandlingStack() {
  const internalFramesToSkip = 2;
  const error = new Error();
  let formattedStack;
  if (!error.stack) {
    try {
      throw error;
    } catch (e) {
      noop();
    }
  }
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

// ../core/src/tools/instrumentMethod.ts
function instrumentMethod(targetPrototype, method, onPreCall, { computeHandlingStack } = {}) {
  let original = targetPrototype[method];
  if (typeof original !== "function") {
    if (method in targetPrototype && startsWith(method, "on")) {
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
    const parameters = arrayFrom(arguments);
    let postCallCallback;
    callMonitored(onPreCall, null, [
      {
        target: this,
        parameters,
        onPostCall: (callback) => {
          postCallCallback = callback;
        },
        handlingStack: computeHandlingStack ? createHandlingStack() : void 0
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

// ../core/src/tools/serialisation/sanitize.ts
var SANITIZE_DEFAULT_MAX_CHARACTER_COUNT = 220 * ONE_KIBI_BYTE;
var JSON_PATH_ROOT_ELEMENT = "$";
var KEY_DECORATION_LENGTH = 3;
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
      return {
        isTrusted: value.isTrusted
      };
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

// ../core/src/domain/error/error.ts
var NO_ERROR_STACK_PRESENT_MESSAGE = "No stack, consider using an instance of Error";
function computeRawError({
  stackTrace,
  originalError,
  handlingStack,
  startClocks,
  nonErrorPrefix,
  source,
  handling
}) {
  const isErrorInstance = originalError instanceof Error;
  const message = computeMessage(stackTrace, isErrorInstance, nonErrorPrefix, originalError);
  const stack = hasUsableStack(isErrorInstance, stackTrace) ? toStackTraceString(stackTrace) : NO_ERROR_STACK_PRESENT_MESSAGE;
  const causes = isErrorInstance ? flattenErrorCauses(originalError, source) : void 0;
  const type = stackTrace ? stackTrace.name : void 0;
  const fingerprint = tryToGetFingerprint(originalError);
  return {
    startClocks,
    source,
    handling,
    handlingStack,
    originalError,
    type,
    message,
    stack,
    causes,
    fingerprint
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
  return originalError instanceof Error && "dd_fingerprint" in originalError ? String(originalError.dd_fingerprint) : void 0;
}
function flattenErrorCauses(error, parentSource) {
  let currentError = error;
  const causes = [];
  while (currentError?.cause instanceof Error && causes.length < 10) {
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

// ../core/src/domain/error/error.types.ts
var ErrorSource = {
  AGENT: "agent",
  CONSOLE: "console",
  CUSTOM: "custom",
  LOGGER: "logger",
  NETWORK: "network",
  SOURCE: "source",
  REPORT: "report"
};

// ../core/src/domain/error/trackRuntimeError.ts
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
    if (errorObj instanceof Error) {
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

// ../core/src/boot/displayAlreadyInitializedError.ts
function displayAlreadyInitializedError(sdkName, initConfiguration) {
  if (!initConfiguration.silentMultipleInit) {
    display.error(`${sdkName} is already initialized.`);
  }
}

// ../core/src/browser/addEventListener.ts
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
  const add = getZoneJsOriginalValue(eventTarget, "addEventListener");
  eventNames.forEach((eventName) => add.call(eventTarget, eventName, listenerWithMonitor, options));
  function stop() {
    const remove = getZoneJsOriginalValue(eventTarget, "removeEventListener");
    eventNames.forEach((eventName) => remove.call(eventTarget, eventName, listenerWithMonitor, options));
  }
  return {
    stop
  };
}

// ../core/src/domain/report/reportObservable.ts
var RawReportType = {
  intervention: "intervention",
  deprecation: "deprecation",
  cspViolation: "csp_violation"
};
function initReportObservable(configuration, apis) {
  const observables = [];
  if (includes(apis, RawReportType.cspViolation)) {
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
    const observer = new window.ReportingObserver(handleReports, {
      types: reportTypes,
      buffered: true
    });
    observer.observe();
    return () => {
      observer.disconnect();
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
  return assign(
    {
      startClocks: clocksNow(),
      source: ErrorSource.REPORT,
      handling: "unhandled" /* UNHANDLED */
    },
    partial
  );
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

// ../core/src/tools/sendToExtension.ts
function sendToExtension(type, payload) {
  const callback = window.__ddBrowserSdkExtensionCallback;
  if (callback) {
    callback({ type, payload });
  }
}

// ../core/src/tools/utils/typeUtils.ts
function getType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

// ../core/src/tools/mergeInto.ts
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

// ../core/src/domain/connectivity/connectivity.ts
function getConnectivity() {
  const navigator2 = window.navigator;
  return {
    status: navigator2.onLine ? "connected" : "not_connected",
    interfaces: navigator2.connection && navigator2.connection.type ? [navigator2.connection.type] : void 0,
    effective_type: navigator2.connection?.effectiveType
  };
}

// ../core/src/tools/utils/arrayUtils.ts
function removeItem(array, item) {
  const index = array.indexOf(item);
  if (index >= 0) {
    array.splice(index, 1);
  }
}

// ../core/src/tools/boundedBuffer.ts
var BUFFER_LIMIT = 500;
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

// ../core/src/domain/telemetry/rawTelemetryEvent.types.ts
var TelemetryType = {
  log: "log",
  configuration: "configuration",
  usage: "usage"
};

// ../core/src/domain/telemetry/telemetry.ts
var ALLOWED_FRAME_URLS = [
  "https://www.datadoghq-browser-agent.com",
  "https://www.datad0g-browser-agent.com",
  "https://d3uc069fcn7uxw.cloudfront.net",
  "https://d20xtzwzcl0ceb.cloudfront.net",
  "http://localhost",
  "<anonymous>"
];
var TELEMETRY_EXCLUDED_SITES = [INTAKE_SITE_US1_FED];
var preStartTelemetryBuffer = createBoundedBuffer();
var onRawTelemetryEventCollected = (event) => {
  preStartTelemetryBuffer.add(() => onRawTelemetryEventCollected(event));
};
function startTelemetry(telemetryService, configuration) {
  let contextProvider;
  const observable = new Observable();
  const alreadySentEvents = /* @__PURE__ */ new Set();
  const telemetryEnabled = !includes(TELEMETRY_EXCLUDED_SITES, configuration.site) && performDraw(configuration.telemetrySampleRate);
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
        version: "dev",
        source: "browser",
        _dd: {
          format_version: 2
        },
        telemetry: combine(event, {
          runtime_env: runtimeEnvInfo2,
          connectivity: getConnectivity()
        }),
        experimental_features: arrayFrom(getExperimentalFeatures())
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
  onRawTelemetryEventCollected(
    assign(
      {
        type: TelemetryType.log,
        message,
        status: "debug" /* debug */
      },
      context
    )
  );
}
function addTelemetryError(e, context) {
  onRawTelemetryEventCollected(
    assign(
      {
        type: TelemetryType.log,
        status: "error" /* error */
      },
      formatError(e),
      context
    )
  );
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
  if (e instanceof Error) {
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
    (frame) => !frame.url || ALLOWED_FRAME_URLS.some((allowedFrameUrl) => startsWith(frame.url, allowedFrameUrl))
  );
  return stackTrace;
}

// ../core/src/tools/valueHistory.ts
var END_OF_TIMES = Infinity;
var CLEAR_OLD_VALUES_INTERVAL = ONE_MINUTE;
function createValueHistory({
  expireDelay,
  maxEntries
}) {
  let entries = [];
  const clearOldValuesInterval = setInterval(() => clearOldValues(), CLEAR_OLD_VALUES_INTERVAL);
  function clearOldValues() {
    const oldTimeThreshold = relativeNow() - expireDelay;
    while (entries.length > 0 && entries[entries.length - 1].endTime < oldTimeThreshold) {
      entries.pop();
    }
  }
  function add(value, startTime) {
    const entry = {
      value,
      startTime,
      endTime: END_OF_TIMES,
      remove: () => {
        removeItem(entries, entry);
      },
      close: (endTime) => {
        entry.endTime = endTime;
      }
    };
    if (maxEntries && entries.length >= maxEntries) {
      entries.pop();
    }
    entries.unshift(entry);
    return entry;
  }
  function find2(startTime = END_OF_TIMES, options = { returnInactive: false }) {
    for (const entry of entries) {
      if (entry.startTime <= startTime) {
        if (options.returnInactive || startTime <= entry.endTime) {
          return entry.value;
        }
        break;
      }
    }
  }
  function closeActive(endTime) {
    const latestEntry = entries[0];
    if (latestEntry && latestEntry.endTime === END_OF_TIMES) {
      latestEntry.close(endTime);
    }
  }
  function findAll(startTime = END_OF_TIMES, duration = 0) {
    const endTime = addDuration(startTime, duration);
    return entries.filter((entry) => entry.startTime <= endTime && startTime <= entry.endTime).map((entry) => entry.value);
  }
  function reset() {
    entries = [];
  }
  function stop() {
    clearInterval(clearOldValuesInterval);
  }
  return { add, find: find2, closeActive, findAll, reset, stop };
}

// ../core/src/domain/session/sessionManager.ts
var VISIBILITY_CHECK_DELAY = ONE_MINUTE;
var SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY;
var stopCallbacks = [];
function startSessionManager(configuration, productKey, computeSessionState, trackingConsentState) {
  const renewObservable = new Observable();
  const expireObservable = new Observable();
  const sessionStore = startSessionStore(configuration.sessionStoreStrategyType, productKey, computeSessionState);
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
      isReplayForced: !!sessionStore.getSession().forcedReplay
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

// ../core/src/tools/utils/responseUtils.ts
function isServerError(status) {
  return status >= 500;
}
function tryToClone(response) {
  try {
    return response.clone();
  } catch (e) {
    return;
  }
}

// ../core/src/transport/sendWithRetryStrategy.ts
var MAX_ONGOING_BYTES_COUNT = 80 * ONE_KIBI_BYTE;
var MAX_ONGOING_REQUESTS = 32;
var MAX_QUEUE_BYTES_COUNT = 3 * ONE_MEBI_BYTE;
var MAX_BACKOFF_TIME = ONE_MINUTE;
var INITIAL_BACKOFF_TIME = ONE_SECOND;
function sendWithRetryStrategy(payload, state, sendStrategy, trackType, reportError) {
  if (state.transportStatus === 0 /* UP */ && state.queuedPayloads.size() === 0 && state.bandwidthMonitor.canHandle(payload)) {
    send(payload, state, sendStrategy, {
      onSuccess: () => retryQueuedPayloads(0 /* AFTER_SUCCESS */, state, sendStrategy, trackType, reportError),
      onFailure: () => {
        state.queuedPayloads.enqueue(payload);
        scheduleRetry(state, sendStrategy, trackType, reportError);
      }
    });
  } else {
    state.queuedPayloads.enqueue(payload);
  }
}
function scheduleRetry(state, sendStrategy, trackType, reportError) {
  if (state.transportStatus !== 2 /* DOWN */) {
    return;
  }
  setTimeout(() => {
    const payload = state.queuedPayloads.first();
    send(payload, state, sendStrategy, {
      onSuccess: () => {
        state.queuedPayloads.dequeue();
        state.currentBackoffTime = INITIAL_BACKOFF_TIME;
        retryQueuedPayloads(1 /* AFTER_RESUME */, state, sendStrategy, trackType, reportError);
      },
      onFailure: () => {
        state.currentBackoffTime = Math.min(MAX_BACKOFF_TIME, state.currentBackoffTime * 2);
        scheduleRetry(state, sendStrategy, trackType, reportError);
      }
    });
  }, state.currentBackoffTime);
}
function send(payload, state, sendStrategy, { onSuccess, onFailure }) {
  state.bandwidthMonitor.add(payload);
  sendStrategy(payload, (response) => {
    state.bandwidthMonitor.remove(payload);
    if (!shouldRetryRequest(response)) {
      state.transportStatus = 0 /* UP */;
      onSuccess();
    } else {
      state.transportStatus = state.bandwidthMonitor.ongoingRequestCount > 0 ? 1 /* FAILURE_DETECTED */ : 2 /* DOWN */;
      payload.retry = {
        count: payload.retry ? payload.retry.count + 1 : 1,
        lastFailureStatus: response.status
      };
      onFailure();
    }
  });
}
function retryQueuedPayloads(reason, state, sendStrategy, trackType, reportError) {
  if (reason === 0 /* AFTER_SUCCESS */ && state.queuedPayloads.isFull() && !state.queueFullReported) {
    reportError({
      message: `Reached max ${trackType} events size queued for upload: ${MAX_QUEUE_BYTES_COUNT / ONE_MEBI_BYTE}MiB`,
      source: ErrorSource.AGENT,
      startClocks: clocksNow()
    });
    state.queueFullReported = true;
  }
  const previousQueue = state.queuedPayloads;
  state.queuedPayloads = newPayloadQueue();
  while (previousQueue.size() > 0) {
    sendWithRetryStrategy(previousQueue.dequeue(), state, sendStrategy, trackType, reportError);
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

// ../core/src/transport/httpRequest.ts
function createHttpRequest(configuration, endpointBuilder, bytesLimit, reportError) {
  const retryState = newRetryState();
  const sendStrategyForRetry = (payload, onResponse) => fetchKeepAliveStrategy(configuration, endpointBuilder, bytesLimit, payload, onResponse);
  return {
    send: (payload) => {
      sendWithRetryStrategy(payload, retryState, sendStrategyForRetry, endpointBuilder.trackType, reportError);
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit
     */
    sendOnExit: (payload) => {
      sendBeaconStrategy(configuration, endpointBuilder, bytesLimit, payload);
    }
  };
}
function sendBeaconStrategy(configuration, endpointBuilder, bytesLimit, payload) {
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
  sendXHR(configuration, xhrUrl, payload.data);
}
var hasReportedBeaconError = false;
function reportBeaconError(e) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true;
    addTelemetryError(e);
  }
}
function fetchKeepAliveStrategy(configuration, endpointBuilder, bytesLimit, payload, onResponse) {
  const canUseKeepAlive = isKeepAliveSupported() && payload.bytesCount < bytesLimit;
  if (canUseKeepAlive) {
    const fetchUrl = endpointBuilder.build("fetch", payload);
    fetch(fetchUrl, { method: "POST", body: payload.data, keepalive: true, mode: "cors" }).then(
      monitor((response) => onResponse?.({ status: response.status, type: response.type })),
      monitor(() => {
        const xhrUrl = endpointBuilder.build("xhr", payload);
        sendXHR(configuration, xhrUrl, payload.data, onResponse);
      })
    );
  } else {
    const xhrUrl = endpointBuilder.build("xhr", payload);
    sendXHR(configuration, xhrUrl, payload.data, onResponse);
  }
}
function isKeepAliveSupported() {
  try {
    return window.Request && "keepalive" in new Request("http://a");
  } catch {
    return false;
  }
}
function sendXHR(configuration, url, data, onResponse) {
  const request = new XMLHttpRequest();
  request.open("POST", url, true);
  if (data instanceof Blob) {
    request.setRequestHeader("Content-Type", data.type);
  }
  addEventListener(
    configuration,
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

// ../core/src/transport/eventBridge.ts
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
  return !!bridge && includes(bridge.getCapabilities(), capability);
}
function canUseEventBridge(currentHost = getGlobalObject().location?.hostname) {
  const bridge = getEventBridge();
  return !!bridge && bridge.getAllowedWebViewHosts().some((allowedHost) => currentHost === allowedHost || endsWith(currentHost, `.${allowedHost}`));
}
function getEventBridgeGlobal() {
  return getGlobalObject().DatadogEventBridge;
}

// ../core/src/browser/pageExitObservable.ts
var PageExitReason = {
  HIDDEN: "visibility_hidden",
  UNLOADING: "before_unload",
  PAGEHIDE: "page_hide",
  FROZEN: "page_frozen"
};
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
  return includes(objectValues(PageExitReason), reason);
}

// ../core/src/transport/batch.ts
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

// ../core/src/transport/flushController.ts
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

// ../core/src/transport/startBatchWithReplica.ts
function startBatchWithReplica(configuration, primary, replica, reportError, pageExitObservable, sessionExpireObservable, batchFactoryImp = createBatch) {
  const primaryBatch = createBatchFromConfig(configuration, primary);
  const replicaBatch = replica && createBatchFromConfig(configuration, replica);
  function createBatchFromConfig(configuration2, { endpoint, encoder }) {
    return batchFactoryImp({
      encoder,
      request: createHttpRequest(configuration2, endpoint, configuration2.batchBytesLimit, reportError),
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

// ../core/src/tools/encoder.ts
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

// ../core/src/tools/abstractLifeCycle.ts
var AbstractLifeCycle = class {
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

// ../core/src/domain/eventRateLimiter/createEventRateLimiter.ts
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

// ../core/src/browser/runOnReadyState.ts
function runOnReadyState(configuration, expectedReadyState, callback) {
  if (document.readyState === expectedReadyState || document.readyState === "complete") {
    callback();
  } else {
    const eventName = expectedReadyState === "complete" ? "load" /* LOAD */ : "DOMContentLoaded" /* DOM_CONTENT_LOADED */;
    addEventListener(configuration, window, eventName, callback, { once: true });
  }
}

// ../core/src/browser/xhrObservable.ts
var xhrObservable;
var xhrContexts = /* @__PURE__ */ new WeakMap();
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

// ../core/src/browser/fetchObservable.ts
var fetchObservable;
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
    assign(context, partialContext);
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

// ../core/src/domain/console/consoleObservable.ts
var consoleObservablesByApi = {};
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
      const handlingStack = createHandlingStack();
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
    const firstErrorParam = find(params, (param) => param instanceof Error);
    error = {
      stack: firstErrorParam ? toStackTraceString(computeStackTrace(firstErrorParam)) : void 0,
      fingerprint: tryToGetFingerprint(firstErrorParam),
      causes: firstErrorParam ? flattenErrorCauses(firstErrorParam, "console") : void 0,
      startClocks: clocksNow(),
      message,
      source: ErrorSource.CONSOLE,
      handling: "handled" /* HANDLED */,
      handlingStack
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
  if (param instanceof Error) {
    return formatErrorMessage(computeStackTrace(param));
  }
  return jsonStringify(sanitize(param), void 0, 2);
}

// ../core/src/domain/context/contextManager.ts
function createContextManager(customerDataTracker) {
  let context = {};
  const changeObservable = new Observable();
  const contextManager = {
    getContext: () => deepClone(context),
    setContext: (newContext) => {
      if (getType(newContext) === "object") {
        context = sanitize(newContext);
        customerDataTracker.updateCustomerData(context);
      } else {
        contextManager.clearContext();
      }
      changeObservable.notify();
    },
    setContextProperty: (key, property) => {
      context[key] = sanitize(property);
      customerDataTracker.updateCustomerData(context);
      changeObservable.notify();
    },
    removeContextProperty: (key) => {
      delete context[key];
      customerDataTracker.updateCustomerData(context);
      changeObservable.notify();
    },
    clearContext: () => {
      context = {};
      customerDataTracker.resetCustomerData();
      changeObservable.notify();
    },
    changeObservable
  };
  return contextManager;
}

// ../core/src/domain/context/storeContextManager.ts
var CONTEXT_STORE_KEY_PREFIX = "_dd_c";
var storageListeners = [];
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

// ../core/src/domain/context/customerDataTracker.ts
var CUSTOMER_DATA_BYTES_LIMIT = 3 * ONE_KIBI_BYTE;
var CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT = 16 * ONE_KIBI_BYTE;
var BYTES_COMPUTATION_THROTTLING_DELAY = 200;
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

// ../core/src/tools/readBytesFromStream.ts
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

// ../core/src/domain/synthetics/syntheticsWorkerValues.ts
var SYNTHETICS_TEST_ID_COOKIE_NAME = "datadog-synthetics-public-id";
var SYNTHETICS_RESULT_ID_COOKIE_NAME = "datadog-synthetics-result-id";
var SYNTHETICS_INJECTS_RUM_COOKIE_NAME = "datadog-synthetics-injects-rum";
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

// ../core/src/domain/user/user.ts
function sanitizeUser(newUser) {
  const user = assign({}, newUser);
  const keys = ["id", "name", "email"];
  keys.forEach((key) => {
    if (key in user) {
      user[key] = String(user[key]);
    }
  });
  return user;
}
function checkUser(newUser) {
  const isValid = getType(newUser) === "object";
  if (!isValid) {
    display.error("Unsupported user:", newUser);
  }
  return isValid;
}

// ../core/src/tools/matchOption.ts
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
        return useStartsWith ? startsWith(value, item) : item === value;
      }
    } catch (e) {
      display.error(e);
    }
    return false;
  });
}

// ../rum-core/src/domain/lifeCycle.ts
var LifeCycle = AbstractLifeCycle;

// ../rum-core/src/domain/resource/resourceUtils.ts
var FAKE_INITIAL_DOCUMENT = "initial_document";
var RESOURCE_TYPES = [
  ["document" /* DOCUMENT */, (initiatorType) => FAKE_INITIAL_DOCUMENT === initiatorType],
  ["xhr" /* XHR */, (initiatorType) => "xmlhttprequest" === initiatorType],
  ["fetch" /* FETCH */, (initiatorType) => "fetch" === initiatorType],
  ["beacon" /* BEACON */, (initiatorType) => "beacon" === initiatorType],
  ["css" /* CSS */, (_, path) => /\.css$/i.test(path)],
  ["js" /* JS */, (_, path) => /\.js$/i.test(path)],
  [
    "image" /* IMAGE */,
    (initiatorType, path) => includes(["image", "img", "icon"], initiatorType) || /\.(gif|jpg|jpeg|tiff|png|svg|ico)$/i.exec(path) !== null
  ],
  ["font" /* FONT */, (_, path) => /\.(woff|eot|woff2|ttf)$/i.exec(path) !== null],
  [
    "media" /* MEDIA */,
    (initiatorType, path) => includes(["audio", "video"], initiatorType) || /\.(mp3|mp4)$/i.exec(path) !== null
  ]
];
function computeResourceKind(timing) {
  const url = timing.name;
  if (!isValidUrl(url)) {
    addTelemetryDebug(`Failed to construct URL for "${timing.name}"`);
    return "other" /* OTHER */;
  }
  const path = getPathName(url);
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(timing.initiatorType, path)) {
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
function isRequestKind(timing) {
  return timing.initiatorType === "xmlhttprequest" || timing.initiatorType === "fetch";
}
function computePerformanceResourceDuration(entry) {
  const { duration, startTime, responseEnd } = entry;
  if (duration === 0 && startTime < responseEnd) {
    return toServerDuration(elapsed(startTime, responseEnd));
  }
  return toServerDuration(duration);
}
function computePerformanceResourceDetails(entry) {
  if (!isValidEntry(entry)) {
    return void 0;
  }
  const {
    startTime,
    fetchStart,
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
function isValidEntry(entry) {
  if (isExperimentalFeatureEnabled("tolerant_resource_timings" /* TOLERANT_RESOURCE_TIMINGS */)) {
    return true;
  }
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
function computeSize(entry) {
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
function isAllowedRequestUrl(configuration, url) {
  return url && !configuration.isIntakeUrl(url);
}
var DATA_URL_REGEX = /data:(.+)?(;base64)?,/g;
var MAX_ATTRIBUTE_VALUE_CHAR_LENGTH = 24e3;
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

// ../rum-core/src/browser/performanceObservable.ts
var RumPerformanceEntryType = /* @__PURE__ */ ((RumPerformanceEntryType2) => {
  RumPerformanceEntryType2["EVENT"] = "event";
  RumPerformanceEntryType2["FIRST_INPUT"] = "first-input";
  RumPerformanceEntryType2["LARGEST_CONTENTFUL_PAINT"] = "largest-contentful-paint";
  RumPerformanceEntryType2["LAYOUT_SHIFT"] = "layout-shift";
  RumPerformanceEntryType2["LONG_TASK"] = "longtask";
  RumPerformanceEntryType2["LONG_ANIMATION_FRAME"] = "long-animation-frame";
  RumPerformanceEntryType2["NAVIGATION"] = "navigation";
  RumPerformanceEntryType2["PAINT"] = "paint";
  RumPerformanceEntryType2["RESOURCE"] = "resource";
  return RumPerformanceEntryType2;
})(RumPerformanceEntryType || {});
function createPerformanceObservable(configuration, options) {
  return new Observable((observable) => {
    if (!window.PerformanceObserver) {
      return;
    }
    const handlePerformanceEntries = (entries) => {
      const rumPerformanceEntries = filterRumPerformanceEntries(
        configuration,
        entries
      );
      if (rumPerformanceEntries.length > 0) {
        observable.notify(rumPerformanceEntries);
      }
    };
    let timeoutId;
    let isObserverInitializing = true;
    const observer = new PerformanceObserver(
      monitor((entries) => {
        if (isObserverInitializing) {
          timeoutId = setTimeout(() => handlePerformanceEntries(entries.getEntries()));
        } else {
          handlePerformanceEntries(entries.getEntries());
        }
      })
    );
    try {
      observer.observe(options);
    } catch {
      const fallbackSupportedEntryTypes = [
        "resource" /* RESOURCE */,
        "navigation" /* NAVIGATION */,
        "longtask" /* LONG_TASK */,
        "paint" /* PAINT */
      ];
      if (includes(fallbackSupportedEntryTypes, options.type)) {
        if (options.buffered) {
          timeoutId = setTimeout(() => handlePerformanceEntries(performance.getEntriesByType(options.type)));
        }
        try {
          observer.observe({ entryTypes: [options.type] });
        } catch {
          return;
        }
      }
    }
    isObserverInitializing = false;
    manageResourceTimingBufferFull(configuration);
    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  });
}
var resourceTimingBufferFullListener;
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
function filterRumPerformanceEntries(configuration, entries) {
  return entries.filter((entry) => !isForbiddenResource(configuration, entry));
}
function isForbiddenResource(configuration, entry) {
  return entry.entryType === "resource" /* RESOURCE */ && !isAllowedRequestUrl(configuration, entry.name);
}

export {
  ConsoleApiName,
  display,
  DOCS_ORIGIN,
  performDraw,
  round,
  isNumber,
  ONE_SECOND,
  ONE_MINUTE,
  relativeToClocks,
  timeStampToClocks,
  currentDrift,
  toServerDuration,
  dateNow,
  timeStampNow,
  relativeNow,
  clocksNow,
  clocksOrigin,
  elapsed,
  addDuration,
  getRelativeTime,
  looksLikeRelativeTime,
  concatBuffers,
  includes,
  arrayFrom,
  find,
  findLast,
  forEach,
  objectEntries,
  startsWith,
  assign,
  shallowClone,
  objectHasValue,
  isEmptyObject,
  mapValues,
  getGlobalObject,
  getZoneJsOriginalValue,
  monitor,
  callMonitored,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Observable,
  throttle,
  noop,
  generateUUID,
  findCommaSeparatedValue,
  safeTruncate,
  isIE,
  isSafari,
  getInitCookie,
  SESSION_TIME_OUT_DELAY,
  createTrackingConsentState,
  buildUrl,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1,
  INTAKE_SITE_EU1,
  DefaultPrivacyLevel,
  TraceContextInjection,
  isSampleRate,
  validateAndBuildConfiguration,
  serializeConfiguration,
  initFeatureFlags,
  isExperimentalFeatureEnabled,
  computeStackTrace,
  createHandlingStack,
  instrumentMethod,
  instrumentSetter,
  sanitize,
  computeRawError,
  ErrorSource,
  trackRuntimeError,
  makePublicApi,
  defineGlobal,
  displayAlreadyInitializedError,
  addEventListener,
  addEventListeners,
  RawReportType,
  initReportObservable,
  sendToExtension,
  getType,
  deepClone,
  combine,
  getConnectivity,
  createBoundedBuffer,
  startTelemetry,
  drainPreStartTelemetry,
  isTelemetryReplicationAllowed,
  addTelemetryDebug,
  addTelemetryError,
  addTelemetryConfiguration,
  addTelemetryUsage,
  createValueHistory,
  startSessionManager,
  tryToClone,
  createHttpRequest,
  getEventBridge,
  bridgeSupports,
  canUseEventBridge,
  PageExitReason,
  createPageExitObservable,
  isPageExitReason,
  startBatchWithReplica,
  createIdentityEncoder,
  createEventRateLimiter,
  runOnReadyState,
  initXhrObservable,
  initFetchObservable,
  initConsoleObservable,
  createContextManager,
  storeContextManager,
  createCustomerDataTrackerManager,
  readBytesFromStream,
  willSyntheticsInjectRum,
  getSyntheticsTestId,
  getSyntheticsResultId,
  sanitizeUser,
  checkUser,
  isMatchOption,
  matchList,
  LifeCycle,
  FAKE_INITIAL_DOCUMENT,
  computeResourceKind,
  isRequestKind,
  computePerformanceResourceDuration,
  computePerformanceResourceDetails,
  isValidEntry,
  computeSize,
  isAllowedRequestUrl,
  isLongDataUrl,
  sanitizeDataUrl,
  RumPerformanceEntryType,
  createPerformanceObservable,
  supportPerformanceTimingEvent
};
