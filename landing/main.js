/* =========================================================
   BLYN — Landing Page · interações e animações
   GSAP + ScrollTrigger + Lenis (smooth scroll)
   ========================================================= */

/* ---------- CONFIGURAÇÃO (troque pelos dados reais) ---------- */
const CONFIG = {
  whatsapp: "5500000000000",           // DDI + DDD + número, só dígitos
  phoneLabel: "(00) 00000-0000",
  email: "contato@blyn.com.br",
  instagram: "blyn",                    // sem @
  whatsMessage: "Olá! Vim pelo site da Blyn e quero saber mais sobre a plataforma.",
  // Base da API (gateway). Usada pra gravar os formulários no CRM interno
  // (Edge Function submit-lead) e pra ler a config do formulário da hero,
  // que é editável no painel admin. Deixe vazio para o site funcionar só com
  // o formulário fixo do HTML + WhatsApp.
  apiBase: "https://blynassessoria.com.br/api",
};

/* ---------- rastreamento de origem (anúncios e orgânico) ----------
   Guarda, por visitante, o PRIMEIRO e o ÚLTIMO toque: UTMs, click ids
   (fbclid, gclid, ttclid...), ids dinâmicos da Meta (campaign_id, adset_id,
   ad_id, placement) e o referrer. Sessão nova sem UTM e sem referrer externo
   (visita direta) não apaga o último toque conhecido.
   Cookies primários da Meta: _fbp (criado aqui se não existir) e _fbc
   (a partir do fbclid). Vão com o lead pra Conversions API.
   O canal (Meta Ads, Google Ads, orgânico busca/social, direto...) é
   classificado no servidor (track-visit / submit-lead). */
const TRACKING = (() => {
  const TOUCH_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
    "fbclid", "gclid", "gbraid", "wbraid", "ttclid", "msclkid", "li_fat_id",
    "campaign_id", "adset_id", "ad_id", "placement", "site_source_name"];
  const FIRST_TOUCH_TTL = 90 * 86400000;
  const store = {
    get(area, k) { try { return JSON.parse(window[area].getItem(k) || "null"); } catch { return null; } },
    set(area, k, v) { try { window[area].setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const cookie = (name) => document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=").slice(1).join("=") || null;
  const rootDomain = location.hostname.replace(/^www\./, "");
  const setCookie = (name, value, days) => {
    document.cookie = `${name}=${value}; max-age=${days * 86400}; path=/; domain=.${rootDomain}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  };

  const params = new URLSearchParams(location.search);
  const touch = Object.fromEntries(TOUCH_PARAMS.filter((k) => params.get(k)).map((k) => [k, params.get(k).slice(0, 300)]));
  let externalRef = "";
  try { externalRef = document.referrer && new URL(document.referrer).hostname.replace(/^www\./, "") !== rootDomain ? document.referrer : ""; } catch { /* referrer inválido */ }
  const hasNewTouch = Object.keys(touch).length > 0 || !!externalRef;
  if (hasNewTouch) Object.assign(touch, { referrer: externalRef || undefined, landing_page: location.href.slice(0, 1000), ts: new Date().toISOString() });

  let visitorId = store.get("localStorage", "blyn_vid");
  if (!visitorId) { visitorId = uuid(); store.set("localStorage", "blyn_vid", visitorId); }
  let sessionId = store.get("sessionStorage", "blyn_sid");
  const newSession = !sessionId;
  if (newSession) { sessionId = uuid(); store.set("sessionStorage", "blyn_sid", sessionId); }

  let first = store.get("localStorage", "blyn_ft");
  if (first && Date.now() - Date.parse(first.ts) > FIRST_TOUCH_TTL) first = null;
  let last = store.get("localStorage", "blyn_lt");
  if (hasNewTouch) {
    last = touch;
    store.set("localStorage", "blyn_lt", last);
    if (!first) { first = touch; store.set("localStorage", "blyn_ft", first); }
  } else if (!first) {
    first = { landing_page: location.href.slice(0, 1000), ts: new Date().toISOString() };
    store.set("localStorage", "blyn_ft", first);
  }
  // Sessão nova "direta": o último toque continua sendo a última origem real,
  // mas a página de entrada desta sessão é registrada.
  if (!last) last = { landing_page: location.href.slice(0, 1000), ts: new Date().toISOString() };

  let fbp = cookie("_fbp");
  if (!fbp) { fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 9e9) + 1e9}`; setCookie("_fbp", fbp, 90); }
  let fbc = cookie("_fbc");
  if (params.get("fbclid") && !(fbc && fbc.endsWith("." + params.get("fbclid")))) {
    fbc = `fb.1.${Date.now()}.${params.get("fbclid")}`;
    setCookie("_fbc", fbc, 90);
  }

  const data = () => ({
    visitor_id: visitorId,
    session_id: sessionId,
    first_touch: first,
    last_touch: last,
    page: location.href.slice(0, 1000),
    fbp,
    fbc,
    ga: cookie("_ga"),
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: navigator.userAgentData?.platform || navigator.platform || null,
  });

  return { data, newSession, utm: Object.fromEntries(Object.entries(last).filter(([k]) => k.startsWith("utm_"))) };
})();

if (CONFIG.apiBase && TRACKING.newSession) {
  fetch(`${CONFIG.apiBase}/functions/v1/track-visit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracking: TRACKING.data() }),
    keepalive: true,
  }).catch(() => { /* rastreamento nunca atrapalha a visita */ });
}

function sendLead(form, data) {
  if (!CONFIG.apiBase) return;
  // keepalive: o envio continua mesmo com a aba do WhatsApp abrindo por cima.
  fetch(`${CONFIG.apiBase}/functions/v1/submit-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, source: form.dataset.leadSource || "landing", utm: TRACKING.utm, tracking: TRACKING.data() }),
    keepalive: true,
  }).catch(() => { /* o WhatsApp já abriu; não bloqueia o visitante */ });
}

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasGsap = !!(window.gsap && window.ScrollTrigger);
const motion = hasGsap && !reduceMotion;

