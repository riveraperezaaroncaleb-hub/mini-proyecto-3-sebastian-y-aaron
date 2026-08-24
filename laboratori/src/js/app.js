// Panel del Analista de Aceptaciones (US-02, US-03, US-04 + chat interno)
import {
  cargarDatosDashboard,
  aplicarDictamenHumano,
  guardarReporteCumplimiento,
  cargarBitacora,
  registrarAccionCorrectiva,
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
  abrirModal,
  descargarCSV,
  descargarXLSX
} from "./ui.js";

const $ = (id) => document.getElementById(id);
const USUARIO = sessionStorage.getItem("zf_usuario") || "analista@zofranca.cr";
const PAGE_SIZE = 5;

let solicitudes = [];
let reportes = [];
let bitacora = [];
let reportesCalculados = [];
let paginaActual = 1;
let filtroTexto = "";
let filtroEstado = "TODOS";
let filtroClasificacion = "TODAS";
let ordenAfinidad = "desc";
let filtroAlerta = "TODOS";

initComponentsGlobales();

const setTxt = (id, valor) => { const el = $(id); if (el) el.textContent = valor; };

// ---------- Protección de acceso ----------
if (sessionStorage.getItem("zf_rol") !== "analista") {
  mostrarToast("Acceso restringido: inicie sesión como analista.");
}

// ---------- Carga paralela ----------
async function refrescarDatos() {
  mostrarSpinner("Cargando datos del servidor...");
  try {
    const [datos, bitacoraData] = await Promise.all([cargarDatosDashboard(), cargarBitacora()]);
    solicitudes = datos.solicitudes;
    reportes = datos.reportes;
    bitacora = bitacoraData;
    renderKPIs();
    renderPanelAnalista();
    renderPanelAuditoria();
  } catch (error) {
    console.error(error);
    mostrarToast("Sin conexión con el backend (puerto 3000). Ejecute: npm start");
  } finally {
    ocultarSpinner();
  }
}

// ---------- KPIs ----------
function renderKPIs() {
  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE_EVALUACION").length;
  const aprobadas = solicitudes.filter((s) => s.estado === "APROBADA").length;
  const conIA = solicitudes.filter((s) => s.evaluacionIA?.puntajeAfinidad != null);
  const promedioIA = conIA.length
    ? Math.round(conIA.reduce((acc, s) => acc + s.evaluacionIA.puntajeAfinidad, 0) / conIA.length)
    : 0;
  const alertasRojas = reportesCalculadosFrescos().filter((x) => x.calc.estadoAlerta === "ALERTA_ROJA").length;

  setTxt("kpi-total", solicitudes.length);
  setTxt("kpi-pendientes", pendientes);
  setTxt("kpi-aprobadas", aprobadas);
  setTxt("kpi-ia-promedio", `${promedioIA}/100`);
  setTxt("kpi-alertas", alertasRojas);

  const badge = $("badge-alertas");
  badge.textContent = alertasRojas;
  badge.classList.toggle("hidden", alertasRojas === 0);
}

function calcularCumplimiento(reporte) {
  const pctInversion = reporte.inversionComprometida ? (reporte.inversionEjecutada / reporte.inversionComprometida) * 100 : null;
  const pctEmpleos = reporte.empleosComprometidos ? (reporte.empleosReales / reporte.empleosComprometidos) * 100 : null;
  const valores = [pctInversion, pctEmpleos].filter((v) => v !== null);
  const promedio = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
  let estadoAlerta = "SIN_DATOS";
  if (promedio !== null) {
    if (promedio >= 90) estadoAlerta = "CUMPLE";
    else if (promedio >= 70) estadoAlerta = "ALERTA_AMARILLA";
    else estadoAlerta = "ALERTA_ROJA";
  }
  return { pctInversion, pctEmpleos, promedio, estadoAlerta };
}

function reportesCalculadosFrescos() {
  return reportes.map((r) => ({ rep: r, calc: calcularCumplimiento(r) }));
}

// ---------- Bandeja del analista (US-02/US-03) ----------
function etiquetaClasificacion(clasificacion) {
  const mapa = {
    PRE_CLASIFICADA: '<span class="badge-ok">Pre-clasificada</span>',
    REQUIERE_REVISION: '<span class="badge-warning">Requiere revisión manual</span>',
    INCOMPLETA: '<span class="badge-alerta">Incompleta</span>'
  };
  return mapa[clasificacion] || '<span class="badge-neutral">SIN CLASIFICAR</span>';
}

