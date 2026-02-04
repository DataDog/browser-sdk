# Technology Stack for CDN Bundle Generator

**Project:** Browser SDK - Remote Config CDN Bundle Generation
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

The code generator tool will be a Node.js script that bundles SDK + remote config into a single JavaScript file. It leverages **existing build infrastructure** (webpack, TypeScript) while adding minimal new dependencies for code assembly and output formatting.

**Key Decision:** Use **template literals + Prettier** for code generation, NOT AST manipulation. This is simpler, more maintainable, and sufficient for the use case (wrapping config object + bundled SDK code).

## Recommended Stack Additions

### Code Generation Approach
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Template literals (built-in) | ES2015+ | Assemble output JavaScript | Native, simple, sufficient for wrapper code |
| Prettier | ^3.8.0 | Format generated code | Already in devDeps, ensures clean output |

### Bundling Strategy
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| esbuild | ^0.24.x | Bundle SDK programmatically | 10-100x faster than webpack, in-memory output |
| @datadog/browser-remote-config | existing | Fetch remote config | Already a project dependency |

### CLI Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:util.parseArgs` | Built-in (Node 20+) | Parse CLI arguments | Native API (stable since v20.0.0), no dependencies |

### Supporting Utilities
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` | Built-in | Write output files | All file I/O operations |
| `node:path` | Built-in | Resolve paths | Path manipulation |
| TypeScript | ^5.9.3 | Script implementation | Consistency with codebase |

## Detailed Rationale

### 1. Code Generation: Template Literals vs AST

**Decision: Template Literals + Prettier**

**Why NOT AST manipulation:**
- **Complexity mismatch**: AST tools (@babel/types, @babel/generator) are designed for complex transformations. Our use case is simple: wrap a config object and bundled code.
- **Overhead**: AST generation has parse → transform → generate overhead. [Astring](https://github.com/davidbonnet/astring) is faster than Babel (50x), but still slower than direct string assembly.
- **Maintenance**: AST code is verbose. Creating nodes for a simple IIFE wrapper requires more code than the output itself.

**Why template literals:**
- **Simplicity**: 5-10 lines of template literal code vs 50+ lines of AST manipulation
- **Type safety**: TypeScript template literals provide compile-time checking
- **Readability**: Output structure is immediately visible in source
- **Performance**: No parse/generate overhead

**Example approach:**
```typescript
const generatedCode = `
(function() {
  // Bundled config
  var config = ${JSON.stringify(remoteConfig, null, 2)};

  // Bundled SDK
  ${bundledSdkCode}

  // Auto-initialize with config
  if (window.DD_RUM) {
    window.DD_RUM.init(config);
  }
})();
`;

// Format with Prettier (already in devDeps)
const formatted = await prettier.format(generatedCode, {
  parser: 'babel',
  ...prettierConfig
});
```

**Source confidence:** HIGH
- [Template literals vs AST comparison](https://medium.com/singapore-gds/writing-a-typescript-code-generator-templates-vs-ast-ab391e5d1f5e) confirms templates are suitable for simple generation
- Prettier already in project (package.json line 90)

### 2. Bundling: esbuild vs webpack

**Decision: esbuild for generator, webpack for existing builds**

**Why esbuild for the generator:**
- **Programmatic API**: Simple in-memory bundling with `write: false`
- **Performance**: 10-100x faster than webpack ([source](https://www.index.dev/skill-vs-skill/webpack-vs-rollup-vs-esbuild))
- **Output access**: `result.outputFiles[0].text` directly provides bundled code
- **Platform config**: `platform: 'browser'` ensures correct bundling

**Why NOT switch existing webpack builds:**
- Webpack is battle-tested for the SDK packages
- No need to migrate existing build infrastructure
- Generator is a separate tool with different requirements

**Integration approach:**
```typescript
import * as esbuild from 'esbuild';

