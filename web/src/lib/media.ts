/** Foto ou vídeo da galeria de um prato (tabela recipe_media, bucket menu-media). */
export interface RecipeMedia {
  id: string;
  recipe_id: string;
  kind: "image" | "video";
  storage_path: string;
  url: string;
  caption: string | null;
  position: number;
}

export const MEDIA_BUCKET = "menu-media";
export const MAX_MEDIA_PER_RECIPE = 10;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MEDIA_SELECT = "id, recipe_id, kind, storage_path, url, caption, position";

const MAX_IMAGE_SIDE = 1600;

/**
 * Prepara o arquivo para upload: fotos grandes viram JPEG de no máximo 1600px
 * (GIF fica como está para não perder a animação); vídeo vai sem alteração.
 */
export async function prepareMediaFile(file: File): Promise<{ blob: Blob; kind: "image" | "video"; ext: string; contentType: string }> {
  if (VIDEO_TYPES.includes(file.type)) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: vídeo maior que 50 MB.`);
    const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
    return { blob: file, kind: "video", ext, contentType: file.type };
  }
  if (!file.type.startsWith("image/")) throw new Error(`${file.name}: formato não suportado. Use foto (JPG, PNG, WEBP) ou vídeo (MP4, WEBM, MOV).`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: foto maior que 10 MB.`);
  if (file.type === "image/gif") return { blob: file, kind: "image", ext: "gif", contentType: file.type };

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error(`${file.name}: não foi possível processar a foto.`);
  return { blob, kind: "image", ext: "jpg", contentType: "image/jpeg" };
}

/**
 * Corpo do upload para o Storage com o arquivo num campo NOMEADO. O
 * supabase-js, recebendo Blob/File, monta o multipart com o campo vazio
 * (name=""), que o ModSecurity do BunkerWeb não consegue ler e recusa com 400
 * ("Multipart parsing error"). Passando o FormData pronto, ele usa este.
 */
export function storageUploadBody(blob: Blob, filename: string, cacheControl = "31536000"): FormData {
  const form = new FormData();
  form.append("cacheControl", cacheControl);
  form.append("file", blob, filename);
  return form;
}
