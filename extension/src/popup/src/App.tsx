import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';

import { View } from './lib/rumEventsType'

function App() {
  const [count, setCount] = useState(0);

  const backgroundPageConnection = chrome.runtime.connect({
    name: 'name'
  });

  backgroundPageConnection.postMessage({
    type: 'hello',
  });

  backgroundPageConnection.onMessage.addListener((request) => {
    setCount(request.data)
  });


const currentViews : View[] = []

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <p>{count}</p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <p>
        currentViews.length: {currentViews.length}
        </p>
        {currentViews.map((view: View) => (<p>View Id: {view.id}</p>))}
      </header>
    </div>
  );
}

export default App;
