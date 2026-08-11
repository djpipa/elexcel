// ============================================================
// DATOS INICIALES (reconstruidos del Excel ELEXCEL.xlsx)
// ============================================================
// Se cargan una sola vez, la primera vez que alguien entra y no
// hay ningún mes creado todavía. Reproducen exactamente los montos
// que ya estaban en la planilla (Agosto, Septiembre y Octubre 2026).
import { calcularDeudasAuto, montoCuota } from "./calc.js";

export const SEED_MESES = [
  {
    monthId: "2026-08",
    label: "Agosto 2026",
    items: [
      {
        id: "aire-acondicionado",
        nombre: "Aire acondicionado",
        montoTotal: 1156320,
        cuotasTotal: 12,
        cuotaActual: 10,
        tarjeta: "Bachi",
        participantes: ["Diego"],
        modo: "auto"
      },
      {
        id: "regalo-papa-ml",
        nombre: "Regalo papá (ML)",
        montoTotal: 146000,
        cuotasTotal: 3,
        cuotaActual: 3,
        tarjeta: "Diego",
        participantes: ["Diego", "Jessi", "Bachi"],
        modo: "auto"
      },
      {
        id: "regalo-dani",
        nombre: "Regalo Dani",
        montoTotal: 61000,
        cuotasTotal: 3,
        cuotaActual: 3,
        tarjeta: "Diego",
        participantes: ["Jessi"],
        modo: "auto"
      },
      {
        id: "sopladora-hojas",
        nombre: "Sopladora hojas",
        montoTotal: 63000,
        cuotasTotal: 3,
        cuotaActual: 2,
        tarjeta: "Diego",
        participantes: ["Jessi"],
        modo: "auto"
      },
      {
        id: "regalo-mati",
        nombre: "Regalo cumple Mati",
        montoTotal: 82150,
        cuotasTotal: 1,
        cuotaActual: 1,
        tarjeta: "Bachi",
        participantes: ["Diego", "Jessi"],
        modo: "manual",
        deudasManual: { "Jessi->Bachi": 20500, "Diego->Bachi": 20500 }
      }
    ]
  },
  {
    monthId: "2026-09",
    label: "Septiembre 2026",
    items: [
      {
        id: "aire-acondicionado",
        origenId: "aire-acondicionado",
        nombre: "Aire acondicionado",
        montoTotal: 1156320,
        cuotasTotal: 12,
        cuotaActual: 11,
        tarjeta: "Bachi",
        participantes: ["Diego"],
        modo: "auto"
      },
      {
        id: "sopladora-hojas",
        origenId: "sopladora-hojas",
        nombre: "Sopladora hojas",
        montoTotal: 63000,
        cuotasTotal: 3,
        cuotaActual: 3,
        tarjeta: "Diego",
        participantes: ["Jessi"],
        modo: "auto"
      }
    ]
  },
  {
    monthId: "2026-10",
    label: "Octubre 2026",
    items: [
      {
        id: "aire-acondicionado",
        origenId: "aire-acondicionado",
        nombre: "Aire acondicionado",
        montoTotal: 1156320,
        cuotasTotal: 12,
        cuotaActual: 12,
        tarjeta: "Bachi",
        participantes: ["Diego"],
        modo: "auto"
      }
    ]
  }
];

export function construirItemCompleto(raw) {
  const deudas = raw.modo === "manual"
    ? raw.deudasManual
    : calcularDeudasAuto(raw.tarjeta, raw.participantes, raw.montoTotal, raw.cuotasTotal);
  return {
    nombre: raw.nombre,
    montoTotal: raw.montoTotal,
    cuotasTotal: raw.cuotasTotal,
    cuotaActual: raw.cuotaActual,
    montoCuota: montoCuota(raw.montoTotal, raw.cuotasTotal),
    tarjeta: raw.tarjeta,
    participantes: raw.participantes,
    modo: raw.modo,
    deudas,
    origenId: raw.origenId || null,
    creadoPor: "Sistema (importado del Excel)",
    editadoPor: "Sistema (importado del Excel)"
  };
}
