import React from 'react';
import { domRender } from '../index';

const PopupPage = () => {
  return (
    <div>
      <h1>Popup</h1>
      <p>This is the popup page of your Chrome extension.</p>
      <button onClick={() => {console.log("sdsdsdsd")}}>Click me!</button>
    </div>
  );
}

domRender(PopupPage);

export default PopupPage;