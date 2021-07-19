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

---

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