/* ---------- dados de contato ---------- */
const whatsUrl = (text = CONFIG.whatsMessage) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

$$("[data-whats-link]").forEach((a) => { a.href = whatsUrl(); a.target = "_blank"; a.rel = "noopener"; });
$$('[data-cfg="phoneLabel"]').forEach((a) => (a.textContent = CONFIG.phoneLabel));
$$('[data-cfg="email"]').forEach((a) => { a.textContent = CONFIG.email; a.href = `mailto:${CONFIG.email}`; });
$$('[data-cfg="instagram"]').forEach((a) => { a.textContent = `@${CONFIG.instagram}`; a.href = `https://instagram.com/${CONFIG.instagram}`; });
$("#year").textContent = new Date().getFullYear();

if (!motion) document.documentElement.classList.add("no-motion");

/* ---------- ciclo: raio do anel + rótulos circulares ---------- */
const cycleStage = $(".cycle__stage");
const cycleRing = $("#cycleRing");
// 270/600 = raio das setas no viewBox do SVG
const setRadius = () => cycleRing.style.setProperty("--R", `${cycleStage.offsetWidth * (270 / 600)}px`);
setRadius();
window.addEventListener("resize", setRadius);

// preenche o círculo com o rótulo repetido, na densidade certa para o tamanho do nó
function buildLabels() {
  $$(".node__label").forEach((el) => {
    el.textContent = "";
    const word = el.dataset.label;
    const probe = document.createElement("span");
    el.appendChild(probe);
    const fs = parseFloat(getComputedStyle(probe).fontSize) || 11;
    probe.remove();
    const fit = Math.floor((Math.PI * el.offsetWidth) / (fs * 1.15));
    const reps = Math.max(1, Math.floor(fit / (word.length + 3)));
    const chars = [...`${word} • `.repeat(reps)];
    chars.forEach((ch, i) => {
      const span = document.createElement("span");
      span.textContent = ch;
      span.style.setProperty("--r", `${(i / chars.length) * 360}deg`);
      el.appendChild(span);
    });
  });
}
buildLabels();
let labelTimer;
window.addEventListener("resize", () => { clearTimeout(labelTimer); labelTimer = setTimeout(buildLabels, 150); });
document.fonts?.ready.then(buildLabels);

