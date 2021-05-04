export const OPERA_854 = {
  message: `Statement on line 44: Type mismatch (usually a non-object value used where an object is required)
Backtrace:
  Line 44 of linked script http://path/to/file.js
    this.undef();
  Line 31 of linked script http://path/to/file.js
    ex = ex || this.createException();
  Line 18 of linked script http://path/to/file.js
    var p = new printStackTrace.implementation(), result = p.run(ex);
  Line 4 of inline#1 script in http://path/to/file.js
    printTrace(printStackTrace());
  Line 7 of inline#1 script in http://path/to/file.js
    bar(n - 1);
  Line 11 of inline#1 script in http://path/to/file.js
    bar(2);
  Line 15 of inline#1 script in http://path/to/file.js
    foo();
`,
  'opera#sourceloc': 44,
}

export const OPERA_902 = {
  message: `Statement on line 44: Type mismatch (usually a non-object value used where an object is required)
Backtrace:
  Line 44 of linked script http://path/to/file.js
    this.undef();
  Line 31 of linked script http://path/to/file.js
    ex = ex || this.createException();
  Line 18 of linked script http://path/to/file.js
    var p = new printStackTrace.implementation(), result = p.run(ex);
  Line 4 of inline#1 script in http://path/to/file.js
    printTrace(printStackTrace());
  Line 7 of inline#1 script in http://path/to/file.js
    bar(n - 1);
  Line 11 of inline#1 script in http://path/to/file.js
    bar(2);
  Line 15 of inline#1 script in http://path/to/file.js
    foo();
`,
  'opera#sourceloc': 44,
}

export const OPERA_927 = {
  message: `Statement on line 43: Type mismatch (usually a non-object value used where an object is required)
Backtrace:
  Line 43 of linked script http://path/to/file.js
    bar(n - 1);
  Line 31 of linked script http://path/to/file.js
    bar(2);
  Line 18 of linked script http://path/to/file.js
    foo();
`,
  'opera#sourceloc': 43,
}

export const OPERA_964 = {
  message: `Statement on line 42: Type mismatch (usually non-object value supplied where object required)
Backtrace:
  Line 42 of linked script http://path/to/file.js
                this.undef();
  Line 27 of linked script http://path/to/file.js
            ex = ex || this.createException();
  Line 18 of linked script http://path/to/file.js: In function printStackTrace
        var p = new printStackTrace.implementation(), result = p.run(ex);
  Line 4 of inline#1 script in http://path/to/file.js: In function bar
             printTrace(printStackTrace());
  Line 7 of inline#1 script in http://path/to/file.js: In function bar
           bar(n - 1);
  Line 11 of inline#1 script in http://path/to/file.js: In function foo
           bar(2);
  Line 15 of inline#1 script in http://path/to/file.js
         foo();
`,
  'opera#sourceloc': 42,
  stacktrace: `  ...  Line 27 of linked script http://path/to/file.js
            ex = ex || this.createException();
  Line 18 of linked script http://path/to/file.js: In function printStackTrace
        var p = new printStackTrace.implementation(), result = p.run(ex);
  Line 4 of inline#1 script in http://path/to/file.js: In function bar
             printTrace(printStackTrace());
  Line 7 of inline#1 script in http://path/to/file.js: In function bar
           bar(n - 1);
  Line 11 of inline#1 script in http://path/to/file.js: In function foo
           bar(2);
  Line 15 of inline#1 script in http://path/to/file.js
         foo();
`,
}

export const OPERA_10 = {
  message: 'Statement on line 42: Type mismatch (usually non-object value supplied where object required)',
  'opera#sourceloc': 42,
  stacktrace: `  Line 42 of linked script http://path/to/file.js
                this.undef();
  Line 27 of linked script http://path/to/file.js
            ex = ex || this.createException();
  Line 18 of linked script http://path/to/file.js: In function printStackTrace
        var p = new printStackTrace.implementation(), result = p.run(ex);
  Line 4 of inline#1 script in http://path/to/file.js: In function bar
             printTrace(printStackTrace());
  Line 7 of inline#1 script in http://path/to/file.js: In function bar
           bar(n - 1);
  Line 11 of inline#1 script in http://path/to/file.js: In function foo
           bar(2);
  Line 15 of inline#1 script in http://path/to/file.js
         foo();
`,
}

