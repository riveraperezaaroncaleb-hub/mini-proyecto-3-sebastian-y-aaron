// Portal de la Empresa Solicitante (US-01 + Centro de Mensajes)
import { guardarSolicitud, cargarDatosDashboard, cargarBitacora, cargarNotificaciones } from "./apiService.js";
import { evaluarSolicitudConIA } from "./iaService.js";
import { initComponentsGlobales } from "./global.js";
import { escapeHtml, mostrarToast, mostrarSpinner, ocultarSpinner, badgeEstado } from "./ui.js";

const API_URL = "http://localhost:3000";
const $ = (id) => document.getElementById(id);
let archivoSeleccionado = null;

initComponentsGlobales();

// ---------- Navegación ----------
document.querySelectorAll(".nav-btn[data-section]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modulo-seccion").forEach((s) => s.classList.add("hidden"));
    $(btn.dataset.section).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

// ---------- Drag & Drop (PDF/ZIP) ----------
const dropzone = $("dropzone");
const inputArchivo = $("documentosAdjuntos");

dropzone.addEventListener("click", () => inputArchivo.click());
dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") inputArchivo.click(); });
["dragover", "dragenter"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("arrastre"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("arrastre"); })
);
dropzone.addEventListener("drop", (e) => asignarArchivo(e.dataTransfer.files[0]));
inputArchivo.addEventListener("change", () => asignarArchivo(inputArchivo.files[0]));

function asignarArchivo(file) {
  if (!file) return;
  const okTipo = /\.(pdf|zip)$/i.test(file.name);
  const MAX_MB = 25;
  if (!okTipo) {
    dropzone.className = "dropzone error";
    $("error-file").textContent = "Formato no válido: solo se aceptan PDF y ZIP.";
    $("error-file").style.display = "block";
    archivoSeleccionado = null;
    return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    dropzone.className = "dropzone error";
    $("error-file").textContent = `El archivo supera ${MAX_MB} MB.`;
    $("error-file").style.display = "block";
    archivoSeleccionado = null;
    return;
  }
  dropzone.className = "dropzone ok";
  $("error-file").style.display = "none";
  $("dropzone-nombre").textContent = `✔ ${file.name} (${(file.size / 1048576).toFixed(2)} MB)`;
  archivoSeleccionado = file;
}

// ---------- Validación en tiempo real (US-01) ----------
const REGLAS = {
  empresaNombre: (v) => v.trim().length >= 3 || "Mínimo 3 caracteres.",
  cedulaJuridica: (v) => /^[0-9]-\d{3}-\d{6}$|^[A-Za-z0-9-]{6,20}$/.test(v.trim()) || "Formato: 3-101-555888",
  sectorEmpresa: (v) => !!v || "Seleccione un sector.",
  telefonoContacto: (v) => /^[+0-9 ()-]{8,20}$/.test(v.trim()) || "Teléfono inválido.",
  inversionProyectada: (v) => Number(v) > 0 || "Debe ser mayor a $0 USD.",
  empleosProyectados: (v) => Number(v) > 0 || "Debe ser mayor a 0.",
  pitchEmpresa: (v) => v.trim().length >= 50 || "Desarrolle al menos 50 caracteres."
};

Object.keys(REGLAS).forEach((id) => {
  const campo = $(id);
  campo.addEventListener("input", () => validarCampo(id));
  campo.addEventListener("change", () => validarCampo(id));
});
$("pitchEmpresa").addEventListener("input", () => ($("pitch-contador").textContent = $("pitchEmpresa").value.length));

function validarCampo(id) {
  const resultado = REGLAS[id]($(id).value);
  const msg = $(`[data-msg-for="${id}"]`);
  if (resultado === true) {
    $(id).classList.remove("campo-invalido");
    msg.textContent = "";
    return true;
  }
  $(id).classList.add("campo-invalido");
  msg.textContent = resultado;
  return false;
}

