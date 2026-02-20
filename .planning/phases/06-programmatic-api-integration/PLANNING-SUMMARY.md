# Phase 6: Programmatic API & Integration - Planning Complete

**Date:** 2026-02-04
**Status:** ✅ Planning Complete - Ready for Execution
**Plans Created:** 5
**Waves:** 3

---

## Overview

Phase 6 planning is complete. The phase delivers a high-level programmatic API (`generateBundle()`) that build tools can call directly, with comprehensive testing, documentation, and performance optimization.

**Phase Goal:** Build tools can integrate generator programmatically and SDK uses embedded config at runtime

**What was planned:**

- 5 execution plans across 3 waves
- 2 parallel foundation plans (API + caching)
- 2 parallel testing plans (E2E basic + E2E dynamic)
- 1 documentation plan
- 10 total tasks with specific, measurable criteria
- ~115% estimated context spread across focused 20-30% plans

---

## Plan Breakdown

### Wave 1: Foundation (Parallel)

#### Plan 01: Programmatic API with input validation

- **Objective:** Export `generateBundle()` async function with input validation
- **Tasks:** 2
  - Task 1: Implement API function wrapping existing workflow
  - Task 2: Add comprehensive unit tests for API and validation
- **Files Modified:** `scripts/build/lib/bundleGenerator.ts`, `.spec.ts`
- **Scope:** Create high-level wrapper, validate inputs, test coverage
- **Est. Context:** ~30%

#### Plan 02: In-memory SDK caching for performance

- **Objective:** Add Map-based cache to `downloadSDK()` for repeated calls
- **Tasks:** 2
  - Task 1: Implement in-memory cache in downloadSDK()
  - Task 2: Add cache behavior and performance tests
- **Files Modified:** `scripts/build/lib/bundleGenerator.ts`, `.spec.ts`
- **Scope:** Cache using variant+version key, test cache hits
- **Est. Context:** ~20%
- **Parallel Note:** Both plans modify `bundleGenerator.ts` but in different areas (Plan 01 adds new function, Plan 02 modifies existing). No file conflicts.

### Wave 2: E2E Testing (Parallel, after Wave 1)

#### Plan 03: E2E tests for embedded config

- **Objective:** Verify SDK loads and initializes from embedded config without network requests
- **Tasks:** 2
  - Task 1: Create E2E test file with network blocking scenario
  - Task 2: Add error scenarios and edge case tests
- **Files Modified:** `test/e2e/scenario/embedded-config.spec.ts` (new)
- **Scope:** 5+ tests proving SDK uses embedded config, no network fetch
- **Est. Context:** ~20%
- **Depends on:** Plan 01 (needs `generateBundle()` API)

#### Plan 04: E2E tests for dynamic values

- **Objective:** Verify dynamic config values (cookies, DOM, JS paths) resolve at runtime
- **Tasks:** 2
  - Task 1: Create E2E tests for cookie, DOM, JS path scenarios
  - Task 2: Add edge case tests for missing/invalid sources
- **Files Modified:** `test/e2e/scenario/embedded-config-dynamic.spec.ts` (new)
- **Scope:** 6+ tests covering all dynamic value types and mixed scenarios
- **Est. Context:** ~20%
- **Depends on:** Plan 01 (needs `generateBundle()` API)

### Wave 3: Documentation (After Waves 1-2)

#### Plan 05: API documentation and examples

- **Objective:** Create comprehensive API documentation and build tool integration examples
- **Tasks:** 2
  - Task 1: Add JSDoc comments to all exports in bundleGenerator.ts
  - Task 2: Create bundleGenerator.README.md with API reference and examples
- **Files Modified:** `scripts/build/lib/bundleGenerator.ts`, `bundleGenerator.README.md` (new)
- **Scope:** JSDoc on all exports, README with webpack/Vite/Node.js examples
- **Est. Context:** ~25%
- **Depends on:** Plans 01, 02 (needs final API to document)

---

## Requirements Coverage

All 9 Phase 6 requirements are mapped to plans:

| Requirement | Description                          | Plan                |
| ----------- | ------------------------------------ | ------------------- |
| API-01      | Node.js function can be imported     | 01                  |
| API-02      | Function accepts options object      | 01                  |
| API-03      | Function validates inputs/errors     | 01                  |
| API-04      | SDK uses embedded config at runtime  | 03                  |
| API-05      | Dynamic values resolvable at runtime | 04                  |
| CONFIG-01   | Bundle includes SDK + config         | 03                  |
| CONFIG-02   | No SDK code changes needed           | 03                  |
| CONFIG-03   | Dynamic values passed through        | 04                  |
| CONFIG-04   | Version mismatch logging             | Deferred to Phase 8 |

---

## Dependency Graph

```
Wave 1 (Parallel):
  Plan 01 ──┐
            ├──> Plan 03 (Wave 2)
  Plan 02 ──┤
            ├──> Plan 04 (Wave 2)
            └──> Plan 05 (Wave 3)

Plan 01 is critical blocker for Wave 2 (both E2E tests need generateBundle() API)
Plan 02 is non-blocking optimization (can run in parallel with Plan 01)
Plans 03-04 can run in parallel after Plan 01 completes
Plan 05 waits for Plans 01-02 verification
```

