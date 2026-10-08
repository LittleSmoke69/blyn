import { Check, Copy, Download, Eye, ImageOff, Palette } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner, PageHeader, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { RECIPE_CATEGORIES, formatBRL } from "../lib/format";
import { supabase } from "../lib/supabase";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  selling_price: number;
  image_url: string | null;
}

function publicMenuUrl(slug: string) {
  return `${window.location.origin}/cardapio/${slug}`;
}

export function DigitalMenu() {
  const { ownerId, can } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ownerId) load(ownerId);
  }, [ownerId]);

  async function load(owner: string) {
    const [settingsRes, recipesRes] = await Promise.all([
      supabase.from("restaurant_settings_public").select("slug").eq("user_id", owner).maybeSingle(),
      supabase
        .from("recipes")
        .select("id, name, category, description, selling_price, image_url")
        .eq("is_active", true)
        .order("name"),
    ]);
    if (settingsRes.error) setError(settingsRes.error.message);
    const s = settingsRes.data?.slug ?? null;
    setSlug(s);
    setItems(recipesRes.data ?? []);
    if (s) {
      setQr(await QRCode.toDataURL(publicMenuUrl(s), { width: 480, margin: 2, color: { dark: "#0b120f", light: "#ffffff" } }));
    }
    setLoading(false);
  }

  const grouped = useMemo(
    () =>
      RECIPE_CATEGORIES.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter(
        (g) => g.items.length > 0
      ),
    [items]
  );

  const url = slug ? publicMenuUrl(slug) : "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadQr() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `qrcode-cardapio-${slug}.png`;
    a.click();
  }

  return (
    <div>
      <PageHeader title="Cardápio Digital" subtitle="Configure e compartilhe seu cardápio online" />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-[1.1fr_1fr] gap-6 mb-6">
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="mx-auto h-48 w-48 rounded-2xl border border-border overflow-hidden flex items-center justify-center bg-white">
            {qr ? <img src={qr} alt="QR Code do cardápio" className="h-full w-full" /> : <span className="text-muted text-sm">{loading ? "Gerando..." : "—"}</span>}
          </div>
          <h3 className="text-lg mt-5">QR Code do Cardápio</h3>
          <p className="text-sm text-muted mb-5">Escaneie para visualizar o cardápio digital</p>

          <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
            <span className="flex-1 text-sm truncate text-left">{url || "..."}</span>
            <button onClick={copy} disabled={!url} className="p-1 text-muted hover:text-text" aria-label="Copiar link">
              {copied ? <Check className="h-4 w-4 text-green" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a href={url || undefined} target="_blank" rel="noreferrer" className={primaryButton}>
              <Eye className="h-4 w-4" /> Visualizar
            </a>
            <button onClick={downloadQr} disabled={!qr} className={secondaryButton}>
              <Download className="h-4 w-4" /> Baixar QR Code
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base mb-4">Estatísticas do Cardápio</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg rounded-xl p-4">
                <p className="text-2xl font-bold">{items.length}</p>
                <p className="text-sm text-muted">Pratos ativos</p>
              </div>
              <div className="bg-bg rounded-xl p-4">
                <p className="text-2xl font-bold">{grouped.length}</p>
                <p className="text-sm text-muted">Categorias</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base mb-1">Personalização</h3>
            <p className="text-sm text-muted mb-4">Configure logo, contato e horário de funcionamento exibidos no cardápio digital</p>
            <div className="grid grid-cols-2 gap-3">
              {can("settings.view") && (
                <Link to="/settings" className={secondaryButton}>
                  <Palette className="h-4 w-4" /> Dados do restaurante
                </Link>
              )}
              {can("menu.view") && (
                <Link to="/menu" className={secondaryButton}>
                  Escolher pratos
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-base mb-4">Prévia do Cardápio</h3>
        {grouped.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted">Nenhum prato ativo encontrado</p>
            <p className="text-sm text-muted">Cadastre receitas e ative-as para aparecerem no cardápio</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.category}>
                <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-2">{g.category}</p>
                <div className="grid grid-cols-2 gap-3">
                  {g.items.map((item) => (
                    <div key={item.id} className="flex gap-3 border border-border rounded-xl p-3">
                      <div className="h-16 w-16 rounded-lg bg-bg overflow-hidden flex items-center justify-center shrink-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-5 w-5 text-muted/50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{item.name}</p>
                          <p className="text-sm font-bold text-green-dark whitespace-nowrap">{formatBRL(Number(item.selling_price))}</p>
                        </div>
                        <p className="text-xs text-muted line-clamp-2">{item.description ?? ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
