// URL del backend configurable vía .env (VITE_API_URL)
const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3000";

// Carga en Paralelo (RF-16)
export async function cargarDatosDashboard() {
  try {
    const [resSolicitudes, resReportes] = await Promise.all([
      fetch(`${API_URL}/solicitudes`),
      fetch(`${API_URL}/reportesCumplimiento`)
    ]);

    if (!resSolicitudes.ok || !resReportes.ok) throw new Error("Error en la conexión con json-server.");

    const solicitudes = await resSolicitudes.json();
    const reportes = await resReportes.json();

    return { solicitudes, reportes };
  } catch (error) {
    console.error("Error al obtener datos:", error);
    throw error;
  }
}

// Guardar Solicitud
export async function guardarSolicitud(solicitudData, evaluacionIA, archivo) {
  const payload = {
    ...solicitudData,
    archivoAdjunto: archivo ? archivo.name : "documento.pdf",
    tamanoArchivoMB: archivo ? parseFloat((archivo.size / (1024 * 1024)).toFixed(2)) : 0,
    estado: "PENDIENTE_EVALUACION",
    fechaCreacion: new Date().toISOString(),
    evaluacionIA
  };

  const res = await fetch(`${API_URL}/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error("Error al guardar la solicitud en el servidor.");
  return await res.json();
}

// Dictamen Humano (RF-09) y Auditoría (RF-14)
export async function aplicarDictamenHumano(solicitudId, nuevoEstado, usuario, observaciones) {
  const resPatch = await fetch(`${API_URL}/solicitudes/${solicitudId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: nuevoEstado })
  });

  if (!resPatch.ok) throw new Error("Error al actualizar el estado de la solicitud.");

  const resBitacora = await fetch(`${API_URL}/bitacoraAuditoria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      solicitudId,
      usuario,
      accion: `CAMBIO_ESTADO_${nuevoEstado}`,
      estadoNuevo: nuevoEstado,
      observaciones,
      timestamp: new Date().toISOString()
    })
  });

  if (!resBitacora.ok) throw new Error("Error al registrar el movimiento en la bitácora.");
}

// Actualizar pre-clasificación IA (re-evaluación)
export async function actualizarEvaluacionIA(solicitudId, evaluacionIA) {
  const res = await fetch(`${API_URL}/solicitudes/${solicitudId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluacionIA })
  });

  if (!res.ok) throw new Error("Error al actualizar la evaluación IA.");
  return await res.json();
}

// Registro de Reporte de Cumplimiento (HU-04)
export async function guardarReporteCumplimiento(reporteData) {
  const payload = {
    ...reporteData,
    fechaReporte: new Date().toISOString()
  };

  const res = await fetch(`${API_URL}/reportesCumplimiento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error("Error al guardar el reporte de cumplimiento.");
  return await res.json();
}

// Bitácora de Auditoría (RF-14)
export async function cargarBitacora() {
  const res = await fetch(`${API_URL}/bitacoraAuditoria`);
  if (!res.ok) throw new Error("Error al consultar la bitácora de auditoría.");
  return await res.json();
}
