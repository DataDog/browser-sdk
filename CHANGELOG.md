# Changelog

## v1.7.5

- ✨add an option to silent multiple Init errors (#310)

## v1.7.4

- 🐛 replace console.error by console.warn when cookies are not supported (#307)
- :lock: upgrade vulnerable packages (#306)

## v1.7.3

- :bug:[RUMF-403] fix checkURLSupported (#302)
- :white_check_mark: add cbt error case (#299)
- [RUM] enable request with batch time by default (#297)

## v1.7.2

- 🐛[RUMF-396] try to fix view date shift (#295)

## v1.7.1

- 🐛[RUMF-320] Remove url-polyfill dependency (#294)

## v1.7.0

- ✨[RUMF-375] do not collect irrelevant timings (#292)

## v1.6.3

- 🐛[RUMF-266] xhr tracker: add fallback on event listener (#287)

## v1.6.2

- ⚗️[RUMF-371] add batch time to rum intake requests (#285)
- 🐛[RUMF-266] fix xhr incorrect status reported on late abortion (#283)

## v1.6.1

- 🐛[RUMF-330] fix intake requests exclusion (#281)

## v1.6.0

- ✨[RUMF-315] collect initial document timing (#276)
- :arrow_up: Bump codecov from 3.6.1 to 3.6.5 (#277)
- ✨[RUMF-342] use startTime for events timestamp (#275)

## v1.5.0

- ✨[RUMF-264] add compatibility with server side rendering (#273)

## v1.4.2

- :wrench: add repository link for each package (#271)

## v1.4.1

- :bug: [RUM] fix retrieving early timings (#268)

## v1.4.0

- :mute:[RUMF-257] remove logging (#265)
- 🐛 [RUMF-71] do not report negative performance timing duration (#264)
- [MRO] update Node version (#263)
- ✨ [Browser SDK][rum-291] Allow logs when cookies are disabled (#255)

## v1.3.3

- 🔊[RUMF-257] rework logging (#261)
- 🐛[RUMF-308] do not track session without id (#260)
- 📄 add check-licenses script (#258)

## v1.3.2

- 🔊 [RUMF-71] add internal logs messages when an abnormal duration is spoted (#251)

## v1.3.1

- :loud_sound:[RUMF-257] report abnormal performance.now() (#254)
- :white_check_mark:[e2e] wait for browser url loaded (#253)
- :bug:[RUMF-293][fetch] handle fetch response text error (#252)

## v1.3.0

- ✨[internal monitoring] add RUM/Logs context (#249)
- 🔊 [RUM-257] add more abnormal info (#248)

## v1.2.11

- 🔊 [RUMF-257] add extra abnormal load info (#245)
- :wrench: lower maxErrorsByMinute threshold (#244)

## v1.2.10

- :bug:[jsonStringify] do not crash on serialization error (#242)

## v1.2.9

- :bug:[init] remove deprecate prerender check (#240)

## v1.2.8

- 🏷 [TypeScript] ensure 3.0 minimal support (#237)

## v1.2.7

- ✅[e2e] cleaner tests (#233)
- :wrench:[coverage] setup codecov (#232)
- 🔊[e2e] add extra logging (#231)
- :fire:[rum/logs] remove outdated attributes (#230)
- ♻️[e2e] wait request to reach server before assertions (#229)
- ⚡️[batch] limit view update events (#228)
- 🔊[e2e] output server response in logs (#226)
- :wrench:[e2e cbt] add retry case (#227)
- :loud_sound:[e2e] output test server log (#225)
- :wrench:[e2e] fix local tests on chrome 79 (#224)

## v1.2.6

- [RUMF-188] add traceId to fetch calls (#221)
- 🐛 [RUMF-201] use timing.navigationStart to compute fake timings (#217)
- ✅ fix e2e cbt tests on Edge (#222)

## v1.2.5

- 🔊🐛 [RUMF-201] add internal logs for abnormal timeOrigin (#219)
- 🔧[e2e cbt] setup retry (#218)

## v1.2.4

- :bug:[types] do not globally override ts types (#215)
- [RUMF-201] add debug monitoring for navigation timing entries (#214)

## v1.2.3

- [RUMF-158] fix view id associated to different session id (#211)
- :wrench:[packages] add scripts to release & publish (#212)
- :pencil:[packages] improve README.md (#209)
- :wrench:[packages] force exact version (#208)
- :rocket:[ci] publish npm packages on tag (#207)
- :sparkles:[packages] allow to publish publicly (#206)

## v1.2.2

- 🔊🐛 [RUMF-201] add internal logs for buggy load event measures (#204)
- :sparkles:[packages] use new names (#203)
- :arrow_up:[security] fix alert by upgrading webpack (#202)

## v1.2.1

- [e2e cbt] add android browser (#200)
- :green_heart:[gitlab] use new project name (#199)
- :bug:[request] do not consider opaque response as error (#197)
- ✅[e2e cbt] add edge and firefox (#196)

## v1.2.0

- ✅[e2e cbt] make scenarios compatible with safari (#195)
- ✅[karma cbt] add retry for UnhandledException (#194)
- :bug:[request] do not monitor xhr.send monkey patch (#193)
- :fire:[RUM] remove deprecated count (#192)
- ✨[init] add extra checks (#191)
- :bug:[core] ensure that document.cookie is not null (#190)
- ✨[RUM] add view resource count (#189)
- ✨[RUM] do not snake case user defined contexts (#188)
- :pencil:[Readme] Remove deployment part (#187)
- Rename repository (#186)
- :sparkles:[RUM] exclude trace intake requests (#185)
- :bug:[RUM] fix wrong url on spa last view event (#184)
- :page_facing_up:[license] update third parties (#183)
- :wrench:[ci] fix cbt fail on release (#182)

## v1.1.0

- :fire:[RUM] remove screen performance events (#180)
- :bug:[release] get version from lerna.json (#179)

## v1.0.0
