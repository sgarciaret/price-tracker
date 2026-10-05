import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Al tener sesión, RequireGuest redirige a la ruta de origen (o a /).
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-6">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Acceso del administrador</h1>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Input
            id="admin-username"
            label="Admin Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <Input
            id="admin-password"
            label="Admin password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
