// Motor con timeout de 5.0 segundos (RF-04, RF-06)
export async function evaluarSolicitudConIA(solicitudData) {
  const TIMEOUT_MS = 5000;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT_IA")), TIMEOUT_MS)
  );

  const iaPromise = new Promise((resolve) => {
    // Simula latencia variable entre 1 y 6 segundos
    const latenciaSimulada = Math.floor(Math.random() * 5000) + 1000;

    setTimeout(() => {
      let puntaje = 0;
      let justificaciones = [];

      if (solicitudData.inversionProyectada >= 150000) {
        puntaje += 50;
        justificaciones.push("Satisface la inversión mínima requerida ($150,000 USD).");
      } else {
        justificaciones.push("Inversión insuficiente para el régimen ($150,000 USD mín).");
      }

      if (solicitudData.empleosDirectosProyectados >= 10) {
        puntaje += 30;
        justificaciones.push("Cumple con la cuota mínima de 10 empleos directos.");
      } else {
        justificaciones.push("Proyección de empleo inferior al mínimo reglamentario (10).");
      }

      const sectoresEstrategicos = ["Ciencias de la Vida", "Manufactura Avanzada", "Servicios", "Logística"];
      if (sectoresEstrategicos.includes(solicitudData.sector)) {
        puntaje += 20;
        justificaciones.push(`Sector estratégico autorizable (${solicitudData.sector}).`);
      }

      let nivel = "RECHAZADA";
      if (puntaje >= 75) nivel = "RECOMENDADA";
      else if (puntaje >= 40) nivel = "REVISAR";

      resolve({
        puntajeAfinidad: puntaje,
        nivelRecomendacion: nivel,
        justificacion: justificaciones.join(" "),
        esFallback: false,
        fechaEvaluacion: new Date().toISOString()
      });
    }, latenciaSimulada);
  });

  try {
    return await Promise.race([iaPromise, timeoutPromise]);
  } catch (error) {
    console.warn("Límite de 5.0s excedido o error de IA. Ejecutando Fallback local...");
    return ejecutarFallbackLocal(solicitudData);
  }
}

function ejecutarFallbackLocal(solicitudData) {
  const cumpleInversion = solicitudData.inversionProyectada >= 150000;
  const cumpleEmpleos = solicitudData.empleosDirectosProyectados >= 10;

  let puntaje = (cumpleInversion ? 50 : 0) + (cumpleEmpleos ? 50 : 0);
  let nivel = puntaje >= 100 ? "RECOMENDADA" : (puntaje >= 50 ? "REVISAR" : "RECHAZADA");

  return {
    puntajeAfinidad: puntaje,
    nivelRecomendacion: nivel,
    justificacion: "Evaluación calculada vía algoritmo de contingencia (Fallback local) debido a timeout de IA (5s).",
    esFallback: true,
    fechaEvaluacion: new Date().toISOString()
  };
}