---

## Context Budget

**Total estimated context for all plans: ~115%**
**Strategy:** Spread across 5 focused plans to keep each under 50%

| Plan | Est. Context | Rationale                              |
| ---- | ------------ | -------------------------------------- |
| 01   | ~30%         | API function + validation + unit tests |
| 02   | ~20%         | Simple cache Map + cache tests         |
| 03   | ~20%         | E2E test setup + network blocking      |
| 04   | ~20%         | E2E test scenarios (similar to 03)     |
| 05   | ~25%         | Documentation + examples               |

Quality maintained throughout by keeping each plan focused and atomic.

---

## Key Design Decisions

1. **Single high-level API function (`generateBundle()`)**
   - Simpler than factory pattern
   - Easier for build tools to call
   - Extensible (can add return metadata later)

2. **In-memory caching (not disk)**
   - Fast (milliseconds vs seconds)
   - Automatic cleanup (exits with process)
   - Perfect for watch mode builds
   - No configuration needed

3. **E2E tests critical for Phase 6**
   - Unit tests verify code correctness
   - E2E tests prove SDK behavior in browser
   - Network blocking proves zero-request goal
   - Dynamic value tests validate SDK resolution

4. **No SDK changes required**
   - Phase 5 design already supports embedded config
   - Generated bundle calls `DD_RUM.init()` explicitly
   - SDK's `resolveDynamicValues()` handles dynamic values
   - Clean separation: generator embeds, SDK resolves

5. **Documentation last (Wave 3)**
   - Implementation must be finalized first
   - Examples derived from working code
   - No documentation debt

---

## Execution Checklist

**Pre-execution verification:**

- [ ] Research document reviewed (@06-RESEARCH.md)
- [ ] Requirements traced to plans (@REQUIREMENTS.md)
- [ ] All 5 PLAN.md files created
- [ ] Dependency graph validated
- [ ] Context budget confirmed

**Wave 1 execution:**

- [ ] Plan 01 executed (API + unit tests)
- [ ] Plan 02 executed in parallel (caching)
- [ ] Both verified: `yarn test:unit` passes
- [ ] TypeScript compilation succeeds

**Wave 2 execution (after Wave 1 verification):**

- [ ] Plan 03 executed (E2E basic)
- [ ] Plan 04 executed in parallel (E2E dynamic)
- [ ] Both verified: `yarn test:e2e -g "embedded-config"` passes
- [ ] Network blocking proves zero-request goal

**Wave 3 execution (after Wave 2 verification):**

- [ ] Plan 05 executed (documentation)
- [ ] README verified for completeness
- [ ] JSDoc in IDE shows autocomplete
- [ ] Build tool examples are copy-paste ready

**Phase completion:**

- [ ] Create SUMMARY.md for Phase 6
- [ ] Update STATE.md with completion
- [ ] Ready for Phase 7 planning

---

## Success Criteria Validation

**Phase 6 must achieve these from ROADMAP.md:**

1. ✅ Node.js function can be imported and called from any build tool
   - Plan 01: `generateBundle()` exported function
   - Plan 05: Examples for webpack, Vite, Node.js

2. ✅ Function accepts configuration object and returns Promise<string>
   - Plan 01: `GenerateBundleOptions` interface
   - Plan 01: Returns Promise<string>

3. ✅ Function validates inputs and returns descriptive errors
   - Plan 01: Input validation with clear messages
   - Plan 01: Unit tests for error scenarios

4. ✅ SDK at runtime uses embedded configuration without network fetch
   - Plan 03: E2E tests with network blocking
   - Plan 03: Verify SDK initializes without config fetch

5. ✅ Dynamic configuration values remain resolvable at browser runtime
   - Plan 04: E2E tests for cookies, DOM, JS paths
   - Plan 04: Verify SDK resolves dynamic values

**All 5 success criteria have plans to achieve them.**

---

## Next Actions

1. Execute plans in wave order: 01+02 → 03+04 → 05
2. After each wave, verify success criteria before proceeding
3. Use `/gsd:execute-phase 06-programmatic-api-integration` to start execution
4. Create SUMMARY.md after all plans complete

---

## Files Created

- `.planning/phases/06-programmatic-api-integration/06-01-PLAN.md` — API + validation
- `.planning/phases/06-programmatic-api-integration/06-02-PLAN.md` — Caching
- `.planning/phases/06-programmatic-api-integration/06-03-PLAN.md` — E2E tests (basic)
- `.planning/phases/06-programmatic-api-integration/06-04-PLAN.md` — E2E tests (dynamic)
- `.planning/phases/06-programmatic-api-integration/06-05-PLAN.md` — Documentation

---

## Related Documents

- **RESEARCH:** `.planning/phases/06-programmatic-api-integration/06-RESEARCH.md` — Deep research on API design, testing strategy, build tool integration
- **ROADMAP:** `.planning/ROADMAP.md` — Updated with Phase 6 plan count and wave structure
- **STATE:** `.planning/STATE.md` — To be updated after execution
- **REQUIREMENTS:** `.planning/REQUIREMENTS.md` — Phase 6 requirements (9 total)

---

**Planning completed:** 2026-02-04
**Planned by:** Claude Code (GSD Planner)
**Ready for execution:** YES
