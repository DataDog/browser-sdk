# Changelog

## v1.7.5
* ✨add an option to silent multiple Init errors (#310)

## v1.7.4
* 🐛 replace console.error by console.warn when cookies are not supported (#307)
* :lock: upgrade vulnerable packages (#306)

## v1.7.3
* :bug:[RUMF-403] fix checkURLSupported (#302)
* :white_check_mark: add cbt error case (#299)
* [RUM] enable request with batch time by default (#297)

## v1.7.2
* 🐛[RUMF-396] try to fix view date shift (#295)

## v1.7.1
* 🐛[RUMF-320] Remove url-polyfill dependency (#294)

## v1.7.0
* ✨[RUMF-375] do not collect irrelevant timings (#292)

## v1.6.3
* 🐛[RUMF-266] xhr tracker: add fallback on event listener (#287)

## v1.6.2
* ⚗️[RUMF-371] add batch time to rum intake requests (#285)
* 🐛[RUMF-266] fix xhr incorrect status reported on late abortion (#283)

## v1.6.1
* 🐛[RUMF-330] fix intake requests exclusion (#281)

## v1.6.0
* ✨[RUMF-315] collect initial document timing (#276)
* :arrow_up: Bump codecov from 3.6.1 to 3.6.5 (#277)
* ✨[RUMF-342] use startTime for events timestamp (#275)

## v1.5.0
* ✨[RUMF-264] add compatibility with server side rendering (#273)

## v1.4.2
* :wrench: add repository link for each package (#271)

## v1.4.1
* :bug: [RUM] fix retrieving early timings (#268)

## v1.4.0
* :mute:[RUMF-257] remove logging (#265)
* 🐛 [RUMF-71] do not report negative performance timing duration (#264)
* [MRO] update Node version (#263)
* ✨ [Browser SDK][RUM-291] Allow logs when cookies are disabled (#255)

## v1.3.3
* 🔊[RUMF-257] rework logging (#261)
* 🐛[RUMF-308] do not track session without id (#260)
* 📄 add check-licenses script (#258)

## v1.3.2
* 🔊 [RUMF-71] add internal logs messages when an abnormal duration is spoted (#251)

## v1.3.1
* :loud_sound:[RUMF-257] report abnormal performance.now() (#254)
* :white_check_mark:[e2e] wait for browser url loaded (#253)
* :bug:[RUMF-293][fetch] handle fetch response text error (#252)

## v1.3.0
* ✨[internal monitoring] add RUM/Logs context (#249)
* 🔊 [RUM-257] add more abnormal info (#248)

## v1.2.11
* 🔊 [RUMF-257] add extra abnormal load info (#245)
* :wrench: lower maxErrorsByMinute threshold (#244)

## v1.2.10
* :bug:[jsonStringify] do not crash on serialization error (#242)

## v1.2.9
* :bug:[init] remove deprecate prerender check (#240)

## v1.2.8
* 🏷 [TypeScript] ensure 3.0 minimal support (#237)

## v1.2.7
* ✅[e2e] cleaner tests (#233)
* :wrench:[coverage] setup codecov (#232)
* 🔊[e2e] add extra logging (#231)
* :fire:[rum/logs] remove outdated attributes (#230)
* ♻️[e2e] wait request to reach server before assertions (#229)
* ⚡️[batch] limit view update events (#228)
* 🔊[e2e] output server response in logs (#226)
* :wrench:[e2e cbt] add retry case (#227)
* :loud_sound:[e2e] output test server log (#225)
* :wrench:[e2e] fix local tests on chrome 79 (#224)

## v1.2.6
* [RUMF-188] add traceId to fetch calls (#221)
* 🐛 [RUMF-201] use timing.navigationStart to compute fake timings (#217)
* ✅ fix e2e cbt tests on Edge (#222)

## v1.2.5
* 🔊🐛 [RUMF-201] add internal logs for abnormal timeOrigin (#219)
* 🔧[e2e cbt] setup retry (#218)

## v1.2.4
* :bug:[types] do not globally override ts types (#215)
* [RUMF-201] add debug monitoring for navigation timing entries (#214)

## v1.2.3
* [RUMF-158] fix view id associated to different session id (#211)
* :wrench:[packages] add scripts to release & publish (#212)
* :pencil:[packages] improve README.md (#209)
* :wrench:[packages] force exact version (#208)
* :rocket:[ci] publish npm packages on tag (#207)
* :sparkles:[packages] allow to publish publicly (#206)

## v1.2.2
* 🔊🐛 [RUMF-201] add internal logs for buggy load event measures (#204)
* :sparkles:[packages] use new names (#203)
* :arrow_up:[security] fix alert by upgrading webpack (#202)


## v1.2.1
* [e2e cbt] add android browser (#200)
* :green_heart:[gitlab] use new project name (#199)
* :bug:[request] do not consider opaque response as error (#197)
* ✅[e2e cbt] add edge and firefox (#196)

## v1.2.0
* ✅[e2e cbt] make scenarios compatible with safari (#195)
* ✅[karma cbt] add retry for UnhandledException (#194)
* :bug:[request] do not monitor xhr.send monkey patch (#193)
* :fire:[RUM] remove deprecated count (#192)
* ✨[init] add extra checks (#191)
* :bug:[core] ensure that document.cookie is not null (#190)
*  ✨[RUM] add view resource count (#189)
* ✨[RUM] do not snake case user defined contexts (#188)
* :pencil:[Readme] Remove deployment part (#187)
* Rename repository (#186)
* :sparkles:[RUM] exclude trace intake requests (#185)
* :bug:[RUM] fix wrong url on spa last view event (#184)
* :page_facing_up:[license] update third parties (#183)
* :wrench:[ci] fix cbt fail on release (#182)

## v1.1.0
* :fire:[RUM] remove screen performance events (#180)
* :bug:[release] get version from lerna.json (#179)

## v1.0.0
*  🔧[release] switch to new workflow (#177)
* 🔧[e2e cbt] remove cbt nokill option (#176)
* :wrench:[ci] fix prod failed notif (#175)
* 🔧[ci] add notifications (#174)
* [RUM] send data with source:browser (#173)
* ✅[e2e cbt] fix silent failure (#172)
* :bug: [deploy] trigger deploy separately for each datacenter (#171)
* :label: [e2e] use source types (#167)
* Add datacenter user option (#166)
* Add e2e tests with npm artifacts (#164)
* ✅ [unit] fix random warning/failure (#170)
* :bug: [RUM/Logs] prevent multiple init (#169)
* :bug: [RUM] do not return global when init (#168)
* [RUM] add session id in internal context (#165)
* [ci] run cbt steps sequentially (#163)
* [RUM] cleanup post migration (#162)
* [RUM] [RUMF-83] renew page on new session (#155)
* [Request collection] collect trace id when available (#161)
* enforces lint and typechecking in all .ts files (#160)
* [core] fix throttle (#159)
* [RUM] view measures and user action renamings (#158)
* [RUM] rename page view / screen to view (#157)
* [RUM + Logs] fix case of session + internal context (#156)
* [RUM + Logs] send RUM internal context with logs (#154)
* add new API
* Merge branch 'master' into bcaudan/share-rum-context
* type DD_RUM as optional
* Increases unit CBT captureTimeout to 3 minutes (#153)
* [Logs] send RUM internal context when available
* [RUM] expose internal context
* [RUM] implements a centralized RUM LifeCycle object (#152)
* [RUM] send page view event after change (#151)
* Run e2e tests on CBT + add pageview timings tests (#148)
* fix s3 upload issue (#149)
* Bundle from packages (#147)
* Build packages for npm (#146)
* Adds cookie authorization check (#126)
* Fix Safari navigation timings and rename domContentLoadedEvent (#145)
* Extract one package by product (#144)
* [RUM] fix chrome deprecation notice (#143)
* [RUM] fix long task duration (#142)
* [RUM,LOGS] add screen.referrer where applicable (#141)
* [RUM] verify the configuration sample rate value (#140)
* Merge pull request #139 from DataDog/benoit.zugmeyer/add-screen-url-in-logs
* [RUM] page view with custom event count (#138)
* [LOGS] use screen.url for log and internal monitoring messages
* [RUM] add custom event (#137)
* Update cbt_tunnels (#136)
* [RUM] collect long tasks (#110)
* [RUM] page view with performance data (#135)
* [RUM] page view with error count (#134)
* [RUM] fix page view event timestamp (#133)
* [RUM] add page view event (#132)
* [RUM] revert proto page end (#131)
* [RUM] add global context API (#130)
* [RUM] proto page end - improvements (#129)
* [Error collection] Retrieve stacktrace when console.error Error (#128)
* [RUM] proto to measure page end event loss (#127)
* [RUM] fix IE 11 unavailable API (#125)
* [RUM] send performance entries available at agent execution (#124)
* remove obsolete pageViewId (#123)
* Add multinav tests (#122)
* Fix startsWith not available on all browsers (#121)
* [RUM] collect extra data on requests (#119)
* [RUM] fix performance.addEventListener is not a function (#120)
* [RUM] refacto + fix resources (#118)
* [util] monitor monkey patchings (#116)
* [RUM] do not handle resource without url (#117)
* [util] jsonStringify not only objects (#115)
* [request collection] track fetch only when defined (#114)
* [LOGS] Add warn when using public api key (#113)
* [RUM] catch URL construction error (#112)
* Setup CrossBrowserTesting integration (#111)
* [RUM] collect error details (#109)
* update 3rd party licenses
* error collection: monitor tracekit global handler
* error collection: handle properly empty reason rejection
* session: cleanup activity tracking
* Add CODEOWNERS
* RUM: add sampling configuration (session + resource) (#103)
* Logger: add sampling rate configuration (#102)
* Use new data model (#101)
* Avoid to monkey patch XHR and fetch when not needed (#99)
* Increase browser support + doc + test page (#98)
* Remove page view event (#97)
* Internal monitoring: handle non error instance (#96)
* Setup code coverage (#95)
* Update dependencies (#94)
* Switch test framework (#93)
* Decrease request flush timeout (#91)
* Merge pull request #90 from DataDog/hdelaby/rename-PAK
* forgotten condition
* accept PAK for rum temporarily
* fix tests
* [rum] remove warning for rum and logs about PAK
* Merge pull request #89 from DataDog/hdelaby/rename-PAK
* [rum] review fixes
* [rum] typo fix
* [rum] rename PAK to client token
* Disable multi request for rum (#88)
* fix firefox: performance observer is blocked when resource timing buffer is full
* Rework Performance observer callback (#86)
* Request collection: always use full url (#85)
* Extract request observable (#84)
* error collection: handle edge cases (#81)
* Error collection: format error passed directly to console (#82)
* Error collection: add error origin (#80)
* fix PerformanceObserver check (#79)
* Add no-unsafe-any lint rule (#76)
* Remove deprecated methods (#77)
* error collection: prefix console message (#75)
* Remove rumProjectId (#74)
* Rename project to application (#73)
* Console error: stringify object parameters (#70)
* Fix beacon not queued (#72)
* Add a max number of errors by minute threshold (#67)
* Fix logger context mutated by message context (#71)
* Fix potential uncaught promise leak (#68)
* Send RUM requests to logs and rum intake (#69)
* Remove useless data (#65)
* Rationalise request error attributes + track fetch errors (#64)
* Use git sha1 for version tag (#66)
* fix review
* Remove useless data
* add fetch unit tests
* truncate request error response
* fix review
* Fix logs order to avoid random failure
* Track fetch errors
* Track XHR error with standard attributes
* Deep merge context
* Add cors and endpoints for testing
* Track fetch like xhr (#63)
* Track spa navigation (#62)
* Add pageViewId to each RUM event (#61)
* Send snake case data (#59)
* Format stack trace (#60)
* Update error and throughput data strategy (#57)
* Remove logger from RUM bundle (#58)
* Remove project id from logger global context (#55)
* Remove User Agent tracking (#56)
* Remove unavailable timing data (#54)
* Add logger name in logger context (#52)
* Cleanup deprecated methods (#51)
* Update url attribute (#53)
* Improve namings (#50)
*  add error e2e test (#49)
* Reorganize sources (#48)
* add log e2e test (#47)
* Add resource type based on file extension and initiator (#46)
* Send xhr throughput by page (#45)
* Add license (#44)
* Update README.md
* Rework logger API + add custom logger creation (#41)
* Init 3rd party license file (#43)
* add deploy to prod (#40)
* add log send strategy option (#39)
* add minimal log level option (#38)
* Merge pull request #37 from DataDog/yeramian/add-resource-timing
* change test name
* add new metric for resource entry
* Rename entries (#36)
* Renamings publicApiKey + InternalMonitoring + rumProjectId (#35)
* Update logs source (#34)
* Use different endpoints for logs / rum (#33)
* Rewrite paint entries data (#32)
* fix Readme format
* Better syntax
* Add a bit of documentation
* Merge pull request #31 from DataDog/sdeprez/adjusment_for_logs
* Add test
* Merge pull request #30 from DataDog/sdeprez/round_some_data
* Simplify implementation
* Various fixes
* Round some durations
* Merge pull request #29 from DataDog/sdeprez/bundle_eu_and_us
* Bundle EU and US
* Merge pull request #27 from DataDog/yeramian/add-metric
* add metrics
* Merge pull request #28 from DataDog/sdeprez/do_not_send_own_resources
* Clarity
* Merge pull request #26 from DataDog/sdeprez/rework_monitoring
* Better monitoring globals
* Review fixes
* Do not send our own resources
* Add a `monitoringApiKey`
* Merge pull request #24 from DataDog/sdeprez/add_rum_and_core_bundles
* Logs fixes
* Merge pull request #25 from DataDog/sdeprez/change_rum_data_format
* Review fixes
* Fix format and test
* Type the EntryType for documentation purpose
* Change RUM data structure
* Fix E2E test
* Create two bundles: core and rum
* Add sessionId concept (#22)
* Merge pull request #23 from DataDog/sdeprez/use_staging_logs_endpoint
* Merge pull request #18 from DataDog/yeramian/add-limit-size-message
* Use staging logs endpoint
* change tests title
* add comments
* move beforeFlushOnUnloadHandlers to Batch
* add line
* add limit on message
* naming and cleaning
* naming and cleaning
* remove argument and private on flushTic
* add new batch and request mechanism
* Setup e2e tests (#21)
* Deploy on staging for each build on master (#13)
* Send a RUM event for the display (#20)
* track XHR errors (#17)
* Send page duration (#19)
* Send RAIL model metrics (#15)
* Merge pull request #16 from DataDog/sdeprez/add_stub_datadog
* Format rum
* Merge branch 'master' into sdeprez/add_stub_datadog
* Change prettier format
* Add PerformanceResourceTiming tracking (#14)
* Remove keys and explicitly stub Datadog
* Misc (#12)
* Send version with requests (#11)
* Send logs by batch (#10)
* Add TraceKit (#9)
* Add optional automatic error collection (#8)
* Add browserstack tests (#7)
* add extra data + global context (#6)
* Add monitoring (#5)
* Add manual log collector (#4)
* Init testing (#3)
* Init CI (#2)
* Init tooling (#1)
* first commit
