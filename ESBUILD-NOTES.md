* Bundles build (`yarn build:bundles`) time on my machine:
  * webpack: 14s
  * esbuild bundling + babel es5 downlevel + terser minify: 10s
  * esbuild bundling + terser minify: 4.5s
  * esbuild bundling + esbuild minify: 2.5s (mostly yarn/lerna overhead)

* For unit tests, karma-esbuild does not fail the test run when a bundle fails to build (issue reported [here][1])

* Coverage works, but:

  * it needs babel to work, so slows down the compile time during tests

  * babel-plugin-istanbul produces a syntax error with our tests (issue reported [here][2])


* ES5 downlevel drawbacks:

  * `const enum` need to be changed to `enum` to compile for an ES5 target, else esbuild fails

  * TypeScript class "parameter properties" `constructor(private foo: SomeType)` causes some issues:
    because we want to keep the TS syntax when transpiling to es5 using babel (esbuild has some nice
    optimizations when handling TS), our babel plugin transpile classes but not parameter
    properties. Thus, we end up with "parameter properties" in functions (ex: `function
    Batch(private request: HttpRequest)`) which is invalid, so esbuild fails.

  * the resulting minified bundles are significantly bigger than the current bundles. This is
    because TS es5 downlevel is "looser" than babel for classes and for..of loops (see [TS
    output][3]) while babel outputs more code. To replicate TS output with babel, we can enable the
    `loose` mode for the classes and the `iterableIsArray` assumption. Sadly, it is not possible to
    simply enable both while using the `preset-env` plugin, because

    * it is not possible to enable `loose` mode [for a specific plugin][4]
    * enabling `loose` mode globally [disables the `iterableIsArray` assumption][5]

[1]: https://github.com/marvinhagemeister/karma-esbuild/issues/53
[2]: https://github.com/istanbuljs/babel-plugin-istanbul/issues/279
[3]: https://www.typescriptlang.org/play?target=1#code/MYGwhgzhAEBiD29oG8BQ1oCMwCcAUAlCgL6qmqoBm8O0ew8AdhAC7TVLyXQDaAukTQYyQA
[4]: https://github.com/babel/babel/issues/6978
[5]: https://github.com/babel/babel/issues/15018
