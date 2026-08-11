// ============================================================
// APP.JS — lógica principal de la interfaz
// ============================================================
import * as DB from "./db.js";
import {
  PERSONAS, calcularDeudasAuto, sumarDeudas, calcularNetos,
  formatoMoneda, monthIdToLabel, nextMonthId, montoCuota, round2, NOMBRES_MESES
} from "./calc.js";
import { SEED_MESES, construirItemCompleto } from "./seed.js";

// ---------------- ESTADO GLOBAL ----------------
let currentUser = null;       // "Diego" | "Jessi" | "Bachi"
let currentMonthId = null;
let meses = [];                // [{id, label}]
let itemsDelMes = [];          // items del mes seleccionado
let editingItemId = null;      // si estamos editando, id del item
let manualValues = {};         // valores del formulario en modo manual
let pendienteBorrar = null;    // { tipo: "item"|"mes", id }
let sortColumn = null;         // columna activa de orden en la tabla de gastos
let sortDir = 1;               // 1 = ascendente, -1 = descendente
let searchTerm = "";           // filtro del mini buscador de ítems
let ultimoInforme = null;      // { netos, pagos, monthId } del último informe generado

// ---------------- ELEMENTOS ----------------
const el = (id) => document.getElementById(id);
const loginScreen = el("login-screen");
const appScreen = el("app-screen");

// ============================================================
// LOGIN
// ============================================================
let nombreSeleccionado = null;

document.querySelectorAll(".user-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    nombreSeleccionado = btn.dataset.user;
    el("pin-username").textContent = nombreSeleccionado;
    el("login-step-name").classList.add("hidden");
    el("login-step-pin").classList.remove("hidden");
    el("pin-hint").textContent = "Si es la primera vez que entrás, este PIN quedará guardado como el tuyo.";
    el("login-error").classList.add("hidden");
    el("pin-input").value = "";
    el("pin-input").focus();
  });
});

el("pin-back").addEventListener("click", () => {
  el("login-step-pin").classList.add("hidden");
  el("login-step-name").classList.remove("hidden");
});

el("pin-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarLogin();
});
el("pin-submit").addEventListener("click", intentarLogin);

async function intentarLogin() {
  const pin = el("pin-input").value.trim();
  const errorBox = el("login-error");
  errorBox.classList.add("hidden");
  if (pin.length < 6) {
    errorBox.textContent = "El PIN debe tener 6 dígitos.";
    errorBox.classList.remove("hidden");
    return;
  }
  el("login-loading").classList.remove("hidden");
  const res = await DB.iniciarSesion(nombreSeleccionado, pin);
  el("login-loading").classList.add("hidden");
  if (!res.ok) {
    errorBox.textContent = res.error;
    errorBox.classList.remove("hidden");
    return;
  }
  // onAuthStateChanged se encarga de mostrar la app
}

el("logout-btn").addEventListener("click", () => DB.cerrarSesion());

DB.alCambiarSesion(async (user) => {
  if (user) {
    currentUser = nombreDePorEmail(user.email);
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    el("current-user-label").textContent = `👋 ${currentUser}`;
    await arrancarApp();
  } else {
    currentUser = null;
    appScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    el("login-step-pin").classList.add("hidden");
    el("login-step-name").classList.remove("hidden");
  }
});

function nombreDePorEmail(email) {
  const encontrado = PERSONAS.find(p => DB.emailDePersona(p) === email);
  return encontrado || email;
}

// ============================================================
// ARRANQUE: cargar meses (y sembrar datos históricos si hace falta)
// ============================================================
async function arrancarApp() {
  meses = await DB.listarMeses();
  if (meses.length === 0) {
    await sembrarDatosIniciales();
    meses = await DB.listarMeses();
  }
  currentMonthId = meses[meses.length - 1].id;
  sincronizarSelectoresMes();
  await refrescarTodo();
  await actualizarUltimoCambioLabel();
}

async function sembrarDatosIniciales() {
  for (const mes of SEED_MESES) {
    await DB.crearMesSiNoExiste(mes.monthId, mes.label);
    for (const raw of mes.items) {
      const data = construirItemCompleto(raw);
      await DB.crearItemConId(mes.monthId, raw.id, data);
    }
  }
  await DB.registrarAuditoria({
    usuario: currentUser,
    accion: "importar_datos",
    monthId: null,
    detalle: "Carga inicial de datos históricos desde el Excel (Agosto–Octubre 2026)."
  });
}

