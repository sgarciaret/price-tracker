import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, setOnUnauthorized } from './api';

export type AuthStatus = 'checking' | 'authenticated' | 'guest';

export interface AuthContextValue {
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');

  useEffect(() => {
    // Un 401 de cualquier API (p. ej. sesión caducada) deja al usuario como invitado;
    // RequireAuth se encarga de mandarlo a /login en la siguiente renderización.
    setOnUnauthorized(() => setStatus('guest'));
    api
      .session()
      .then((s) => setStatus(s.authenticated ? 'authenticated' : 'guest'))
      .catch(() => setStatus('guest'));
    return () => setOnUnauthorized(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setStatus('guest');
  }, []);

  const value = useMemo(() => ({ status, login, logout }), [status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Protege las rutas de la app: sin sesión manda a /login conservando la ruta original. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <p className="text-slate-500">Comprobando sesión…</p>;
  if (status === 'guest') return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

/** La pantalla de /login solo se muestra sin sesión: con ella se vuelve a la ruta de origen (o /). */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  if (status === 'checking') return <p className="text-slate-500">Comprobando sesión…</p>;
  if (status === 'authenticated') return <Navigate to={from} replace />;
  return <>{children}</>;
}