export const OPERA_11 = {
  message: "'this.undef' is not a function",
  stack: `<anonymous function: run>([arguments not available])@http://path/to/file.js:27
bar([arguments not available])@http://domain.com:1234/path/to/file.js:18
foo([arguments not available])@http://domain.com:1234/path/to/file.js:11
<anonymous function>@http://path/to/file.js:15
Error created at <anonymous function>@http://path/to/file.js:15`,
  stacktrace: `Error thrown at line 42, column 12 in <anonymous function: createException>() in http://path/to/file.js:
    this.undef();
called from line 27, column 8 in <anonymous function: run>(ex) in http://path/to/file.js:
    ex = ex || this.createException();
called from line 18, column 4 in printStackTrace(options) in http://path/to/file.js:
    var p = new printStackTrace.implementation(), result = p.run(ex);
called from line 4, column 5 in bar(n) in http://path/to/file.js:
    printTrace(printStackTrace());
called from line 7, column 4 in bar(n) in http://path/to/file.js:
    bar(n - 1);
called from line 11, column 4 in foo() in http://path/to/file.js:
    bar(2);
called from line 15, column 3 in http://path/to/file.js:
    foo();`,
}

export const OPERA_12 = {
  message: "Cannot convert 'x' to object",
  stack: `<anonymous function>([arguments not available])@http://localhost:8000/ExceptionLab.html:48
dumpException3([arguments not available])@http://localhost:8000/ExceptionLab.html:46
<anonymous function>([arguments not available])@http://localhost:8000/ExceptionLab.html:1`,
  stacktrace: `Error thrown at line 48, column 12 in <anonymous function>(x) in http://localhost:8000/ExceptionLab.html:
    x.undef();
called from line 46, column 8 in dumpException3() in http://localhost:8000/ExceptionLab.html:
    dumpException((function(x) {
called from line 1, column 0 in <anonymous function>(event) in http://localhost:8000/ExceptionLab.html:
    dumpException3();`,
}

export const OPERA_25 = {
  message: "Cannot read property 'undef' of null",
  name: 'TypeError',
  stack: `TypeError: Cannot read property 'undef' of null
    at http://path/to/file.js:47:22
    at foo (http://path/to/file.js:52:15)
    at bar (http://path/to/file.js:108:168)`,
}

export const CHROME_15 = {
  arguments: ['undef'],
  message: "Object #<Object> has no method 'undef'",
  stack: `TypeError: Object #<Object> has no method 'undef'
    at bar (http://path/to/file.js:13:17)
    at bar (http://path/to/file.js:16:5)
    at foo (http://path/to/file.js:20:5)
    at http://path/to/file.js:24:4`,
}

export const CHROME_36 = {
  message: 'Default error',
  name: 'Error',
  stack: `Error: Default error
    at dumpExceptionError (http://localhost:8080/file.js:41:27)
    at HTMLButtonElement.onclick (http://localhost:8080/file.js:107:146)
    at I.e.fn.(anonymous function) [as index] (http://localhost:8080/file.js:10:3651)`,
}

// can be generated when Webpack is built with { devtool: eval }
export const CHROME_XX_WEBPACK = {
  message: "Cannot read property 'error' of undefined",
  name: 'TypeError',
  stack: `TypeError: Cannot read property 'error' of undefined
   at TESTTESTTEST.eval(webpack:///./src/components/test/test.jsx?:295:108)
   at TESTTESTTEST.render(webpack:///./src/components/test/test.jsx?:272:32)
   at TESTTESTTEST.tryRender(webpack:///./~/react-transform-catch-errors/lib/index.js?:34:31)
   at TESTTESTTEST.proxiedMethod(webpack:///./~/react-proxy/modules/createPrototypeProxy.js?:44:30)`,
}

export const FIREFOX_3 = {
  fileName: 'http://127.0.0.1:8000/js/stacktrace.js',
  lineNumber: 44,
  message: 'this.undef is not a function',
  name: 'TypeError',
  stack: `()@http://127.0.0.1:8000/js/stacktrace.js:44
(null)@http://127.0.0.1:8000/js/stacktrace.js:31
printStackTrace()@http://127.0.0.1:8000/js/stacktrace.js:18
bar(1)@http://127.0.0.1:8000/js/file.js:13
bar(2)@http://127.0.0.1:8000/js/file.js:16
foo()@http://127.0.0.1:8000/js/file.js:20
@http://127.0.0.1:8000/js/file.js:24
`,
}

