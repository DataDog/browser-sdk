import React, { useState, useEffect, useCallback} from 'react';
import logo from './logo.svg';
import './App.css';

import { View } from './lib/rumEventsType'

const backgroundPageConnection = chrome.runtime.connect({ name: 'name' });

function App() {
  const [views, setViews] = useState<View[]>([]);

  const listener = useCallback((request) => {
    switch(request.type) {
      case 'views': 
        setViews(request.payload as View[])
        break;
      default:
        break;
    }
  }, []);


  useEffect(() => {
    backgroundPageConnection.onMessage.addListener(listener);    
    backgroundPageConnection.postMessage({ type: 'init' });

    const autoRefreshInterval = setInterval(() => {
      backgroundPageConnection.postMessage({ type: 'refreshViews' });
    }, 1000)

    return () => {
      clearInterval(autoRefreshInterval)
      backgroundPageConnection.onMessage.removeListener(listener)
    }
  }, [listener])

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>Refreshing every 1s</p>
        {views && (
          <>
            <p>
              views.length: {views.length}
            </p>
            {views.map((view: View) => (<p>View Id: {view.id} - version {view.documentVersion}</p>))}
          </>
        )}
      </header>
    </div>
  );
}

export default App;
