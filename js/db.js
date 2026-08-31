// ============================================================
// CAPA DE DATOS: Firebase (Auth + Firestore)
// ============================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, orderBy, limit, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const dbase = getFirestore(app);

// Cada persona tiene un correo interno fijo; el "PIN" que ingresan
// es, en los hechos, la contraseña de esa cuenta de Firebase Auth.
// Esto nos da autenticación real (nadie fuera de la familia puede
// leer o escribir datos) manteniendo la experiencia simple de "elegí
// tu nombre + PIN" que se pidió.
export function emailDePersona(nombre) {
  return `${nombre.toLowerCase()}@gastos-familia.app`;
}

export async function iniciarSesion(nombre, pin) {
  const email = emailDePersona(nombre);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pin);
    return { ok: true, primeraVez: false, user: cred.user };
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      // Puede ser la primera vez que esta persona entra: intentamos crear la cuenta.
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pin);
        return { ok: true, primeraVez: true, user: cred.user };
      } catch (err2) {
        return { ok: false, error: traducirErrorAuth(err2) };
      }
    }
    return { ok: false, error: traducirErrorAuth(err) };
  }
}

export function cerrarSesion() {
  return signOut(auth);
}

export function alCambiarSesion(cb) {
  return onAuthStateChanged(auth, cb);
}

function traducirErrorAuth(err) {
  switch (err.code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "PIN incorrecto.";
    case "auth/weak-password":
      return "El PIN debe tener al menos 6 dígitos.";
    case "auth/invalid-email":
      return "Nombre de usuario inválido.";
    case "auth/network-request-failed":
      return "No se pudo conectar. Revisá tu internet.";
    case "auth/configuration-not-found":
      return "Falta habilitar 'Email/Password' en Firebase Authentication (ver README).";
    default:
      return `Error: ${err.message || err.code}`;
  }
}

// ---------------- MESES ----------------
export async function listarMeses() {
  const q = query(collection(dbase, "months"), orderBy("__name__"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function crearMesSiNoExiste(monthId, label) {
  const ref = doc(dbase, "months", monthId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { label, creadoEn: serverTimestamp() });
  }
  return ref;
}

export async function eliminarMes(monthId) {
  const itemsSnap = await getDocs(collection(dbase, "months", monthId, "items"));
  for (const d of itemsSnap.docs) {
    await deleteDoc(d.ref);
  }
  const metaSnap = await getDocs(collection(dbase, "months", monthId, "meta"));
  for (const d of metaSnap.docs) {
    await deleteDoc(d.ref);
  }
  await deleteDoc(doc(dbase, "months", monthId));
}

// ---------------- ITEMS ----------------
export async function listarItems(monthId) {
  const q = query(collection(dbase, "months", monthId, "items"), orderBy("creadoEn", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function crearItem(monthId, data) {
  const ref = await addDoc(collection(dbase, "months", monthId, "items"), {
    ...data,
    creadoEn: serverTimestamp(),
    editadoEn: serverTimestamp()
  });
  return ref.id;
}

export async function crearItemConId(monthId, itemId, data) {
  const ref = doc(dbase, "months", monthId, "items", itemId);
  await setDoc(ref, {
    ...data,
    creadoEn: serverTimestamp(),
    editadoEn: serverTimestamp()
  });
  return itemId;
}

export async function actualizarItem(monthId, itemId, data) {
  const ref = doc(dbase, "months", monthId, "items", itemId);
  await updateDoc(ref, { ...data, editadoEn: serverTimestamp() });
}

export async function eliminarItem(monthId, itemId) {
  const ref = doc(dbase, "months", monthId, "items", itemId);
  await deleteDoc(ref);
}

// ---------------- AUDITORÍA ----------------
export async function registrarAuditoria({ usuario, accion, monthId, detalle }) {
  await addDoc(collection(dbase, "audit"), {
    usuario, accion, monthId: monthId || null, detalle: detalle || "",
    ts: serverTimestamp()
  });
}

export async function listarAuditoria(max = 200) {
  const q = query(collection(dbase, "audit"), orderBy("ts", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------- ESTADO "PAGADO" DEL INFORME ----------------
export async function guardarInforme(monthId, informe) {
  const ref = doc(dbase, "months", monthId, "meta", "informe");
  await setDoc(ref, { ...informe, generadoEn: serverTimestamp() });
}

export async function obtenerInforme(monthId) {
  const ref = doc(dbase, "months", monthId, "meta", "informe");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function marcarPagoLiquidado(monthId, parKey, liquidado, usuario) {
  const ref = doc(dbase, "months", monthId, "meta", "pagos");
  // merge:true evita pisar los pagos que haya marcado otra persona al mismo
  // tiempo (antes se leía el documento entero y se reescribía completo).
  await setDoc(ref, { [parKey]: { liquidado, por: usuario, en: Timestamp.now() } }, { merge: true });
}

export async function obtenerPagos(monthId) {
  const ref = doc(dbase, "months", monthId, "meta", "pagos");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
}

// ---------------- ÚLTIMO CAMBIO GLOBAL ----------------
export async function registrarUltimoCambio() {
  await setDoc(doc(dbase, "meta", "ultimoCambio"), { ts: serverTimestamp() });
}

export async function obtenerUltimoCambio() {
  const snap = await getDoc(doc(dbase, "meta", "ultimoCambio"));
  return snap.exists() ? snap.data() : null;
}