// ---------- Envío de Solicitud ----------
$("form-solicitud").addEventListener("submit", async (e) => {
  e.preventDefault();
  const invalidos = Object.keys(REGLAS).filter((id) => !validarCampo(id));
  if (invalidos.length) {
    document.querySelector(`[data-msg-for="${invalidos[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return mostrarToast("Corrija los campos marcados antes de enviar.");
  }
  if (!archivoSeleccionado) {
    $("error-file").textContent = "Debe adjuntar el plan de operaciones (PDF o ZIP).";
    $("error-file").style.display = "block";
    return;
  }

  const datos = {
    empresaNombre: $("empresaNombre").value.trim(),
    cedulaJuridica: $("cedulaJuridica").value.trim(),
    sector: $("sectorEmpresa").value,
    telefono: $("telefonoContacto").value.trim(),
    inversionProyectada: Number($("inversionProyectada").value),
    empleosDirectosProyectados: Number($("empleosProyectados").value),
    empleosIndirectosProyectados: Number($("empleosIndirectosProyectados").value || 0),
    pitch: $("pitchEmpresa").value.trim()
  };

  try {
    mostrarSpinner(`Pre-clasificación IA para ${datos.empresaNombre} (máx. 5 s)...`);
    const ia = await evaluarSolicitudConIA(datos);

    // Radicado único EMP-XXXXXX
    let radicado;
    do {
      radicado = "EMP-" + String(Math.floor(100000 + Math.random() * 900000));
    } while ((await fetch(`${API_URL}/solicitudes/${radicado}`)).ok);

    await guardarSolicitud({ id: radicado, ...datos }, ia, archivoSeleccionado);
    ocultarSpinner();

    $("radicado-num").textContent = radicado;
    $("radicado-ia").innerHTML = `${badgeEstado(ia.nivelRecomendacion)} <strong>${ia.puntajeAfinidad}/100</strong>${ia.esFallback ? ' <span class="badge-warning">FALLBACK</span>' : ""}`;
    $("radicado-justificacion").textContent = ia.justificacion;
    $("resultado-radicado").classList.remove("hidden");
    $("resultado-radicado").scrollIntoView({ behavior: "smooth", block: "nearest" });
    mostrarToast(`Solicitud ${radicado} enviada. Confirmación enviada por correo.`, "success");

    e.target.reset();
    $("pitch-contador").textContent = "0";
    dropzone.className = "dropzone";
    $("dropzone-nombre").textContent = "";
    archivoSeleccionado = null;
    sessionStorage.setItem("zf_empresa_id", radicado);
    cargarCentroMensajes(radicado);
  } catch (err) {
    console.error(err);
    ocultarSpinner();
    mostrarToast(err.message || "Error al enviar la solicitud.");
  }
});

// ---------- Centro de Mensajes e Historial ----------
async function cargarCentroMensajes(empresaId) {
  if (!empresaId) return;
  try {
    const [{ solicitudes }, bitacora, notificaciones] = await Promise.all([
      cargarDatosDashboard(),
      cargarBitacora(),
      cargarNotificaciones(empresaId)
    ]);
    const solicitud = solicitudes.find((s) => s.id === empresaId);

    if (solicitud) {
      $("tm-radicado").textContent = solicitud.id;
      $("tm-empresa").textContent = solicitud.empresaNombre;
      $("tm-estado").innerHTML = badgeEstado(solicitud.estado);
      $("tm-afinidad").textContent =
        solicitud.evaluacionIA ? `${solicitud.evaluacionIA.puntajeAfinidad}%` : "—";
      $("tm-fecha").textContent = new Date(solicitud.fechaCreacion).toLocaleDateString();
      sessionStorage.setItem("zf_empresa_id", empresaId);
    } else {
      $("tm-radicado").textContent = empresaId;
      $("tm-estado").textContent = "EN_REDACCION";
    }

    const eventos = bitacora.filter((b) => b.solicitudId === empresaId);
    $("timeline-tramite").innerHTML = eventos.length
      ? eventos
          .slice()
          .reverse()
          .map(
            (m) => `<li><strong>${escapeHtml(m.accion)}</strong><br>
              <span class="text-muted">${new Date(m.timestamp).toLocaleString()} — ${escapeHtml(m.observaciones || "")}</span></li>`
          )
          .join("")
      : '<li><strong>RECEPCION</strong><br><span class="text-muted">Solicitud recibida y en cola de evaluación.</span></li>';

    // Bandeja: resoluciones del analista + notificaciones simuladas
    const filas = [];
    notificaciones.forEach((n) =>
      filas.push(`<tr><td>📧 <strong>${escapeHtml(n.asunto)}</strong><br><small class="text-muted">${escapeHtml(n.cuerpo)}</small></td>
        <td>${new Date(n.timestamp).toLocaleString()}</td></tr>`)
    );
    if (solicitud?.resolucionAnalista) {
      filas.push(
        `<tr><td>⚖️ <strong>Resolución oficial: ${escapeHtml(solicitud.estado)}</strong><br>
        ${escapeHtml(solicitud.resolucionAnalista.justificacion)}</td>
        <td>${new Date(solicitud.resolucionAnalista.timestamp).toLocaleString()}</td></tr>`
      );
    }
    $("bandeja-entrada").innerHTML = filas.length
      ? filas.join("")
      : '<tr><td colspan="2">Sin mensajes por ahora.</td></tr>';
  } catch {
    mostrarToast("Sin conexión con el backend (puerto 3000). Ejecute: npm start");
  }
}

// Arranque: si hay sesión de empresa, carga su centro de mensajes
document.addEventListener("DOMContentLoaded", () => {
  const id = sessionStorage.getItem("zf_empresa_id");
  const nueva = sessionStorage.getItem("zf_empresa_nueva");
  if (nueva) {
    $("empresaNombre").value = nueva;
    sessionStorage.removeItem("zf_empresa_nueva");
  }
  cargarCentroMensajes(id);
});
