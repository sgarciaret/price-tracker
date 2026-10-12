import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Alert } from '../api';
import { formatPrice, formatDate } from '../api';
import { AlertsProvider, useAlerts } from '../alerts';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';

function AlertsContent() {
  const { refresh } = useAlerts();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listAlerts();
      setAlerts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => load(), 0);
  }, []);

  const handleMarkRead = async (id: number) => {
    await api.markAlertRead(id);
    await load();
    refresh();
  };

  const handleMarkAllRead = async () => {
    await api.markAllAlertsRead();
    await load();
    refresh();
  };

  if (loading) {
    return <div className="text-center py-8">Cargando alertas…</div>;
  }

  if (alerts.length === 0) {
    return (
      <EmptyState>
        <svg className="w-12 h-12 mx-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="block mt-2 text-xl">Sin alertas</span>
        <p className="mt-1 text-slate-500">No hay alertas de precio. Configura un precio objetivo o un porcentaje de bajada en un producto para empezar a recibir avisos.</p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alertas de precio</h1>
        {alerts.some((a) => !a.read_at) && (
          <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
            Marcar todas como leídas
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <Card key={alert.id} className={alert.read_at ? '' : 'border-blue-200 bg-blue-50'}>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] items-start">
              <div>
                <Link to={`/products/${alert.product_id}`} className="font-medium hover:underline">
                  {alert.product_name ?? `Producto #${alert.product_id}`}
                </Link>
                <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
                  <span>
                    {alert.kind === 'target' ? '🎯 Objetivo alcanzado' : '📉 Bajada de precio'}
                  </span>
                  <span>
                    Precio: {formatPrice(alert.price, alert.currency ?? '—')}
                    {alert.price_converted != null && alert.currency !== alert.comparison_currency && (
                      <span className="text-slate-400"> ({formatPrice(alert.price_converted, alert.comparison_currency)})</span>
                    )}
                  </span>
                  {alert.kind === 'drop' && alert.baseline_converted != null && (
                    <span className="text-red-600">
                      Bajada: {((alert.baseline_converted - alert.price_converted) / alert.baseline_converted * 100).toFixed(1)}%
                    </span>
                  )}
                  {alert.kind === 'target' && alert.threshold_currency && (
                    <span className="text-amber-600">
                      Objetivo: {formatPrice(alert.threshold, alert.threshold_currency)}
                    </span>
                  )}
                  <time dateTime={alert.created_at} className="text-slate-400">
                    {formatDate(alert.created_at)}
                  </time>
                </div>
              </div>
              {!alert.read_at && (
                <Button size="sm" variant="secondary" onClick={() => handleMarkRead(alert.id)}>
                  Marcar leída
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AlertsPage() {
  return (
    <AlertsProvider>
      <AlertsContent />
    </AlertsProvider>
  );
}