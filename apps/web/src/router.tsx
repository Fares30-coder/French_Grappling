import { createBrowserRouter, useParams } from 'react-router';
import { TechniquePage } from './features/techniques/TechniquePage';
import { HomePage } from './pages/HomePage';

// Keyed by slug so TechniquePage local state (current step...) resets when the technique changes.
function KeyedTechniquePage() {
  const { slug } = useParams();
  return <TechniquePage key={slug} />;
}

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/techniques/:slug', element: <KeyedTechniquePage /> },
]);
