// ============================================================
// LÓGICA DE CÁLCULO DE DEUDAS
// ============================================================
// Regla automática: el monto de la cuota del mes (montoTotal / cuotasTotal)
// se reparte en partes iguales entre TODOS los participantes tildados
// (incluyendo, si corresponde, a quien pagó con su tarjeta). Cada
// participante que NO sea quien pagó, le debe su parte a quien pagó.
//
// Esto reproduce automáticamente los distintos casos que ya usaban a mano:
//  - Gasto 100% de una sola persona pagado con la tarjeta de otra:
//    participantes = [esa persona] (sin incluir al pagador) -> debe el 100%.
//  - Gasto compartido entre los 3: participantes = [Diego, Jessi, Bachi]
//    -> cada uno de los otros dos debe 1/3 de la cuota.
//  - Gasto compartido entre 2: participantes = esos 2 -> cada quien no pagó
//    debe su parte según cuántos participan.
//
// Si un caso puntual no encaja en un reparto igualitario (por ejemplo
// un monto redondeado "a ojo"), se puede activar el modo manual y
// cargar los montos exactos a mano.

export const PERSONAS = ["Diego", "Jessi", "Bachi"];

export function montoCuota(montoTotal, cuotasTotal) {
  if (!cuotasTotal || cuotasTotal <= 0) return 0;
  return montoTotal / cuotasTotal;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula el reparto automático de la cuota del mes.
 * @returns {{ [par: string]: number }} ej: { "Jessi->Diego": 16222.22 }
 */
export function calcularDeudasAuto(tarjeta, participantes, montoTotal, cuotasTotal) {
  const cuota = montoCuota(montoTotal, cuotasTotal);
  const n = participantes.length;
  const deudas = {};
  if (n === 0) return deudas;
  const parte = round2(cuota / n);
  for (const p of participantes) {
    if (p !== tarjeta) {
      deudas[`${p}->${tarjeta}`] = parte;
    }
  }
  return deudas;
}

/** Suma todas las deudas de una lista de ítems (mismo mes) en un único mapa "A->B": monto */
export function sumarDeudas(items) {
  const total = {};
  for (const item of items) {
    const deudas = item.deudas || {};
    for (const [par, monto] of Object.entries(deudas)) {
      total[par] = round2((total[par] || 0) + Number(monto || 0));
    }
  }
  return total;
}

/** Dado el mapa sumado de deudas, calcula el neto por cada par de personas. */
export function calcularNetos(totalDeudas) {
  const pares = [
    ["Diego", "Jessi"],
    ["Diego", "Bachi"],
    ["Jessi", "Bachi"]
  ];
  const resultado = [];
  for (const [a, b] of pares) {
    const aDebeAB = totalDeudas[`${a}->${b}`] || 0;
    const bDebeAA = totalDeudas[`${b}->${a}`] || 0;
    const neto = round2(aDebeAB - bDebeAA);
    if (neto > 0.005) {
      resultado.push({ de: a, a: b, monto: neto });
    } else if (neto < -0.005) {
      resultado.push({ de: b, a: a, monto: round2(-neto) });
    }
  }
  return resultado;
}

export function formatoMoneda(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

/** IDs de mes tipo "2026-08" -> etiqueta "Agosto 2026" */
export const NOMBRES_MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function monthIdToLabel(monthId) {
  const [y, m] = monthId.split("-").map(Number);
  return `${NOMBRES_MESES[m - 1]} ${y}`;
}

export function nextMonthId(monthId) {
  let [y, m] = monthId.split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