async function bundleSdk(entryPoint: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    platform: 'browser',
    target: ['es2018'],
    write: false,  // Keep in memory
    format: 'iife',
  });

  return result.outputFiles[0].text;
}
```

**Source confidence:** HIGH
- [esbuild API docs](https://esbuild.github.io/api/) confirm `write: false` and `outputFiles[].text`
- [Comparison article](https://www.index.dev/skill-vs-skill/webpack-vs-rollup-vs-esbuild) confirms performance claims
- Rollup mentioned as alternative for library bundling, but esbuild is simpler for this use case

### 3. CLI: Built-in parseArgs vs Commander/Yargs

**Decision: `node:util.parseArgs` (built-in)**

**Why built-in API:**
- **Zero dependencies**: Already available in Node.js 20+ (project uses Node 24.10.0)
- **Stable**: No longer experimental since v20.0.0 ([source](https://nodejs.org/api/util.html))
- **Sufficient features**: Supports boolean flags, string options, short forms, positionals
- **Project convention**: Scripts already use `node:util.parseArgs` (see build-package.ts line 14)

**Why NOT Commander/Yargs:**
- Adds dependencies for features we don't need (subcommands, validation, help generation)
- Simple CLI: 3-5 options total (--sdk, --output, --config, --minify)
- [Documentation states](https://exploringjs.com/nodejs-shell-scripting/ch_node-util-parseargs.html): "good option for developers of simple CLI tools, ad-hoc scripts"

**Example usage:**
```typescript
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    sdk: { type: 'string', short: 's' },
    output: { type: 'string', short: 'o' },
    minify: { type: 'boolean', default: true },
  },
});
```

**Source confidence:** HIGH
- [Node.js official docs](https://nodejs.org/api/util.html) confirm stability and version history
- Existing project usage validates approach

### 4. File I/O: Built-in APIs

**Decision: `node:fs/promises` for all file operations**

**Why:**
- **Modern async API**: Promise-based, works with async/await
- **Zero dependencies**: Part of Node.js core
- **Project convention**: Scripts use `fs.promises` (see build-test-apps.ts line 1)

**Why NOT fs-extra or other libraries:**
- Built-in API covers all needs (read, write, mkdir, rm)
- Project already uses modern Node.js (v24), no compatibility concerns

**Source confidence:** HIGH
- Project pattern established in scripts/

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Code generation | Template literals | @babel/types + @babel/generator | Overkill for simple wrapper; 50x slower; verbose |
| Code generation | Template literals | estemplate / astring | Adds dependency for no benefit over templates |
| Bundling (generator) | esbuild | webpack | 10-100x slower; more complex API; already used elsewhere |
| Bundling (generator) | esbuild | rollup | Better for libraries; esbuild simpler for IIFE output |
| CLI parsing | node:util.parseArgs | commander | Adds dependency; over-featured for simple CLI |
| CLI parsing | node:util.parseArgs | yargs | Adds dependency; over-featured for simple CLI |
| Formatting | prettier | None (raw output) | Already in devDeps; improves readability |

## Installation

**No new dependencies required.** All recommended libraries are either:
1. Built-in Node.js APIs (parseArgs, fs/promises, path)
2. Already in devDependencies (prettier, typescript)
3. Need to be added (esbuild)

```bash
# Add esbuild to devDependencies
yarn add -D esbuild@^0.24

# Verify Node.js version supports parseArgs (need 20+)
node --version  # Currently v24.10.0 ✓
```

## Integration with Existing Build System

### Location
```
scripts/
├── build/
│   ├── build-package.ts          # Existing webpack-based builds
│   ├── build-test-apps.ts        # Existing test app builds
│   └── generate-cdn-bundle.ts    # NEW: CDN bundle generator
└── lib/
    ├── executionUtils.ts          # Existing: runMain, printLog
    ├── command.ts                 # Existing: shell commands
    └── generateCode.ts            # NEW: code generation utilities
```

### Bundling Strategy
- **Existing SDK builds**: Continue using webpack (`build-package.ts`)
- **CDN bundle generator**: Use esbuild programmatically for on-demand bundling
- **Why separate**: Generator needs in-memory bundling; SDK builds need source maps, chunks, etc.

### Execution Pattern
Follow existing script conventions:
```typescript
import { runMain, printLog } from '../lib/executionUtils.ts';
import { parseArgs } from 'node:util';

