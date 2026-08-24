// URL del backend configurable vía .env (VITE_API_URL)
const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3000";

async function req(ruta, opciones = {}) {
  const res = await fetch(`${API_URL}${ruta}`, {
    headers: { "Content-Type": "application/json" },
    ...opciones
  });
  if (!res.ok) throw new Error(`Error ${res.status} en ${ruta}`);
  return res.status === 204 ? null : await res.json();
}

const post = (ruta, body) => req(ruta, { method: "POST", body: JSON.stringify(body) });
const patch = (ruta, body) => req(ruta, { method: "PATCH", body: JSON.stringify(body) });

// Carga en Paralelo (RF-16)
export async function cargarDatosDashboard() {
  const [solicitudes, reportes] = await Promise.all([
    req("/solicitudes"),
    req("/reportesCumplimiento")
  ]);
  return { solicitudes, reportes };
}

export const cargarAnalistas = () => req("/analistas");

export async function validarLoginAnalista(correo, password) {
  const lista = await cargarAnalistas();
  return lista.find((a) => a.correo === correo && a.password === password) || null;
}

// Guardar Solicitud (US-01: radicado automático + notificación simulada)
export async function guardarSolicitud(solicitudData, evaluacionIA, archivo) {
  const payload = {
    ...solicitudData,
    archivoAdjunto: archivo ? archivo.name : "documento.pdf",
    tamanoArchivoMB: archivo ? parseFloat((archivo.size / (1024 * 1024)).toFixed(2)) : 0,
    estado: "PENDIENTE_EVALUACION",
    clasificacion: derivarClasificacion(evaluacionIA, solicitudData),
    fechaCreacion: new Date().toISOString(),
    evaluacionIA
  };
  return post("/solicitudes", payload);
}

function derivarClasificacion(ia, data) {
  if (!data.empresaNombre || !data.sector || !data.inversionProyectada) return "INCOMPLETA";
  if (ia?.nivelRecomendacion === "REVISAR") return "REQUIERE_REVISION";
  return "PRE_CLASIFICADA";
}

// Dictamen Humano (RF-09): estado + justificación obligatoria + trazabilidad
export async function aplicarDictamenHumano(solicitudId, nuevoEstado, usuario, observaciones) {
  const ahora = new Date().toISOString();
  await patch(`/solicitudes/${solicitudId}`, {
    estado: nuevoEstado,
    ...(nuevoEstado === "APROBADA" ? { fechaAprobacion: ahora } : {}),
    resolucionAnalista: { justificacion: observaciones, usuario, timestamp: ahora }
  });
  await notificarEmpresa({
    destinatario: solicitudId,
    asunto: `Solicitud ${solicitudId} ${nuevoEstado.toLowerCase()}`,
    cuerpo: observaciones
  });
  return registrarBitacora({ solicitudId, usuario, nuevoEstado, observaciones, timestamp: ahora });
}

export async function actualizarEvaluacionIA(solicitudId, evaluacionIA) {
  return patch(`/solicitudes/${solicitudId}`, { evaluacionIA });
}

// US-04: acciones preventivas/correctivas sobre alertas
export async function registrarAccionCorrectiva({ empresaId, empresaNombre, usuario, accion, detalle }) {
  return registrarBitacora({
    solicitudId: empresaId,
    usuario,
    accion: `ACCION_${accion}`,
    observaciones: `[${empresaNombre}] ${detalle}`,
    timestamp: new Date().toISOString()
  });
}

export async function guardarReporteCumplimiento(reporteData) {
  return post("/reportesCumplimiento", { ...reporteData, fechaReporte: new Date().toISOString() });
}

export const cargarBitacora = () => req("/bitacoraAuditoria");

export function registrarBitacora(entry) {
  return post("/bitacoraAuditoria", entry);
}

// US-01 / Portal Empresa: notificaciones simuladas (correo)
export async function notificarEmpresa({ destinatario, asunto, cuerpo }) {
  return post("/notificaciones", {
    id: Date.now(),
    destinatario,
    canal: "CORREO_SIMULADO",
    asunto,
    cuerpo,
    leida: false,
    timestamp: new Date().toISOString()
  });
}

export const cargarNotificaciones = (empresaId) =>
  req(`/notificaciones?destinatario=${encodeURIComponent(empresaId)}&_sort=timestamp&_order=desc`);

export async function marcarNotificacionesLeidas(lista) {
  return Promise.all(lista.filter((n) => !n.leida).map((n) => patch(`/notificaciones/${n.id}`, { leida: true })));
}

// Chat interno admin <-> analistas (polling sobre json-server).
// json-server no soporta OR en query params: se trae todo y filtra el cliente.
export const cargarMensajes = () => req("/mensajes?_sort=timestamp&_order=asc");

export const enviarMensaje = ({ de, para, texto }) =>
  post("/mensajes", { de, para, texto, timestamp: new Date().toISOString() });
