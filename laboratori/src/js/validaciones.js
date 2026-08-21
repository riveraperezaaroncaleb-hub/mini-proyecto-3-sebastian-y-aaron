// Validar el archivo adjunto (RF-02)
export function validarArchivoAdjunto(file) {
  const MAX_SIZE_MB = 10;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024; // 10 MB en bytes

  if (!file) {
    return { valido: false, mensaje: "Debe adjuntar la propuesta en formato PDF." };
  }

  // Validación de tipo de archivo PDF
  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    return { valido: false, mensaje: "El archivo adjunto debe ser estrictamente en formato PDF." };
  }

  // Validación de tamaño máximo de 10 MB
  if (file.size > MAX_SIZE_BYTES) {
    const tamanoActualMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valido: false,
      mensaje: `El archivo supera el límite de 10 MB (Tamaño actual: ${tamanoActualMB} MB).`
    };
  }

  return { valido: true, mensaje: "Archivo válido." };
}

// Validación de campos obligatorios del formulario (RF-01)
export function validarFormularioSolicitud(campos) {
  const errores = [];

  if (!campos.empresaNombre || campos.empresaNombre.trim().length < 3) {
    errores.push("El nombre de la empresa es obligatorio (mínimo 3 caracteres).");
  }

  if (!campos.sector) {
    errores.push("Debe seleccionar el sector de actividad.");
  }

  if (!campos.inversionProyectada || Number(campos.inversionProyectada) <= 0) {
    errores.push("La inversión proyectada debe ser un monto mayor a $0 USD.");
  }

  if (!campos.empleosDirectosProyectados || Number(campos.empleosDirectosProyectados) <= 0) {
    errores.push("Los empleos proyectados deben ser un valor mayor a 0.");
  }

  return { valido: errores.length === 0, errores };
}
