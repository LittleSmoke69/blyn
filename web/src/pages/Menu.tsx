import { ChefHat, Eye, EyeOff, Film, ImageOff, Images, Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MediaManager } from "../components/MediaManager";
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, PillTabs, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { RECIPE_CATEGORIES, formatBRL } from "../lib/format";
import type { RecipeMedia } from "../lib/media";
import { supabase } from "../lib/supabase";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  selling_price: number;
  image_url: string | null;
  is_active: boolean;
}

type StatusFilter = "all" | "active" | "inactive";

export function Menu() {
  const { can, ownerId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Quantidade de fotos/vídeos por prato (selos nos cards).
  const [mediaCount, setMediaCount] = useState<Map<string, { images: number; videos: number }>>(new Map());
  const [editingMedia, setEditingMedia] = useState<RecipeMedia[]>([]);
  const canEdit = can("menu.edit") || can("recipes.manage");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from("recipes")
      .select("id, name, category, description, selling_price, image_url, is_active")
      .order("name");
    if (error) setError(error.message);
    setItems(data ?? []);
    const { data: media } = await supabase.from("recipe_media").select("recipe_id, kind");
    const counts = new Map<string, { images: number; videos: number }>();
    for (const m of media ?? []) {
      const c = counts.get(m.recipe_id) ?? { images: 0, videos: 0 };
      if (m.kind === "video") c.videos++;
      else c.images++;
      counts.set(m.recipe_id, c);
    }
    setMediaCount(counts);
    setLoading(false);
    // Atalho vindo do Cardápio Digital: /menu?editar=<id> abre o prato direto.
    const target = searchParams.get("editar");
    if (target) {
      const item = (data ?? []).find((i) => i.id === target);
      if (item) openEdit(item);
      setSearchParams({}, { replace: true });
    }
  }

  const filtered = items.filter(
    (i) =>
      (status === "all" || (status === "active" ? i.is_active : !i.is_active)) &&
      i.name.toLowerCase().includes(search.toLowerCase())
  );

  // Agrupa na ordem do enum, que é a ordem natural de um cardápio.
  const grouped = useMemo(
    () =>
      RECIPE_CATEGORIES.map((c) => ({ category: c, items: filtered.filter((i) => i.category === c) })).filter(
        (g) => g.items.length > 0
      ),
    [filtered]
  );

  async function toggleActive(item: MenuItem) {
    setBusyId(item.id);
    const { error } = await supabase.from("recipes").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) setError(error.message);
    else setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
    setBusyId(null);
  }

  function openEdit(item: MenuItem) {
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setDescription(item.description ?? "");
    // Link externo só aparece no campo se não for uma foto da galeria.
    setImageUrl(item.image_url && !item.image_url.includes("/menu-media/") ? item.image_url : "");
    setEditingMedia([]);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    // Com foto na galeria, a capa é do banco (primeira foto); o link externo só
    // vale para prato sem fotos.
    const hasGalleryImage = editingMedia.some((m) => m.kind === "image");
    const { error } = await supabase
      .from("recipes")
      .update({
        name: name.trim(),
        category,
        description: description.trim() || null,
        ...(hasGalleryImage ? {} : { image_url: imageUrl.trim() || null }),
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setEditing(null);
    await load();
  }

  const activeCount = items.filter((i) => i.is_active).length;

  return (
    <div>
      <PageHeader
        title="Cardápio"
        subtitle={`${activeCount} de ${items.length} pratos ativos no cardápio`}
        action={
          can("recipes.view") && (
            <Link to="/recipes" className={secondaryButton}>
              Gerenciar fichas técnicas
            </Link>
          )
        }
      />

      <ErrorBanner message={error} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar prato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <PillTabs
          value={status}
          onChange={setStatus}
          options={[
            { key: "all", label: "Todos" },
            { key: "active", label: "Ativos" },
            { key: "inactive", label: "Inativos" },
          ]}
        />
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="Seu cardápio está vazio"
          description="Os pratos do cardápio vêm das fichas técnicas. Crie uma ficha para começar."
          action={
            can("recipes.view") && (
              <Link to="/recipes" className={primaryButton}>
                Ir para Fichas Técnicas
              </Link>
            )
          }
        />
      ) : grouped.length === 0 ? (
        <p className="text-muted text-sm">Nenhum prato encontrado.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.category}>
              <h2 className="text-sm uppercase tracking-wide text-muted mb-3">{group.category}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-card border border-border rounded-2xl overflow-hidden flex flex-col ${item.is_active ? "" : "opacity-60"}`}
                  >
                    <div className="relative h-36 bg-bg flex items-center justify-center">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-8 w-8 text-muted/50" />
                      )}
                      {mediaCount.get(item.id) && (
                        <span className="absolute right-2 top-2 flex items-center gap-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {mediaCount.get(item.id)!.images > 0 && (
                            <span className="flex items-center gap-1"><Images className="h-3 w-3" />{mediaCount.get(item.id)!.images}</span>
                          )}
                          {mediaCount.get(item.id)!.videos > 0 && (
                            <span className="flex items-center gap-1"><Film className="h-3 w-3" />{mediaCount.get(item.id)!.videos}</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{item.name}</p>
                        <p className="font-bold text-green-dark whitespace-nowrap">{formatBRL(Number(item.selling_price))}</p>
                      </div>
                      <p className="text-sm text-muted mt-1 line-clamp-2 flex-1">{item.description ?? "Sem descrição"}</p>
                      {canEdit && (
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => toggleActive(item)}
                            disabled={busyId === item.id}
                            className={`${secondaryButton} flex-1 ${item.is_active ? "" : "text-green-dark"}`}
                          >
                            {item.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            {item.is_active ? "Desativar" : "Ativar"}
                          </button>
                          <button onClick={() => openEdit(item)} className={secondaryButton} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <Modal title="Editar item do cardápio" onClose={() => { setEditing(null); load(); }} wide>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Nome">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Categoria">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {RECIPE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Descrição (aparece no cardápio digital)">
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </Field>
            {ownerId && (
              <div className="rounded-xl border border-border p-4">
                <MediaManager recipeId={editing.id} ownerId={ownerId} recipeName={name || editing.name} onChange={setEditingMedia} />
              </div>
            )}
            {!editingMedia.some((m) => m.kind === "image") && (
              <Field label="Ou link de uma imagem externa (usado enquanto o prato não tiver fotos)">
                <input type="url" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputClass} />
              </Field>
            )}
            <p className="text-xs text-muted">
              O preço ({formatBRL(Number(editing.selling_price))}) é calculado pela ficha técnica a partir do custo e da margem.
            </p>
            {formError && <p className="text-sm text-red">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setEditing(null); load(); }} className={secondaryButton}>Fechar</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
