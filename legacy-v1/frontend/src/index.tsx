import React from 'react';
import ReactDOM from 'react-dom/client';
// import './normalize.css';
import './sakura_default.css';
import './index.css';
import App from './App';
// import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

