import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { MapsNavToastHost } from './components/MapsNavToastHost';
import { DeepLinkNativoBridge } from './components/DeepLinkNativoBridge';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DeepLinkNativoBridge />
        <MapsNavToastHost />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);