runMain(async () => {
  const { values } = parseArgs({ /* ... */ });

  printLog('Generating CDN bundle...');
  // Generator logic
  printLog('Done.');
});
```

## Version Pinning Strategy

| Dependency | Version Strategy | Rationale |
|------------|------------------|-----------|
| esbuild | ^0.24.x (latest) | Fast-moving project; minor updates safe; stay current |
| prettier | ^3.8.0 (existing) | Already locked in package.json; no change needed |
| Node.js APIs | Built-in | Tied to Node.js version (v24.10.0 via volta) |

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| esbuild API changes | Low | Well-established API; breaking changes rare since 1.0 |
| Template literal escaping bugs | Low | Use JSON.stringify for config; no user input in templates |
| Output size bloat | Medium | Monitor with `scripts/show-bundle-size.ts` pattern |
| parseArgs limitations | Low | Simple CLI needs; feature set sufficient |

## Performance Expectations

Based on research and typical SDK bundle sizes (~50-100KB):

| Operation | Expected Time | Source |
|-----------|---------------|--------|
| Fetch remote config | 100-500ms | Network latency |
| Bundle SDK with esbuild | 10-50ms | [esbuild benchmarks](https://esbuild.github.io/) show <100ms for 100KB |
| Format with prettier | 20-100ms | Prettier handles files of this size quickly |
| Write to disk | <10ms | Local file I/O |
| **Total** | **<1 second** | Dominated by network fetch |

## Future Considerations

### When to reconsider AST approach
If requirements change to:
- Transform SDK code (not just bundle it)
- Inject complex runtime logic (not just config)
- Support plugins/extensibility

Then revisit @babel/types + @babel/template.

### When to add Commander/Yargs
If CLI grows to include:
- Subcommands (generate, validate, deploy)
- Complex validation rules
- Auto-generated help documentation

Then add commander for better UX.

### Bundler alternatives
If esbuild proves insufficient (unlikely):
- **Rollup**: Better for tree-shaking libraries; programmatic API similar
- **webpack**: Reuse existing config; slower but more features

## Sources

### High Confidence (Official Docs)
- [Node.js util.parseArgs() docs](https://nodejs.org/api/util.html) - Stability and API reference
- [esbuild API docs](https://esbuild.github.io/api/) - Programmatic bundling reference
- [Prettier docs](https://prettier.io/docs/) - Code formatting

### Medium Confidence (Verified)
- [Template literals vs AST for code generation](https://medium.com/singapore-gds/writing-a-typescript-code-generator-templates-vs-ast-ab391e5d1f5e) - Approach comparison
- [JavaScript bundler comparison 2025-2026](https://www.index.dev/skill-vs-skill/webpack-vs-rollup-vs-esbuild) - Performance data
- [Modern bundlers comparison](https://strapi.io/blog/modern-javascript-bundlers-comparison-2025) - Feature analysis
- [Exploring Node.js shell scripting - parseArgs](https://exploringjs.com/nodejs-shell-scripting/ch_node-util-parseargs.html) - Usage patterns

### Low Confidence (Community)
- [esbuild GitHub issues](https://github.com/evanw/esbuild/issues/139) - In-memory output discussion
- [Babel AST manipulation guides](https://lihautan.com/manipulating-ast-with-javascript) - Alternative approach context

## Open Questions for Implementation

1. **Minification strategy**: Should generator output already-minified SDK bundle, or minify the final combined output?
   - Recommendation: Minify SDK separately with esbuild, combine with config, then optionally minify again

2. **Source map handling**: Should the generated bundle include source maps?
   - Recommendation: Phase 1 skip source maps (CDN bundle is for production use, not debugging)

3. **Cache strategy**: Should the generator cache bundled SDK to avoid re-bundling?
   - Recommendation: Phase 1 skip caching (generation is fast enough); Phase 2 add if needed

4. **Config validation**: Should generator validate remote config structure?
   - Recommendation: Yes, use existing SDK types for compile-time validation

These questions should be addressed during detailed design, not research phase.
