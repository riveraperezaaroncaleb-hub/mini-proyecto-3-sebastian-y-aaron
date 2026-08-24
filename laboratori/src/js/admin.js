// Panel del Administrador General (US-04, US-05, US-06 + mensajería)
import {
  cargarDatosDashboard,
  cargarBitacora,
  cargarAnalistas,
  cargarMensajes,
  enviarMensaje
} from "./apiService.js";
import { initComponentsGlobales } from "./global.js";
import {
  escapeHtml,
  formatearUSD,
  badgeEstado,
  mostrarToast,
  mostrarSpinner,
  ocultarSpinner,
  descargarPDF,
  descargarXLSX,
  descargarCSV,
  cargarChartJS
} from "./ui.js";

const $ = (id) => document.getElementById(id);
const ADMIN = "admin@zofranca.cr";

let solicitudes = [];
let reportes = [];
let bitacora = [];
let analistas = [];
let charts = {};
let contactoActivo = null;
let filtroDesde = "";
let filtroHasta = "";
let filtroSector = "TODOS";
let filtroAnalista = "TODOS";
let filtroAuditoriaTexto = "";

initComponentsGlobales();

// Protección de acceso
if (sessionStorage.getItem("zf_rol") !== "admin") {
  mostrarToast("Acceso restringido: inicie sesión como administrador.");
}

async function refrescarTodo() {
  mostrarSpinner("Cargando métricas globales...");
  try {
    const [datos, bit, an] = await Promise.all([
      cargarDatosDashboard(),
      cargarBitacora(),
      cargarAnalistas()
    ]);
    solicitudes = datos.solicitudes;
    reportes = datos.reportes;
    bitacora = bit;
    analistas = an;

    poblarSelectorAnalistas();
    renderKPIs();
    renderCharts();
    renderAnalistas();
    renderAuditoria();
    renderContactos();
  } catch (e) {
    console.error(e);
    mostrarToast("Sin conexión con el backend. Ejecute: npm start");
  } finally {
    ocultarSpinner();
  }
}

function datosFiltrados() {
  return solicitudes.filter((s) => {
    const fecha = s.fechaCreacion ? new Date(s.fechaCreacion) : null;
    if (filtroDesde && fecha && fecha < new Date(filtroDesde)) return false;
    if (filtroHasta && fecha && fecha > new Date(filtroHasta + "T23:59:59")) return false;
    if (filtroSector !== "TODOS" && s.sector !== filtroSector) return false;
    if (
      filtroAnalista !== "TODOS" &&
      s.resolucionAnalista?.usuario &&
      s.resolucionAnalista.usuario !== filtroAnalista
    )
      return false;
    return true;
  });
}

function alertasRojas() {
  const calc = (r) => {
    const p1 = r.inversionComprometida ? (r.inversionEjecutada / r.inversionComprometida) * 100 : null;
    const p2 = r.empleosComprometidos ? (r.empleosReales / r.empleosComprometidos) * 100 : null;
    const vals = [p1, p2].filter((v) => v !== null);
    const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return prom === null ? "SIN_DATOS" : prom >= 90 ? "CUMPLE" : prom >= 70 ? "ALERTA_AMARILLA" : "ALERTA_ROJA";
  };
  return reportes.filter((r) => calc(r) === "ALERTA_ROJA").length;
}

function renderKPIs() {
  const lista = datosFiltrados();
  const aprobadas = lista.filter((s) => s.estado === "APROBADA").length;
  const resueltas = lista.filter((s) => ["APROBADA", "RECHAZADA"].includes(s.estado));

  // Tiempo promedio de procesamiento: creación → resolución (bitácora)
  const tiempos = [];
  resueltas.forEach((s) => {
    const mov = bitacora.find(
      (b) => b.solicitudId === s.id && b.estadoNuevo === s.estado
    );
    if (mov && s.fechaCreacion)
      tiempos.push(new Date(mov.timestamp) - new Date(s.fechaCreacion));
  });
  const diasProm =
    tiempos.length
      ? (tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 86400000).toFixed(1)
      : "—";
  const inversion = lista
    .filter((s) => s.estado === "APROBADA")
    .reduce((acc, s) => acc + Number(s.inversionProyectada || 0), 0);

  $("dk-recibidas").textContent = lista.length;
  $("dk-tiempo").textContent = typeof diasProm === "number" ? `${diasProm} d` : diasProm;
  $("dk-aprobacion").textContent =
    lista.length ? `${Math.round((aprobadas / lista.length) * 100)}%` : "—";
  $("dk-inversion").textContent = `$${(inversion / 1000).toFixed(0)}k`;
  $("dk-alertas").textContent = alertasRojas();
}

