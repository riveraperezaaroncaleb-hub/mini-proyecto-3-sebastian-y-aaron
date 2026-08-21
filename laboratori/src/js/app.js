import {
  cargarDatosDashboard,
  guardarSolicitud,
  aplicarDictamenHumano,
  actualizarEvaluacionIA,
  guardarReporteCumplimiento,
  cargarBitacora
} from "./apiService.js";
import { evaluarSolicitudConIA } from "./iaService.js";
import { validarArchivoAdjunto, validarFormularioSolicitud } from "./validaciones.js";
import {
  escapeHtml,
  formatearUSD,
  badgeEstado,
  mostrarToast,
  mostrarSpinner,
  ocultarSpinner,
  abrirModal,
  descargarCSV
} from "./ui.js";

const ANALISTA_ACTUAL = "analista@zofranca.cr";
const PAGE_SIZE = 5;

let solicitudes = [];
let reportes = [];
let bitacora = [];
let reportesCalculados = [];
let paginaActual = 1;
let filtroTexto = "";
let filtroEstado = "TODOS";
let filtroAlerta = "TODOS";

const setTxt = (id, valor) => {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
};

// ---------- RF-16: carga en paralelo ----------
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

// ---------- KPIs del dashboard ----------
function renderKPIs() {
  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE_EVALUACION").length;
  const aprobadas = solicitudes.filter((s) => s.estado === "APROBADA").length;
  const conIA = solicitudes.filter((s) => s.evaluacionIA?.puntajeAfinidad != null);
  const promedioIA = conIA.length
    ? Math.round(conIA.reduce((acc, s) => acc + s.evaluacionIA.puntajeAfinidad, 0) / conIA.length)
    : 0;
  const alertasRojas = reportesCalculadosFrescos().filter(
    (x) => x.calc.estadoAlerta === "ALERTA_ROJA"
  ).length;

  setTxt("kpi-total", solicitudes.length);
  setTxt("kpi-pendientes", pendientes);
  setTxt("kpi-aprobadas", aprobadas);
  setTxt("kpi-ia-promedio", `${promedioIA}/100`);
  setTxt("kpi-alertas", alertasRojas);
}

