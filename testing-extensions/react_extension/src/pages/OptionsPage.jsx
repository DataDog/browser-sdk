import React from 'react';
import { domRender } from '../index';
import { datadogRum } from '@datadog/browser-rum'

const OptionsPage = () => {
  return (
    <div>
      <h1>Options</h1>
      <p>This is the options page of your Chrome extension.</p>
      <button onClick={() => {console.log("asas")}}>Click me!</button>
      <TestButtons />
    </div>
  );
}

// Component for the test buttons
const TestButtons = () => {
  return (
    <div>
      <h1>Gotta click them all!</h1>
      <p><button id="throw-error" onClick={() => {
        const p = document.createElement("p");
        p.innerText = "An error is thrown after this";
        document.body.appendChild(p);
        throw new Error("Expected unhandled error");
      }}>Throw an error</button></p>
      
      <p><button id="throw-error-with-cause" onClick={() => {
        const p = document.createElement("p");
        p.innerText = "An error with cause is thrown after this";
        document.body.appendChild(p);
        throw new Error("Expected unhandled error with cause", {
          cause: new Error("Unhandled error cause"),
        });
      }}>Throw an error with cause</button></p>
      
      <p><button id="make-fetch-request" onClick={() => {
        fetch("/");
      }}>Make a fetch request</button></p>
      
      <p><button id="make-xhr-request" onClick={() => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "/");
        xhr.send();
      }}>Make a XHR request</button></p>
      
      <p><button id="change-route" onClick={() => {
        const newPath = location.pathname.endsWith("/index.html")
          ? "./"
          : "./index.html";
        history.pushState(null, "", `${newPath}${location.search}`);
      }}>Change route</button></p>
      
      <p><button id="stop-session" onClick={() => {
        datadogRum.stopSession();
      }}>Stop the session</button></p>
      
      <p><button id="display-image" onClick={() => {
        const image = document.createElement("img");
        image.src = "./bits.png";
        document.body.appendChild(image);
      }}>Display image</button></p>
      
      <p><button id="display-image-before-layout-shift" onClick={() => {
        setTimeout(() => {
          const image = document.createElement("img");
          image.src = "./bits.png";
          document.body.insertBefore(image, document.body.firstChild);
        }, 500);
      }}>Display image before (layout shift)</button></p>
      
      <p><button id="create-long-task" onClick={() => {
        const start = Date.now();
        // block for 200ms
        while (Date.now() - start < 200);
      }}>Create a long task</button></p>
      
      <p><button id="send-user-action" onClick={() => {
        datadogRum.addAction("checkout", {
          cart: {
            amount: 42,
            currency: "$",
            nb_items: 2,
            items: ["socks", "t-shirt"],
          },
        });
      }}>Send a user action</button></p>
      
      <p><button id="send-log" onClick={() => {
        datadogRum.logger.log(`A click occured at ${new Date()}`);
      }}>Send a log</button></p>
      
      <p><button id="send-foo-custom-timing" onClick={() => {
        datadogRum.addTiming("foo");
      }}>Send a foo custom timing</button></p>
      
      <p><button id="send-bar-custom-timing" onClick={() => {
        datadogRum.addTiming("bar");
      }}>Send a bar custom timing</button></p>
      
      <p><button id="start-view-question-mark" onClick={() => {
        datadogRum.startView("/browser-sdk-test-playground/?/view-name");
      }}>Start view with ? in view.name</button></p>
      
      <p><button id="generate-sensitive-data" onClick={() => {
        const SENSITIVE_MAIL = "mail@datadoghq.com";
        const SENSITIVE_MASTERCARD = "card_mastercard=5112986475536839";
        const SENSITIVE_VISA = "card_visa=4988 4388 4388 4305";
        const SENSITIVE_AMEX = "card_amex=3714 4963 5398 431";

        datadogRum.startView(`Your cart ${SENSITIVE_MAIL}`);

        datadogRum.addAction(
          `Click on the payment button to pay with ${SENSITIVE_MASTERCARD}`
        );
        datadogRum.addAction(
          `Click on the payment button to pay with ${SENSITIVE_VISA}`
        );
        datadogRum.addAction(
          `Click on the payment button to pay with ${SENSITIVE_AMEX}`
        );

        const error_mastercard = new Error(
          `${SENSITIVE_MAIL} could not pay with ${SENSITIVE_MASTERCARD}`
        );
        error_mastercard.stack = `Error: ${SENSITIVE_MASTERCARD} at http://path/to/file.js?${SENSITIVE_MASTERCARD}:47:22`;
        datadogRum.addError(error_mastercard);

        const error_visa = new Error(
          `${SENSITIVE_MAIL} could not pay with ${SENSITIVE_VISA}`
        );
        error_visa.stack = `Error: ${SENSITIVE_VISA} at http://path/to/file.js?${SENSITIVE_VISA}:47:22`;
        datadogRum.addError(error_visa);

        const error_amex = new Error(
          `${SENSITIVE_MAIL} could not pay with ${SENSITIVE_AMEX}`
        );
        error_amex.stack = `Error: ${SENSITIVE_AMEX} at http://path/to/file.js?${SENSITIVE_AMEX}:47:22`;
        datadogRum.addError(error_amex);

        fetch(`/?${SENSITIVE_MASTERCARD}`);
        fetch(`/?${SENSITIVE_VISA}`);
        fetch(`/?${SENSITIVE_AMEX}`);
      }}>Generate sensitive data</button></p>
      
      <p><button id="send-feature-flag" onClick={() => {
        datadogRum.addFeatureFlagEvaluation("foo", "bar");
      }}>Send a foo feature flag evaluation</button></p>
      
      <p><button id="send-foo-custom-duration-vital" onClick={() => {
        datadogRum.startDurationVital("foo");
        setTimeout(() => {
          datadogRum.stopDurationVital("foo");
        }, 1000);
      }}>Send a foo custom duration vital</button></p>
    </div>
  );
};

domRender(OptionsPage);

export default OptionsPage;