function solicitudesFiltradas() {
  const q = filtroTexto.trim().toLowerCase();
  let lista = solicitudes.filter((s) => {
    const coincideTexto =
      !q ||
      String(s.empresaNombre || "").toLowerCase().includes(q) ||
      String(s.id || "").toLowerCase().includes(q) ||
      String(s.cedulaJuridica || "").toLowerCase().includes(q);
    const coincideEstado = filtroEstado === "TODOS" || s.estado === filtroEstado;
    const coincideClasificacion =
      filtroClasificacion === "TODAS" ||
      (s.clasificacion || "PRE_CLASIFICADA") === filtroClasificacion;
    return coincideTexto && coincideEstado && coincideClasificacion;
  });

  lista.sort((a, b) => {
    if (ordenAfinidad === "fecha")
      return new Date(b.fechaCreacion) - new Date(a.fechaCreacion);
    const pa = a.evaluacionIA?.puntajeAfinidad ?? -1;
    const pb = b.evaluacionIA?.puntajeAfinidad ?? -1;
    return ordenAfinidad === "desc" ? pb - pa : pa - pb;
  });
  return lista;
}

function renderPanelAnalista() {
  const filtradas = solicitudesFiltradas();
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  const pagina = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const tbody = $("container-solicitudes-pendientes");
  tbody.innerHTML = "";
  if (pagina.length === 0)
    tbody.innerHTML = '<tr><td colspan="8">Sin resultados para los filtros aplicados.</td></tr>';

  pagina.forEach((sol) => {
    const ia = sol.evaluacionIA || {};
    const fila = document.createElement("tr");

    const acciones =
      sol.estado === "PENDIENTE_EVALUACION"
        ? `<button class="btn-mini btn-aprobar" data-id="${sol.id}" data-accion="APROBADA">Aceptar</button>
           <button class="btn-mini btn-rechazar" data-id="${sol.id}" data-accion="RECHAZADA">Rechazar</button>
           <button class="btn-mini btn-historial" data-id="${sol.id}" title="Historial de evaluaciones">Historial</button>`
        : `<button class="btn-mini btn-historial" data-id="${sol.id}" title="Historial de evaluaciones">Historial</button>`;

    fila.innerHTML = `
      <td>${escapeHtml(sol.id)}</td>
      <td>
        <a href="#" class="link-expediente" data-id="${sol.id}" style="color:var(--teal-accent);font-weight:600;">
          ${escapeHtml(sol.empresaNombre)}
        </a>
        <br><small class="text-muted">${escapeHtml(sol.sector || "")} · ${escapeHtml(sol.cedulaJuridica || "s/cédula")}</small>
      </td>
      <td>${formatearUSD(sol.inversionProyectada)}</td>
      <td>${escapeHtml(sol.empleosDirectosProyectados ?? "-")}<br><small class="text-muted">+${escapeHtml(sol.empleosIndirectosProyectados ?? 0)} ind.</small></td>
      <td>
        <strong style="font-size:1.05rem;">${escapeHtml(ia.puntajeAfinidad ?? "-")}%</strong><br>
        ${badgeEstado(ia.nivelRecomendacion || "SIN_EVALUAR")}
        <br><small class="text-muted">${escapeHtml((ia.justificacion || "").slice(0, 90))}${(ia.justificacion || "").length > 90 ? "…" : ""}</small>
      </td>
      <td>${etiquetaClasificacion(sol.clasificacion)}</td>
      <td>${badgeEstado(sol.estado)}</td>
      <td class="acciones-cell">${acciones}</td>
    `;
    tbody.appendChild(fila);
  });

  setTxt("paginacion-info", `Página ${paginaActual} de ${totalPaginas} · ${filtradas.length} registro(s)`);
  $("btn-prev").disabled = paginaActual <= 1;
  $("btn-next").disabled = paginaActual >= totalPaginas;
}