export const FIREFOX_7 = {
  fileName: 'file:///G:/js/stacktrace.js',
  lineNumber: 44,
  stack: `()@file:///G:/js/stacktrace.js:44
(null)@file:///G:/js/stacktrace.js:31
printStackTrace()@file:///G:/js/stacktrace.js:18
bar(1)@file:///G:/js/file.js:13
bar(2)@file:///G:/js/file.js:16
foo()@file:///G:/js/file.js:20
@file:///G:/js/file.js:24
`,
}

export const FIREFOX_14 = {
  fileName: 'http://path/to/file.js',
  lineNumber: 48,
  message: 'x is null',
  stack: `@http://path/to/file.js:48
dumpException3@http://path/to/file.js:52
onclick@http://path/to/file.js:1
`,
}

export const FIREFOX_31 = {
  columnNumber: 12,
  fileName: 'http://path/to/file.js',
  lineNumber: 41,
  message: 'Default error',
  name: 'Error',
  stack: `foo@http://path/to/file.js:41:13
bar@http://path/to/file.js:1:1
.plugin/e.fn[c]/<@http://path/to/file.js:1:1
`,
}

export const FIREFOX_43_EVAL = {
  columnNumber: 30,
  fileName: 'http://localhost:8080/file.js line 25 > eval line 2 > eval',
  lineNumber: 1,
  message: 'message string',
  stack: `baz@http://localhost:8080/file.js line 26 > eval line 2 > eval:1:30
foo@http://localhost:8080/file.js line 26 > eval:2:96
@http://localhost:8080/file.js line 26 > eval:4:18
speak@http://localhost:8080/file.js:26:17
@http://localhost:8080/file.js:33:9`,
}

// Internal errors sometimes thrown by Firefox
// More here: https://developer.mozilla.org/en-US/docs/Mozilla/Errors
//
// Note that such errors are instanceof "Exception", not "Error"
export const FIREFOX_44_NS_EXCEPTION = {
  columnNumber: 0,
  fileName: 'http://path/to/file.js',
  lineNumber: 703,
  message: '',
  name: 'NS_ERROR_FAILURE',
  result: 2147500037,
  stack: `[2]</Bar.prototype._baz/</<@http://path/to/file.js:703:28
App.prototype.foo@file:///path/to/file.js:15:2
bar@file:///path/to/file.js:20:3
@file:///path/to/index.html:23:1
`,
}

export const FIREFOX_50_RESOURCE_URL = {
  columnNumber: 16,
  fileName: 'resource://path/data/content/bundle.js',
  lineNumber: 5529,
  message: 'this.props.raw[this.state.dataSource].rows is undefined',
  name: 'TypeError',
  stack: `render@resource://path/data/content/bundle.js:5529:16
dispatchEvent@resource://path/data/content/vendor.bundle.js:18:23028
wrapped@resource://path/data/content/bundle.js:7270:25`,
}

export const SAFARI_6 = {
  line: 48,
  message: "'null' is not an object (evaluating 'x.undef')",
  sourceURL: 'http://path/to/file.js',
  stack: `@http://path/to/file.js:48
dumpException3@http://path/to/file.js:52
onclick@http://path/to/file.js:82
[native code]`,
}

export const SAFARI_7 = {
  line: 47,
  message: "'null' is not an object (evaluating 'x.undef')",
  name: 'TypeError',
  sourceURL: 'http://path/to/file.js',
  stack: `http://path/to/file.js:48:22
foo@http://path/to/file.js:52:15
bar@http://path/to/file.js:108:107`,
}

export const SAFARI_8 = {
  column: 22,
  line: 47,
  message: "null is not an object (evaluating 'x.undef')",
  name: 'TypeError',
  sourceURL: 'http://path/to/file.js',
  stack: `http://path/to/file.js:47:22
foo@http://path/to/file.js:52:15
bar@http://path/to/file.js:108:23`,
}

export const SAFARI_8_EVAL = {
  column: 18,
  line: 1,
  message: "Can't find variable: getExceptionProps",
  name: 'ReferenceError',
  stack: `eval code
eval@[native code]
foo@http://path/to/file.js:58:21
bar@http://path/to/file.js:109:91`,
}

export const IE_9 = {
  description: "Unable to get property 'undef' of undefined or null reference",
  message: "Unable to get property 'undef' of undefined or null reference",
}

export const IE_10 = {
  description: "Unable to get property 'undef' of undefined or null reference",
  message: "Unable to get property 'undef' of undefined or null reference",
  number: -2146823281, // eslint-disable-line id-denylist
  stack: `TypeError: Unable to get property 'undef' of undefined or null reference
   at Anonymous function (http://path/to/file.js:48:13)
   at foo (http://path/to/file.js:46:9)
   at bar (http://path/to/file.js:82:1)`,
}

