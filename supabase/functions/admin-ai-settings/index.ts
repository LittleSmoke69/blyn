// Painel admin > IA: lê e grava a configuração da IA (ai_settings).
// A chave da API nunca volta para o navegador — só "tem chave" e os últimos 4
// caracteres. Liga/desliga de cada funcionalidade e o relatório de uso o painel
// faz direto pela RLS (ai_features / ai_usage têm policy de admin).
//
// Ações:
//   - get:    configuração atual (sem a chave)
//   - update: model, enabled, monthly_limit_per_account, api_key (nova) ou clear_key
//   - test:   confere a chave e o modelo consultando o modelo na API (não gasta tokens)
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { loadAiSettings } from "../_shared/ai.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { AdminAuthError, requireAdmin } from "../_shared/requireAdmin.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

interface Payload {
  action: "get" | "update" | "test";
  model?: string;
  enabled?: boolean;
  monthly_limit_per_account?: number;
  api_key?: string;
  clear_key?: boolean;
}

function publicView(s: { api_key: string | null; model: string; enabled: boolean; monthly_limit_per_account: number }) {
  return {
    model: s.model,
    enabled: s.enabled,
    monthly_limit_per_account: s.monthly_limit_per_account,
    has_key: !!s.api_key,
    key_hint: s.api_key ? `…${s.api_key.slice(-4)}` : null,
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "método não suportado" }, 405);

  let adminId: string;
  try {
    adminId = await requireAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) return jsonResponse({ error: err.message }, err.status);
    return jsonResponse({ error: "falha de autorização" }, 403);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const admin = getAdminClient();

  if (payload.action === "get") {
    return jsonResponse(publicView(await loadAiSettings(admin)));
  }

  if (payload.action === "update") {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: adminId };
    if (typeof payload.model === "string") {
      const model = payload.model.trim();
      if (!/^claude-[a-z0-9.-]+$/.test(model)) return jsonResponse({ error: "modelo inválido" }, 400);
      update.model = model;
    }
    if (typeof payload.enabled === "boolean") update.enabled = payload.enabled;
    if (payload.monthly_limit_per_account !== undefined) {
      const limit = Number(payload.monthly_limit_per_account);
      if (!Number.isInteger(limit) || limit < 0 || limit > 100000) {
        return jsonResponse({ error: "limite mensal deve ser um inteiro entre 0 e 100000" }, 400);
      }
      update.monthly_limit_per_account = limit;
    }
    if (payload.clear_key) update.api_key = null;
    else if (typeof payload.api_key === "string" && payload.api_key.trim()) {
      const key = payload.api_key.trim();
      if (!key.startsWith("sk-ant-") || key.length < 20) return jsonResponse({ error: "chave da API inválida" }, 400);
      update.api_key = key;
    }

    const { error } = await admin.from("ai_settings").update(update).eq("id", true);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse(publicView(await loadAiSettings(admin)));
  }

  if (payload.action === "test") {
    const settings = await loadAiSettings(admin);
    if (!settings.api_key) return jsonResponse({ ok: false, error: "nenhuma chave configurada" });
    try {
      const client = new Anthropic({ apiKey: settings.api_key, maxRetries: 1 });
      const model = await client.models.retrieve(settings.model);
      return jsonResponse({ ok: true, model: model.id, display_name: model.display_name });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return jsonResponse({ ok: false, error: "chave inválida ou revogada" });
      if (err instanceof Anthropic.NotFoundError) return jsonResponse({ ok: false, error: `modelo ${settings.model} não encontrado` });
      if (err instanceof Anthropic.APIError) return jsonResponse({ ok: false, error: `API respondeu ${err.status}` });
      return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "falha ao contatar a API" });
    }
  }

  return jsonResponse({ error: "action inválida" }, 400);
});
