import * as chai from "chai";
import * as deepEqualInAnyOrder from "deep-equal-in-any-order";
import * as sinon from "sinon";
import { loggerModule } from "../logger.module";
import { LOG_LEVELS } from "../logLevel";

chai.use(deepEqualInAnyOrder);
const expect = chai.expect;

describe("logger module", () => {
  const configuration: any = {
    logsEndpoint: "https://localhost/log"
  };

  beforeEach(() => {
    loggerModule(configuration);
  });

  describe("request", () => {
    it("should send the needed data", () => {
      const server = sinon.fakeServer.create();

      window.Datadog.log("message", { foo: "bar" }, "severity");

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.equal(configuration.logsEndpoint);
      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equalInAnyOrder({
        foo: "bar",
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "message",
        severity: "severity"
      });
      server.restore();
    });
  });

  describe("log method", () => {
    it("'log' should have info severity by default", () => {
      const server = sinon.fakeServer.create();

      window.Datadog.log("message");

      expect(JSON.parse(server.requests[0].requestBody).severity).to.equal("info");
      server.restore();
    });

    LOG_LEVELS.forEach(logLevel => {
      it(`'${logLevel}' should have ${logLevel} severity`, () => {
        const server = sinon.fakeServer.create();

        (window.Datadog as any)[logLevel]("message");

        expect(JSON.parse(server.requests[0].requestBody).severity).to.equal(logLevel);
        server.restore();
      });
    });
  });

  describe("global context", () => {
    it("should be added to the request", () => {
      const server = sinon.fakeServer.create();

      window.Datadog.setGlobalContext({ bar: "foo" });
      window.Datadog.log("message");

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal("foo");
      server.restore();
    });

    it("should be updatable", () => {
      const server = sinon.fakeServer.create();

      window.Datadog.setGlobalContext({ bar: "foo" });
      window.Datadog.log("first");
      window.Datadog.setGlobalContext({ foo: "bar" });
      window.Datadog.log("second");

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal("foo");
      expect(JSON.parse(server.requests[1].requestBody).foo).to.equal("bar");
      expect(JSON.parse(server.requests[1].requestBody).bar).to.be.undefined;
      server.restore();
    });
  });
});