function calcularCumplimiento(reporte) {
  const pctInversion = reporte.inversionComprometida
    ? (reporte.inversionEjecutada / reporte.inversionComprometida) * 100
    : null;
  const pctEmpleos = reporte.empleosComprometidos
    ? (reporte.empleosReales / reporte.empleosComprometidos) * 100
    : null;
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

// ---------- HU-01: envío de solicitud ----------
async function manejarEnvioSolicitud(event) {
  event.preventDefault();

  const archivoInput = document.getElementById("documentosAdjuntos");
  const errorFile = document.getElementById("error-file");
  const archivo = archivoInput.files[0] || null;

  const campos = {
    empresaNombre: document.getElementById("empresaNombre").value.trim(),
    sector: document.getElementById("sectorEmpresa").value,
    inversionProyectada: document.getElementById("inversionProyectada").value,
    empleosDirectosProyectados: document.getElementById("empleosProyectados").value
  };

  const validacionForm = validarFormularioSolicitud(campos);
  if (!validacionForm.valido) {
    mostrarToast(validacionForm.errores[0]);
    return;
  }

  // RF-02: validación estricta de archivo adjunto (PDF, máx 10MB)
  const validacionArchivo = validarArchivoAdjunto(archivo);
  if (!validacionArchivo.valido) {
    errorFile.textContent = validacionArchivo.mensaje;
    errorFile.style.display = "block";
    mostrarToast(validacionArchivo.mensaje);
    return;
  }
  errorFile.style.display = "none";

  const solicitudData = {
    id: generarIdEmpresa(),
    empresaNombre: campos.empresaNombre,
    sector: campos.sector,
    inversionProyectada: Number(campos.inversionProyectada),
    empleosDirectosProyectados: Number(campos.empleosDirectosProyectados)
  };

  mostrarSpinner("Validando datos del formulario...");
  try {
    // RF-04/RF-06: pre-clasificación IA con timeout de 5s y fallback local
    mostrarSpinner(`Pre-clasificación IA en curso para ${solicitudData.empresaNombre} (máx 5s)...`);
    const evaluacionIA = await evaluarSolicitudConIA(solicitudData);

    mostrarSpinner("Guardando solicitud en el servidor...");
    await guardarSolicitud(solicitudData, evaluacionIA, archivo);

    ocultarSpinner();
    renderResultadoIA(solicitudData, evaluacionIA);

    const origen = evaluacionIA.esFallback ? " (vía Fallback local)" : "";
    mostrarToast(
      `Solicitud ${solicitudData.id} registrada. IA: ${evaluacionIA.nivelRecomendacion} (${evaluacionIA.puntajeAfinidad} pts)${origen}.`,
      "success"
    );
    event.target.reset();
    await refrescarDatos();
  } catch (error) {
    console.error(error);
    ocultarSpinner();
    mostrarToast(error.message || "Error al registrar la solicitud.");
  }
}

function generarIdEmpresa() {
  let id;
  do {
    id = "EMP-" + String(Date.now()).slice(-6);
  } while (solicitudes.some((s) => s.id === id));
  return id;
}

// ---------- Visualización de la pre-selección IA (RF-04/RF-05) ----------
function renderResultadoIA(solicitud, ia) {
  const card = document.getElementById("resultado-ia");
  if (!card) return;

  setTxt("ia-id", `${solicitud.id} - ${solicitud.empresaNombre}`);
  setTxt("ia-puntaje", `${ia.puntajeAfinidad} / 100 pts`);
  document.getElementById("ia-nivel").innerHTML = badgeEstado(ia.nivelRecomendacion);
  document.getElementById("ia-motor").innerHTML = ia.esFallback
    ? '<span class="badge-warning">FALLBACK LOCAL</span> (la IA no respondió en 5s; algoritmo de contingencia)'
    : '<span class="badge-ok">MOTOR IA</span> (respuesta oportuna)';
  setTxt("ia-justificacion", ia.justificacion);
  setTxt("ia-fecha", new Date(ia.fechaEvaluacion).toLocaleString());

  card.classList.remove("hidden");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- HU-02/HU-03: panel analista (filtros + paginación) ----------
function solicitudesFiltradas() {
  const q = filtroTexto.trim().toLowerCase();
  return solicitudes.filter((s) => {
    const coincideTexto =
      !q ||
      String(s.empresaNombre || "").toLowerCase().includes(q) ||
      String(s.id || "").toLowerCase().includes(q);
    const coincideEstado = filtroEstado === "TODOS" || s.estado === filtroEstado;
    return coincideTexto && coincideEstado;
  });
}

function renderPanelAnalista() {
  const filtradas = solicitudesFiltradas();
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  const pagina = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const tbody = document.getElementById("container-solicitudes-pendientes");
  tbody.innerHTML = "";

  if (pagina.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Sin resultados para los filtros aplicados.</td></tr>';
  }

  pagina.forEach((sol) => {
    const ia = sol.evaluacionIA || {};
    const fila = document.createElement("tr");

    const acciones =
      sol.estado === "PENDIENTE_EVALUACION"
        ? `<button class="btn-mini btn-aprobar" data-id="${sol.id}" data-accion="APROBADA">Aprobar</button>
           <button class="btn-mini btn-rechazar" data-id="${sol.id}" data-accion="RECHAZADA">Rechazar</button>
           <button class="btn-mini btn-reevaluar" data-id="${sol.id}" title="Re-evaluar con IA">IA</button>
           <button class="btn-mini btn-historial" data-id="${sol.id}" title="Ver historial">Historial</button>`
        : `<button class="btn-mini btn-historial" data-id="${sol.id}" title="Ver historial">Historial</button>`;

    fila.innerHTML = `
      <td>${escapeHtml(sol.id)}</td>
      <td>${escapeHtml(sol.empresaNombre)}<br><small class="text-muted">${escapeHtml(sol.sector || "")}</small></td>
      <td>${formatearUSD(sol.inversionProyectada)}</td>
      <td>${escapeHtml(sol.empleosDirectosProyectados ?? "-")}</td>
      <td>
        ${badgeEstado(ia.nivelRecomendacion || "SIN_EVALUAR")}
        <strong>${escapeHtml(ia.puntajeAfinidad ?? "-")} pts</strong>
        ${ia.esFallback ? '<br><small class="ia-fallback">Fallback local</small>' : ""}
        <br><small class="text-muted">${escapeHtml(ia.justificacion || "")}</small>
      </td>
      <td>${badgeEstado(sol.estado)}</td>
      <td class="acciones-cell">${acciones}</td>
    `;
    tbody.appendChild(fila);
  });

  setTxt(
    "paginacion-info",
    `Página ${paginaActual} de ${totalPaginas} · ${filtradas.length} registro(s)`
  );
  document.getElementById("btn-prev").disabled = paginaActual <= 1;
  document.getElementById("btn-next").disabled = paginaActual >= totalPaginas;
}

async function manejarAccionesAnalista(event) {
  const btnHistorial = event.target.closest(".btn-historial");
  if (btnHistorial) return verHistorial(btnHistorial.dataset.id);

  const btnReevaluar = event.target.closest(".btn-reevaluar");
  if (btnReevaluar) return reevaluarConIA(btnReevaluar.dataset.id);

  const btn = event.target.closest(".btn-mini[data-accion]");
  if (!btn) return;

  const { id, accion } = btn.dataset;
  // Modal propio (reemplaza prompt nativo) con límite de caracteres
  const observaciones = await abrirModal({
    titulo: `Dictamen ${accion} — ${id}`,
    mensaje: "Confirme el dictamen. Las observaciones quedan registradas en la bitácora (RF-14):",
    entrada: true,
    textoAceptar: `Confirmar ${accion}`
  });
  if (observaciones === null) return;

  mostrarSpinner(`Aplicando dictamen ${accion} a ${id}...`);
  try {
    // RF-09: dictamen humano + RF-14: trazabilidad
    await aplicarDictamenHumano(id, accion, ANALISTA_ACTUAL, observaciones.trim());
    mostrarToast(`Dictamen ${accion} aplicado a ${id} y registrado en bitácora.`, "success");
    await refrescarDatos();
  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error al aplicar el dictamen.");
  } finally {
    ocultarSpinner();
  }
}

// Re-evaluación automática con el motor IA (RF-04/RF-06)
async function reevaluarConIA(id) {
  const solicitud = solicitudes.find((s) => s.id === id);
  if (!solicitud) return;

  mostrarSpinner(`Re-evaluando ${id} con el motor IA (máx 5s)...`);
  try {
    const evaluacionIA = await evaluarSolicitudConIA(solicitud);
    await actualizarEvaluacionIA(id, evaluacionIA);
    ocultarSpinner();
    renderResultadoIA(solicitud, evaluacionIA);
    mostrarToast(
      `${id}: IA sugiere ${evaluacionIA.nivelRecomendacion} (${evaluacionIA.puntajeAfinidad} pts)${evaluacionIA.esFallback ? " [Fallback local]" : ""}.`,
      "success"
    );
    await refrescarDatos();
  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error en la re-evaluación IA.");
  } finally {
    ocultarSpinner();
  }
}

// Historial por solicitud (RF-14)
function verHistorial(id) {
  const movimientos = bitacora.filter((b) => b.solicitudId === id).slice().reverse();
  const html = movimientos.length
    ? `<ul class="timeline">${movimientos
        .map(
          (m) => `
        <li><strong>${escapeHtml(m.accion)}</strong><br>
        ${escapeHtml(m.usuario)} · ${new Date(m.timestamp).toLocaleString()}<br>
        <span class="text-muted">${escapeHtml(m.observaciones || "Sin observaciones")}</span></li>`
        )
        .join("")}</ul>`
    : '<p class="text-muted">Sin movimientos registrados para esta solicitud.</p>';

  return abrirModal({ titulo: `Historial — ${id}`, contenidoHTML: html, modoInfo: true });
}

// ---------- HU-04: reporte de cumplimiento ----------
async function manejarReporteCumplimiento(event) {
  event.preventDefault();

  const empresaId = document.getElementById("empresaIdCumplimiento").value.trim().toUpperCase();
  const inversionEjecutada = Number(document.getElementById("inversionEjecutada").value);
  const empleosReales = Number(document.getElementById("empleosReales").value);

  if (!empresaId || !inversionEjecutada || !empleosReales) {
    mostrarToast("Complete todos los campos del reporte de cumplimiento.");
    return;
  }

  const empresa = solicitudes.find((s) => s.id === empresaId);
  if (!empresa) {
    mostrarToast(`No existe una empresa con el ID ${empresaId}.`);
    return;
  }
  if (empresa.estado !== "APROBADA") {
    mostrarToast(`${empresaId} no está aprobada; solo empresas instaladas pueden reportar.`);
    return;
  }

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

// ---------- HU-05: monitor de alertas ----------
function renderPanelAuditoria() {
  reportesCalculados = reportesCalculadosFrescos();
  const visibles = reportesCalculados.filter(
    (x) => filtroAlerta === "TODOS" || x.calc.estadoAlerta === filtroAlerta
  );

  const tbody = document.getElementById("container-alertas-cumplimiento");
  tbody.innerHTML = "";

  if (visibles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No hay reportes que coincidan con el filtro.</td></tr>';
  }

  visibles.forEach(({ rep, calc }) => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${escapeHtml(rep.id)}</td>
      <td>${escapeHtml(rep.empresaNombre || rep.empresaId)}</td>
      <td>Inv: ${formatearUSD(rep.inversionComprometida)} → ${formatearUSD(rep.inversionEjecutada)}<br>
          Emp: ${escapeHtml(rep.empleosComprometidos ?? "-")} → ${escapeHtml(rep.empleosReales ?? "-")}</td>
      <td>${calc.promedio === null ? "-" : calc.promedio.toFixed(1) + "%"}</td>
      <td>${badgeEstado(calc.estadoAlerta)}</td>
    `;
    tbody.appendChild(fila);
  });

  renderBitacora();
}

function renderBitacora() {
  const tbody = document.getElementById("container-bitacora");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (bitacora.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Sin movimientos de auditoría.</td></tr>';
    return;
  }

  bitacora
    .slice()
    .reverse()
    .forEach((entry) => {
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${new Date(entry.timestamp).toLocaleString()}</td>
        <td>${escapeHtml(entry.usuario)}</td>
        <td>${escapeHtml(entry.solicitudId)}</td>
        <td>${escapeHtml(entry.accion)}</td>
        <td>${escapeHtml(entry.observaciones || "-")}</td>
      `;
      tbody.appendChild(fila);
    });
}

// ---------- Exportación CSV ----------
function exportarSolicitudesCSV() {
  descargarCSV(
    "solicitudes_zofranca.csv",
    solicitudesFiltradas().map((s) => ({
      ID: s.id,
      Empresa: s.empresaNombre,
      Sector: s.sector,
      InversionUSD: s.inversionProyectada,
      Empleos: s.empleosDirectosProyectados,
      IA_Nivel: s.evaluacionIA?.nivelRecomendacion ?? "",
      IA_Puntaje: s.evaluacionIA?.puntajeAfinidad ?? "",
      Fallback: s.evaluacionIA?.esFallback ? "SI" : "NO",
      Estado: s.estado,
      Fecha: s.fechaCreacion ? new Date(s.fechaCreacion).toLocaleString() : ""
    }))
  );
}

function exportarReportesCSV() {
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
  );
}

// ---------- Navegación ----------
function mostrarSeccion(idSeccion) {
  document.querySelectorAll(".modulo-seccion").forEach((sec) => sec.classList.add("hidden"));
  document.getElementById(idSeccion).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === idSeccion);
  });
}

