import { Building2, CheckCircle2, Crown, KeyRound, LogOut, Save, Shield, Upload, User, XCircle } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Field, Modal, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

interface Subscription {
  status: "trial" | "active" | "past_due" | "canceled" | "expired";
  plan: string;
  billing_cycle: "monthly" | "semiannual" | "annual";
  trial_end_date: string | null;
  expires_at: string | null;
}

const SUB_LABEL: Record<Subscription["status"], string> = {
  trial: "Teste Gratuito",
  active: "Ativo",
  past_due: "Pagamento pendente",
  canceled: "Cancelado",
  expired: "Expirado",
};

const CYCLE_LABEL: Record<Subscription["billing_cycle"], string> = {
  monthly: "mensal",
  semiannual: "semestral",
  annual: "anual",
};

function Section({ icon: Icon, title, subtitle, children, badge }: {
  icon: typeof User;
  title: string;
  subtitle: string;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-green/10 text-green-dark flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg flex items-center gap-2">{title} {badge}</h3>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function Settings() {
  const { session, ownerId, can, signOut, refreshProfile } = useAuth();
  const canManage = can("settings.manage");
  const isOwner = !!session && session.user.id === ownerId;
  const user = session?.user;

  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMessage, setPwMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    supabase
      .from("restaurant_settings")
      .select("restaurant_name, phone, address, opening_hours, email, logo_url")
      .eq("user_id", ownerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setMessage({ type: "err", text: error.message });
        if (!data) return;
        setRestaurantName(data.restaurant_name);
        setPhone(data.phone ?? "");
        setAddress(data.address ?? "");
        setOpeningHours(data.opening_hours ?? "");
        setEmail(data.email ?? "");
        setLogoUrl(data.logo_url);
      });
    // RLS de subscriptions só deixa o próprio dono ler.
    if (isOwner) {
      supabase
        .from("subscriptions")
        .select("status, plan, billing_cycle, trial_end_date, expires_at")
        .maybeSingle()
        .then(({ data }) => setSubscription(data));
    }
  }, [ownerId, isOwner]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!ownerId) return;
    setSaving(true);
    setMessage(null);
    const payload = {
      restaurant_name: restaurantName.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      opening_hours: openingHours.trim() || null,
      email: email.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("restaurant_settings").update(payload).eq("user_id", ownerId);
    if (!error && isOwner) {
      // profiles guarda a identidade privada do dono; mantém o nome em sincronia.
      await supabase
        .from("profiles")
        .update({ restaurant_name: payload.restaurant_name, phone: payload.phone, address: payload.address })
        .eq("user_id", ownerId);
    }
    setSaving(false);
    if (error) {
      setMessage({ type: "err", text: error.message });
    } else {
      setMessage({ type: "ok", text: "Alterações salvas." });
      await refreshProfile();
    }
  }

  async function handleLogo(file: File) {
    if (!ownerId) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "err", text: "A logo deve ter no máximo 2 MB." });
      return;
    }
    setUploading(true);
    setMessage(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    // Policy do bucket: o primeiro diretório do path precisa ser o uid de quem envia.
    const path = `${ownerId}/logo.${ext}`;
    const { error } = await supabase.storage.from("restaurant-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setMessage({ type: "err", text: error.message });
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("restaurant-logos").getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`; // fura cache do CDN ao trocar a logo
    const { error: updateError } = await supabase.from("restaurant_settings").update({ logo_url: url }).eq("user_id", ownerId);
    if (updateError) setMessage({ type: "err", text: updateError.message });
    else setLogoUrl(url);
    setUploading(false);
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPwMessage({ type: "err", text: "A senha precisa ter ao menos 6 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: "err", text: "As senhas não conferem." });
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) {
      setPwMessage({ type: "err", text: error.message });
    } else {
      setPwMessage({ type: "ok", text: "Senha alterada com sucesso." });
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  const trialDaysLeft =
    subscription?.status === "trial" && subscription.trial_end_date
      ? Math.max(Math.ceil((new Date(subscription.trial_end_date).getTime() - Date.now()) / 86_400_000), 0)
      : null;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" subtitle="Gerencie as configurações do seu restaurante" />

      <div className="space-y-6">
        {can("settings.view") && (
          <Section icon={Building2} title="Informações do Restaurante" subtitle="Estas informações aparecerão no cardápio digital">
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-bg border border-border overflow-hidden flex items-center justify-center">
                  {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <Building2 className="h-6 w-6 text-muted" />}
                </div>
                {isOwner && canManage && (
                  <label className={`${secondaryButton} cursor-pointer`}>
                    <Upload className="h-4 w-4" /> {uploading ? "Enviando..." : "Enviar logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
                    />
                  </label>
                )}
              </div>
              <Field label="Nome do restaurante">
                <input required disabled={!canManage} value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Telefone">
                <input disabled={!canManage} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className={inputClass} />
              </Field>
              <Field label="Endereço" className="col-span-2">
                <input disabled={!canManage} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número - Cidade, UF" className={inputClass} />
              </Field>
              <Field label="Horário de funcionamento">
                <input disabled={!canManage} value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} placeholder="Seg-Sex: 11h-23h | Sáb-Dom: 11h-00h" className={inputClass} />
              </Field>
              <Field label="Email de contato">
                <input type="email" disabled={!canManage} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </Field>
              <div className="col-span-2 flex items-center justify-end gap-3">
                {message && <span className={`text-sm ${message.type === "ok" ? "text-green-dark" : "text-red"}`}>{message.text}</span>}
                {canManage && (
                  <button type="submit" disabled={saving} className={primaryButton}>
                    <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                )}
              </div>
            </form>
          </Section>
        )}

        <Section icon={User} title="Conta" subtitle="Gerencie sua conta e credenciais">
          <div className="bg-bg rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-medium">Email da conta</p>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setPwMessage(null);
                setShowPassword(true);
              }}
              className={secondaryButton}
            >
              <KeyRound className="h-4 w-4" /> Alterar senha
            </button>
            <button onClick={() => signOut()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red text-white font-semibold px-4 py-2 text-sm hover:opacity-90">
              <LogOut className="h-4 w-4" /> Sair da conta
            </button>
          </div>
        </Section>

        <Section icon={Shield} title="Segurança" subtitle="Informações de segurança da sua conta">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between bg-bg rounded-xl px-4 py-3">
              <span className="text-muted">Email verificado</span>
              {user?.email_confirmed_at ? (
                <span className="flex items-center gap-1 text-green-dark font-medium"><CheckCircle2 className="h-4 w-4" /> Sim</span>
              ) : (
                <span className="flex items-center gap-1 text-red font-medium"><XCircle className="h-4 w-4" /> Não</span>
              )}
            </div>
            <div className="flex justify-between bg-bg rounded-xl px-4 py-3">
              <span className="text-muted">Conta criada em</span>
              <span className="font-medium">{user?.created_at ? formatDate(user.created_at) : "—"}</span>
            </div>
            <div className="flex justify-between bg-bg rounded-xl px-4 py-3">
              <span className="text-muted">Último login</span>
              <span className="font-medium">{user?.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "—"}</span>
            </div>
          </div>
        </Section>

        {isOwner && subscription && (
          <Section
            icon={Crown}
            title="Plano"
            subtitle="Sua assinatura Blyn"
            badge={
              <span
                className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${
                  subscription.status === "active" ? "bg-green/15 text-green-dark" : subscription.status === "trial" ? "bg-blue-100 text-blue-800" : "bg-red/10 text-red"
                }`}
              >
                {SUB_LABEL[subscription.status]}
              </span>
            }
          >
            {subscription.status === "trial" ? (
              <p className="text-sm">
                Você está no <strong>teste gratuito</strong>
                {trialDaysLeft !== null && <> — restam <strong>{trialDaysLeft} dia(s)</strong></>}. Assine para garantir acesso contínuo.
              </p>
            ) : subscription.status === "active" ? (
              <p className="text-sm">
                Plano <strong>{subscription.plan}</strong> ({CYCLE_LABEL[subscription.billing_cycle]})
                {subscription.expires_at && <> · renova em {formatDate(subscription.expires_at)}</>}.
              </p>
            ) : (
              <p className="text-sm">Sua assinatura não está ativa. Regularize para continuar recebendo pedidos online.</p>
            )}
          </Section>
        )}
      </div>

      {showPassword && (
        <Modal title="Alterar senha" onClose={() => setShowPassword(false)}>
          <form onSubmit={handlePassword} className="space-y-3">
            <Field label="Nova senha">
              <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Confirmar nova senha">
              <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
            </Field>
            {pwMessage && <p className={`text-sm ${pwMessage.type === "ok" ? "text-green-dark" : "text-red"}`}>{pwMessage.text}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPassword(false)} className={secondaryButton}>Fechar</button>
              <button type="submit" disabled={pwSaving} className={primaryButton}>{pwSaving ? "Salvando..." : "Alterar senha"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
