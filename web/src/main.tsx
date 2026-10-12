import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, RequireAuth, RequireGuest, useAuth } from './auth';
import { AlertsProvider, useAlerts } from './alerts';
import { Button } from './components/ui/Button';
import { Login } from './pages/Login';
import { ProductList } from './pages/ProductList';
import { ProductDetail } from './pages/ProductDetail';
import { AlertsPage } from './pages/Alerts';

function AlertsBadge() {
  const { unread, refresh } = useAlerts();

  if (unread === 0) return null;

  return (
    <Link
      to="/alerts"
      className="relative flex items-center gap-1 px-2 py-1 text-sm font-medium text-red-600 hover:text-red-700"
      onClick={refresh}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center">
        {unread > 99 ? '99+' : unread}
      </span>
    </Link>
  );
}

function Header() {
  const { status, logout } = useAuth();

  return (
    <header className="bg-surface shadow-header">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">Seguidor de precios</Link>
        <div className="flex items-center gap-3">
          <AlertsBadge />
          {status === 'authenticated' && (
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              Cerrar sesión
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertsProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-6">
            <Routes>
              <Route path="/login" element={<RequireGuest><Login /></RequireGuest>} />
              <Route path="/" element={<RequireAuth><ProductList /></RequireAuth>} />
              <Route path="/products/:id" element={<RequireAuth><ProductDetail /></RequireAuth>} />
              <Route path="/alerts" element={<RequireAuth><AlertsPage /></RequireAuth>} />
            </Routes>
          </main>
        </AlertsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);