function renderSelectorAnios() {
  const selAnio = el("month-select-anio");
  const anioActual = selAnio.value;
  const anios = [...new Set(meses.map(m => m.id.split("-")[0]))].sort();
  selAnio.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join("");
  if (anios.includes(anioActual)) selAnio.value = anioActual;
}

function renderSelectorMesesParaAnio(anio) {
  const selMes = el("month-select-mes");
  const mesesDelAnio = meses.filter(m => m.id.startsWith(`${anio}-`));
  selMes.innerHTML = mesesDelAnio.map(m => {
    const numMes = Number(m.id.split("-")[1]);
    return `<option value="${m.id}">${m.label || NOMBRES_MESES[numMes - 1]}</option>`;
  }).join("");
}

function sincronizarSelectoresMes() {
  renderSelectorAnios();
  const anio = currentMonthId.split("-")[0];
  el("month-select-anio").value = anio;
  renderSelectorMesesParaAnio(anio);
  el("month-select-mes").value = currentMonthId;
}

el("month-select-anio").addEventListener("change", async (e) => {
  renderSelectorMesesParaAnio(e.target.value);
  currentMonthId = el("month-select-mes").value;
  await refrescarTodo();
});

el("month-select-mes").addEventListener("change", async (e) => {
  currentMonthId = e.target.value;
  await refrescarTodo();
});

el("next-month-btn").addEventListener("click", generarMesSiguiente);

el("delete-month-btn").addEventListener("click", abrirConfirmBorradoMes);

function abrirConfirmBorradoMes() {
  if (meses.length <= 1) {
    mostrarToast("No podés borrar el único mes que queda.");
    return;
  }
  pendienteBorrar = { tipo: "mes", id: currentMonthId };
  el("confirm-title").textContent = "¿Eliminar este mes?";
  el("confirm-text").textContent = `Se eliminará ${monthIdToLabel(currentMonthId)} y todos sus gastos. Esta acción no se puede deshacer.`;
  confirmModal.classList.remove("hidden");
}

async function generarMesSiguiente() {
  const ultimoId = meses[meses.length - 1].id;
  const nuevoId = nextMonthId(ultimoId);
  if (meses.some(m => m.id === nuevoId)) {
    mostrarToast(`El mes ${monthIdToLabel(nuevoId)} ya existe.`);
    currentMonthId = nuevoId;
    sincronizarSelectoresMes();
    await refrescarTodo();
    return;
  }
  const nuevoLabel = monthIdToLabel(nuevoId);
  await DB.crearMesSiNoExiste(nuevoId, nuevoLabel);

  // Arrastrar cuotas pendientes del último mes
  const itemsUltimoMes = await DB.listarItems(ultimoId);
  let arrastrados = 0;
  for (const item of itemsUltimoMes) {
    if (item.cuotaActual < item.cuotasTotal) {
      const nuevaCuota = item.cuotaActual + 1;
      const deudas = item.modo === "manual"
        ? item.deudas
        : calcularDeudasAuto(item.tarjeta, item.participantes, item.montoTotal, item.cuotasTotal);
      await DB.crearItem(nuevoId, {
        nombre: item.nombre,
        montoTotal: item.montoTotal,
        cuotasTotal: item.cuotasTotal,
        cuotaActual: nuevaCuota,
        montoCuota: montoCuota(item.montoTotal, item.cuotasTotal),
        tarjeta: item.tarjeta,
        participantes: item.participantes,
        modo: item.modo,
        deudas,
        origenId: item.origenId || item.id,
        creadoPor: currentUser,
        editadoPor: currentUser
      });
      arrastrados++;
    }
  }

  await DB.registrarAuditoria({
    usuario: currentUser,
    accion: "generar_mes",
    monthId: nuevoId,
    detalle: `Se generó ${nuevoLabel}, arrastrando ${arrastrados} gasto(s) en cuotas.`
  });

  meses = await DB.listarMeses();
  currentMonthId = nuevoId;
  sincronizarSelectoresMes();
  mostrarToast(`${nuevoLabel} creado (${arrastrados} gasto(s) con cuotas pendientes arrastrados).`);
  await refrescarTodo();
}

// ============================================================
// TABS
// ============================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    el(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "auditoria") renderAuditoria();
  });
});

// ============================================================
// REFRESCAR VISTAS
// ============================================================
async function refrescarTodo() {
  const mes = meses.find(m => m.id === currentMonthId);
  el("gastos-month-title").textContent = mes ? (mes.label || monthIdToLabel(mes.id)) : "—";
  itemsDelMes = await DB.listarItems(currentMonthId);
  renderTablaItems();
  el("report-content").innerHTML = "";
  el("report-download-pdf-btn").classList.add("hidden");
  ultimoInforme = null;
}

