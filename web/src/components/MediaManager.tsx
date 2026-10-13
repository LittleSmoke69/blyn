import { ArrowLeft, ArrowRight, Film, Loader2, Play, Star, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_MEDIA_PER_RECIPE, MEDIA_BUCKET, MEDIA_SELECT, VIDEO_TYPES, prepareMediaFile, storageUploadBody, type RecipeMedia } from "../lib/media";
import { supabase } from "../lib/supabase";
import { MediaViewer } from "./MediaViewer";

/**
 * Galeria de fotos e vídeos de um prato: envio de vários arquivos de uma vez,
 * legenda, ordem, capa e remoção. Grava direto (sem esperar o "Salvar" do
 * formulário): arquivo no bucket menu-media e linha em recipe_media. A capa
 * (recipes.image_url) é atualizada pelo banco = primeira foto da galeria.
 */
export function MediaManager({
  recipeId,
  ownerId,
  recipeName,
  onChange,
}: {
  recipeId: string;
  ownerId: string;
  recipeName: string;
  onChange?: (media: RecipeMedia[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<RecipeMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [recipeId]);

  function update(next: RecipeMedia[]) {
    setMedia(next);
    onChange?.(next);
  }

  async function load() {
    const { data, error } = await supabase
      .from("recipe_media")
      .select(MEDIA_SELECT)
      .eq("recipe_id", recipeId)
      .order("position")
      .order("created_at");
    if (error) setErrors([error.message]);
    update((data as RecipeMedia[]) ?? []);
    setLoading(false);
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = [...list];
    const free = MAX_MEDIA_PER_RECIPE - media.length;
    const problems: string[] = [];
    if (files.length > free) problems.push(`Cada prato pode ter até ${MAX_MEDIA_PER_RECIPE} fotos e vídeos; ${files.length - free} arquivo(s) ficaram de fora.`);
    const batch = files.slice(0, Math.max(0, free));
    setErrors([]);
    setUploading(batch.map((f) => f.name));

    let position = media.reduce((max, m) => Math.max(max, m.position), -1) + 1;
    const added: RecipeMedia[] = [];
    // Um por vez: vídeos grandes em paralelo disputariam a conexão do celular.
    for (const file of batch) {
      try {
        const prepared = await prepareMediaFile(file);
        const path = `${ownerId}/${recipeId}/${crypto.randomUUID()}.${prepared.ext}`;
        const { error: upError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, storageUploadBody(prepared.blob, `media.${prepared.ext}`), { contentType: prepared.contentType });
        if (upError) throw new Error(`${file.name}: ${upError.message}`);
        const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
        const { data, error } = await supabase
          .from("recipe_media")
          .insert({
            recipe_id: recipeId,
            user_id: ownerId,
            kind: prepared.kind,
            storage_path: path,
            url,
            position: position++,
            size_bytes: prepared.blob.size,
          })
          .select(MEDIA_SELECT)
          .single();
        if (error) {
          await supabase.storage.from(MEDIA_BUCKET).remove([path]);
          throw new Error(`${file.name}: ${error.message}`);
        }
        added.push(data as RecipeMedia);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name}: falha no envio.`);
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    }
    update([...media, ...added]);
    setErrors(problems);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(item: RecipeMedia) {
    if (!confirm(item.kind === "video" ? "Remover este vídeo?" : "Remover esta foto?")) return;
    setBusyId(item.id);
    const { error } = await supabase.from("recipe_media").delete().eq("id", item.id);
    if (error) {
      setErrors([error.message]);
    } else {
      await supabase.storage.from(MEDIA_BUCKET).remove([item.storage_path]);
      update(media.filter((m) => m.id !== item.id));
    }
    setBusyId(null);
  }

  /** Grava a ordem atual (posições 0..n) e devolve a lista. */
  async function saveOrder(next: RecipeMedia[]) {
    const ordered = next.map((m, i) => ({ ...m, position: i }));
    update(ordered);
    const changed = ordered.filter((m) => media.find((o) => o.id === m.id)?.position !== m.position);
    const results = await Promise.all(
      changed.map((m) => supabase.from("recipe_media").update({ position: m.position }).eq("id", m.id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setErrors([failed.error.message]);
      load();
    }
  }

  function move(index: number, delta: number) {
    const next = [...media];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    saveOrder(next);
  }

  function makeCover(index: number) {
    const next = [...media];
    const [item] = next.splice(index, 1);
    saveOrder([item, ...next]);
  }

  async function saveCaption(item: RecipeMedia, caption: string) {
    const value = caption.trim() || null;
    if (value === item.caption) return;
    const { error } = await supabase.from("recipe_media").update({ caption: value }).eq("id", item.id);
    if (error) setErrors([error.message]);
    else update(media.map((m) => (m.id === item.id ? { ...m, caption: value } : m)));
  }

  const coverId = media.find((m) => m.kind === "image")?.id;
  const full = media.length >= MAX_MEDIA_PER_RECIPE;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Fotos e vídeos <span className="text-muted font-normal">({media.length}/{MAX_MEDIA_PER_RECIPE})</span>
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={full || uploading.length > 0}
          className="flex items-center gap-1.5 rounded-lg border border-green px-3 py-1.5 text-sm font-semibold text-green-dark hover:bg-green/10 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> Adicionar
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={["image/jpeg", "image/png", "image/webp", "image/gif", ...VIDEO_TYPES].join(",")}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : media.length === 0 && uploading.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted hover:border-green hover:text-green-dark"
        >
          <Film className="h-6 w-6 mx-auto mb-2" />
          Envie fotos e vídeos do prato (vários de uma vez)
          <span className="block text-xs mt-1">Fotos até 10 MB · vídeos MP4, WEBM ou MOV até 50 MB</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {media.map((m, i) => (
            <div key={m.id} className={`rounded-xl border overflow-hidden bg-card ${busyId === m.id ? "opacity-50" : ""} ${m.id === coverId ? "border-green" : "border-border"}`}>
              <button type="button" onClick={() => setViewing(i)} className="relative block h-28 w-full bg-bg">
                {m.kind === "video" ? (
                  <>
                    <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-black/60 p-2 text-white"><Play className="h-4 w-4" /></span>
                    </span>
                  </>
                ) : (
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
                {m.id === coverId && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-green px-2 py-0.5 text-[10px] font-bold text-white">CAPA</span>
                )}
              </button>
              <div className="p-2 space-y-1.5">
                <input
                  defaultValue={m.caption ?? ""}
                  onBlur={(e) => saveCaption(m, e.target.value)}
                  placeholder="Legenda (opcional)"
                  maxLength={200}
                  className="w-full rounded-md border border-border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-green"
                />
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-muted disabled:opacity-30" aria-label="Mover para a esquerda">
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === media.length - 1} className="p-1 text-muted disabled:opacity-30" aria-label="Mover para a direita">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    {m.kind === "image" && m.id !== coverId && (
                      <button type="button" onClick={() => makeCover(i)} className="p-1 text-muted hover:text-green-dark" title="Usar como capa">
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => remove(m)} className="p-1 text-red" aria-label="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {uploading.map((name) => (
            <div key={name} className="rounded-xl border border-dashed border-border flex flex-col items-center justify-center h-40 text-xs text-muted p-2 text-center">
              <Loader2 className="h-5 w-5 animate-spin mb-2 text-green" />
              Enviando
              <span className="truncate w-full">{name}</span>
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-sm text-red space-y-0.5">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted">A primeira foto é a capa do prato. As alterações aqui são salvas na hora.</p>

      {viewing !== null && <MediaViewer title={recipeName} media={media} startIndex={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
