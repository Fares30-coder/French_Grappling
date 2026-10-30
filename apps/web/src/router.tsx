import { createBrowserRouter, Navigate, useParams } from 'react-router';
import { TechniquePage } from './features/techniques/TechniquePage';
import { HomePage } from './pages/HomePage';

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
  { path: '/', element: <HomePage /> },
  { path: '/techniques/:slug', element: <KeyedTechniquePage /> },
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