function valorOrden(item, columna) {
  switch (columna) {
    case "nombre": return item.nombre || "";
    case "montoTotal": return Number(item.montoTotal) || 0;
    case "cuotaActual": return Number(item.cuotaActual) || 0;
    case "montoCuota": return Number(item.montoCuota ?? montoCuota(item.montoTotal, item.cuotasTotal)) || 0;
    case "tarjeta": return item.tarjeta || "";
    case "participantes": return (item.participantes || []).join(", ");
    default: return "";
  }
}

function itemsFiltradosOrdenados() {
  let arr = itemsDelMes;
  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    arr = arr.filter(i => (i.nombre || "").toLowerCase().includes(q));
  }
  if (sortColumn) {
    arr = [...arr].sort((a, b) => {
      let va = valorOrden(a, sortColumn);
      let vb = valorOrden(b, sortColumn);
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
  }
  return arr;
}

function actualizarIndicadoresOrden() {
  document.querySelectorAll("#items-table th[data-sort]").forEach(th => {
    const ind = th.querySelector(".sort-ind");
    ind.textContent = th.dataset.sort === sortColumn ? (sortDir === 1 ? "▲" : "▼") : "";
  });
}

document.querySelectorAll("#items-table th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (sortColumn === col) sortDir *= -1;
    else { sortColumn = col; sortDir = 1; }
    actualizarIndicadoresOrden();
    renderTablaItems();
  });
});

el("items-search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderTablaItems();
});

