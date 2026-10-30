import { createBrowserRouter, Navigate, useParams } from 'react-router';
import { HomePage } from './features/home/HomePage';
import { PublicLayout } from './features/layout/PublicLayout';
import { LibraryPage } from './features/library/LibraryPage';
import { TechniquePage } from './features/techniques/TechniquePage';
import { MapPage, NotFoundPage, RouteErrorPage } from './pages/placeholders';

// Keyed by slug so TechniquePage local state (current step...) resets when the technique changes.
function KeyedTechniquePage() {
  const { slug } = useParams();
  return <TechniquePage key={slug} />;
}

// Dev-only pose preview (used by `pnpm pose:render`). `import.meta.env.DEV` is a build-time
// constant: the route and its lazy chunk do not exist in the production bundle.
const devRoutes = import.meta.env.DEV
  ? [
      {
        path: '/dev/pose-preview',
        lazy: async () => ({
          Component: (await import('./features/dev/PosePreviewPage')).PosePreviewPage,
        }),
      },
    ]
  : [];

// The admin is lazy-loaded: the editor and its 3D tools never weigh on the public bundle.
export const router = createBrowserRouter([
  {
    // Public pages share the dark shell; the pathless child keeps the shell around route errors.
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'bibliotheque', element: <LibraryPage /> },
          { path: 'techniques/:slug', element: <KeyedTechniquePage /> },
          { path: 'carte', element: <MapPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  ...devRoutes,
  {
    path: '/admin/login',
    lazy: async () => ({ Component: (await import('./features/admin/auth/LoginPage')).LoginPage }),
  },
  {
    path: '/admin',
    lazy: async () => ({
      Component: (await import('./features/admin/auth/RequireAdmin')).RequireAdmin,
    }),
    children: [
      {
        lazy: async () => ({
          Component: (await import('./features/admin/AdminLayout')).AdminLayout,
        }),
        children: [
          { index: true, element: <Navigate to="/admin/techniques" replace /> },
          {
            path: 'techniques',
            lazy: async () => ({
              Component: (await import('./features/admin/techniques/AdminTechniqueListPage'))
                .AdminTechniqueListPage,
            }),
          },
          {
            path: 'techniques/:id',
            lazy: async () => ({
              Component: (await import('./features/admin/editor/TechniqueEditorPage'))
                .TechniqueEditorPage,
            }),
          },
        ],
      },
    ],
  },
]);
