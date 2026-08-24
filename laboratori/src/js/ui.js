// ---------- Utilidades UI compartidas (sanitizadas y reutilizables) ----------

// Escapa HTML: previene XSS al renderizar datos del usuario
export function escapeHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export function formatearUSD(monto) {
  return `$${Number(monto || 0).toLocaleString("en-US")} USD`;
}

export function badgeEstado(estado) {
  switch (estado) {
    case "APROBADA":
    case "RECOMENDADA":
    case "CUMPLE":
      return '<span class="badge-ok">' + escapeHtml(estado) + "</span>";
    case "PENDIENTE_EVALUACION":
    case "REVISAR":
    case "ALERTA_AMARILLA":
      return '<span class="badge-warning">' + escapeHtml(estado) + "</span>";
    default:
      return '<span class="badge-alerta">' + escapeHtml(estado || "SIN_DATOS") + "</span>";
  }
}

export function mostrarToast(mensaje, tipo = "error") {
  const toast = document.getElementById("toast-error");
  const toastMensaje = document.getElementById("toast-message");
  if (!toast) return;
  toastMensaje.textContent = mensaje;
  toast.classList.remove("toast-success", "toast-error", "hidden");
  toast.classList.add(tipo === "success" ? "toast-success" : "toast-error");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("hidden"), 5000);
}

export function mostrarSpinner(mensaje = "Procesando petición asíncrona...") {
  const spinner = document.getElementById("loading-spinner");
  const texto = document.getElementById("spinner-text");
  if (texto) texto.textContent = mensaje;
  if (spinner) spinner.classList.remove("hidden");
}

export function ocultarSpinner() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) spinner.classList.add("hidden");
}

// Modal accesible basado en Promesas (reemplaza a prompt/confirm nativos)
// Resuelve: string (si entrada), true (si acepta), null (si cancela)
export function abrirModal(opciones = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-overlay");
    const titulo = document.getElementById("modal-titulo");
    const mensaje = document.getElementById("modal-mensaje");
    const contenido = document.getElementById("modal-contenido");
    const input = document.getElementById("modal-input");
    const contador = document.getElementById("modal-contador");
    const btnOk = document.getElementById("modal-btn-aceptar");
    const btnCancel = document.getElementById("modal-btn-cancelar");
    const MAX = opciones.maxLength ?? 250;

    const cerrar = (valor) => {
      overlay.classList.add("hidden");
      document.removeEventListener("keydown", onKey);
      resolve(valor);
    };
    const aceptar = () => cerrar(opciones.entrada ? input.value : true);
    const cancelar = () => cerrar(null);
    const onKey = (e) => {
      if (e.key === "Escape") cancelar();
      if (e.key === "Enter" && !opciones.entrada && e.target.tagName !== "BUTTON") aceptar();
    };

    titulo.textContent = opciones.titulo ?? "";
    mensaje.textContent = opciones.mensaje ?? "";
    mensaje.classList.toggle("hidden", !opciones.mensaje);

    if (opciones.contenidoHTML) {
      contenido.innerHTML = opciones.contenidoHTML;
      contenido.classList.remove("hidden");
    } else {
      contenido.innerHTML = "";
      contenido.classList.add("hidden");
    }

    if (opciones.entrada) {
      input.value = opciones.valorInicial ?? "";
      input.maxLength = MAX;
      contador.textContent = `${input.value.length}/${MAX}`;
      input.classList.remove("hidden");
      contador.classList.remove("hidden");
      setTimeout(() => input.focus(), 30);
    } else {
      input.classList.add("hidden");
      contador.classList.add("hidden");
    }

    const esInfo = !!opciones.modoInfo;
    btnCancel.classList.toggle("hidden", esInfo);
    btnOk.textContent = opciones.textoAceptar ?? (esInfo ? "Cerrar" : "Aceptar");

    btnOk.onclick = aceptar;
    btnCancel.onclick = cancelar;
    overlay.onclick = (e) => { if (e.target === overlay) cancelar(); };
    input.oninput = () => { contador.textContent = `${input.value.length}/${MAX}`; };
    document.addEventListener("keydown", onKey);

    overlay.classList.remove("hidden");
    if (!opciones.entrada) setTimeout(() => btnOk.focus(), 30);
  });
}

// Exportación a CSV compatible con Excel (BOM UTF-8 + separador ;)
export function descargarCSV(nombreArchivo, filas) {
  if (!filas || filas.length === 0) {
    mostrarToast("No hay datos para exportar.");
    return;
  }
  const claves = Object.keys(filas[0]);
  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv =
    "\uFEFF" +
    [claves.join(";"), ...filas.map((f) => claves.map((c) => escapar(f[c])).join(";"))].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
  mostrarToast(`${nombreArchivo} exportado (${filas.length} registros).`, "success");
}

// ---------- Carga diferida de librerías CDN ----------
function cargarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

// US-05 / Panel Analista: exportación real .xlsx vía SheetJS
export async function descargarXLSX(nombreArchivo, filas, hoja = "Datos") {
  if (!filas?.length) return mostrarToast("No hay datos para exportar.");
  try {
    await cargarScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
    const ws = window.XLSX.utils.json_to_sheet(filas);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, hoja);
    window.XLSX.writeFile(wb, nombreArchivo);
    mostrarToast(`${nombreArchivo} generado (${filas.length} registros).`, "success");
  } catch {
    mostrarToast("Error generando Excel; se exporta CSV como alternativa.");
    descargarCSV(nombreArchivo.replace(/\.xlsx$/i, ".csv"), filas);
  }
}

// US-05: reporte PDF vía jsPDF + AutoTable
export async function descargarPDF(nombreArchivo, titulo, filas, columnas = null) {
  if (!filas?.length) return mostrarToast("No hay datos para exportar.");
  try {
    await cargarScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
    await cargarScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });
    const cols = columnas ?? Object.keys(filas[0]).map((k) => ({ header: k, dataKey: k }));
    doc.setFontSize(14);
    doc.text(titulo, 14, 15);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString()} · PROCOMER Zona Franca`, 14, 21);
    doc.autoTable({ columns: cols, body: filas, startY: 25, styles: { fontSize: 8 } });
    doc.save(nombreArchivo);
    mostrarToast(`${nombreArchivo} generado.`, "success");
  } catch {
    mostrarToast("No se pudo generar el PDF (verifique conexión a internet).");
  }
}

export function cargarChartJS() {
  return cargarScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js");
}
