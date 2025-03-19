import React from 'react';
import { domRender } from '../index';

const OptionsPage = () => {
  return (
    <div>
      <h1>Options</h1>
      <p>This is the options page of your Chrome extension.</p>
      <button onClick={() => {console.log("asas")}}>Click me!</button>
    </div>
  );
}

domRender(OptionsPage);

export default OptionsPage;
