import * as chai from "chai";
import * as deepEqualInAnyOrder from "deep-equal-in-any-order";
import * as sinon from "sinon";
import { Configuration } from "../../core/configuration";
import { loggerModule } from "../logger.module";
import { LOG_LEVELS } from "../logLevel";

chai.use(deepEqualInAnyOrder);
const expect = chai.expect;

describe("logger module", () => {
  const configuration = {
    logsEndpoint: "https://localhost/log"
  };

  beforeEach(() => {
    loggerModule(configuration as Configuration);
  });

  it("should send log to logs endpoint", () => {
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

  LOG_LEVELS.forEach(logLevel => {
    it(`should send ${logLevel} to logs endpoint`, () => {
      const server = sinon.fakeServer.create();

      (window.Datadog as any)[logLevel]("message");

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.equal(configuration.logsEndpoint);

      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equalInAnyOrder({
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "message",
        severity: logLevel
      });

      server.restore();
    });
  });

  describe("global context", () => {
    it("should be added to the request", () => {
      const server = sinon.fakeServer.create();

      window.Datadog.setGlobalContext({ bar: "foo" });
      window.Datadog.log("message");

      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equalInAnyOrder({
        bar: "foo",
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "message",
        severity: "info"
      });

      server.restore();
    });

    it("should be updatable", () => {
      const server = sinon.fakeServer.create();

      window.Datadog.setGlobalContext({ bar: "foo" });
      window.Datadog.log("first");
      window.Datadog.setGlobalContext({ foo: "bar" });
      window.Datadog.log("second");

      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equalInAnyOrder({
        bar: "foo",
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "first",
        severity: "info"
      });
      expect(JSON.parse(server.requests[1].requestBody)).to.deep.equalInAnyOrder({
        foo: "bar",
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "second",
        severity: "info"
      });

      server.restore();
    });
  });
});