// ---------- Inicialización ----------
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => mostrarSeccion(btn.dataset.section));
  });

  document.getElementById("form-solicitud").addEventListener("submit", manejarEnvioSolicitud);
  document.getElementById("form-cumplimiento").addEventListener("submit", manejarReporteCumplimiento);
  document
    .getElementById("container-solicitudes-pendientes")
    .addEventListener("click", manejarAccionesAnalista);

  document.getElementById("filtro-busqueda").addEventListener("input", (e) => {
    filtroTexto = e.target.value;
    paginaActual = 1;
    renderPanelAnalista();
  });
  document.getElementById("filtro-estado").addEventListener("change", (e) => {
    filtroEstado = e.target.value;
    paginaActual = 1;
    renderPanelAnalista();
  });
  document.getElementById("filtro-alerta").addEventListener("change", (e) => {
    filtroAlerta = e.target.value;
    renderPanelAuditoria();
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    if (paginaActual > 1) { paginaActual--; renderPanelAnalista(); }
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    paginaActual++; renderPanelAnalista();
  });

  document.getElementById("btn-exportar-solicitudes").addEventListener("click", exportarSolicitudesCSV);
  document.getElementById("btn-exportar-reportes").addEventListener("click", exportarReportesCSV);

  refrescarDatos();
});
