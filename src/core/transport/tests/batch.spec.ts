import { expect, use } from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { Batch } from "../batch";

use(sinonChai);

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

    expect(transport.send).to.have.been.calledWith(
      sinon.match([
        {
          foo: "bar",
          message: "hello"
        }
      ])
    );
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

    expect(transport.send).to.have.been.calledWith(
      sinon.match([
        {
          foo: "bar",
          message: "1"
        },
        {
          foo: "bar",
          message: "2"
        },
        {
          foo: "bar",
          message: "3"
        }
      ])
    );
  });

  it("should flush when new message will overflow bytes limit", () => {
    batch.add({ message: "50 bytes - xxxxxxxxxxxxx" });
    expect(transport.send.notCalled).to.equal(true);

    batch.add({ message: "60 bytes - xxxxxxxxxxxxxxxxxxxxxxx" });
    expect(transport.send).to.have.been.calledWith(
      sinon.match([
        {
          foo: "bar",
          message: "50 bytes - xxxxxxxxxxxxx"
        }
      ])
    );

    batch.flush();
    expect(transport.send).to.have.been.calledWith(
      sinon.match([
        {
          foo: "bar",
          message: "60 bytes - xxxxxxxxxxxxxxxxxxxxxxx"
        }
      ])
    );
  });
});