export const IE_11 = {
  description: "Unable to get property 'undef' of undefined or null reference",
  message: "Unable to get property 'undef' of undefined or null reference",
  name: 'TypeError',
  number: -2146823281, // eslint-disable-line id-denylist
  stack: `TypeError: Unable to get property 'undef' of undefined or null reference
   at Anonymous function (http://path/to/file.js:47:21)
   at foo (http://path/to/file.js:45:13)
   at bar (http://path/to/file.js:108:1)`,
}

export const IE_11_EVAL = {
  description: "'getExceptionProps' is undefined",
  message: "'getExceptionProps' is undefined",
  name: 'ReferenceError',
  number: -2146823279, // eslint-disable-line id-denylist
  stack: `ReferenceError: 'getExceptionProps' is undefined
   at eval code (eval code:1:1)
   at foo (http://path/to/file.js:58:17)
   at bar (http://path/to/file.js:109:1)`,
}

export const CHROME_48_BLOB = {
  message: 'Error: test',
  name: 'Error',
  stack: `Error: test
    at Error (native)
    at s (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:31:29146)
    at Object.d [as add] (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:31:30039)
    at blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a:15:10978
    at blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:1:6911
    at n.fire (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:7:3019)
    at n.handle (blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379:7:2863)`,
}

export const CHROME_48_EVAL = {
  message: 'message string',
  name: 'Error',
  stack: `Error: message string
at baz (eval at foo (eval at speak (http://localhost:8080/file.js:21:17)), <anonymous>:1:30)
at foo (eval at speak (http://localhost:8080/file.js:21:17), <anonymous>:2:96)
at eval (eval at speak (http://localhost:8080/file.js:21:17), <anonymous>:4:18)
at Object.speak (http://localhost:8080/file.js:21:17)
at http://localhost:8080/file.js:31:13\n`,
}

export const PHANTOMJS_1_19 = {
  stack: `Error: foo
    at file:///path/to/file.js:878
    at foo (http://path/to/file.js:4283)
    at http://path/to/file.js:4287`,
}

/* eslint-disable max-len */
export const ANDROID_REACT_NATIVE = {
  message: 'Error: test',
  name: 'Error',
  stack: `Error: test
  at render(/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js:78:24)
  at _renderValidatedComponentWithoutOwnerOrContext(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:1050:29)
  at _renderValidatedComponent(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:1075:15)
  at renderedElement(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:484:29)
  at _currentElement(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:346:40)
  at child(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactReconciler.js:68:25)
  at children(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactMultiChild.js:264:10)
  at this(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js:74:41)\n`,
}
/* eslint-enable max-len */

export const ANDROID_REACT_NATIVE_PROD = {
  message: 'Error: test',
  name: 'Error',
  stack: `value@index.android.bundle:12:1917
onPress@index.android.bundle:12:2336
touchableHandlePress@index.android.bundle:258:1497
[native code]
_performSideEffectsForTransition@index.android.bundle:252:8508
[native code]
_receiveSignal@index.android.bundle:252:7291
[native code]
touchableHandleResponderRelease@index.android.bundle:252:4735
[native code]
u@index.android.bundle:79:142
invokeGuardedCallback@index.android.bundle:79:459
invokeGuardedCallbackAndCatchFirstError@index.android.bundle:79:580
c@index.android.bundle:95:365
a@index.android.bundle:95:567
v@index.android.bundle:146:501
g@index.android.bundle:146:604
forEach@[native code]
i@index.android.bundle:149:80
processEventQueue@index.android.bundle:146:1432
s@index.android.bundle:157:88
handleTopLevel@index.android.bundle:157:174
index.android.bundle:156:572
a@index.android.bundle:93:276
c@index.android.bundle:93:60
perform@index.android.bundle:177:596
batchedUpdates@index.android.bundle:188:464
i@index.android.bundle:176:358
i@index.android.bundle:93:90
u@index.android.bundle:93:150
_receiveRootNodeIDEvent@index.android.bundle:156:544
receiveTouches@index.android.bundle:156:918
value@index.android.bundle:29:3016
index.android.bundle:29:955
value@index.android.bundle:29:2417
value@index.android.bundle:29:927
[native code]`,
}

export const IOS_CAPACITOR = {
  stack: `capacitor://localhost/media/dist/bundle.js:34:99546
r@capacitor://localhost/media/dist/bundle.js:34:47950`,
}
