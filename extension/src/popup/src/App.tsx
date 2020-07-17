import React, { useState, useEffect, useCallback } from 'react';
import logo from './bits48.png';
import './App.css';
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';

import {ViewDetail } from './lib/rumEventsType'

const backgroundPageConnection = chrome.runtime.connect({ name: 'name' });

export default function App() {
  const [viewDetails, setViewDetail] = useState<ViewDetail[]>([]);

  const listener = useCallback((request) => {
    switch(request.type) {
      case 'viewDetails': 
      setViewDetail(request.payload as ViewDetail[])
        break;
      default:
        break;
    }
  }, []);


  useEffect(() => {
    backgroundPageConnection.onMessage.addListener(listener);    
    backgroundPageConnection.postMessage({ type: 'init' });

    const autoRefreshInterval = setInterval(() => {
      backgroundPageConnection.postMessage({ type: 'refreshViewDetails' });
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
        
        {ViewDetailsComponent(viewDetails)}
        <p>Refreshing every 1s</p>
      </header>
    </div>
  );
}

function ViewDetailsComponent(viewDetails: ViewDetail[]){
  if(viewDetails){
    return (viewDetails && (
      <Accordion className="App-view-accordion">
        {viewDetails.map((viewDetail: ViewDetail) => {
        return (<ViewDetailComponent key={viewDetail.id} viewDetail={viewDetail}/>);
      
      })}
      </Accordion>
      )
    )
  }

  return <></>
}

interface ViewDetailComponentProps{
  viewDetail: ViewDetail;
}

function ViewDetailComponent({viewDetail}: ViewDetailComponentProps){
  return (
    <Card className="App-view-card">
      <Accordion.Toggle as={Card.Header} eventKey={viewDetail.id} className="App-view-card-header">
         {viewDetail.description}
        </Accordion.Toggle>
      <Accordion.Collapse eventKey={viewDetail.id}>
        <Card.Body className="App-view-card-body">
          <>{viewDetail.description}</>
        </Card.Body>
      </Accordion.Collapse>
  </Card>
  )
}
