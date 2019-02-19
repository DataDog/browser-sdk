import { expect } from "chai";
import { computeStackTrace, Handler, report } from "../tracekit";

describe("TraceKit", () => {
  describe("General", () => {
    it("should not remove anonymous functions from the stack", () => {
      // mock up an error object with a stack trace that includes both
      // named functions and anonymous functions
      const stack = `
  Error: 
    at new <anonymous> (http://example.com/js/test.js:63:1)
    at namedFunc0 (http://example.com/js/script.js:10:2)   
    at http://example.com/js/test.js:65:10                 
    at namedFunc2 (http://example.com/js/script.js:20:5)   
    at http://example.com/js/test.js:67:5                  
    at namedFunc4 (http://example.com/js/script.js:100001:10002)`;
      const mockErr: any = { stack };
      const stackFrames = computeStackTrace.computeStackTraceFromStackProp(mockErr)!;

      expect(stackFrames.stack[0].func).to.equal("new <anonymous>");
      expect(stackFrames.stack[0].url).to.equal("http://example.com/js/test.js");
      expect(stackFrames.stack[0].line).to.equal(63);
      expect(stackFrames.stack[0].column).to.equal(1);

      expect(stackFrames.stack[1].func).to.equal("namedFunc0");
      expect(stackFrames.stack[1].url).to.equal("http://example.com/js/script.js");
      expect(stackFrames.stack[1].line).to.equal(10);
      expect(stackFrames.stack[1].column).to.equal(2);

      expect(stackFrames.stack[2].func).to.equal("?");
      expect(stackFrames.stack[2].url).to.equal("http://example.com/js/test.js");
      expect(stackFrames.stack[2].line).to.equal(65);
      expect(stackFrames.stack[2].column).to.equal(10);

      expect(stackFrames.stack[3].func).to.equal("namedFunc2");
      expect(stackFrames.stack[3].url).to.equal("http://example.com/js/script.js");
      expect(stackFrames.stack[3].line).to.equal(20);
      expect(stackFrames.stack[3].column).to.equal(5);

      expect(stackFrames.stack[4].func).to.equal("?");
      expect(stackFrames.stack[4].url).to.equal("http://example.com/js/test.js");
      expect(stackFrames.stack[4].line).to.equal(67);
      expect(stackFrames.stack[4].column).to.equal(5);

      expect(stackFrames.stack[5].func).to.equal("namedFunc4");
      expect(stackFrames.stack[5].url).to.equal("http://example.com/js/script.js");
      expect(stackFrames.stack[5].line).to.equal(100001);
      expect(stackFrames.stack[5].column).to.equal(10002);
    });

    it("should handle eval/anonymous strings in Chrome 46", () => {
      const stack = `
ReferenceError: baz is not defined
   at bar (http://example.com/js/test.js:19:7)
   at foo (http://example.com/js/test.js:23:7)
   at eval (eval at <anonymous> (http://example.com/js/test.js:26:5)).to.equal(<anonymous>:1:26)
`;

      const mockErr: any = { stack };
      const stackFrames = computeStackTrace.computeStackTraceFromStackProp(mockErr)!;

      expect(stackFrames.stack[0].func).to.equal("bar");
      expect(stackFrames.stack[0].url).to.equal("http://example.com/js/test.js");
      expect(stackFrames.stack[0].line).to.equal(19);
      expect(stackFrames.stack[0].column).to.equal(7);

      expect(stackFrames.stack[1].func).to.equal("foo");
      expect(stackFrames.stack[1].url).to.equal("http://example.com/js/test.js");
      expect(stackFrames.stack[1].line).to.equal(23);
      expect(stackFrames.stack[1].column).to.equal(7);

      expect(stackFrames.stack[2].func).to.equal("eval");
      // TODO: fix nested evals
      expect(stackFrames.stack[2].url).to.equal("http://example.com/js/test.js");
      expect(stackFrames.stack[2].line).to.equal(26);
      expect(stackFrames.stack[2].column).to.equal(5);
    });
  });

  describe(".computeStackTrace", () => {
    it("should handle a native error object", () => {
      const ex = new Error("test");
      const stack = computeStackTrace(ex);
      expect(stack.name).to.equal("Error");
      expect(stack.message).to.equal("test");
    });

    it("should handle a native error object stack from Chrome", () => {
      const stackStr = `
Error: foo
    at <anonymous>:2:11
    at Object.InjectedScript._evaluateOn (<anonymous>:904:140)
    at Object.InjectedScript._evaluateAndWrap (<anonymous>:837:34)
    at Object.InjectedScript.evaluate (<anonymous>:693:21)`;
      const mockErr = {
        message: "foo",
        name: "Error",
        stack: stackStr
      };
      const stackFrames = computeStackTrace(mockErr);

      expect(stackFrames.stack[0].url).to.equal("<anonymous>");
    });
  });

  describe("error notifications", () => {
    const testMessage = "__mocha_ignore__";
    const testLineNo = 1337;

    let subscriptionHandler: Handler | undefined;

    describe("with undefined arguments", () => {
      it("should pass undefined:undefined", done => {
        // this is probably not good behavior;  just writing this test to verify
        // that it doesn't change unintentionally
        subscriptionHandler = (stack, isWindowError, error) => {
          expect(stack.name).to.equal(undefined);
          expect(stack.message).to.equal(undefined);
          done();
        };
        report.subscribe(subscriptionHandler);
        report.traceKitWindowOnError(undefined!, undefined, testLineNo);
      });
    });

    describe("when no 5th argument (error object)", () => {
      it("should separate name, message for default error types (e.g. ReferenceError)", done => {
        subscriptionHandler = (stack, isWindowError, error) => {
          expect(stack.name).to.equal("ReferenceError");
          expect(stack.message).to.equal("foo is undefined");
          done();
        };
        report.subscribe(subscriptionHandler);
        report.traceKitWindowOnError("ReferenceError: foo is undefined", "http://example.com", testLineNo);
      });

      it("should separate name, message for default error types (e.g. Uncaught ReferenceError)", done => {
        subscriptionHandler = (stack, isWindowError, error) => {
          expect(stack.name).to.equal("ReferenceError");
          expect(stack.message).to.equal("foo is undefined");
          done();
        };
        report.subscribe(subscriptionHandler);
        // should work with/without 'Uncaught'
        report.traceKitWindowOnError("Uncaught ReferenceError: foo is undefined", "http://example.com", testLineNo);
      });

      it("should separate name, message for default error types on Opera Mini", done => {
        subscriptionHandler = (stack, isWindowError, error) => {
          expect(stack.name).to.equal("ReferenceError");
          expect(stack.message).to.equal("Undefined variable: foo");
          done();
        };
        report.subscribe(subscriptionHandler);
        report.traceKitWindowOnError(
          "Uncaught exception: ReferenceError: Undefined variable: foo",
          "http://example.com",
          testLineNo
        );
      });

      it("should ignore unknown error types", done => {
        // TODO: should we attempt to parse this?
        subscriptionHandler = (stack, isWindowError, error) => {
          expect(stack.name).to.equal(undefined);
          expect(stack.message).to.equal("CustomError: woo scary");
          done();
        };
        report.subscribe(subscriptionHandler);
        report.traceKitWindowOnError("CustomError: woo scary", "http://example.com", testLineNo);
      });

      it("should ignore arbitrary messages passed through onerror", done => {
        subscriptionHandler = (stack, isWindowError, error) => {
          expect(stack.name).to.equal(undefined);
          expect(stack.message).to.equal("all work and no play makes homer: something something");
          done();
        };
        report.subscribe(subscriptionHandler);
        report.traceKitWindowOnError(
          "all work and no play makes homer: something something",
          "http://example.com",
          testLineNo
        );
      });
    });

    function testErrorNotification(
      collectWindowErrors: boolean,
      callOnError: boolean,
      numReports: number,
      done: Mocha.Done
    ) {
      let numDone = 0;

      subscriptionHandler = (stack, isWindowError, error) => {
        numDone += 1;
        if (numDone === numReports) {
          done();
        }
      };
      report.subscribe(subscriptionHandler);

      // report always throws an exception in order to trigger
      // window.onerror so it can gather more stack data. Mocha treats
      // uncaught exceptions as errors, so we catch it via assert.throws
      // here (and manually call window.onerror later if appropriate).
      //
      // We test multiple reports because TraceKit has special logic for when
      // report() is called a second time before either a timeout elapses or
      // window.onerror is called (which is why we always call window.onerror
      // only once below, after all calls to report()).
      for (let i = 0; i < numReports; i += 1) {
        const e = new Error("testing");
        expect(() => {
          report(e);
        }).to.throw(e);
      }
      // The call to report should work whether or not window.onerror is
      // triggered, so we parameterize it for the tests. We only call it
      // once, regardless of numReports, because the case we want to test for
      // multiple reports is when window.onerror is *not* called between them.
      if (callOnError) {
        report.traceKitWindowOnError(testMessage);
      }
    }

    [false, true].forEach(collectWindowErrors => {
      [false, true].forEach(callOnError => {
        [1, 2].forEach(numReports => {
          let title = "it should receive arguments from report() when";
          title += ` collectWindowErrors is ${collectWindowErrors}`;
          title += ` and callOnError is ${callOnError}`;
          title += ` and numReports is ${numReports}`;
          it(title, done => {
            testErrorNotification(collectWindowErrors, callOnError, numReports, done);
          });
        });
      });
    });
  });
});
