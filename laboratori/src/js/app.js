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

const ANALISTA_ACTUAL = "analista@zofranca.cr";
const SECTORES_ESTRATEGICOS = ["Ciencias de la Vida", "Manufactura Avanzada", "Servicios", "Logística"];

let solicitudes = [];
let reportes = [];

// ---------- Utilidades UI (RF-02: Spinner / Fallback UI) ----------
const spinner = document.getElementById("loading-spinner");
const spinnerTexto = document.getElementById("spinner-text");
const toast = document.getElementById("toast-error");
const toastMensaje = document.getElementById("toast-message");

function mostrarSpinner(mensaje = "Procesando petición asíncrona...") {
  if (spinnerTexto) spinnerTexto.textContent = mensaje;
  spinner.classList.remove("hidden");
}

function ocultarSpinner() {
  spinner.classList.add("hidden");
}

function mostrarToast(mensaje, tipo = "error") {
  toastMensaje.textContent = mensaje;
  toast.classList.remove("toast-success", "toast-error");
  toast.classList.add(tipo === "success" ? "toast-success" : "toast-error");
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 5000);
}

function formatearUSD(monto) {
  return `$${Number(monto || 0).toLocaleString("en-US")} USD`;
}

function badgeEstado(estado) {
  switch (estado) {
    case "APROBADA":
    case "RECOMENDADA":
    case "CUMPLE":
      return '<span class="badge-ok">' + estado + "</span>";
    case "PENDIENTE_EVALUACION":
    case "REVISAR":
    case "ALERTA_AMARILLA":
      return '<span class="badge-warning">' + estado + "</span>";
    default:
      return '<span class="badge-alerta">' + estado + "</span>";
  }
}

// ---------- Navegación entre secciones ----------
function mostrarSeccion(idSeccion) {
  document.querySelectorAll(".modulo-seccion").forEach((sec) => sec.classList.add("hidden"));
  document.getElementById(idSeccion).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === idSeccion);
  });
}

// ---------- Carga de datos (RF-16: carga en paralelo) ----------
async function refrescarDatos() {
  mostrarSpinner("Cargando datos del servidor (RF-16)...");
  try {
    const datos = await cargarDatosDashboard();
    solicitudes = datos.solicitudes;
    reportes = datos.reportes;
    renderPanelAnalista();
    renderPanelAuditoria();
  } catch (error) {
    mostrarToast("No se pudo conectar con json-server. Verifique que esté corriendo en el puerto 3000.");
  } finally {
    ocultarSpinner();
  }
}

// ---------- HU-01: Registro y envío de solicitud ----------
async function manejarEnvioSolicitud(event) {
  event.preventDefault();

  const archivoInput = document.getElementById("documentosAdjuntos");
  const errorFile = document.getElementById("error-file");
  const archivo = archivoInput.files[0] || null;

  const campos = {
    empresaNombre: document.getElementById("empresaNombre").value,
    sector: document.getElementById("sectorEmpresa").value,
    inversionProyectada: document.getElementById("inversionProyectada").value,
    empleosDirectosProyectados: document.getElementById("empleosProyectados").value
  };

  const validacionForm = validarFormularioSolicitud(campos);
  if (!validacionForm.valido) {
    mostrarToast(validacionForm.errores[0]);
    return;
  }

  // RF-02: Validación estricta de archivo adjunto (PDF, máx 10MB)
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
    empresaNombre: campos.empresaNombre.trim(),
    sector: campos.sector,
    inversionProyectada: Number(campos.inversionProyectada),
    empleosDirectosProyectados: Number(campos.empleosDirectosProyectados)
  };

  mostrarSpinner("Validando datos del formulario...");
  try {
    // RF-04/RF-06: Pre-clasificación IA con timeout de 5s y fallback local
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
    mostrarToast(error.message || "Error al registrar la solicitud. Intente nuevamente.");
  }
}

