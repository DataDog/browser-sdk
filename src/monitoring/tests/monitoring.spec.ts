import * as chai from "chai";
import * as deepEqualInAnyOrder from "deep-equal-in-any-order";
import * as sinon from "sinon";
import { Configuration } from "../../core/configuration";
import { initMonitoring, monitor, monitored, resetMonitoring } from "../monitoring";

chai.use(deepEqualInAnyOrder);
const expect = chai.expect;

const configuration = {
  monitoringEndpoint: "http://localhot/monitoring"
};

describe("monitoring", () => {
  describe("decorator", () => {
    class Candidate {
      notMonitoredThrowing() {
        throw new Error("not monitored");
      }

      @monitored
      monitoredThrowing() {
        throw new Error("monitored");
      }

      @monitored
      monitoredNotThrowing() {
        return 1;
      }
    }

    let candidate: Candidate;
    beforeEach(() => {
      candidate = new Candidate();
    });

    describe("before initialisation", () => {
      it("should not monitor", () => {
        expect(() => candidate.notMonitoredThrowing()).to.throw("not monitored");
        expect(() => candidate.monitoredThrowing()).to.throw("monitored");
        expect(candidate.monitoredNotThrowing()).to.equal(1);
      });
    });

    describe("after initialisation", () => {
      beforeEach(() => {
        initMonitoring(configuration as Configuration);
      });

      afterEach(() => {
        resetMonitoring();
      });

      it("should preserve original behavior", () => {
        expect(candidate.monitoredNotThrowing()).to.equal(1);
      });

      it("should catch error", () => {
        expect(() => candidate.notMonitoredThrowing()).to.throw();
        expect(() => candidate.monitoredThrowing()).to.not.throw();
      });

      it("should report error", () => {
        const server = sinon.fakeServer.create();

        candidate.monitoredThrowing();

        expect(server.requests.length).to.equal(1);
        expect(server.requests[0].url).to.equal(configuration.monitoringEndpoint);

        expect(JSON.parse(server.requests[0].requestBody)).to.deep.equalInAnyOrder({
          http: {
            url: window.location.href,
            useragent: navigator.userAgent
          },
          message: "monitored"
        });

        server.restore();
      });
    });
  });

  describe("function", () => {
    const notThrowing = () => 1;
    const throwing = () => {
      throw new Error("error");
    };

    beforeEach(() => {
      initMonitoring(configuration as Configuration);
    });

    afterEach(() => {
      resetMonitoring();
    });

    it("should preserve original behavior", () => {
      const decorated = monitor(notThrowing);
      expect(decorated()).to.equal(1);
    });

    it("should catch error", () => {
      const decorated = monitor(throwing);
      expect(() => decorated()).to.not.throw();
    });

    it("should report error", () => {
      const server = sinon.fakeServer.create();

      monitor(throwing)();

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.equal(configuration.monitoringEndpoint);

      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equalInAnyOrder({
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "error"
      });

      server.restore();
    });
  });
});