async function renderCharts() {
  try { await cargarChartJS(); } catch { return; }
  const lista = datosFiltradas();

  const embudo = [
    ["Recibidas", lista.length],
    ["Pre-clasificadas IA", lista.filter((s) => s.evaluacionIA).length],
    ["Evaluadas", lista.filter((s) => ["APROBADA", "RECHAZADA"].includes(s.estado)).length],
    ["Aprobadas", lista.filter((s) => s.estado === "APROBADA").length]
  ];
  const sectores = {};
  lista.forEach((s) => (sectores[s.sector || "N/D"] = (sectores[s.sector || "N/D"] || 0) + 1));
  const porAnalista = {};
  bitacora
    .filter((b) => b.accion.startsWith("CAMBIO_ESTADO"))
    .forEach((b) => (porAnalista[b.usuario] = (porAnalista[b.usuario] || 0) + 1));
  const afinidadSector = {};
  lista.forEach((s) => {
    if (!s.evaluacionIA) return;
    (afinidadSector[s.sector || "N/D"] ||= []).push(s.evaluacionIA.puntajeAfinidad);
  });
  const afinidadProm = Object.entries(afinidadSector).map(([k, v]) => [
    k,
    Math.round(v.reduce((a, b) => a + b, 0) / v.length)
  ]);

  const crearOActualizar = (id, config) => {
    if (charts[id]) { charts[id].data = config.data; charts[id].update(); }
    else charts[id] = new window.Chart($(id), config);
  };
  const colores = ["#00A88F", "#002B49", "#E67E22", "#D9534F", "#27AE60", "#6C7A89"];

  crearOActualizar("chart-funnel", {
    type: "bar",
    data: {
      labels: embudo.map((e) => e[0]),
      datasets: [{ data: embudo.map((e) => e[1]), backgroundColor: colores }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  crearOActualizar("chart-sectores", {
    type: "doughnut",
    data: {
      labels: Object.keys(sectores),
      datasets: [{ data: Object.values(sectores), backgroundColor: colores }]
    },
    options: { plugins: { legend: { position: "right" } } }
  });

  crearOActualizar("chart-analistas", {
    type: "bar",
    data: {
      labels: Object.keys(porAnalista).map((u) => u.split("@")[0]),
      datasets: [{ label: "Decisiones", data: Object.values(porAnalista), backgroundColor: "#00A88F" }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  crearOActualizar("chart-afinidad", {
    type: "bar",
    data: {
      labels: afinidadProm.map((e) => e[0]),
      datasets: [{ label: "% Afinidad", data: afinidadProm.map((e) => e[1]), backgroundColor: "#002B49" }]
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100 } }
    }
  });
}

// ---------- Tab Analistas ----------
function renderAnalistas() {
  $("tbody-analistas").innerHTML = analistas
    .map((a) => {
      const decisiones = bitacora.filter((b) => b.usuario === a.correo && b.accion.startsWith("CAMBIO_ESTADO")).length;
      return `<tr>
        <td>${escapeHtml(a.nombre)}</td>
        <td>${escapeHtml(a.correo)}</td>
        <td>${escapeHtml(a.telefono)}</td>
        <td>${escapeHtml(a.especialidad)}</td>
        <td>${badgeEstado(a.estadoCuenta)}</td>
        <td>${decisiones}</td>
      </tr>`;
    })
    .join("");
}

// ---------- Tab Auditoría (US-06) ----------
function auditoriaFiltrada() {
  const q = filtroAuditoriaTexto.trim().toLowerCase();
  return bitacora
    .slice()
    .reverse()
    .filter(
      (b) =>
        !q ||
        String(b.solicitudId).toLowerCase().includes(q) ||
        String(b.usuario).toLowerCase().includes(q)
    );
}

function renderAuditoria() {
  $("tbody-auditoria").innerHTML = auditoriaFiltrada()
    .map(
      (b) => `<tr>
        <td>${new Date(b.timestamp).toLocaleString()}</td>
        <td>${escapeHtml(b.usuario)}</td>
        <td>${escapeHtml(b.solicitudId)}</td>
        <td>${escapeHtml(b.accion)}</td>
        <td>${escapeHtml(b.observaciones || "-")}</td>
      </tr>`
    )
    .join("");
}

// ---------- Tab Chat ----------
function renderContactos() {
  $("chat-contactos").innerHTML = analistas
    .filter((a) => a.estadoCuenta === "ACTIVA")
    .map(
      (a) => `<div class="chat-contacto ${contactoActivo === a.correo ? "activo" : ""}" data-correo="${a.correo}">
        <strong>${escapeHtml(a.nombre)}</strong>${escapeHtml(a.correo)}
      </div>`
    )
    .join("");
}

async function refrescarChat() {
  if (!contactoActivo) return;
  try {
    const todos = await cargarMensajes();
    const relevantes = todos.filter(
      (m) =>
        (m.de === ADMIN && m.para === contactoActivo) ||
        (m.de === contactoActivo && m.para === ADMIN)
    );
    $("chat-historial-admin").innerHTML = relevantes
      .map(
        (m) => `<div class="chat-msg ${m.de === ADMIN ? "user" : "bot"}">
          <strong>${m.de === ADMIN ? "Yo" : escapeHtml(m.de.split("@")[0])}</strong><br>
          ${escapeHtml(m.texto)}<br><small>${new Date(m.timestamp).toLocaleTimeString()}</small></div>`
      )
      .join("");
    const h = $("chat-historial-admin");
    h.scrollTop = h.scrollHeight;
  } catch { /* silencioso */ }
}

$("chat-contactos").addEventListener("click", (e) => {
  const c = e.target.closest(".chat-contacto");
  if (!c) return;
  contactoActivo = c.dataset.correo;
  renderContactos();
  refrescarChat();
});

$("chat-form-admin").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!contactoActivo) return mostrarToast("Seleccione un analista en la lista.");
  const texto = $("chat-input-admin").value.trim();
  if (!texto) return;
  await enviarMensaje({ de: ADMIN, para: contactoActivo, texto });
  $("chat-input-admin").value = "";
  refrescarChat();
});

setInterval(() => {
  if (!$("tab-chat").hidden) refrescarChat();
}, 4000);

// ---------- Exportaciones (US-05/US-06) ----------
$("btn-pdf-reporte").addEventListener("click", () => {
  const lista = datosFiltradas();
  descargarPDF(
    "reporte_dashboard_zofranca.pdf",
    "Reporte de Métricas · Zona Franca CR",
    lista.map((s) => ({
      ID: s.id,
      Empresa: s.empresaNombre,
      Sector: s.sector,
      InversionUSD: s.inversionProyectada,
      Empleos: s.empleosDirectosProyectados,
      AfinidadIA: s.evaluacionIA?.puntajeAfinidad ?? "",
      Estado: s.estado,
      Fecha: s.fechaCreacion ? new Date(s.fechaCreacion).toLocaleDateString() : ""
    }))
  );
});

$("btn-xlsx-reporte").addEventListener("click", () => {
  descargarXLSX(
    "dashboard_solicitudes.xlsx",
    datosFiltradas().map((s) => ({
      ID: s.id,
      Empresa: s.empresaNombre,
      Sector: s.sector,
      InversionUSD: s.inversionProyectada,
      Empleos: s.empleosDirectosProyectados,
      AfinidadIA: s.evaluacionIA?.puntajeAfinidad ?? "",
      Estado: s.estado,
      FechaCreacion: s.fechaCreacion?.slice(0, 10) ?? ""
    })),
    "Solicitudes"
  );
});

$("btn-exportar-auditoria").addEventListener("click", () =>
  descargarCSV(
    "trazabilidad_procomer.csv",
    auditoriaFiltrada().map((b) => ({
      Timestamp: new Date(b.timestamp).toISOString(),
      Usuario: b.usuario,
      SolicitudID: b.solicitudId,
      Accion: b.accion,
      Justificacion: b.observaciones || ""
    }))
  )
);

// ---------- Navegación de tabs ----------
document.querySelectorAll("[data-tab]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".content-section").forEach((s) => (s.hidden = true));
    $(link.dataset.tab).hidden = false;
    document.querySelectorAll(".sidebar-nav li").forEach((li) => li.classList.remove("active"));
    link.parentElement.classList.add("active");
  });
});

// ---------- Filtros del dashboard ----------
$("filtro-desde").addEventListener("change", (e) => { filtroDesde = e.target.value; renderKPIs(); renderCharts(); });
$("filtro-hasta").addEventListener("change", (e) => { filtroHasta = e.target.value; renderKPIs(); renderCharts(); });
$("filtro-sector-dash").addEventListener("change", (e) => { filtroSector = e.target.value; renderKPIs(); renderCharts(); });
$("filtro-analista-dash").addEventListener("change", (e) => { filtroAnalista = e.target.value; renderKPIs(); renderCharts(); });
$("filtro-auditoria-texto").addEventListener("input", (e) => { filtroAuditoriaTexto = e.target.value; renderAuditoria(); });

function poblarSelectorAnalistas() {
  const sel = $("filtro-analista-dash");
  const actual = sel.value;
  sel.innerHTML =
    '<option value="TODOS">Todos los analistas</option>' +
    analistas.map((a) => `<option value="${a.correo}">${escapeHtml(a.nombre)}</option>`).join("");
  sel.value = actual;
}

refrescarTodo();
