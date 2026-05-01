import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App.jsx';
import { PRIVY_APP_ID, privyConfig, isPrivyConfigured } from './lib/privy.js';
import './index.css';

if (!isPrivyConfigured()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[2in] VITE_PRIVY_APP_ID is not set — login will be disabled. ' +
      'Add it to web/.env to enable Privy auth.',
  );
}

const Root = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isPrivyConfigured() ? (
      <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
        <Root />
      </PrivyProvider>
    ) : (
      <Root />
    )}
  </React.StrictMode>,
);