/* ---------- smooth scroll (Lenis) ---------- */
let lenis = null;
if (motion && window.Lenis) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollToTarget(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
  else el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
}

/* ---------- header: esconde ao descer, mostra ao subir ---------- */
const header = $("#header");
const totop = $("#totop");
let lastY = 0;
function onScroll() {
  const y = window.scrollY;
  header.classList.toggle("is-scrolled", y > 40);
  header.classList.toggle("is-hidden", y > lastY && y > 300 && !menu.classList.contains("is-open"));
  totop.classList.toggle("is-visible", y > window.innerHeight * 1.2);
  lastY = y;
}
window.addEventListener("scroll", onScroll, { passive: true });
totop.addEventListener("click", () => scrollToTarget("#topo"));

/* ---------- menu fullscreen ---------- */
const burger = $("#burger");
const menu = $("#menu");
function setMenu(open) {
  menu.classList.toggle("is-open", open);
  menu.setAttribute("aria-hidden", String(!open));
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  if (lenis) open ? lenis.stop() : lenis.start();
  document.body.style.overflow = open ? "hidden" : "";
}
burger.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) { setMenu(false); burger.focus(); } });

/* âncoras internas */
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const el = $(id);
    if (!el) return;
    e.preventDefault();
    const wasOpen = menu.classList.contains("is-open");
    if (wasOpen) setMenu(false);
    setTimeout(() => {
      scrollToTarget(el);
      if (id === "#form-hero" || (id === "#topo" && a.classList.contains("btn"))) {
        setTimeout(() => $("#form-hero input")?.focus({ preventScroll: true }), 1200);
      }
    }, wasOpen ? 450 : 0);
  });
});

/* ---------- FAQ: acordeão com altura animada ---------- */
$$(".qa").forEach((d) => {
  const summary = $("summary", d);
  const body = $(".qa__body", d);
  summary.addEventListener("click", (e) => {
    e.preventDefault();
    const opening = !d.open;
    if (opening) {
      $$(".qa[open]").forEach((o) => o !== d && closeQa(o));
      d.open = true;
      if (motion) gsap.fromTo(body, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: .55, ease: "power3.out", onComplete: refresh });
    } else closeQa(d);
  });
});
function closeQa(d) {
  const body = $(".qa__body", d);
  if (!motion) { d.open = false; return; }
  gsap.to(body, { height: 0, opacity: 0, duration: .4, ease: "power3.inOut", onComplete: () => { d.open = false; gsap.set(body, { clearProps: "all" }); refresh(); } });
}
function refresh() { if (hasGsap) ScrollTrigger.refresh(); }

/* ---------- formulários -> WhatsApp ---------- */
// Delegação no document: vale também pros campos que o formulário da hero
// cria dinamicamente a partir da config do painel admin.
document.addEventListener("input", (e) => {
  const inp = e.target;
  if (!(inp instanceof HTMLElement)) return;
  inp.closest(".field")?.classList.remove("is-error");
  if (!inp.matches("[data-phone]")) return;
  let v = inp.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  inp.value = v;
});

