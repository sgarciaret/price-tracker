import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

interface AlertsContextValue {
  unread: number;
  refresh: () => Promise<void>;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);

  const refresh = async () => {
    try {
      const alerts = await api.listAlerts();
      setUnread(alerts.filter((a) => !a.read_at).length);
    } catch {
      setUnread(0);
    }
  };

  useEffect(() => {
    setTimeout(() => refresh(), 0);
  }, []);

  return (
    <AlertsContext value={{ unread, refresh }}>
      {children}
    </AlertsContext>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider');
  return ctx;
}