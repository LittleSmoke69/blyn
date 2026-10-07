import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const message = await signIn(email, password);
    setLoading(false);
    if (message) setError(message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/logo-blyn-preta.png" alt="Blyn" className="h-10 w-auto object-contain" />
        </div>
        <div className="bg-card border border-border rounded-2xl p-8">
          <h1 className="text-xl mb-1">Bem-vindo de volta</h1>
          <p className="text-muted text-sm mb-6">Entre para acessar seu restaurante</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green"
              />
            </div>

            {error && <p className="text-sm text-red">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green text-white font-semibold py-2.5 text-sm hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
