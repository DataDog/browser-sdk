import { expect, use } from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { Batch, HttpRequest } from "../transport";

use(sinonChai);

describe("request", () => {
  const ENDPOINT_URL = "http://my.website";
  let server: sinon.SinonFakeServer;
  let request: HttpRequest;

  beforeEach(() => {
    server = sinon.fakeServer.create();
    request = new HttpRequest(ENDPOINT_URL);
  });

  afterEach(() => {
    server.restore();
  });

  it("should send object", () => {
    request.send({ foo: "bar" });

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.equal(ENDPOINT_URL);
  });

  it("should send string array", () => {
    request.send(['{"foo":"bar1"}', '{"foo":"bar2"}']);

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.equal(ENDPOINT_URL);
    expect(server.requests[0].requestBody).to.equal('{"foo":"bar1"}\n{"foo":"bar2"}');
  });
});

describe("batch", () => {
  const MAX_SIZE = 3;
  const BYTES_LIMIT = 100;
  const CONTEXT = { foo: "bar" };
  let batch: Batch;
  let transport: any;

  beforeEach(() => {
    transport = { send: () => ({}) };
    sinon.spy(transport, "send");

    batch = new Batch(transport, MAX_SIZE, BYTES_LIMIT, () => CONTEXT);
  });

  it("should add context to message", () => {
    batch.add({ message: "hello" });

    batch.flush();

    expect(transport.send).to.have.been.calledWith(['{"message":"hello","foo":"bar"}']);
  });

  it("should empty the batch after a flush", () => {
    batch.add({ message: "hello" });

    batch.flush();
    transport.send.resetHistory();
    batch.flush();

    expect(transport.send.notCalled).to.equal(true);
  });

  it("should flush when max size is reached", () => {
    batch.add({ message: "1" });
    batch.add({ message: "2" });
    batch.add({ message: "3" });

    expect(transport.send).to.have.been.calledWith([
      '{"message":"1","foo":"bar"}',
      '{"message":"2","foo":"bar"}',
      '{"message":"3","foo":"bar"}'
    ]);
  });

  it("should flush when new message will overflow bytes limit", () => {
    batch.add({ message: "50 bytes - xxxxxxxxxxxxx" });
    expect(transport.send.notCalled).to.equal(true);

    batch.add({ message: "60 bytes - xxxxxxxxxxxxxxxxxxxxxxx" });
    expect(transport.send).to.have.been.calledWith(['{"message":"50 bytes - xxxxxxxxxxxxx","foo":"bar"}']);

    batch.flush();
    expect(transport.send).to.have.been.calledWith(['{"message":"60 bytes - xxxxxxxxxxxxxxxxxxxxxxx","foo":"bar"}']);
  });

  it("should consider separator size when computing the size", () => {
    batch.add({ message: "30 b" }); // batch: 30 sep: 0
    batch.add({ message: "30 b" }); // batch: 60 sep: 1
    batch.add({ message: "39 bytes - xx" }); // batch: 99 sep: 2

    expect(transport.send).to.have.been.calledWith([
      '{"message":"30 b","foo":"bar"}',
      '{"message":"30 b","foo":"bar"}'
    ]);
  });
});
