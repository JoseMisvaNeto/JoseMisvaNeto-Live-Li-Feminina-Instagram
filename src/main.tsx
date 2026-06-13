import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './ErrorBoundary';

// Global error handlers to catch unhandled promises or runtime errors
window.addEventListener('error', (event) => {
  console.error('Global erro capturado:', event.error || event.message);
  // Não impede a execução padrão para vermos no console do navegador,
  // mas loga claramente que foi capturado no nível global.
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Rejeição de Promise não tratada:', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
