import { APP_NAME } from '@tatamap/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <h1>{APP_NAME}</h1>
  </StrictMode>,
);