$$("[data-whats-form]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let ok = true;
    $$("input, select, textarea", form).forEach((f) => {
      const valid = f.checkValidity();
      f.closest(".field")?.classList.toggle("is-error", !valid);
      if (!valid && ok) { ok = false; f.focus(); }
    });
    if (!ok) {
      if (motion) gsap.fromTo(form, { x: -8 }, { x: 0, duration: .5, ease: "elastic.out(1, .3)" });
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    sendLead(form, data);
    delete data.website;
    const labels = { nome: "Nome", email: "E-mail", whatsapp: "WhatsApp", delivery: "Delivery", instagram: "Instagram", desafio: "Principal desafio", mensagem: "Mensagem" };
    const labelOf = (k) => form.elements[k]?.dataset?.label || labels[k] || k;
    const lines = Object.entries(data).filter(([, v]) => v).map(([k, v]) => `*${labelOf(k)}:* ${v}`);
    const msg = `Olá! Quero uma demonstração da Blyn.\n\n${lines.join("\n")}`;
    window.open(whatsUrl(msg), "_blank", "noopener");

    const btn = $("button[type=submit] span", form);
    const old = btn.textContent;
    btn.textContent = "Enviado! ✓";
    form.reset();
    setTimeout(() => (btn.textContent = old), 3500);
  });
});

