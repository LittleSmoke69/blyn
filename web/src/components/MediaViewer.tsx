import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecipeMedia } from "../lib/media";

/** Carrossel em tela cheia com as fotos e vídeos de um prato. */
export function MediaViewer({
  title,
  media,
  startIndex = 0,
  onClose,
}: {
  title: string;
  media: RecipeMedia[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const current = media[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(media.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold truncate">{title}</p>
        <button onClick={onClose} aria-label="Fechar" className="p-2">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-2 min-h-0" onClick={(e) => e.stopPropagation()}>
        {current.kind === "video" ? (
          <video key={current.id} src={current.url} controls playsInline autoPlay className="max-h-full max-w-full rounded-lg" />
        ) : (
          <img key={current.id} src={current.url} alt={current.caption ?? title} className="max-h-full max-w-full object-contain rounded-lg" />
        )}
        {index > 0 && (
          <button onClick={() => setIndex(index - 1)} aria-label="Anterior" className="absolute left-2 rounded-full bg-black/50 p-2">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < media.length - 1 && (
          <button onClick={() => setIndex(index + 1)} aria-label="Próximo" className="absolute right-2 rounded-full bg-black/50 p-2">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        {current.caption && <p className="text-sm mb-2">{current.caption}</p>}
        {media.length > 1 && (
          <div className="flex justify-center gap-1.5">
            {media.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setIndex(i)}
                aria-label={`Mídia ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
