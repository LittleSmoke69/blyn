import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type CrmStage = "novo" | "contato" | "demo_agendada" | "proposta" | "ganho" | "perdido";
export type ActivityType = "nota" | "ligacao" | "whatsapp" | "email" | "reuniao" | "etapa" | "formulario" | "sistema";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  business_name: string | null;
  instagram: string | null;
  challenge: string | null;
  message: string | null;
  source: string;
  stage: CrmStage;
  position: number;
  estimated_value: number | null;
  assigned_to: string | null;
  account_user_id: string | null;
  next_follow_up: string | null;
  lost_reason: string | null;
  utm: Record<string, string> | null;
  last_activity_at: string;
  created_at: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  author_id: string | null;
  type: ActivityType;
  content: string;
  created_at: string;
}

export interface Task {
  id: string;
  lead_id: string | null;
  title: string;
  due_date: string | null;
  done: boolean;
  assigned_to: string | null;
  created_at: string;
  crm_leads?: { name: string; business_name: string | null } | null;
}

export interface TeamMember {
  user_id: string;
  email: string;
  name: string;
}

export const STAGES: { key: CrmStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo", color: "bg-blue-500" },
  { key: "contato", label: "Em contato", color: "bg-indigo-500" },
  { key: "demo_agendada", label: "Demo agendada", color: "bg-amber-500" },
  { key: "proposta", label: "Proposta", color: "bg-purple-500" },
  { key: "ganho", label: "Ganho", color: "bg-green" },
  { key: "perdido", label: "Perdido", color: "bg-red" },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<CrmStage, string>;

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  reuniao: "Reunião",
  etapa: "Mudança de etapa",
  formulario: "Formulário do site",
  sistema: "Sistema",
};

export const SOURCE_LABEL: Record<string, string> = {
  landing_hero: "Site · Agendar demo",
  landing_footer: "Site · Contato",
  landing: "Site",
  manual: "Cadastro manual",
  indicacao: "Indicação",
  instagram: "Instagram",
  evento: "Evento",
};

export const LEAD_SELECT =
  "id, name, email, whatsapp, business_name, instagram, challenge, message, source, stage, position, estimated_value, assigned_to, account_user_id, next_follow_up, lost_reason, utm, last_activity_at, created_at";

export function whatsappLink(phone: string, text = "") {
  let digits = phone.replace(/\D/g, "");
  if (digits.length <= 11) digits = `55${digits}`; // número nacional sem DDI
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Equipe interna (admins da plataforma) para atribuir leads e tarefas. */
export function useCrmTeam() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => {
    supabase.rpc("list_platform_admins").then(({ data }) => setTeam((data as TeamMember[]) ?? []));
  }, []);
  return team;
}
