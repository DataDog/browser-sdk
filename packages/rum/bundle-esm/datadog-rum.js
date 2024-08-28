import {
  ConsoleApiName,
  DOCS_ORIGIN,
  DefaultPrivacyLevel,
  ErrorSource,
  FAKE_INITIAL_DOCUMENT,
  INTAKE_SITE_EU1,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1,
  LifeCycle,
  ONE_MINUTE,
  ONE_SECOND,
  Observable,
  PageExitReason,
  RawReportType,
  RumPerformanceEntryType,
  SESSION_TIME_OUT_DELAY,
  TraceContextInjection,
  addDuration,
  addEventListener,
  addEventListeners,
  addTelemetryConfiguration,
  addTelemetryDebug,
  addTelemetryError,
  addTelemetryUsage,
  arrayFrom,
  assign,
  bridgeSupports,
  buildUrl,
  callMonitored,
  canUseEventBridge,
  checkUser,
  clearInterval,
  clearTimeout,
  clocksNow,
  clocksOrigin,
  combine,
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeRawError,
  computeResourceKind,
  computeSize,
  computeStackTrace,
  concatBuffers,
  createBoundedBuffer,
  createContextManager,
  createCustomerDataTrackerManager,
  createEventRateLimiter,
  createHandlingStack,
  createHttpRequest,
  createIdentityEncoder,
  createPageExitObservable,
  createPerformanceObservable,
  createTrackingConsentState,
  createValueHistory,
  currentDrift,
  dateNow,
  deepClone,
  defineGlobal,
  display,
  displayAlreadyInitializedError,
  drainPreStartTelemetry,
  elapsed,
  find,
  findCommaSeparatedValue,
  findLast,
  forEach,
  generateUUID,
  getConnectivity,
  getEventBridge,
  getGlobalObject,
  getInitCookie,
  getRelativeTime,
  getSyntheticsResultId,
  getSyntheticsTestId,
  getType,
  getZoneJsOriginalValue,
  includes,
  initConsoleObservable,
  initFeatureFlags,
  initFetchObservable,
  initReportObservable,
  initXhrObservable,
  instrumentMethod,
  instrumentSetter,
  isAllowedRequestUrl,
  isEmptyObject,
  isExperimentalFeatureEnabled,
  isIE,
  isLongDataUrl,
  isMatchOption,
  isNumber,
  isPageExitReason,
  isRequestKind,
  isSafari,
  isSampleRate,
  isTelemetryReplicationAllowed,
  isValidEntry,
  looksLikeRelativeTime,
  makePublicApi,
  mapValues,
  matchList,
  monitor,
  noop,
  objectEntries,
  objectHasValue,
  performDraw,
  readBytesFromStream,
  relativeNow,
  relativeToClocks,
  round,
  runOnReadyState,
  safeTruncate,
  sanitize,
  sanitizeDataUrl,
  sanitizeUser,
  sendToExtension,
  serializeConfiguration,
  setInterval,
  setTimeout,
  shallowClone,
  startBatchWithReplica,
  startSessionManager,
  startTelemetry,
  startsWith,
  storeContextManager,
  supportPerformanceTimingEvent,
  throttle,
  timeStampNow,
  timeStampToClocks,
  toServerDuration,
  trackRuntimeError,
  tryToClone,
  validateAndBuildConfiguration,
  willSyntheticsInjectRum
} from "./chunk-HOS4BT2D.js";

// ../rum-core/src/domain/contexts/commonContext.ts
function buildCommonContext(globalContextManager, userContextManager, recorderApi2) {
  return {
    context: globalContextManager.getContext(),
    user: userContextManager.getContext(),
    hasReplay: recorderApi2.isRecording() ? true : void 0
  };
}

// ../rum-core/src/domain/tracing/tracer.ts
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
  if (!isTracingSupported() || !sessionManager.findTrackedSession()) {
    return;
  }
  const tracingOption = find(
    configuration.allowedTracingUrls,
    (tracingOption2) => matchList([tracingOption2.match], context.url, true)
  );
  if (!tracingOption) {
    return;
  }
  context.traceSampled = !isNumber(configuration.traceSampleRate) || performDraw(configuration.traceSampleRate);
  if (!context.traceSampled && configuration.traceContextInjection !== TraceContextInjection.ALL) {
    return;
  }
  context.traceId = createTraceIdentifier();
  context.spanId = createTraceIdentifier();
  inject(makeTracingHeaders(context.traceId, context.spanId, context.traceSampled, tracingOption.propagatorTypes));
}
function isTracingSupported() {
  return getCrypto() !== void 0;
}
function getCrypto() {
  return window.crypto || window.msCrypto;
}
function makeTracingHeaders(traceId, spanId, traceSampled, propagatorTypes) {
  const tracingHeaders = {};
  propagatorTypes.forEach((propagatorType) => {
    switch (propagatorType) {
      case "datadog": {
        assign(tracingHeaders, {
          "x-datadog-origin": "rum",
          "x-datadog-parent-id": spanId.toDecimalString(),
          "x-datadog-sampling-priority": traceSampled ? "1" : "0",
          "x-datadog-trace-id": traceId.toDecimalString()
        });
        break;
      }
      // https://www.w3.org/TR/trace-context/
      case "tracecontext": {
        assign(tracingHeaders, {
          traceparent: `00-0000000000000000${traceId.toPaddedHexadecimalString()}-${spanId.toPaddedHexadecimalString()}-0${traceSampled ? "1" : "0"}`
        });
        break;
      }
      // https://github.com/openzipkin/b3-propagation
      case "b3": {
        assign(tracingHeaders, {
          b3: `${traceId.toPaddedHexadecimalString()}-${spanId.toPaddedHexadecimalString()}-${traceSampled ? "1" : "0"}`
        });
        break;
      }
      case "b3multi": {
        assign(tracingHeaders, {
          "X-B3-TraceId": traceId.toPaddedHexadecimalString(),
          "X-B3-SpanId": spanId.toPaddedHexadecimalString(),
          "X-B3-Sampled": traceSampled ? "1" : "0"
        });
        break;
      }
    }
  });
  return tracingHeaders;
}
function createTraceIdentifier() {
  const buffer = new Uint8Array(8);
  getCrypto().getRandomValues(buffer);
  buffer[0] = buffer[0] & 127;
  function readInt32(offset) {
    return buffer[offset] * 16777216 + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + buffer[offset + 3];
  }
  function toString(radix) {
    let high = readInt32(0);
    let low = readInt32(4);
    let str = "";
    do {
      const mod = high % radix * 4294967296 + low;
      high = Math.floor(high / radix);
      low = Math.floor(mod / radix);
      str = (mod % radix).toString(radix) + str;
    } while (high || low);
    return str;
  }
  function toDecimalString() {
    return toString(10);
  }
  function toPaddedHexadecimalString() {
    const traceId = toString(16);
    return Array(17 - traceId.length).join("0") + traceId;
  }
  return {
    toDecimalString,
    toPaddedHexadecimalString
  };
}

// ../rum-core/src/domain/configuration/configuration.ts
var DEFAULT_PROPAGATOR_TYPES = ["tracecontext", "datadog"];
function validateAndBuildRumConfiguration(initConfiguration) {
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
  return assign(
    {
      applicationId: initConfiguration.applicationId,
      version: initConfiguration.version || void 0,
      actionNameAttribute: initConfiguration.actionNameAttribute,
      sessionReplaySampleRate: initConfiguration.sessionReplaySampleRate ?? 0,
      startSessionReplayRecordingManually: !!initConfiguration.startSessionReplayRecordingManually,
      traceSampleRate: initConfiguration.traceSampleRate,
      allowedTracingUrls,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
      workerUrl: initConfiguration.workerUrl,
      compressIntakeRequests: !!initConfiguration.compressIntakeRequests,
      trackUserInteractions: !!initConfiguration.trackUserInteractions,
      trackViewsManually: !!initConfiguration.trackViewsManually,
      trackResources: !!initConfiguration.trackResources,
      trackLongTasks: !!initConfiguration.trackLongTasks,
      subdomain: initConfiguration.subdomain,
      defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel) ? initConfiguration.defaultPrivacyLevel : DefaultPrivacyLevel.MASK,
      enablePrivacyForActionName: !!initConfiguration.enablePrivacyForActionName,
      customerDataTelemetrySampleRate: 1,
      traceContextInjection: objectHasValue(TraceContextInjection, initConfiguration.traceContextInjection) ? initConfiguration.traceContextInjection : TraceContextInjection.ALL,
      plugins: initConfiguration.betaPlugins || []
    },
    baseConfiguration
  );
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
  return arrayFrom(usedTracingPropagators);
}
function serializeRumConfiguration(configuration) {
  const baseSerializedConfiguration = serializeConfiguration(configuration);
  return assign(
    {
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
      plugins: configuration.betaPlugins?.map(
        (plugin) => assign({ name: plugin.name }, plugin.getConfigurationTelemetry?.())
      )
    },
    baseSerializedConfiguration
  );
}

// ../rum-core/src/domain/configuration/remoteConfiguration.ts
var REMOTE_CONFIGURATION_URL = "https://d3uc069fcn7uxw.cloudfront.net/configuration";
function fetchAndApplyRemoteConfiguration(initConfiguration, callback) {
  fetchRemoteConfiguration(initConfiguration, (remoteInitConfiguration) => {
    callback(applyRemoteConfiguration(initConfiguration, remoteInitConfiguration));
  });
}
function applyRemoteConfiguration(initConfiguration, remoteInitConfiguration) {
  return assign({}, initConfiguration, remoteInitConfiguration);
}
function fetchRemoteConfiguration(configuration, callback) {
  const xhr = new XMLHttpRequest();
  addEventListener(configuration, xhr, "load", function() {
    if (xhr.status === 200) {
      callback(JSON.parse(xhr.responseText));
    } else {
      displayRemoteConfigurationFetchingError();
    }
  });
  addEventListener(configuration, xhr, "error", function() {
    displayRemoteConfigurationFetchingError();
  });
  xhr.open("GET", `${REMOTE_CONFIGURATION_URL}/${encodeURIComponent(configuration.remoteConfigurationId)}.json`);
  xhr.send();
}
function displayRemoteConfigurationFetchingError() {
  display.error("Error fetching the remote configuration.");
}

// ../rum-core/src/domain/contexts/pageStateHistory.ts
var MAX_PAGE_STATE_ENTRIES = 4e3;
var MAX_PAGE_STATE_ENTRIES_SELECTABLE = 500;
var PAGE_STATE_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
function startPageStateHistory(configuration, maxPageStateEntriesSelectable = MAX_PAGE_STATE_ENTRIES_SELECTABLE) {
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
  const pageStateHistory = {
    findAll: (eventStartTime, duration) => {
      const pageStateEntries = pageStateEntryHistory.findAll(eventStartTime, duration);
      if (pageStateEntries.length === 0) {
        return;
      }
      const pageStateServerEntries = [];
      const limit = Math.max(0, pageStateEntries.length - maxPageStateEntriesSelectable);
      for (let index = pageStateEntries.length - 1; index >= limit; index--) {
        const pageState = pageStateEntries[index];
        const relativeStartTime = elapsed(eventStartTime, pageState.startTime);
        pageStateServerEntries.push({
          state: pageState.state,
          start: toServerDuration(relativeStartTime)
        });
      }
      return pageStateServerEntries;
    },
    wasInPageStateAt: (state2, startTime) => pageStateHistory.wasInPageStateDuringPeriod(state2, startTime, 0),
    wasInPageStateDuringPeriod: (state2, startTime, duration) => pageStateEntryHistory.findAll(startTime, duration).some((pageState) => pageState.state === state2),
    addPageState,
    stop: () => {
      stopEventListeners();
      pageStateEntryHistory.stop();
    }
  };
  return pageStateHistory;
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

// ../rum-core/src/domain/vital/vitalCollection.ts
function startVitalCollection(lifeCycle, pageStateHistory) {
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
    startDurationVital: (startVital) => createVitalInstance((vital) => {
      addDurationVital(vital);
    }, startVital)
  };
}
function createVitalInstance(stopCallback, vitalStart) {
  const startClocks = clocksNow();
  let stopClocks;
  return {
    stop: (vitalStop) => {
      if (stopClocks) {
        return;
      }
      stopClocks = clocksNow();
      stopCallback(buildDurationVital(vitalStart, startClocks, vitalStop, stopClocks));
    }
  };
}
function buildDurationVital(vitalStart, startClocks, vitalStop = {}, stopClocks) {
  return {
    name: vitalStart.name,
    type: "duration" /* DURATION */,
    startClocks,
    duration: elapsed(startClocks.timeStamp, stopClocks.timeStamp),
    context: combine(vitalStart.context, vitalStop.context),
    details: vitalStop.details ?? vitalStart.details
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
      details: vital.details
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
    customerContext: vital.context,
    domainContext: {}
  };
}

// ../rum-core/src/domain/plugins.ts
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

// ../rum-core/src/boot/preStartRum.ts
function createPreStartStrategy({ ignoreInitIfSyntheticsWillInjectRum, startDeflateWorker: startDeflateWorker2 }, getCommonContext, trackingConsentState, doStartRum) {
  const bufferApiCalls = createBoundedBuffer();
  let firstStartViewCall;
  let deflateWorker;
  let cachedInitConfiguration;
  let cachedConfiguration;
  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartRum);
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
  return {
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
      callPluginsMethod(initConfiguration.betaPlugins, "onInit", { initConfiguration, publicApi });
      if (initConfiguration.remoteConfigurationId && isExperimentalFeatureEnabled("remote_configuration" /* REMOTE_CONFIGURATION */)) {
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
    updateViewName(name) {
      bufferApiCalls.add((startRumResult) => startRumResult.updateViewName(name));
    },
    addAction(action, commonContext = getCommonContext()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addAction(action, commonContext));
    },
    addError(providedError, commonContext = getCommonContext()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addError(providedError, commonContext));
    },
    addFeatureFlagEvaluation(key, value) {
      bufferApiCalls.add((startRumResult) => startRumResult.addFeatureFlagEvaluation(key, value));
    },
    startDurationVital(vitalStart) {
      return createVitalInstance((vital) => addDurationVital(vital), vitalStart);
    },
    addDurationVital
  };
}
function overrideInitConfigurationForBridge(initConfiguration) {
  return assign({}, initConfiguration, {
    applicationId: "00000000-aaaa-0000-aaaa-000000000000",
    clientToken: "empty",
    sessionSampleRate: 100,
    defaultPrivacyLevel: initConfiguration.defaultPrivacyLevel ?? getEventBridge()?.getPrivacyLevel()
  });
}

// ../rum-core/src/boot/rumPublicApi.ts
var RUM_STORAGE_KEY = "rum";
function makeRumPublicApi(startRumImpl, recorderApi2, options = {}) {
  const customerDataTrackerManager = createCustomerDataTrackerManager(0 /* Unknown */);
  const globalContextManager = createContextManager(
    customerDataTrackerManager.getOrCreateTracker(2 /* GlobalContext */)
  );
  const userContextManager = createContextManager(customerDataTrackerManager.getOrCreateTracker(1 /* User */));
  const trackingConsentState = createTrackingConsentState();
  function getCommonContext() {
    return buildCommonContext(globalContextManager, userContextManager, recorderApi2);
  }
  let strategy = createPreStartStrategy(
    options,
    getCommonContext,
    trackingConsentState,
    (configuration, deflateWorker, initialViewOptions) => {
      if (isExperimentalFeatureEnabled("custom_vitals" /* CUSTOM_VITALS */)) {
        ;
        rumPublicApi.startDurationVital = monitor(
          (name, options2) => {
            addTelemetryUsage({ feature: "start-duration-vital" });
            return strategy.startDurationVital({
              name: sanitize(name),
              context: sanitize(options2 && options2.context),
              details: sanitize(options2 && options2.details)
            });
          }
        );
        rumPublicApi.addDurationVital = monitor(
          (name, options2) => {
            addTelemetryUsage({ feature: "add-duration-vital" });
            strategy.addDurationVital({
              name: sanitize(name),
              type: "duration" /* DURATION */,
              startClocks: timeStampToClocks(options2.startTime),
              duration: options2.duration,
              context: sanitize(options2 && options2.context),
              details: sanitize(options2 && options2.details)
            });
          }
        );
        rumPublicApi.stopDurationVital = noop;
      }
      if (isExperimentalFeatureEnabled("update_view_name" /* UPDATE_VIEW_NAME */)) {
        ;
        rumPublicApi.updateViewName = monitor((name) => {
          strategy.updateViewName(name);
        });
      }
      if (configuration.storeContextsAcrossPages) {
        storeContextManager(configuration, globalContextManager, RUM_STORAGE_KEY, 2 /* GlobalContext */);
        storeContextManager(configuration, userContextManager, RUM_STORAGE_KEY, 1 /* User */);
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
        trackingConsentState
      );
      recorderApi2.onRumStart(
        startRumResult.lifeCycle,
        configuration,
        startRumResult.session,
        startRumResult.viewContexts,
        deflateWorker
      );
      strategy = createPostStartStrategy(strategy, startRumResult);
      return startRumResult;
    }
  );
  const startView = monitor((options2) => {
    const sanitizedOptions = typeof options2 === "object" ? options2 : { name: options2 };
    strategy.startView(sanitizedOptions);
    addTelemetryUsage({ feature: "start-view" });
  });
  const rumPublicApi = makePublicApi({
    init: monitor((initConfiguration) => strategy.init(initConfiguration, rumPublicApi)),
    setTrackingConsent: monitor((trackingConsent) => {
      trackingConsentState.update(trackingConsent);
      addTelemetryUsage({ feature: "set-tracking-consent", tracking_consent: trackingConsent });
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
      const handlingStack = createHandlingStack();
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
      const handlingStack = createHandlingStack();
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
      if (checkUser(newUser)) {
        userContextManager.setContext(sanitizeUser(newUser));
      }
      addTelemetryUsage({ feature: "set-user" });
    }),
    getUser: monitor(() => userContextManager.getContext()),
    setUserProperty: monitor((key, property) => {
      const sanitizedProperty = sanitizeUser({ [key]: property })[key];
      userContextManager.setContextProperty(key, sanitizedProperty);
      addTelemetryUsage({ feature: "set-user" });
    }),
    removeUserProperty: monitor((key) => userContextManager.removeContextProperty(key)),
    clearUser: monitor(() => userContextManager.clearContext()),
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
    stopSessionReplayRecording: monitor(() => recorderApi2.stop())
  });
  return rumPublicApi;
}
function createPostStartStrategy(preStartStrategy, startRumResult) {
  return assign(
    {
      init: (initConfiguration) => {
        displayAlreadyInitializedError("DD_RUM", initConfiguration);
      },
      initConfiguration: preStartStrategy.initConfiguration
    },
    startRumResult
  );
}

// ../rum-core/src/browser/domMutationObservable.ts
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

// ../rum-core/src/browser/performanceCollection.ts
function supportPerformanceObject() {
  return window.performance !== void 0 && "getEntries" in performance;
}
function startPerformanceCollection(lifeCycle, configuration) {
  const cleanupTasks = [];
  if (supportPerformanceObject()) {
    const performanceEntries = performance.getEntries();
    setTimeout(() => handleRumPerformanceEntries(lifeCycle, performanceEntries));
  }
  if (window.PerformanceObserver) {
    const handlePerformanceEntryList = monitor(
      (entries) => handleRumPerformanceEntries(lifeCycle, entries.getEntries())
    );
    const mainEntries = ["longtask" /* LONG_TASK */, "paint" /* PAINT */];
    const experimentalEntries = [
      "largest-contentful-paint" /* LARGEST_CONTENTFUL_PAINT */,
      "first-input" /* FIRST_INPUT */,
      "layout-shift" /* LAYOUT_SHIFT */,
      "event" /* EVENT */
    ];
    try {
      experimentalEntries.forEach((type) => {
        const observer2 = new window.PerformanceObserver(handlePerformanceEntryList);
        observer2.observe({
          type,
          buffered: true,
          // durationThreshold only impact PerformanceEventTiming entries used for INP computation which requires a threshold at 40 (default is 104ms)
          // cf: https://github.com/GoogleChrome/web-vitals/blob/3806160ffbc93c3c4abf210a167b81228172b31c/src/onINP.ts#L209
          durationThreshold: 40
        });
        cleanupTasks.push(() => observer2.disconnect());
      });
    } catch (e) {
      mainEntries.push(...experimentalEntries);
    }
    const mainObserver = new PerformanceObserver(handlePerformanceEntryList);
    try {
      mainObserver.observe({ entryTypes: mainEntries });
      cleanupTasks.push(() => mainObserver.disconnect());
    } catch {
    }
    if (supportPerformanceObject() && "addEventListener" in performance) {
      const { stop: removePerformanceListener } = addEventListener(
        configuration,
        performance,
        "resourcetimingbufferfull",
        () => {
          performance.clearResourceTimings();
        }
      );
      cleanupTasks.push(removePerformanceListener);
    }
  }
  if (!supportPerformanceTimingEvent("first-input" /* FIRST_INPUT */)) {
    const { stop: stopFirstInputTiming } = retrieveFirstInputTiming(configuration, (timing) => {
      handleRumPerformanceEntries(lifeCycle, [timing]);
    });
    cleanupTasks.push(stopFirstInputTiming);
  }
  return {
    stop: () => {
      cleanupTasks.forEach((task) => task());
    }
  };
}
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
        entryType: "first-input" /* FIRST_INPUT */,
        processingStart: relativeNow(),
        processingEnd: relativeNow(),
        startTime: evt.timeStamp,
        duration: 0,
        // arbitrary value to avoid nullable duration and simplify INP logic
        name: ""
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
function handleRumPerformanceEntries(lifeCycle, entries) {
  const rumPerformanceEntries = entries.filter(
    (entry) => objectHasValue(RumPerformanceEntryType, entry.entryType)
  );
  if (rumPerformanceEntries.length) {
    lifeCycle.notify(0 /* PERFORMANCE_ENTRIES_COLLECTED */, rumPerformanceEntries);
  }
}

