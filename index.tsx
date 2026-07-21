
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ParentPortal from './components/team/ParentPortal';
import './src/index.css';


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const parentPortalMatch = window.location.pathname.match(/^\/parent-portal\/([^/]+)$/);

root.render(
  <React.StrictMode>
    {parentPortalMatch
      ? <ParentPortal token={parentPortalMatch[1]} />
      : <App />
    }
  </React.StrictMode>
);
