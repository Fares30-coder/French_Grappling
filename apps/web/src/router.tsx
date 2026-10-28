import { createBrowserRouter, Navigate, useParams } from 'react-router';
import { TechniquePage } from './features/techniques/TechniquePage';
import { HomePage } from './pages/HomePage';

// Keyed by slug so TechniquePage local state (current step...) resets when the technique changes.
function KeyedTechniquePage() {
  const { slug } = useParams();
  return <TechniquePage key={slug} />;
}

// The admin is lazy-loaded: the editor and its 3D tools never weigh on the public bundle.
export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/techniques/:slug', element: <KeyedTechniquePage /> },
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
