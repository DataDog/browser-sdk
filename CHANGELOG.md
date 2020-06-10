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

---

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