// ---------- Expediente completo (US-03: desglose explicativo) ----------
function verExpediente(id) {
  const s = solicitudes.find((x) => x.id === id);
  if (!s) return;
  const ia = s.evaluacionIA || {};
  const desglose = (ia.desglose || [])
    .map(
      (d) => `<li>${d.cumple ? "✅" : "❌"} ${escapeHtml(d.criterio)} — peso ${d.peso}%</li>`
    )
    .join("");

  const html = `
    <table style="width:100%;font-size:.85rem;">
      <tr><td><strong>Cédula Jurídica</strong></td><td>${escapeHtml(s.cedulaJuridica || "-")}</td></tr>
      <tr><td><strong>Teléfono</strong></td><td>${escapeHtml(s.telefono || "-")}</td></tr>
      <tr><td><strong>Sector</strong></td><td>${escapeHtml(s.sector || "-")}</td></tr>
      <tr><td><strong>Inversión</strong></td><td>${formatearUSD(s.inversionProyectada)}</td></tr>
      <tr><td><strong>Empleos</strong></td><td>${escapeHtml(s.empleosDirectosProyectados ?? "-")} directos + ${escapeHtml(s.empleosIndirectosProyectados ?? 0)} indirectos</td></tr>
      <tr><td><strong>Documento</strong></td><td>${escapeHtml(s.archivoAdjunto || "-")} (${s.tamanoArchivoMB ?? 0} MB)</td></tr>
    </table>
    <p style="margin-top:10px;"><strong>Pitch:</strong><br><em>"${escapeHtml(s.pitch || "Sin pitch presentado.")}"</em></p>
    <p style="margin-top:10px;"><strong>Afinidad IA: ${ia.puntajeAfinidad ?? "-"}%</strong> ${badgeEstado(ia.nivelRecomendacion || "")}</p>
    ${desglose ? `<ul class="timeline" style="margin-bottom:4px;">${desglose}</ul>` : ""}
    <p class="text-muted">${escapeHtml(ia.justificacion || "")}</p>`;
  return abrirModal({ titulo: `Expediente — ${s.id} · ${s.empresaNombre}`, contenidoHTML: html, modoInfo: true });
}

// ---------- Dictamen con justificación obligatoria ----------
async function manejarAccionesAnalista(event) {
  const link = event.target.closest(".link-expediente");
  if (link) return verExpediente(link.dataset.id);

  const btnHistorial = event.target.closest(".btn-historial");
  if (btnHistorial) return verHistorial(btnHistorial.dataset.id);

  const btn = event.target.closest(".btn-mini[data-accion]");
  if (!btn) return;

  const { id, accion } = btn.dataset;
  const observaciones = await abrirModal({
    titulo: `Dictamen ${accion} — ${id}`,
    mensaje:
      accion === "APROBADA"
        ? "La justificación se enviará al buzón de la empresa y sus datos se exportarán automáticamente a Excel:"
        : "La justificación se enviará al buzón de la empresa solicitante:",
    entrada: true,
    textoAceptar: `Confirmar ${accion}`
  });
  if (observaciones === null) return;
  if (!observaciones.trim()) return mostrarToast("La justificación es obligatoria.");

  mostrarSpinner(`Aplicando dictamen ${accion} a ${id}...`);
  try {
    await aplicarDictamenHumano(id, accion, USUARIO, observaciones.trim());
    if (accion === "APROBADA") await exportarAceptadasXLSX([solicitudes.find((s) => s.id === id)]);
    mostrarToast(`Dictamen ${accion} aplicado a ${id}, notificado a la empresa y registrado en bitácora.`, "success");
    await refrescarDatos();
  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error al aplicar el dictamen.");
  } finally {
    ocultarSpinner();
  }
}

// Exportación automática .xlsx de empresas aceptadas
async function exportarAceptadasXLSX(lista) {
  const filas = (lista || solicitudes.filter((s) => s.estado === "APROBADA")).map((s) => ({
    Nombre: s.empresaNombre,
    Cedula: s.cedulaJuridica || "",
    Sector: s.sector,
    InversionUSD: s.inversionProyectada,
    Empleos: s.empleosDirectosProyectados,
    FechaAprobacion: s.fechaAprobacion ? new Date(s.fechaAprobacion).toLocaleDateString() : ""
  }));
  if (filas.length) await descargarXLSX("empresas_aceptadas_zofranca.xlsx", filas, "Empresas Aceptadas");
}

function verHistorial(id) {
  const movimientos = bitacora.filter((b) => b.solicitudId === id).slice().reverse();
  const html = movimientos.length
    ? `<ul class="timeline">${movimientos
        .map(
          (m) => `<li><strong>${escapeHtml(m.accion)}</strong><br>
          ${escapeHtml(m.usuario)} · ${new Date(m.timestamp).toLocaleString()}<br>
          <span class="text-muted">${escapeHtml(m.observaciones || "Sin observaciones")}</span></li>`
        )
        .join("")}</ul>`
    : '<p class="text-muted">Sin movimientos registrados para esta solicitud.</p>';
  return abrirModal({ titulo: `Historial — ${id}`, contenidoHTML: html, modoInfo: true });
}