function renderTablaItems() {
  const tbody = el("items-tbody");
  tbody.innerHTML = "";
  const visibles = itemsFiltradosOrdenados();
  el("items-empty").textContent = itemsDelMes.length === 0
    ? "Todavía no hay gastos cargados en este mes."
    : "No se encontraron ítems para esa búsqueda.";
  el("items-empty").classList.toggle("hidden", visibles.length > 0);

  for (const item of visibles) {
    const tr = document.createElement("tr");

    const deudasHtml = Object.entries(item.deudas || {}).map(([par, monto]) => {
      const [de, a] = par.split("->");
      return `<span class="debt-line">${de} → ${a}: <strong>${formatoMoneda(monto)}</strong></span>`;
    }).join("") || `<span class="debt-line hint">Sin deuda (todo cubierto por quien pagó)</span>`;

    tr.innerHTML = `
      <td class="wrap"><strong>${escapeHtml(item.nombre)}</strong></td>
      <td>${formatoMoneda(item.montoTotal)}</td>
      <td>${item.cuotaActual} de ${item.cuotasTotal}</td>
      <td>${formatoMoneda(item.montoCuota ?? montoCuota(item.montoTotal, item.cuotasTotal))}</td>
      <td><span class="badge badge-${item.tarjeta}">${item.tarjeta}</span></td>
      <td class="wrap">${(item.participantes || []).join(", ")}</td>
      <td class="wrap">${deudasHtml}</td>
      <td>
        <div class="row-actions">
          <button class="btn-secondary btn-small" data-action="editar" data-id="${item.id}">Editar</button>
          <button class="btn-danger btn-small" data-action="borrar" data-id="${item.id}">Borrar</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('[data-action="editar"]').forEach(b =>
    b.addEventListener("click", () => abrirModalEdicion(b.dataset.id)));
  tbody.querySelectorAll('[data-action="borrar"]').forEach(b =>
    b.addEventListener("click", () => abrirConfirmBorrado(b.dataset.id)));
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ============================================================
// MODAL: AGREGAR / EDITAR GASTO
// ============================================================
const itemModal = el("item-modal");

el("add-item-btn").addEventListener("click", () => abrirModalNuevo());
el("item-cancel-btn").addEventListener("click", cerrarModalItem);

function abrirModalNuevo() {
  editingItemId = null;
  manualValues = {};
  el("item-modal-title").textContent = "Agregar gasto";
  el("item-form").reset();
  document.querySelectorAll(".f-participante").forEach(cb => cb.checked = true);
  el("f-modo-manual").checked = false;
  actualizarFormularioDinamico();
  itemModal.classList.remove("hidden");
}

function abrirModalEdicion(itemId) {
  const item = itemsDelMes.find(i => i.id === itemId);
  if (!item) return;
  editingItemId = itemId;
  el("item-modal-title").textContent = "Editar gasto";
  el("f-nombre").value = item.nombre;
  el("f-monto").value = item.montoTotal;
  el("f-cuotas").value = item.cuotasTotal;
  el("f-tarjeta").value = item.tarjeta;
  document.querySelectorAll(".f-participante").forEach(cb => {
    cb.checked = (item.participantes || []).includes(cb.value);
  });
  el("f-modo-manual").checked = item.modo === "manual";
  manualValues = item.modo === "manual" ? { ...item.deudas } : {};
  actualizarFormularioDinamico();
  itemModal.classList.remove("hidden");
}

function cerrarModalItem() {
  itemModal.classList.add("hidden");
  editingItemId = null;
}

["f-nombre", "f-monto", "f-cuotas", "f-tarjeta"].forEach(id => {
  el(id).addEventListener("input", actualizarFormularioDinamico);
  el(id).addEventListener("change", actualizarFormularioDinamico);
});
document.querySelectorAll(".f-participante").forEach(cb =>
  cb.addEventListener("change", actualizarFormularioDinamico));
el("f-modo-manual").addEventListener("change", actualizarFormularioDinamico);

function leerParticipantesSeleccionados() {
  return Array.from(document.querySelectorAll(".f-participante"))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
}

function actualizarFormularioDinamico() {
  const montoTotal = parseFloat(el("f-monto").value) || 0;
  const cuotasTotal = parseInt(el("f-cuotas").value) || 1;
  const tarjeta = el("f-tarjeta").value;
  const participantes = leerParticipantesSeleccionados();
  const modoManual = el("f-modo-manual").checked;
  const cuota = montoCuota(montoTotal, cuotasTotal);
  const autoDeudas = calcularDeudasAuto(tarjeta, participantes, montoTotal, cuotasTotal);

  const manualWrap = el("f-manual-wrap");
  manualWrap.classList.toggle("hidden", !modoManual);
  manualWrap.innerHTML = "";

  if (modoManual) {
    const deudores = participantes.filter(p => p !== tarjeta);
    if (deudores.length === 0) {
      manualWrap.innerHTML = `<p class="hint">No hay nadie que le deba a ${tarjeta} en este ítem.</p>`;
    }
    for (const p of deudores) {
      const key = `${p}->${tarjeta}`;
      if (manualValues[key] === undefined) manualValues[key] = autoDeudas[key] ?? 0;
      const row = document.createElement("div");
      row.className = "manual-row";
      row.innerHTML = `
        <span>${p} paga a ${tarjeta}:</span>
        <input type="number" step="0.01" min="0" data-key="${key}" value="${manualValues[key]}">
      `;
      manualWrap.appendChild(row);
    }
    manualWrap.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        manualValues[inp.dataset.key] = parseFloat(inp.value) || 0;
        renderPreview();
      });
    });
  }

  renderPreview();

  function renderPreview() {
    const deudasFinal = modoManual ? manualValues : autoDeudas;
    const lineas = Object.entries(deudasFinal)
      .filter(([, v]) => v)
      .map(([par, v]) => {
        const [de, a] = par.split("->");
        return `${de} → ${a}: <strong>${formatoMoneda(v)}</strong>`;
      });
    el("f-preview").innerHTML = `
      <div><strong>Cuota de este mes:</strong> ${formatoMoneda(cuota)} (cuota ${cuotasTotal > 0 ? "1" : "-"} de ${cuotasTotal})</div>
      <div style="margin-top:6px;">${lineas.length ? lineas.join("<br>") : "Nadie le debe a nadie por este ítem."}</div>
    `;
  }
}

el("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = el("f-nombre").value.trim();
  const montoTotal = parseFloat(el("f-monto").value);
  const cuotasTotal = parseInt(el("f-cuotas").value);
  const tarjeta = el("f-tarjeta").value;
  const participantes = leerParticipantesSeleccionados();
  const modo = el("f-modo-manual").checked ? "manual" : "auto";

  if (!nombre || !montoTotal || !cuotasTotal || participantes.length === 0) {
    mostrarToast("Completá todos los campos y tildá al menos un participante.");
    return;
  }

  const deudas = modo === "manual"
    ? { ...manualValues }
    : calcularDeudasAuto(tarjeta, participantes, montoTotal, cuotasTotal);

  const cuotaActual = editingItemId
    ? (itemsDelMes.find(i => i.id === editingItemId)?.cuotaActual || 1)
    : 1;

  const data = {
    nombre, montoTotal, cuotasTotal, cuotaActual,
    montoCuota: montoCuota(montoTotal, cuotasTotal),
    tarjeta, participantes, modo, deudas,
    editadoPor: currentUser
  };

  if (editingItemId) {
    await DB.actualizarItem(currentMonthId, editingItemId, data);
    await DB.registrarAuditoria({
      usuario: currentUser, accion: "editar_item", monthId: currentMonthId,
      detalle: `Editó "${nombre}" (${formatoMoneda(montoTotal)}, ${cuotasTotal} cuotas, tarjeta: ${tarjeta}).`
    });
    mostrarToast("Gasto actualizado.");
  } else {
    data.creadoPor = currentUser;
    await DB.crearItem(currentMonthId, data);
    await DB.registrarAuditoria({
      usuario: currentUser, accion: "crear_item", monthId: currentMonthId,
      detalle: `Agregó "${nombre}" (${formatoMoneda(montoTotal)}, ${cuotasTotal} cuotas, tarjeta: ${tarjeta}).`
    });
    mostrarToast("Gasto agregado.");
  }

  await DB.registrarUltimoCambio();
  cerrarModalItem();
  await refrescarTodo();
  await actualizarUltimoCambioLabel();
});

// ---------------- BORRAR (item o mes) ----------------
const confirmModal = el("confirm-modal");

function abrirConfirmBorrado(itemId) {
  const item = itemsDelMes.find(i => i.id === itemId);
  if (!item) return;
  pendienteBorrar = { tipo: "item", id: itemId };
  el("confirm-title").textContent = "¿Eliminar este gasto?";
  el("confirm-text").textContent = `Se eliminará "${item.nombre}" (${formatoMoneda(item.montoTotal)}) de ${monthIdToLabel(currentMonthId)}.`;
  confirmModal.classList.remove("hidden");
}

el("confirm-cancel-btn").addEventListener("click", () => {
  confirmModal.classList.add("hidden");
  pendienteBorrar = null;
});

el("confirm-delete-btn").addEventListener("click", async () => {
  if (!pendienteBorrar) return;

  if (pendienteBorrar.tipo === "item") {
    const item = itemsDelMes.find(i => i.id === pendienteBorrar.id);
    await DB.eliminarItem(currentMonthId, pendienteBorrar.id);
    await DB.registrarUltimoCambio();
    await DB.registrarAuditoria({
      usuario: currentUser, accion: "eliminar_item", monthId: currentMonthId,
      detalle: `Eliminó "${item?.nombre || pendienteBorrar.id}".`
    });
    confirmModal.classList.add("hidden");
    pendienteBorrar = null;
    mostrarToast("Gasto eliminado.");
    await refrescarTodo();
    await actualizarUltimoCambioLabel();
  } else if (pendienteBorrar.tipo === "mes") {
    const monthId = pendienteBorrar.id;
    const label = monthIdToLabel(monthId);
    await DB.eliminarMes(monthId);
    await DB.registrarAuditoria({
      usuario: currentUser, accion: "eliminar_mes", monthId: null,
      detalle: `Eliminó ${label} y todos sus gastos.`
    });
    confirmModal.classList.add("hidden");
    pendienteBorrar = null;
    meses = await DB.listarMeses();
    currentMonthId = meses[meses.length - 1].id;
    sincronizarSelectoresMes();
    mostrarToast(`${label} eliminado.`);
    await refrescarTodo();
  }
});

// ============================================================
// INFORME MENSUAL
// ============================================================
const reportModal = el("report-modal");

el("generate-report-btn").addEventListener("click", async () => {
  await generarInforme();
  el("report-modal-month").textContent = monthIdToLabel(currentMonthId);
  reportModal.classList.remove("hidden");
});

el("report-close-btn").addEventListener("click", () => {
  reportModal.classList.add("hidden");
});

async function generarInforme() {
  const totalDeudas = sumarDeudas(itemsDelMes);
  const netos = calcularNetos(totalDeudas);
  const pagos = await DB.obtenerPagos(currentMonthId);

  await DB.guardarInforme(currentMonthId, {
    netos, generadoPor: currentUser
  });
  await DB.registrarAuditoria({
    usuario: currentUser, accion: "generar_informe", monthId: currentMonthId,
    detalle: `Generó el informe de ${monthIdToLabel(currentMonthId)}.`
  });

  ultimoInforme = { netos, pagos, monthId: currentMonthId };
  el("report-download-pdf-btn").classList.remove("hidden");
  renderInforme(netos, pagos);
  mostrarToast("Informe generado.");
}

function renderInforme(netos, pagos) {
  const cont = el("report-content");
  if (netos.length === 0) {
    cont.innerHTML = `<div class="report-card"><p>No hay deudas pendientes entre las tres partes para ${monthIdToLabel(currentMonthId)}. ¡Todo saldado! 🎉</p></div>`;
    return;
  }
  cont.innerHTML = `<div class="report-card" id="report-list"></div>`;
  const list = el("report-list");
  for (const n of netos) {
    const key = `${n.de}->${n.a}`;
    const liquidado = pagos?.[key]?.liquidado;
    const row = document.createElement("div");
    row.className = "report-total";
    row.innerHTML = `
      <span>${n.de} le paga a ${n.a}</span>
      <span class="report-amount">${formatoMoneda(n.monto)}</span>
      <button class="btn-secondary btn-small" data-key="${key}">
        ${liquidado ? '<span class="settled-tag">✓ Pagado</span>' : "Marcar como pagado"}
      </button>
    `;
    list.appendChild(row);
  }
  list.querySelectorAll("button[data-key]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key;
      const yaLiquidado = pagos?.[key]?.liquidado;
      await DB.marcarPagoLiquidado(currentMonthId, key, !yaLiquidado, currentUser);
      await DB.registrarAuditoria({
        usuario: currentUser, accion: "marcar_pago", monthId: currentMonthId,
        detalle: `Marcó "${key.replace("->", " → ")}" como ${!yaLiquidado ? "pagado" : "pendiente"}.`
      });
      const pagosNuevo = await DB.obtenerPagos(currentMonthId);
      if (ultimoInforme) ultimoInforme.pagos = pagosNuevo;
      renderInforme(netos, pagosNuevo);
    });
  });
}

el("report-download-pdf-btn").addEventListener("click", descargarInformePDF);

async function descargarInformePDF() {
  if (!ultimoInforme) return;
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");
  const pdf = new jsPDF();
  const monthLabel = monthIdToLabel(ultimoInforme.monthId);

  pdf.setFontSize(16);
  pdf.text(`Informe — ${monthLabel}`, 14, 20);

  pdf.setFontSize(11);
  let y = 34;
  if (ultimoInforme.netos.length === 0) {
    pdf.text("No hay deudas pendientes entre las tres partes. ¡Todo saldado!", 14, y);
  } else {
    for (const n of ultimoInforme.netos) {
      const key = `${n.de}->${n.a}`;
      const liquidado = ultimoInforme.pagos?.[key]?.liquidado;
      pdf.text(`${n.de} le paga a ${n.a}: ${formatoMoneda(n.monto)}${liquidado ? " (Pagado)" : ""}`, 14, y);
      y += 8;
    }
  }
  pdf.save(`informe-${ultimoInforme.monthId}.pdf`);
}

// ============================================================
// AUDITORÍA
// ============================================================
el("audit-only-month").addEventListener("change", renderAuditoria);

async function renderAuditoria() {
  const cont = el("audit-log");
  cont.innerHTML = `<p class="hint">Cargando...</p>`;
  const entries = await DB.listarAuditoria(300);
  const soloMes = el("audit-only-month").checked;
  const filtradas = soloMes ? entries.filter(e => e.monthId === currentMonthId) : entries;

  if (filtradas.length === 0) {
    cont.innerHTML = `<p class="hint">Sin actividad registrada todavía.</p>`;
    return;
  }

  cont.innerHTML = "";
  for (const e of filtradas) {
    const div = document.createElement("div");
    div.className = "audit-entry";
    const cuando = e.ts?.toDate ? e.ts.toDate().toLocaleString("es-AR") : "";
    div.innerHTML = `
      <span><span class="badge badge-${e.usuario}">${e.usuario}</span> ${escapeHtml(e.detalle || e.accion)}</span>
      <span class="audit-when">${cuando}</span>
    `;
    cont.appendChild(div);
  }
}

// ============================================================
// ÚLTIMO CAMBIO (barra superior)
// ============================================================
async function actualizarUltimoCambioLabel() {
  const info = await DB.obtenerUltimoCambio();
  const label = el("last-change-label");
  if (info?.ts?.toDate) {
    const fecha = info.ts.toDate().toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    label.textContent = `Último cambio: ${fecha}`;
  } else {
    label.textContent = "Sin cambios registrados todavía";
  }
}

// ============================================================
// TOAST
// ============================================================
let toastTimer = null;
function mostrarToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}
