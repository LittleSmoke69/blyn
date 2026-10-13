// Configuração e registro de uso da IA, compartilhados pelas Edge Functions.
// A chave da API mora em ai_settings (sem policy de RLS — só o service role lê);
// o painel admin gerencia tudo em /admin/ai.
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AiSettings {
  api_key: string | null;
  model: string;
  enabled: boolean;
  monthly_limit_per_account: number;
}

export async function loadAiSettings(admin: SupabaseClient): Promise<AiSettings> {
  const { data, error } = await admin
    .from("ai_settings")
    .select("api_key, model, enabled, monthly_limit_per_account")
    .single();
  if (error || !data) throw new Error("configuração de IA não encontrada");
  return data as AiSettings;
}

export function aiClient(settings: AiSettings): Anthropic {
  if (!settings.api_key) throw new Error("chave da API não configurada");
  return new Anthropic({ apiKey: settings.api_key, maxRetries: 2 });
}

/** Chamadas bem-sucedidas da conta no mês corrente (base do limite mensal). */
export async function monthlyUsage(admin: SupabaseClient, ownerId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("success", true)
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

export async function logUsage(
  admin: SupabaseClient,
  row: {
    owner_id: string | null;
    user_id: string | null;
    feature: string;
    model: string;
    input_tokens?: number;
    output_tokens?: number;
    success: boolean;
    error?: string | null;
  },
) {
  const { error } = await admin.from("ai_usage").insert(row);
  if (error) console.error("ai_usage insert falhou:", error.message);
}

/**
 * Mensagem curta e em português pro usuário, a partir dos erros tipados do SDK.
 * Nunca 502/503/504: o BunkerWeb intercepta esses códigos e troca o JSON por
 * uma página HTML, e o app perderia a mensagem. Falha da IA externa = 424.
 */
export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 424, message: "A chave da API de IA é inválida. Avise a equipe Blyn." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Muitas leituras ao mesmo tempo. Tente de novo em instantes." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: "Não foi possível ler esse arquivo. Envie uma foto mais nítida ou um PDF." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 424, message: "O serviço de IA está indisponível agora. Tente novamente." };
  }
  return { status: 500, message: err instanceof Error ? err.message : "falha inesperada na IA" };
}