// ---------- Cumplimiento ----------
async function manejarReporteCumplimiento(event) {
  event.preventDefault();
  const empresaId = $("empresaIdCumplimiento").value.trim().toUpperCase();
  const inversionEjecutada = Number($("inversionEjecutada").value);
  const empleosReales = Number($("empleosReales").value);

  if (!empresaId || isNaN(inversionEjecutada) || isNaN(empleosReales))
    return mostrarToast("Complete todos los campos del reporte de cumplimiento.");

  const empresa = solicitudes.find((s) => s.id === empresaId);
  if (!empresa) return mostrarToast(`No existe una empresa con el ID ${empresaId}.`);
  if (empresa.estado !== "APROBADA") return mostrarToast(`${empresaId} no está aprobada; solo empresas instaladas pueden reportar.`);

  mostrarSpinner("Registrando reporte de cumplimiento...");
  try {
    await guardarReporteCumplimiento({
      id: "REP-" + String(Date.now()).slice(-6),
      empresaId,
      empresaNombre: empresa.empresaNombre,
      inversionComprometida: empresa.inversionProyectada,
      empleosComprometidos: empresa.empleosDirectosProyectados,
      inversionEjecutada,
      empleosReales
    });
    mostrarToast(`Reporte de cumplimiento de ${empresaId} registrado.`, "success");
    event.target.reset();
    await refrescarDatos();
  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error al registrar el reporte.");
  } finally {
    ocultarSpinner();
  }
}

// ---------- Alertas con acción correctiva (US-04) ----------
function renderPanelAuditoria() {
  reportesCalculados = reportesCalculadosFrescos();
  const visibles = reportesCalculados.filter((x) => filtroAlerta === "TODOS" || x.calc.estadoAlerta === filtroAlerta);

  const tbody = $("container-alertas-cumplimiento");
  tbody.innerHTML = "";
  if (visibles.length === 0)
    tbody.innerHTML = '<tr><td colspan="6">No hay reportes que coincidan con el filtro.</td></tr>';

  visibles.forEach(({ rep, calc }) => {
    const fila = document.createElement("tr");
    const requiereAccion = calc.estadoAlerta !== "CUMPLE" && calc.estadoAlerta !== "SIN_DATOS";
    fila.innerHTML = `
      <td>${escapeHtml(rep.id)}</td>
      <td>${escapeHtml(rep.empresaNombre || rep.empresaId)}</td>
      <td>Inv: ${formatearUSD(rep.inversionComprometida)} → ${formatearUSD(rep.inversionEjecutada)}<br>
          Emp: ${escapeHtml(rep.empleosComprometidos ?? "-")} → ${escapeHtml(rep.empleosReales ?? "-")}</td>
      <td>${calc.promedio === null ? "-" : calc.promedio.toFixed(1) + "%"}</td>
      <td>${badgeEstado(calc.estadoAlerta)}</td>
      <td>${requiereAccion
        ? `<button class="btn-mini btn-reevaluar btn-correctiva" data-rep="${rep.id}">Registrar acción</button>`
        : '<span class="text-muted">—</span>'}</td>
    `;
    tbody.appendChild(fila);
  });

  renderBitacora();
}

async function manejarAccionCorrectiva(event) {
  const btn = event.target.closest(".btn-correctiva");
  if (!btn) return;
  const item = reportesCalculados.find(({ rep }) => rep.id === btn.dataset.rep);
  if (!item) return;

  const detalle = await abrirModal({
    titulo: `Acción correctiva — ${item.rep.empresaNombre}`,
    mensaje: `Cumplimiento promedio: ${(item.calc.promedio ?? 0).toFixed(1)}% (${item.calc.estadoAlerta}). Describa la acción preventiva o correctiva:`,
    entrada: true,
    textoAceptar: "Registrar"
  });
  if (!detalle?.trim()) return mostrarToast("El detalle de la acción es obligatorio.");

  try {
    await registrarAccionCorrectiva({
      empresaId: item.rep.empresaId,
      empresaNombre: item.rep.empresaNombre,
      usuario: USUARIO,
      accion: "CORRECTIVA",
      detalle: detalle.trim()
    });
    mostrarToast("Acción correctiva registrada en la bitácora de auditoría.", "success");
    await refrescarDatos();
  } catch (e) {
    mostrarToast(e.message || "Error registrando la acción.");
  }
}

