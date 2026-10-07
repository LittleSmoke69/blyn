// Sessão e chamadas à API da Blyn a partir das páginas estáticas (/entrar,
// /admin, /conta). Tudo passa por /api/* — o proxy repassa pra Edge Function
// "gateway", que injeta a apikey no servidor. O navegador só guarda o JWT do
// próprio usuário; quem decide o que ele pode ver/fazer é a RLS e as functions.
(function () {
  const API = "/api";
  const STORAGE_KEY = "blyn.session";

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function writeSession(data) {
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
      user: { id: data.user.id, email: data.user.email },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // modo privado sem storage: a sessão vale só enquanto a página estiver aberta
    }
    memorySession = session;
    return session;
  }

  function clearSession() {
    memorySession = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  let memorySession = readSession();

  const AUTH_ERRORS = {
    invalid_credentials: "E-mail ou senha incorretos.",
    email_not_confirmed: "E-mail ainda não confirmado.",
    user_banned: "Este acesso está bloqueado.",
    over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  };

  async function parse(res) {
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }
    if (!res.ok) {
      const code = body?.error_code ?? body?.code;
      const message =
        AUTH_ERRORS[code] ??
        (res.status === 429 ? AUTH_ERRORS.over_request_rate_limit : null) ??
        body?.error ?? body?.msg ?? body?.message ?? `Erro ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function signIn(email, password) {
    const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return writeSession(await parse(res));
  }

  async function refresh(session) {
    const res = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    return writeSession(await parse(res));
  }

  // Sessão válida (renova se faltar menos de 1 min) ou null.
  async function getSession() {
    const session = memorySession;
    if (!session) return null;
    if (session.expires_at - Date.now() > 60_000) return session;
    try {
      return await refresh(session);
    } catch {
      clearSession();
      return null;
    }
  }

  async function request(path, { method = "GET", body, headers = {} } = {}) {
    const session = await getSession();
    if (!session) {
      location.replace("/entrar/");
      throw new Error("sessão expirada");
    }
    const res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      clearSession();
      location.replace("/entrar/");
      throw new Error("sessão expirada");
    }
    return parse(res);
  }

  const rest = (path, opts) => request(`/rest/v1/${path}`, opts);
  const rpc = (name, args = {}) => request(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
  const fn = (name, body = {}) => request(`/functions/v1/${name}`, { method: "POST", body });

  async function isAdmin() {
    const session = await getSession();
    if (!session) return false;
    try {
      return (await rpc("is_admin", { uid: session.user.id })) === true;
    } catch {
      return false;
    }
  }

  async function signOut() {
    const session = memorySession;
    clearSession();
    if (session) {
      await fetch(`${API}/auth/v1/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
    location.replace("/entrar/");
  }

  // Cria elemento sem innerHTML: dado vindo do banco (nome de restaurante etc.)
  // é digitado por qualquer um que se cadastra, então nunca vira HTML.
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (key === "class") el.className = value;
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  window.Blyn = { signIn, signOut, getSession, isAdmin, rest, rpc, fn, h };
})();
