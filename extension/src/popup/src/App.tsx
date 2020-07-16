import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';

import { View } from './lib/rumEventsType'

function App() {
  const [count, setCount] = useState(0);

  const [views, setViews] = useState<View[]>([]);

  const backgroundPageConnection = chrome.runtime.connect({
    name: 'name'
  });

  backgroundPageConnection.postMessage({
    type: 'hello',
  });

  backgroundPageConnection.onMessage.addListener((request) => {
    if(request.data){
      setCount(request.data)
    }
 
  });

  backgroundPageConnection.onMessage.addListener((request) => {
    if(request.views){
      setViews(request.views as View[])
    }

  });

  function refreshClick(){
    console.log('refreshClick refreshClick')
    backgroundPageConnection.postMessage({
      type: 'refreshViews',
    });
  }



  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <p>{count}</p>
        {views && (
          <>
            <p>
              views.length: {views.length}
            </p>
            {views.map((view: View) => (<p>View Id: {view.id}</p>))}
          </>
        )}
        <button type="button" onClick={refreshClick}>Refresh</button>
      </header>
    </div>
  );
}

export default App;