// ---------- Visualización de la pre-selección IA (RF-04/RF-05) ----------
function renderResultadoIA(solicitud, ia) {
  const card = document.getElementById("resultado-ia");
  if (!card) return;

  document.getElementById("ia-id").textContent = `${solicitud.id} - ${solicitud.empresaNombre}`;
  document.getElementById("ia-puntaje").textContent = `${ia.puntajeAfinidad} / 100 pts`;
  document.getElementById("ia-nivel").innerHTML = badgeEstado(ia.nivelRecomendacion);
  document.getElementById("ia-motor").innerHTML = ia.esFallback
    ? '<span class="badge-warning">FALLBACK LOCAL</span> (la IA no respondió en 5s; algoritmo de contingencia)'
    : '<span class="badge-ok">MOTOR IA</span> (respuesta oportuna)';
  document.getElementById("ia-justificacion").textContent = ia.justificacion;
  document.getElementById("ia-fecha").textContent = new Date(ia.fechaEvaluacion).toLocaleString();

  card.classList.remove("hidden");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function generarIdEmpresa() {
  let id;
  do {
    id = "EMP-" + String(Date.now()).slice(-6);
  } while (solicitudes.some((s) => s.id === id));
  return id;
}

// ---------- HU-02 / HU-03: Panel del analista ----------
function renderPanelAnalista() {
  const tbody = document.getElementById("container-solicitudes-pendientes");
  tbody.innerHTML = "";

  if (solicitudes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">No hay solicitudes registradas.</td></tr>';
    return;
  }

  solicitudes.forEach((sol) => {
    const ia = sol.evaluacionIA || {};
    const fila = document.createElement("tr");

    const acciones =
      sol.estado === "PENDIENTE_EVALUACION"
        ? `<button class="btn-mini btn-aprobar" data-id="${sol.id}" data-accion="APROBADA">Aprobar</button>
           <button class="btn-mini btn-rechazar" data-id="${sol.id}" data-accion="RECHAZADA">Rechazar</button>
           <button class="btn-mini btn-reevaluar" data-id="${sol.id}">Re-evaluar IA</button>`
        : '<span class="text-muted">Dictamen emitido</span>';

    fila.innerHTML = `
      <td>${sol.id}</td>
      <td>${sol.empresaNombre}<br><small class="text-muted">${sol.sector || ""}</small></td>
      <td>${formatearUSD(sol.inversionProyectada)}</td>
      <td>${sol.empleosDirectosProyectados ?? "-"}</td>
      <td>
        ${badgeEstado(ia.nivelRecomendacion || "SIN_EVALUAR")}
        <strong>${ia.puntajeAfinidad ?? "-"} pts</strong>
        ${ia.esFallback ? '<br><small class="ia-fallback">Fallback local</small>' : ""}
        <br><small class="text-muted">${ia.justificacion || ""}</small>
      </td>
      <td>${badgeEstado(sol.estado)}</td>
      <td class="acciones-cell">${acciones}</td>
    `;
    tbody.appendChild(fila);
  });
}

async function manejarAccionesAnalista(event) {
  const btnReevaluar = event.target.closest(".btn-reevaluar");
  if (btnReevaluar) {
    await reevaluarConIA(btnReevaluar.dataset.id);
    return;
  }

  const btn = event.target.closest(".btn-mini[data-accion]");
  if (!btn) return;

  const { id, accion } = btn.dataset;
  const observaciones = prompt(`Observaciones del dictamen (${accion}) para ${id}:`, "");
  if (observaciones === null) return;

  mostrarSpinner(`Aplicando dictamen ${accion} a ${id}...`);
  try {
    // RF-09: Dictamen humano (Human-in-the-Loop) + RF-14: trazabilidad en bitácora
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
    mostrarSeccion("sec-analista");
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

// ---------- HU-04: Reporte periódico de cumplimiento ----------
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
    mostrarToast(`${empresaId} no está aprobada; solo empresas instaladas pueden reportar cumplimiento.`);
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
    mostrarToast("Error al registrar el reporte de cumplimiento.");
  } finally {
    ocultarSpinner();
  }
}

// ---------- HU-05: Monitor de alertas de incumplimiento ----------
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

function renderPanelAuditoria() {
  const tbody = document.getElementById("container-alertas-cumplimiento");
  tbody.innerHTML = "";

  if (reportes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No hay reportes de cumplimiento registrados.</td></tr>';
  } else {
    reportes.forEach((rep) => {
      const calc = calcularCumplimiento(rep);
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${rep.id}</td>
        <td>${rep.empresaNombre || rep.empresaId}</td>
        <td>Inv: ${formatearUSD(rep.inversionComprometida)} → ${formatearUSD(rep.inversionEjecutada)}<br>
            Emp: ${rep.empleosComprometidos ?? "-"} → ${rep.empleosReales ?? "-"}</td>
        <td>${calc.promedio === null ? "-" : calc.promedio.toFixed(1) + "%"}</td>
        <td>${badgeEstado(calc.estadoAlerta)}</td>
      `;
      tbody.appendChild(fila);
    });
  }

  renderBitacora();
}

// ---------- RF-14: Bitácora de auditoría ----------
async function renderBitacora() {
  const tbody = document.getElementById("container-bitacora");
  if (!tbody) return;
  tbody.innerHTML = "";

  try {
    const bitacora = await cargarBitacora();
    if (bitacora.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Sin movimientos de auditoría registrados.</td></tr>';
      return;
    }
    bitacora
      .slice()
      .reverse()
      .forEach((entry) => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
          <td>${new Date(entry.timestamp).toLocaleString()}</td>
          <td>${entry.usuario}</td>
          <td>${entry.solicitudId}</td>
          <td>${entry.accion}</td>
          <td>${entry.observaciones || "-"}</td>
        `;
        tbody.appendChild(fila);
      });
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5">No se pudo cargar la bitácora.</td></tr>';
  }
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

  refrescarDatos();
});
