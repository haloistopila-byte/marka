import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter, useParams } from 'react-router-dom';
import { AppShell } from './app/App';
import { DashboardView } from './features/dashboard/DashboardView';
import { InvoiceFormView } from './features/invoice/InvoiceFormView';
import { SettingsView } from './features/settings/SettingsView';
import './index.css';

/** A new key per invoice number, so opening another invoice always starts from its saved data. */
function InvoiceRoute() {
  const { num } = useParams();
  return <InvoiceFormView key={num ?? 'baru'} />;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/dashboard', element: <DashboardView /> },
      { path: '/invoice/baru', element: <InvoiceRoute /> },
      { path: '/invoice/:num', element: <InvoiceRoute /> },
      { path: '/pengaturan', element: <SettingsView /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> }
    ]
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
