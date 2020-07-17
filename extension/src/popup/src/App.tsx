import React, { useState, useEffect, useCallback } from 'react';
import logo from './bits48.png';
import './App.css';
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Table from 'react-bootstrap/Table';

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
        return (<ViewDetailCard key={viewDetail.id} viewDetail={viewDetail}/>);

      })}
      </Accordion>
      )
    )
  }

  return <></>
}

interface ViewDetailCardProps{
  viewDetail: ViewDetail;
}

function ViewDetailCard({viewDetail}: ViewDetailCardProps){
  return (
    <Card className="App-view-card">
      <Accordion.Toggle as={Card.Header} eventKey={viewDetail.id} className="App-view-card-header">
         {viewDetail.description} - {viewDetail.date}
        </Accordion.Toggle>
      <Accordion.Collapse eventKey={viewDetail.id}>
        <Card.Body className="App-view-card-body">
          <ViewDetailExpanded viewDetail={viewDetail}/>
        </Card.Body>
      </Accordion.Collapse>
  </Card>
  )
}


function ViewDetailExpanded({viewDetail}: ViewDetailCardProps){
  return (
  <Table striped bordered hover variant="dark">
    <thead>
      <tr>
        <th>Child event</th>
        <th>date</th>
      </tr>
    </thead>
    <tbody>
    {viewDetail && viewDetail.events && viewDetail.events.map((event: any) => {
      return (
        <tr>
          <td style={{color: event.color}}>{event.description.substring(0, 100)}</td>
          <td>{event.date}</td>
        </tr>
    )
    })}
    </tbody>
  </Table>
  )
}