function renderBitacora() {
  const tbody = $("container-bitacora");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (bitacora.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Sin movimientos de auditoría.</td></tr>';
    return;
  }
  bitacora.slice().reverse().forEach((entry) => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${new Date(entry.timestamp).toLocaleString()}</td>
      <td>${escapeHtml(entry.usuario)}</td>
      <td>${escapeHtml(entry.solicitudId)}</td>
      <td>${escapeHtml(entry.accion)}</td>
      <td>${escapeHtml(entry.observaciones || "-")}</td>`;
    tbody.appendChild(fila);
  });
}

// ---------- Chat interno con administración ----------
async function refrescarChat() {
  try {
    const todos = await cargarMensajes();
    const relevantes = todos.filter(
      (m) =>
        (m.de === USUARIO && m.para === "admin@zofranca.cr") ||
        (m.de === "admin@zofranca.cr" && m.para === USUARIO)
    );
    $("chat-historial-analista").innerHTML = relevantes
      .map(
        (m) =>
          `<div class="chat-msg ${m.de === USUARIO ? "user" : "bot"}"><strong>${m.de === USUARIO ? "Yo" : "Admin"}</strong><br>${escapeHtml(m.texto)}<br><small>${new Date(m.timestamp).toLocaleTimeString()}</small></div>`
      )
      .join("");
    const h = $("chat-historial-analista");
    h.scrollTop = h.scrollHeight;
  } catch { /* silencioso */ }
}

$("chat-form-analista").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("chat-input-analista").value.trim();
  if (!texto) return;
  await enviarMensaje({ de: USUARIO, para: "admin@zofranca.cr", texto });
  $("chat-input-analista").value = "";
  refrescarChat();
});

setInterval(() => {
  if (!$("sec-chat").classList.contains("hidden")) refrescarChat();
}, 4000);

// ---------- Navegación ----------
document.querySelectorAll(".nav-btn[data-section]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modulo-seccion").forEach((sec) => sec.classList.add("hidden"));
    $(btn.dataset.section).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

$("btn-notificaciones").addEventListener("click", () => {
  mostrarSeccionYScroll("sec-auditoria");
});
function mostrarSeccionYScroll(id) {
  document.querySelector(`[data-section="${id}"]`)?.click();
}

// ---------- Inicialización ----------
document.addEventListener("DOMContentLoaded", () => {
  setTxt("usuario-actual", USUARIO);

  $("container-solicitudes-pendientes").addEventListener("click", manejarAccionesAnalista);
  $("container-alertas-cumplimiento").addEventListener("click", manejarAccionCorrectiva);

  $("filtro-busqueda").addEventListener("input", (e) => { filtroTexto = e.target.value; paginaActual = 1; renderPanelAnalista(); });
  $("filtro-estado").addEventListener("change", (e) => { filtroEstado = e.target.value; paginaActual = 1; renderPanelAnalista(); });
  $("filtro-clasificacion").addEventListener("change", (e) => { filtroClasificacion = e.target.value; paginaActual = 1; renderPanelAnalista(); });
  $("orden-afinidad").addEventListener("change", (e) => { ordenAfinidad = e.target.value; renderPanelAnalista(); });
  $("filtro-alerta").addEventListener("change", (e) => { filtroAlerta = e.target.value; renderPanelAuditoria(); });

  $("btn-prev").addEventListener("click", () => { if (paginaActual > 1) { paginaActual--; renderPanelAnalista(); } });
  $("btn-next").addEventListener("click", () => { paginaActual++; renderPanelAnalista(); });

  $("btn-exportar-xlsx").addEventListener("click", () => exportarAceptadasXLSX());
  $("btn-exportar-reportes").addEventListener("click", () =>
    descargarCSV(
      "cumplimiento_zofranca.csv",
      reportesCalculados.map(({ rep, calc }) => ({
        ID: rep.id,
        Empresa: rep.empresaNombre || rep.empresaId,
        Inversion_Comprometida: rep.inversionComprometida,
        Inversion_Ejecutada: rep.inversionEjecutada,
        Empleos_Comprometidos: rep.empleosComprometidos,
        Empleos_Reales: rep.empleosReales,
        Porcentaje: calc.promedio === null ? "" : calc.promedio.toFixed(1),
        Alerta: calc.estadoAlerta,
        Fecha: rep.fechaReporte ? new Date(rep.fechaReporte).toLocaleString() : ""
      }))
    )
  );

  $("form-cumplimiento").addEventListener("submit", manejarReporteCumplimiento);

  refrescarDatos();
  refrescarChat();
});