/* ---------- formulário da hero: config editável no painel admin ---------- */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function fieldHtml(f) {
  const ph = esc((f.placeholder || f.label) + (f.required ? " *" : ""));
  const common = `name="${esc(f.key)}" data-label="${esc(f.label)}"${f.required ? " required" : ""}`;
  let control;
  if (f.type === "select") {
    control = `<select ${common}><option value="" disabled selected>${ph}</option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") {
    control = `<textarea ${common} rows="3" placeholder="${ph}"></textarea>`;
  } else {
    const type = f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text";
    const auto = f.key === "nome" ? ' autocomplete="name"' : type === "email" ? ' autocomplete="email"' : type === "tel" ? ' autocomplete="tel" data-phone' : "";
    control = `<input ${common} type="${type}" placeholder="${ph}"${auto} />`;
  }
  return `<label class="field${f.type === "select" ? " field--select" : ""}"><span class="sr">${esc(f.label)}</span>${control}</label>`;
}

function renderHeroForm(cfg) {
  const form = $("#form-hero");
  if (!form || !Array.isArray(cfg.fields) || !cfg.fields.length) return;
  // Campos "half" consecutivos ficam lado a lado, de dois em dois.
  let body = "";
  for (let i = 0; i < cfg.fields.length; i++) {
    const f = cfg.fields[i];
    const next = cfg.fields[i + 1];
    if (f.half && next?.half) {
      body += `<div class="formcard__row">${fieldHtml(f)}${fieldHtml(next)}</div>`;
      i++;
    } else {
      body += fieldHtml(f);
    }
  }
  form.innerHTML = `
    <label class="hp" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off" /></label>
    <h2 class="formcard__title">${esc(cfg.title)}</h2>
    ${cfg.subtitle ? `<p class="formcard__sub">${esc(cfg.subtitle)}</p>` : ""}
    ${body}
    <button class="btn btn--primary btn--block" type="submit"><span>${esc(cfg.button_label || "Enviar")}</span></button>
    ${cfg.safe_note ? `<p class="formcard__safe">${esc(cfg.safe_note)}</p>` : ""}`;
  if (motion) gsap.from($$(".field, .btn", form), { y: 12, opacity: 0, duration: .5, stagger: .04, ease: "power2.out" });
}

// Se a API falhar, o formulário fixo do HTML continua valendo.
if (CONFIG.apiBase) {
  fetch(`${CONFIG.apiBase}/rest/v1/site_forms?id=eq.hero&select=title,subtitle,button_label,safe_note,fields`)
    .then((r) => (r.ok ? r.json() : null))
    .then((rows) => rows?.[0] && renderHeroForm(rows[0]))
    .catch(() => {});
}

/* ---------- lightbox dos prints de resultado ---------- */
const lightbox = $("#lightbox");
const lightboxImg = $("img", lightbox);
let lightboxOpener = null;
function setLightbox(src, opener) {
  const open = !!src;
  if (open) { lightboxImg.src = src; lightboxImg.alt = $("img", opener)?.alt || ""; lightboxOpener = opener; }
  lightbox.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
  if (lenis) open ? lenis.stop() : lenis.start();
  if (open) $(".lightbox__close", lightbox).focus();
  else lightboxOpener?.focus();
}
$$("[data-lightbox]").forEach((b) => b.addEventListener("click", () => setLightbox(b.dataset.lightbox, b)));
lightbox.addEventListener("click", () => setLightbox(null));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lightbox.hidden) setLightbox(null); });

/* ---------- contadores ---------- */
function formatCount(el, v) {
  const money = el.hasAttribute("data-money");
  const dec = parseInt(el.dataset.decimals || "0", 10);
  const n = dec
    ? v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : money ? Math.round(v).toLocaleString("pt-BR") : Math.round(v);
  return `${el.dataset.prefix || ""}${n}${el.dataset.suffix || ""}`;
}
function runCounter(el) {
  const end = parseFloat(el.dataset.count);
  if (!motion) { el.textContent = formatCount(el, end); return; }
  const o = { v: 0 };
  gsap.to(o, { v: end, duration: end > 1000 ? 2.2 : 1.6, ease: "power2.out", onUpdate: () => (el.textContent = formatCount(el, o.v)) });
}
if (!motion) $$("[data-count]").forEach(runCounter);

/* ---------- typing: divide em palavras/caracteres ---------- */
function splitChars(root) {
  const chars = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          const w = document.createElement("span");
          w.className = "w";
          [...part].forEach((ch) => {
            const c = document.createElement("span");
            c.className = "c";
            c.textContent = ch;
            w.appendChild(c);
            chars.push(c);
          });
          frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== "BR") walk(child);
    });
  };
  root.setAttribute("aria-label", root.textContent.replace(/\s+/g, " ").trim());
  walk(root);
  return chars;
}

/* =========================================================
   ANIMAÇÕES (somente com GSAP e sem reduced-motion)
   ========================================================= */
if (motion) {
  gsap.registerPlugin(ScrollTrigger);

  /* --- intro do hero --- */
  const heroTl = gsap.timeline({ defaults: { ease: "power4.out" }, delay: .15 });
  heroTl
    .fromTo(".hero__frame", { clipPath: "inset(6% 4% 6% 4% round 48px)" }, { clipPath: "inset(0% 0% 0% 0% round 48px)", duration: 1.4, ease: "expo.out", clearProps: "clipPath" }, 0)
    .from(".header__inner", { y: -30, opacity: 0, duration: 1 }, .2)
    .from(".hero__title .line > span", { yPercent: 110, duration: 1.2, stagger: .1 }, .25)
    .fromTo(".hero__kicker", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1, ease: "power3.inOut" }, .75)
    .from(".hero__lead, .hero__ctas, .hero__chips", { y: 30, opacity: 0, duration: 1, stagger: .12 }, .9)
    .from(".formcard", { y: 60, opacity: 0, duration: 1.2 }, .55)
    .from(".formcard .field, .formcard .btn", { y: 20, opacity: 0, duration: .8, stagger: .06 }, .85)
    .from(".badge", { scale: .4, opacity: 0, duration: .9, stagger: .15, ease: "back.out(1.8)", onStart: () => $$(".badge [data-count]").forEach(runCounter) }, 1.1);

  gsap.to(".float", { y: -12, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.to(".float--alt", { y: 10, x: 6, duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1, overwrite: false });
  gsap.to(".hero__glow", { xPercent: -20, yPercent: 15, duration: 8, ease: "sine.inOut", yoyo: true, repeat: -1 });

  /* parallax de saída do hero */
  gsap.to(".hero__copy", { yPercent: -12, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  /* --- reveal genérico --- */
  $$("[data-reveal]").forEach((el) => {
    if (el.closest(".hero")) return;
    gsap.from(el, { y: 40, opacity: 0, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
  });

  /* --- typing nos títulos --- */
  $$("[data-type]").forEach((el) => {
    const chars = splitChars(el);
    gsap.to(chars, {
      opacity: 1, duration: .01, ease: "none",
      stagger: Math.min(.045, 1.6 / chars.length),
      scrollTrigger: { trigger: el, start: "top 82%" },
    });
  });

  /* --- contadores (exceto badges do hero) --- */
  $$("[data-count]").forEach((el) => {
    if (el.closest(".badge")) return;
    ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => runCounter(el) });
  });
  gsap.from(".stat", { yPercent: 40, opacity: 0, duration: 1, stagger: .08, ease: "power3.out", scrollTrigger: { trigger: ".stats", start: "top 90%" } });

  /* --- manifesto --- */
  gsap.fromTo(".manifesto__box", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut", scrollTrigger: { trigger: ".manifesto", start: "top 75%" } });
  $$("[data-parallax]").forEach((el) => {
    gsap.fromTo(el, { y: -parseFloat(el.dataset.parallax) }, { y: parseFloat(el.dataset.parallax), ease: "none", scrollTrigger: { trigger: ".manifesto", start: "top bottom", end: "bottom top", scrub: true } });
  });
  gsap.from(".ui-float", { scale: .6, opacity: 0, duration: 1, stagger: .15, ease: "back.out(1.6)", scrollTrigger: { trigger: ".manifesto", start: "top 60%" } });

  /* --- desafios: scroll horizontal fixado --- */
  const cards = $$(".ch-card");
  const setActive = (i) => cards.forEach((c, j) => c.classList.toggle("is-active", j === i));
  setActive(0);

  const mm = gsap.matchMedia();
  mm.add("(min-width: 901px)", () => {
    const track = $(".challenges__track");
    const viewport = $(".challenges__viewport");
    const dist = () => Math.max(0, track.scrollWidth - viewport.clientWidth + parseFloat(getComputedStyle(viewport).paddingRight));
    const tween = gsap.to(track, {
      x: () => -dist(), ease: "none",
      scrollTrigger: {
        trigger: ".challenges", start: "top top", end: () => `+=${dist() + window.innerHeight * .8}`,
        pin: ".challenges__pin", scrub: .8, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (self) => {
          gsap.set(".challenges__progress span", { scaleX: self.progress });
          setActive(Math.min(cards.length - 1, Math.round(self.progress * (cards.length - 1))));
        },
      },
    });
    return () => tween.kill();
  });
  mm.add("(max-width: 900px)", () => {
    const vp = $(".challenges__viewport");
    const onH = () => {
      const x = vp.scrollLeft;
      let best = 0, bestD = Infinity;
      cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft - vp.offsetLeft - x - 16); if (d < bestD) { bestD = d; best = i; } });
      setActive(best);
    };
    vp.addEventListener("scroll", onH, { passive: true });
    return () => vp.removeEventListener("scroll", onH);
  });
  gsap.from(".ch-card", { y: 80, opacity: 0, duration: 1, stagger: .1, ease: "power3.out", scrollTrigger: { trigger: ".challenges", start: "top 70%" } });

  /* --- método --- */
  gsap.from(".m-card", { y: 100, opacity: 0, rotate: 2, duration: 1.2, stagger: .12, ease: "power4.out", scrollTrigger: { trigger: ".method__grid", start: "top 85%" } });
  gsap.from(".m-card__num", { yPercent: 60, opacity: 0, duration: 1, stagger: .12, ease: "power3.out", delay: .3, scrollTrigger: { trigger: ".method__grid", start: "top 85%" } });

  /* --- ciclo: anel gira com o scroll --- */
  const ring = $("#cycleRing");


  const cycleTl = gsap.timeline({
    scrollTrigger: { trigger: ".cycle", start: "top top", end: "+=160%", pin: ".cycle__pin", scrub: 1, anticipatePin: 1 },
  });
  cycleTl
    .from(".node__ball", { scale: 0, stagger: .08, duration: .25, ease: "back.out(1.6)" }, 0)
    .from(".node__label", { opacity: 0, stagger: .08, duration: .25 }, .05)
    .from(".cycle__center > *", { y: 40, opacity: 0, stagger: .06, duration: .25 }, .05)
    .from(".cycle__arrows .arrow", { opacity: 0, stagger: .08, duration: .25 }, .15)
    .to(ring, {
      rotate: -180, duration: 1, ease: "none",
      onUpdate() { ring.style.setProperty("--counter", `${-gsap.getProperty(ring, "rotate")}deg`); },
    }, .2);

  /* --- módulos --- */
  ScrollTrigger.batch(".mod", {
    start: "top 88%",
    onEnter: (els) => gsap.from(els, { y: 80, opacity: 0, scale: .96, duration: 1.1, stagger: .1, ease: "power4.out" }),
    once: true,
  });

  /* --- plataforma: mockup “deita” e endireita --- */
  gsap.fromTo("#mock", { rotateX: 32, scale: .86, y: 40 }, {
    rotateX: 0, scale: 1, y: 0, ease: "none",
    scrollTrigger: { trigger: ".mock-wrap", start: "top 95%", end: "top 25%", scrub: true },
  });
  gsap.from(".cbars span", { scaleY: 0, duration: 1.2, stagger: .07, ease: "power3.out", scrollTrigger: { trigger: ".mock", start: "top 60%" } });
  gsap.from(".mock__rank i", { scaleX: 0, duration: 1.2, stagger: .1, ease: "power3.out", scrollTrigger: { trigger: ".mock", start: "top 60%" } });
  gsap.from(".platform", { borderRadius: "0px 0px 0 0", duration: 1, scrollTrigger: { trigger: ".platform", start: "top bottom", end: "top 40%", scrub: true } });

  /* --- clientes --- */
  gsap.from(".logo-tile", { y: 40, opacity: 0, duration: .9, stagger: .05, ease: "power3.out", scrollTrigger: { trigger: ".logos", start: "top 90%" } });

  /* --- resultados --- */
  gsap.from(".r-stat", { y: 50, opacity: 0, duration: 1, stagger: .1, ease: "power3.out", scrollTrigger: { trigger: ".results__stats", start: "top 88%" } });
  gsap.from(".case", { y: 90, opacity: 0, duration: 1.2, stagger: .15, ease: "power4.out", scrollTrigger: { trigger: ".cases", start: "top 85%" } });
  gsap.from(".case__fill", { scaleX: 0, duration: 1.6, stagger: .12, ease: "power3.out", delay: .4, scrollTrigger: { trigger: ".cases", start: "top 75%" } });

  /* --- diretores --- */
  gsap.fromTo(".person__photo", { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, stagger: .15, ease: "expo.inOut", scrollTrigger: { trigger: ".team__grid", start: "top 80%" } });
  gsap.from(".person__info", { y: 40, opacity: 0, duration: 1, stagger: .15, delay: .6, ease: "power3.out", scrollTrigger: { trigger: ".team__grid", start: "top 80%" } });

  /* --- CTA --- */
  gsap.fromTo(".cta__box", { scale: .9, borderRadius: "120px" }, { scale: 1, borderRadius: "48px", ease: "none", scrollTrigger: { trigger: ".cta", start: "top bottom", end: "center center", scrub: true } });

  /* --- FAQ --- */
  gsap.from(".qa", { x: 60, opacity: 0, duration: 1, stagger: .08, ease: "power3.out", scrollTrigger: { trigger: ".faq__list", start: "top 85%" } });

  /* --- footer --- */
  gsap.from(".footer__grid > *", { y: 50, opacity: 0, duration: 1, stagger: .12, ease: "power3.out", scrollTrigger: { trigger: ".footer", start: "top 85%" } });

  /* --- botões magnéticos --- */
  if (window.matchMedia("(pointer: fine)").matches) {
    $$(".magnetic").forEach((btn) => {
      const xTo = gsap.quickTo(btn, "x", { duration: .6, ease: "elastic.out(1, .4)" });
      const yTo = gsap.quickTo(btn, "y", { duration: .6, ease: "elastic.out(1, .4)" });
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * .25);
        yTo((e.clientY - r.top - r.height / 2) * .35);
      });
      btn.addEventListener("mouseleave", () => { xTo(0); yTo(0); });
    });
  }

  /* recalcula depois que fontes e imagens carregarem */
  window.addEventListener("load", () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}
