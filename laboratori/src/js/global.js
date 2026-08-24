// Componentes Globales: tema claro/oscuro + idioma + chatbot (auto-inyectado)
import { aplicarIdioma, idiomaActual, IDIOMAS, t } from "./i18n.js";
import { escapeHtml } from "./ui.js";

// ---------- Tema Claro / Oscuro ----------
export function initTema() {
  const guardado = localStorage.getItem("zf_tema") || "light";
  document.documentElement.dataset.theme = guardado;
  document.querySelectorAll("[data-tema-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nuevo = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nuevo;
      localStorage.setItem("zf_tema", nuevo);
      btn.textContent = nuevo === "dark" ? "☀️" : "🌙";
      document.dispatchEvent(new CustomEvent("zf:tema", { detail: nuevo }));
    });
    btn.textContent = guardado === "dark" ? "☀️" : "🌙";
  });
}

// ---------- Selector de Idioma ----------
export function initIdioma(contenedorSel = "[data-idioma-selector]") {
  document.querySelectorAll(contenedorSel).forEach((sel) => {
    sel.innerHTML = Object.entries(IDIOMAS)
      .map(([cod, nombre]) => `<option value="${cod}">${nombre}</option>`)
      .join("");
    sel.value = idiomaActual();
    sel.addEventListener("change", () => aplicarIdioma(sel.value));
  });
  aplicarIdioma();
}

// ---------- Chatbot de Soporte Inteligente ----------
const FAQ = [
  {
    claves: ["requisito", "inversión", "minimo", "mínimo", "requirement", "investment", "要求", "投资"],
    es: "El régimen exige: inversión mínima de $150,000 USD, al menos 10 empleos directos y pertenecer a un sector autorizable. Adjunte su plan de operaciones en PDF/ZIP.",
    en: "The regime requires: minimum investment of $150,000 USD, at least 10 direct jobs and an authorizable sector. Attach your operations plan in PDF/ZIP.",
    zh: "该制度要求：最低投资 150,000 美元，至少 10 个直接就业岗位，并属于可批准的行业。请附上 PDF/ZIP 格式的运营计划。"
  },
  {
    claves: ["estado", "tramite", "trámite", "radicado", "status", "状态", "进度"],
    es: "Consulte el estado de su trámite en el Portal de Empresas → Centro de Mensajes. Allí verá si está En revisión, Aprobada o Rechazada, junto con la retroalimentación del analista.",
    en: "Check your application status in the Company Portal → Message Center. You will see whether it is Under review, Approved or Rejected, along with analyst feedback.",
    zh: "请在企业门户 → 消息中心查看申请状态。您将看到审核中、已批准或已拒绝，以及分析师的反馈。"
  },
  {
    claves: ["documento", "archivo", "formato", "document", "file", "文件", "格式"],
    es: "Aceptamos PDF y ZIP mediante el módulo Drag & Drop del formulario. El sistema valida el formato automáticamente.",
    en: "We accept PDF and ZIP via the form's Drag & Drop module. The system validates the format automatically.",
    zh: "我们通过表单的拖放模块接受 PDF 和 ZIP。系统会自动验证格式。"
  },
  {
    claves: ["zona franca", "que es", "qué es", "free trade", "什么是"],
    es: "Una Zona Franca es un régimen de incentivos para empresas que invierten y generan empleo en Costa Rica, administrado por PROCOMER.",
    en: "A Free Trade Zone is an incentive regime for companies that invest and create jobs in Costa Rica, administered by PROCOMER.",
    zh: "自由贸易区是针对在哥斯达黎加投资和创造就业的企业的激励制度，由 PROCOMER 管理。"
  }
];

function responderBot(pregunta) {
  const q = pregunta.toLowerCase();
  const idioma = idiomaActual();
  const faq = FAQ.find((f) => f.claves.some((k) => q.includes(k)));
  return (
    (faq && faq[idioma]) ||
    { es: "No entendí su consulta. Puede preguntarme por: requisitos, estado del trámite, documentos o qué es una zona franca.", en: "I did not understand. You can ask me about: requirements, application status, documents or what a free trade zone is.", zh: "我不明白您的问题。您可以询问：要求、申请状态、文件或什么是自由贸易区。" }[idioma]
  );
}

export function initChatbot() {
  if (document.getElementById("chatbot-root")) return;
  const root = document.createElement("div");
  root.id = "chatbot-root";
  root.innerHTML = `
    <div id="chatbot-panel" class="hidden">
      <div class="chatbot-header"><span>🤖 <span data-i18n="bot.titulo">Soporte ZoFranca</span></span>
        <button id="chatbot-cerrar" aria-label="Cerrar">&times;</button></div>
      <div class="chatbot-mensajes" id="chatbot-mensajes"></div>
      <form id="chatbot-form">
        <input id="chatbot-input" autocomplete="off" placeholder="Escriba su pregunta...">
        <button type="submit">➤</button>
      </form>
    </div>
    <button id="chatbot-fab" aria-label="Chat de soporte">💬</button>`;
  document.body.appendChild(root);

  const panel = document.getElementById("chatbot-panel");
  const mensajes = document.getElementById("chatbot-mensajes");
  const agregar = (texto, esBot) => {
    mensajes.insertAdjacentHTML(
      "beforeend",
      `<div class="chat-msg ${esBot ? "bot" : "user"}">${escapeHtml(texto)}</div>`
    );
    mensajes.scrollTop = mensajes.scrollHeight;
  };
  agregar(idiomaActual() === "es" ? "¡Hola! Soy el asistente virtual de Zona Franca CR. ¿En qué le ayudo?" :
          idiomaActual() === "en" ? "Hi! I'm the Free Trade Zone CR virtual assistant. How can I help?" :
          "您好！我是自由贸易区虚拟助手，需要帮助吗？", true);

  document.getElementById("chatbot-fab").onclick = () => panel.classList.toggle("hidden");
  document.getElementById("chatbot-cerrar").onclick = () => panel.classList.add("hidden");

  document.getElementById("chatbot-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatbot-input");
    const texto = input.value.trim();
    if (!texto) return;
    agregar(texto, false);
    input.value = "";
    setTimeout(() => agregar(responderBot(texto), true), 400);
  });
}

// Bootstrap único para todas las páginas
export function initComponentsGlobales() {
  initTema();
  initIdioma();
  initChatbot();
}