// ../rum-core/src/domain/contexts/syntheticsContext.ts
function getSyntheticsContext() {
  const testId = getSyntheticsTestId();
  const resultId = getSyntheticsResultId();
  if (testId && resultId) {
    return {
      test_id: testId,
      result_id: resultId,
      injected: willSyntheticsInjectRum()
    };
  }
}

// ../rum-core/src/domain/rumSessionManager.ts
var RUM_SESSION_KEY = "rum";
function startRumSessionManager(configuration, lifeCycle, trackingConsentState) {
  const sessionManager = startSessionManager(
    configuration,
    RUM_SESSION_KEY,
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
        sessionReplay: session.trackingType === "1" /* TRACKED_WITH_SESSION_REPLAY */ ? 1 /* SAMPLED */ : session.isReplayForced ? 2 /* FORCED */ : 0 /* OFF */
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

// ../rum-core/src/domain/limitModification.ts
function limitModification(object, modifiableFieldPaths, modifier) {
  const clone = deepClone(object);
  const result = modifier(clone);
  objectEntries(modifiableFieldPaths).forEach(([fieldPath, fieldType]) => {
    const newValue = get(clone, fieldPath);
    const newType = getType(newValue);
    if (newType === fieldType) {
      set(object, fieldPath, sanitize(newValue));
    } else if (fieldType === "object" && (newType === "undefined" || newType === "null")) {
      set(object, fieldPath, {});
    }
  });
  return result;
}
function get(object, path) {
  let current = object;
  for (const field of path.split(".")) {
    if (!isValidObjectContaining(current, field)) {
      return;
    }
    current = current[field];
  }
  return current;
}
function set(object, path, value) {
  let current = object;
  const fields = path.split(".");
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (!isValidObject(current)) {
      return;
    }
    if (i !== fields.length - 1) {
      current = current[field];
    } else {
      current[field] = value;
    }
  }
}
function isValidObject(object) {
  return getType(object) === "object";
}
function isValidObjectContaining(object, field) {
  return isValidObject(object) && Object.prototype.hasOwnProperty.call(object, field);
}

// ../rum-core/src/domain/assembly.ts
var VIEW_MODIFIABLE_FIELD_PATHS = {
  "view.name": "string",
  "view.url": "string",
  "view.referrer": "string"
};
var USER_CUSTOMIZABLE_FIELD_PATHS = {
  context: "object"
};
var ROOT_MODIFIABLE_FIELD_PATHS = {
  service: "string",
  version: "string"
};
var modifiableFieldPathsByEvent;
function startRumAssembly(configuration, lifeCycle, sessionManager, viewContexts, urlContexts, actionContexts, displayContext, ciVisibilityContext, getCommonContext, reportError) {
  modifiableFieldPathsByEvent = {
    ["view" /* VIEW */]: VIEW_MODIFIABLE_FIELD_PATHS,
    ["error" /* ERROR */]: assign(
      {
        "error.message": "string",
        "error.stack": "string",
        "error.resource.url": "string",
        "error.fingerprint": "string"
      },
      USER_CUSTOMIZABLE_FIELD_PATHS,
      VIEW_MODIFIABLE_FIELD_PATHS,
      ROOT_MODIFIABLE_FIELD_PATHS
    ),
    ["resource" /* RESOURCE */]: assign(
      {
        "resource.url": "string"
      },
      isExperimentalFeatureEnabled("writable_resource_graphql" /* WRITABLE_RESOURCE_GRAPHQL */) ? {
        "resource.graphql": "object"
      } : {},
      USER_CUSTOMIZABLE_FIELD_PATHS,
      VIEW_MODIFIABLE_FIELD_PATHS,
      ROOT_MODIFIABLE_FIELD_PATHS
    ),
    ["action" /* ACTION */]: assign(
      {
        "action.target.name": "string"
      },
      USER_CUSTOMIZABLE_FIELD_PATHS,
      VIEW_MODIFIABLE_FIELD_PATHS,
      ROOT_MODIFIABLE_FIELD_PATHS
    ),
    ["long_task" /* LONG_TASK */]: assign({}, USER_CUSTOMIZABLE_FIELD_PATHS, VIEW_MODIFIABLE_FIELD_PATHS),
    ["vital" /* VITAL */]: assign({}, USER_CUSTOMIZABLE_FIELD_PATHS, VIEW_MODIFIABLE_FIELD_PATHS)
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
  const syntheticsContext = getSyntheticsContext();
  lifeCycle.subscribe(
    12 /* RAW_RUM_EVENT_COLLECTED */,
    ({ startTime, rawRumEvent, domainContext, savedCommonContext, customerContext }) => {
      const viewContext = viewContexts.findView(startTime);
      const urlContext = urlContexts.findUrl(startTime);
      const session = sessionManager.findTrackedSession(startTime);
      if (session && viewContext && urlContext) {
        const commonContext = savedCommonContext || getCommonContext();
        const actionId = actionContexts.findActionId(startTime);
        const rumContext = {
          _dd: {
            format_version: 2,
            drift: currentDrift(),
            configuration: {
              session_sample_rate: round(configuration.sessionSampleRate, 3),
              session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3)
            },
            browser_sdk_version: canUseEventBridge() ? "dev" : void 0
          },
          application: {
            id: configuration.applicationId
          },
          date: timeStampNow(),
          service: viewContext.service || configuration.service,
          version: viewContext.version || configuration.version,
          source: "browser",
          session: {
            id: session.id,
            type: syntheticsContext ? "synthetics" /* SYNTHETICS */ : ciVisibilityContext.get() ? "ci_test" /* CI_TEST */ : "user" /* USER */
          },
          view: {
            id: viewContext.id,
            name: viewContext.name,
            url: urlContext.url,
            referrer: urlContext.referrer
          },
          action: needToAssembleWithAction(rawRumEvent) && actionId ? { id: actionId } : void 0,
          synthetics: syntheticsContext,
          ci_test: ciVisibilityContext.get(),
          display: displayContext.get(),
          connectivity: getConnectivity()
        };
        const serverRumEvent = combine(rumContext, rawRumEvent);
        serverRumEvent.context = combine(commonContext.context, customerContext);
        if (!("has_replay" in serverRumEvent.session)) {
          ;
          serverRumEvent.session.has_replay = commonContext.hasReplay;
        }
        if (serverRumEvent.type === "view") {
          ;
          serverRumEvent.session.sampled_for_replay = session.sessionReplay === 1 /* SAMPLED */;
        }
        if (!isEmptyObject(commonContext.user)) {
          ;
          serverRumEvent.usr = commonContext.user;
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
function shouldSend(event, beforeSend, domainContext, eventRateLimiters) {
  if (beforeSend) {
    const result = limitModification(
      event,
      modifiableFieldPathsByEvent[event.type],
      (event2) => beforeSend(event2, domainContext)
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
function needToAssembleWithAction(event) {
  return ["error" /* ERROR */, "resource" /* RESOURCE */, "long_task" /* LONG_TASK */].indexOf(event.type) !== -1;
}

// ../rum-core/src/domain/contexts/internalContext.ts
function startInternalContext(applicationId, sessionManager, viewContexts, actionContexts, urlContexts) {
  return {
    get: (startTime) => {
      const viewContext = viewContexts.findView(startTime);
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

// ../rum-core/src/domain/contexts/viewContexts.ts
var VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
function startViewContexts(lifeCycle) {
  const viewContextHistory = createValueHistory({ expireDelay: VIEW_CONTEXT_TIME_OUT_DELAY });
  lifeCycle.subscribe(2 /* BEFORE_VIEW_CREATED */, (view) => {
    viewContextHistory.add(buildViewContext(view), view.startClocks.relative);
  });
  lifeCycle.subscribe(6 /* AFTER_VIEW_ENDED */, ({ endClocks }) => {
    viewContextHistory.closeActive(endClocks.relative);
  });
  lifeCycle.subscribe(4 /* VIEW_UPDATED */, (viewUpdate) => {
    const currentView = viewContextHistory.find(viewUpdate.startClocks.relative);
    if (currentView && viewUpdate.name) {
      currentView.name = viewUpdate.name;
    }
  });
  lifeCycle.subscribe(10 /* SESSION_RENEWED */, () => {
    viewContextHistory.reset();
  });
  function buildViewContext(view) {
    return {
      service: view.service,
      version: view.version,
      id: view.id,
      name: view.name,
      startClocks: view.startClocks
    };
  }
  return {
    findView: (startTime) => viewContextHistory.find(startTime),
    stop: () => {
      viewContextHistory.stop();
    }
  };
}

// ../rum-core/src/domain/requestCollection.ts
var nextRequestIndex = 1;
function startRequestCollection(lifeCycle, configuration, sessionManager) {
  const tracer = startTracer(configuration, sessionManager);
  trackXhr(lifeCycle, configuration, tracer);
  trackFetch(lifeCycle, configuration, tracer);
}
function trackXhr(lifeCycle, configuration, tracer) {
  const subscription = initXhrObservable(configuration).subscribe((rawContext) => {
    const context = rawContext;
    if (!isAllowedRequestUrl(configuration, context.url)) {
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
function trackFetch(lifeCycle, configuration, tracer) {
  const subscription = initFetchObservable().subscribe((rawContext) => {
    const context = rawContext;
    if (!isAllowedRequestUrl(configuration, context.url)) {
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

// ../rum-core/src/domain/discardNegativeDuration.ts
function discardNegativeDuration(duration) {
  return isNumber(duration) && duration < 0 ? void 0 : duration;
}

// ../rum-core/src/domain/trackEventCounts.ts
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

// ../rum-core/src/domain/waitPageActivityEnd.ts
var PAGE_ACTIVITY_VALIDATION_DELAY = 100;
var PAGE_ACTIVITY_END_DELAY = 100;
function waitPageActivityEnd(lifeCycle, domMutationObservable, configuration, pageActivityEndCallback, maxDuration) {
  const pageActivityObservable = createPageActivityObservable(lifeCycle, domMutationObservable, configuration);
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
function createPageActivityObservable(lifeCycle, domMutationObservable, configuration) {
  return new Observable((observable) => {
    const subscriptions = [];
    let firstRequestIndex;
    let pendingRequestsCount = 0;
    subscriptions.push(
      domMutationObservable.subscribe(notifyPageActivity),
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
    const { stop: stopTrackingWindowOpen } = trackWindowOpen(notifyPageActivity);
    return () => {
      stopTrackingWindowOpen();
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
function trackWindowOpen(callback) {
  return instrumentMethod(window, "open", callback);
}

// ../rum-core/src/browser/polyfills.ts
function cssEscape(str) {
  if (window.CSS && window.CSS.escape) {
    return window.CSS.escape(str);
  }
  return str.replace(/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g, function(ch, asCodePoint) {
    if (asCodePoint) {
      if (ch === "\0") {
        return "\uFFFD";
      }
      return `${ch.slice(0, -1)}\\${ch.charCodeAt(ch.length - 1).toString(16)} `;
    }
    return `\\${ch}`;
  });
}
function elementMatches(element, selector) {
  if (element.matches) {
    return element.matches(selector);
  }
  if (element.msMatchesSelector) {
    return element.msMatchesSelector(selector);
  }
  return false;
}
function getParentElement(node) {
  if (node.parentElement) {
    return node.parentElement;
  }
  while (node.parentNode) {
    if (node.parentNode.nodeType === Node.ELEMENT_NODE) {
      return node.parentNode;
    }
    node = node.parentNode;
  }
  return null;
}
function getClassList(element) {
  if (element.classList) {
    return element.classList;
  }
  const classes = (element.getAttribute("class") || "").trim();
  return classes ? classes.split(/\s+/) : [];
}
var PLACEHOLDER = 1;
var WeakSet = class {
  constructor(initialValues) {
    this.map = /* @__PURE__ */ new WeakMap();
    if (initialValues) {
      initialValues.forEach((value) => this.map.set(value, PLACEHOLDER));
    }
  }
  add(value) {
    this.map.set(value, PLACEHOLDER);
    return this;
  }
  delete(value) {
    return this.map.delete(value);
  }
  has(value) {
    return this.map.has(value);
  }
};

// ../rum-core/src/browser/htmlDomUtils.ts
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

// ../rum-core/src/domain/privacy.ts
var NodePrivacyLevel = {
  IGNORE: "ignore",
  HIDDEN: "hidden",
  ALLOW: DefaultPrivacyLevel.ALLOW,
  MASK: DefaultPrivacyLevel.MASK,
  MASK_USER_INPUT: DefaultPrivacyLevel.MASK_USER_INPUT
};
var PRIVACY_ATTR_NAME = "data-dd-privacy";
var PRIVACY_ATTR_VALUE_HIDDEN = "hidden";
var PRIVACY_CLASS_PREFIX = "dd-privacy-";
var CENSORED_STRING_MARK = "***";
var CENSORED_IMG_MARK = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
var FORM_PRIVATE_TAG_NAMES = {
  INPUT: true,
  OUTPUT: true,
  TEXTAREA: true,
  SELECT: true,
  OPTION: true,
  DATALIST: true,
  OPTGROUP: true
};
var TEXT_MASKING_CHAR = "x";
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
    if (autocomplete && autocomplete.indexOf("cc-") === 0) {
      return NodePrivacyLevel.MASK;
    }
  }
  if (elementMatches(node, getPrivacySelector(NodePrivacyLevel.HIDDEN))) {
    return NodePrivacyLevel.HIDDEN;
  }
  if (elementMatches(node, getPrivacySelector(NodePrivacyLevel.MASK))) {
    return NodePrivacyLevel.MASK;
  }
  if (elementMatches(node, getPrivacySelector(NodePrivacyLevel.MASK_USER_INPUT))) {
    return NodePrivacyLevel.MASK_USER_INPUT;
  }
  if (elementMatches(node, getPrivacySelector(NodePrivacyLevel.ALLOW))) {
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
var censorText = (text) => text.replace(/\S/g, TEXT_MASKING_CHAR);
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

// ../rum-core/src/domain/action/getActionNameFromElement.ts
var DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE = "data-dd-action-name";
var ACTION_NAME_PLACEHOLDER = "Masked Element";
function getActionNameFromElement(element, { enablePrivacyForActionName, actionNameAttribute: userProgrammaticAttribute }, nodePrivacyLevel) {
  const defaultActionName = getActionNameFromElementProgrammatically(element, DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE) || userProgrammaticAttribute && getActionNameFromElementProgrammatically(element, userProgrammaticAttribute);
  if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
    return defaultActionName || ACTION_NAME_PLACEHOLDER;
  }
  return defaultActionName || getActionNameFromElementForStrategies(
    element,
    userProgrammaticAttribute,
    priorityStrategies,
    enablePrivacyForActionName
  ) || getActionNameFromElementForStrategies(
    element,
    userProgrammaticAttribute,
    fallbackStrategies,
    enablePrivacyForActionName
  ) || "";
}
function getActionNameFromElementProgrammatically(targetElement, programmaticAttribute) {
  let elementWithAttribute;
  if (supportsElementClosest()) {
    elementWithAttribute = targetElement.closest(`[${programmaticAttribute}]`);
  } else {
    let element = targetElement;
    while (element) {
      if (element.hasAttribute(programmaticAttribute)) {
        elementWithAttribute = element;
        break;
      }
      element = getParentElement(element);
    }
  }
  if (!elementWithAttribute) {
    return;
  }
  const name = elementWithAttribute.getAttribute(programmaticAttribute);
  return truncate(normalizeWhitespace(name.trim()));
}
var priorityStrategies = [
  // associated LABEL text
  (element, userProgrammaticAttribute, privacy) => {
    if (supportsLabelProperty()) {
      if ("labels" in element && element.labels && element.labels.length > 0) {
        return getTextualContent(element.labels[0], userProgrammaticAttribute);
      }
    } else if (element.id) {
      const label = element.ownerDocument && find(element.ownerDocument.querySelectorAll("label"), (label2) => label2.htmlFor === element.id);
      return label && getTextualContent(label, userProgrammaticAttribute, privacy);
    }
  },
  // INPUT button (and associated) value
  (element) => {
    if (element.nodeName === "INPUT") {
      const input = element;
      const type = input.getAttribute("type");
      if (type === "button" || type === "submit" || type === "reset") {
        return input.value;
      }
    }
  },
  // BUTTON, LABEL or button-like element text
  (element, userProgrammaticAttribute, privacyEnabledActionName) => {
    if (element.nodeName === "BUTTON" || element.nodeName === "LABEL" || element.getAttribute("role") === "button") {
      return getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName);
    }
  },
  (element) => element.getAttribute("aria-label"),
  // associated element text designated by the aria-labelledby attribute
  (element, userProgrammaticAttribute, privacyEnabledActionName) => {
    const labelledByAttribute = element.getAttribute("aria-labelledby");
    if (labelledByAttribute) {
      return labelledByAttribute.split(/\s+/).map((id) => getElementById(element, id)).filter((label) => Boolean(label)).map((element2) => getTextualContent(element2, userProgrammaticAttribute, privacyEnabledActionName)).join(" ");
    }
  },
  (element) => element.getAttribute("alt"),
  (element) => element.getAttribute("name"),
  (element) => element.getAttribute("title"),
  (element) => element.getAttribute("placeholder"),
  // SELECT first OPTION text
  (element, userProgrammaticAttribute) => {
    if ("options" in element && element.options.length > 0) {
      return getTextualContent(element.options[0], userProgrammaticAttribute);
    }
  }
];
var fallbackStrategies = [
  (element, userProgrammaticAttribute, privacyEnabledActionName) => getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName)
];
var MAX_PARENTS_TO_CONSIDER = 10;
function getActionNameFromElementForStrategies(targetElement, userProgrammaticAttribute, strategies, privacyEnabledActionName) {
  let element = targetElement;
  let recursionCounter = 0;
  while (recursionCounter <= MAX_PARENTS_TO_CONSIDER && element && element.nodeName !== "BODY" && element.nodeName !== "HTML" && element.nodeName !== "HEAD") {
    for (const strategy of strategies) {
      const name = strategy(element, userProgrammaticAttribute, privacyEnabledActionName);
      if (typeof name === "string") {
        const trimmedName = name.trim();
        if (trimmedName) {
          return truncate(normalizeWhitespace(trimmedName));
        }
      }
    }
    if (element.nodeName === "FORM") {
      break;
    }
    element = getParentElement(element);
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
    if (!supportsInnerTextScriptAndStyleRemoval()) {
      removeTextFromElements("script, style");
    }
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
function supportsInnerTextScriptAndStyleRemoval() {
  return !isIE();
}
var supportsLabelPropertyResult;
function supportsLabelProperty() {
  if (supportsLabelPropertyResult === void 0) {
    supportsLabelPropertyResult = "labels" in HTMLInputElement.prototype;
  }
  return supportsLabelPropertyResult;
}
var supportsElementClosestResult;
function supportsElementClosest() {
  if (supportsElementClosestResult === void 0) {
    supportsElementClosestResult = "closest" in HTMLElement.prototype;
  }
  return supportsElementClosestResult;
}

// ../rum-core/src/domain/getSelectorFromElement.ts
var STABLE_ATTRIBUTES = [
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
var GLOBALLY_UNIQUE_SELECTOR_GETTERS = [getStableAttributeSelector, getIDSelector];
var UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS = [
  getStableAttributeSelector,
  getClassSelector,
  getTagNameSelector
];
function getSelectorFromElement(targetElement, actionNameAttribute) {
  if (!isConnected(targetElement)) {
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
    currentElement = getParentElement(currentElement);
  }
  return targetElementSelector;
}
function isGeneratedValue(value) {
  return /[0-9]/.test(value);
}
function getIDSelector(element) {
  if (element.id && !isGeneratedValue(element.id)) {
    return `#${cssEscape(element.id)}`;
  }
}
function getClassSelector(element) {
  if (element.tagName === "BODY") {
    return;
  }
  const classList = getClassList(element);
  for (let i = 0; i < classList.length; i += 1) {
    const className = classList[i];
    if (isGeneratedValue(className)) {
      continue;
    }
    return `${cssEscape(element.tagName)}.${cssEscape(className)}`;
  }
}
function getTagNameSelector(element) {
  return cssEscape(element.tagName);
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
      return `${cssEscape(element.tagName)}[${attributeName}="${cssEscape(element.getAttribute(attributeName))}"]`;
    }
  }
}
function getPositionSelector(element) {
  let sibling = getParentElement(element).firstElementChild;
  let elementIndex = 1;
  while (sibling && sibling !== element) {
    if (sibling.tagName === element.tagName) {
      elementIndex += 1;
    }
    sibling = sibling.nextElementSibling;
  }
  return `${cssEscape(element.tagName)}:nth-of-type(${elementIndex})`;
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
    isSiblingMatching = (sibling2) => elementMatches(sibling2, currentElementSelector);
  } else {
    const scopedSelector = supportScopeSelector() ? combineSelector(`${currentElementSelector}:scope`, childSelector) : combineSelector(currentElementSelector, childSelector);
    isSiblingMatching = (sibling2) => sibling2.querySelector(scopedSelector) !== null;
  }
  const parent = getParentElement(currentElement);
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
var supportScopeSelectorCache;
function supportScopeSelector() {
  if (supportScopeSelectorCache === void 0) {
    try {
      document.querySelector(":scope");
      supportScopeSelectorCache = true;
    } catch {
      supportScopeSelectorCache = false;
    }
  }
  return supportScopeSelectorCache;
}
function isConnected(element) {
  if ("isConnected" in // cast is to make sure `element` is not inferred as `never` after the check
  element) {
    return element.isConnected;
  }
  return element.ownerDocument.documentElement.contains(element);
}

// ../rum-core/src/domain/action/clickChain.ts
var MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND;
var MAX_DISTANCE_BETWEEN_CLICKS = 100;
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

// ../rum-core/src/domain/action/listenActionEvents.ts
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

// ../rum-core/src/domain/action/computeFrustration.ts
var MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE = 3;
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
var DEAD_CLICK_EXCLUDE_SELECTOR = (
  // inputs that don't trigger a meaningful event like "input" when clicked, including textual
  // inputs (using a negative selector is shorter here)
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]),textarea,select,[contenteditable],[contenteditable] *,canvas,a[href],a[href] *'
);
function isDead(click) {
  if (click.hasPageActivity || click.getUserActivity().input || click.getUserActivity().scroll) {
    return false;
  }
  return !elementMatches(click.event.target, DEAD_CLICK_EXCLUDE_SELECTOR);
}

// ../rum-core/src/domain/action/trackClickActions.ts
var CLICK_ACTION_MAX_DURATION = 10 * ONE_SECOND;
var ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE;
function trackClickActions(lifeCycle, domMutationObservable, configuration) {
  const history = createValueHistory({ expireDelay: ACTION_CONTEXT_TIME_OUT_DELAY });
  const stopObservable = new Observable();
  let currentClickChain;
  lifeCycle.subscribe(10 /* SESSION_RENEWED */, () => {
    history.reset();
  });
  lifeCycle.subscribe(5 /* VIEW_ENDED */, stopClickChain);
  const { stop: stopActionEventsListener } = listenActionEvents(configuration, {
    onPointerDown: (pointerDownEvent) => processPointerDown(configuration, lifeCycle, domMutationObservable, pointerDownEvent),
    onPointerUp: ({ clickActionBase, hadActivityOnPointerDown }, startEvent, getUserActivity) => {
      startClickAction(
        configuration,
        lifeCycle,
        domMutationObservable,
        history,
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
    findActionId: (startTime) => history.findAll(startTime)
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
function processPointerDown(configuration, lifeCycle, domMutationObservable, pointerDownEvent) {
  const nodePrivacyLevel = configuration.enablePrivacyForActionName ? getNodePrivacyLevel(pointerDownEvent.target, configuration.defaultPrivacyLevel) : NodePrivacyLevel.ALLOW;
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return void 0;
  }
  const clickActionBase = computeClickActionBase(pointerDownEvent, nodePrivacyLevel, configuration);
  let hadActivityOnPointerDown = false;
  waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
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
function startClickAction(configuration, lifeCycle, domMutationObservable, history, stopObservable, appendClickToClickChain, clickActionBase, startEvent, getUserActivity, hadActivityOnPointerDown) {
  const click = newClick(lifeCycle, history, getUserActivity, clickActionBase, startEvent);
  appendClickToClickChain(click);
  const { stop: stopWaitPageActivityEnd } = waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
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
  return {
    type: "click" /* CLICK */,
    target: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      selector: getSelectorFromElement(event.target, configuration.actionNameAttribute)
    },
    position: {
      // Use clientX and Y because for SVG element offsetX and Y are relatives to the <svg> element
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top)
    },
    name: getActionNameFromElement(event.target, configuration, nodePrivacyLevel)
  };
}
function newClick(lifeCycle, history, getUserActivity, clickActionBase, startEvent) {
  const id = generateUUID();
  const startClocks = clocksNow();
  const historyEntry = history.add(id, startClocks.relative);
  const eventCountsSubscription = trackEventCounts({
    lifeCycle,
    isChildEvent: (event) => event.action !== void 0 && (Array.isArray(event.action.id) ? includes(event.action.id, id) : event.action.id === id)
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
    clone: () => newClick(lifeCycle, history, getUserActivity, clickActionBase, startEvent),
    validate: (domEvents) => {
      stop();
      if (status !== 1 /* STOPPED */) {
        return;
      }
      const { resourceCount, errorCount, longTaskCount } = eventCountsSubscription.eventCounts;
      const clickAction = assign(
        {
          type: "click" /* CLICK */,
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
          event: startEvent
        },
        clickActionBase
      );
      lifeCycle.notify(1 /* AUTO_ACTION_COMPLETED */, clickAction);
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

// ../rum-core/src/domain/action/actionCollection.ts
function startActionCollection(lifeCycle, domMutationObservable, configuration, pageStateHistory) {
  lifeCycle.subscribe(
    1 /* AUTO_ACTION_COMPLETED */,
    (action) => lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, processAction(action, pageStateHistory))
  );
  let actionContexts = { findActionId: noop };
  if (configuration.trackUserInteractions) {
    actionContexts = trackClickActions(lifeCycle, domMutationObservable, configuration).actionContexts;
  }
  return {
    addAction: (action, savedCommonContext) => {
      lifeCycle.notify(
        12 /* RAW_RUM_EVENT_COLLECTED */,
        assign(
          {
            savedCommonContext
          },
          processAction(action, pageStateHistory)
        )
      );
    },
    actionContexts
  };
}
function processAction(action, pageStateHistory) {
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
        position: action.position
      }
    }
  } : void 0;
  const customerContext = !isAutoAction(action) ? action.context : void 0;
  const actionEvent = combine(
    {
      action: {
        id: generateUUID(),
        target: {
          name: action.name
        },
        type: action.type
      },
      date: action.startClocks.timeStamp,
      type: "action" /* ACTION */,
      view: { in_foreground: pageStateHistory.wasInPageStateAt("active" /* ACTIVE */, action.startClocks.relative) }
    },
    autoActionProperties
  );
  const domainContext = isAutoAction(action) ? { events: action.events } : {};
  if (!isAutoAction(action) && action.handlingStack) {
    domainContext.handlingStack = action.handlingStack;
  }
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
    domainContext
  };
}
function isAutoAction(action) {
  return action.type !== "custom" /* CUSTOM */;
}

// ../rum-core/src/domain/error/trackConsoleError.ts
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

// ../rum-core/src/domain/error/trackReportError.ts
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

// ../rum-core/src/domain/error/errorCollection.ts
function startErrorCollection(lifeCycle, configuration, pageStateHistory, featureFlagContexts) {
  const errorObservable = new Observable();
  trackConsoleError(errorObservable);
  trackRuntimeError(errorObservable);
  trackReportError(configuration, errorObservable);
  errorObservable.subscribe((error) => lifeCycle.notify(14 /* RAW_ERROR_COLLECTED */, { error }));
  return doStartErrorCollection(lifeCycle, pageStateHistory, featureFlagContexts);
}
function doStartErrorCollection(lifeCycle, pageStateHistory, featureFlagContexts) {
  lifeCycle.subscribe(14 /* RAW_ERROR_COLLECTED */, ({ error, customerContext, savedCommonContext }) => {
    lifeCycle.notify(
      12 /* RAW_RUM_EVENT_COLLECTED */,
      assign(
        {
          customerContext,
          savedCommonContext
        },
        processError(error, pageStateHistory, featureFlagContexts)
      )
    );
  });
  return {
    addError: ({ error, handlingStack, startClocks, context: customerContext }, savedCommonContext) => {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : void 0;
      const rawError = computeRawError({
        stackTrace,
        originalError: error,
        handlingStack,
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
function processError(error, pageStateHistory, featureFlagContexts) {
  const rawRumEvent = {
    date: error.startClocks.timeStamp,
    error: {
      id: generateUUID(),
      message: error.message,
      source: error.source,
      stack: error.stack,
      handling_stack: error.handlingStack,
      type: error.type,
      handling: error.handling,
      causes: error.causes,
      source_type: "browser",
      fingerprint: error.fingerprint,
      csp: error.csp
    },
    type: "error" /* ERROR */,
    view: { in_foreground: pageStateHistory.wasInPageStateAt("active" /* ACTIVE */, error.startClocks.relative) }
  };
  const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(error.startClocks.relative);
  if (featureFlagContext && !isEmptyObject(featureFlagContext)) {
    rawRumEvent.feature_flags = featureFlagContext;
  }
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

// ../rum-core/src/domain/resource/matchRequestTiming.ts
var alreadyMatchedEntries = new WeakSet();
function matchRequestTiming(request) {
  if (!performance || !("getEntriesByName" in performance)) {
    return;
  }
  const sameNameEntries = performance.getEntriesByName(request.url, "resource");
  if (!sameNameEntries.length || !("toJSON" in sameNameEntries[0])) {
    return;
  }
  const candidates = sameNameEntries.filter((entry) => !alreadyMatchedEntries.has(entry)).filter((entry) => isValidEntry(entry)).filter(
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

// ../rum-core/src/domain/tracing/getDocumentTraceId.ts
var INITIAL_DOCUMENT_OUTDATED_TRACE_ID_THRESHOLD = 2 * ONE_MINUTE;
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

// ../rum-core/src/browser/performanceUtils.ts
function computeRelativePerformanceTiming() {
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

// ../rum-core/src/domain/resource/retrieveInitialDocumentResourceTiming.ts
function retrieveInitialDocumentResourceTiming(configuration, callback) {
  runOnReadyState(configuration, "interactive", () => {
    let timing;
    const forcedAttributes = {
      entryType: "resource" /* RESOURCE */,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      traceId: getDocumentTraceId(document),
      toJSON: () => assign({}, timing, { toJSON: void 0 })
    };
    if (supportPerformanceTimingEvent("navigation" /* NAVIGATION */) && performance.getEntriesByType("navigation" /* NAVIGATION */).length > 0) {
      const navigationEntry = performance.getEntriesByType("navigation" /* NAVIGATION */)[0];
      timing = assign(navigationEntry.toJSON(), forcedAttributes);
    } else {
      const relativePerformanceTiming = computeRelativePerformanceTiming();
      timing = assign(
        relativePerformanceTiming,
        {
          decodedBodySize: 0,
          encodedBodySize: 0,
          transferSize: 0,
          renderBlockingStatus: "non-blocking",
          duration: relativePerformanceTiming.responseEnd,
          name: window.location.href,
          startTime: 0
        },
        forcedAttributes
      );
    }
    callback(timing);
  });
}

// ../rum-core/src/domain/resource/resourceCollection.ts
function startResourceCollection(lifeCycle, configuration, pageStateHistory, retrieveInitialDocumentResourceTimingImpl = retrieveInitialDocumentResourceTiming) {
  lifeCycle.subscribe(8 /* REQUEST_COMPLETED */, (request) => {
    const rawEvent = processRequest(request, configuration, pageStateHistory);
    if (rawEvent) {
      lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, rawEvent);
    }
  });
  const performanceResourceSubscription = createPerformanceObservable(configuration, {
    type: "resource" /* RESOURCE */,
    buffered: true
  }).subscribe((entries) => {
    for (const entry of entries) {
      if (!isRequestKind(entry)) {
        const rawEvent = processResourceEntry(entry, configuration);
        if (rawEvent) {
          lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, rawEvent);
        }
      }
    }
  });
  retrieveInitialDocumentResourceTimingImpl(configuration, (timing) => {
    const rawEvent = processResourceEntry(timing, configuration);
    if (rawEvent) {
      lifeCycle.notify(12 /* RAW_RUM_EVENT_COLLECTED */, rawEvent);
    }
  });
  return {
    stop: () => {
      performanceResourceSubscription.unsubscribe();
    }
  };
}
function processRequest(request, configuration, pageStateHistory) {
  const matchingTiming = matchRequestTiming(request);
  const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks;
  const tracingInfo = computeRequestTracingInfo(request, configuration);
  if (!configuration.trackResources && !tracingInfo) {
    return;
  }
  const type = request.type === "xhr" /* XHR */ ? "xhr" /* XHR */ : "fetch" /* FETCH */;
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : void 0;
  const duration = computeRequestDuration(pageStateHistory, startClocks, request.duration);
  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        duration,
        method: request.method,
        status_code: request.status,
        url: isLongDataUrl(request.url) ? sanitizeDataUrl(request.url) : request.url
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
  const tracingInfo = computeEntryTracingInfo(entry, configuration);
  if (!configuration.trackResources && !tracingInfo) {
    return;
  }
  const type = computeResourceKind(entry);
  const entryMetrics = computePerformanceEntryMetrics(entry);
  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        url: entry.name,
        status_code: discardZeroStatus(entry.responseStatus)
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
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: entry
    }
  };
}
function computePerformanceEntryMetrics(timing) {
  const { renderBlockingStatus } = timing;
  return {
    resource: assign(
      {
        duration: computePerformanceResourceDuration(timing),
        render_blocking_status: renderBlockingStatus
      },
      computeSize(timing),
      computePerformanceResourceDetails(timing)
    )
  };
}
function computeRequestTracingInfo(request, configuration) {
  const hasBeenTraced = request.traceSampled && request.traceId && request.spanId;
  if (!hasBeenTraced) {
    return void 0;
  }
  return {
    _dd: {
      span_id: request.spanId.toDecimalString(),
      trace_id: request.traceId.toDecimalString(),
      rule_psr: getRulePsr(configuration)
    }
  };
}
function computeEntryTracingInfo(entry, configuration) {
  const hasBeenTraced = entry.traceId;
  if (!hasBeenTraced) {
    return void 0;
  }
  return {
    _dd: {
      trace_id: entry.traceId,
      span_id: createTraceIdentifier().toDecimalString(),
      rule_psr: getRulePsr(configuration)
    }
  };
}
function getRulePsr(configuration) {
  return isNumber(configuration.traceSampleRate) ? configuration.traceSampleRate / 100 : void 0;
}
function computeRequestDuration(pageStateHistory, startClocks, duration) {
  return !pageStateHistory.wasInPageStateDuringPeriod("frozen" /* FROZEN */, startClocks.relative, duration) ? toServerDuration(duration) : void 0;
}
function discardZeroStatus(statusCode) {
  return statusCode === 0 ? void 0 : statusCode;
}

// ../rum-core/src/domain/view/trackViewEventCounts.ts
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

// ../rum-core/src/domain/view/viewMetrics/trackFirstContentfulPaint.ts
var FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE;
function trackFirstContentfulPaint(lifeCycle, firstHidden, callback) {
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    0 /* PERFORMANCE_ENTRIES_COLLECTED */,
    (entries) => {
      const fcpEntry = find(
        entries,
        (entry) => entry.entryType === "paint" /* PAINT */ && entry.name === "first-contentful-paint" && entry.startTime < firstHidden.timeStamp && entry.startTime < FCP_MAXIMUM_DELAY
      );
      if (fcpEntry) {
        callback(fcpEntry.startTime);
      }
    }
  );
  return {
    stop: unsubscribeLifeCycle
  };
}

// ../rum-core/src/domain/view/viewMetrics/trackFirstInput.ts
function trackFirstInput(lifeCycle, configuration, firstHidden, callback) {
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    0 /* PERFORMANCE_ENTRIES_COLLECTED */,
    (entries) => {
      const firstInputEntry = find(
        entries,
        (entry) => entry.entryType === "first-input" /* FIRST_INPUT */ && entry.startTime < firstHidden.timeStamp
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
    }
  );
  return {
    stop: unsubscribeLifeCycle
  };
}

// ../rum-core/src/domain/view/viewMetrics/trackNavigationTimings.ts
function trackNavigationTimings(configuration, callback) {
  const processEntry = (entry) => {
    if (!isIncompleteNavigation(entry)) {
      callback(processNavigationEntry(entry));
    }
  };
  let stop = noop;
  if (supportPerformanceTimingEvent("navigation" /* NAVIGATION */)) {
    ;
    ({ unsubscribe: stop } = createPerformanceObservable(configuration, {
      type: "navigation" /* NAVIGATION */,
      buffered: true
    }).subscribe((entries) => forEach(entries, processEntry)));
  } else {
    retrieveNavigationTiming(configuration, processEntry);
  }
  return { stop };
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
function retrieveNavigationTiming(configuration, callback) {
  runOnReadyState(configuration, "complete", () => {
    setTimeout(() => callback(computeRelativePerformanceTiming()));
  });
}

// ../rum-core/src/domain/view/viewMetrics/trackLargestContentfulPaint.ts
var LCP_MAXIMUM_DELAY = 10 * ONE_MINUTE;
function trackLargestContentfulPaint(lifeCycle, configuration, firstHidden, eventTarget, callback) {
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
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    0 /* PERFORMANCE_ENTRIES_COLLECTED */,
    (entries) => {
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
          targetSelector: lcpTargetSelector
        });
        biggestLcpSize = lcpEntry.size;
      }
    }
  );
  return {
    stop: () => {
      stopEventListener();
      unsubscribeLifeCycle();
    }
  };
}

// ../rum-core/src/domain/view/viewMetrics/trackFirstHidden.ts
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

// ../rum-core/src/domain/view/viewMetrics/trackInitialViewMetrics.ts
function trackInitialViewMetrics(lifeCycle, configuration, setLoadEvent, scheduleViewUpdate) {
  const initialViewMetrics = {};
  const { stop: stopNavigationTracking } = trackNavigationTimings(configuration, (navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent);
    initialViewMetrics.navigationTimings = navigationTimings;
    scheduleViewUpdate();
  });
  const firstHidden = trackFirstHidden(configuration);
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(lifeCycle, firstHidden, (firstContentfulPaint) => {
    initialViewMetrics.firstContentfulPaint = firstContentfulPaint;
    scheduleViewUpdate();
  });
  const { stop: stopLCPTracking } = trackLargestContentfulPaint(
    lifeCycle,
    configuration,
    firstHidden,
    window,
    (largestContentfulPaint) => {
      initialViewMetrics.largestContentfulPaint = largestContentfulPaint;
      scheduleViewUpdate();
    }
  );
  const { stop: stopFIDTracking } = trackFirstInput(lifeCycle, configuration, firstHidden, (firstInput) => {
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

// ../rum-core/src/domain/view/viewMetrics/trackCumulativeLayoutShift.ts
function trackCumulativeLayoutShift(configuration, lifeCycle, viewStart, callback) {
  if (!isLayoutShiftSupported()) {
    return {
      stop: noop
    };
  }
  let maxClsValue = 0;
  let maxClsTarget;
  let maxClsStartTime;
  callback({
    value: 0
  });
  const window2 = slidingSessionWindow();
  const { unsubscribe: stop } = lifeCycle.subscribe(0 /* PERFORMANCE_ENTRIES_COLLECTED */, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === "layout-shift" /* LAYOUT_SHIFT */ && !entry.hadRecentInput) {
        const { cumulatedValue, isMaxValue } = window2.update(entry);
        if (isMaxValue) {
          const target = getTargetFromSource(entry.sources);
          maxClsTarget = target ? new WeakRef(target) : void 0;
          maxClsStartTime = elapsed(viewStart, entry.startTime);
        }
        if (cumulatedValue > maxClsValue) {
          maxClsValue = cumulatedValue;
          const target = maxClsTarget?.deref();
          callback({
            value: round(maxClsValue, 4),
            targetSelector: target && getSelectorFromElement(target, configuration.actionNameAttribute),
            time: maxClsStartTime
          });
        }
      }
    }
  });
  return {
    stop
  };
}
function getTargetFromSource(sources) {
  if (!sources) {
    return;
  }
  return find(sources, (source) => !!source.node && isElementNode(source.node))?.node;
}
var MAX_WINDOW_DURATION = 5 * ONE_SECOND;
var MAX_UPDATE_GAP = ONE_SECOND;
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

// ../rum-core/src/domain/view/viewMetrics/interactionCountPolyfill.ts
var observer;
var interactionCountEstimate = 0;
var minKnownInteractionId = Infinity;
var maxKnownInteractionId = 0;
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
var getInteractionCount = () => observer ? interactionCountEstimate : window.performance.interactionCount || 0;

// ../rum-core/src/domain/view/viewMetrics/trackInteractionToNextPaint.ts
var MAX_INTERACTION_ENTRIES = 10;
var MAX_INP_VALUE = 1 * ONE_MINUTE;
function trackInteractionToNextPaint(configuration, viewStart, viewLoadingType, lifeCycle) {
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
  const { unsubscribe: stop } = lifeCycle.subscribe(0 /* PERFORMANCE_ENTRIES_COLLECTED */, (entries) => {
    for (const entry of entries) {
      if ((entry.entryType === "event" /* EVENT */ || entry.entryType === "first-input" /* FIRST_INPUT */) && entry.interactionId && // Check the entry start time is inside the view bounds because some view interactions can be reported after the view end (if long duration).
      entry.startTime >= viewStart && entry.startTime <= viewEnd) {
        longestInteractions.process(entry);
      }
    }
    const newInteraction = longestInteractions.estimateP98Interaction();
    if (newInteraction && newInteraction.duration !== interactionToNextPaint) {
      const inpTarget = newInteraction.target;
      interactionToNextPaint = newInteraction.duration;
      interactionToNextPaintStartTime = elapsed(viewStart, newInteraction.startTime);
      if (inpTarget && isElementNode(inpTarget)) {
        interactionToNextPaintTargetSelector = getSelectorFromElement(inpTarget, configuration.actionNameAttribute);
      } else {
        interactionToNextPaintTargetSelector = void 0;
      }
      if (!interactionToNextPaintTargetSelector && isExperimentalFeatureEnabled("null_inp_telemetry" /* NULL_INP_TELEMETRY */)) {
        addTelemetryDebug("Fail to get INP target selector", {
          hasTarget: !!inpTarget,
          targetIsConnected: inpTarget ? inpTarget.isConnected : void 0,
          targetIsElementNode: inpTarget ? isElementNode(inpTarget) : void 0,
          inp: newInteraction.duration
        });
      }
    }
  });
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
    stop
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

// ../rum-core/src/domain/view/viewMetrics/trackLoadingTime.ts
function trackLoadingTime(lifeCycle, domMutationObservable, configuration, loadType, viewStart, callback) {
  let isWaitingForLoadEvent = loadType === "initial_load" /* INITIAL_LOAD */;
  let isWaitingForActivityLoadingTime = true;
  const loadingTimeCandidates = [];
  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
      callback(Math.max(...loadingTimeCandidates));
    }
  }
  const { stop } = waitPageActivityEnd(lifeCycle, domMutationObservable, configuration, (event) => {
    if (isWaitingForActivityLoadingTime) {
      isWaitingForActivityLoadingTime = false;
      if (event.hadActivity) {
        loadingTimeCandidates.push(elapsed(viewStart.timeStamp, event.end));
      }
      invokeCallbackIfAllCandidatesAreReceived();
    }
  });
  return {
    stop,
    setLoadEvent: (loadEvent) => {
      if (isWaitingForLoadEvent) {
        isWaitingForLoadEvent = false;
        loadingTimeCandidates.push(loadEvent);
        invokeCallbackIfAllCandidatesAreReceived();
      }
    }
  };
}

// ../rum-core/src/browser/scroll.ts
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

// ../rum-core/src/browser/viewportObservable.ts
var viewportObservable;
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

// ../rum-core/src/domain/view/viewMetrics/trackScrollMetrics.ts
var THROTTLE_SCROLL_DURATION = ONE_SECOND;
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
      resizeObserver.observe(observerTarget);
      const eventListener = addEventListener(configuration, window, "scroll" /* SCROLL */, throttledNotify.throttled, {
        passive: true
      });
      return () => {
        throttledNotify.cancel();
        resizeObserver.unobserve(observerTarget);
        eventListener.stop();
      };
    }
  });
}

// ../rum-core/src/domain/view/viewMetrics/trackCommonViewMetrics.ts
function trackCommonViewMetrics(lifeCycle, domMutationObservable, configuration, scheduleViewUpdate, loadingType, viewStart) {
  const commonViewMetrics = {};
  const { stop: stopLoadingTimeTracking, setLoadEvent } = trackLoadingTime(
    lifeCycle,
    domMutationObservable,
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
    lifeCycle,
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
  } = trackInteractionToNextPaint(configuration, viewStart.relative, loadingType, lifeCycle);
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

// ../rum-core/src/domain/view/trackViews.ts
var THROTTLE_VIEW_UPDATE_PERIOD = 3e3;
var SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE;
var KEEP_TRACKING_AFTER_VIEW_DELAY = 5 * ONE_MINUTE;
function trackViews(location2, lifeCycle, domMutationObservable, configuration, locationChangeObservable, areViewsTrackedAutomatically, initialViewOptions) {
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
        version: currentView.version
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
    updateViewName: (name) => {
      currentView.updateViewName(name);
    },
    stop: () => {
      if (locationChangeSubscription) {
        locationChangeSubscription.unsubscribe();
      }
      currentView.end();
      activeViews.forEach((view) => view.stop());
    }
  };
}
function newView(lifeCycle, domMutationObservable, configuration, initialLocation, loadingType, startClocks = clocksNow(), viewOptions) {
  const id = generateUUID();
  const stopObservable = new Observable();
  const customTimings = {};
  let documentVersion = 0;
  let endClocks;
  const location2 = shallowClone(initialLocation);
  let sessionIsActive = true;
  let name;
  let service;
  let version;
  if (viewOptions) {
    name = viewOptions.name;
    service = viewOptions.service || void 0;
    version = viewOptions.version || void 0;
  }
  const viewCreatedEvent = {
    id,
    name,
    startClocks,
    service,
    version
  };
  lifeCycle.notify(2 /* BEFORE_VIEW_CREATED */, viewCreatedEvent);
  lifeCycle.notify(3 /* VIEW_CREATED */, viewCreatedEvent);
  const { throttled: scheduleViewUpdate, cancel: cancelScheduleViewUpdate } = throttle(
    triggerViewUpdate,
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false
    }
  );
  const {
    setLoadEvent,
    setViewEnd,
    stop: stopCommonViewMetricsTracking,
    stopINPTracking,
    getCommonViewMetrics
  } = trackCommonViewMetrics(
    lifeCycle,
    domMutationObservable,
    configuration,
    scheduleViewUpdate,
    loadingType,
    startClocks
  );
  const { stop: stopInitialViewMetricsTracking, initialViewMetrics } = loadingType === "initial_load" /* INITIAL_LOAD */ ? trackInitialViewMetrics(lifeCycle, configuration, setLoadEvent, scheduleViewUpdate) : { stop: noop, initialViewMetrics: {} };
  const { stop: stopEventCountsTracking, eventCounts } = trackViewEventCounts(lifeCycle, id, scheduleViewUpdate);
  const keepAliveIntervalId = setInterval(triggerViewUpdate, SESSION_KEEP_ALIVE_INTERVAL);
  triggerViewUpdate();
  function triggerViewUpdate() {
    cancelScheduleViewUpdate();
    documentVersion += 1;
    const currentEnd = endClocks === void 0 ? timeStampNow() : endClocks.timeStamp;
    lifeCycle.notify(4 /* VIEW_UPDATED */, {
      customTimings,
      documentVersion,
      id,
      name,
      service,
      version,
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
    updateViewName(updatedName) {
      if (!isExperimentalFeatureEnabled("update_view_name" /* UPDATE_VIEW_NAME */)) {
        return;
      }
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

// ../rum-core/src/domain/view/viewCollection.ts
function startViewCollection(lifeCycle, configuration, location2, domMutationObservable, locationChangeObservable, featureFlagContexts, pageStateHistory, recorderApi2, initialViewOptions) {
  lifeCycle.subscribe(
    4 /* VIEW_UPDATED */,
    (view) => lifeCycle.notify(
      12 /* RAW_RUM_EVENT_COLLECTED */,
      processViewUpdate(view, configuration, featureFlagContexts, recorderApi2, pageStateHistory)
    )
  );
  return trackViews(
    location2,
    lifeCycle,
    domMutationObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  );
}
function processViewUpdate(view, configuration, featureFlagContexts, recorderApi2, pageStateHistory) {
  const replayStats = recorderApi2.getReplayStats(view.id);
  const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(view.startClocks.relative);
  const pageStates = pageStateHistory.findAll(view.startClocks.relative, view.duration);
  const viewEvent = {
    _dd: {
      document_version: view.documentVersion,
      replay_stats: replayStats,
      page_states: pageStates,
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
      resource: {
        count: view.eventCounts.resourceCount
      },
      time_spent: toServerDuration(view.duration)
    },
    feature_flags: featureFlagContext && !isEmptyObject(featureFlagContext) ? featureFlagContext : void 0,
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
    domainContext: {
      location: view.location
    }
  };
}

// ../rum-core/src/transport/startRumBatch.ts
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

// ../rum-core/src/transport/startRumEventBridge.ts
function startRumEventBridge(lifeCycle) {
  const bridge = getEventBridge();
  lifeCycle.subscribe(13 /* RUM_EVENT_COLLECTED */, (serverRumEvent) => {
    bridge.send("rum", serverRumEvent);
  });
}

// ../rum-core/src/domain/contexts/urlContexts.ts
var URL_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
function startUrlContexts(lifeCycle, locationChangeObservable, location2) {
  const urlContextHistory = createValueHistory({ expireDelay: URL_CONTEXT_TIME_OUT_DELAY });
  let previousViewUrl;
  lifeCycle.subscribe(2 /* BEFORE_VIEW_CREATED */, ({ startClocks }) => {
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
  return {
    findUrl: (startTime) => urlContextHistory.find(startTime),
    stop: () => {
      locationChangeSubscription.unsubscribe();
      urlContextHistory.stop();
    }
  };
}

// ../rum-core/src/browser/locationChangeObservable.ts
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
  const { stop: stopInstrumentingPushState } = instrumentMethod(History.prototype, "pushState", ({ onPostCall }) => {
    onPostCall(onHistoryChange);
  });
  const { stop: stopInstrumentingReplaceState } = instrumentMethod(
    History.prototype,
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

// ../rum-core/src/domain/contexts/featureFlagContext.ts
var FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY;
function startFeatureFlagContexts(lifeCycle, customerDataTracker) {
  const featureFlagContexts = createValueHistory({
    expireDelay: FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY
  });
  lifeCycle.subscribe(2 /* BEFORE_VIEW_CREATED */, ({ startClocks }) => {
    featureFlagContexts.add({}, startClocks.relative);
    customerDataTracker.resetCustomerData();
  });
  lifeCycle.subscribe(6 /* AFTER_VIEW_ENDED */, ({ endClocks }) => {
    featureFlagContexts.closeActive(endClocks.relative);
  });
  return {
    findFeatureFlagEvaluations: (startTime) => featureFlagContexts.find(startTime),
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

// ../rum-core/src/domain/startCustomerDataTelemetry.ts
var MEASURES_PERIOD_DURATION = 10 * ONE_SECOND;
var currentPeriodMeasures;
var currentBatchMeasures;
var batchHasRumEvent;
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
      includes(["view" /* VIEW */, "error" /* ERROR */], event.type) ? customerDataTrackerManager.getOrCreateTracker(0 /* FeatureFlag */).getBytesCount() : 0
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

// ../rum-core/src/domain/contexts/displayContext.ts
function startDisplayContext(configuration) {
  let viewport = getViewportDimension();
  const unsubscribeViewport = initViewportObservable(configuration).subscribe((viewportDimension) => {
    viewport = viewportDimension;
  }).unsubscribe;
  return {
    get: () => ({ viewport }),
    stop: unsubscribeViewport
  };
}

// ../rum-core/src/browser/cookieObservable.ts
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
        const changeEvent = find(event.changed, (event2) => event2.name === cookieName) || find(event.deleted, (event2) => event2.name === cookieName);
        if (changeEvent) {
          callback(changeEvent.value);
        }
      }
    );
    return listener.stop;
  };
}
var WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND;
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

// ../rum-core/src/domain/contexts/ciVisibilityContext.ts
var CI_VISIBILITY_TEST_ID_COOKIE_NAME = "datadog-ci-visibility-test-execution-id";
function startCiVisibilityContext(configuration, cookieObservable = createCookieObservable(configuration, CI_VISIBILITY_TEST_ID_COOKIE_NAME)) {
  let testExecutionId = getInitCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME) || window.Cypress?.env("traceId");
  const cookieObservableSubscription = cookieObservable.subscribe((value) => {
    testExecutionId = value;
  });
  return {
    get: () => {
      if (typeof testExecutionId === "string") {
        return {
          test_execution_id: testExecutionId
        };
      }
    },
    stop: () => cookieObservableSubscription.unsubscribe()
  };
}

// ../rum-core/src/domain/longAnimationFrame/longAnimationFrameCollection.ts
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
          first_ui_event_timestamp: relativeToClocks(entry.firstUIEventTimestamp).relative,
          render_start: relativeToClocks(entry.renderStart).relative,
          style_and_layout_start: relativeToClocks(entry.styleAndLayoutStart).relative,
          scripts: entry.scripts.map((script) => ({
            duration: toServerDuration(script.duration),
            pause_duration: toServerDuration(script.pauseDuration),
            forced_style_and_layout_duration: toServerDuration(script.forcedStyleAndLayoutDuration),
            start_time: relativeToClocks(script.startTime).relative,
            execution_start: relativeToClocks(script.executionStart).relative,
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
        domainContext: { performanceEntry: entry }
      });
    }
  });
  return {
    stop: () => performanceResourceSubscription.unsubscribe()
  };
}

// ../rum-core/src/boot/startRum.ts
function startRum(configuration, recorderApi2, customerDataTrackerManager, getCommonContext, initialViewOptions, createEncoder, trackingConsentState) {
  const cleanupTasks = [];
  const lifeCycle = new LifeCycle();
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
      id: viewContexts.findView()?.id
    },
    action: {
      id: actionContexts.findActionId()
    }
  }));
  const reportError = (error) => {
    lifeCycle.notify(14 /* RAW_ERROR_COLLECTED */, { error });
    addTelemetryDebug("Error reported to customer", { "error.message": error.message });
  };
  const featureFlagContexts = startFeatureFlagContexts(
    lifeCycle,
    customerDataTrackerManager.getOrCreateTracker(0 /* FeatureFlag */)
  );
  const pageExitObservable = createPageExitObservable(configuration);
  const pageExitSubscription = pageExitObservable.subscribe((event) => {
    lifeCycle.notify(11 /* PAGE_EXITED */, event);
  });
  cleanupTasks.push(() => pageExitSubscription.unsubscribe());
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
    cleanupTasks.push(() => batch.stop());
    startCustomerDataTelemetry(configuration, telemetry, lifeCycle, customerDataTrackerManager, batch.flushObservable);
  } else {
    startRumEventBridge(lifeCycle);
  }
  const domMutationObservable = createDOMMutationObservable();
  const locationChangeObservable = createLocationChangeObservable(configuration, location);
  const pageStateHistory = startPageStateHistory(configuration);
  const {
    viewContexts,
    urlContexts,
    actionContexts,
    addAction,
    stop: stopRumEventCollection
  } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    session,
    pageStateHistory,
    locationChangeObservable,
    domMutationObservable,
    getCommonContext,
    reportError
  );
  cleanupTasks.push(stopRumEventCollection);
  drainPreStartTelemetry();
  const {
    addTiming,
    startView,
    updateViewName,
    stop: stopViewCollection
  } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    featureFlagContexts,
    pageStateHistory,
    recorderApi2,
    initialViewOptions
  );
  cleanupTasks.push(stopViewCollection);
  const { stop: stopResourceCollection } = startResourceCollection(lifeCycle, configuration, pageStateHistory);
  cleanupTasks.push(stopResourceCollection);
  if (isExperimentalFeatureEnabled("long_animation_frame" /* LONG_ANIMATION_FRAME */)) {
    if (configuration.trackLongTasks) {
      const { stop: stopLongAnimationFrameCollection } = startLongAnimationFrameCollection(lifeCycle, configuration);
      cleanupTasks.push(stopLongAnimationFrameCollection);
    }
  } else {
    if (configuration.trackLongTasks) {
      import(
        /* webpackChunkName: "long-task" */
        "./longTaskCollection-TUXOHJME.js"
      ).then(({ startLongTaskCollection }) => {
        startLongTaskCollection(lifeCycle, configuration);
      }).catch((_error) => {
      });
    }
  }
  const { addError } = startErrorCollection(lifeCycle, configuration, pageStateHistory, featureFlagContexts);
  startRequestCollection(lifeCycle, configuration, session);
  const { stop: stopPerformanceCollection } = startPerformanceCollection(lifeCycle, configuration);
  cleanupTasks.push(stopPerformanceCollection);
  const vitalCollection = startVitalCollection(lifeCycle, pageStateHistory);
  const internalContext = startInternalContext(
    configuration.applicationId,
    session,
    viewContexts,
    actionContexts,
    urlContexts
  );
  return {
    addAction,
    addError,
    addTiming,
    addFeatureFlagEvaluation: featureFlagContexts.addFeatureFlagEvaluation,
    startView,
    updateViewName,
    lifeCycle,
    viewContexts,
    session,
    stopSession: () => session.expire(),
    getInternalContext: internalContext.get,
    startDurationVital: vitalCollection.startDurationVital,
    addDurationVital: vitalCollection.addDurationVital,
    stop: () => {
      cleanupTasks.forEach((task) => task());
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
function startRumEventCollection(lifeCycle, configuration, location2, sessionManager, pageStateHistory, locationChangeObservable, domMutationObservable, getCommonContext, reportError) {
  const viewContexts = startViewContexts(lifeCycle);
  const urlContexts = startUrlContexts(lifeCycle, locationChangeObservable, location2);
  const { addAction, actionContexts } = startActionCollection(
    lifeCycle,
    domMutationObservable,
    configuration,
    pageStateHistory
  );
  const displayContext = startDisplayContext(configuration);
  const ciVisibilityContext = startCiVisibilityContext(configuration);
  startRumAssembly(
    configuration,
    lifeCycle,
    sessionManager,
    viewContexts,
    urlContexts,
    actionContexts,
    displayContext,
    ciVisibilityContext,
    getCommonContext,
    reportError
  );
  return {
    viewContexts,
    pageStateHistory,
    urlContexts,
    addAction,
    actionContexts,
    stop: () => {
      ciVisibilityContext.stop();
      displayContext.stop();
      urlContexts.stop();
      viewContexts.stop();
      pageStateHistory.stop();
    }
  };
}

// ../rum-core/src/domain/getSessionReplayUrl.ts
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

// esm/domain/replayStats.js
var MAX_STATS_HISTORY = 10;
var statsPerView;
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
  var replayStats;
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
  if (statsPerView.keys) {
    statsPerView.delete(statsPerView.keys().next().value);
  } else {
    var isFirst_1 = true;
    statsPerView.forEach(function(_value, key) {
      if (isFirst_1) {
        statsPerView.delete(key);
        isFirst_1 = false;
      }
    });
  }
}

// esm/domain/record/serialization/serializationUtils.js
var serializedNodeIds = /* @__PURE__ */ new WeakMap();
function hasSerializedNode(node) {
  return serializedNodeIds.has(node);
}
function nodeAndAncestorsHaveSerializedNode(node) {
  var current = node;
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
  var tagName = element.tagName;
  var value = element.value;
  if (shouldMaskNode(element, nodePrivacyLevel)) {
    var type = element.type;
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
var URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm;
var ABSOLUTE_URL = /^[A-Za-z]+:|^\/\//;
var DATA_URI = /^data:.*,/i;
function switchToAbsoluteUrl(cssText, cssHref) {
  return cssText.replace(URL_IN_CSS_REF, function(matchingSubstring, singleQuote, urlWrappedInSingleQuotes, doubleQuote, urlWrappedInDoubleQuotes, urlNotWrappedInQuotes) {
    var url = urlWrappedInSingleQuotes || urlWrappedInDoubleQuotes || urlNotWrappedInQuotes;
    if (!cssHref || !url || ABSOLUTE_URL.test(url) || DATA_URI.test(url)) {
      return matchingSubstring;
    }
    var quote = singleQuote || doubleQuote || "";
    return "url(".concat(quote).concat(makeUrlAbsolute(url, cssHref)).concat(quote, ")");
  });
}
function makeUrlAbsolute(url, baseUrl) {
  try {
    return buildUrl(url, baseUrl).href;
  } catch (_) {
    return url;
  }
}
var TAG_NAME_REGEX = /[^a-z1-6-_]/;
function getValidTagName(tagName) {
  var processedTagName = tagName.toLowerCase().trim();
  if (TAG_NAME_REGEX.test(processedTagName)) {
    return "div";
  }
  return processedTagName;
}
function censoredImageForSize(width, height) {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='".concat(width, "' height='").concat(height, "' style='background-color:silver'%3E%3C/svg%3E");
}

// esm/types/sessionReplayConstants.js
var RecordType = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Focus: 6,
  ViewEnd: 7,
  VisualViewport: 8,
  FrustrationRecord: 9
};
var NodeType = {
  Document: 0,
  DocumentType: 1,
  Element: 2,
  Text: 3,
  CDATA: 4,
  DocumentFragment: 11
};
var IncrementalSource = {
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
var MouseInteractionType = {
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
var MediaInteractionType = {
  Play: 0,
  Pause: 1
};

// esm/domain/record/serialization/serializeStyleSheets.js
function serializeStyleSheets(cssStyleSheets) {
  if (cssStyleSheets === void 0 || cssStyleSheets.length === 0) {
    return void 0;
  }
  return cssStyleSheets.map(function(cssStyleSheet) {
    var rules = cssStyleSheet.cssRules || cssStyleSheet.rules;
    var cssRules = Array.from(rules, function(cssRule) {
      return cssRule.cssText;
    });
    var styleSheet = {
      cssRules,
      disabled: cssStyleSheet.disabled || void 0,
      media: cssStyleSheet.media.length > 0 ? Array.from(cssStyleSheet.media) : void 0
    };
    return styleSheet;
  });
}

// esm/domain/record/serialization/serializeAttribute.js
function serializeAttribute(element, nodePrivacyLevel, attributeName, configuration) {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return null;
  }
  var attributeValue = element.getAttribute(attributeName);
  if (nodePrivacyLevel === NodePrivacyLevel.MASK && attributeName !== PRIVACY_ATTR_NAME && !STABLE_ATTRIBUTES.includes(attributeName) && attributeName !== configuration.actionNameAttribute) {
    var tagName = element.tagName;
    switch (attributeName) {
      // Mask Attribute text content
      case "title":
      case "alt":
      case "placeholder":
        return CENSORED_STRING_MARK;
    }
    if (tagName === "IMG" && (attributeName === "src" || attributeName === "srcset")) {
      var image = element;
      if (image.naturalWidth > 0) {
        return censoredImageForSize(image.naturalWidth, image.naturalHeight);
      }
      var _a2 = element.getBoundingClientRect(), width = _a2.width, height = _a2.height;
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
    if (attributeValue && startsWith(attributeName, "data-")) {
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

// esm/domain/record/serialization/serializeAttributes.js
function serializeAttributes(element, nodePrivacyLevel, options) {
  var _a2;
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return {};
  }
  var safeAttrs = {};
  var tagName = getValidTagName(element.tagName);
  var doc = element.ownerDocument;
  for (var i = 0; i < element.attributes.length; i += 1) {
    var attribute = element.attributes.item(i);
    var attributeName = attribute.name;
    var attributeValue = serializeAttribute(element, nodePrivacyLevel, attributeName, options.configuration);
    if (attributeValue !== null) {
      safeAttrs[attributeName] = attributeValue;
    }
  }
  if (element.value && (tagName === "textarea" || tagName === "select" || tagName === "option" || tagName === "input")) {
    var formValue = getElementInputValue(element, nodePrivacyLevel);
    if (formValue !== void 0) {
      safeAttrs.value = formValue;
    }
  }
  if (tagName === "option" && nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
    var optionElement = element;
    if (optionElement.selected) {
      safeAttrs.selected = optionElement.selected;
    }
  }
  if (tagName === "link") {
    var stylesheet = Array.from(doc.styleSheets).find(function(s) {
      return s.href === element.href;
    });
    var cssText = getCssRulesString(stylesheet);
    if (cssText && stylesheet) {
      safeAttrs._cssText = cssText;
    }
  }
  if (tagName === "style" && element.sheet) {
    var cssText = getCssRulesString(element.sheet);
    if (cssText) {
      safeAttrs._cssText = cssText;
    }
  }
  var inputElement = element;
  if (tagName === "input" && (inputElement.type === "radio" || inputElement.type === "checkbox")) {
    if (nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
      safeAttrs.checked = !!inputElement.checked;
    } else if (shouldMaskNode(inputElement, nodePrivacyLevel)) {
      delete safeAttrs.checked;
    }
  }
  if (tagName === "audio" || tagName === "video") {
    var mediaElement = element;
    safeAttrs.rr_mediaState = mediaElement.paused ? "paused" : "played";
  }
  var scrollTop;
  var scrollLeft;
  var serializationContext = options.serializationContext;
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
        _a2 = serializationContext.elementsScrollPositions.get(element), scrollTop = _a2.scrollTop, scrollLeft = _a2.scrollLeft;
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
  var rules;
  try {
    rules = cssStyleSheet.rules || cssStyleSheet.cssRules;
  } catch (_a2) {
  }
  if (!rules) {
    return null;
  }
  var styleSheetCssText = Array.from(rules, isSafari() ? getCssRuleStringForSafari : getCssRuleString).join("");
  return switchToAbsoluteUrl(styleSheetCssText, cssStyleSheet.href);
}
function getCssRuleStringForSafari(rule) {
  if (isCSSStyleRule(rule) && rule.selectorText.includes(":")) {
    var escapeColon = /(\[[\w-]+[^\\])(:[^\]]+\])/g;
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

// esm/domain/record/serialization/serializeNode.js
function serializeNodeWithId(node, options) {
  var serializedNode = serializeNode(node, options);
  if (!serializedNode) {
    return null;
  }
  var id = getSerializedNodeId(node) || generateNextId();
  var serializedNodeWithId = serializedNode;
  serializedNodeWithId.id = id;
  setSerializedNodeId(node, id);
  if (options.serializedNodeIds) {
    options.serializedNodeIds.add(id);
  }
  return serializedNodeWithId;
}
var _nextId = 1;
function generateNextId() {
  return _nextId++;
}
function serializeChildNodes(node, options) {
  var result = [];
  forEachChildNodes(node, function(childNode) {
    var serializedChildNode = serializeNodeWithId(childNode, options);
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
  var isShadowRoot = isNodeShadowRoot(element);
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
  var _a2;
  var tagName = getValidTagName(element.tagName);
  var isSVG = isSVGElement(element) || void 0;
  var nodePrivacyLevel = reducePrivacyLevel(getNodeSelfPrivacyLevel(element), options.parentNodePrivacyLevel);
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    var _b = element.getBoundingClientRect(), width = _b.width, height = _b.height;
    return {
      type: NodeType.Element,
      tagName,
      attributes: (_a2 = {
        rr_width: "".concat(width, "px"),
        rr_height: "".concat(height, "px")
      }, _a2[PRIVACY_ATTR_NAME] = PRIVACY_ATTR_VALUE_HIDDEN, _a2),
      childNodes: [],
      isSVG
    };
  }
  if (nodePrivacyLevel === NodePrivacyLevel.IGNORE) {
    return;
  }
  var attributes = serializeAttributes(element, nodePrivacyLevel, options);
  var childNodes = [];
  if (hasChildNodes(element) && // Do not serialize style children as the css rules are already in the _cssText attribute
  tagName !== "style") {
    var childNodesSerializationOptions = void 0;
    if (options.parentNodePrivacyLevel === nodePrivacyLevel && options.ignoreWhiteSpace === (tagName === "head")) {
      childNodesSerializationOptions = options;
    } else {
      childNodesSerializationOptions = assign({}, options, {
        parentNodePrivacyLevel: nodePrivacyLevel,
        ignoreWhiteSpace: tagName === "head"
      });
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
  var textContent = getTextContent(textNode, options.ignoreWhiteSpace || false, options.parentNodePrivacyLevel);
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

// esm/domain/record/serialization/serializeDocument.js
function serializeDocument(document2, configuration, serializationContext) {
  return serializeNodeWithId(document2, {
    serializationContext,
    parentNodePrivacyLevel: configuration.defaultPrivacyLevel,
    configuration
  });
}

// esm/domain/record/eventsUtils.js
function isTouchEvent(event) {
  return Boolean(event.changedTouches);
}
function getEventTarget(event) {
  if (event.composed === true && isNodeShadowHost(event.target)) {
    return event.composedPath()[0];
  }
  return event.target;
}

// esm/domain/record/viewports.js
var TOLERANCE = 25;
function isVisualViewportFactoredIn(visualViewport) {
  return Math.abs(visualViewport.pageTop - visualViewport.offsetTop - window.scrollY) > TOLERANCE || Math.abs(visualViewport.pageLeft - visualViewport.offsetLeft - window.scrollX) > TOLERANCE;
}
var convertMouseEventToLayoutCoordinates = function(clientX, clientY) {
  var visualViewport = window.visualViewport;
  var normalized = {
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
var getVisualViewport = function(visualViewport) {
  return {
    scale: visualViewport.scale,
    offsetLeft: visualViewport.offsetLeft,
    offsetTop: visualViewport.offsetTop,
    pageLeft: visualViewport.pageLeft,
    pageTop: visualViewport.pageTop,
    height: visualViewport.height,
    width: visualViewport.width
  };
};

// esm/domain/record/assembly.js
function assembleIncrementalSnapshot(source, data) {
  return {
    data: assign({
      source
    }, data),
    type: RecordType.IncrementalSnapshot,
    timestamp: timeStampNow()
  };
}

// esm/domain/record/trackers/trackMove.js
var MOUSE_MOVE_OBSERVER_THRESHOLD = 50;
function trackMove(configuration, moveCb) {
  var _a2 = throttle(function(event) {
    var target = getEventTarget(event);
    if (hasSerializedNode(target)) {
      var coordinates = tryToComputeCoordinates(event);
      if (!coordinates) {
        return;
      }
      var position = {
        id: getSerializedNodeId(target),
        timeOffset: 0,
        x: coordinates.x,
        y: coordinates.y
      };
      moveCb(assembleIncrementalSnapshot(isTouchEvent(event) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove, { positions: [position] }));
    }
  }, MOUSE_MOVE_OBSERVER_THRESHOLD, {
    trailing: false
  }), updatePosition = _a2.throttled, cancelThrottle = _a2.cancel;
  var removeListener = addEventListeners(configuration, document, [
    "mousemove",
    "touchmove"
    /* DOM_EVENT.TOUCH_MOVE */
  ], updatePosition, {
    capture: true,
    passive: true
  }).stop;
  return {
    stop: function() {
      removeListener();
      cancelThrottle();
    }
  };
}
function tryToComputeCoordinates(event) {
  var _a2 = isTouchEvent(event) ? event.changedTouches[0] : event, x = _a2.clientX, y = _a2.clientY;
  if (window.visualViewport) {
    var _b = convertMouseEventToLayoutCoordinates(x, y), visualViewportX = _b.visualViewportX, visualViewportY = _b.visualViewportY;
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

// esm/domain/record/trackers/trackMouseInteraction.js
var _a;
var eventTypeToMouseInteraction = (_a = {}, // Listen for pointerup DOM events instead of mouseup for MouseInteraction/MouseUp records. This
// allows to reference such records from Frustration records.
//
// In the context of supporting Mobile Session Replay, we introduced `PointerInteraction` records
// used by the Mobile SDKs in place of `MouseInteraction`. In the future, we should replace
// `MouseInteraction` by `PointerInteraction` in the Browser SDK so we have an uniform way to
// convey such interaction. This would cleanly solve the issue since we would have
// `PointerInteraction/Up` records that we could reference from `Frustration` records.
_a[
  "pointerup"
  /* DOM_EVENT.POINTER_UP */
] = MouseInteractionType.MouseUp, _a[
  "mousedown"
  /* DOM_EVENT.MOUSE_DOWN */
] = MouseInteractionType.MouseDown, _a[
  "click"
  /* DOM_EVENT.CLICK */
] = MouseInteractionType.Click, _a[
  "contextmenu"
  /* DOM_EVENT.CONTEXT_MENU */
] = MouseInteractionType.ContextMenu, _a[
  "dblclick"
  /* DOM_EVENT.DBL_CLICK */
] = MouseInteractionType.DblClick, _a[
  "focus"
  /* DOM_EVENT.FOCUS */
] = MouseInteractionType.Focus, _a[
  "blur"
  /* DOM_EVENT.BLUR */
] = MouseInteractionType.Blur, _a[
  "touchstart"
  /* DOM_EVENT.TOUCH_START */
] = MouseInteractionType.TouchStart, _a[
  "touchend"
  /* DOM_EVENT.TOUCH_END */
] = MouseInteractionType.TouchEnd, _a);
function trackMouseInteraction(configuration, mouseInteractionCb, recordIds) {
  var handler = function(event) {
    var target = getEventTarget(event);
    if (getNodePrivacyLevel(target, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target)) {
      return;
    }
    var id = getSerializedNodeId(target);
    var type = eventTypeToMouseInteraction[event.type];
    var interaction;
    if (type !== MouseInteractionType.Blur && type !== MouseInteractionType.Focus) {
      var coordinates = tryToComputeCoordinates(event);
      if (!coordinates) {
        return;
      }
      interaction = { id, type, x: coordinates.x, y: coordinates.y };
    } else {
      interaction = { id, type };
    }
    var record2 = assign({ id: recordIds.getIdForEvent(event) }, assembleIncrementalSnapshot(IncrementalSource.MouseInteraction, interaction));
    mouseInteractionCb(record2);
  };
  return addEventListeners(configuration, document, Object.keys(eventTypeToMouseInteraction), handler, {
    capture: true,
    passive: true
  });
}

// esm/domain/record/trackers/trackScroll.js
var SCROLL_OBSERVER_THRESHOLD = 100;
function trackScroll(configuration, scrollCb, elementsScrollPositions, target) {
  if (target === void 0) {
    target = document;
  }
  var _a2 = throttle(function(event) {
    var target2 = getEventTarget(event);
    if (!target2 || getNodePrivacyLevel(target2, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target2)) {
      return;
    }
    var id = getSerializedNodeId(target2);
    var scrollPositions = target2 === document ? {
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
  }, SCROLL_OBSERVER_THRESHOLD), updatePosition = _a2.throttled, cancelThrottle = _a2.cancel;
  var removeListener = addEventListener(configuration, target, "scroll", updatePosition, {
    capture: true,
    passive: true
  }).stop;
  return {
    stop: function() {
      removeListener();
      cancelThrottle();
    }
  };
}

// esm/domain/record/trackers/trackViewportResize.js
var VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200;
function trackViewportResize(configuration, viewportResizeCb) {
  var viewportResizeSubscription = initViewportObservable(configuration).subscribe(function(data) {
    viewportResizeCb(assembleIncrementalSnapshot(IncrementalSource.ViewportResize, data));
  });
  return {
    stop: function() {
      viewportResizeSubscription.unsubscribe();
    }
  };
}
function trackVisualViewportResize(configuration, visualViewportResizeCb) {
  var visualViewport = window.visualViewport;
  if (!visualViewport) {
    return { stop: noop };
  }
  var _a2 = throttle(function() {
    visualViewportResizeCb({
      data: getVisualViewport(visualViewport),
      type: RecordType.VisualViewport,
      timestamp: timeStampNow()
    });
  }, VISUAL_VIEWPORT_OBSERVER_THRESHOLD, {
    trailing: false
  }), updateDimension = _a2.throttled, cancelThrottle = _a2.cancel;
  var removeListener = addEventListeners(configuration, visualViewport, [
    "resize",
    "scroll"
    /* DOM_EVENT.SCROLL */
  ], updateDimension, {
    capture: true,
    passive: true
  }).stop;
  return {
    stop: function() {
      removeListener();
      cancelThrottle();
    }
  };
}

// esm/domain/record/trackers/trackMediaInteraction.js
function trackMediaInteraction(configuration, mediaInteractionCb) {
  return addEventListeners(configuration, document, [
    "play",
    "pause"
    /* DOM_EVENT.PAUSE */
  ], function(event) {
    var target = getEventTarget(event);
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

// esm/domain/record/trackers/trackStyleSheet.js
function trackStyleSheet(styleSheetCb) {
  function checkStyleSheetAndCallback(styleSheet, callback) {
    if (styleSheet && hasSerializedNode(styleSheet.ownerNode)) {
      callback(getSerializedNodeId(styleSheet.ownerNode));
    }
  }
  var instrumentationStoppers = [
    instrumentMethod(CSSStyleSheet.prototype, "insertRule", function(_a2) {
      var styleSheet = _a2.target, _b = _a2.parameters, rule = _b[0], index = _b[1];
      checkStyleSheetAndCallback(styleSheet, function(id) {
        return styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
          id,
          adds: [{ rule, index }]
        }));
      });
    }),
    instrumentMethod(CSSStyleSheet.prototype, "deleteRule", function(_a2) {
      var styleSheet = _a2.target, index = _a2.parameters[0];
      checkStyleSheetAndCallback(styleSheet, function(id) {
        return styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
          id,
          removes: [{ index }]
        }));
      });
    })
  ];
  if (typeof CSSGroupingRule !== "undefined") {
    instrumentGroupingCSSRuleClass(CSSGroupingRule);
  } else {
    instrumentGroupingCSSRuleClass(CSSMediaRule);
    instrumentGroupingCSSRuleClass(CSSSupportsRule);
  }
  function instrumentGroupingCSSRuleClass(cls) {
    instrumentationStoppers.push(instrumentMethod(cls.prototype, "insertRule", function(_a2) {
      var styleSheet = _a2.target, _b = _a2.parameters, rule = _b[0], index = _b[1];
      checkStyleSheetAndCallback(styleSheet.parentStyleSheet, function(id) {
        var path = getPathToNestedCSSRule(styleSheet);
        if (path) {
          path.push(index || 0);
          styleSheetCb(assembleIncrementalSnapshot(IncrementalSource.StyleSheetRule, {
            id,
            adds: [{ rule, index: path }]
          }));
        }
      });
    }), instrumentMethod(cls.prototype, "deleteRule", function(_a2) {
      var styleSheet = _a2.target, index = _a2.parameters[0];
      checkStyleSheetAndCallback(styleSheet.parentStyleSheet, function(id) {
        var path = getPathToNestedCSSRule(styleSheet);
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
    stop: function() {
      instrumentationStoppers.forEach(function(stopper) {
        return stopper.stop();
      });
    }
  };
}
function getPathToNestedCSSRule(rule) {
  var path = [];
  var currentRule = rule;
  while (currentRule.parentRule) {
    var rules_1 = Array.from(currentRule.parentRule.cssRules);
    var index_1 = rules_1.indexOf(currentRule);
    path.unshift(index_1);
    currentRule = currentRule.parentRule;
  }
  if (!currentRule.parentStyleSheet) {
    return;
  }
  var rules = Array.from(currentRule.parentStyleSheet.cssRules);
  var index = rules.indexOf(currentRule);
  path.unshift(index);
  return path;
}

// esm/domain/record/trackers/trackFocus.js
function trackFocus(configuration, focusCb) {
  return addEventListeners(configuration, window, [
    "focus",
    "blur"
    /* DOM_EVENT.BLUR */
  ], function() {
    focusCb({
      data: { has_focus: document.hasFocus() },
      type: RecordType.Focus,
      timestamp: timeStampNow()
    });
  });
}

// esm/domain/record/trackers/trackFrustration.js
function trackFrustration(lifeCycle, frustrationCb, recordIds) {
  var frustrationSubscription = lifeCycle.subscribe(12, function(data) {
    var _a2, _b;
    if (data.rawRumEvent.type === "action" && data.rawRumEvent.action.type === "click" && ((_b = (_a2 = data.rawRumEvent.action.frustration) === null || _a2 === void 0 ? void 0 : _a2.type) === null || _b === void 0 ? void 0 : _b.length) && "events" in data.domainContext && data.domainContext.events && data.domainContext.events.length) {
      frustrationCb({
        timestamp: data.rawRumEvent.date,
        type: RecordType.FrustrationRecord,
        data: {
          frustrationTypes: data.rawRumEvent.action.frustration.type,
          recordIds: data.domainContext.events.map(function(e) {
            return recordIds.getIdForEvent(e);
          })
        }
      });
    }
  });
  return {
    stop: function() {
      frustrationSubscription.unsubscribe();
    }
  };
}

// esm/domain/record/trackers/trackViewEnd.js
function trackViewEnd(lifeCycle, viewEndCb) {
  var viewEndSubscription = lifeCycle.subscribe(5, function() {
    viewEndCb({
      timestamp: timeStampNow(),
      type: RecordType.ViewEnd
    });
  });
  return {
    stop: function() {
      viewEndSubscription.unsubscribe();
    }
  };
}

// esm/domain/record/trackers/trackInput.js
function trackInput(configuration, inputCb, target) {
  if (target === void 0) {
    target = document;
  }
  var defaultPrivacyLevel = configuration.defaultPrivacyLevel;
  var lastInputStateMap = /* @__PURE__ */ new WeakMap();
  var isShadowRoot = target !== document;
  var stopEventListeners = addEventListeners(
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
    function(event) {
      var target2 = getEventTarget(event);
      if (target2 instanceof HTMLInputElement || target2 instanceof HTMLTextAreaElement || target2 instanceof HTMLSelectElement) {
        onElementChange(target2);
      }
    },
    {
      capture: true,
      passive: true
    }
  ).stop;
  var stopPropertySetterInstrumentation;
  if (!isShadowRoot) {
    var instrumentationStoppers_1 = [
      instrumentSetter(HTMLInputElement.prototype, "value", onElementChange),
      instrumentSetter(HTMLInputElement.prototype, "checked", onElementChange),
      instrumentSetter(HTMLSelectElement.prototype, "value", onElementChange),
      instrumentSetter(HTMLTextAreaElement.prototype, "value", onElementChange),
      instrumentSetter(HTMLSelectElement.prototype, "selectedIndex", onElementChange)
    ];
    stopPropertySetterInstrumentation = function() {
      instrumentationStoppers_1.forEach(function(stopper) {
        return stopper.stop();
      });
    };
  } else {
    stopPropertySetterInstrumentation = noop;
  }
  return {
    stop: function() {
      stopPropertySetterInstrumentation();
      stopEventListeners();
    }
  };
  function onElementChange(target2) {
    var nodePrivacyLevel = getNodePrivacyLevel(target2, defaultPrivacyLevel);
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      return;
    }
    var type = target2.type;
    var inputState;
    if (type === "radio" || type === "checkbox") {
      if (shouldMaskNode(target2, nodePrivacyLevel)) {
        return;
      }
      inputState = { isChecked: target2.checked };
    } else {
      var value = getElementInputValue(target2, nodePrivacyLevel);
      if (value === void 0) {
        return;
      }
      inputState = { text: value };
    }
    cbWithDedup(target2, inputState);
    var name = target2.name;
    if (type === "radio" && name && target2.checked) {
      forEach(document.querySelectorAll('input[type="radio"][name="'.concat(cssEscape(name), '"]')), function(el) {
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
    var lastInputState = lastInputStateMap.get(target2);
    if (!lastInputState || lastInputState.text !== inputState.text || lastInputState.isChecked !== inputState.isChecked) {
      lastInputStateMap.set(target2, inputState);
      inputCb(assembleIncrementalSnapshot(IncrementalSource.Input, assign({
        id: getSerializedNodeId(target2)
      }, inputState)));
    }
  }
}

// esm/domain/record/mutationBatch.js
var MUTATION_PROCESS_MAX_DELAY = 100;
var MUTATION_PROCESS_MIN_DELAY = 16;
function createMutationBatch(processMutationBatch) {
  var cancelScheduledFlush = noop;
  var pendingMutations = [];
  function flush() {
    cancelScheduledFlush();
    processMutationBatch(pendingMutations);
    pendingMutations = [];
  }
  var _a2 = throttle(flush, MUTATION_PROCESS_MIN_DELAY, {
    leading: false
  }), throttledFlush = _a2.throttled, cancelThrottle = _a2.cancel;
  return {
    addMutations: function(mutations) {
      if (pendingMutations.length === 0) {
        cancelScheduledFlush = requestIdleCallback(throttledFlush, { timeout: MUTATION_PROCESS_MAX_DELAY });
      }
      pendingMutations.push.apply(pendingMutations, mutations);
    },
    flush,
    stop: function() {
      cancelScheduledFlush();
      cancelThrottle();
    }
  };
}
function requestIdleCallback(callback, opts) {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    var id_1 = window.requestIdleCallback(monitor(callback), opts);
    return function() {
      return window.cancelIdleCallback(id_1);
    };
  }
  var id = window.requestAnimationFrame(monitor(callback));
  return function() {
    return window.cancelAnimationFrame(id);
  };
}

// esm/domain/record/trackers/trackMutation.js
function trackMutation(mutationCallback, configuration, shadowRootsController, target) {
  var MutationObserver = getMutationObserverConstructor();
  if (!MutationObserver) {
    return { stop: noop, flush: noop };
  }
  var mutationBatch = createMutationBatch(function(mutations) {
    processMutations(mutations.concat(observer2.takeRecords()), mutationCallback, configuration, shadowRootsController);
  });
  var observer2 = new MutationObserver(monitor(mutationBatch.addMutations));
  observer2.observe(target, {
    attributeOldValue: true,
    attributes: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true
  });
  return {
    stop: function() {
      observer2.disconnect();
      mutationBatch.stop();
    },
    flush: function() {
      mutationBatch.flush();
    }
  };
}
function processMutations(mutations, mutationCallback, configuration, shadowRootsController) {
  var nodePrivacyLevelCache = /* @__PURE__ */ new Map();
  mutations.filter(function(mutation) {
    return mutation.type === "childList";
  }).forEach(function(mutation) {
    mutation.removedNodes.forEach(function(removedNode) {
      traverseRemovedShadowDom(removedNode, shadowRootsController.removeShadowRoot);
    });
  });
  var filteredMutations = mutations.filter(function(mutation) {
    return mutation.target.isConnected && nodeAndAncestorsHaveSerializedNode(mutation.target) && getNodePrivacyLevel(mutation.target, configuration.defaultPrivacyLevel, nodePrivacyLevelCache) !== NodePrivacyLevel.HIDDEN;
  });
  var _a2 = processChildListMutations(filteredMutations.filter(function(mutation) {
    return mutation.type === "childList";
  }), configuration, shadowRootsController, nodePrivacyLevelCache), adds = _a2.adds, removes = _a2.removes, hasBeenSerialized = _a2.hasBeenSerialized;
  var texts = processCharacterDataMutations(filteredMutations.filter(function(mutation) {
    return mutation.type === "characterData" && !hasBeenSerialized(mutation.target);
  }), configuration, nodePrivacyLevelCache);
  var attributes = processAttributesMutations(filteredMutations.filter(function(mutation) {
    return mutation.type === "attributes" && !hasBeenSerialized(mutation.target);
  }), configuration, nodePrivacyLevelCache);
  if (!texts.length && !attributes.length && !removes.length && !adds.length) {
    return;
  }
  mutationCallback(assembleIncrementalSnapshot(IncrementalSource.Mutation, { adds, removes, texts, attributes }));
}
function processChildListMutations(mutations, configuration, shadowRootsController, nodePrivacyLevelCache) {
  var addedAndMovedNodes = /* @__PURE__ */ new Set();
  var removedNodes = /* @__PURE__ */ new Map();
  var _loop_1 = function(mutation2) {
    mutation2.addedNodes.forEach(function(node2) {
      addedAndMovedNodes.add(node2);
    });
    mutation2.removedNodes.forEach(function(node2) {
      if (!addedAndMovedNodes.has(node2)) {
        removedNodes.set(node2, mutation2.target);
      }
      addedAndMovedNodes.delete(node2);
    });
  };
  for (var _i = 0, mutations_1 = mutations; _i < mutations_1.length; _i++) {
    var mutation = mutations_1[_i];
    _loop_1(mutation);
  }
  var sortedAddedAndMovedNodes = Array.from(addedAndMovedNodes);
  sortAddedAndMovedNodes(sortedAddedAndMovedNodes);
  var serializedNodeIds2 = /* @__PURE__ */ new Set();
  var addedNodeMutations = [];
  for (var _a2 = 0, sortedAddedAndMovedNodes_1 = sortedAddedAndMovedNodes; _a2 < sortedAddedAndMovedNodes_1.length; _a2++) {
    var node = sortedAddedAndMovedNodes_1[_a2];
    if (hasBeenSerialized(node)) {
      continue;
    }
    var parentNodePrivacyLevel = getNodePrivacyLevel(node.parentNode, configuration.defaultPrivacyLevel, nodePrivacyLevelCache);
    if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      continue;
    }
    var serializedNode = serializeNodeWithId(node, {
      serializedNodeIds: serializedNodeIds2,
      parentNodePrivacyLevel,
      serializationContext: { status: 2, shadowRootsController },
      configuration
    });
    if (!serializedNode) {
      continue;
    }
    var parentNode = getParentNode(node);
    addedNodeMutations.push({
      nextId: getNextSibling(node),
      parentId: getSerializedNodeId(parentNode),
      node: serializedNode
    });
  }
  var removedNodeMutations = [];
  removedNodes.forEach(function(parent, node2) {
    if (hasSerializedNode(node2)) {
      removedNodeMutations.push({
        parentId: getSerializedNodeId(parent),
        id: getSerializedNodeId(node2)
      });
    }
  });
  return { adds: addedNodeMutations, removes: removedNodeMutations, hasBeenSerialized };
  function hasBeenSerialized(node2) {
    return hasSerializedNode(node2) && serializedNodeIds2.has(getSerializedNodeId(node2));
  }
  function getNextSibling(node2) {
    var nextSibling = node2.nextSibling;
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
  var _a2;
  var textMutations = [];
  var handledNodes = /* @__PURE__ */ new Set();
  var filteredMutations = mutations.filter(function(mutation2) {
    if (handledNodes.has(mutation2.target)) {
      return false;
    }
    handledNodes.add(mutation2.target);
    return true;
  });
  for (var _i = 0, filteredMutations_1 = filteredMutations; _i < filteredMutations_1.length; _i++) {
    var mutation = filteredMutations_1[_i];
    var value = mutation.target.textContent;
    if (value === mutation.oldValue) {
      continue;
    }
    var parentNodePrivacyLevel = getNodePrivacyLevel(getParentNode(mutation.target), configuration.defaultPrivacyLevel, nodePrivacyLevelCache);
    if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      continue;
    }
    textMutations.push({
      id: getSerializedNodeId(mutation.target),
      // TODO: pass a valid "ignoreWhiteSpace" argument
      value: (_a2 = getTextContent(mutation.target, false, parentNodePrivacyLevel)) !== null && _a2 !== void 0 ? _a2 : null
    });
  }
  return textMutations;
}
function processAttributesMutations(mutations, configuration, nodePrivacyLevelCache) {
  var attributeMutations = [];
  var handledElements = /* @__PURE__ */ new Map();
  var filteredMutations = mutations.filter(function(mutation2) {
    var handledAttributes = handledElements.get(mutation2.target);
    if (handledAttributes && handledAttributes.has(mutation2.attributeName)) {
      return false;
    }
    if (!handledAttributes) {
      handledElements.set(mutation2.target, /* @__PURE__ */ new Set([mutation2.attributeName]));
    } else {
      handledAttributes.add(mutation2.attributeName);
    }
    return true;
  });
  var emittedMutations = /* @__PURE__ */ new Map();
  for (var _i = 0, filteredMutations_2 = filteredMutations; _i < filteredMutations_2.length; _i++) {
    var mutation = filteredMutations_2[_i];
    var uncensoredValue = mutation.target.getAttribute(mutation.attributeName);
    if (uncensoredValue === mutation.oldValue) {
      continue;
    }
    var privacyLevel = getNodePrivacyLevel(mutation.target, configuration.defaultPrivacyLevel, nodePrivacyLevelCache);
    var attributeValue = serializeAttribute(mutation.target, privacyLevel, mutation.attributeName, configuration);
    var transformedValue = void 0;
    if (mutation.attributeName === "value") {
      var inputValue = getElementInputValue(mutation.target, privacyLevel);
      if (inputValue === void 0) {
        continue;
      }
      transformedValue = inputValue;
    } else if (typeof attributeValue === "string") {
      transformedValue = attributeValue;
    } else {
      transformedValue = null;
    }
    var emittedMutation = emittedMutations.get(mutation.target);
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
  nodes.sort(function(a, b) {
    var position = a.compareDocumentPosition(b);
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
  forEachChildNodes(removedNode, function(childNode) {
    return traverseRemovedShadowDom(childNode, shadowDomRemovedCallback);
  });
}

// esm/domain/record/elementsScrollPositions.js
function createElementsScrollPositions() {
  var scrollPositionsByElement = /* @__PURE__ */ new WeakMap();
  return {
    set: function(element, scrollPositions) {
      if (element === document && !document.scrollingElement) {
        return;
      }
      scrollPositionsByElement.set(element === document ? document.scrollingElement : element, scrollPositions);
    },
    get: function(element) {
      return scrollPositionsByElement.get(element);
    },
    has: function(element) {
      return scrollPositionsByElement.has(element);
    }
  };
}

// esm/domain/record/shadowRootsController.js
var initShadowRootsController = function(configuration, callback, elementsScrollPositions) {
  var controllerByShadowRoot = /* @__PURE__ */ new Map();
  var shadowRootsController = {
    addShadowRoot: function(shadowRoot) {
      if (controllerByShadowRoot.has(shadowRoot)) {
        return;
      }
      var mutationTracker = trackMutation(callback, configuration, shadowRootsController, shadowRoot);
      var inputTracker = trackInput(configuration, callback, shadowRoot);
      var scrollTracker = trackScroll(configuration, callback, elementsScrollPositions, shadowRoot);
      controllerByShadowRoot.set(shadowRoot, {
        flush: function() {
          return mutationTracker.flush();
        },
        stop: function() {
          mutationTracker.stop();
          inputTracker.stop();
          scrollTracker.stop();
        }
      });
    },
    removeShadowRoot: function(shadowRoot) {
      var entry = controllerByShadowRoot.get(shadowRoot);
      if (!entry) {
        return;
      }
      entry.stop();
      controllerByShadowRoot.delete(shadowRoot);
    },
    stop: function() {
      controllerByShadowRoot.forEach(function(_a2) {
        var stop = _a2.stop;
        return stop();
      });
    },
    flush: function() {
      controllerByShadowRoot.forEach(function(_a2) {
        var flush = _a2.flush;
        return flush();
      });
    }
  };
  return shadowRootsController;
};

// esm/domain/record/startFullSnapshots.js
function startFullSnapshots(elementsScrollPositions, shadowRootsController, lifeCycle, configuration, flushMutations, fullSnapshotCallback) {
  var takeFullSnapshot = function(timestamp, serializationContext) {
    if (timestamp === void 0) {
      timestamp = timeStampNow();
    }
    if (serializationContext === void 0) {
      serializationContext = {
        status: 0,
        elementsScrollPositions,
        shadowRootsController
      };
    }
    var _a2 = getViewportDimension(), width = _a2.width, height = _a2.height;
    var records = [
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
  var unsubscribe = lifeCycle.subscribe(3, function(view) {
    flushMutations();
    fullSnapshotCallback(takeFullSnapshot(view.startClocks.timeStamp, {
      shadowRootsController,
      status: 1,
      elementsScrollPositions
    }));
  }).unsubscribe;
  return {
    stop: unsubscribe
  };
}

// esm/domain/record/recordIds.js
function initRecordIds() {
  var recordIds = /* @__PURE__ */ new WeakMap();
  var nextId = 1;
  return {
    getIdForEvent: function(event) {
      if (!recordIds.has(event)) {
        recordIds.set(event, nextId++);
      }
      return recordIds.get(event);
    }
  };
}

// esm/domain/record/record.js
function record(options) {
  var emit = options.emit, configuration = options.configuration, lifeCycle = options.lifeCycle;
  if (!emit) {
    throw new Error("emit function is required");
  }
  var emitAndComputeStats = function(record2) {
    emit(record2);
    sendToExtension("record", { record: record2 });
    var view = options.viewContexts.findView();
    addRecord(view.id);
  };
  var elementsScrollPositions = createElementsScrollPositions();
  var shadowRootsController = initShadowRootsController(configuration, emitAndComputeStats, elementsScrollPositions);
  var stopFullSnapshots = startFullSnapshots(elementsScrollPositions, shadowRootsController, lifeCycle, configuration, flushMutations, function(records) {
    return records.forEach(function(record2) {
      return emitAndComputeStats(record2);
    });
  }).stop;
  function flushMutations() {
    shadowRootsController.flush();
    mutationTracker.flush();
  }
  var recordIds = initRecordIds();
  var mutationTracker = trackMutation(emitAndComputeStats, configuration, shadowRootsController, document);
  var trackers = [
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
    trackViewEnd(lifeCycle, function(viewEndRecord) {
      flushMutations();
      emitAndComputeStats(viewEndRecord);
    })
  ];
  return {
    stop: function() {
      shadowRootsController.stop();
      trackers.forEach(function(tracker) {
        return tracker.stop();
      });
      stopFullSnapshots();
    },
    flushMutations,
    shadowRootsController
  };
}

// esm/domain/segmentCollection/buildReplayPayload.js
function buildReplayPayload(data, metadata, rawSegmentBytesCount) {
  var formData = new FormData();
  formData.append("segment", new Blob([data], {
    type: "application/octet-stream"
  }), "".concat(metadata.session.id, "-").concat(metadata.start));
  var metadataAndSegmentSizes = assign({
    raw_segment_size: rawSegmentBytesCount,
    compressed_segment_size: data.byteLength
  }, metadata);
  var serializedMetadataAndSegmentSizes = JSON.stringify(metadataAndSegmentSizes);
  formData.append("event", new Blob([serializedMetadataAndSegmentSizes], { type: "application/json" }));
  return { data: formData, bytesCount: data.byteLength };
}

// esm/domain/segmentCollection/segment.js
function createSegment(_a2) {
  var context = _a2.context, creationReason = _a2.creationReason, encoder = _a2.encoder;
  var encodedBytesCount = 0;
  var viewId = context.view.id;
  var metadata = assign({
    start: Infinity,
    end: -Infinity,
    creation_reason: creationReason,
    records_count: 0,
    has_full_snapshot: false,
    index_in_view: getSegmentsCount(viewId),
    source: "browser"
  }, context);
  addSegment(viewId);
  function addRecord2(record2, callback) {
    metadata.start = Math.min(metadata.start, record2.timestamp);
    metadata.end = Math.max(metadata.end, record2.timestamp);
    metadata.records_count += 1;
    metadata.has_full_snapshot || (metadata.has_full_snapshot = record2.type === RecordType.FullSnapshot);
    var prefix = encoder.isEmpty ? '{"records":[' : ",";
    encoder.write(prefix + JSON.stringify(record2), function(additionalEncodedBytesCount) {
      encodedBytesCount += additionalEncodedBytesCount;
      callback(encodedBytesCount);
    });
  }
  function flush(callback) {
    if (encoder.isEmpty) {
      throw new Error("Empty segment flushed");
    }
    encoder.write("],".concat(JSON.stringify(metadata).slice(1), "\n"));
    encoder.finish(function(encoderResult) {
      addWroteData(metadata.view.id, encoderResult.rawBytesCount);
      callback(metadata, encoderResult);
    });
  }
  return { addRecord: addRecord2, flush };
}

// esm/domain/segmentCollection/segmentCollection.js
var SEGMENT_DURATION_LIMIT = 30 * ONE_SECOND;
var SEGMENT_BYTES_LIMIT = 6e4;
function startSegmentCollection(lifeCycle, configuration, sessionManager, viewContexts, httpRequest, encoder) {
  return doStartSegmentCollection(lifeCycle, function() {
    return computeSegmentContext(configuration.applicationId, sessionManager, viewContexts);
  }, httpRequest, encoder);
}
function doStartSegmentCollection(lifeCycle, getSegmentContext, httpRequest, encoder) {
  var state2 = {
    status: 0,
    nextSegmentCreationReason: "init"
  };
  var unsubscribeViewCreated = lifeCycle.subscribe(3, function() {
    flushSegment("view_change");
  }).unsubscribe;
  var unsubscribePageExited = lifeCycle.subscribe(11, function(pageExitEvent) {
    flushSegment(pageExitEvent.reason);
  }).unsubscribe;
  function flushSegment(flushReason) {
    if (state2.status === 1) {
      state2.segment.flush(function(metadata, encoderResult) {
        var payload = buildReplayPayload(encoderResult.output, metadata, encoderResult.rawBytesCount);
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
    addRecord: function(record2) {
      if (state2.status === 2) {
        return;
      }
      if (state2.status === 0) {
        var context = getSegmentContext();
        if (!context) {
          return;
        }
        state2 = {
          status: 1,
          segment: createSegment({ encoder, context, creationReason: state2.nextSegmentCreationReason }),
          expirationTimeoutId: setTimeout(function() {
            flushSegment("segment_duration_limit");
          }, SEGMENT_DURATION_LIMIT)
        };
      }
      state2.segment.addRecord(record2, function(encodedBytesCount) {
        if (encodedBytesCount > SEGMENT_BYTES_LIMIT) {
          flushSegment("segment_bytes_limit");
        }
      });
    },
    stop: function() {
      flushSegment("stop");
      unsubscribeViewCreated();
      unsubscribePageExited();
    }
  };
}
function computeSegmentContext(applicationId, sessionManager, viewContexts) {
  var session = sessionManager.findTrackedSession();
  var viewContext = viewContexts.findView();
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

// esm/domain/startRecordBridge.js
function startRecordBridge(viewContexts) {
  var bridge = getEventBridge();
  return {
    addRecord: function(record2) {
      var view = viewContexts.findView();
      bridge.send("record", record2, view.id);
    }
  };
}

// esm/boot/startRecording.js
function startRecording(lifeCycle, configuration, sessionManager, viewContexts, encoder, httpRequest) {
  var cleanupTasks = [];
  var reportError = function(error) {
    lifeCycle.notify(14, { error });
    addTelemetryDebug("Error reported to customer", { "error.message": error.message });
  };
  var replayRequest = httpRequest || createHttpRequest(configuration, configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError);
  var addRecord2;
  if (!canUseEventBridge()) {
    var segmentCollection = startSegmentCollection(lifeCycle, configuration, sessionManager, viewContexts, replayRequest, encoder);
    addRecord2 = segmentCollection.addRecord;
    cleanupTasks.push(segmentCollection.stop);
  } else {
    ;
    addRecord2 = startRecordBridge(viewContexts).addRecord;
  }
  var stopRecording = record({
    emit: addRecord2,
    configuration,
    lifeCycle,
    viewContexts
  }).stop;
  cleanupTasks.push(stopRecording);
  return {
    stop: function() {
      cleanupTasks.forEach(function(task) {
        return task();
      });
    }
  };
}

// esm/boot/isBrowserSupported.js
function isBrowserSupported() {
  return (
    // Array.from is a bit less supported by browsers than CSSSupportsRule, but has higher chances
    // to be polyfilled. Test for both to be more confident. We could add more things if we find out
    // this test is not sufficient.
    typeof Array.from === "function" && typeof CSSSupportsRule === "function" && typeof URL.createObjectURL === "function" && "forEach" in NodeList.prototype
  );
}

// esm/domain/getSessionReplayLink.js
function getSessionReplayLink(configuration, sessionManager, viewContexts, isRecordingStarted) {
  var session = sessionManager.findTrackedSession();
  var errorType = getErrorType(session, isRecordingStarted);
  var viewContext = viewContexts.findView();
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

// esm/domain/deflate/deflateEncoder.js
function createDeflateEncoder(configuration, worker, streamId) {
  var rawBytesCount = 0;
  var compressedData = [];
  var compressedDataTrailer;
  var nextWriteActionId = 0;
  var pendingWriteActions = [];
  var removeMessageListener = addEventListener(configuration, worker, "message", function(_a2) {
    var workerResponse = _a2.data;
    if (workerResponse.type !== "wrote" || workerResponse.streamId !== streamId) {
      return;
    }
    rawBytesCount += workerResponse.additionalBytesCount;
    compressedData.push(workerResponse.result);
    compressedDataTrailer = workerResponse.trailer;
    var nextPendingAction = pendingWriteActions.shift();
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
  }).stop;
  function consumeResult() {
    var output = compressedData.length === 0 ? new Uint8Array(0) : concatBuffers(compressedData.concat(compressedDataTrailer));
    var result = {
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
    write: function(data, callback) {
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
    finish: function(callback) {
      sendResetIfNeeded();
      if (!pendingWriteActions.length) {
        callback(consumeResult());
      } else {
        pendingWriteActions.forEach(function(pendingWriteAction) {
          delete pendingWriteAction.writeCallback;
        });
        pendingWriteActions[pendingWriteActions.length - 1].finishCallback = function() {
          return callback(consumeResult());
        };
      }
    },
    finishSync: function() {
      sendResetIfNeeded();
      var pendingData = pendingWriteActions.map(function(pendingWriteAction) {
        delete pendingWriteAction.writeCallback;
        delete pendingWriteAction.finishCallback;
        return pendingWriteAction.data;
      }).join("");
      return assign(consumeResult(), {
        pendingData
      });
    },
    estimateEncodedBytesCount: function(data) {
      return data.length / 8;
    },
    stop: function() {
      removeMessageListener();
    }
  };
}

// esm/domain/deflate/deflateWorker.js
var INITIALIZATION_TIME_OUT_DELAY = 10 * ONE_SECOND;
function createDeflateWorker(configuration) {
  return new Worker(configuration.workerUrl || URL.createObjectURL(new Blob(['!function(){"use strict";function t(t){for(var e=t.reduce((function(t,e){return t+e.length}),0),a=new Uint8Array(e),n=0,r=0,i=t;r<i.length;r++){var s=i[r];a.set(s,n),n+=s.length}return a}function e(t){for(var e=t.length;--e>=0;)t[e]=0}var a=256,n=286,r=30,i=15,s=new Uint8Array([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]),_=new Uint8Array([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]),h=new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7]),l=new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),o=new Array(576);e(o);var d=new Array(60);e(d);var u=new Array(512);e(u);var f=new Array(256);e(f);var c=new Array(29);e(c);var p,g,v,w=new Array(r);function b(t,e,a,n,r){this.static_tree=t,this.extra_bits=e,this.extra_base=a,this.elems=n,this.max_length=r,this.has_stree=t&&t.length}function m(t,e){this.dyn_tree=t,this.max_code=0,this.stat_desc=e}e(w);var y=function(t){return t<256?u[t]:u[256+(t>>>7)]},k=function(t,e){t.pending_buf[t.pending++]=255&e,t.pending_buf[t.pending++]=e>>>8&255},z=function(t,e,a){t.bi_valid>16-a?(t.bi_buf|=e<<t.bi_valid&65535,k(t,t.bi_buf),t.bi_buf=e>>16-t.bi_valid,t.bi_valid+=a-16):(t.bi_buf|=e<<t.bi_valid&65535,t.bi_valid+=a)},x=function(t,e,a){z(t,a[2*e],a[2*e+1])},A=function(t,e){var a=0;do{a|=1&t,t>>>=1,a<<=1}while(--e>0);return a>>>1},E=function(t,e,a){var n,r,s=new Array(16),_=0;for(n=1;n<=i;n++)s[n]=_=_+a[n-1]<<1;for(r=0;r<=e;r++){var h=t[2*r+1];0!==h&&(t[2*r]=A(s[h]++,h))}},Z=function(t){var e;for(e=0;e<n;e++)t.dyn_ltree[2*e]=0;for(e=0;e<r;e++)t.dyn_dtree[2*e]=0;for(e=0;e<19;e++)t.bl_tree[2*e]=0;t.dyn_ltree[512]=1,t.opt_len=t.static_len=0,t.last_lit=t.matches=0},U=function(t){t.bi_valid>8?k(t,t.bi_buf):t.bi_valid>0&&(t.pending_buf[t.pending++]=t.bi_buf),t.bi_buf=0,t.bi_valid=0},S=function(t,e,a,n){var r=2*e,i=2*a;return t[r]<t[i]||t[r]===t[i]&&n[e]<=n[a]},R=function(t,e,a){for(var n=t.heap[a],r=a<<1;r<=t.heap_len&&(r<t.heap_len&&S(e,t.heap[r+1],t.heap[r],t.depth)&&r++,!S(e,n,t.heap[r],t.depth));)t.heap[a]=t.heap[r],a=r,r<<=1;t.heap[a]=n},L=function(t,e,n){var r,i,h,l,o=0;if(0!==t.last_lit)do{r=t.pending_buf[t.d_buf+2*o]<<8|t.pending_buf[t.d_buf+2*o+1],i=t.pending_buf[t.l_buf+o],o++,0===r?x(t,i,e):(h=f[i],x(t,h+a+1,e),0!==(l=s[h])&&(i-=c[h],z(t,i,l)),r--,h=y(r),x(t,h,n),0!==(l=_[h])&&(r-=w[h],z(t,r,l)))}while(o<t.last_lit);x(t,256,e)},F=function(t,e){var a,n,r,s=e.dyn_tree,_=e.stat_desc.static_tree,h=e.stat_desc.has_stree,l=e.stat_desc.elems,o=-1;for(t.heap_len=0,t.heap_max=573,a=0;a<l;a++)0!==s[2*a]?(t.heap[++t.heap_len]=o=a,t.depth[a]=0):s[2*a+1]=0;for(;t.heap_len<2;)s[2*(r=t.heap[++t.heap_len]=o<2?++o:0)]=1,t.depth[r]=0,t.opt_len--,h&&(t.static_len-=_[2*r+1]);for(e.max_code=o,a=t.heap_len>>1;a>=1;a--)R(t,s,a);r=l;do{a=t.heap[1],t.heap[1]=t.heap[t.heap_len--],R(t,s,1),n=t.heap[1],t.heap[--t.heap_max]=a,t.heap[--t.heap_max]=n,s[2*r]=s[2*a]+s[2*n],t.depth[r]=(t.depth[a]>=t.depth[n]?t.depth[a]:t.depth[n])+1,s[2*a+1]=s[2*n+1]=r,t.heap[1]=r++,R(t,s,1)}while(t.heap_len>=2);t.heap[--t.heap_max]=t.heap[1],function(t,e){var a,n,r,s,_,h,l=e.dyn_tree,o=e.max_code,d=e.stat_desc.static_tree,u=e.stat_desc.has_stree,f=e.stat_desc.extra_bits,c=e.stat_desc.extra_base,p=e.stat_desc.max_length,g=0;for(s=0;s<=i;s++)t.bl_count[s]=0;for(l[2*t.heap[t.heap_max]+1]=0,a=t.heap_max+1;a<573;a++)(s=l[2*l[2*(n=t.heap[a])+1]+1]+1)>p&&(s=p,g++),l[2*n+1]=s,n>o||(t.bl_count[s]++,_=0,n>=c&&(_=f[n-c]),h=l[2*n],t.opt_len+=h*(s+_),u&&(t.static_len+=h*(d[2*n+1]+_)));if(0!==g){do{for(s=p-1;0===t.bl_count[s];)s--;t.bl_count[s]--,t.bl_count[s+1]+=2,t.bl_count[p]--,g-=2}while(g>0);for(s=p;0!==s;s--)for(n=t.bl_count[s];0!==n;)(r=t.heap[--a])>o||(l[2*r+1]!==s&&(t.opt_len+=(s-l[2*r+1])*l[2*r],l[2*r+1]=s),n--)}}(t,e),E(s,o,t.bl_count)},T=function(t,e,a){var n,r,i=-1,s=e[1],_=0,h=7,l=4;for(0===s&&(h=138,l=3),e[2*(a+1)+1]=65535,n=0;n<=a;n++)r=s,s=e[2*(n+1)+1],++_<h&&r===s||(_<l?t.bl_tree[2*r]+=_:0!==r?(r!==i&&t.bl_tree[2*r]++,t.bl_tree[32]++):_<=10?t.bl_tree[34]++:t.bl_tree[36]++,_=0,i=r,0===s?(h=138,l=3):r===s?(h=6,l=3):(h=7,l=4))},I=function(t,e,a){var n,r,i=-1,s=e[1],_=0,h=7,l=4;for(0===s&&(h=138,l=3),n=0;n<=a;n++)if(r=s,s=e[2*(n+1)+1],!(++_<h&&r===s)){if(_<l)do{x(t,r,t.bl_tree)}while(0!=--_);else 0!==r?(r!==i&&(x(t,r,t.bl_tree),_--),x(t,16,t.bl_tree),z(t,_-3,2)):_<=10?(x(t,17,t.bl_tree),z(t,_-3,3)):(x(t,18,t.bl_tree),z(t,_-11,7));_=0,i=r,0===s?(h=138,l=3):r===s?(h=6,l=3):(h=7,l=4)}},N=!1,O=function(t,e,a,n){z(t,0+(n?1:0),3),function(t,e,a,n){U(t),n&&(k(t,a),k(t,~a)),t.pending_buf.set(t.window.subarray(e,e+a),t.pending),t.pending+=a}(t,e,a,!0)},D=function(t,e,n,r){var i,s,_=0;t.level>0?(2===t.strm.data_type&&(t.strm.data_type=function(t){var e,n=4093624447;for(e=0;e<=31;e++,n>>>=1)if(1&n&&0!==t.dyn_ltree[2*e])return 0;if(0!==t.dyn_ltree[18]||0!==t.dyn_ltree[20]||0!==t.dyn_ltree[26])return 1;for(e=32;e<a;e++)if(0!==t.dyn_ltree[2*e])return 1;return 0}(t)),F(t,t.l_desc),F(t,t.d_desc),_=function(t){var e;for(T(t,t.dyn_ltree,t.l_desc.max_code),T(t,t.dyn_dtree,t.d_desc.max_code),F(t,t.bl_desc),e=18;e>=3&&0===t.bl_tree[2*l[e]+1];e--);return t.opt_len+=3*(e+1)+5+5+4,e}(t),i=t.opt_len+3+7>>>3,(s=t.static_len+3+7>>>3)<=i&&(i=s)):i=s=n+5,n+4<=i&&-1!==e?O(t,e,n,r):4===t.strategy||s===i?(z(t,2+(r?1:0),3),L(t,o,d)):(z(t,4+(r?1:0),3),function(t,e,a,n){var r;for(z(t,e-257,5),z(t,a-1,5),z(t,n-4,4),r=0;r<n;r++)z(t,t.bl_tree[2*l[r]+1],3);I(t,t.dyn_ltree,e-1),I(t,t.dyn_dtree,a-1)}(t,t.l_desc.max_code+1,t.d_desc.max_code+1,_+1),L(t,t.dyn_ltree,t.dyn_dtree)),Z(t),r&&U(t)},B={_tr_init:function(t){N||(!function(){var t,e,a,l,m,y=new Array(16);for(a=0,l=0;l<28;l++)for(c[l]=a,t=0;t<1<<s[l];t++)f[a++]=l;for(f[a-1]=l,m=0,l=0;l<16;l++)for(w[l]=m,t=0;t<1<<_[l];t++)u[m++]=l;for(m>>=7;l<r;l++)for(w[l]=m<<7,t=0;t<1<<_[l]-7;t++)u[256+m++]=l;for(e=0;e<=i;e++)y[e]=0;for(t=0;t<=143;)o[2*t+1]=8,t++,y[8]++;for(;t<=255;)o[2*t+1]=9,t++,y[9]++;for(;t<=279;)o[2*t+1]=7,t++,y[7]++;for(;t<=287;)o[2*t+1]=8,t++,y[8]++;for(E(o,287,y),t=0;t<r;t++)d[2*t+1]=5,d[2*t]=A(t,5);p=new b(o,s,257,n,i),g=new b(d,_,0,r,i),v=new b(new Array(0),h,0,19,7)}(),N=!0),t.l_desc=new m(t.dyn_ltree,p),t.d_desc=new m(t.dyn_dtree,g),t.bl_desc=new m(t.bl_tree,v),t.bi_buf=0,t.bi_valid=0,Z(t)},_tr_stored_block:O,_tr_flush_block:D,_tr_tally:function(t,e,n){return t.pending_buf[t.d_buf+2*t.last_lit]=e>>>8&255,t.pending_buf[t.d_buf+2*t.last_lit+1]=255&e,t.pending_buf[t.l_buf+t.last_lit]=255&n,t.last_lit++,0===e?t.dyn_ltree[2*n]++:(t.matches++,e--,t.dyn_ltree[2*(f[n]+a+1)]++,t.dyn_dtree[2*y(e)]++),t.last_lit===t.lit_bufsize-1},_tr_align:function(t){z(t,2,3),x(t,256,o),function(t){16===t.bi_valid?(k(t,t.bi_buf),t.bi_buf=0,t.bi_valid=0):t.bi_valid>=8&&(t.pending_buf[t.pending++]=255&t.bi_buf,t.bi_buf>>=8,t.bi_valid-=8)}(t)}},C=function(t,e,a,n){for(var r=65535&t|0,i=t>>>16&65535|0,s=0;0!==a;){a-=s=a>2e3?2e3:a;do{i=i+(r=r+e[n++]|0)|0}while(--s);r%=65521,i%=65521}return r|i<<16|0},H=new Uint32Array(function(){for(var t,e=[],a=0;a<256;a++){t=a;for(var n=0;n<8;n++)t=1&t?3988292384^t>>>1:t>>>1;e[a]=t}return e}()),M=function(t,e,a,n){var r=H,i=n+a;t^=-1;for(var s=n;s<i;s++)t=t>>>8^r[255&(t^e[s])];return-1^t},Y={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"},K={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_MEM_ERROR:-4,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8},P=B._tr_init,j=B._tr_stored_block,G=B._tr_flush_block,X=B._tr_tally,W=B._tr_align,q=K.Z_NO_FLUSH,J=K.Z_PARTIAL_FLUSH,Q=K.Z_FULL_FLUSH,V=K.Z_FINISH,$=K.Z_BLOCK,tt=K.Z_OK,et=K.Z_STREAM_END,at=K.Z_STREAM_ERROR,nt=K.Z_DATA_ERROR,rt=K.Z_BUF_ERROR,it=K.Z_DEFAULT_COMPRESSION,st=K.Z_FILTERED,_t=K.Z_HUFFMAN_ONLY,ht=K.Z_RLE,lt=K.Z_FIXED,ot=K.Z_DEFAULT_STRATEGY,dt=K.Z_UNKNOWN,ut=K.Z_DEFLATED,ft=258,ct=262,pt=103,gt=113,vt=666,wt=function(t,e){return t.msg=Y[e],e},bt=function(t){return(t<<1)-(t>4?9:0)},mt=function(t){for(var e=t.length;--e>=0;)t[e]=0},yt=function(t,e,a){return(e<<t.hash_shift^a)&t.hash_mask},kt=function(t){var e=t.state,a=e.pending;a>t.avail_out&&(a=t.avail_out),0!==a&&(t.output.set(e.pending_buf.subarray(e.pending_out,e.pending_out+a),t.next_out),t.next_out+=a,e.pending_out+=a,t.total_out+=a,t.avail_out-=a,e.pending-=a,0===e.pending&&(e.pending_out=0))},zt=function(t,e){G(t,t.block_start>=0?t.block_start:-1,t.strstart-t.block_start,e),t.block_start=t.strstart,kt(t.strm)},xt=function(t,e){t.pending_buf[t.pending++]=e},At=function(t,e){t.pending_buf[t.pending++]=e>>>8&255,t.pending_buf[t.pending++]=255&e},Et=function(t,e){var a,n,r=t.max_chain_length,i=t.strstart,s=t.prev_length,_=t.nice_match,h=t.strstart>t.w_size-ct?t.strstart-(t.w_size-ct):0,l=t.window,o=t.w_mask,d=t.prev,u=t.strstart+ft,f=l[i+s-1],c=l[i+s];t.prev_length>=t.good_match&&(r>>=2),_>t.lookahead&&(_=t.lookahead);do{if(l[(a=e)+s]===c&&l[a+s-1]===f&&l[a]===l[i]&&l[++a]===l[i+1]){i+=2,a++;do{}while(l[++i]===l[++a]&&l[++i]===l[++a]&&l[++i]===l[++a]&&l[++i]===l[++a]&&l[++i]===l[++a]&&l[++i]===l[++a]&&l[++i]===l[++a]&&l[++i]===l[++a]&&i<u);if(n=ft-(u-i),i=u-ft,n>s){if(t.match_start=e,s=n,n>=_)break;f=l[i+s-1],c=l[i+s]}}}while((e=d[e&o])>h&&0!=--r);return s<=t.lookahead?s:t.lookahead},Zt=function(t){var e,a,n,r,i,s,_,h,l,o,d=t.w_size;do{if(r=t.window_size-t.lookahead-t.strstart,t.strstart>=d+(d-ct)){t.window.set(t.window.subarray(d,d+d),0),t.match_start-=d,t.strstart-=d,t.block_start-=d,e=a=t.hash_size;do{n=t.head[--e],t.head[e]=n>=d?n-d:0}while(--a);e=a=d;do{n=t.prev[--e],t.prev[e]=n>=d?n-d:0}while(--a);r+=d}if(0===t.strm.avail_in)break;if(s=t.strm,_=t.window,h=t.strstart+t.lookahead,l=r,o=void 0,(o=s.avail_in)>l&&(o=l),a=0===o?0:(s.avail_in-=o,_.set(s.input.subarray(s.next_in,s.next_in+o),h),1===s.state.wrap?s.adler=C(s.adler,_,o,h):2===s.state.wrap&&(s.adler=M(s.adler,_,o,h)),s.next_in+=o,s.total_in+=o,o),t.lookahead+=a,t.lookahead+t.insert>=3)for(i=t.strstart-t.insert,t.ins_h=t.window[i],t.ins_h=yt(t,t.ins_h,t.window[i+1]);t.insert&&(t.ins_h=yt(t,t.ins_h,t.window[i+3-1]),t.prev[i&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=i,i++,t.insert--,!(t.lookahead+t.insert<3)););}while(t.lookahead<ct&&0!==t.strm.avail_in)},Ut=function(t,e){for(var a,n;;){if(t.lookahead<ct){if(Zt(t),t.lookahead<ct&&e===q)return 1;if(0===t.lookahead)break}if(a=0,t.lookahead>=3&&(t.ins_h=yt(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart),0!==a&&t.strstart-a<=t.w_size-ct&&(t.match_length=Et(t,a)),t.match_length>=3)if(n=X(t,t.strstart-t.match_start,t.match_length-3),t.lookahead-=t.match_length,t.match_length<=t.max_lazy_match&&t.lookahead>=3){t.match_length--;do{t.strstart++,t.ins_h=yt(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart}while(0!=--t.match_length);t.strstart++}else t.strstart+=t.match_length,t.match_length=0,t.ins_h=t.window[t.strstart],t.ins_h=yt(t,t.ins_h,t.window[t.strstart+1]);else n=X(t,0,t.window[t.strstart]),t.lookahead--,t.strstart++;if(n&&(zt(t,!1),0===t.strm.avail_out))return 1}return t.insert=t.strstart<2?t.strstart:2,e===V?(zt(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(zt(t,!1),0===t.strm.avail_out)?1:2},St=function(t,e){for(var a,n,r;;){if(t.lookahead<ct){if(Zt(t),t.lookahead<ct&&e===q)return 1;if(0===t.lookahead)break}if(a=0,t.lookahead>=3&&(t.ins_h=yt(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart),t.prev_length=t.match_length,t.prev_match=t.match_start,t.match_length=2,0!==a&&t.prev_length<t.max_lazy_match&&t.strstart-a<=t.w_size-ct&&(t.match_length=Et(t,a),t.match_length<=5&&(t.strategy===st||3===t.match_length&&t.strstart-t.match_start>4096)&&(t.match_length=2)),t.prev_length>=3&&t.match_length<=t.prev_length){r=t.strstart+t.lookahead-3,n=X(t,t.strstart-1-t.prev_match,t.prev_length-3),t.lookahead-=t.prev_length-1,t.prev_length-=2;do{++t.strstart<=r&&(t.ins_h=yt(t,t.ins_h,t.window[t.strstart+3-1]),a=t.prev[t.strstart&t.w_mask]=t.head[t.ins_h],t.head[t.ins_h]=t.strstart)}while(0!=--t.prev_length);if(t.match_available=0,t.match_length=2,t.strstart++,n&&(zt(t,!1),0===t.strm.avail_out))return 1}else if(t.match_available){if((n=X(t,0,t.window[t.strstart-1]))&&zt(t,!1),t.strstart++,t.lookahead--,0===t.strm.avail_out)return 1}else t.match_available=1,t.strstart++,t.lookahead--}return t.match_available&&(n=X(t,0,t.window[t.strstart-1]),t.match_available=0),t.insert=t.strstart<2?t.strstart:2,e===V?(zt(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(zt(t,!1),0===t.strm.avail_out)?1:2};function Rt(t,e,a,n,r){this.good_length=t,this.max_lazy=e,this.nice_length=a,this.max_chain=n,this.func=r}var Lt=[new Rt(0,0,0,0,(function(t,e){var a=65535;for(a>t.pending_buf_size-5&&(a=t.pending_buf_size-5);;){if(t.lookahead<=1){if(Zt(t),0===t.lookahead&&e===q)return 1;if(0===t.lookahead)break}t.strstart+=t.lookahead,t.lookahead=0;var n=t.block_start+a;if((0===t.strstart||t.strstart>=n)&&(t.lookahead=t.strstart-n,t.strstart=n,zt(t,!1),0===t.strm.avail_out))return 1;if(t.strstart-t.block_start>=t.w_size-ct&&(zt(t,!1),0===t.strm.avail_out))return 1}return t.insert=0,e===V?(zt(t,!0),0===t.strm.avail_out?3:4):(t.strstart>t.block_start&&(zt(t,!1),t.strm.avail_out),1)})),new Rt(4,4,8,4,Ut),new Rt(4,5,16,8,Ut),new Rt(4,6,32,32,Ut),new Rt(4,4,16,16,St),new Rt(8,16,32,32,St),new Rt(8,16,128,128,St),new Rt(8,32,128,256,St),new Rt(32,128,258,1024,St),new Rt(32,258,258,4096,St)];function Ft(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=ut,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new Uint16Array(1146),this.dyn_dtree=new Uint16Array(122),this.bl_tree=new Uint16Array(78),mt(this.dyn_ltree),mt(this.dyn_dtree),mt(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new Uint16Array(16),this.heap=new Uint16Array(573),mt(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new Uint16Array(573),mt(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}var Tt=function(t){if(!t||!t.state)return wt(t,at);t.total_in=t.total_out=0,t.data_type=dt;var e=t.state;return e.pending=0,e.pending_out=0,e.wrap<0&&(e.wrap=-e.wrap),e.status=e.wrap?42:gt,t.adler=2===e.wrap?0:1,e.last_flush=q,P(e),tt},It=function(t){var e,a=Tt(t);return a===tt&&((e=t.state).window_size=2*e.w_size,mt(e.head),e.max_lazy_match=Lt[e.level].max_lazy,e.good_match=Lt[e.level].good_length,e.nice_match=Lt[e.level].nice_length,e.max_chain_length=Lt[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=2,e.match_available=0,e.ins_h=0),a},Nt=function(t,e,a,n,r,i){if(!t)return at;var s=1;if(e===it&&(e=6),n<0?(s=0,n=-n):n>15&&(s=2,n-=16),r<1||r>9||a!==ut||n<8||n>15||e<0||e>9||i<0||i>lt)return wt(t,at);8===n&&(n=9);var _=new Ft;return t.state=_,_.strm=t,_.wrap=s,_.gzhead=null,_.w_bits=n,_.w_size=1<<_.w_bits,_.w_mask=_.w_size-1,_.hash_bits=r+7,_.hash_size=1<<_.hash_bits,_.hash_mask=_.hash_size-1,_.hash_shift=~~((_.hash_bits+3-1)/3),_.window=new Uint8Array(2*_.w_size),_.head=new Uint16Array(_.hash_size),_.prev=new Uint16Array(_.w_size),_.lit_bufsize=1<<r+6,_.pending_buf_size=4*_.lit_bufsize,_.pending_buf=new Uint8Array(_.pending_buf_size),_.d_buf=1*_.lit_bufsize,_.l_buf=3*_.lit_bufsize,_.level=e,_.strategy=i,_.method=a,It(t)},Ot={deflateInit:function(t,e){return Nt(t,e,ut,15,8,ot)},deflateInit2:Nt,deflateReset:It,deflateResetKeep:Tt,deflateSetHeader:function(t,e){return t&&t.state?2!==t.state.wrap?at:(t.state.gzhead=e,tt):at},deflate:function(t,e){var a,n;if(!t||!t.state||e>$||e<0)return t?wt(t,at):at;var r=t.state;if(!t.output||!t.input&&0!==t.avail_in||r.status===vt&&e!==V)return wt(t,0===t.avail_out?rt:at);r.strm=t;var i=r.last_flush;if(r.last_flush=e,42===r.status)if(2===r.wrap)t.adler=0,xt(r,31),xt(r,139),xt(r,8),r.gzhead?(xt(r,(r.gzhead.text?1:0)+(r.gzhead.hcrc?2:0)+(r.gzhead.extra?4:0)+(r.gzhead.name?8:0)+(r.gzhead.comment?16:0)),xt(r,255&r.gzhead.time),xt(r,r.gzhead.time>>8&255),xt(r,r.gzhead.time>>16&255),xt(r,r.gzhead.time>>24&255),xt(r,9===r.level?2:r.strategy>=_t||r.level<2?4:0),xt(r,255&r.gzhead.os),r.gzhead.extra&&r.gzhead.extra.length&&(xt(r,255&r.gzhead.extra.length),xt(r,r.gzhead.extra.length>>8&255)),r.gzhead.hcrc&&(t.adler=M(t.adler,r.pending_buf,r.pending,0)),r.gzindex=0,r.status=69):(xt(r,0),xt(r,0),xt(r,0),xt(r,0),xt(r,0),xt(r,9===r.level?2:r.strategy>=_t||r.level<2?4:0),xt(r,3),r.status=gt);else{var s=ut+(r.w_bits-8<<4)<<8;s|=(r.strategy>=_t||r.level<2?0:r.level<6?1:6===r.level?2:3)<<6,0!==r.strstart&&(s|=32),s+=31-s%31,r.status=gt,At(r,s),0!==r.strstart&&(At(r,t.adler>>>16),At(r,65535&t.adler)),t.adler=1}if(69===r.status)if(r.gzhead.extra){for(a=r.pending;r.gzindex<(65535&r.gzhead.extra.length)&&(r.pending!==r.pending_buf_size||(r.gzhead.hcrc&&r.pending>a&&(t.adler=M(t.adler,r.pending_buf,r.pending-a,a)),kt(t),a=r.pending,r.pending!==r.pending_buf_size));)xt(r,255&r.gzhead.extra[r.gzindex]),r.gzindex++;r.gzhead.hcrc&&r.pending>a&&(t.adler=M(t.adler,r.pending_buf,r.pending-a,a)),r.gzindex===r.gzhead.extra.length&&(r.gzindex=0,r.status=73)}else r.status=73;if(73===r.status)if(r.gzhead.name){a=r.pending;do{if(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(t.adler=M(t.adler,r.pending_buf,r.pending-a,a)),kt(t),a=r.pending,r.pending===r.pending_buf_size)){n=1;break}n=r.gzindex<r.gzhead.name.length?255&r.gzhead.name.charCodeAt(r.gzindex++):0,xt(r,n)}while(0!==n);r.gzhead.hcrc&&r.pending>a&&(t.adler=M(t.adler,r.pending_buf,r.pending-a,a)),0===n&&(r.gzindex=0,r.status=91)}else r.status=91;if(91===r.status)if(r.gzhead.comment){a=r.pending;do{if(r.pending===r.pending_buf_size&&(r.gzhead.hcrc&&r.pending>a&&(t.adler=M(t.adler,r.pending_buf,r.pending-a,a)),kt(t),a=r.pending,r.pending===r.pending_buf_size)){n=1;break}n=r.gzindex<r.gzhead.comment.length?255&r.gzhead.comment.charCodeAt(r.gzindex++):0,xt(r,n)}while(0!==n);r.gzhead.hcrc&&r.pending>a&&(t.adler=M(t.adler,r.pending_buf,r.pending-a,a)),0===n&&(r.status=pt)}else r.status=pt;if(r.status===pt&&(r.gzhead.hcrc?(r.pending+2>r.pending_buf_size&&kt(t),r.pending+2<=r.pending_buf_size&&(xt(r,255&t.adler),xt(r,t.adler>>8&255),t.adler=0,r.status=gt)):r.status=gt),0!==r.pending){if(kt(t),0===t.avail_out)return r.last_flush=-1,tt}else if(0===t.avail_in&&bt(e)<=bt(i)&&e!==V)return wt(t,rt);if(r.status===vt&&0!==t.avail_in)return wt(t,rt);if(0!==t.avail_in||0!==r.lookahead||e!==q&&r.status!==vt){var _=r.strategy===_t?function(t,e){for(var a;;){if(0===t.lookahead&&(Zt(t),0===t.lookahead)){if(e===q)return 1;break}if(t.match_length=0,a=X(t,0,t.window[t.strstart]),t.lookahead--,t.strstart++,a&&(zt(t,!1),0===t.strm.avail_out))return 1}return t.insert=0,e===V?(zt(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(zt(t,!1),0===t.strm.avail_out)?1:2}(r,e):r.strategy===ht?function(t,e){for(var a,n,r,i,s=t.window;;){if(t.lookahead<=ft){if(Zt(t),t.lookahead<=ft&&e===q)return 1;if(0===t.lookahead)break}if(t.match_length=0,t.lookahead>=3&&t.strstart>0&&(n=s[r=t.strstart-1])===s[++r]&&n===s[++r]&&n===s[++r]){i=t.strstart+ft;do{}while(n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&n===s[++r]&&r<i);t.match_length=ft-(i-r),t.match_length>t.lookahead&&(t.match_length=t.lookahead)}if(t.match_length>=3?(a=X(t,1,t.match_length-3),t.lookahead-=t.match_length,t.strstart+=t.match_length,t.match_length=0):(a=X(t,0,t.window[t.strstart]),t.lookahead--,t.strstart++),a&&(zt(t,!1),0===t.strm.avail_out))return 1}return t.insert=0,e===V?(zt(t,!0),0===t.strm.avail_out?3:4):t.last_lit&&(zt(t,!1),0===t.strm.avail_out)?1:2}(r,e):Lt[r.level].func(r,e);if(3!==_&&4!==_||(r.status=vt),1===_||3===_)return 0===t.avail_out&&(r.last_flush=-1),tt;if(2===_&&(e===J?W(r):e!==$&&(j(r,0,0,!1),e===Q&&(mt(r.head),0===r.lookahead&&(r.strstart=0,r.block_start=0,r.insert=0))),kt(t),0===t.avail_out))return r.last_flush=-1,tt}return e!==V?tt:r.wrap<=0?et:(2===r.wrap?(xt(r,255&t.adler),xt(r,t.adler>>8&255),xt(r,t.adler>>16&255),xt(r,t.adler>>24&255),xt(r,255&t.total_in),xt(r,t.total_in>>8&255),xt(r,t.total_in>>16&255),xt(r,t.total_in>>24&255)):(At(r,t.adler>>>16),At(r,65535&t.adler)),kt(t),r.wrap>0&&(r.wrap=-r.wrap),0!==r.pending?tt:et)},deflateEnd:function(t){if(!t||!t.state)return at;var e=t.state.status;return 42!==e&&69!==e&&73!==e&&91!==e&&e!==pt&&e!==gt&&e!==vt?wt(t,at):(t.state=null,e===gt?wt(t,nt):tt)},deflateSetDictionary:function(t,e){var a=e.length;if(!t||!t.state)return at;var n=t.state,r=n.wrap;if(2===r||1===r&&42!==n.status||n.lookahead)return at;if(1===r&&(t.adler=C(t.adler,e,a,0)),n.wrap=0,a>=n.w_size){0===r&&(mt(n.head),n.strstart=0,n.block_start=0,n.insert=0);var i=new Uint8Array(n.w_size);i.set(e.subarray(a-n.w_size,a),0),e=i,a=n.w_size}var s=t.avail_in,_=t.next_in,h=t.input;for(t.avail_in=a,t.next_in=0,t.input=e,Zt(n);n.lookahead>=3;){var l=n.strstart,o=n.lookahead-2;do{n.ins_h=yt(n,n.ins_h,n.window[l+3-1]),n.prev[l&n.w_mask]=n.head[n.ins_h],n.head[n.ins_h]=l,l++}while(--o);n.strstart=l,n.lookahead=2,Zt(n)}return n.strstart+=n.lookahead,n.block_start=n.strstart,n.insert=n.lookahead,n.lookahead=0,n.match_length=n.prev_length=2,n.match_available=0,t.next_in=_,t.input=h,t.avail_in=s,n.wrap=r,tt},deflateInfo:"pako deflate (from Nodeca project)"};for(var Dt=new Uint8Array(256),Bt=0;Bt<256;Bt++)Dt[Bt]=Bt>=252?6:Bt>=248?5:Bt>=240?4:Bt>=224?3:Bt>=192?2:1;Dt[254]=Dt[254]=1;var Ct=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0},Ht=Object.prototype.toString,Mt=K.Z_NO_FLUSH,Yt=K.Z_SYNC_FLUSH,Kt=K.Z_FULL_FLUSH,Pt=K.Z_FINISH,jt=K.Z_OK,Gt=K.Z_STREAM_END,Xt=K.Z_DEFAULT_COMPRESSION,Wt=K.Z_DEFAULT_STRATEGY,qt=K.Z_DEFLATED;function Jt(){this.options={level:Xt,method:qt,chunkSize:16384,windowBits:15,memLevel:8,strategy:Wt};var t=this.options;t.raw&&t.windowBits>0?t.windowBits=-t.windowBits:t.gzip&&t.windowBits>0&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new Ct,this.strm.avail_out=0;var e=Ot.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(e!==jt)throw new Error(Y[e]);if(t.header&&Ot.deflateSetHeader(this.strm,t.header),t.dictionary){var a;if(a="[object ArrayBuffer]"===Ht.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(e=Ot.deflateSetDictionary(this.strm,a))!==jt)throw new Error(Y[e]);this._dict_set=!0}}function Qt(t,e,a){try{t.postMessage({type:"errored",error:e,streamId:a})}catch(n){t.postMessage({type:"errored",error:String(e),streamId:a})}}function Vt(t){var e=t.strm.adler;return new Uint8Array([3,0,e>>>24&255,e>>>16&255,e>>>8&255,255&e])}Jt.prototype.push=function(t,e){var a,n,r=this.strm,i=this.options.chunkSize;if(this.ended)return!1;for(n=e===~~e?e:!0===e?Pt:Mt,"[object ArrayBuffer]"===Ht.call(t)?r.input=new Uint8Array(t):r.input=t,r.next_in=0,r.avail_in=r.input.length;;)if(0===r.avail_out&&(r.output=new Uint8Array(i),r.next_out=0,r.avail_out=i),(n===Yt||n===Kt)&&r.avail_out<=6)this.onData(r.output.subarray(0,r.next_out)),r.avail_out=0;else{if((a=Ot.deflate(r,n))===Gt)return r.next_out>0&&this.onData(r.output.subarray(0,r.next_out)),a=Ot.deflateEnd(this.strm),this.onEnd(a),this.ended=!0,a===jt;if(0!==r.avail_out){if(n>0&&r.next_out>0)this.onData(r.output.subarray(0,r.next_out)),r.avail_out=0;else if(0===r.avail_in)break}else this.onData(r.output)}return!0},Jt.prototype.onData=function(t){this.chunks.push(t)},Jt.prototype.onEnd=function(t){t===jt&&(this.result=function(t){for(var e=0,a=0,n=t.length;a<n;a++)e+=t[a].length;for(var r=new Uint8Array(e),i=0,s=0,_=t.length;i<_;i++){var h=t[i];r.set(h,s),s+=h.length}return r}(this.chunks)),this.chunks=[],this.err=t,this.msg=this.strm.msg},function(e){void 0===e&&(e=self);try{var a=new Map;e.addEventListener("message",(function(n){try{var r=function(e,a){switch(a.action){case"init":return{type:"initialized",version:"dev"};case"write":var n=e.get(a.streamId);n||(n=new Jt,e.set(a.streamId,n));var r=n.chunks.length,i=function(t){if("function"==typeof TextEncoder&&TextEncoder.prototype.encode)return(new TextEncoder).encode(t);var e,a,n,r,i,s=t.length,_=0;for(r=0;r<s;r++)55296==(64512&(a=t.charCodeAt(r)))&&r+1<s&&56320==(64512&(n=t.charCodeAt(r+1)))&&(a=65536+(a-55296<<10)+(n-56320),r++),_+=a<128?1:a<2048?2:a<65536?3:4;for(e=new Uint8Array(_),i=0,r=0;i<_;r++)55296==(64512&(a=t.charCodeAt(r)))&&r+1<s&&56320==(64512&(n=t.charCodeAt(r+1)))&&(a=65536+(a-55296<<10)+(n-56320),r++),a<128?e[i++]=a:a<2048?(e[i++]=192|a>>>6,e[i++]=128|63&a):a<65536?(e[i++]=224|a>>>12,e[i++]=128|a>>>6&63,e[i++]=128|63&a):(e[i++]=240|a>>>18,e[i++]=128|a>>>12&63,e[i++]=128|a>>>6&63,e[i++]=128|63&a);return e}(a.data);return n.push(i,K.Z_SYNC_FLUSH),{type:"wrote",id:a.id,streamId:a.streamId,result:t(n.chunks.slice(r)),trailer:Vt(n),additionalBytesCount:i.length};case"reset":e.delete(a.streamId)}}(a,n.data);r&&e.postMessage(r)}catch(t){Qt(e,t,n.data&&"streamId"in n.data?n.data.streamId:void 0)}}))}catch(t){Qt(e,t)}}()}();'])));
}
var state = {
  status: 0
  /* DeflateWorkerStatus.Nil */
};
function startDeflateWorker(configuration, source, onInitializationFailure, createDeflateWorkerImpl) {
  if (createDeflateWorkerImpl === void 0) {
    createDeflateWorkerImpl = createDeflateWorker;
  }
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
function doStartDeflateWorker(configuration, source, createDeflateWorkerImpl) {
  if (createDeflateWorkerImpl === void 0) {
    createDeflateWorkerImpl = createDeflateWorker;
  }
  try {
    var worker = createDeflateWorkerImpl(configuration);
    var removeErrorListener_1 = addEventListener(configuration, worker, "error", function(error) {
      onError(configuration, source, error);
    }).stop;
    var removeMessageListener_1 = addEventListener(configuration, worker, "message", function(_a2) {
      var data = _a2.data;
      if (data.type === "errored") {
        onError(configuration, source, data.error, data.streamId);
      } else if (data.type === "initialized") {
        onInitialized(data.version);
      }
    }).stop;
    worker.postMessage({ action: "init" });
    setTimeout(function() {
      return onTimeout(source);
    }, INITIALIZATION_TIME_OUT_DELAY);
    var stop_1 = function() {
      removeErrorListener_1();
      removeMessageListener_1();
    };
    state = { status: 1, worker, stop: stop_1, initializationFailureCallbacks: [] };
  } catch (error) {
    onError(configuration, source, error);
  }
}
function onTimeout(source) {
  if (state.status === 1) {
    display.error("".concat(source, " failed to start: a timeout occurred while initializing the Worker"));
    state.initializationFailureCallbacks.forEach(function(callback) {
      return callback();
    });
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
    display.error("".concat(source, " failed to start: an error occurred while creating the Worker:"), error);
    if (error instanceof Event || error instanceof Error && isMessageCspRelated(error.message)) {
      var baseMessage = void 0;
      if (configuration.workerUrl) {
        baseMessage = "Please make sure the Worker URL ".concat(configuration.workerUrl, " is correct and CSP is correctly configured.");
      } else {
        baseMessage = "Please make sure CSP is correctly configured.";
      }
      display.error("".concat(baseMessage, " See documentation at ").concat(DOCS_ORIGIN, "/integrations/content_security_policy_logs/#use-csp-with-real-user-monitoring-and-session-replay"));
    } else {
      addTelemetryError(error);
    }
    if (state.status === 1) {
      state.initializationFailureCallbacks.forEach(function(callback) {
        return callback();
      });
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
function isMessageCspRelated(message) {
  return includes(message, "Content Security Policy") || // Related to `require-trusted-types-for` CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for
  includes(message, "requires 'TrustedScriptURL'");
}

// esm/boot/recorderApi.js
function makeRecorderApi(startRecordingImpl, createDeflateWorkerImpl) {
  if (canUseEventBridge() && !bridgeSupports(
    "records"
    /* BridgeCapability.RECORDS */
  ) || !isBrowserSupported()) {
    return {
      start: noop,
      stop: noop,
      getReplayStats: function() {
        return void 0;
      },
      onRumStart: noop,
      isRecording: function() {
        return false;
      },
      getSessionReplayLink: function() {
        return void 0;
      }
    };
  }
  var state2 = {
    status: 1
  };
  var startStrategy = function() {
    state2 = {
      status: 1
      /* RecorderStatus.IntentToStart */
    };
  };
  var stopStrategy = function() {
    state2 = {
      status: 0
      /* RecorderStatus.Stopped */
    };
  };
  var getSessionReplayLinkStrategy = noop;
  return {
    start: function(options) {
      return startStrategy(options);
    },
    stop: function() {
      return stopStrategy();
    },
    getSessionReplayLink: function() {
      return getSessionReplayLinkStrategy();
    },
    onRumStart: function(lifeCycle, configuration, sessionManager, viewContexts, worker) {
      if (configuration.startSessionReplayRecordingManually) {
        state2 = {
          status: 0
          /* RecorderStatus.Stopped */
        };
      }
      lifeCycle.subscribe(9, function() {
        if (state2.status === 2 || state2.status === 3) {
          stopStrategy();
          state2 = {
            status: 1
            /* RecorderStatus.IntentToStart */
          };
        }
      });
      lifeCycle.subscribe(11, function(pageExitEvent) {
        if (pageExitEvent.reason === PageExitReason.UNLOADING) {
          stopStrategy();
        }
      });
      lifeCycle.subscribe(10, function() {
        if (state2.status === 1) {
          startStrategy();
        }
      });
      var cachedDeflateEncoder;
      function getOrCreateDeflateEncoder() {
        if (!cachedDeflateEncoder) {
          if (!worker) {
            worker = startDeflateWorker(configuration, "Datadog Session Replay", function() {
              stopStrategy();
            }, createDeflateWorkerImpl);
          }
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
      startStrategy = function(options) {
        var session = sessionManager.findTrackedSession();
        if (!session || session.sessionReplay === 0 && (!options || !options.force)) {
          state2 = {
            status: 1
            /* RecorderStatus.IntentToStart */
          };
          return;
        }
        if (state2.status === 2 || state2.status === 3) {
          return;
        }
        state2 = {
          status: 2
          /* RecorderStatus.Starting */
        };
        runOnReadyState(configuration, "interactive", function() {
          if (state2.status !== 2) {
            return;
          }
          var deflateEncoder = getOrCreateDeflateEncoder();
          if (!deflateEncoder) {
            state2 = {
              status: 0
            };
            return;
          }
          var stopRecording = startRecordingImpl(lifeCycle, configuration, sessionManager, viewContexts, deflateEncoder).stop;
          state2 = {
            status: 3,
            stopRecording
          };
        });
        if (options && options.force && session.sessionReplay === 0) {
          sessionManager.setForcedReplay();
        }
      };
      stopStrategy = function() {
        if (state2.status === 0) {
          return;
        }
        if (state2.status === 3) {
          state2.stopRecording();
        }
        state2 = {
          status: 0
        };
      };
      getSessionReplayLinkStrategy = function() {
        return getSessionReplayLink(
          configuration,
          sessionManager,
          viewContexts,
          state2.status !== 0
          /* RecorderStatus.Stopped */
        );
      };
      if (state2.status === 1) {
        startStrategy();
      }
    },
    isRecording: function() {
      return getDeflateWorkerStatus() === 3 && state2.status === 3;
    },
    getReplayStats: function(viewId) {
      return getDeflateWorkerStatus() === 3 ? getReplayStats(viewId) : void 0;
    }
  };
}

// esm/entries/main.js
var recorderApi = makeRecorderApi(startRecording);
var datadogRum = makeRumPublicApi(startRum, recorderApi, { startDeflateWorker, createDeflateEncoder });
defineGlobal(getGlobalObject(), "DD_RUM", datadogRum);
export {
  DefaultPrivacyLevel,
  datadogRum
};
