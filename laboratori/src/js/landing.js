// Lógica de accesos de la landing (portales empresa / administrativo)
function abrirModalAcceso() {
  document.getElementById("modalAcceso").classList.add("abierto");
}
function cerrarModalAcceso() {
  document.getElementById("modalAcceso").classList.remove("abierto");
}
function volverSeleccion() {
  ["pasoEmpresa", "pasoAdmin"].forEach((id) => (document.getElementById(id).hidden = true));
  document.getElementById("pasoSeleccion").hidden = false;
  ocultar("errorEmpresa");
  ocultar("errorAdmin");
}
function mostrarPortal(cual) {
  document.getElementById("pasoSeleccion").hidden = true;
  document.getElementById(cual === "empresa" ? "pasoEmpresa" : "pasoAdmin").hidden = false;
}

function cambiarTabEmpresa(tab, btn) {
  document.querySelectorAll(".tab-mini").forEach((b) => b.classList.remove("activo"));
  btn.classList.add("activo");
  document.getElementById("formLoginEmpresa").hidden = tab !== "login";
  document.getElementById("formRegistroEmpresa").hidden = tab !== "registro";
  ocultar("errorEmpresa");
}

const ocultar = (id) => (document.getElementById(id).style.display = "none");

// Empresa: login por radicado existente en la base de datos
async function loginEmpresa(event) {
  event.preventDefault();
  const clave = document.getElementById("loginRadicado").value.trim().toUpperCase();
  try {
    const res = await fetch(`http://localhost:3000/solicitudes?q=${encodeURIComponent(clave)}`);
    const lista = await res.json();
    const match = lista.find(
      (s) => s.id === clave || String(s.cedulaJuridica || "").toUpperCase() === clave
    );
    if (!match) return mostrarError("errorEmpresa");
    sessionStorage.setItem("zf_empresa_id", match.id);
    sessionStorage.setItem("zf_rol", "empresa");
    location.href = "src/html/empresas.html";
  } catch {
    mostrarError("errorEmpresa");
  }
}

// Empresa: registro demo (guarda sesión local y redirige al formulario)
function registroEmpresa(event) {
  event.preventDefault();
  const nombre = document.getElementById("regNombre").value.trim();
  sessionStorage.setItem("zf_empresa_nueva", nombre);
  sessionStorage.setItem("zf_empresa_id", "");
  sessionStorage.setItem("zf_rol", "empresa");
  location.href = "src/html/empresas.html";
}

// Administrativo: admin general o analistas registrados en la base
async function loginAdministrativo(event) {
  event.preventDefault();
  const correo = document.getElementById("adminCorreo").value.trim();
  const password = document.getElementById("adminPassword").value;

  if (correo === "admin@zofranca.cr" && password === "admin1234") {
    sessionStorage.setItem("zf_usuario", "admin@zofranca.cr");
    sessionStorage.setItem("zf_rol", "admin");
    return (location.href = "src/html/admin.html");
  }

  try {
    const analista = await window.__zf.validarLoginAnalista(correo, password);
    if (!analista) return mostrarError("errorAdmin");
    if (analista.estadoCuenta !== "ACTIVA") {
      document.getElementById("errorAdmin").textContent = "Cuenta suspendida. Contacte al administrador.";
      return mostrarError("errorAdmin");
    }
    sessionStorage.setItem("zf_usuario", analista.correo);
    sessionStorage.setItem("zf_rol", "analista");
    location.href = "src/html/clientes.html";
  } catch {
    mostrarError("errorAdmin");
  }
}

function mostrarError(id) {
  const el = document.getElementById(id);
  el.style.display = "block";
}

window.abrirModalAcceso = abrirModalAcceso;
window.cerrarModalAcceso = cerrarModalAcceso;
window.volverSeleccion = volverSeleccion;
window.mostrarPortal = mostrarPortal;
window.cambiarTabEmpresa = cambiarTabEmpresa;
window.loginEmpresa = loginEmpresa;
window.registroEmpresa = registroEmpresa;
window.loginAdministrativo = loginAdministrativo;
