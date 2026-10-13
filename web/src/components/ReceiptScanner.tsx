import { AlertTriangle, Camera, FileText, Loader2, RotateCcw, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { formatBRL } from "../lib/format";
import { supabase } from "../lib/supabase";
import { Field, Modal, inputClass, primaryButton, secondaryButton } from "./ui";

export const EXPENSE_CATEGORIES = ["Fornecedores", "Funcionários", "Aluguel", "Utilidades", "Marketing", "Outros"];
export const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência", "Boleto"];

interface ScannedReceipt {
  is_receipt: boolean;
  supplier_name: string | null;
  supplier_tax_id: string | null;
  document_number: string | null;
  issue_date: string | null;
  total_amount: number | null;
  payment_method: string | null;
  category: string;
  description: string;
  items: { description: string; quantity: number | null; unit: string | null; total: number | null }[];
  confidence: "alta" | "media" | "baixa";
  notes: string | null;
}

const MAX_IMAGE_SIDE = 2000;

/** Reduz fotos grandes de celular (JPEG ~85%) antes de enviar; PDF vai como está. */
async function fileToPayload(file: File): Promise<{ file_base64: string; media_type: string }> {
  if (file.type === "application/pdf") {
    if (file.size > 5 * 1024 * 1024) throw new Error("PDF muito grande (máx. 5 MB).");
    return { file_base64: await readAsBase64(file), media_type: "application/pdf" };
  }
  if (!file.type.startsWith("image/")) throw new Error("Envie uma foto (JPG, PNG) ou um PDF.");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Não foi possível processar a imagem.");
  return { file_base64: await readAsBase64(blob), media_type: "image/jpeg" };
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(blob);
  });
}

async function invokeScan(payload: { file_base64: string; media_type: string }) {
  const { data, error } = await supabase.functions.invoke("scan-receipt", { body: payload });
  if (error) {
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) return { error: body.error as string };
    } catch {
      // resposta sem JSON
    }
    return { error: "Não foi possível ler a nota agora. Tente novamente." };
  }
  return { data: data as { receipt: ScannedReceipt; usage: { used: number; limit: number } } };
}

export function ReceiptScanner({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { ownerId } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"pick" | "reading" | "review">("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setStep("reading");
    try {
      const res = await invokeScan(await fileToPayload(file));
      if (res.error || !res.data) throw new Error(res.error);
      const r = res.data.receipt;
      if (!r.is_receipt) throw new Error("Esse arquivo não parece uma nota, cupom ou recibo de despesa.");
      setReceipt(r);
      setUsage(res.data.usage);
      const supplier = r.supplier_name && !r.description.toLowerCase().includes(r.supplier_name.toLowerCase())
        ? ` - ${r.supplier_name}`
        : "";
      const docNumber = r.document_number ? ` (nº ${r.document_number})` : "";
      setDescription(`${r.description}${supplier}${docNumber}`.slice(0, 200));
      setCategory(EXPENSE_CATEGORIES.includes(r.category) ? r.category : "Outros");
      setAmount(r.total_amount != null ? r.total_amount.toFixed(2) : "");
      setPaymentMethod(r.payment_method && PAYMENT_METHODS.includes(r.payment_method) ? r.payment_method : PAYMENT_METHODS[0]);
      if (r.issue_date && /^\d{4}-\d{2}-\d{2}$/.test(r.issue_date)) setDate(r.issue_date);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Falha ao ler a nota.");
      setStep("pick");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Informe o valor da despesa.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("financial_records").insert({
      user_id: ownerId,
      type: "expense",
      category,
      category_type: category === "Aluguel" ? "fixed" : "variable",
      description: description.trim() || null,
      amount: value,
      payment_method: paymentMethod,
      date,
    });
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <Modal title="Escanear nota de custo" onClose={onClose} wide={step === "review"}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

      {step === "pick" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Tire uma foto ou envie o PDF da nota fiscal, cupom ou recibo. A IA preenche o lançamento e você confere antes de salvar.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-xl border border-border p-5 hover:border-green hover:bg-green/5 text-center">
              <Camera className="h-7 w-7 mx-auto mb-2 text-green" />
              <p className="font-semibold text-sm">Tirar foto</p>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-border p-5 hover:border-green hover:bg-green/5 text-center">
              <Upload className="h-7 w-7 mx-auto mb-2 text-green" />
              <p className="font-semibold text-sm">Enviar arquivo</p>
              <p className="text-xs text-muted">JPG, PNG ou PDF</p>
            </button>
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
        </div>
      )}

      {step === "reading" && (
        <div className="py-10 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-green" />
          <p className="font-medium">Lendo a nota...</p>
          <p className="text-xs text-muted mt-1">{fileName}</p>
        </div>
      )}

      {step === "review" && receipt && (
        <form onSubmit={save} className="space-y-4">
          {(receipt.confidence !== "alta" || receipt.notes) && (
            <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {receipt.confidence !== "alta" && <strong>Confira os valores com atenção. </strong>}
                {receipt.notes}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Descrição" className="sm:col-span-2">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Valor (R$)">
              <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Data">
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Categoria">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Forma de pagamento">
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          {(receipt.supplier_name || receipt.supplier_tax_id) && (
            <p className="text-xs text-muted flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {receipt.supplier_name}
              {receipt.supplier_tax_id && ` · CNPJ/CPF ${receipt.supplier_tax_id}`}
            </p>
          )}

          {receipt.items.length > 0 && (
            <details className="rounded-xl border border-border">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium">{receipt.items.length} itens lidos da nota</summary>
              <table className="w-full text-xs">
                <tbody>
                  {receipt.items.map((it, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-1.5">{it.description}</td>
                      <td className="px-2 py-1.5 text-muted whitespace-nowrap">
                        {it.quantity != null ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : ""}
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{it.total != null ? formatBRL(it.total) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {error && <p className="text-sm text-red">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted">{usage && `Leitura ${usage.used} de ${usage.limit} neste mês`}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep("pick"); setReceipt(null); setError(null); }} className={secondaryButton}>
                <RotateCcw className="h-4 w-4" /> Outra nota
              </button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar despesa"}</button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
