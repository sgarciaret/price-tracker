import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, RequireAuth, RequireGuest, useAuth } from './auth';
import { Button } from './components/ui/Button';
import { Login } from './pages/Login';
import { ProductList } from './pages/ProductList';
import { ProductDetail } from './pages/ProductDetail';

function Header() {
  const { status, logout } = useAuth();

  return (
    <header className="bg-surface shadow-header">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">Seguidor de precios</Link>
        {status === 'authenticated' && (
          <Button variant="secondary" size="sm" onClick={() => void logout()}>
            Cerrar sesión
          </Button>
        )}
      </div>
    </header>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-6">
          <Routes>
            <Route path="/login" element={<RequireGuest><Login /></RequireGuest>} />
            <Route path="/" element={<RequireAuth><ProductList /></RequireAuth>} />
            <Route path="/products/:id" element={<RequireAuth><ProductDetail /></RequireAuth>} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
