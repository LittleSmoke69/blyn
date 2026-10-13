import { ArrowDown, ArrowUp, ExternalLink, FormInput, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBanner, Field, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

type FieldType = "text" | "email" | "tel" | "select" | "textarea";

interface FormFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  type: FieldType;
  required: boolean;
  half: boolean;
  options?: string[];
  system?: boolean;
}

interface SiteForm {
  id: string;
  title: string;
  subtitle: string | null;
  button_label: string;
  safe_note: string | null;
  fields: FormFieldConfig[];
  updated_at: string;
}

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  email: "E-mail",
  tel: "Telefone / WhatsApp",
  select: "Lista de opções",
};

// Chaves com significado especial no CRM: além de irem pras respostas, viram
// colunas próprias do lead (busca, filtros, card do kanban).
const CRM_COLUMN_HINT: Record<string, string> = {
  nome: "Nome do lead",
  email: "E-mail do lead",
  whatsapp: "WhatsApp do lead",
  delivery: "Delivery / empresa no CRM",
  instagram: "Instagram no CRM",
  desafio: "Etiqueta de desafio no card do CRM",
  mensagem: "Mensagem no CRM",
};

function slugify(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "campo"
  );
}

const LANDING_URL = "https://blynassessoria.com.br/";

export function AdminForms() {
  const [form, setForm] = useState<SiteForm | null>(null);
  const [saved, setSaved] = useState<SiteForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from("site_forms")
      .select("id, title, subtitle, button_label, safe_note, fields, updated_at")
      .eq("id", "hero")
      .maybeSingle();
    if (error) setError(error.message);
    else if (!data) setError("Formulário 'hero' não encontrado. Aplique a migration site_forms no banco.");
    setForm(data as SiteForm | null);
    setSaved(data as SiteForm | null);
  }

  if (!form) {
    return (
      <div>
        <PageHeader title="Formulário da landing" icon={FormInput} />
        <ErrorBanner message={error} />
        {!error && <p className="text-muted">Carregando...</p>}
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const fields = form.fields;
  const current = fields[selected];

  function patchForm(patch: Partial<SiteForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setMessage(null);
  }

  function patchField(index: number, patch: Partial<FormFieldConfig>) {
    patchForm({ fields: fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    patchForm({ fields: next });
    setSelected(target);
  }

  function addField() {
    let key = "nova_pergunta";
    for (let n = 2; fields.some((f) => f.key === key); n++) key = `nova_pergunta_${n}`;
    patchForm({
      fields: [...fields, { key, label: "Nova pergunta", placeholder: "Nova pergunta", type: "text", required: false, half: false }],
    });
    setSelected(fields.length);
  }

  function removeField(index: number) {
    if (fields[index].system) return;
    if (!confirm(`Remover a pergunta "${fields[index].label}"? Leads antigos continuam com a resposta salva.`)) return;
    patchForm({ fields: fields.filter((_, i) => i !== index) });
    setSelected(Math.max(0, index - 1));
  }

  function validate(): string | null {
    if (!form!.title.trim()) return "O título do formulário é obrigatório.";
    if (!form!.button_label.trim()) return "O texto do botão é obrigatório.";
    const keys = new Set<string>();
    for (const f of fields) {
      if (!f.label.trim()) return "Toda pergunta precisa de um rótulo.";
      if (!/^[a-z0-9_]+$/.test(f.key)) return `Identificador inválido em "${f.label}" (use letras minúsculas, números e _).`;
      if (keys.has(f.key)) return `Identificador repetido: "${f.key}".`;
      keys.add(f.key);
      if (f.type === "select" && !(f.options ?? []).filter((o) => o.trim()).length) return `"${f.label}" precisa de pelo menos uma opção.`;
    }
    const email = fields.find((f) => f.key === "email");
    const whatsapp = fields.find((f) => f.key === "whatsapp");
    if (!email?.required && !whatsapp?.required) return "E-mail ou WhatsApp precisa ser obrigatório — é por onde a equipe entra em contato.";
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: form!.title.trim(),
      subtitle: form!.subtitle?.trim() || null,
      button_label: form!.button_label.trim(),
      safe_note: form!.safe_note?.trim() || null,
      fields: fields.map((f) => ({
        ...f,
        label: f.label.trim(),
        placeholder: f.placeholder.trim() || f.label.trim(),
        options: f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
      })),
    };
    const { data, error } = await supabase
      .from("site_forms")
      .update(payload)
      .eq("id", form!.id)
      .select("id, title, subtitle, button_label, safe_note, fields, updated_at")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "falha ao salvar");
      return;
    }
    setForm(data as SiteForm);
    setSaved(data as SiteForm);
    setMessage("Salvo! A landing já usa a nova versão (recarregue a página do site).");
  }

  return (
    <div>
      <PageHeader
        title="Formulário da landing"
        subtitle="Perguntas e textos do formulário “Agendar demonstração” da hero section"
        icon={FormInput}
        action={
          <div className="flex gap-2">
            <a href={LANDING_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
              <ExternalLink className="h-4 w-4" /> Ver site
            </a>
            <button onClick={() => { setForm(saved); setError(null); }} disabled={!dirty} className={secondaryButton}>
              <RotateCcw className="h-4 w-4" /> Descartar
            </button>
            <button onClick={save} disabled={!dirty || saving} className={primaryButton}>
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Publicar"}
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} />
      {message && <div className="mb-6 rounded-xl border border-green/30 bg-green/5 text-green-dark text-sm p-4">{message}</div>}

      <div className="grid grid-cols-[1fr_420px] gap-6 items-start">
        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-5 grid grid-cols-2 gap-3">
            <h3 className="col-span-2 text-sm uppercase tracking-wide text-muted">Textos</h3>
            <Field label="Título" className="col-span-2">
              <input value={form.title} onChange={(e) => patchForm({ title: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Subtítulo" className="col-span-2">
              <textarea rows={2} value={form.subtitle ?? ""} onChange={(e) => patchForm({ subtitle: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Texto do botão">
              <input value={form.button_label} onChange={(e) => patchForm({ button_label: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Nota abaixo do botão">
              <input value={form.safe_note ?? ""} onChange={(e) => patchForm({ safe_note: e.target.value })} className={inputClass} />
            </Field>
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm uppercase tracking-wide text-muted">Perguntas</h3>
              <button onClick={addField} className={secondaryButton}>
                <Plus className="h-4 w-4" /> Nova pergunta
              </button>
            </div>

            <div className="grid grid-cols-[260px_1fr] gap-4">
              <ul className="space-y-1">
                {fields.map((f, i) => (
                  <li key={`${f.key}-${i}`}>
                    <div
                      onClick={() => setSelected(i)}
                      className={`flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer text-sm ${
                        i === selected ? "bg-green/10 text-green-dark font-semibold" : "hover:bg-bg"
                      }`}
                    >
                      <span className="flex-1 truncate">
                        {f.label}
                        {f.required && <span className="text-red"> *</span>}
                      </span>
                      {f.system && <Lock className="h-3.5 w-3.5 text-muted shrink-0" aria-label="Campo do sistema" />}
                      <button onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0} className="p-0.5 text-muted disabled:opacity-30" aria-label="Subir">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === fields.length - 1} className="p-0.5 text-muted disabled:opacity-30" aria-label="Descer">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {current && (
                <div className="border border-border rounded-xl p-4 grid grid-cols-2 gap-3 content-start">
                  <Field label="Pergunta (rótulo)" className="col-span-2">
                    <input
                      value={current.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        // Pergunta nova acompanha o rótulo no identificador e no placeholder até ser salva.
                        const isNew = !saved?.fields.some((f) => f.key === current.key);
                        patchField(selected, {
                          label,
                          ...(current.placeholder === current.label ? { placeholder: label } : {}),
                          ...(isNew && !current.system ? { key: uniqueKey(slugify(label), fields, selected) } : {}),
                        });
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Texto dentro do campo (placeholder)" className="col-span-2">
                    <input value={current.placeholder} onChange={(e) => patchField(selected, { placeholder: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Tipo de resposta">
                    <select
                      value={current.type}
                      disabled={current.system}
                      onChange={(e) => {
                        const type = e.target.value as FieldType;
                        patchField(selected, { type, options: type === "select" ? current.options ?? ["Opção 1", "Opção 2"] : undefined });
                      }}
                      className={inputClass}
                    >
                      {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Identificador">
                    <input value={current.key} readOnly className={`${inputClass} bg-bg font-mono text-xs`} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={current.required}
                      disabled={current.key === "nome"}
                      onChange={(e) => patchField(selected, { required: e.target.checked })}
                      className="accent-[var(--green)]"
                    />
                    Obrigatória
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={current.half} onChange={(e) => patchField(selected, { half: e.target.checked })} className="accent-[var(--green)]" />
                    Meia largura (lado a lado)
                  </label>

                  {current.type === "select" && (
                    <Field label="Opções (uma por linha)" className="col-span-2">
                      <textarea
                        rows={6}
                        value={(current.options ?? []).join("\n")}
                        onChange={(e) => patchField(selected, { options: e.target.value.split("\n") })}
                        className={inputClass}
                      />
                    </Field>
                  )}

                  <div className="col-span-2 flex items-center justify-between pt-2 border-t border-border">
                    <p className="text-xs text-muted">
                      {current.system
                        ? "Campo do sistema: pode ser renomeado, mas não removido."
                        : CRM_COLUMN_HINT[current.key]
                          ? `Também preenche: ${CRM_COLUMN_HINT[current.key]}.`
                          : "A resposta aparece na ficha do lead no CRM."}
                    </p>
                    {!current.system && (
                      <button onClick={() => removeField(selected)} className="text-sm text-red flex items-center gap-1 hover:underline">
                        <Trash2 className="h-4 w-4" /> Remover
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <p className="text-xs text-muted">Última publicação: {formatDateTime(saved?.updated_at ?? form.updated_at)}</p>
        </div>

        <FormPreview form={form} selectedKey={current?.key} onSelect={(key) => setSelected(fields.findIndex((f) => f.key === key))} />
      </div>
    </div>
  );
}

function uniqueKey(base: string, fields: FormFieldConfig[], ignoreIndex: number) {
  let key = base;
  for (let n = 2; fields.some((f, i) => i !== ignoreIndex && f.key === key); n++) key = `${base}_${n}`;
  return key;
}

/** Prévia com o visual escuro da landing (aproximado) — clique numa pergunta pra editar. */
function FormPreview({ form, selectedKey, onSelect }: { form: SiteForm; selectedKey?: string; onSelect: (key: string) => void }) {
  const rows: FormFieldConfig[][] = [];
  for (let i = 0; i < form.fields.length; i++) {
    const f = form.fields[i];
    const next = form.fields[i + 1];
    if (f.half && next?.half) {
      rows.push([f, next]);
      i++;
    } else rows.push([f]);
  }
  const box = (f: FormFieldConfig) => {
    const text = `${f.placeholder || f.label}${f.required ? " *" : ""}`;
    return (
      <button
        key={f.key}
        type="button"
        onClick={() => onSelect(f.key)}
        className={`w-full text-left rounded-full border px-5 py-3 text-[13px] text-white/55 bg-white/[0.03] transition ${
          f.type === "textarea" ? "rounded-2xl h-20 items-start" : ""
        } ${selectedKey === f.key ? "border-green ring-4 ring-green/20" : "border-white/15 hover:border-white/40"}`}
      >
        <span className="flex justify-between">
          <span className="truncate">{text}</span>
          {f.type === "select" && <span>▾</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="sticky top-6">
      <p className="text-xs uppercase tracking-wide text-muted mb-2">Prévia</p>
      <div className="rounded-[32px] bg-[#0b0f0d] border border-white/10 p-8 text-white shadow-xl">
        <h3 className="text-center text-xl leading-tight">{form.title || "Título"}</h3>
        {form.subtitle && <p className="text-center text-sm text-white/60 mt-2 mb-6 max-w-[300px] mx-auto">{form.subtitle}</p>}
        <div className="space-y-3">
          {rows.map((row, i) =>
            row.length === 2 ? (
              <div key={i} className="grid grid-cols-2 gap-3">{row.map(box)}</div>
            ) : (
              <div key={i}>{box(row[0])}</div>
            )
          )}
        </div>
        <div className="mt-4 rounded-full bg-green text-sidebar-bg text-center font-bold py-3">{form.button_label || "Enviar"}</div>
        {form.safe_note && <p className="text-center text-xs text-white/50 mt-4">{form.safe_note}</p>}
      </div>
    </div>
  );
}
