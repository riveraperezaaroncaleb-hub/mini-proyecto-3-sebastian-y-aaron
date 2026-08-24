// US-07/Componentes Globales: i18n ES/EN/ZH basado en data-i18n
const DICT = {
  es: {
    "app.titulo": "Zona Franca CR",
    "nav.solicitud": "Solicitud",
    "nav.analista": "Analista",
    "nav.cumplimiento": "Cumplimiento",
    "nav.auditoria": "Auditoría",
    "nav.mensajes": "Mensajería",
    "hero.titulo": "Promotora del Comercio Exterior de Costa Rica (PROCOMER)",
    "hero.texto": "PROCOMER impulsa la atracción de inversión extranjera directa, regula el régimen de Zonas Francas y valida terrenos y espacios dentro del territorio costarricense para asegurar el cumplimiento legal y ambiental.",
    "btn.acceso": "Iniciar Sesión / Registro",
    "modal.portalEmpresa": "Portal de Empresas",
    "modal.portalAdmin": "Portal Administrativo",
    "modal.empresaDesc": "Inicio de sesión / registro para empresas solicitantes.",
    "modal.adminDesc": "Acceso exclusivo para analistas y administradores.",
    "form.correo": "Correo electrónico",
    "form.password": "Contraseña",
    "btn.login": "Iniciar Sesión",
    "btn.registrar": "Registrarse",
    "btn.cancelar": "Cancelar"
  },
  en: {
    "app.titulo": "Free Trade Zone CR",
    "nav.solicitud": "Application",
    "nav.analista": "Analyst",
    "nav.cumplimiento": "Compliance",
    "nav.auditoria": "Audit",
    "nav.mensajes": "Messaging",
    "hero.titulo": "Costa Rican Foreign Trade Promoter (PROCOMER)",
    "hero.texto": "PROCOMER drives foreign direct investment attraction, regulates the Free Trade Zone regime and validates land and spaces within Costa Rican territory to ensure legal and environmental compliance.",
    "btn.acceso": "Sign In / Register",
    "modal.portalEmpresa": "Company Portal",
    "modal.portalAdmin": "Administrative Portal",
    "modal.empresaDesc": "Login / registration for applicant companies.",
    "modal.adminDesc": "Exclusive access for analysts and administrators.",
    "form.correo": "Email address",
    "form.password": "Password",
    "btn.login": "Sign In",
    "btn.registrar": "Register",
    "btn.cancelar": "Cancel"
  },
  zh: {
    "app.titulo": "自由贸易区 CR",
    "nav.solicitud": "申请",
    "nav.analista": "分析师",
    "nav.cumplimiento": "合规",
    "nav.auditoria": "审计",
    "nav.mensajes": "消息",
    "hero.titulo": "哥斯达黎加外贸促进局 (PROCOMER)",
    "hero.texto": "PROCOMER 推动外国直接投资，规范自由贸易区制度，并验证哥斯达黎加境内的土地和空间，以确保法律和环境合规。",
    "btn.acceso": "登录 / 注册",
    "modal.portalEmpresa": "企业门户",
    "modal.portalAdmin": "管理门户",
    "modal.empresaDesc": "申请企业的登录 / 注册。",
    "modal.adminDesc": "仅限分析师和管理员访问。",
    "form.correo": "电子邮件",
    "form.password": "密码",
    "btn.login": "登录",
    "btn.registrar": "注册",
    "btn.cancelar": "取消"
  }
};

export const IDIOMAS = { es: "Español", en: "English", zh: "中文" };

export function idiomaActual() {
  return localStorage.getItem("zf_idioma") || "es";
}

// Traduce elementos estáticos marcados con data-i18n / data-i18n-placeholder
export function aplicarIdioma(idioma = idiomaActual()) {
  localStorage.setItem("zf_idioma", idioma);
  document.documentElement.lang = idioma;
  const pack = DICT[idioma] || DICT.es;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (pack[el.dataset.i18n]) el.textContent = pack[el.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    if (pack[el.dataset.i18nPlaceholder]) el.placeholder = pack[el.dataset.i18nPlaceholder];
  });
  document.dispatchEvent(new CustomEvent("zf:idioma", { detail: idioma }));
}

export function t(clave) {
  return (DICT[idiomaActual()] || DICT.es)[clave] || clave;
}
