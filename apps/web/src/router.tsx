import { createBrowserRouter } from 'react-router';
import { TechniquePage } from './features/techniques/TechniquePage';
import { HomePage } from './pages/HomePage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/techniques/:slug', element: <TechniquePage /> },
]);
