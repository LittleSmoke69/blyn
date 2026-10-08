export interface ReportTable {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  /** linha de total opcional, renderizada em negrito */
  footer?: (string | number)[];
}

function escapeHtml(value: string | number) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Abre uma janela com o relatório formatado e dispara a impressão — o usuário
 * escolhe "Salvar como PDF". Evita uma lib de PDF pesada e mantém acentuação
 * e layout fiéis.
 */
export function exportPdf(title: string, subtitle: string, tables: ReportTable[]) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita pop-ups para gerar o PDF.");
    return;
  }
  const body = tables
    .map(
      (t) => `
      ${t.title ? `<h2>${escapeHtml(t.title)}</h2>` : ""}
      <table>
        <thead><tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${
            t.rows.length === 0
              ? `<tr><td colspan="${t.headers.length}" class="empty">Sem dados</td></tr>`
              : t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")
          }
        </tbody>
        ${t.footer ? `<tfoot><tr>${t.footer.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr></tfoot>` : ""}
      </table>`
    )
    .join("");

  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Barlow", system-ui, sans-serif; color: #0f1b16; margin: 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #32c489; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  p.sub { color: #6b7873; margin: 4px 0 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #f3f5f4; color: #6b7873; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
  th, td { padding: 7px 10px; border-bottom: 1px solid #e5e9e7; }
  tfoot td { font-weight: 700; border-top: 2px solid #0f1b16; }
  td.empty { text-align: center; color: #6b7873; }
  .brand { font-weight: 800; color: #178f5f; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
  <header><div><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(subtitle)}</p></div><span class="brand">Blyn</span></header>
  ${body}
  <script>window.onload = () => { window.print(); };</script>
</body></html>`);
  win.document.close();
}

/** CSV com BOM e ";" — abre direto no Excel em pt-BR com acentos corretos. */
export function exportCsv(filename: string, tables: ReportTable[]) {
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? v.toLocaleString("pt-BR") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  for (const t of tables) {
    if (t.title) lines.push(cell(t.title));
    lines.push(t.headers.map(cell).join(";"));
    for (const r of t.rows) lines.push(r.map(cell).join(";"));
    if (t.footer) lines.push(t.footer.map(cell).join(";"));
    lines.push("");
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
