# Changelog

> **Legend**
>
> 💥 - Breaking change.
>
> ✨ - New feature.
>
> 🐛 - Bug fix.
>
> ⚡️ - Performance improvement.
>
> 📝 - Documentation.
>
> ⚗ - Experimental.
>
> See [Gitmoji](https://gitmoji.dev/) for a guide on the emojis used.

---

## v6.1.0

**Public Changes:**

- ✨ Report original error from `addReactError` instead of fake rendering error ([#3293](https://github.com/DataDog/browser-sdk/pull/3293)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ✨ [RUM-6581] Add an init parameter to chose feature flags event collection ([#3283](https://github.com/DataDog/browser-sdk/pull/3283)) [RUM] [RUM-REACT] [RUM-SLIM]
- ✨ Capture previous and current rects in CLS attribution data ([#3269](https://github.com/DataDog/browser-sdk/pull/3269)) [RUM] [RUM-REACT] [RUM-SLIM]
- ✨ [RUM-7572] Add get api of view specific context ([#3266](https://github.com/DataDog/browser-sdk/pull/3266)) [RUM] [RUM-REACT] [RUM-SLIM]
- ✨ [RUM-6567] Generate new web vitals attribution fields ([#3251](https://github.com/DataDog/browser-sdk/pull/3251)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 🐛 Prevent collecting the webpack ChunkLoadError ([#3280](https://github.com/DataDog/browser-sdk/pull/3280)) [RUM]
- ⚡️ [RUM-7650] GA delaying the viewport dimension collection ([#3248](https://github.com/DataDog/browser-sdk/pull/3248)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷‍♀️ [RUM-7963] Add anonymous user id e2e test and cleanup ([#3268](https://github.com/DataDog/browser-sdk/pull/3268)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 fix eslint error on UNSTABLE_ReactComponentTracker case ([#3298](https://github.com/DataDog/browser-sdk/pull/3298)) [RUM-REACT]
- 👷 Bump chrome to 132.0.6834.110-1 ([#3296](https://github.com/DataDog/browser-sdk/pull/3296))
- 👷 various tiny fixes ([#3291](https://github.com/DataDog/browser-sdk/pull/3291)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 Update all non-major dependencies ([#3292](https://github.com/DataDog/browser-sdk/pull/3292)) [RUM-REACT]
- 👷 upload source maps for next major canary ([#3288](https://github.com/DataDog/browser-sdk/pull/3288))
- 👷 Update all non-major dependencies ([#3246](https://github.com/DataDog/browser-sdk/pull/3246))
- 👷 Update dependency puppeteer to v24 ([#3275](https://github.com/DataDog/browser-sdk/pull/3275))
- 👷: migrate renovate config ([#3279](https://github.com/DataDog/browser-sdk/pull/3279))
- ✅ Add e2e test for telemetry usage ([#3222](https://github.com/DataDog/browser-sdk/pull/3222)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ✅ mitigate e2e protocol latency ([#3295](https://github.com/DataDog/browser-sdk/pull/3295))
- ✅ don't rely on segment counts on e2e tests ([#3278](https://github.com/DataDog/browser-sdk/pull/3278)) [RUM]
- ✅ clear identifier implementation cache between tests ([#3282](https://github.com/DataDog/browser-sdk/pull/3282)) [RUM] [RUM-REACT] [RUM-SLIM]
- [React RUM] Add a ReactComponentTracker component ([#3086](https://github.com/DataDog/browser-sdk/pull/3086)) [RUM-REACT]
- ⬆️ Update eslint to v9 / flat config ([#3259](https://github.com/DataDog/browser-sdk/pull/3259)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v6.0.0

See our [upgrade guide](https://docs.datadoghq.com/real_user_monitoring/guide/browser-sdk-upgrade/#from-v5-to-v6) for a comprehensive list of breaking changes introduced by this major version.

**Public Changes:**

- 💥 [RUM-7704] Remove anonymous user feature flag for v6 ([#3216](https://github.com/DataDog/browser-sdk/pull/3216)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 default traceContextInjection to sampled ([#3212](https://github.com/DataDog/browser-sdk/pull/3212)) [RUM] [RUM-REACT] [RUM-SLIM]
- 💥 new default for track\* initialization options ([#3190](https://github.com/DataDog/browser-sdk/pull/3190)) [RUM] [RUM-REACT] [RUM-SLIM]
- 💥 [RUM-6816] remove sendLogsAfterSessionExpiration ([#3183](https://github.com/DataDog/browser-sdk/pull/3183)) [LOGS]
- 💥 [RUM 6075] Save anonymous id in session cookie ([#2985](https://github.com/DataDog/browser-sdk/pull/2985)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 remove useCrossSiteSessionCookie option ([#3179](https://github.com/DataDog/browser-sdk/pull/3179)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 remove Object.\* Polyfills ([#2908](https://github.com/DataDog/browser-sdk/pull/2908)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 remove some polyfills ([#2857](https://github.com/DataDog/browser-sdk/pull/2857)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 build using ES2018 target ([#2882](https://github.com/DataDog/browser-sdk/pull/2882)) [RUM] [RUM-REACT] [RUM-SLIM]
- 💥 Collect long animation frames as long task events ([#3272](https://github.com/DataDog/browser-sdk/pull/3272)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 [RUM-175] sanitize RegExp and Event ([#3188](https://github.com/DataDog/browser-sdk/pull/3188)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 [RUM-6814] strongly type site parameter ([#3161](https://github.com/DataDog/browser-sdk/pull/3161)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 💥 [RUM-1919] Add tracestate header when using tracecontext propagator ([#3163](https://github.com/DataDog/browser-sdk/pull/3163)) [RUM] [RUM-REACT] [RUM-SLIM]
- 🐛 Prevent collecting the webpack ChunkLoadError ([#3280](https://github.com/DataDog/browser-sdk/pull/3280)) [RUM]
- ⚡️ [RUM-6813] Lazy load session replay ([#3152](https://github.com/DataDog/browser-sdk/pull/3152)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷 [RUM-5282] Remove ie11 tests ([#2856](https://github.com/DataDog/browser-sdk/pull/2856)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 do not rename bundle file when name does not change ([#3273](https://github.com/DataDog/browser-sdk/pull/3273))
- 👷 skip merge-into-next-major-job if branch don't exist ([#3270](https://github.com/DataDog/browser-sdk/pull/3270))
- 👷 enable check staging merge ([#3264](https://github.com/DataDog/browser-sdk/pull/3264))
- 👷 fix comment about performance.timing.navigationStart ([#3180](https://github.com/DataDog/browser-sdk/pull/3180)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 fix comment on browser support for unicode character escape ([#3177](https://github.com/DataDog/browser-sdk/pull/3177)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 [RUM-6366] disable browserStack tests ([#3089](https://github.com/DataDog/browser-sdk/pull/3089))
- 👷 fix next major deploy job config ([#2988](https://github.com/DataDog/browser-sdk/pull/2988))
- 👷 add canary deploy job for next major ([#2938](https://github.com/DataDog/browser-sdk/pull/2938))
- 🧪 Update browser matrix for tests ([#2884](https://github.com/DataDog/browser-sdk/pull/2884)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ✅ fix session store e2e to account for anonymous id ([#3265](https://github.com/DataDog/browser-sdk/pull/3265))
- ✅ Make tests robust to an instrumentMethod that does not always rewrap ([#3231](https://github.com/DataDog/browser-sdk/pull/3231)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ✅ [RUM-6813] Use promise in `collectAsyncCalls` instead of a callback ([#3168](https://github.com/DataDog/browser-sdk/pull/3168)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.35.0

**Public Changes:**

- ✨ [RUM-5001] introduce a `sessionPersistence` config option to force using local storage ([#3244](https://github.com/DataDog/browser-sdk/pull/3244)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- feat: support custom schema on Electron ([#3204](https://github.com/DataDog/browser-sdk/pull/3204)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

**Internal Changes:**

- Revert "👷 freeze canary deploy ([#3238](https://github.com/DataDog/browser-sdk/pull/3238))" ([#3252](https://github.com/DataDog/browser-sdk/pull/3252))
- 👷 Update all non-major dependencies ([#3240](https://github.com/DataDog/browser-sdk/pull/3240)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 Update dependency webpack-cli to v6 ([#3241](https://github.com/DataDog/browser-sdk/pull/3241))
- 👷 freeze canary deploy ([#3238](https://github.com/DataDog/browser-sdk/pull/3238))
- ✅ fix leak detection issues ([#3245](https://github.com/DataDog/browser-sdk/pull/3245)) [RUM] [RUM-REACT] [RUM-SLIM]
- 💚 fix CI PR comment ([#3250](https://github.com/DataDog/browser-sdk/pull/3250))
- ♻️ move traceSampleRate default to config validation ([#3197](https://github.com/DataDog/browser-sdk/pull/3197)) [RUM] [RUM-REACT] [RUM-SLIM]

## v5.34.1

**Public Changes:**

- 🐛 AddError should support all instances of type Error ([#3228](https://github.com/DataDog/browser-sdk/pull/3228)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 🐛 Fix unobserve error for non-Element parameter ([#3218](https://github.com/DataDog/browser-sdk/pull/3218)) [RUM] [RUM-REACT] [RUM-SLIM]

**Internal Changes:**

- ⚗️ ⚡️ [RUM-7650] Delay the viewport dimension collection ([#3209](https://github.com/DataDog/browser-sdk/pull/3209)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 Update all non-major dependencies ([#3200](https://github.com/DataDog/browser-sdk/pull/3200)) [RUM-REACT] [WORKER]
- 👷 [RUM-7634] Add deploy and source maps upload scripts tests ([#3211](https://github.com/DataDog/browser-sdk/pull/3211))
- 📦️ update typescript-eslint ([#3192](https://github.com/DataDog/browser-sdk/pull/3192)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.34.0

**Public Changes:**

- 🐛 [RUM-6322] Use window.open observable ([#3215](https://github.com/DataDog/browser-sdk/pull/3215)) [RUM] [RUM-REACT] [RUM-SLIM]

**Internal Changes:**

- ⚗️ ✨ [RUM-6868] implement consistent probabilistic trace sampling ([#3186](https://github.com/DataDog/browser-sdk/pull/3186)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- Test anonymous id on staging behind ff ([#3206](https://github.com/DataDog/browser-sdk/pull/3206)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.33.0

**Public Changes:**

- ✨ [RUM-6182] don't start recording automatically when sample is 0 ([#3162](https://github.com/DataDog/browser-sdk/pull/3162)) [RUM] [RUM-REACT] [RUM-SLIM]
- ✨ [RUM-6799] Add new delivery type property ([#3166](https://github.com/DataDog/browser-sdk/pull/3166)) [RUM] [RUM-REACT] [RUM-SLIM]
- 🐛 [RUM-87] AddError should support Error instances coming from other JS contexts ([#3144](https://github.com/DataDog/browser-sdk/pull/3144)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷 Update all non-major dependencies ([#3157](https://github.com/DataDog/browser-sdk/pull/3157)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ✅ [RUM-6813]Fix recorder tests ([#3191](https://github.com/DataDog/browser-sdk/pull/3191)) [RUM]
- ♻️ [RUM-6813] Split the recorder API module ([#3181](https://github.com/DataDog/browser-sdk/pull/3181)) [RUM]
- Adds a prepare script to @datadog/browser-rum-react ([#3182](https://github.com/DataDog/browser-sdk/pull/3182)) [RUM-REACT]

## v5.32.0

**Public Changes:**

- ✨ [RUM-7371] move React integration out of beta ([#3160](https://github.com/DataDog/browser-sdk/pull/3160)) [RUM] [RUM-REACT] [RUM-SLIM]
- 🐛 [RUM-6411] RUM should not crash with puppeteer injection ([#3153](https://github.com/DataDog/browser-sdk/pull/3153)) [RUM] [RUM-REACT] [RUM-SLIM]

**Internal Changes:**

- ✨ [RUM-6956] Add action name source ([#3115](https://github.com/DataDog/browser-sdk/pull/3115)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.31.1

**Public Changes:**

- 🐛 skip worker timing when no worker is used ([#3147](https://github.com/DataDog/browser-sdk/pull/3147)) [RUM] [RUM-REACT] [RUM-SLIM]
- ⚗️🐛 [RUM-6226] fix for empty splats ([#3142](https://github.com/DataDog/browser-sdk/pull/3142)) [RUM-REACT]

## v5.31.0

**Public Changes:**

- 🐛 Use EventTarget.prototype.addEventListener instead of the method ([#3137](https://github.com/DataDog/browser-sdk/pull/3137)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- [RUM-6801] Collect resource worker processing time ([#3118](https://github.com/DataDog/browser-sdk/pull/3118)) [RUM] [RUM-REACT] [RUM-SLIM]
- Fix trackViewsManually JS doc comment ([#3117](https://github.com/DataDog/browser-sdk/pull/3117)) [RUM] [RUM-REACT] [RUM-SLIM]

**Internal Changes:**

- 👷 Update all non-major dependencies ([#3139](https://github.com/DataDog/browser-sdk/pull/3139))
- 👷 Bump chrome to 131.0.6778.69-1 ([#3127](https://github.com/DataDog/browser-sdk/pull/3127))
- ✅ Fix test cleanup tasks order ([#3141](https://github.com/DataDog/browser-sdk/pull/3141)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.30.1

**Public Changes:**

- 🐛 [RUM-6226][rum-react] improve routes wildcard substitution ([#3105](https://github.com/DataDog/browser-sdk/pull/3105)) [RUM-REACT]
- ⚡️ [RUM-6929] delay resource collection ([#3102](https://github.com/DataDog/browser-sdk/pull/3102)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- Add @session.id in Logs along to @session_id ([#3125](https://github.com/DataDog/browser-sdk/pull/3125)) [LOGS]

**Internal Changes:**

- 👷 do not include staging bump commit to changelog ([#3129](https://github.com/DataDog/browser-sdk/pull/3129))
- 👷 Update all non-major dependencies ([#3106](https://github.com/DataDog/browser-sdk/pull/3106)) [RUM-REACT] [WORKER]

## v5.30.0

**Public Changes:**

- ✨ add new privacy rule for autocomplete password value ([#3094](https://github.com/DataDog/browser-sdk/pull/3094)) [RUM] [RUM-REACT] [RUM-SLIM]
- ✨[RUM-5090] Collect ressource protocol ([#3087](https://github.com/DataDog/browser-sdk/pull/3087)) [RUM] [RUM-REACT] [RUM-SLIM]
- 🐛 allow untrusted event for httpRequest xhr event listeners ([#3123](https://github.com/DataDog/browser-sdk/pull/3123)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷 [RUM-6562] Enable and rename update view name API ([#3099](https://github.com/DataDog/browser-sdk/pull/3099)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 Update all non-major dependencies ([#3082](https://github.com/DataDog/browser-sdk/pull/3082)) [RUM-REACT]
- 👷[IR-30972] Include older version intake urls matching ([#3059](https://github.com/DataDog/browser-sdk/pull/3059)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- 👷 disable datadog static analysis ([#3091](https://github.com/DataDog/browser-sdk/pull/3091))
- ✅👷 kill browserstack execution early ([#3096](https://github.com/DataDog/browser-sdk/pull/3096))

## v5.29.1

**Internal Changes:**

- 👷 CI - Enable yarn strategy on the repository ([#3079](https://github.com/DataDog/browser-sdk/pull/3079))
- 👷 publish chrome extension to all users ([#3084](https://github.com/DataDog/browser-sdk/pull/3084))
- 👷 CI - assign static resources for e2e-bs job ([#3080](https://github.com/DataDog/browser-sdk/pull/3080))
- 👷 Enable reduced Session Replay data batch time limit ([#3088](https://github.com/DataDog/browser-sdk/pull/3088)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.29.0

**Public Changes:**

- 🐛 [RUM-6483] Investigate reducing the batch time limit for Replay ([#3077](https://github.com/DataDog/browser-sdk/pull/3077)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷 Bump chrome to 130.0.6723.58-1 ([#3074](https://github.com/DataDog/browser-sdk/pull/3074))
- 👷 skip merge into next major on scheduled pipelines ([#3075](https://github.com/DataDog/browser-sdk/pull/3075))
- 👷 Update all non-major dependencies ([#3070](https://github.com/DataDog/browser-sdk/pull/3070)) [RUM-REACT]
- 👷 Update dependency eslint-plugin-unicorn to v56 ([#3071](https://github.com/DataDog/browser-sdk/pull/3071))
- 🔧 [RUM-6226] tweak rum-react dependencies ([#3054](https://github.com/DataDog/browser-sdk/pull/3054)) [RUM-REACT]
- ♻️ Use registerCleanupTask for mock cleanups ([#3069](https://github.com/DataDog/browser-sdk/pull/3069)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ♻️ [RUM-5101] Use registerCleanupTask for interceptor cleanup ([#3065](https://github.com/DataDog/browser-sdk/pull/3065)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- [RUM 5088] Reduce INP Null Target ([#2950](https://github.com/DataDog/browser-sdk/pull/2950)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ♻️ [RUM-5101] Use registerCleanupTask for fetch and report cleanups ([#3066](https://github.com/DataDog/browser-sdk/pull/3066)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]
- ♻️ Use registerCleanupTask for zonejs cleanup ([#3060](https://github.com/DataDog/browser-sdk/pull/3060)) [LOGS] [RUM] [RUM-REACT] [RUM-SLIM] [WORKER]

## v5.28.1

**Public Changes:**

- 🐛 ignore layout shifts that happen before view start ([#3058](https://github.com/DataDog/browser-sdk/pull/3058)) [RUM] [RUM-SLIM]
- 🐛 add missing start_time field ([#3050](https://github.com/DataDog/browser-sdk/pull/3050)) [RUM] [RUM-SLIM]

**Internal Changes:**

- 👷🐛 fix generate-changelog script ([#3052](https://github.com/DataDog/browser-sdk/pull/3052))
- 👷 Update Node.js to v22 ([#3049](https://github.com/DataDog/browser-sdk/pull/3049))
- 👷 sync rum-events-format ([#3053](https://github.com/DataDog/browser-sdk/pull/3053)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 👷 Update all non-major dependencies ([#3046](https://github.com/DataDog/browser-sdk/pull/3046)) [RUM-REACT] [WORKER]
- 👷 allow release to be merged into next major feature branch ([#3043](https://github.com/DataDog/browser-sdk/pull/3043))
- 👷 bump e2e-bs ci job timeout to 35 minutes ([#3044](https://github.com/DataDog/browser-sdk/pull/3044))
- 👷 Bump chrome to 129.0.6668.58-1 ([#3035](https://github.com/DataDog/browser-sdk/pull/3035))
- 🔊 Add SDK setup telemetry ([#3045](https://github.com/DataDog/browser-sdk/pull/3045)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 🚨 enforce `scripts/` files conventions ([#3022](https://github.com/DataDog/browser-sdk/pull/3022))

## v5.28.0

**Public Changes:**

- ✨ replace react-router wildcard routes with their actual path name ([#3023](https://github.com/DataDog/browser-sdk/pull/3023)) [RUM-REACT]
- 🐛 fix to redirect v6-canary bundles urls to local dev bundles ([#3021](https://github.com/DataDog/browser-sdk/pull/3021))

**Internal Changes:**

- 👷 Update all non-major dependencies ([#3030](https://github.com/DataDog/browser-sdk/pull/3030)) [RUM-REACT]
- 👷 Bump webpack from 5.76.0 to 5.94.0 in /test/app ([#3013](https://github.com/DataDog/browser-sdk/pull/3013))
- ♻️ [RUM-6278] Use performance observer for layout shift entries ([#3028](https://github.com/DataDog/browser-sdk/pull/3028)) [RUM] [RUM-SLIM]
- ✨ [RUM 4813] Remove feature flag for view specific context ([#3031](https://github.com/DataDog/browser-sdk/pull/3031)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 🐛 fix to redirect v6-canary bundles urls to local dev bundles ([#3021](https://github.com/DataDog/browser-sdk/pull/3021))
- 👷 [RUM 6237] Add e2e test for view context API init ([#3025](https://github.com/DataDog/browser-sdk/pull/3025))
- ♻️ [RUM-6188] Use performanceObserver for first input and event entries ([#2995](https://github.com/DataDog/browser-sdk/pull/2995)) [RUM] [RUM-SLIM]
- ♻️ [RUM-6184] Use performanceObserver for paint entries ([#2991](https://github.com/DataDog/browser-sdk/pull/2991)) [RUM] [RUM-SLIM]
- ✨ Increase INITIALIZATION_TIME_OUT_DELAY ([#3017](https://github.com/DataDog/browser-sdk/pull/3017)) [RUM]

## v5.27.0

**Public Changes**

- ✨ Discard loading time when page is hidden ([#2965](https://github.com/DataDog/browser-sdk/pull/2965)) [RUM] [RUM-SLIM]
- 🐛 [RUM-5785] fix missing navigation timings on Safari ([#2964](https://github.com/DataDog/browser-sdk/pull/2964)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 🐛 convert long animation frame times to nanoseconds ([#2994](https://github.com/DataDog/browser-sdk/pull/2994)) [RUM] [RUM-SLIM]
- 🐛 [RUM-94] ignore performance resource timings with negative duration ([#2958](https://github.com/DataDog/browser-sdk/pull/2958)) [RUM] [RUM-SLIM]

**Internal Changes**

- 👷 Update all non-major dependencies ([#2992](https://github.com/DataDog/browser-sdk/pull/2992)) [RUM-REACT] [RUM]
- 👷 timeout e2e-bs ci job after 30 minutes ([#2999](https://github.com/DataDog/browser-sdk/pull/2999))
- 👷 Bump chrome to 128.0.6613.84-1 ([#2946](https://github.com/DataDog/browser-sdk/pull/2946))
- 👷 allow job 'test-performance' to fail ([#2980](https://github.com/DataDog/browser-sdk/pull/2980))
- 👷 Update all non-major dependencies ([#2975](https://github.com/DataDog/browser-sdk/pull/2975))
- 🎨 [RUM-6203] Expose experimental features in init method ([#3006](https://github.com/DataDog/browser-sdk/pull/3006)) [RUM] [RUM-SLIM]
- 🎨 [RUM-5100] Move away from testbuilder in test files - Pt 3 ([#2952](https://github.com/DataDog/browser-sdk/pull/2952)) [RUM] [RUM-SLIM]
- ✅♻️ do not mock `navigationStart` in `mockClock` ([#2979](https://github.com/DataDog/browser-sdk/pull/2979)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- ♻️ [RUM-6181] Use performanceObserver for LCP entries ([#2990](https://github.com/DataDog/browser-sdk/pull/2990)) [RUM] [RUM-SLIM]
- 🔥 cleanup unused Experimental Features ([#2996](https://github.com/DataDog/browser-sdk/pull/2996)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- ♻️ [RUM-6180] Use performanceObserver for long-task entries ([#2989](https://github.com/DataDog/browser-sdk/pull/2989)) [RUM] [RUM-SLIM]
- ⚗️✨ [RUM 5983] Add set view context apis ([#2967](https://github.com/DataDog/browser-sdk/pull/2967)) [LOGS] [RUM] [RUM-SLIM] [WORKER]

## v5.26.0

**Public Changes:**

- ✨ [RUM-5775] Make view local context writable ([#2939](https://github.com/DataDog/browser-sdk/pull/2939)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 🐛 Allow both history and History prototype to be patched by 3rd party ([#2968](https://github.com/DataDog/browser-sdk/pull/2968)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 🐛 [RUM-5920] Fix tags format warning ([#2947](https://github.com/DataDog/browser-sdk/pull/2947)) [LOGS] [RUM] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷 Bump micromatch from 4.0.4 to 4.0.8 ([#2970](https://github.com/DataDog/browser-sdk/pull/2970))
- 👷 add job to merge main into next major feature branch (v6) ([#2935](https://github.com/DataDog/browser-sdk/pull/2935))
- 👷 Update all non-major dependencies ([#2962](https://github.com/DataDog/browser-sdk/pull/2962)) [RUM-REACT]
- Bump micromatch from 4.0.5 to 4.0.8 in /test/app ([#2971](https://github.com/DataDog/browser-sdk/pull/2971))

## v5.25.0

**Public Changes:**

- Remove custom_vitals FF ([#2957](https://github.com/DataDog/browser-sdk/pull/2957)) [LOGS] [RUM] [RUM-SLIM] [WORKER]

**Internal Changes:**

- 👷 don't print log messages twice in unit tests ([#2959](https://github.com/DataDog/browser-sdk/pull/2959))

## v5.24.0

**Public Changes:**

- ✨ [RUM-5778] Custom Vitals Collection V3 ([#2929](https://github.com/DataDog/browser-sdk/pull/2929)) [RUM] [RUM-SLIM]
- 🐛 bundle size: calculate diff from PR base instead of main ([#2910](https://github.com/DataDog/browser-sdk/pull/2910))

**Internal Changes:**

- 👷 Update dependency eslint-plugin-jsdoc to v50 ([#2932](https://github.com/DataDog/browser-sdk/pull/2932))
- 👷 Update all non-major dependencies ([#2948](https://github.com/DataDog/browser-sdk/pull/2948)) [WORKER]
- 👷 Update all non-major dependencies ([#2941](https://github.com/DataDog/browser-sdk/pull/2941)) [RUM-REACT]
- 👷 use devflow to merge main into staging ([#2927](https://github.com/DataDog/browser-sdk/pull/2927))
- 👷 Update all non-major dependencies ([#2920](https://github.com/DataDog/browser-sdk/pull/2920)) [RUM] [RUM-SLIM] [RUM-REACT]
- 👷 Update dependency puppeteer to v23 ([#2933](https://github.com/DataDog/browser-sdk/pull/2933))
- 👷 upgrade gitlab runner ([#2928](https://github.com/DataDog/browser-sdk/pull/2928))
- 👷 [RUM-5673] Improve `test-performance` execution time ([#2914](https://github.com/DataDog/browser-sdk/pull/2914))
- 👷 use devflow to merge main into staging ([#2917](https://github.com/DataDog/browser-sdk/pull/2917))
- 👷 Update all non-major dependencies ([#2900](https://github.com/DataDog/browser-sdk/pull/2900))
- 👷 Update dependency eslint-plugin-unicorn to v55 ([#2901](https://github.com/DataDog/browser-sdk/pull/2901))
- 👷 Update dependency @types/node to v22 ([#2902](https://github.com/DataDog/browser-sdk/pull/2902))
- 🎨 Refactor spec files and remove test setup builder ([#2913](https://github.com/DataDog/browser-sdk/pull/2913)) [RUM] [RUM-SLIM]
- 🧪 Update browser matrix for tests ([#2884](https://github.com/DataDog/browser-sdk/pull/2884)) [LOGS] [RUM] [RUM-SLIM] [WORKER] [RUM-REACT]
- Revert "[RUM-5590] Add telemetry for INP null target ([#2895](https://github.com/DataDog/browser-sdk/pull/2895))" ([#2955](https://github.com/DataDog/browser-sdk/pull/2955)) [RUM] [RUM-SLIM]
- Fix history API instrumentation ([#2944](https://github.com/DataDog/browser-sdk/pull/2944)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- [RUM-5705] Collect Long Animation Frames ([#2924](https://github.com/DataDog/browser-sdk/pull/2924)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- ✨ [RUM-5712] add error.handling to logs ([#2918](https://github.com/DataDog/browser-sdk/pull/2918)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- Revert "👷 use devflow to merge main into staging ([#2917](https://github.com/DataDog/browser-sdk/pull/2917))" ([#2922](https://github.com/DataDog/browser-sdk/pull/2922))
- ♻️ remove duplicate pageStateHistory.stop() ([#2912](https://github.com/DataDog/browser-sdk/pull/2912)) [RUM] [RUM-SLIM]
- [RUM-5590] Add telemetry for INP null target ([#2895](https://github.com/DataDog/browser-sdk/pull/2895)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- Revert "👷 disable test-performance job ([#2904](https://github.com/DataDog/browser-sdk/pull/2904))" ([#2906](https://github.com/DataDog/browser-sdk/pull/2906))

## v5.23.3

**Internal Changes:**

- 👷 disable test-performance job ([#2904](https://github.com/DataDog/browser-sdk/pull/2904))

## v5.23.2

**Public Changes:**

- 🐛 fix unexpected exception when no entry type is supported in PerformanceObserver ([#2899](https://github.com/DataDog/browser-sdk/pull/2899)) [RUM] [RUM-SLIM]

## v5.23.1

**Public Changes:**

- 🐛 Fix replay visual viewport resize support ([#2891](https://github.com/DataDog/browser-sdk/pull/2891)) [RUM] [RUM-SLIM]
- 🐛 Handle non-object response and error ([#2860](https://github.com/DataDog/browser-sdk/pull/2860)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- ⚡️ Remove classes in favour of functions ([#2885](https://github.com/DataDog/browser-sdk/pull/2885)) [LOGS] [RUM] [RUM-SLIM] [WORKER] [RUM-REACT]
- ⚡ Performance Friday Reduce Bundle Size ([#2875](https://github.com/DataDog/browser-sdk/pull/2875)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- ⚡️Reduce bundle size: simplify config, use const enum, remove str redundancies ([#2877](https://github.com/DataDog/browser-sdk/pull/2877)) [LOGS] [RUM] [RUM-SLIM] [WORKER]
- 📝 [RUM-152] Add packages name modified next to commit in CHANGELOG ([#2889](https://github.com/DataDog/browser-sdk/pull/2889))
- 📝 [RUM-5172] add react integration documentation ([#2873](https://github.com/DataDog/browser-sdk/pull/2873)) [RUM-REACT]

**Internal Changes:**

- 👷 Bump chrome to 127.0.6533.72-1 ([#2890](https://github.com/DataDog/browser-sdk/pull/2890))
- 👷 retry gitlab jobs on runner_system_failure ([#2886](https://github.com/DataDog/browser-sdk/pull/2886))
- 👷 Update all non-major dependencies ([#2881](https://github.com/DataDog/browser-sdk/pull/2881)) [RUM-REACT]
- 👷 Update dependency minimatch to v10 ([#2863](https://github.com/DataDog/browser-sdk/pull/2863))
- 👷 Update dependency glob to v11 ([#2862](https://github.com/DataDog/browser-sdk/pull/2862))
- ♻️ [RUM-5294] Use performanceObserver for navigation entries ([#2855](https://github.com/DataDog/browser-sdk/pull/2855)) [RUM] [RUM-SLIM]
- ⚗️ enable plugins as a beta feature ([#2872](https://github.com/DataDog/browser-sdk/pull/2872)) [LOGS] [RUM] [RUM-SLIM] [WORKER]

## v5.23.0

**Public Changes:**

- ✨ [RUM-4781] Update Custom Web Vitals API ([#2801](https://github.com/DataDog/browser-sdk/pull/2801))
- ✨ [RUM-4819] Add an experimental 'updateViewName' API ([#2808](https://github.com/DataDog/browser-sdk/pull/2808))
- 🐛 Update path for contributing and changelog file ([#2867](https://github.com/DataDog/browser-sdk/pull/2867))
- 🐛 Fix update view name api in context history ([#2853](https://github.com/DataDog/browser-sdk/pull/2853))
- 🐛 [RUM-958] Fix performance observable compatibility with old browser version ([#2850](https://github.com/DataDog/browser-sdk/pull/2850))
- 🐛 [RUM-5209] provide a span id for the initial document trace ([#2844](https://github.com/DataDog/browser-sdk/pull/2844))

**Internal Changes:**

- 👷 Update all non-major dependencies ([#2861](https://github.com/DataDog/browser-sdk/pull/2861))
- 👷 Update all non-major dependencies ([#2848](https://github.com/DataDog/browser-sdk/pull/2848))
- 👷 Update all non-major dependencies ([#2839](https://github.com/DataDog/browser-sdk/pull/2839))
- 👷 Upgrade engine.io and socket.io-adapter packages to fix ws vulnerability ([#2842](https://github.com/DataDog/browser-sdk/pull/2842))
- 🎨 Instrument fetch and XHR before trying to init consent ([#2834](https://github.com/DataDog/browser-sdk/pull/2834))
- 🧪 Ensure skipped test do not fail ([#2821](https://github.com/DataDog/browser-sdk/pull/2821))
- Update rum-react peerDependencies ([#2870](https://github.com/DataDog/browser-sdk/pull/2870))
- ♻️ Get rid of setupBuilder from simple unit tests - pt 1 ([#2858](https://github.com/DataDog/browser-sdk/pull/2858))
- ♻️ [RUM-159] Categorize changes as public or internal in the CHANGELOG ([#2851](https://github.com/DataDog/browser-sdk/pull/2851))
- ♻️ [RUM-958] Use a performance observable instead of the lifecycle ([#2818](https://github.com/DataDog/browser-sdk/pull/2818))
- ♻️ [RUM-67] Specialise type files ([#2845](https://github.com/DataDog/browser-sdk/pull/2845))
- Specialise constant files ([#2841](https://github.com/DataDog/browser-sdk/pull/2841))
- ⚗️✨ [RUM-4469] introduce an experimental React integration ([#2824](https://github.com/DataDog/browser-sdk/pull/2824))

## v5.22.0

- ✨⚗️ [RUM-4469] introduce a plugin system ([#2809](https://github.com/DataDog/browser-sdk/pull/2809))
- ✨ [RUM-4014] DD_LOGS: add handling stack in beforeSend context ([#2786](https://github.com/DataDog/browser-sdk/pull/2786))
- ✨ [RUM-3902] Add privacy control for action names ([#2707](https://github.com/DataDog/browser-sdk/pull/2707))
- 🐛 Fix developer extension crashing when dev mode enabled ([#2810](https://github.com/DataDog/browser-sdk/pull/2810))
- 🔮 [HADXVI-53] Browser SDK extension search bar improvement ([#2771](https://github.com/DataDog/browser-sdk/pull/2771))
- ⚡️ [RUM-3570] Batch the records for 16ms minimum before processing them ([#2807](https://github.com/DataDog/browser-sdk/pull/2807))
- Use the same service/version type in init() and startView() ([#2798](https://github.com/DataDog/browser-sdk/pull/2798))
- ⚗️ [RUM-4780] Remote configuration ([#2799](https://github.com/DataDog/browser-sdk/pull/2799))

## v5.21.0

- ✨ [RUM-4659] Collect INP and CLS timestamp ([#2793](https://github.com/DataDog/browser-sdk/pull/2793))
- ✨ [RUM-1310] Support all log statuses ([#2725](https://github.com/DataDog/browser-sdk/pull/2725))
- ✨ [RUM-3965] make service and version fields modifiable ([#2788](https://github.com/DataDog/browser-sdk/pull/2788))
- ✨ [RUM-3837] Force Replay recording on sampled-out sessions ([#2777](https://github.com/DataDog/browser-sdk/pull/2777))
- 🐛 [RUM-4178] Update performance difference memory ([#2794](https://github.com/DataDog/browser-sdk/pull/2794))
- ♻️ Sends the conf telemetry from preStartRum ([#2795](https://github.com/DataDog/browser-sdk/pull/2795))
- ♻️ Set the experimental feature flags as early as possible ([#2796](https://github.com/DataDog/browser-sdk/pull/2796))
- 📝 [RUM-158] Add jsdoc annotations on initConfiguration ([#2772](https://github.com/DataDog/browser-sdk/pull/2772))

## v5.20.0

- ✨ [RUM-4013] DD_RUM: add handling stack in beforeSend context ([#2730](https://github.com/DataDog/browser-sdk/pull/2730))
- ✨[RUM-4178] Report memory impact to Datadog ([#2724](https://github.com/DataDog/browser-sdk/pull/2724))
- 🐛 [RUM-98] Warn when SDK is loaded multiple times ([#2785](https://github.com/DataDog/browser-sdk/pull/2785))
- ⚡️ [RUM-4468] improve CSS selector computation performance ([#2782](https://github.com/DataDog/browser-sdk/pull/2782))
- 📝 [RUM-158] Add jsdoc to public APIs ([#2775](https://github.com/DataDog/browser-sdk/pull/2775))
- 🔥 Remove unnecessary session checks in collections ([#2769](https://github.com/DataDog/browser-sdk/pull/2769))

## v5.19.0

- 🐛 [RUM-4629] accept `null` as env/version/service ([#2781](https://github.com/DataDog/browser-sdk/pull/2781))
- 🐛 [RUM-4493] do not compute selectors for detached elements ([#2766](https://github.com/DataDog/browser-sdk/pull/2766))
- 🐛 [RUM-2720] Send logs without session id when session inactive ([#2578](https://github.com/DataDog/browser-sdk/pull/2578))
- 🐛 [RUM-1666] Don't set negative action loading time ([#2764](https://github.com/DataDog/browser-sdk/pull/2764))
- 🐛 [RUM-4434] fix timing matching for the same resource requested twice at the same time ([#2747](https://github.com/DataDog/browser-sdk/pull/2747))
- 🐛 [RUM-4436] fix detached node memory leak on CLS ([#2749](https://github.com/DataDog/browser-sdk/pull/2749))
- ✅ fix clearing cookies between tests ([#2780](https://github.com/DataDog/browser-sdk/pull/2780))
- 🔥 Cleanup experimental features ([#2768](https://github.com/DataDog/browser-sdk/pull/2768))
- ✏️ various comment fixes ([#2760](https://github.com/DataDog/browser-sdk/pull/2760))

## v5.18.0

- 🔊[RUM-4360] monitor more API usages ([#2745](https://github.com/DataDog/browser-sdk/pull/2745))
- 🔊 collect pre start telemetry ([#2755](https://github.com/DataDog/browser-sdk/pull/2755))
- 🔊 Deduplicate telemetry events ([#2746](https://github.com/DataDog/browser-sdk/pull/2746))
- 🐛 [RUM-97] Sanitize tags parameter in configuration ([#2744](https://github.com/DataDog/browser-sdk/pull/2744))

## v5.17.1

- 🐛fix deploy script ([#2742](https://github.com/DataDog/browser-sdk/pull/2742))

## v5.17.0

- ✨ [RUM-4052] Sanitize `site` parameter in configuration ([#2735](https://github.com/DataDog/browser-sdk/pull/2735))
- ✨ [RUM-4287] Enable feature flags API ([#2728](https://github.com/DataDog/browser-sdk/pull/2728))
- ✨ [RUM-3710] Update session ID handling to support cookie deletion ([#2673](https://github.com/DataDog/browser-sdk/pull/2673))
- ✨⚗️ [RUM-4179] vital: collect `computed_value` property ([#2723](https://github.com/DataDog/browser-sdk/pull/2723))
- ♻️ use browser.execute and browser.executeAsync directly ([#2700](https://github.com/DataDog/browser-sdk/pull/2700))
- ♻️ move createHandlingStack to the tools folder ([#2727](https://github.com/DataDog/browser-sdk/pull/2727))

## v5.16.0

- ✨ [RUM-3684] Capture scroll record on shadow dom elements ([#2708](https://github.com/DataDog/browser-sdk/pull/2708))
- ✨[RUM-3798] Report the cpu impact as a pr comment ([#2702](https://github.com/DataDog/browser-sdk/pull/2702))
- ✨ [RUM-162] Truncate resources URL containing data URLs ([#2690](https://github.com/DataDog/browser-sdk/pull/2690))
- 🐛[RUM-4109] Mask iframe srcdoc with privacy override ([#2714](https://github.com/DataDog/browser-sdk/pull/2714))
- ⚗ [RUM-2782] Validate resource timings more granularly

## v5.15.0

- 🐛 fix beforeSend type definition for logs ([#2686](https://github.com/DataDog/browser-sdk/pull/2686))
- 🐛 [RUM-2782] remove buggy redirect timing estimation based on fetchStart ([#2683](https://github.com/DataDog/browser-sdk/pull/2683))
- [ci-visibility] Implement driver-agnostic integration with CI Visibility ([#2639](https://github.com/DataDog/browser-sdk/pull/2639))

## v5.14.0

- ✨ [RUM-3387] forward to beforeSend context ([#2665](https://github.com/DataDog/browser-sdk/pull/2665))
- 🐛 [RUM-3581] Fix the selector computation due to properties partially supported on IE ([#2663](https://github.com/DataDog/browser-sdk/pull/2663))
- 🐛 [RUM-96] Ignore frustrations on clicks resulting in scrolls ([#2669](https://github.com/DataDog/browser-sdk/pull/2669))
- ♻️✅ Harmonize record observers ([#2659](https://github.com/DataDog/browser-sdk/pull/2659))

## v5.13.0

- ✨ [RUM-3542] Add trace context injection control in rum configuration ([#2656](https://github.com/DataDog/browser-sdk/pull/2656))
- 🐛 [RUM-3599] do not define undefined instrumented method ([#2662](https://github.com/DataDog/browser-sdk/pull/2662))
- 🐛 [RUM-3598] Ignore collecting requests to logs PCI intake as RUM resources ([#2655](https://github.com/DataDog/browser-sdk/pull/2655))
- ⚡ [RUM-2633] Optimize DOM iteration in the recorder ([#2657](https://github.com/DataDog/browser-sdk/pull/2657))

## v5.12.0

- ✨ [RUM-3546] Add support of PCI compliant intake for browser logs ([#2648](https://github.com/DataDog/browser-sdk/pull/2648))
- ✨ [RUM 3352] Extra resource event attributes to enable performance CWV troubleshooting ([#2646](https://github.com/DataDog/browser-sdk/pull/2646))
- ✨ [RUM-2885] Collect CSP disposition ([#2635](https://github.com/DataDog/browser-sdk/pull/2635))
- 🐛 [RUM-3440] Fix INP CSS selector computation
- 🐛 [RUM-3502] fix fetch(url) tracing ([#2642](https://github.com/DataDog/browser-sdk/pull/2642))
- 🔧 Enforce snake case for event type properties ([#2649](https://github.com/DataDog/browser-sdk/pull/2649))
- 🔊 [RUM-3501] add `tracking_consent` to configuration telemetry ([#2640](https://github.com/DataDog/browser-sdk/pull/2640))
- 🔧 configure renovate to deduplicate subdependencies ([#2643](https://github.com/DataDog/browser-sdk/pull/2643))

## v5.11.0

- ✨ [RUM-3349] enable the consent management API ([#2634](https://github.com/DataDog/browser-sdk/pull/2634))
- ✨ [RUM-2203] Forward replay records to the bridge ([#2470](https://github.com/DataDog/browser-sdk/pull/2470))
- 🐛 [RUM-2445] fix unexpected session renewal after expire() ([#2632](https://github.com/DataDog/browser-sdk/pull/2632))
- ⚗️ [RUM-3234] Discard outdated vitals ([#2610](https://github.com/DataDog/browser-sdk/pull/2610))

## v5.10.0

- ✨ [RUM-2902] Add error causes to context when logging an error ([#2602](https://github.com/DataDog/browser-sdk/pull/2602))
- ✨ [RUM-3151] Report bundle sizes to logs ([#2605](https://github.com/DataDog/browser-sdk/pull/2605))
- ✨ [RUM-160] Collect PerformanceResourceTiming.responseStatus ([#2587](https://github.com/DataDog/browser-sdk/pull/2587))
- 🐛 [RUM-3039] Fix missing pending mutations at view end ([#2598](https://github.com/DataDog/browser-sdk/pull/2598))
- ⚗️[RUM-3235] collect vital.name attribute ([#2609](https://github.com/DataDog/browser-sdk/pull/2609))
- ⚗️[RUM-2889] custom vitals improvements ([#2606](https://github.com/DataDog/browser-sdk/pull/2606))
- 🔧 ignore karma-webpack for now ([#2604](https://github.com/DataDog/browser-sdk/pull/2604))
- ⚗️[RUM-2889] Bootstrap custom vital APIs ([#2591](https://github.com/DataDog/browser-sdk/pull/2591))
- ⚗ ️✨ [RUM-2445] implement Tracking Consent management ([#2589](https://github.com/DataDog/browser-sdk/pull/2589))

## v5.9.0

- ✨[Developer extension] npm setup override support ([#2304](https://github.com/DataDog/browser-sdk/pull/2304))
- 🐛 Fix LCP with size < previous LCP ([#2586](https://github.com/DataDog/browser-sdk/pull/2586))
- 🐛 [RUM-2940] fix normalize URL for relative paths ([#2576](https://github.com/DataDog/browser-sdk/pull/2576))
- ♻️ register setupBuilder.cleanup as a cleanup task ([#2590](https://github.com/DataDog/browser-sdk/pull/2590))
- ♻️ [RUM-2445] split RUM and Logs public APIs modules ([#2575](https://github.com/DataDog/browser-sdk/pull/2575))
- ⚡️ [RUM-2893] optimize getNodePrivacyLevel by adding a cache ([#2579](https://github.com/DataDog/browser-sdk/pull/2579))
- ♻️ [RUM-2203] Move record logic from startRecording to the record module ([#2574](https://github.com/DataDog/browser-sdk/pull/2574))

## v5.8.0

- ✨[RUM-2729] collect connectivity data ([#2560](https://github.com/DataDog/browser-sdk/pull/2560))
- 🐛[RUM-2752] Replay: generate censored images with custom dimensions ([#2565](https://github.com/DataDog/browser-sdk/pull/2565))
- 🐛[RUM-2735] Track request with undefined/null method
- 📝 Document addTiming API relative time issue ([#2570](https://github.com/DataDog/browser-sdk/pull/2570))
- ♻️ [RUM-2445] simplify context manager sync with local storage ([#2562](https://github.com/DataDog/browser-sdk/pull/2562))
- ♻️ [RUM-2445] align rum and logs common context implementation ([#2564](https://github.com/DataDog/browser-sdk/pull/2564))
- ♻️ [RUM-2445] use recorderApi directly ([#2563](https://github.com/DataDog/browser-sdk/pull/2563))

## v5.7.0

- 🐛 [RUM-2689] fix recorder crash when restarted quickly ([#2553](https://github.com/DataDog/browser-sdk/pull/2553))
- 🔉 [RUM-253] adjust heavy customer data warning when compression is enabled ([#2529](https://github.com/DataDog/browser-sdk/pull/2529))
- ♻️ [RUMF-1436] instrument method improvements ([#2551](https://github.com/DataDog/browser-sdk/pull/2551))
- ✨⚗ [RUM-2682] writable resource.graphql field on Resource events ([#2550](https://github.com/DataDog/browser-sdk/pull/2550))
- 📝 add @datadog/browser-worker package to readme ([#2537](https://github.com/DataDog/browser-sdk/pull/2537))
- ♻️ pass the Observable instance to the onFirstSubscribe callback ([#2539](https://github.com/DataDog/browser-sdk/pull/2539))

## v5.6.0

- ✨[RUM-2436] add partitioned support for third party cookies ([#2535](https://github.com/DataDog/browser-sdk/pull/2535))
- 🔊[RUM-2324] Telemetry on other wrong LCP cases ([#2531](https://github.com/DataDog/browser-sdk/pull/2531))

## v5.5.1

- 🐛 [RUM-2280] fix duplicated mutations when using Shadow DOM ([#2527](https://github.com/DataDog/browser-sdk/pull/2527))
- 🔊[RUM-2324] Telemetry on LCP with startTime to 0 ([#2515](https://github.com/DataDog/browser-sdk/pull/2515))
- ✅ import JSON schemas dynamically in tests ([#2521](https://github.com/DataDog/browser-sdk/pull/2521))

## v5.5.0

- ✨ Expose original report events in beforeSend ([#2510](https://github.com/DataDog/browser-sdk/pull/2510))
- ✨ Developer Extension improvements ([#2516](https://github.com/DataDog/browser-sdk/pull/2516))
- ♻️ [Logs] reorganise some components ([#2519](https://github.com/DataDog/browser-sdk/pull/2519))

## v5.4.0

- ✨ [RUM-1214] Collect core web vitals target selectors ([#2506](https://github.com/DataDog/browser-sdk/pull/2506))
- ✨ [RUM-2158] Allow more flexible proxy URL ([#2502](https://github.com/DataDog/browser-sdk/pull/2502))

## v5.3.0

- ✨ [RUM-253] enable compression via the compressIntakeRequests parameter ([#2500](https://github.com/DataDog/browser-sdk/pull/2500))
- 🐛 [RUM-1561] Fix CLS selector computation on detached node ([#2480](https://github.com/DataDog/browser-sdk/pull/2480))

## v5.2.0

- 🐛 [RUM-2016] don't collect useless resources events ([#2493](https://github.com/DataDog/browser-sdk/pull/2493))
- 🐛 [RUM-1863] fix iOS webview detection ([#2486](https://github.com/DataDog/browser-sdk/pull/2486))
- ⚡️[RUM-2017] optimize cookie accesses ([#2497](https://github.com/DataDog/browser-sdk/pull/2497))
- ✅ [RUM-253] add E2E tests related to compression ([#2416](https://github.com/DataDog/browser-sdk/pull/2416))
- ⚗️✨ [RUM-253] compress RUM data ([#2400](https://github.com/DataDog/browser-sdk/pull/2400))
- 🔉 [RUM-1658] Add extra field to identify sessions recorded manually ([#2479](https://github.com/DataDog/browser-sdk/pull/2479))
- 🔊 Add CLS target selector telemetry ([#2477](https://github.com/DataDog/browser-sdk/pull/2477))

## v5.1.0

- ✨ [RUM-1215] Collect INP #2355 ([#2448](https://github.com/DataDog/browser-sdk/pull/2448))
- 🐛 Prevent console warning on Firefox on route change ([#2469](https://github.com/DataDog/browser-sdk/pull/2469))
- 🐛 [RUM-1360] Cap INP outliers ([#2466](https://github.com/DataDog/browser-sdk/pull/2466))
- ♻️ [RUM-1329] Merge tracekit into error folder ([#2450](https://github.com/DataDog/browser-sdk/pull/2450))

## v5.0.0

See our [upgrade guide](https://docs.datadoghq.com/real_user_monitoring/guide/browser-sdk-upgrade/#from-v4-to-v5) for a comprehensive list of breaking changes introduced by this major version.

- 💥 [RUMF-1589] automatically start recording ([#2275](https://github.com/DataDog/browser-sdk/pull/2275))
- 💥 [RUMF-1587] Remove `premiumSampleRate` and `replaySampleRate` ([#2256](https://github.com/DataDog/browser-sdk/pull/2256))
- 💥 [RUMF-1597] Drop plan and send sampled_for_replay ([#2293](https://github.com/DataDog/browser-sdk/pull/2293))
- 💥 [RUMF-1578] Promote track frustration as default action behaviour ([#2232](https://github.com/DataDog/browser-sdk/pull/2232))
- 💥 [RUMF-1230] Only apply main logger configuration to its own logs ([#2298](https://github.com/DataDog/browser-sdk/pull/2298))
- 💥 [RUM-1210] Add W3C tracecontext to default propagator types ([#2443](https://github.com/DataDog/browser-sdk/pull/2343))
- 💥 [RUMF-1473] Ignore untrusted event ([#2308](https://github.com/DataDog/browser-sdk/pull/2308))
- 💥 [RUMF-1564] remove intake subdomains ([#2309](https://github.com/DataDog/browser-sdk/pull/2309))
- 💥 [RUMF-1577] Stop collecting foreground periods ([#2311](https://github.com/DataDog/browser-sdk/pull/2311))
- 💥 [RUMF-1557] beforeSend domain context: use PerformanceEntry ([#2300](https://github.com/DataDog/browser-sdk/pull/2300))
- 💥 [RUMF-1556] Typings: consistent beforeSend return type ([#2303](https://github.com/DataDog/browser-sdk/pull/2303))
- 💥 [RUMF-1229] Logs: remove `error.origin` attribute ([#2294](https://github.com/DataDog/browser-sdk/pull/2294))
- 💥 [RUMF-1228] Remove console error message prefix ([#2289](https://github.com/DataDog/browser-sdk/pull/2289))
- 💥 [RUMF-1555] Rework logger context APIs ([#2285](https://github.com/DataDog/browser-sdk/pull/2285))
- 💥 [RUMF-1152] sanitize resource method names ([#2288](https://github.com/DataDog/browser-sdk/pull/2288))
- 💥 [RUMF-1555] Remove `event` in action domain context ([#2286](https://github.com/DataDog/browser-sdk/pull/2286))
- 💥 [RUMF-1588] Update default session replay behaviour ([#2257](https://github.com/DataDog/browser-sdk/pull/2257))
- 💥 [RUMF-1554] Drop some deprecated public APIs ([#2241](https://github.com/DataDog/browser-sdk/pull/2241))
- 💥 [RUMF-1554] Drop some deprecated config parameters ([#2238](https://github.com/DataDog/browser-sdk/pull/2238))
- ✨ [RUM-255] add allowUntrustedEvents config parameter ([#2347](https://github.com/DataDog/browser-sdk/pull/2347))
- 🐛 [RUMF-1499] Don't send duration for resources crossing a page frozen state ([#2271](https://github.com/DataDog/browser-sdk/pull/2271))
- 🔥 [RUMF-1555] Remove `startTime` in xhr start context ([#2287](https://github.com/DataDog/browser-sdk/pull/2287))
- ♻️ [RUMF-1555] Remove deprecated context manager APIs ([#2284](https://github.com/DataDog/browser-sdk/pull/2284))

## v4.50.1

- 🐛 [RUM-1325] fix memory leak when using shadow dom ([#2451](https://github.com/DataDog/browser-sdk/pull/2451))
- 🐛 [RUM-1325] propagate privacy defined on shadow hosts ([#2454](https://github.com/DataDog/browser-sdk/pull/2454))
- 🐛 [RUM-1196] escape CSS rules containing a colon for Safari compatibility ([#2440](https://github.com/DataDog/browser-sdk/pull/2440))
- 🐛 [RUM-1062] remove message prefix when using the console handler ([#2452](https://github.com/DataDog/browser-sdk/pull/2452))
- 🐛 [RUM-1211] fix compatibility with TS4.6/4.7 using ES2022 ([#2455](https://github.com/DataDog/browser-sdk/pull/2455))

## v4.50.0

- ✨ [RUM-1062] add a prefix to all console message displayed by the SDK ([#2432](https://github.com/DataDog/browser-sdk/pull/2432))
- ✨ [extension] add columns to the event list ([#2372](https://github.com/DataDog/browser-sdk/pull/2372))
- ✨ [extension] revamp event description and JSON viz ([#2371](https://github.com/DataDog/browser-sdk/pull/2371))
- ✨ [extension] revamp filter UI ([#2370](https://github.com/DataDog/browser-sdk/pull/2370))
- ✨ [extension] filter outdated events ([#2369](https://github.com/DataDog/browser-sdk/pull/2369))
- 🐛 [RUM-1085] Remove lock usage from Local Storage strategy ([#2435](https://github.com/DataDog/browser-sdk/pull/2435))
- ♻️ rename scroll fields ([#2439](https://github.com/DataDog/browser-sdk/pull/2439))
- 🔇 Remove cwv attribution telemetry
- ♻️ [RUM-1039] Harmonize view tests ([#2430](https://github.com/DataDog/browser-sdk/pull/2430))
- Report scroll metrics when page is resized ([#2399](https://github.com/DataDog/browser-sdk/pull/2399))
- ♻️ [RUM-253] adapt transport to send encoded data ([#2415](https://github.com/DataDog/browser-sdk/pull/2415))
- 🔊 [RUM-253] customize deflate worker failure logs ([#2414](https://github.com/DataDog/browser-sdk/pull/2414))
- ♻️ Use performance entry fixtures in tests ([#2428](https://github.com/DataDog/browser-sdk/pull/2428))
- ⚗️ [RUM-1020] Collect core web vitals target selectors ([#2418](https://github.com/DataDog/browser-sdk/pull/2418))

## v4.49.0

- ✨[RUM-265] Store contexts across pages ([#2378](https://github.com/DataDog/browser-sdk/pull/2378))
- ✨[RUM-1016] Allow to change "view.name" ([#2396](https://github.com/DataDog/browser-sdk/pull/2396))
- ✨[RUM-1013] Early exit when no configuration provided ([#2417](https://github.com/DataDog/browser-sdk/pull/2417))
- 🐛[RUM-89] Do not count discarded resources ([#2410](https://github.com/DataDog/browser-sdk/pull/2410))

## v4.48.2

- 🐛 fix dynamic style serialization ([#2397](https://github.com/DataDog/browser-sdk/pull/2397))

## v4.48.1

- 🐛 fix INP support detection ([#2405](https://github.com/DataDog/browser-sdk/pull/2405))

## v4.48.0

- ✨ [RUM-252] optimistic worker creation ([#2377](https://github.com/DataDog/browser-sdk/pull/2377))
- 🐛 do not ignore @import rules pointing to inaccessible stylesheets ([#2398](https://github.com/DataDog/browser-sdk/pull/2398))
- 🎨 [RUM-262] Move view metrics in dedicated files ([#2386](https://github.com/DataDog/browser-sdk/pull/2386))
- ♻️ [RUM-253] refactor batch creation ([#2390](https://github.com/DataDog/browser-sdk/pull/2390))
- ⚗️ [RUM-257] Collect INP ([#2355](https://github.com/DataDog/browser-sdk/pull/2355))
- ♻️ [RUM-250] introduce a DeflateEncoder ([#2376](https://github.com/DataDog/browser-sdk/pull/2376))

## v4.47.0

- ✨ [RUM-233] add workerUrl initialization parameter ([#2354](https://github.com/DataDog/browser-sdk/pull/2354))
- 🐛[RUM-142] fix the generation of some invalid selectors ([#2375](https://github.com/DataDog/browser-sdk/pull/2375))
- ✨ enable scrollmap collection ([#2374](https://github.com/DataDog/browser-sdk/pull/2374))
- 📝 [RUM-254] Document extension internally available on store ([#2368](https://github.com/DataDog/browser-sdk/pull/2368))
- ♻️ Cherry-pick some changes from v5 to limit conflicts ([#2357](https://github.com/DataDog/browser-sdk/pull/2357))

## v4.46.0

- ⚗ [RUM][REPLAY] Try to reduce the size of the replay payload ([#2348](https://github.com/DataDog/browser-sdk/pull/2348))
- ♻️ [RUM-249] update worker protocol ([#2346](https://github.com/DataDog/browser-sdk/pull/2346))
- 🔈 Add web vital attribution telemetry debug ([#2344](https://github.com/DataDog/browser-sdk/pull/2344))
- 📝 [developer-extension] Update extension instructions ([#2343](https://github.com/DataDog/browser-sdk/pull/2343))
- 🔉 [developer-extension] bootstrap monitoring ([#2337](https://github.com/DataDog/browser-sdk/pull/2337))
- 🐛 Avoid setting non-object values for contexts ([#2341](https://github.com/DataDog/browser-sdk/pull/2341))

## v4.45.0

- ✨ [RUM-235] add sample rates fields ([#2323](https://github.com/DataDog/browser-sdk/pull/2323))
- 🐛 [RUM-238] Handle tracekit multilines message parsing ([#2332](https://github.com/DataDog/browser-sdk/pull/2332))
- 🐛👷 Fix scope packages npm publication ([#2334](https://github.com/DataDog/browser-sdk/pull/2334))
- 🔉 monitor reported errors ([#2335](https://github.com/DataDog/browser-sdk/pull/2335))

## v4.44.2

- 🐛👷 [RUM-232] fix worker/string package ([#2331](https://github.com/DataDog/browser-sdk/pull/2331))

## v4.44.1

- 🐛 Fix RUM slim npm package publication ([#2325](https://github.com/DataDog/browser-sdk/pull/2325))
- 🐛 [RUM-231] Fix location.origin is "null" for file: URIs ([#2306](https://github.com/DataDog/browser-sdk/pull/2306))
- ♻️ [RUM-232] create a `@datadog/browser-worker` package ([#2319](https://github.com/DataDog/browser-sdk/pull/2319))
- 🔊 Add tracekit try parse message failing telemetry ([#2322](https://github.com/DataDog/browser-sdk/pull/2322))
- 💬 Update heavy customer data warning ([#2316](https://github.com/DataDog/browser-sdk/pull/2316))

## v4.44.0

- ✨ Collect replay privacy level in views ([#2299](https://github.com/DataDog/browser-sdk/pull/2299))
- 🐛 [RUMF-1613] fix session replay performance regression ([#2313](https://github.com/DataDog/browser-sdk/pull/2313))
- ♻️ Base foreground computation on page lifecycle states ([#2253](https://github.com/DataDog/browser-sdk/pull/2253))
- ⚗ Collect scroll metrics ([#2180](https://github.com/DataDog/browser-sdk/pull/2180))

## v4.43.0

- ✨ [RUMF-1580] Implement storage fallback ([#2261](https://github.com/DataDog/browser-sdk/pull/2261))
- ✨ [RUMF-1580] Implement Local Storage ([#2260](https://github.com/DataDog/browser-sdk/pull/2260))
- 🐛 Telemetry: do not scrub staging and canary frames ([#2273](https://github.com/DataDog/browser-sdk/pull/2273))
- ♻️ [RUMF-1580] Decouple storage mechanism ([#2259](https://github.com/DataDog/browser-sdk/pull/2259))
- ⚗️ [RUMF-1499] Don't send duration for resources crossing a page frozen state ([#2255](https://github.com/DataDog/browser-sdk/pull/2255))
- 🔊 [RUMF-1577] Collect page lifecycle states ([#2229](https://github.com/DataDog/browser-sdk/pull/2229))

## v4.42.2

- 🐛 Fix TypeError when document.cookie is empty ([#2216](https://github.com/DataDog/browser-sdk/pull/2216))
- 🐛 [RUMF-1583][recorder] do not ignore empty text node during serialization ([#2237](https://github.com/DataDog/browser-sdk/pull/2237))
- 🐛 Fix `use_excluded_activity_urls` telemetry ([#2236](https://github.com/DataDog/browser-sdk/pull/2236))
- 🐛 when bridge is present, send a final view update on page exit ([#2234](https://github.com/DataDog/browser-sdk/pull/2234))
- 📝 Update FCP browser support ([#2187](https://github.com/DataDog/browser-sdk/pull/2187))
- 👷 use a separate job to deploy US1 ([#2228](https://github.com/DataDog/browser-sdk/pull/2228))

## v4.42.1

- 🐛 fix isolatedModules support ([#2209](https://github.com/DataDog/browser-sdk/pull/2209))
- 🐛 [RUMF-1576] fix support for tools that removes console.\* references ([#2210](https://github.com/DataDog/browser-sdk/pull/2210))
- 📦👷 include webpack, typescript and @types/express in common upgrades ([#2222](https://github.com/DataDog/browser-sdk/pull/2222))
- ⚡ remove spec files from npm packages ([#2224](https://github.com/DataDog/browser-sdk/pull/2224))
- 📦 [RUMF-1532] update webpack-related dependencies ([#2212](https://github.com/DataDog/browser-sdk/pull/2212))
- 📦 update vulnerable subdependency engine.io ([#2211](https://github.com/DataDog/browser-sdk/pull/2211))

## v4.42.0

- ✨[RUMF-1573] Allow to provide custom fingerprint to RUM errors ([#2189](https://github.com/DataDog/browser-sdk/pull/2189))
- ✨[RUMF-1508] Provide stack trace for all uncaught exceptions ([#2182](https://github.com/DataDog/browser-sdk/pull/2182))
- ✨[RUMF-1573] allow to add modifiable field paths with beforeSend ([#2186](https://github.com/DataDog/browser-sdk/pull/2186))
- 🐛 Revert Errors serialization behavior ([#2197](https://github.com/DataDog/browser-sdk/pull/2197))
- ♻️ [RUMF-1508] reorganise error handling ([#2181](https://github.com/DataDog/browser-sdk/pull/2181))

## v4.41.0

- ✨ [RUMF-1470] enable sanitize for user-provided data ([#2175](https://github.com/DataDog/browser-sdk/pull/2175))

## v4.40.0

- ♻️ [RUMF-1508] refactor error types / constants ([#2179](https://github.com/DataDog/browser-sdk/pull/2179))
- ✨ [RUMF-1530] enable sending replay metadata as json ([#2177](https://github.com/DataDog/browser-sdk/pull/2177))
- ✨ [RUMF-1479] enable heatmaps collection ([#2178](https://github.com/DataDog/browser-sdk/pull/2178))
- ✨ [RUMF-1534] send a view update when session is expiring ([#2166](https://github.com/DataDog/browser-sdk/pull/2166))
- ✨ [RUMF-1534] allow (some) view updates after session expiration ([#2167](https://github.com/DataDog/browser-sdk/pull/2167))
- 🐛 Fix exception when using wrong tracing parameters ([#2173](https://github.com/DataDog/browser-sdk/pull/2173))
- 🚨 add require-await rule and remove useless async ([#2132](https://github.com/DataDog/browser-sdk/pull/2132))
- ✨ [RUMF-1530] send replay metadata as json ([#2125](https://github.com/DataDog/browser-sdk/pull/2125))
- ✨ [RUMF-1533] flush pending data on session expiration ([#2150](https://github.com/DataDog/browser-sdk/pull/2150))
- ♻️ factorize LifeCycle and simplify its types ([#2165](https://github.com/DataDog/browser-sdk/pull/2165))

## v4.39.0

- ♻️ [RUMF-1533] extract the Flush logic into a reusable component ([#2144](https://github.com/DataDog/browser-sdk/pull/2144))
- 🔥 Cleanup unnecessary flags ([#2145](https://github.com/DataDog/browser-sdk/pull/2145))
- [REPLAY] Add public function to get the link to current Replay ([#2047](https://github.com/DataDog/browser-sdk/pull/2047))
- 🐛 [RUMF-1544] Fix badly polyfilled URL ([#2141](https://github.com/DataDog/browser-sdk/pull/2141))
- Add an eslint rule to disallow the use of too generic utility file names ([#2101](https://github.com/DataDog/browser-sdk/pull/2101))
- ♻️ [RUMF-1517] split tools utils ([#2128](https://github.com/DataDog/browser-sdk/pull/2128))
- ♻️ [RUMF-1505] make sure we don't use Zone.js addEventListener ([#2129](https://github.com/DataDog/browser-sdk/pull/2129))
- 🏷️ improve addEventListener typings ([#2127](https://github.com/DataDog/browser-sdk/pull/2127))
- 🐛[RUMF-1517] Remove specHelper export in src code ([#2126](https://github.com/DataDog/browser-sdk/pull/2126))
- ♻️ rename performance utils ([#2136](https://github.com/DataDog/browser-sdk/pull/2136))
- ✨ Support snippet as a valid file url for stack trace computation ([#2077](https://github.com/DataDog/browser-sdk/pull/2077))
- ✅ Remove feature flag test warning noise

## v4.38.0

- ✨ [RUMF-1510] Warn the user when a heavy context is used ([#2120](https://github.com/DataDog/browser-sdk/pull/2120))
- ♻️ [RUMF-1517] reorganise some components ([#2124](https://github.com/DataDog/browser-sdk/pull/2124))
- 🐛 [RUMF-1470] Sanitize - Fix size computation ([#2116](https://github.com/DataDog/browser-sdk/pull/2116))
- ✅ improve async calls collection ([#2123](https://github.com/DataDog/browser-sdk/pull/2123))
- 🔊 Collect url and base on failing URL build telemetry ([#2062](https://github.com/DataDog/browser-sdk/pull/2062))
- 📝 [RUMF-1526] simplify rum package README.md ([#2122](https://github.com/DataDog/browser-sdk/pull/2122))
- 📝 [RUMF-1526] simplify logs package README.md ([#2121](https://github.com/DataDog/browser-sdk/pull/2121))
- ♻️ [RUMF-1529] use an enum for experimental features ([#2113](https://github.com/DataDog/browser-sdk/pull/2113))
- ♻️ [RUMF-1517] split rum test utils ([#2117](https://github.com/DataDog/browser-sdk/pull/2117))
- ♻️ [RUMF-1517] split core specHelper ([#2111](https://github.com/DataDog/browser-sdk/pull/2111))
- ♻️ [RUMF-1517] rework test utils ([#2118](https://github.com/DataDog/browser-sdk/pull/2118))
- ♻️ [RUMF-1517] add test index files ([#2115](https://github.com/DataDog/browser-sdk/pull/2115))
- ♻️ [RUMF-1517] split domain utils ([#2105](https://github.com/DataDog/browser-sdk/pull/2105))

## v4.37.0

- ♻️[RUMF-1517] split rum-core specHelper ([#2106](https://github.com/DataDog/browser-sdk/pull/2106))
- ♻️[RUMF-1517] split scripts utils ([#2102](https://github.com/DataDog/browser-sdk/pull/2102))
- ✨[RUMF-1500] Remove some references to legacy bundles ([#2097](https://github.com/DataDog/browser-sdk/pull/2097))
- 📝 RUMF-1497 Update logger API documentation ([#2098](https://github.com/DataDog/browser-sdk/pull/2098))
- ✨ [RUMF-1518] implement a new API to stop the RUM session ([#2064](https://github.com/DataDog/browser-sdk/pull/2064))
- 🐛 ♻️ [RUMF 1470] Fix serialization issues ([#1971](https://github.com/DataDog/browser-sdk/pull/1971))
- ♻️ [RUMF-1505] introduce a safe `setInterval` helper function ([#2044](https://github.com/DataDog/browser-sdk/pull/2044))

## v4.36.0

- ✨ [RUMF-1497] Allow logger APIs to pass an Error parameter ([#2029](https://github.com/DataDog/browser-sdk/pull/2029))
- ⚗️ [RUMF-1522] Expose addFeatureFlagEvaluation ([#2096](https://github.com/DataDog/browser-sdk/pull/2096))
- 🐛 [RUMF-1491] fix error when calling `fetch` with an unexpected value as first parameter ([#2061](https://github.com/DataDog/browser-sdk/pull/2061))

## v4.35.0

- ✨[RUMF-1500] deploy new datacenter files ([#2049](https://github.com/DataDog/browser-sdk/pull/2049))

## v4.34.3

- 🐛 Handle undefined cancel idle callback ([#2045](https://github.com/DataDog/browser-sdk/pull/2045))
- ♻️ [RUMF-1500] tweak deployment scripts ([#2046](https://github.com/DataDog/browser-sdk/pull/2046))
- ♻️ [RUMF-1505] introduce and use a safe `setTimeout` helper function ([#2032](https://github.com/DataDog/browser-sdk/pull/2032))
- ♻️ [REPLAY] Avoid casting & add proper check instead of relying on try/catch ([#2016](https://github.com/DataDog/browser-sdk/pull/2016))

## v4.34.2

- 🐛 [RUMF-1443] fix Zone.js/Angular crash when recording the session ([#2030](https://github.com/DataDog/browser-sdk/pull/2030))
- 🐛 [REPLAY] Fix serialization for checkbox & radio ([#2021](https://github.com/DataDog/browser-sdk/pull/2021))
- ⚗️ [RUMF-1484] use pagehide as unload event ([#2020](https://github.com/DataDog/browser-sdk/pull/2020))

## v4.34.1

- 🐛 [RUMF-1493] Avoid infinite loop on `form > input[name="host"]` element ([#2017](https://github.com/DataDog/browser-sdk/pull/2017))
- 🐛 [RUMF-1485] Flush event when page becomes frozen ([#2015](https://github.com/DataDog/browser-sdk/pull/2015))
- 🐛 [RUMF-1296][rumf-1293] Fix dead click computation ([#1998](https://github.com/DataDog/browser-sdk/pull/1998))

## v4.34.0

- 🐛 fix Shadow DOM support on Microsoft Edge ([#2003](https://github.com/DataDog/browser-sdk/pull/2003))
- ✨ [RUMF-1469] introduce a new `proxy` initialization parameter ([#1947](https://github.com/DataDog/browser-sdk/pull/1947))

## v4.33.0

- 🐛 fix frustration animation in session replay ([#1999](https://github.com/DataDog/browser-sdk/pull/1999))
- ✨ Add new intake strategy for ap1 ([#1997](https://github.com/DataDog/browser-sdk/pull/1997))
- Revert "🔊 add view document_count in non-view events ([#1892](https://github.com/DataDog/browser-sdk/pull/1892))" ([#1959](https://github.com/DataDog/browser-sdk/pull/1959))
- 🐛 [REPLAY] Discard mouse/touch event without x/y position ([#1993](https://github.com/DataDog/browser-sdk/pull/1993))

## v4.32.1

- 🐛[RUMF-1450] stop computing coordinates for focus/blur records ([#1985](https://github.com/DataDog/browser-sdk/pull/1985))

## v4.32.0

- 🐛 ignore contenteditable elements for dead clicks ([#1986](https://github.com/DataDog/browser-sdk/pull/1986))
- 🐛 [RUMF-1476] Fix removednodes.foreach is not a function ([#1984](https://github.com/DataDog/browser-sdk/pull/1984))
- 🐛⚗ [RUMF-1293] discard dead clicks when activity occurs on pointerdown ([#1979](https://github.com/DataDog/browser-sdk/pull/1979))
- ⬆️ fix flaky test ([#1982](https://github.com/DataDog/browser-sdk/pull/1982))
- 🔊 Enable customer data telemetry ([#1983](https://github.com/DataDog/browser-sdk/pull/1983))
- ⚗🐛 [RUMF-1296] use pointerup to trigger click actions ([#1958](https://github.com/DataDog/browser-sdk/pull/1958))
- [REPLAY] Add telemetry for shadow dom ([#1978](https://github.com/DataDog/browser-sdk/pull/1978))
- ⬆️ fix Jasmine deprecation warning on unit tests/IE ([#1974](https://github.com/DataDog/browser-sdk/pull/1974))
- 🐛[RUMF-1465] collect data for disturbed response ([#1977](https://github.com/DataDog/browser-sdk/pull/1977))
- 🔊 [REPLAY] Add telemetry for shadow DOM ([#1975](https://github.com/DataDog/browser-sdk/pull/1975))

## v4.31.0

- ✨[REPLAY] Add support for shadow dom ([#1969](https://github.com/DataDog/browser-sdk/pull/1969))
- ✨[REPLAY] Keep Href from link even when importing CSS ([#1960](https://github.com/DataDog/browser-sdk/pull/1960))
- 🐛[RUMF-1465] fix missing data when fetch instrumented by zone.js ([#1942](https://github.com/DataDog/browser-sdk/pull/1942))
- ⚗️ 🐛 reset input state at the beginning of each click ([#1968](https://github.com/DataDog/browser-sdk/pull/1968))
- ⚗️ 🔊[RUMF-1467] Collect user data telemetry ([#1941](https://github.com/DataDog/browser-sdk/pull/1941))
- ⚗️ 🔊 [RUMF-1445] Check if the page was discarded before a resource ([#1945](https://github.com/DataDog/browser-sdk/pull/1945))

## v4.30.1

- ⚗️ [REPLAY] Add support for `adoptedStyleSheets` ([#1916](https://github.com/DataDog/browser-sdk/pull/1916))
- 🔊 [RUMF-1345] Revert log first untrusted events of each type ([#1940](https://github.com/DataDog/browser-sdk/pull/1940))
- 🐛 Fix `getInitConfiguration()` behaviour ([#1893](https://github.com/DataDog/browser-sdk/pull/1893))
- ⚡ Ignore modulepreload and prefetch in link tags ([#1921](https://github.com/DataDog/browser-sdk/pull/1921))
- ⚗️🔊 Collect page lifecycle states in resources ([#1890](https://github.com/DataDog/browser-sdk/pull/1890))

## v4.30.0

- ✨[RUMF-1397] init parameter standardisation ([#1917](https://github.com/DataDog/browser-sdk/pull/1917))

## v4.29.1

- ⚗️ [REPLAY] Experiment support for shadow DOM ([#1787](https://github.com/DataDog/browser-sdk/pull/1787))
- 🔊 [RUMF-1345] add telemetry logs on untrusted events ([#1910](https://github.com/DataDog/browser-sdk/pull/1910))
- 🔊 add view document_count in non-view events ([#1892](https://github.com/DataDog/browser-sdk/pull/1892))

## v4.29.0

- 🐛 [RUMF-1435] do not retry status 0 request while online ([#1891](https://github.com/DataDog/browser-sdk/pull/1891))
- ✨ [RUMF-1236] Add support for OTel headers ([#1832](https://github.com/DataDog/browser-sdk/pull/1832))
- 🐛[RUMF-1435] don't retry opaque response ([#1877](https://github.com/DataDog/browser-sdk/pull/1877))
- ✨ [RUMF-1425] enable request retry/throttle for replay intake ([#1819](https://github.com/DataDog/browser-sdk/pull/1819))
- 🐛 [RUMF-1421] keep updating the view event counters after view end ([#1864](https://github.com/DataDog/browser-sdk/pull/1864))

## v4.28.1

- Re-release v4.28.0 to work around a NPM packaging issue

## v4.28.0

- 🐛 [RUMF-1337] Fix incorrect fetch duration ([#1875](https://github.com/DataDog/browser-sdk/pull/1875))

## v4.27.1

- 🐛 [RUMF-1449] fix Zone support when **symbol** is missing ([#1872](https://github.com/DataDog/browser-sdk/pull/1872))

## v4.27.0

- ✨Allow internal analytics subdomain ([#1863](https://github.com/DataDog/browser-sdk/pull/1863))
- 🔊 Collect computed and perf entry durations ([#1861](https://github.com/DataDog/browser-sdk/pull/1861))
- 🐛 [RUMF-1449] workaround for Firefox memory leak when using Zone.js ([#1860](https://github.com/DataDog/browser-sdk/pull/1860))
- ✨ send data from the SDK to the extension ([#1850](https://github.com/DataDog/browser-sdk/pull/1850))
- ♻️ [RUMF-1440] improve feature flag collection implementation ([#1839](https://github.com/DataDog/browser-sdk/pull/1839))

## v4.26.0

- 🐛 [RUMF-1421] improve counters by filtering child events ([#1837](https://github.com/DataDog/browser-sdk/pull/1837))
- ✨ [RUMF-1435] Add transport api on events ([#1840](https://github.com/DataDog/browser-sdk/pull/1840))
- ⚗️ [RUMF-1337] add `fetch_duration` experiment to resolve incorrect fetch duration ([#1810](https://github.com/DataDog/browser-sdk/pull/1810))
- ✨ Move extension settings to a Settings panel ([#1847](https://github.com/DataDog/browser-sdk/pull/1847))
- ✨ Clear event list on page reload for SDK extension ([#1825](https://github.com/DataDog/browser-sdk/pull/1825))
- ⬆️ [RUMF-1434] fix yarn failing to install puppeteer on M1 mac ([#1843](https://github.com/DataDog/browser-sdk/pull/1843))
- ⬆️ [RUMF-1434] fix running e2e tests on M1 macs ([#1842](https://github.com/DataDog/browser-sdk/pull/1842))
- ✨ Improve event description message in developer extension ([#1831](https://github.com/DataDog/browser-sdk/pull/1831))
- ✨ [RUMF-1396] migrate extension to manifest v3 ([#1828](https://github.com/DataDog/browser-sdk/pull/1828))

## v4.25.0

- ⚡️ ⚗ [RUMF-1438] Collect feature flags ([#1827](https://github.com/DataDog/browser-sdk/pull/1827))
- ✨ Auto Flush for SDK extension ([#1824](https://github.com/DataDog/browser-sdk/pull/1824))

## v4.24.1

- ⏪ Revert "🐛 [RUMF-1410] Allow serialization of objects with cyclic references ([#1783](https://github.com/DataDog/browser-sdk/pull/1783))" ([#1821](https://github.com/DataDog/browser-sdk/pull/1821))
- 📈[RUMF-1432] Collect trackResources and trackLongTasks configs ([#1814](https://github.com/DataDog/browser-sdk/pull/1814))
- 🗑️ [RUMF-1433] Remove Preflight request Performance Entry check ([#1813](https://github.com/DataDog/browser-sdk/pull/1813))
- ✨[RUMF-1435] Add some retry info on events ([#1817](https://github.com/DataDog/browser-sdk/pull/1817))

## v4.24.0

- ⚗️✨ [RUMF-1379] heatmaps: enable descendant combined selectors ([#1811](https://github.com/DataDog/browser-sdk/pull/1811))
- ✨ [RUMF-1409] Provide setUser and related functions for logs SDK ([#1801](https://github.com/DataDog/browser-sdk/pull/1801))
- ⚗️ ✨ [RUMF-1425] use the retry/throttle transport strategy to send segments ([#1807](https://github.com/DataDog/browser-sdk/pull/1807))
- ♻️ [RUMF-1424] factorize page exit logic ([#1805](https://github.com/DataDog/browser-sdk/pull/1805))
- 📝 Clarify log SDK usage in the readme ([#1767](https://github.com/DataDog/browser-sdk/pull/1767))

## v4.23.3

- 🐛 [REPLAY-1075] Convert relative URLS to absolute in stylesheets ([#1792](https://github.com/DataDog/browser-sdk/pull/1792))
- 🐛 [RUMF-1423] prevent unexpected behavior when our xhr are reused ([#1797](https://github.com/DataDog/browser-sdk/pull/1797))
- 🐛 [RUMF-1410] Allow serialization of objects with cyclic references ([#1783](https://github.com/DataDog/browser-sdk/pull/1783))

## v4.23.2

- 🔉[RUMF-1423] Investigation for retry issue - part 2 ([#1793](https://github.com/DataDog/browser-sdk/pull/1793))

## v4.23.1

- 🔉[RUMF-1423] Add debug log for retry issue ([#1790](https://github.com/DataDog/browser-sdk/pull/1790))

## v4.23.0

- ✨[RUMF-1377] Enable new request strategy ([#1770](https://github.com/DataDog/browser-sdk/pull/1770))
- 🐛 [RUMF-1393] don't mask attributes used to create CSS selectors ([#1737](https://github.com/DataDog/browser-sdk/pull/1737))
- ⚗ [RUMF-1379] heatmap: experiment improved selector regarding unicity ([#1741](https://github.com/DataDog/browser-sdk/pull/1741))

## v4.22.0

- ⚡️ Enable telemetry configuration ([#1780](https://github.com/DataDog/browser-sdk/pull/1780))
- 🔊 [RUMF-1416] Use service distinguish log rum telemetry configuration ([#1774](https://github.com/DataDog/browser-sdk/pull/1774))
- ✨ accept functions in allowedTracingOrigins/excludedActivityUrls arguments list ([#1775](https://github.com/DataDog/browser-sdk/pull/1775))
- ⚗️ [RUMF-1405] remove mechanism to simulate intake issue ([#1768](https://github.com/DataDog/browser-sdk/pull/1768))
- 🔊 Collect configuration telemetry event ([#1760](https://github.com/DataDog/browser-sdk/pull/1760))

## v4.21.2

- ⚗️ [RUMF-1405] add mechanism to simulate intake issue ([#1757](https://github.com/DataDog/browser-sdk/pull/1757))

## v4.21.1

- 🐛 npm publish: skip publish confirmation ([#1755](https://github.com/DataDog/browser-sdk/pull/1755))

## v4.21.0

- ✨ [RUMF-1353] Collect error causes ([#1740](https://github.com/DataDog/browser-sdk/pull/1740))
- 🐛 [RUMF-1276] handle performance entry without `toJSON` ([#1751](https://github.com/DataDog/browser-sdk/pull/1751))
- 🐛 handle undefined policy ([#1752](https://github.com/DataDog/browser-sdk/pull/1752))

## v4.20.0

- ✨ [RUMF-1391] Introduce trackResources, trackLongTasks and sessionReplaySampleRate ([#1744](https://github.com/DataDog/browser-sdk/pull/1744))
- ♻️ [RUMF-1368] use the PointerDown event target for click actions ([#1731](https://github.com/DataDog/browser-sdk/pull/1731))
- ⚗ [RUMF-1379] use experimented CSS selectors strategies by default ([#1738](https://github.com/DataDog/browser-sdk/pull/1738))

## v4.19.1

- 🐛 [RUMF-1369] Exclude error message from stacktrace parsing ([#1725](https://github.com/DataDog/browser-sdk/pull/1725))
- 🐛 [RUMF-1384] Filter abnormal TTFB values ([#1729](https://github.com/DataDog/browser-sdk/pull/1729))
- 🐛 [RUMF-1378] do not mask action name attributes ([#1721](https://github.com/DataDog/browser-sdk/pull/1721))
- ⚗️ [RUMF-1378] use stable attributes when computing heatmap selector ([#1724](https://github.com/DataDog/browser-sdk/pull/1724))
- ⚗️ [RUMF-1379] heatmaps: refine selectors pass 2 ([#1726](https://github.com/DataDog/browser-sdk/pull/1726))
- ⚗️ [RUMF-1351] tweak retry strategy ([#1723](https://github.com/DataDog/browser-sdk/pull/1723))
- ⚗️ [RUMF-1351] retry request on timeout ([#1728](https://github.com/DataDog/browser-sdk/pull/1728))

## v4.19.0

- ✨ [RUMF-1286] test for expected features before starting recording ([#1719](https://github.com/DataDog/browser-sdk/pull/1719))
- ✨ [RUMF-1371] Collect view time to first byte ([#1717](https://github.com/DataDog/browser-sdk/pull/1717))
- 📝 Fix `actionNameAttribute` broken link ([#1708](https://github.com/DataDog/browser-sdk/pull/1708))
- ⚗️🔉 [RUMF-1351] add error when reaching max events size queued for upload ([#1716](https://github.com/DataDog/browser-sdk/pull/1716))
- ⚗️🔉 [RUMF-1351] retry: add extra context to queue full log ([#1714](https://github.com/DataDog/browser-sdk/pull/1714))
- ⚗️✨[RUMF-1351] experiment request retry strategy ([#1700](https://github.com/DataDog/browser-sdk/pull/1700))

## v4.18.1

- 🐛 [RUMF-1333] fix keepalive support check ([#1712](https://github.com/DataDog/browser-sdk/pull/1712))

## v4.18.0

- ✨ [RUMF-1306] Send the tracing sample rate in rule_psr for resources ([#1669](https://github.com/DataDog/browser-sdk/pull/1669)), ([#1705](https://github.com/DataDog/browser-sdk/pull/1705))
- ✨ [RUMF-1333] Send request with fetch keepalive + fallback ([#1701](https://github.com/DataDog/browser-sdk/pull/1701)), ([#1682](https://github.com/DataDog/browser-sdk/pull/1682))
- ✨ [RUMF-1309] Implement nested CSS support ([#1699](https://github.com/DataDog/browser-sdk/pull/1699))
- 🐛 Fix instrumention of null function with 3rd party wrapper ([#1570](https://github.com/DataDog/browser-sdk/pull/1570)) ([#1697](https://github.com/DataDog/browser-sdk/pull/1697))

## v4.17.2

- 🐛 [RUMF-1344] scroll positions: remove fallback for null scrollingElement ([#1694](https://github.com/DataDog/browser-sdk/pull/1694))
- ⚗️ [RUMF-1356] selectors using stable attributes and no class names ([#1689](https://github.com/DataDog/browser-sdk/pull/1689))
- 👷 [RUMF-1357] Add a peer dependency between rum and logs packages ([#1668](https://github.com/DataDog/browser-sdk/pull/1668))

## v4.17.1

- 🐛 [RUMF-1344] try to improve document scrolling element handling ([#1688](https://github.com/DataDog/browser-sdk/pull/1688))
- ✨⚗ [RUMF-1355] add selector with stable attributes ([#1684](https://github.com/DataDog/browser-sdk/pull/1684))

## v4.17.0

- ✨ [RUMF-1315] Extend user object methods ([#1641](https://github.com/DataDog/browser-sdk/pull/1641))
- ⚡[RUMF-1344] Serialize scroll positions only for full snapshots ([#1670](https://github.com/DataDog/browser-sdk/pull/1670))
- ⚡ [RUMF-1344] Access scroll attributes only on initial full snapshot ([#1680](https://github.com/DataDog/browser-sdk/pull/1680))
- ⚗️ [RUMF-1346] heatmaps: move action event attributes ([#1667](https://github.com/DataDog/browser-sdk/pull/1667))
- 🐛 [RUMF-1239] Hide placeholder value when privacy set to mask ([#1660](https://github.com/DataDog/browser-sdk/pull/1660))
- 🐛 fix compatibility check ([#1685](https://github.com/DataDog/browser-sdk/pull/1685))

## v4.16.1

- 🐛 [RUMF-1274] track request to undefined/null URL ([#1665](https://github.com/DataDog/browser-sdk/pull/1665))

## v4.16.0

- ✨ [REPLAY-898] Recording Frustration signals (dead, error & rage clicks) for session replay ([#1632](https://github.com/DataDog/browser-sdk/pull/1632))
- 🐛 [RUMF-1310] handle extra stacktrace parsing cases ([#1647](https://github.com/DataDog/browser-sdk/pull/1647))
- 🐛 improve `jsonStringify` implementation ([#1653](https://github.com/DataDog/browser-sdk/pull/1653))
- 🔒 [RUMF-1335] fix incorrect string escape ([#1651](https://github.com/DataDog/browser-sdk/pull/1651))

## v4.15.0

- 🐛 frustration signals: track window open ([#1631](https://github.com/DataDog/browser-sdk/pull/1631))
- 🐛 [RUMF-1327] rum synthetics: fix logs session conflict ([#1629](https://github.com/DataDog/browser-sdk/pull/1629))
- 🔊 Add feature flags to telemetry events ([#1625](https://github.com/DataDog/browser-sdk/pull/1625))
- ✨[RUMF-1314] Expose a DD_LOGS.getInternalContext ([#1626](https://github.com/DataDog/browser-sdk/pull/1626))
- 🐛 [RUMF-1273] fix BUILD_MODE scope ([#1627](https://github.com/DataDog/browser-sdk/pull/1627))

## v4.14.0

- ✨ [RUMF-1211] release Frustration Signals publicly ([#1617](https://github.com/DataDog/browser-sdk/pull/1617))
- 🐛 [RUMF-1294] ignore dead clicks based on the click event target ([#1610](https://github.com/DataDog/browser-sdk/pull/1610))
- 📝 Fixing intrapage broken links ([#1613](https://github.com/DataDog/browser-sdk/pull/1613))
- 📝 Removes Extra Link ([#1612](https://github.com/DataDog/browser-sdk/pull/1612))
- 🐛 [RUMF-1297] frustration signals: track input changes ([#1603](https://github.com/DataDog/browser-sdk/pull/1603))
- 📝 DOCS-2277 Browser Monitoring Edits ([#1572](https://github.com/DataDog/browser-sdk/pull/1572))
- 🐛 [RUMF-1209] frustration signals: track selection change ([#1596](https://github.com/DataDog/browser-sdk/pull/1596))

## v4.13.0

- ✨ Enable service and version update on startView ([#1601](https://github.com/DataDog/browser-sdk/pull/1601))

## v4.12.0

- 🐛 [RUMF-1305] forbid the usage of `Date.now` ([#1600](https://github.com/DataDog/browser-sdk/pull/1600))
- 🔊 Clear batch before send to allow telemetry in httpRequest.send ([#1594](https://github.com/DataDog/browser-sdk/pull/1594))
- ⚗✨ [RUMF-1288] Collect viewport size ([#1584](https://github.com/DataDog/browser-sdk/pull/1584))

## v4.11.5

- 🐛 [RUMF-1303] stop forwarding network errors when forwardErrorsToLogs is false ([#1591](https://github.com/DataDog/browser-sdk/pull/1591))
- ♻️ Simplify RUM assembly ([#1588](https://github.com/DataDog/browser-sdk/pull/1588))

## v4.11.4

- 🏷️ adjust types to allow updating the SDK in Datadog app ([#1587](https://github.com/DataDog/browser-sdk/pull/1587))
- [RUMF-1280] collect click position ([#1566](https://github.com/DataDog/browser-sdk/pull/1566))

## v4.11.3

- ✨ improve developer extension ([#1580](https://github.com/DataDog/browser-sdk/pull/1580))
- 🐛 [RUMF-1267] remove last circular dependencies ([#1577](https://github.com/DataDog/browser-sdk/pull/1577))

## v4.11.2

- 🏷️ [RUMF-1256] adjust StyleSheetRule records to support index paths ([#1571](https://github.com/DataDog/browser-sdk/pull/1571))
- 🐛 [RUMF-1267] resolve remaining cyclic dependencies related to telemetry ([#1567](https://github.com/DataDog/browser-sdk/pull/1567))
- 📝 Browser Monitoring Edits ([#1563](https://github.com/DataDog/browser-sdk/pull/1563))

## v4.11.1

- ♻️ [RUMF-1190] cleanup telemetry ([#1560](https://github.com/DataDog/browser-sdk/pull/1560))
- ♻️ [RUMF-1267] remove circular dependencies part 1 ([#1559](https://github.com/DataDog/browser-sdk/pull/1559))
- ♻️ [RUMF-1277] rename frustration types ([#1557](https://github.com/DataDog/browser-sdk/pull/1557))

## v4.11.0

- ✨ [RUMF-1262] ignore some URLs when watching the page activity ([#1536](https://github.com/DataDog/browser-sdk/pull/1536))
- ✨ [RUMF-1191] enable telemetry on us1 site ([#1554](https://github.com/DataDog/browser-sdk/pull/1554))

## v4.10.4

- ✨ [RUMF-1191] enable telemetry on eu site ([#1551](https://github.com/DataDog/browser-sdk/pull/1551))
- ✨ [RUMF-1264] scrub customer frames from telemetry errors ([#1546](https://github.com/DataDog/browser-sdk/pull/1546))

## v4.10.3

- 🐛 Fix dependency issue ([#1549](https://github.com/DataDog/browser-sdk/pull/1549))

## v4.10.2

- ✨ rename Replay plan to Premium plan ([#1534](https://github.com/DataDog/browser-sdk/pull/1534))
- ✨ enable telemetry on us3 site ([#1544](https://github.com/DataDog/browser-sdk/pull/1544))

## v4.10.1

- ✨ enable telemetry on us5 site ([#1540](https://github.com/DataDog/browser-sdk/pull/1540))

## v4.10.0

- ✨[RUMF-1253] add `tracingSampleRate` option ([#1526](https://github.com/DataDog/browser-sdk/pull/1526))
- ⚗️✨ [RUMF-1258] stop ongoing action on view end ([#1528](https://github.com/DataDog/browser-sdk/pull/1528))
- 🐛 [RUMF-1259] support Zone.js < 0.8.6 ([#1530](https://github.com/DataDog/browser-sdk/pull/1530))
- ✨ add a button to clear events in the developer extension ([#1527](https://github.com/DataDog/browser-sdk/pull/1527))
- ⚗✨ [RUMF-1210] add a `trackFrustrations` initialization parameter ([#1524](https://github.com/DataDog/browser-sdk/pull/1524))
- ✨[RUMF-1257] prevent dual shipping of telemetry events ([#1523](https://github.com/DataDog/browser-sdk/pull/1523))
- ✨ [RUMF-1251] allow to enable telemetry by site ([#1520](https://github.com/DataDog/browser-sdk/pull/1520))

## v4.9.0

- ✨ Upgraded console logger to log the proper levels ([#1501](https://github.com/DataDog/browser-sdk/pull/1501))
- ♻️ [RUMF-1178] New logger assembly flow ([#1497](https://github.com/DataDog/browser-sdk/pull/1497))
- ⚗✨ [RUMF-1209] introduce "dead" and "error" frustration types ([#1487](https://github.com/DataDog/browser-sdk/pull/1487))
- ⚗✨ [RUMF-1209] collect rage clicks ([#1488](https://github.com/DataDog/browser-sdk/pull/1488))
- ⚗✨ [RUMF-1214] implement frustration signals counters ([#1511](https://github.com/DataDog/browser-sdk/pull/1511))

## v4.8.1

- 🐛 [RUMF-1240] fix attribute mutating to an empty value ([#1512](https://github.com/DataDog/browser-sdk/pull/1512))
- ⚗️ [RUMF-1182] add telemetry sample rate ([#1510](https://github.com/DataDog/browser-sdk/pull/1510))
- 💡 Update links to api key docs ([#1508](https://github.com/DataDog/browser-sdk/pull/1508))

## v4.8.0

- ✨ [RUMF-1192] forward Reports to Datadog ([#1506](https://github.com/DataDog/browser-sdk/pull/1506))
- ✨ [RUMF-1192] forward `console.*` logs to Datadog ([#1505](https://github.com/DataDog/browser-sdk/pull/1505))
- 📝 fix documentation for `proxyUrl` documentation ([#1503](https://github.com/DataDog/browser-sdk/pull/1503))
- ✨ [RUMF-1237] The event bridge allowed hosts should also match subdomains ([#1499](https://github.com/DataDog/browser-sdk/pull/1499))
- 📝 add `replaySampleRate` to README examples ([#1370](https://github.com/DataDog/browser-sdk/pull/1370))

## v4.7.1

- 🐛 Adjust records generated during view change so their date matches the view date ([#1486](https://github.com/DataDog/browser-sdk/pull/1486))
- ⚗✨ [RUMF-1224] remove console APIs prefix ([#1479](https://github.com/DataDog/browser-sdk/pull/1479))
- ♻️ [RUMF-1178] improve logs assembly part 2 ([#1463](https://github.com/DataDog/browser-sdk/pull/1463))
- ⚗✨ Allow update service version with start view ([#1448](https://github.com/DataDog/browser-sdk/pull/1448))
- ⚗✨ [RUMF-1208] don't discard automatic action on view creation ([#1451](https://github.com/DataDog/browser-sdk/pull/1451))
- ⚗✨ [RUMF-1207] collect concurrent actions ([#1434](https://github.com/DataDog/browser-sdk/pull/1434))
- ♻️ [RUMF-1207] collect concurrent actions groundwork - move action history closer to action collection ([#1432](https://github.com/DataDog/browser-sdk/pull/1432))

## v4.7.0

Note: The Logs Browser SDK 3.10.1 (released on December 21th, 2021) unexpectedly changed the initialization parameter `forwardErrorsToLogs` default value from `true` to `false`. This release restores the default value to `true`, so Logs Browser SDK users who don't specify this parameter will have errors forwarded as logs.

- 🐛 [RUMF-1217] restore forwardErrorsToLogs default value to `true` ([#1433](https://github.com/DataDog/browser-sdk/pull/1433))
- 🐛 [RUMF-1203] fix `stopSessionReplayRecording` instrumentation cleanup ([#1442](https://github.com/DataDog/browser-sdk/pull/1442))
- ♻️ 🐛 [RUMF-1178] fix logs displayed twice in the console ([#1425](https://github.com/DataDog/browser-sdk/pull/1425))
- 📝 Update browser config to include SDK version ([#1380](https://github.com/DataDog/browser-sdk/pull/1380))

## v4.6.1

- 🐛 fix build-env replacement in npm packages ([#1389](https://github.com/DataDog/browser-sdk/pull/1389))

## v4.6.0

- 📦 [RUMF-1162] update developer-extension ([#1379](https://github.com/DataDog/browser-sdk/pull/1379))
- 🔥 [RUMF-1198] remove problematic and useless code from the DeflateWorker ([#1378](https://github.com/DataDog/browser-sdk/pull/1378))
- ⚗️✨ [RUMF-1175] collect reports and csp violation ([#1332](https://github.com/DataDog/browser-sdk/pull/1332))
- ⚗️ [RUMF-1181] collect telemetry events ([#1374](https://github.com/DataDog/browser-sdk/pull/1374))
- 📄 Update documentation ([#1362](https://github.com/DataDog/browser-sdk/pull/1362))
- ♻️ [RUMF-1181] preliminary refactorings for telemetry events collection ([#1371](https://github.com/DataDog/browser-sdk/pull/1371))
- 🎨 Avoid template syntax when not needed ([#1372](https://github.com/DataDog/browser-sdk/pull/1372))
- 📦 [RUMF-1168] update typescript ([#1368](https://github.com/DataDog/browser-sdk/pull/1368))
- ⚡️ [RUMF-1171] prefer const enums ([#1364](https://github.com/DataDog/browser-sdk/pull/1364))
- 🔥 Clear remaining code of network error removal ([#1367](https://github.com/DataDog/browser-sdk/pull/1367))
- ⚡️ Process buffered performance entries in an idle callback ([#1337](https://github.com/DataDog/browser-sdk/pull/1337))
- ⚡️ [RUMF-1043] remove TSLib dependency ([#1347](https://github.com/DataDog/browser-sdk/pull/1347))
- ⚗️✨[RUMF-1188] add telemetry event types ([#1353](https://github.com/DataDog/browser-sdk/pull/1353))

## v4.5.0

- ⚡️ [RUMF-1115] throttle view updates by addTiming ([#1355](https://github.com/DataDog/browser-sdk/pull/1355))
- 📝 Update the configuration of the Browser Sessions ([#1322](https://github.com/DataDog/browser-sdk/pull/1322))
- ✨ [RUMF-1177] add index_in_view to segment meta ([#1342](https://github.com/DataDog/browser-sdk/pull/1342))
- ✨ [RUMF-1103] enable RUM tracking inside mobile webviews ([#1333](https://github.com/DataDog/browser-sdk/pull/1333))
- ⚗ [RUMF-1176] collect other console logs new ([#1316](https://github.com/DataDog/browser-sdk/pull/1316))

## v4.4.0

- ✨ [RUMF-1180] add `error.source_type` attribute ([#1328](https://github.com/DataDog/browser-sdk/pull/1328))
- ⚡️ [RUMF-1169] cleanup compute stack trace ([#1335](https://github.com/DataDog/browser-sdk/pull/1335))
- 🐛 [RUMF-1079] limit session inconsistencies issue on chromium browsers ([#1327](https://github.com/DataDog/browser-sdk/pull/1327))

## v4.3.0

- ✨ [RUMF-1135] expose SDK version through global variable ([#1278](https://github.com/DataDog/browser-sdk/pull/1278))
- ✨ [RUMF-1174] forward event to bridge with rum type ([#1309](https://github.com/DataDog/browser-sdk/pull/1309))
- 🐛 [RUMF-1153] fix initial view loading time computation ([#1315](https://github.com/DataDog/browser-sdk/pull/1315))
- ⚗ [RUMF-1079] restrict cookie-lock to chromium browsers ([#1283](https://github.com/DataDog/browser-sdk/pull/1283))

## v4.2.0

- ⚡️ [RUMF-1113] Notify performance entries by batch ([#1255](https://github.com/DataDog/browser-sdk/pull/1255))
- 🐛 [RUMF-1147] Implement TextEncoder().encode fallback for replay encorder ([#1269](https://github.com/DataDog/browser-sdk/pull/1269))
- ✨ [RUMF-1146] add 'source:browser' to all RUM events ([#1271](https://github.com/DataDog/browser-sdk/pull/1271))
- ⚡️ [RUMF-1111] limit the number of bytes read from the response ([#1264](https://github.com/DataDog/browser-sdk/pull/1264))
- ✨ [REPLAY-564] enable visual viewport recording ([#1247](https://github.com/DataDog/browser-sdk/pull/1247))
- 📝 add clarification to config example ([#1268](https://github.com/DataDog/browser-sdk/pull/1268))
- ⚡️ [RUMF-1111] compute response text in trackNetworkError ([#1263](https://github.com/DataDog/browser-sdk/pull/1263))
- 📝 [RUMF-1137] replace major changes description by links to the upgrade guide ([#1265](https://github.com/DataDog/browser-sdk/pull/1265))
- ⚗ [RUMF-1079] tweak max number of lock retries ([#1262](https://github.com/DataDog/browser-sdk/pull/1262))

## v4.1.0

- 🐛 [RUMF-1143] make sure to drop LCP timings if the page was previously hidden ([#1259](https://github.com/DataDog/browser-sdk/pull/1259))
- ⚗🐛 [RUMF-1079] add lock mechanism for session cookie writes ([#1230](https://github.com/DataDog/browser-sdk/pull/1230))
- ✨ [RUMF-1119] Implement dual ship for other orgs ([#1248](https://github.com/DataDog/browser-sdk/pull/1248))
- ✨ [RUMF-1109] Add event rate limiters for loggers ([#1243](https://github.com/DataDog/browser-sdk/pull/1243))
- ⚡️ [REPLAY-565] ♻️ Remove URL "relative to absolute" transformation ([#1244](https://github.com/DataDog/browser-sdk/pull/1244))

## v4.0.1

- 🐛 let the backend to most of the tags sanitization ([#1252](https://github.com/DataDog/browser-sdk/pull/1252))
- 🐛 remove child with action-names innerText instead of replacing them ([#1251](https://github.com/DataDog/browser-sdk/pull/1251))
- 📝 Add module convention to contributing ([#1240](https://github.com/DataDog/browser-sdk/pull/1240))
- ⚡️ [RUMF-1030] Decrease BoundedBuffer limitation to 500 ([#1242](https://github.com/DataDog/browser-sdk/pull/1242))

## v4.0.0

See our [upgrade guide](https://docs.datadoghq.com/real_user_monitoring/guide/browser-sdk-upgrade/#from-v3-to-v4) for a comprehensive list of breaking changes introduced by this major version.

### Changes

- 💥 improve privacy computation on a single node ([#1226](https://github.com/DataDog/browser-sdk/pull/1226))
- 💥 [RUMF-1098] move init options into their related interfaces ([#1232](https://github.com/DataDog/browser-sdk/pull/1232))
- 💥 [RUMF-1093] deprecated proxyhost option ([#1227](https://github.com/DataDog/browser-sdk/pull/1227))
- 💥 [RUMF-1124] Use the programmatic action attribute instead of innertext ([#1200](https://github.com/DataDog/browser-sdk/pull/1200))
- 💥 [RUMF-1094] remove deprecated privacy attributes ([#1224](https://github.com/DataDog/browser-sdk/pull/1224))
- 💥 [RUMF-1092] use a WeakMap to store XHR context ([#1222](https://github.com/DataDog/browser-sdk/pull/1222))
- 💥 [RUMF-1090] update minimal version to 3.8.2 ([#1219](https://github.com/DataDog/browser-sdk/pull/1219))
- 💥 [RUMF-827] sanitize tags ([#1218](https://github.com/DataDog/browser-sdk/pull/1218))
- 💥 [RUMF-1089] Cleanup legacy intake URLs ([#1214](https://github.com/DataDog/browser-sdk/pull/1214))

## v3.11.0

- ✨ [ci-visibility] Link CI Visibility and RUM ([#1192](https://github.com/DataDog/browser-sdk/pull/1192))

## v3.10.1

- ♻️ [RUMF-1097] revamp configuration - rum ([#1221](https://github.com/DataDog/browser-sdk/pull/1221))
- 🐛 [RUMF-1122] fix view updates while session is expired ([#1228](https://github.com/DataDog/browser-sdk/pull/1228))
- 🐛 Fix proxy url intake detection ([#1223](https://github.com/DataDog/browser-sdk/pull/1223))
- ♻️ [RUMF-1097] revamp configuration - logs ([#1217](https://github.com/DataDog/browser-sdk/pull/1217))

## v3.10.0

- ♻ [RUMF-1097] revamp internal configuration - core ([#1216](https://github.com/DataDog/browser-sdk/pull/1216))
- ♻️ [RUMF-1083] rework session management API ([#1197](https://github.com/DataDog/browser-sdk/pull/1197))
- ♻️ [RUMF-1083] introduce session context history ([#1187](https://github.com/DataDog/browser-sdk/pull/1187))
- ♻️ [RUMF-1083] rework session cookie cache ([#1180](https://github.com/DataDog/browser-sdk/pull/1180))

## v3.9.0

- 🐛 remove readonly from all LogsEvent properties ([#1198](https://github.com/DataDog/browser-sdk/pull/1198))
- ⚗✨ [RUMF-1085] implement the `synthetics.injected` field ([#1194](https://github.com/DataDog/browser-sdk/pull/1194))
- ⚗✨ [RUMF-1047] implement a RUM synthetics entry point ([#1188](https://github.com/DataDog/browser-sdk/pull/1188))
- ✨ [RUMF-1082] enable record-at-dom-loaded ([#1182](https://github.com/DataDog/browser-sdk/pull/1182))
- 📝 improve site parameter doc ([#1189](https://github.com/DataDog/browser-sdk/pull/1189))
- ⚗✨ [RUMF-1071] forward internal monitoring to bridge ([#1177](https://github.com/DataDog/browser-sdk/pull/1177))
- ⚗✨ [RUMF-1070] forward logs event to bridge ([#1155](https://github.com/DataDog/browser-sdk/pull/1155))
- ⚗ [RUMF-1068] Forward browser_sdk_version to mobile ([#1162](https://github.com/DataDog/browser-sdk/pull/1162))
- 📝 add details about sampling configuration ([#1186](https://github.com/DataDog/browser-sdk/pull/1186))
- ⚗✨ [RUMF-1084] ignore init if a RUM instance is or will be injected by synthetics ([#1170](https://github.com/DataDog/browser-sdk/pull/1170))

## v3.8.0

- ⚗ [RUMF-1082] start recording when the DOM is ready ([#1164](https://github.com/DataDog/browser-sdk/pull/1164))
- 🐛 [RUMF-1077] use cookies to get Synthetics context ([#1161](https://github.com/DataDog/browser-sdk/pull/1161))
- ✨ [RUMF-1074] bridge host checking ([#1157](https://github.com/DataDog/browser-sdk/pull/1157))
- ⚗[REPLAY-341] Add VisualViewport tracking (Pinch Zoom) ([#1118](https://github.com/DataDog/browser-sdk/pull/1118))

## v3.7.0

- ✨ [RUMF-1067] forward rum event to bridge ([#1148](https://github.com/DataDog/browser-sdk/pull/1148))
- 🐛 [RUMF-1062] fix support for Safari 11.0 ([#1154](https://github.com/DataDog/browser-sdk/pull/1154))
- 📄 [RUMF-1075] add missing initialization parameters ([#1152](https://github.com/DataDog/browser-sdk/pull/1152))
- 🐛 [Internal monitoring] use monitoring api key for monitoring requests ([#1147](https://github.com/DataDog/browser-sdk/pull/1147))

## v3.6.13

- 🐛 [RUMF-1060] fix failing worker detection in Firefox ([#1139](https://github.com/DataDog/browser-sdk/pull/1139))

## v3.6.12

- 🐛 Do not trace requests when the session is not tracked ([#1131](https://github.com/DataDog/browser-sdk/pull/1131))
- 🔊 [RUMF-1041] add lcp info on view events ([#1129](https://github.com/DataDog/browser-sdk/pull/1129))
- 🔇 [RUMF-1021] remove monitoring on cookie ([#1132](https://github.com/DataDog/browser-sdk/pull/1132))
- 🐛 Discard views and actions with negative loading time ([#1122](https://github.com/DataDog/browser-sdk/pull/1122))

## v3.6.11

- ♻️ [RUMF-1046] instrument method implementation ([#1117](https://github.com/DataDog/browser-sdk/pull/1117))
- 🔊 [RUMF-1021] improve cookie monitoring ([#1120](https://github.com/DataDog/browser-sdk/pull/1120))

## v3.6.10

- Revert "⚗[REPLAY-341] Add VisualViewport tracking (Pinch Zoom) ([#1089](https://github.com/DataDog/browser-sdk/pull/1089))" ([#1115](https://github.com/DataDog/browser-sdk/pull/1115))

## v3.6.9

- [RUMF-1045] rely on browser detection to check for innerText support ([#1110](https://github.com/DataDog/browser-sdk/pull/1110))
- ⚗[REPLAY-341] Add VisualViewport tracking (Pinch Zoom) ([#1089](https://github.com/DataDog/browser-sdk/pull/1089))

## v3.6.8

- 🐛 [RUMF-1040] Remove long task for lite plan ([#1103](https://github.com/DataDog/browser-sdk/pull/1103))
- ⚗ [REPLAY-465] Base tag support (feature flagged): Remove URL transformation from relative to absolute ([#1106](https://github.com/DataDog/browser-sdk/pull/1106))

## v3.6.7

- 🔊 [RUMF-1036] Add negative loading time internal monitoring ([#1095](https://github.com/DataDog/browser-sdk/pull/1095))

## v3.6.6

- 🐛 [RUMF-1021] fix regression on renew session ([#1096](https://github.com/DataDog/browser-sdk/pull/1096))

## v3.6.5

- 🐛 [RUMF-1033] request parameters into proxy url ([#1087](https://github.com/DataDog/browser-sdk/pull/1087))
- [RUMF-1034] allow passing `undefined` options to RUM and Logs init ([#1082](https://github.com/DataDog/browser-sdk/pull/1082))
- 🔊 [RUMF-1021] add extra monitoring on session type change ([#1091](https://github.com/DataDog/browser-sdk/pull/1091))

## v3.6.4

- ✨ [RUMF-1000] add a custom time parameter to `addTiming` ([#1079](https://github.com/DataDog/browser-sdk/pull/1079))
- 🐛 [RUMF-1021] clear cookie cache before expanding cookie ([#1080](https://github.com/DataDog/browser-sdk/pull/1080))

## v3.6.3

- [REPLAY-328][rumf-1035] gracefully handle recorder Worker initialisation crash ([#1068](https://github.com/DataDog/browser-sdk/pull/1068))
- 🔊 Add monitoring on session type change ([#1075](https://github.com/DataDog/browser-sdk/pull/1075))

## v3.6.2

- 🔊 Add extra monitoring info on lite session with replay ([#1072](https://github.com/DataDog/browser-sdk/pull/1072))

## v3.6.1

- ⚡ [RUMF-1022] remove `__sn` property in nodes ([#1069](https://github.com/DataDog/browser-sdk/pull/1069))
- ♻️ [RUMF-1015] use the url corresponding to the start of the event ([#1063](https://github.com/DataDog/browser-sdk/pull/1063))

## v3.6.0

- ✨ [RUMF-1028] enable privacy by default ([#1049](https://github.com/DataDog/browser-sdk/pull/1049))
- ✨ [RUMF-1020] enable intake v2 ([#1048](https://github.com/DataDog/browser-sdk/pull/1048))

## v3.5.0

- ✨ Add rate limit on actions ([#1058](https://github.com/DataDog/browser-sdk/pull/1058))
- ✨ Remove focus feature flag ([#1053](https://github.com/DataDog/browser-sdk/pull/1053))
- ✨ [RUMF-1029] remove the limit on view.loading_time ([#1054](https://github.com/DataDog/browser-sdk/pull/1054))
- ✨ Discard long FCP and LCP ([#1045](https://github.com/DataDog/browser-sdk/pull/1045))
- 📝 Add proxyUrl option documentation ([#1050](https://github.com/DataDog/browser-sdk/pull/1050))
- ⚡️Introducing new max for foreground periods ([#1032](https://github.com/DataDog/browser-sdk/pull/1032))

## v3.4.1

- 🔊 [RUMF-976] add info to monitor failing xhr fallback ([#1035](https://github.com/DataDog/browser-sdk/pull/1035))
- 🐛 MutationObserver bug fix for privacy level ([#1038](https://github.com/DataDog/browser-sdk/pull/1038))

## v3.4.0

- ForegroundContext: Remove monitoring & ignore untrusted events ([#1029](https://github.com/DataDog/browser-sdk/pull/1029))
- ✨ [RUMF-992] New CLS implementation ([#1026](https://github.com/DataDog/browser-sdk/pull/1026))

## v3.3.1

- 🐛 [RUMF-1005] Fix dd-request-id endpoint query param ([#1018](https://github.com/DataDog/browser-sdk/pull/1018))

## v3.3.0

- ✨ [RUMF-993] New proxy strategy ([#1016](https://github.com/DataDog/browser-sdk/pull/1016))
- 🐛 [RUMF-1012] fix console.error loop on npm setup ([#1027](https://github.com/DataDog/browser-sdk/pull/1027))
- 🐛 [REPLAY-371] Truncate long "data:" URIs ([#1021](https://github.com/DataDog/browser-sdk/pull/1021))

## v3.2.0

- ✨ [RUMF-994] support intake v2 ([#1013](https://github.com/DataDog/browser-sdk/pull/1013))
- ✨ [RUMF-998] introduce the initialPrivacyLevel configuration option ([#1004](https://github.com/DataDog/browser-sdk/pull/1004))
- 🐛 [RUMF-997] dont take a FullSnapshot on view creation during session renew ([#1011](https://github.com/DataDog/browser-sdk/pull/1011))
- 🐛 prevent recording to start when session renewed before onload ([#1009](https://github.com/DataDog/browser-sdk/pull/1009))
- ✨ [RUMF-996] set synthetics ids on RUM events ([#1007](https://github.com/DataDog/browser-sdk/pull/1007))

## v3.1.3

- ⚗✨[REPLAY-336] Privacy by Default ([#951](https://github.com/DataDog/browser-sdk/pull/951))
- ⚗✨ [REPLAY-379] add replay stats on view (getter edition) ([#994](https://github.com/DataDog/browser-sdk/pull/994))
- 📝 Update Readme for v3 cdn links ([#999](https://github.com/DataDog/browser-sdk/pull/999))
- 🐛[RUMF-990] restore global check to detect synthetics sessions ([#997](https://github.com/DataDog/browser-sdk/pull/997))

## v3.1.2

- ✨[RUMF-970] enable buffered PerformanceObserver ([#995](https://github.com/DataDog/browser-sdk/pull/995))
- Limit log monitoring + add more details ([#990](https://github.com/DataDog/browser-sdk/pull/990))
- 🗑️ Remove deprecated trace endpoint ([#992](https://github.com/DataDog/browser-sdk/pull/992))

## v3.1.1

- ⚗ [RUMF-970] Buffered PerformanceObserver: add fallback for older browsers ([#978](https://github.com/DataDog/browser-sdk/pull/978))
- ⚗ [RUMF-971] experiment to detect when the computer goes to sleep ([#976](https://github.com/DataDog/browser-sdk/pull/976))
- 🔊 [RUMF-971] add some context on suspicious LCP and FCP monitoring ([#979](https://github.com/DataDog/browser-sdk/pull/979))

## v3.1.0

Note: this is the first 3.x release for the Logs SDK. See migration notes in [v3.0.0](#v300).

- 📝🗑 deprecate the XHR context, to be removed in V4 ([#973](https://github.com/DataDog/browser-sdk/pull/973))
- ⚗ [RUMF-970] experiment with buffered PerformanceObserver ([#972](https://github.com/DataDog/browser-sdk/pull/972))
- 📝 [RUMF-984] update CHANGELOG for logs breaking changes ([#971](https://github.com/DataDog/browser-sdk/pull/971))
- ✨ [RUMF-974] use user-agent to detect synthetics sessions ([#969](https://github.com/DataDog/browser-sdk/pull/969))
- 💥 [RUMF-982] remove deprecated LogsUserConfiguration type ([#968](https://github.com/DataDog/browser-sdk/pull/968))
- 💥 [RUMF-981] remove deprecated logs options ([#967](https://github.com/DataDog/browser-sdk/pull/967))
- 📝 document `trackViewsManually` option ([#965](https://github.com/DataDog/browser-sdk/pull/965))

## v3.0.2

- [RUMF-972] Revert "💥 always use alternative domains for RUM ([#944](https://github.com/DataDog/browser-sdk/pull/944))" ([#963](https://github.com/DataDog/browser-sdk/pull/963))
- 📝 update CDN URLs for V3 ([#962](https://github.com/DataDog/browser-sdk/pull/962))

## v3.0.1

- 🐛 fix recording session renewal ([#955](https://github.com/DataDog/browser-sdk/pull/955))

## v3.0.0

See our [upgrade guide](https://docs.datadoghq.com/real_user_monitoring/guide/browser-sdk-upgrade/#from-v2-to-v3) for a comprehensive list of breaking changes introduced by this major version.

### Changes

- 💥 always use alternative domains for RUM ([#944](https://github.com/DataDog/browser-sdk/pull/944))
- 💥 remove deprecated rum init options ([#940](https://github.com/DataDog/browser-sdk/pull/940))
- 💥 remove deprecated types ([#942](https://github.com/DataDog/browser-sdk/pull/942))
- 💥 [RUMF-951] merge rum-recorder into rum ([#941](https://github.com/DataDog/browser-sdk/pull/941))
- 👷 [RUMF-937] create the rum-slim package ([#935](https://github.com/DataDog/browser-sdk/pull/935))
- 💥 remove deprecated RUM.addUserAction ([#939](https://github.com/DataDog/browser-sdk/pull/939))
- ✨ [RUMF-940] implement the replay sample rate option and remove resource sample rate option ([#931](https://github.com/DataDog/browser-sdk/pull/931))
- 💥 Remove addError 'source' argument ([#936](https://github.com/DataDog/browser-sdk/pull/936))

## v2.18.0

- 👷 Versioned CDN files ([#932](https://github.com/DataDog/browser-sdk/pull/932))
- 👷 Increase browser cache to 4 hours ([#933](https://github.com/DataDog/browser-sdk/pull/933))
- 🐛 ensure that test cookie is correctly deleted after the test ([#927](https://github.com/DataDog/browser-sdk/pull/927))
- 📝 add `actionNameAttribute` initialization parameter ([#923](https://github.com/DataDog/browser-sdk/pull/923))

## v2.17.0

- ✨ [RUMF-928] enable manual view tracking ([#924](https://github.com/DataDog/browser-sdk/pull/924))
- ✨ [PROF-3535] expose init configuration via `getInitConfiguration()` API ([#897](https://github.com/DataDog/browser-sdk/pull/897))

## v2.16.0

- ✨ [RUMF-932] allow context edition in logs beforeSend ([#909](https://github.com/DataDog/browser-sdk/pull/909))
- ✨ [RUMF-945] allow users to customize the attribute used to define the action name ([#919](https://github.com/DataDog/browser-sdk/pull/919))

## v2.15.1

- 🐛 fix new view segment starting with an IncrementalSnapshot ([#908](https://github.com/DataDog/browser-sdk/pull/908))
- 🐛 [REPLAY-325] add verbose error details on XHR transport failure ([#902](https://github.com/DataDog/browser-sdk/pull/902))

## v2.15.0

- ✨ [RUMF-920] keep trace id on aborted requests ([#898](https://github.com/DataDog/browser-sdk/pull/898))
- ✨ [RUMF-922] stack trace on handled calls ([#889](https://github.com/DataDog/browser-sdk/pull/889))

## v2.14.0

- 🐛 [RUMF-931] check if PerformanceEntry is defined before using it ([#891](https://github.com/DataDog/browser-sdk/pull/891))
- ✨ [RUMF-921] differentiate handled and unhandled errors ([#886](https://github.com/DataDog/browser-sdk/pull/886))
- 🐛 [RUMF-876] Improve proxy behavior for xhr reuse ([#865](https://github.com/DataDog/browser-sdk/pull/865))
- ⚗ manual view mode: create new view on renew session ([#887](https://github.com/DataDog/browser-sdk/pull/887))

## v2.13.0

- ✨ [RUMF-909] add beforeSend context ([#883](https://github.com/DataDog/browser-sdk/pull/883))
- ✨ [RUMF-909] allow event context edition in beforeSend ([#869](https://github.com/DataDog/browser-sdk/pull/869))
- 🔊[RUMF-927] monitor timings with high values ([#884](https://github.com/DataDog/browser-sdk/pull/884))
- ⚗ [RUMF-878] add trackViewsManually option (disabled) ([#867](https://github.com/DataDog/browser-sdk/pull/867))

## v2.12.1

- 🔊 monitor potential invalid date ([#880](https://github.com/DataDog/browser-sdk/pull/880))

## v2.12.0

- ⚡️ start mutation observer only when needed ([#858](https://github.com/DataDog/browser-sdk/pull/858))
- 📦 bump ws from 7.4.2 to 7.4.6 ([#875](https://github.com/DataDog/browser-sdk/pull/875))
- ✨ track foreground ([#854](https://github.com/DataDog/browser-sdk/pull/854))
- ✨ add id on rum events ([#873](https://github.com/DataDog/browser-sdk/pull/873))

## v2.11.1

- 🐛 do not break the recorder when an URL fails to parse ([#871](https://github.com/DataDog/browser-sdk/pull/871))

## v2.11.0

- 🐛 [REPLAY-312] use unpatched MutationObserver object ([#866](https://github.com/DataDog/browser-sdk/pull/866))
- 🐛 ignore full snapshots taken before "load" event ([#861](https://github.com/DataDog/browser-sdk/pull/861))
- ⚗✨ [RUMF-878] add startView API ([#850](https://github.com/DataDog/browser-sdk/pull/850))
- 🏷️ update events format ([#864](https://github.com/DataDog/browser-sdk/pull/864))
- ✨ [RUMF-913] allow masking input values ([#860](https://github.com/DataDog/browser-sdk/pull/860))

## v2.10.0

- ✨[RUMF-889] enable system clock usages ([#845](https://github.com/DataDog/browser-sdk/pull/845))

## v2.9.1

- 🐛 [logs] Fix IE11 console.log issue ([#852](https://github.com/DataDog/browser-sdk/pull/852))

## v2.9.0

- ✨[RUMF-907] Use unaltered console functions when displaying console messages ([#847](https://github.com/DataDog/browser-sdk/pull/847))
- ✨[RUMF-910] handle logs console and http simultaneously ([#844](https://github.com/DataDog/browser-sdk/pull/844))
- ⚡️ [RUMF-902] enable new mutation observer ([#842](https://github.com/DataDog/browser-sdk/pull/842))
- ✨[RUMF-908] attach current drift value to events ([#843](https://github.com/DataDog/browser-sdk/pull/843))
- ✨ Clear previously set user context ([#840](https://github.com/DataDog/browser-sdk/pull/840))
- 📝 add a warning in the RUM-recorder readme ([#838](https://github.com/DataDog/browser-sdk/pull/838))
- 📝 Restructure tables in docs page for improved readability ([#835](https://github.com/DataDog/browser-sdk/pull/835))
- 📦 [RUMF-905] update vulnerable dependencies ([#836](https://github.com/DataDog/browser-sdk/pull/836))
- ⚡️ [RUMF-896] process mutations asynchronously ([#832](https://github.com/DataDog/browser-sdk/pull/832))

## v2.8.1

- 🐛 [RUMF-870] Max errors threshold should not take into account errors excluded by beforeSend ([#828](https://github.com/DataDog/browser-sdk/pull/828))
- ✨ [RUMF-901] allow to run the 'performances' script with rum-recorder ([#818](https://github.com/DataDog/browser-sdk/pull/818))

## v2.8.0

- ⚗🐛 allow 1 ms error for matching request ([#824](https://github.com/DataDog/browser-sdk/pull/824))
- ⚗🐛 [RUMF-889] apply correction only for positive drift ([#821](https://github.com/DataDog/browser-sdk/pull/821))
- ⚗⚡️ [RUMF-902] implement a new mutation observer ([#810](https://github.com/DataDog/browser-sdk/pull/810))
- 🐛 [RUMF-900] clear parent view context when view end ([#816](https://github.com/DataDog/browser-sdk/pull/816))
- 🐛 [RUMF-900] prevent events to be sent from expired session ([#814](https://github.com/DataDog/browser-sdk/pull/814))
- ⚗🐛 [RUMF-889] fix relative time rounding ([#817](https://github.com/DataDog/browser-sdk/pull/817))
- ⚗ [RUMF-889] use preferred clock ([#809](https://github.com/DataDog/browser-sdk/pull/809))

## v2.7.4

- [RUMF-868] ignore paramaters stored in the hash ([#792](https://github.com/DataDog/browser-sdk/pull/792))
- 🐛 fallback to xhr when sendBeacon throws ([#796](https://github.com/DataDog/browser-sdk/pull/796))

## v2.7.3

- 🐛 [RUMF-886] don't start recording when 'postpone_start_recording' is enabled ([#790](https://github.com/DataDog/browser-sdk/pull/790))
- 🐛 [RUMF-882] Segments can be flushed because of the max_size limit even if the max_size isn't reached ([#787](https://github.com/DataDog/browser-sdk/pull/787))

## v2.7.2

- ✨ [RUMF-867] enable start/stop recording API ([#784](https://github.com/DataDog/browser-sdk/pull/784))
- 🐛 fix developer extension popup ([#778](https://github.com/DataDog/browser-sdk/pull/778))

## v2.7.1

- ✨ [RUMF-863] Enable console error with stack traces ([#781](https://github.com/DataDog/browser-sdk/pull/781))
- ⚗ [RUMF-869] Ensure the "Focus" records are emited in the same segment as the "FullSnapshot" ([#779](https://github.com/DataDog/browser-sdk/pull/779))

## v2.7.0

- ⚗ [RUMF-853] introduce a feature flag for aborted network errors ([#777](https://github.com/DataDog/browser-sdk/pull/777))
- ⚗ [RUMF-853] don't emit error for requests aborted by the application ([#768](https://github.com/DataDog/browser-sdk/pull/768))
- ⚗ [RUMF-867] implement stop recording ([#771](https://github.com/DataDog/browser-sdk/pull/771))
- ⚗ [RUMF-857] round CLS to 4 decimals ([#773](https://github.com/DataDog/browser-sdk/pull/773))
- 🐛 Revert negative FID monitoring and adjust to 0 ([#775](https://github.com/DataDog/browser-sdk/pull/775))
- ⚗ [RUMF-866] adjust postpone start recording ([#769](https://github.com/DataDog/browser-sdk/pull/769))

## v2.6.2

- 🐛 [RUMF-862] fix export MediaInteractions enum ([#761](https://github.com/DataDog/browser-sdk/pull/761))
- ⚗ [RUMF-863] rework console error calls containing error instances ([#762](https://github.com/DataDog/browser-sdk/pull/762))

## v2.6.1

- 🐛 [RUMF-855] discard negative first-input delays ([#758](https://github.com/DataDog/browser-sdk/pull/758))
- ⚗ performance impact summary tool ([#755](https://github.com/DataDog/browser-sdk/pull/755))

## v2.6.0

- ⚗ [RUMF-858] add monotonic batch time ([#748](https://github.com/DataDog/browser-sdk/pull/748))
- ✨ [RUM] Catch errors thrown by user callbacks ([#745](https://github.com/DataDog/browser-sdk/pull/745))
- 📝 Doc: remove resourceSampleRate ([#747](https://github.com/DataDog/browser-sdk/pull/747))

## v2.5.5

- 🐛 [REPLAY-187] flush pending records before taking a fullsnapshot ([#742](https://github.com/DataDog/browser-sdk/pull/742))
- ✨ [RUMF-854] Enable beforeSend to dismiss events ([#743](https://github.com/DataDog/browser-sdk/pull/743))
- ✅ [RUMF-815] import RRWeb integration tests ([#738](https://github.com/DataDog/browser-sdk/pull/738))
- ✨ [RUMF-847] Add onNewLocation to configuration ([#724](https://github.com/DataDog/browser-sdk/pull/724))

## v2.5.4

- 🔊 Add clock drift monitoring ([#736](https://github.com/DataDog/browser-sdk/pull/736))
- ✨ Implement a developer extension ([#686](https://github.com/DataDog/browser-sdk/pull/686))

## v2.5.3

- ⚗ Remove mutation buffer global instance ([#728](https://github.com/DataDog/browser-sdk/pull/728))
- ⚗ replay: set data-dd-privacy attribute on snapshot node if hidden ([#726](https://github.com/DataDog/browser-sdk/pull/726))
- ⚗ replay: add dd-privacy attribute for obfuscation & ignoring input ([#715](https://github.com/DataDog/browser-sdk/pull/715))

## v2.5.2

- ⚗ [RUMF-843] monitor rrweb codebase ([#721](https://github.com/DataDog/browser-sdk/pull/721))
- ⚡️ Remove unused parameters ([#723](https://github.com/DataDog/browser-sdk/pull/723))
- ⚗ [RUMF-823] monitor deflate worker ([#722](https://github.com/DataDog/browser-sdk/pull/722))
- 🐛 recorder: remove forEach polyfills ([#719](https://github.com/DataDog/browser-sdk/pull/719))

## v2.5.1

- ⚗ [RUMF-821] remove unused record types ([#717](https://github.com/DataDog/browser-sdk/pull/717))
- ⚗🐛 [RUMF-834] fix loop direction ([#714](https://github.com/DataDog/browser-sdk/pull/714))
- ⚗⚡️ [RUMF-841] remove session renew support in rum recorder ([#713](https://github.com/DataDog/browser-sdk/pull/713))
- ⚗✨ [REPLAY-149] implement ViewEnd record ([#711](https://github.com/DataDog/browser-sdk/pull/711))

## v2.5.0

- ✨ Allow logs collection on file:// URL ([#709](https://github.com/DataDog/browser-sdk/pull/709))
- 🐛[RUMF-836] sanitize unsupported characters in timing name ([#706](https://github.com/DataDog/browser-sdk/pull/706))
- rum-recorder: import rrweb-snapshot code ([#700](https://github.com/DataDog/browser-sdk/pull/700))
- [REPLAY-164] track Focus records ([#707](https://github.com/DataDog/browser-sdk/pull/707))

## v2.4.0

- ✨[RUMF-820] expose API to add custom timings to the current view ([#702](https://github.com/DataDog/browser-sdk/pull/702))
- 👷[RUMF-324] Replace TSLint with ESLint ([#681](https://github.com/DataDog/browser-sdk/pull/681))
- ♻️ Remove automatic snake case ([#699](https://github.com/DataDog/browser-sdk/pull/699))

## v2.3.1

- ✨ [RUMF-826] Allow classic intake only for us and eu ([#694](https://github.com/DataDog/browser-sdk/pull/694))
- [recorder] set 'hasReplay' to undefined by defaultb ([#697](https://github.com/DataDog/browser-sdk/pull/697))
- [RUMF-819] postpone start recording ([#688](https://github.com/DataDog/browser-sdk/pull/688))

## v2.3.0

- ✨[RUMF-802] add support for capacitor app stack traces ([#685](https://github.com/DataDog/browser-sdk/pull/685))
- 🐛[RUMF-824] support Request instances in tracing ([#684](https://github.com/DataDog/browser-sdk/pull/684))
- 🐛[RUMF-809] URL encode tags in intake requests ([#689](https://github.com/DataDog/browser-sdk/pull/689))
- ⚗[RUMF-804] implement a minimal version of the recorder ([#670](https://github.com/DataDog/browser-sdk/pull/670))

## v2.2.1

- ⚗ Implement addTiming ([#668](https://github.com/DataDog/browser-sdk/pull/668))

## v2.2.0

- 🐛 [RUMF-810] force alternate intake for us3 ([#677](https://github.com/DataDog/browser-sdk/pull/677))
- ✨ [RUMF-783] collect view.first_input_time ([#676](https://github.com/DataDog/browser-sdk/pull/676))
- ⚗ Create a rum-core package ([#673](https://github.com/DataDog/browser-sdk/pull/673))
- ⚗ [RUMF-803] import RRWeb ([#658](https://github.com/DataDog/browser-sdk/pull/658))
- ⚗ [RUMF-801] create a new package for rum-recorder ([#657](https://github.com/DataDog/browser-sdk/pull/657))

## v2.1.2

- [RUMF-807] Broaden context types in APIs ([#663](https://github.com/DataDog/browser-sdk/pull/663))
- [RUMF-807] Export types used in API ([#662](https://github.com/DataDog/browser-sdk/pull/662))

## v2.1.1

- 🐛 [CDN cache] remove stale-while-revalidate ([#665](https://github.com/DataDog/browser-sdk/pull/665))
- ✨ [RUMF-794] Add isActive attribute to view events ([#648](https://github.com/DataDog/browser-sdk/pull/648))

## v2.1.0

- ✨ [RUMF-787] implement the User API ([#638](https://github.com/DataDog/browser-sdk/pull/638))
- ✨ [RUMF-772] add beforeSend API ([#644](https://github.com/DataDog/browser-sdk/pull/644))

## v2.0.3

- 🐛 handle direct onerror calls with objects ([#659](https://github.com/DataDog/browser-sdk/pull/659))

## v2.0.2

- 🐛 sanitize error properties even when there is a valid stack ([#655](https://github.com/DataDog/browser-sdk/pull/655))

## v2.0.1

- 🐛 fix tracekit handling of exotic errors ([#651](https://github.com/DataDog/browser-sdk/pull/651))

## v2.0.0

- 💥 [RUMF-730] prefer object and type alias over enum in APIs ([#630](https://github.com/DataDog/browser-sdk/pull/630))
- 💥 [RUMF-730] use v2 events format ([#627](https://github.com/DataDog/browser-sdk/pull/627))

## v1.26.3

- 🐛⚡️ [RUMF-793] tweak the cache-control header ([#642](https://github.com/DataDog/browser-sdk/pull/642))

## v1.26.2

- ✨ [RUMF-764] Use new intake domain for US ([#616](https://github.com/DataDog/browser-sdk/pull/616))
- ✨ [RUMF-770] Disable tracing for cancelled requests ([#635](https://github.com/DataDog/browser-sdk/pull/635))

## v1.26.1

- 🐛 [RUMF-791] prevent IE11 performance entry error ([#633](https://github.com/DataDog/browser-sdk/pull/633))

## v1.26.0

- ✨ [RUMF-777] implement Cumulative Layout Shift ([#628](https://github.com/DataDog/browser-sdk/pull/628))
- ✨ [RUMF-776] implement First Input Delay ([#626](https://github.com/DataDog/browser-sdk/pull/626))
- ✨ [RUMF-775] implement Largest Contentful Paint ([#624](https://github.com/DataDog/browser-sdk/pull/624))
- ✨ [RUMF-758] keep internal context in v1 format ([#625](https://github.com/DataDog/browser-sdk/pull/625))
- ✨ [RUMF-780] implement track first hidden ([#621](https://github.com/DataDog/browser-sdk/pull/621))

## v1.25.4

- ✨ [RUMF-771] Add getLoggerGlobalContext and getRumGlobalContext ([#614](https://github.com/DataDog/browser-sdk/pull/614))
- ✨ [RUMF-762] include the context when using console handler ([#613](https://github.com/DataDog/browser-sdk/pull/613))
- Revert "⚗️[RUMF-766] add match request timing debug infos (experimental) ([#609](https://github.com/DataDog/browser-sdk/pull/609))" ([#612](https://github.com/DataDog/browser-sdk/pull/612))

## v1.25.3

- ⚗️[RUMF-766] add match request timing debug infos (experimental) ([#609](https://github.com/DataDog/browser-sdk/pull/609))

## v1.25.2

- [RUMF-766] prevent request duration override by wrong matching timing ([#604](https://github.com/DataDog/browser-sdk/pull/604))
- ♻️ [RUMF-748] cleanup add user add action events ([#602](https://github.com/DataDog/browser-sdk/pull/602))
- 🐛 Fix unit test format validation ([#598](https://github.com/DataDog/browser-sdk/pull/598))
- [RUMF-748] use RAW_RUM_EVENT_COLLECTED to compute event counts ([#596](https://github.com/DataDog/browser-sdk/pull/596))
- [RUMF-729] validate rum events in e2e ([#597](https://github.com/DataDog/browser-sdk/pull/597))

## v1.25.1

- [RUMF-756] cyclic reference support in Context ([#595](https://github.com/DataDog/browser-sdk/pull/595))
- ✨[RUMF-518] migrate internal context to v2 format (experimental) ([#593](https://github.com/DataDog/browser-sdk/pull/593))
- ✨[RUMF-740] migrate error to v2 format (experimental) ([#592](https://github.com/DataDog/browser-sdk/pull/592))
- [logs] add choose the right installation method ([#594](https://github.com/DataDog/browser-sdk/pull/594))

## v1.25.0

- ✨ [RUMF-724] implement API to capture an error ([#585](https://github.com/DataDog/browser-sdk/pull/585))
- ✨ [RUMF-739] migrate action to v2 format (experimental) ([#588](https://github.com/DataDog/browser-sdk/pull/588))
- ✨ [RUMF-738] migrate view to v2 format (experimental) ([#586](https://github.com/DataDog/browser-sdk/pull/586))
- ✨ [RUMF-737] migrate resource to v2 format (experimental) ([#584](https://github.com/DataDog/browser-sdk/pull/584))
- 🐛 [RUMF-745] fix V2 context ([#579](https://github.com/DataDog/browser-sdk/pull/579))
- 📝 Added async installation method ([#571](https://github.com/DataDog/browser-sdk/pull/571))
- 📝 DOCS-1257 Browser Log Collection ([#575](https://github.com/DataDog/browser-sdk/pull/575))

## v1.24.1

- 🐛 [RUMF-742] fix cookie creation domain when trackSessionAcrossSubdomains: true ([#573](https://github.com/DataDog/browser-sdk/pull/573))
- ✨ [RUMF-727] introduce v2 format (experimental) ([#570](https://github.com/DataDog/browser-sdk/pull/570))

## v1.24.0

- 🐛 Use the same options to test and set cookies ([#555](https://github.com/DataDog/browser-sdk/pull/555))
- ✨ [RUMF-534] implement logs.onReady and rum.onReady ([#564](https://github.com/DataDog/browser-sdk/pull/564))

## v1.23.0

- 🐛 [Core] dereference `combine` sources recursively ([#560](https://github.com/DataDog/browser-sdk/pull/560))
- ✨ [RUMF-530][rum] allow using RUM API before init ([#551](https://github.com/DataDog/browser-sdk/pull/551))

## v1.22.1

- 🐛[RUMF-716] fix invalid action name ([#557](https://github.com/DataDog/browser-sdk/pull/557))
- 🐛 consider proxy host with custom path request as intake request ([#550](https://github.com/DataDog/browser-sdk/pull/550))

## v1.22.0

- ✨ [RUMF-530][logs] allow using logs API before init ([#545](https://github.com/DataDog/browser-sdk/pull/545))

## v1.21.1

- ✨ [RUMF-709][core] support 'null' as a context value ([#546](https://github.com/DataDog/browser-sdk/pull/546))

## v1.21.0

- 🐛 [RUMF-620]: Dual-ship "service" as tag and attribute ([#543](https://github.com/DataDog/browser-sdk/pull/543))

## v1.20.1

- 🐛 [RUMF-699] allow collecting requests with the same origin as the proxy ([#537](https://github.com/DataDog/browser-sdk/pull/537))
- 🐛 include sources in NPM backage ([#535](https://github.com/DataDog/browser-sdk/pull/535))

## v1.20.0

- 🐛 fix issue when using proxy ([#530](https://github.com/DataDog/browser-sdk/pull/530))
- 🐛 [RUMF-650] exclude intake request from performance/request collection ([#528](https://github.com/DataDog/browser-sdk/pull/528))
- ✨ [RUM] add new functionality to remove global context to SDK ([#527](https://github.com/DataDog/browser-sdk/pull/527))

## v1.19.0

- 🐛 [RUMF-670] wait for the DOM to be ready before getting the trace id ([#525](https://github.com/DataDog/browser-sdk/pull/525))
- ✨ [RUMF-648] add cookie configuration options ([#523](https://github.com/DataDog/browser-sdk/pull/523))
- 🐛 [RUMF-684] fix error collection when Logs and RUM configuration diverge ([#522](https://github.com/DataDog/browser-sdk/pull/522))

## v1.18.1

- ✨ [RUMF-634] add resource id for traced request ([#515](https://github.com/DataDog/browser-sdk/pull/515))
- 🐛 [RUMF-617] fix missing headers on traced requests ([#517](https://github.com/DataDog/browser-sdk/pull/517))

## v1.18.0

- ✨ [RUMF-617] integrate tracing from rum ([#511](https://github.com/DataDog/browser-sdk/pull/511))

## v1.17.0

- 🐛 [RUMF-645] do not track intake request errors ([#506](https://github.com/DataDog/browser-sdk/pull/506))
- ✨ [RUMF-621] set view referrer to the previous view URL ([#507](https://github.com/DataDog/browser-sdk/pull/507))

## v1.16.0

- ✨ [RUMF-636] initial document trace id ([#492](https://github.com/DataDog/browser-sdk/pull/492))
- 🐛 [RUM] do not return internal context if the session is untracked ([#498](https://github.com/DataDog/browser-sdk/pull/498))

## v1.15.3

- 🐛 [RUM] fix loading measures conversion to nanoseconds ([#490](https://github.com/DataDog/browser-sdk/pull/490))

## v1.15.2

- 🐛 [RUMF-622] attach loading measures to initial view ([#479](https://github.com/DataDog/browser-sdk/pull/479))

## v1.15.1

- 🐛 [RUMF-639] xhr proxy: do not instrument xhr already opened ([#484](https://github.com/DataDog/browser-sdk/pull/484))

## v1.15.0

- ✨ [RUMF-626] use site configuration and deprecate suffixed bundle ([#476](https://github.com/DataDog/browser-sdk/pull/476))
- ✨ Update context api to include removeContext method ([#478](https://github.com/DataDog/browser-sdk/pull/478))

## v1.14.1

- [RUMF-617] Extract XHR and Fetch proxies ([#468](https://github.com/DataDog/browser-sdk/pull/468))

## v1.14.0

- ✨ [RUMF-592] support for hash navigation ([#467](https://github.com/DataDog/browser-sdk/pull/467))

## v1.13.1

- 🐛 [RUMF-625] make sure view url doesn't change ([#469](https://github.com/DataDog/browser-sdk/pull/469))

## v1.13.0

- ✨ [RUMF-605] enable event association to parent context by start date ([#460](https://github.com/DataDog/browser-sdk/pull/460))

## v1.12.10

- ✨ [RUMF-605] associate event to parent context by start date (behind flag) ([#445](https://github.com/DataDog/browser-sdk/pull/445))

## v1.12.9

- 🐛 fix current action context reset on custom action ([#444](https://github.com/DataDog/browser-sdk/pull/444))
- ♻️ [RUMF-604] introduce parentContexts to return current contexts ([#440](https://github.com/DataDog/browser-sdk/pull/440))

## v1.12.8

- ✨[RUMF-603] Introduce and use new lifecycle events ([#438](https://github.com/DataDog/browser-sdk/pull/438))

## v1.12.7

- ✨[RUMF-609] export Datacenter enum from logs and rum ([#436](https://github.com/DataDog/browser-sdk/pull/436))
- 🐛 use Datacenter enum in setup doc ([#435](https://github.com/DataDog/browser-sdk/pull/435))

## v1.12.6

- ✨[RUMF-594] specify same site attribute on cookies ([#431](https://github.com/DataDog/browser-sdk/pull/431))
- ✨[resources] resolve .ico resources as kind:image ([#428](https://github.com/DataDog/browser-sdk/pull/428))

## v1.12.5

- 🐛[RUMF-559] prevent event without sessionId ([#425](https://github.com/DataDog/browser-sdk/pull/425))

## v1.12.4

- ✨[RUMF-513] enable keep alive mechanism ([#421](https://github.com/DataDog/browser-sdk/pull/421))

## v1.12.3

- 👷[build] improve core tree-shaking ([#417](https://github.com/DataDog/browser-sdk/pull/417))
- ⚡️[RUMF-510] Improve sizeInByte calculation performance ([#413](https://github.com/DataDog/browser-sdk/pull/413))
- ✨[RUMF-513] add a session keep alive mechanism ([#394](https://github.com/DataDog/browser-sdk/pull/394))

## v1.12.2

- ✨ [RUMF-549] add an option to enable the user interaction tracking ([#414](https://github.com/DataDog/browser-sdk/pull/414))
- ✨ [RUMF-385] implement a declarative API to set the action names ([#412](https://github.com/DataDog/browser-sdk/pull/412))
- ✨ [RUMF-385] improve click action naming ([#406](https://github.com/DataDog/browser-sdk/pull/406))

## v1.12.1

- 👷 [RUM] add application id as query parameter ([#405](https://github.com/DataDog/browser-sdk/pull/405))

## v1.12.0

- 👷 Removing lodash dependencies ([#396](https://github.com/DataDog/browser-sdk/pull/396))

## v1.11.6

- ✨[RUMF-473] collect view loading time in ns and integrate the load event timing in the loading time calculation ([#401](https://github.com/DataDog/browser-sdk/pull/401))
- ✨[RUMF-373] Add View load duration and load type ([#388](https://github.com/DataDog/browser-sdk/pull/388))

## v1.11.5

- ✨[RUMF-465] collect client service, env and version ([#392](https://github.com/DataDog/browser-sdk/pull/392))

## v1.11.4

- ♻️[RUMF-471] rename version ([#382](https://github.com/DataDog/browser-sdk/pull/382))

## v1.11.3

- [RUMF-447]: Only collect first-contentful-paint if page is visible ([#361](https://github.com/DataDog/browser-sdk/pull/361))

## v1.11.2

- 🐛[RUMF-451] compute session type for each event ([#375](https://github.com/DataDog/browser-sdk/pull/375))
- 🐛 [RUM] fix angular compatibility ([#376](https://github.com/DataDog/browser-sdk/pull/376))

## v1.11.1

- 🐛 [RUM] fix view update after its end ([#373](https://github.com/DataDog/browser-sdk/pull/373))

## v1.11.0

- Change view logic to emit LifeCycle events ([#366](https://github.com/DataDog/browser-sdk/pull/366))
- [RUMF-441] Track event counts for user actions ([#358](https://github.com/DataDog/browser-sdk/pull/358))

## v1.10.0

- ✨[RUMF-430] enable new session strategy ([#360](https://github.com/DataDog/browser-sdk/pull/360))
- 🐛[RUMF-383] fix custom user action type case ([#356](https://github.com/DataDog/browser-sdk/pull/356))

## v1.9.4

- ✨[RUMF-43] add proxyHost init option ([#354](https://github.com/DataDog/browser-sdk/pull/354))
- ✨ [RUMF-438] add user action reference to the internal context ([#352](https://github.com/DataDog/browser-sdk/pull/352))

## v1.9.3

- ✨[RUMF-435] add session type on all events ([#347](https://github.com/DataDog/browser-sdk/pull/347))
- 🐛[RUMF-431] fix CSP issue with global object strategy ([#345](https://github.com/DataDog/browser-sdk/pull/345))

## v1.9.2

- ✨[RUMF-430] new session strategy (disabled) ([#343](https://github.com/DataDog/browser-sdk/pull/343))
- ✨[RUMF-383] automatic click user action collection (disabled) ([#338](https://github.com/DataDog/browser-sdk/pull/338))

## v1.9.1

- 🔥[RUMF-430] stop maintaining old cookies ([#342](https://github.com/DataDog/browser-sdk/pull/342))

## v1.9.0

- ✨[RUMF-430] new session cookie format ([#337](https://github.com/DataDog/browser-sdk/pull/337))

## v1.8.3

- 🐛 [RUMF-430] fix rollback ([#334](https://github.com/DataDog/browser-sdk/pull/334))

## v1.8.2

- 🥅[RUMF-430] handle potential session rollback ([#329](https://github.com/DataDog/browser-sdk/pull/329))

## v1.8.1

- 🐛fix feature check ([#320](https://github.com/DataDog/browser-sdk/pull/320))

## v1.8.0

- 🔊[RUMF-408] add new session check logs ([#318](https://github.com/DataDog/browser-sdk/pull/318))
- [RUMF-407] improve resource timings collection ([#315](https://github.com/DataDog/browser-sdk/pull/315))
- 🔧 improve CBT test names ([#314](https://github.com/DataDog/browser-sdk/pull/314))
- [RUMF-382] prepare support for multiple feature flags ([#312](https://github.com/DataDog/browser-sdk/pull/312))
- 🔧 update cbt chrome mobile ([#313](https://github.com/DataDog/browser-sdk/pull/313))

## v1.7.5

- ✨add an option to silent multiple Init errors ([#310](https://github.com/DataDog/browser-sdk/pull/310))

## v1.7.4

- 🐛 replace console.error by console.warn when cookies are not supported ([#307](https://github.com/DataDog/browser-sdk/pull/307))
- 🔒 upgrade vulnerable packages ([#306](https://github.com/DataDog/browser-sdk/pull/306))

## v1.7.3

- 🐛[RUMF-403] fix checkURLSupported ([#302](https://github.com/DataDog/browser-sdk/pull/302))
- ✅ add cbt error case ([#299](https://github.com/DataDog/browser-sdk/pull/299))
- [RUM] enable request with batch time by default ([#297](https://github.com/DataDog/browser-sdk/pull/297))

## v1.7.2

- 🐛[RUMF-396] try to fix view date shift ([#295](https://github.com/DataDog/browser-sdk/pull/295))

## v1.7.1

- 🐛[RUMF-320] Remove url-polyfill dependency ([#294](https://github.com/DataDog/browser-sdk/pull/294))

## v1.7.0

- ✨[RUMF-375] do not collect irrelevant timings ([#292](https://github.com/DataDog/browser-sdk/pull/292))

## v1.6.3

- 🐛[RUMF-266] xhr tracker: add fallback on event listener ([#287](https://github.com/DataDog/browser-sdk/pull/287))

## v1.6.2

- ⚗️[RUMF-371] add batch time to rum intake requests ([#285](https://github.com/DataDog/browser-sdk/pull/285))
- 🐛[RUMF-266] fix xhr incorrect status reported on late abortion ([#283](https://github.com/DataDog/browser-sdk/pull/283))

## v1.6.1

- 🐛[RUMF-330] fix intake requests exclusion ([#281](https://github.com/DataDog/browser-sdk/pull/281))

## v1.6.0

- ✨[RUMF-315] collect initial document timing ([#276](https://github.com/DataDog/browser-sdk/pull/276))
- ⬆️ Bump codecov from 3.6.1 to 3.6.5 ([#277](https://github.com/DataDog/browser-sdk/pull/277))
- ✨[RUMF-342] use startTime for events timestamp ([#275](https://github.com/DataDog/browser-sdk/pull/275))

## v1.5.0

- ✨[RUMF-264] add compatibility with server side rendering ([#273](https://github.com/DataDog/browser-sdk/pull/273))

## v1.4.2

- 🔧 add repository link for each package ([#271](https://github.com/DataDog/browser-sdk/pull/271))

## v1.4.1

- 🐛 [RUM] fix retrieving early timings ([#268](https://github.com/DataDog/browser-sdk/pull/268))

## v1.4.0

- 🔇[RUMF-257] remove logging ([#265](https://github.com/DataDog/browser-sdk/pull/265))
- 🐛 [RUMF-71] do not report negative performance timing duration ([#264](https://github.com/DataDog/browser-sdk/pull/264))
- [MRO] update Node version ([#263](https://github.com/DataDog/browser-sdk/pull/263))
- ✨ [Browser SDK][rum-291] Allow logs when cookies are disabled ([#255](https://github.com/DataDog/browser-sdk/pull/255))

## v1.3.3

- 🔊[RUMF-257] rework logging ([#261](https://github.com/DataDog/browser-sdk/pull/261))
- 🐛[RUMF-308] do not track session without id ([#260](https://github.com/DataDog/browser-sdk/pull/260))
- 📄 add check-licenses script ([#258](https://github.com/DataDog/browser-sdk/pull/258))

## v1.3.2

- 🔊 [RUMF-71] add internal logs messages when an abnormal duration is spoted ([#251](https://github.com/DataDog/browser-sdk/pull/251))

## v1.3.1

- 🔊[RUMF-257] report abnormal performance.now() ([#254](https://github.com/DataDog/browser-sdk/pull/254))
- ✅[e2e] wait for browser url loaded ([#253](https://github.com/DataDog/browser-sdk/pull/253))
- 🐛[RUMF-293][fetch] handle fetch response text error ([#252](https://github.com/DataDog/browser-sdk/pull/252))

## v1.3.0

- ✨[internal monitoring] add RUM/Logs context ([#249](https://github.com/DataDog/browser-sdk/pull/249))
- 🔊 [RUM-257] add more abnormal info ([#248](https://github.com/DataDog/browser-sdk/pull/248))

## v1.2.11

- 🔊 [RUMF-257] add extra abnormal load info ([#245](https://github.com/DataDog/browser-sdk/pull/245))
- 🔧 lower maxErrorsByMinute threshold ([#244](https://github.com/DataDog/browser-sdk/pull/244))

## v1.2.10

- 🐛[jsonStringify] do not crash on serialization error ([#242](https://github.com/DataDog/browser-sdk/pull/242))

## v1.2.9

- 🐛[init] remove deprecate prerender check ([#240](https://github.com/DataDog/browser-sdk/pull/240))

## v1.2.8

- 🏷 [TypeScript] ensure 3.0 minimal support ([#237](https://github.com/DataDog/browser-sdk/pull/237))

## v1.2.7

- ✅[e2e] cleaner tests ([#233](https://github.com/DataDog/browser-sdk/pull/233))
- 🔧[coverage] setup codecov ([#232](https://github.com/DataDog/browser-sdk/pull/232))
- 🔊[e2e] add extra logging ([#231](https://github.com/DataDog/browser-sdk/pull/231))
- 🔥[rum/logs] remove outdated attributes ([#230](https://github.com/DataDog/browser-sdk/pull/230))
- ♻️[e2e] wait request to reach server before assertions ([#229](https://github.com/DataDog/browser-sdk/pull/229))
- ⚡️[batch] limit view update events ([#228](https://github.com/DataDog/browser-sdk/pull/228))
- 🔊[e2e] output server response in logs ([#226](https://github.com/DataDog/browser-sdk/pull/226))
- 🔧[e2e cbt] add retry case ([#227](https://github.com/DataDog/browser-sdk/pull/227))
- 🔊[e2e] output test server log ([#225](https://github.com/DataDog/browser-sdk/pull/225))
- 🔧[e2e] fix local tests on chrome 79 ([#224](https://github.com/DataDog/browser-sdk/pull/224))

## v1.2.6

- [RUMF-188] add traceId to fetch calls ([#221](https://github.com/DataDog/browser-sdk/pull/221))
- 🐛 [RUMF-201] use timing.navigationStart to compute fake timings ([#217](https://github.com/DataDog/browser-sdk/pull/217))
- ✅ fix e2e cbt tests on Edge ([#222](https://github.com/DataDog/browser-sdk/pull/222))

## v1.2.5

- 🔊🐛 [RUMF-201] add internal logs for abnormal timeOrigin ([#219](https://github.com/DataDog/browser-sdk/pull/219))
- 🔧[e2e cbt] setup retry ([#218](https://github.com/DataDog/browser-sdk/pull/218))

## v1.2.4

- 🐛[types] do not globally override ts types ([#215](https://github.com/DataDog/browser-sdk/pull/215))
- [RUMF-201] add debug monitoring for navigation timing entries ([#214](https://github.com/DataDog/browser-sdk/pull/214))

## v1.2.3

- [RUMF-158] fix view id associated to different session id ([#211](https://github.com/DataDog/browser-sdk/pull/211))
- 🔧[packages] add scripts to release & publish ([#212](https://github.com/DataDog/browser-sdk/pull/212))
- :pencil:[packages] improve README.md ([#209](https://github.com/DataDog/browser-sdk/pull/209))
- 🔧[packages] force exact version ([#208](https://github.com/DataDog/browser-sdk/pull/208))
- 🚀[ci] publish npm packages on tag ([#207](https://github.com/DataDog/browser-sdk/pull/207))
- ✨[packages] allow to publish publicly ([#206](https://github.com/DataDog/browser-sdk/pull/206))

## v1.2.2

- 🔊🐛 [RUMF-201] add internal logs for buggy load event measures ([#204](https://github.com/DataDog/browser-sdk/pull/204))
- ✨[packages] use new names ([#203](https://github.com/DataDog/browser-sdk/pull/203))
- ⬆️[security] fix alert by upgrading webpack ([#202](https://github.com/DataDog/browser-sdk/pull/202))

## v1.2.1

- [e2e cbt] add android browser ([#200](https://github.com/DataDog/browser-sdk/pull/200))
- 💚[gitlab] use new project name ([#199](https://github.com/DataDog/browser-sdk/pull/199))
- 🐛[request] do not consider opaque response as error ([#197](https://github.com/DataDog/browser-sdk/pull/197))
- ✅[e2e cbt] add edge and firefox ([#196](https://github.com/DataDog/browser-sdk/pull/196))

## v1.2.0

- ✅[e2e cbt] make scenarios compatible with safari ([#195](https://github.com/DataDog/browser-sdk/pull/195))
- ✅[karma cbt] add retry for UnhandledException ([#194](https://github.com/DataDog/browser-sdk/pull/194))
- 🐛[request] do not monitor xhr.send monkey patch ([#193](https://github.com/DataDog/browser-sdk/pull/193))
- 🔥[RUM] remove deprecated count ([#192](https://github.com/DataDog/browser-sdk/pull/192))
- ✨[init] add extra checks ([#191](https://github.com/DataDog/browser-sdk/pull/191))
- 🐛[core] ensure that document.cookie is not null ([#190](https://github.com/DataDog/browser-sdk/pull/190))
- ✨[RUM] add view resource count ([#189](https://github.com/DataDog/browser-sdk/pull/189))
- ✨[RUM] do not snake case user defined contexts ([#188](https://github.com/DataDog/browser-sdk/pull/188))
- :pencil:[Readme] Remove deployment part ([#187](https://github.com/DataDog/browser-sdk/pull/187))
- Rename repository ([#186](https://github.com/DataDog/browser-sdk/pull/186))
- ✨[RUM] exclude trace intake requests ([#185](https://github.com/DataDog/browser-sdk/pull/185))
- 🐛[RUM] fix wrong url on spa last view event ([#184](https://github.com/DataDog/browser-sdk/pull/184))
- 📄[license] update third parties ([#183](https://github.com/DataDog/browser-sdk/pull/183))
- 🔧[ci] fix cbt fail on release ([#182](https://github.com/DataDog/browser-sdk/pull/182))

## v1.1.0

- 🔥[RUM] remove screen performance events ([#180](https://github.com/DataDog/browser-sdk/pull/180))
- 🐛[release] get version from lerna.json ([#179](https://github.com/DataDog/browser-sdk/pull/179))

## v1.0.0
