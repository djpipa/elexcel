# 💰 Gastos Compartidos — Diego, Jessi & Bachi

App web para llevar el registro de gastos compartidos entre los tres, con reparto automático de cuotas, informe mensual de quién le paga a quién, y una tira auditora de quién cargó o modificó cada cosa.

No hace falta programar nada más: son archivos estáticos (HTML/CSS/JS) que corren en el navegador y guardan los datos en **Firebase** (gratis). Se publica en **GitHub Pages**.

## Qué incluye

- Alta, edición y borrado de gastos por mes, con: ítem, monto total, cantidad de cuotas, **quién usó la tarjeta**, y entre quiénes se reparte.
- Cálculo **automático** de cuánto le debe cada uno a quien pagó (reparto en partes iguales entre los participantes tildados), con opción de ajustar montos a mano para casos puntuales.
- Botón **"Generar mes siguiente"**: crea el próximo mes y arrastra automáticamente las cuotas que todavía no terminaron.
- Botón **"Generar informe"**: calcula el saldo neto final del mes (quién le paga a quién, ya descontando lo que se deben entre sí) y permite marcarlo como pagado.
- **Tira auditora**: registro de cada alta, edición, borrado, generación de mes e informe, con quién lo hizo y cuándo.
- Login simple por nombre + PIN de 6 dígitos (cada uno tiene su propia cuenta; nadie de afuera puede ver ni tocar los datos).
- Los datos de Agosto, Septiembre y Octubre 2026 que ya estaban en el Excel vienen precargados la primera vez que alguien entra.

---

## Paso 1 — Crear el proyecto en Firebase (gratis, 5 minutos)

1. Andá a [console.firebase.google.com](https://console.firebase.google.com) y entrá con una cuenta de Google.
2. **Crear proyecto** → ponele un nombre, por ejemplo `gastos-familia`. Podés desactivar Google Analytics, no hace falta.
3. Dentro del proyecto, andá a **Compilación → Authentication → Comenzar**. En la pestaña **Sign-in method**, habilitá el proveedor **Correo electrónico/contraseña** (solo la primera opción, no hace falta el link de acceso).
4. Andá a **Compilación → Firestore Database → Crear base de datos**. Elegí **modo producción** y la ubicación más cercana (por ejemplo `southamerica-east1`).
5. Una vez creada, andá a la pestaña **Reglas** de Firestore y pegá el contenido del archivo [`firestore.rules`](./firestore.rules) de esta carpeta, reemplazando lo que haya. Publicá los cambios.
6. Volvé a la pantalla principal del proyecto (ícono de engranaje → **Configuración del proyecto**). Bajá hasta "Tus apps" y hacé clic en el ícono **`</>`** (Web) para registrar una app web. Ponele un apodo (ej. "gastos-web") y **no** hace falta configurar Hosting de Firebase.
7. Firebase te va a mostrar un bloque `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`. Copiá esos valores.

## Paso 2 — Pegar la configuración en el proyecto

Abrí el archivo [`js/firebase-config.js`](./js/firebase-config.js) y reemplazá los valores de ejemplo por los que copiaste de Firebase:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "gastos-familia-xxxx.firebaseapp.com",
  projectId: "gastos-familia-xxxx",
  storageBucket: "gastos-familia-xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcabc"
};
```

> Estos datos **no son secretos** — es normal que queden visibles en un repositorio público. Lo que realmente protege la información son las Reglas de Firestore del paso anterior (solo Diego, Jessi y Bachi, ya logueados, pueden leer o escribir).

## Paso 3 — Subir a GitHub Pages

1. Creá un repositorio público nuevo en GitHub (ej. `gastos-compartidos`).
2. Subí **todo el contenido de esta carpeta** (`index.html`, `css/`, `js/`, etc.) a la raíz del repositorio.
3. En el repositorio, andá a **Settings → Pages**. En "Build and deployment" elegí **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guardá.
4. En un par de minutos la app va a estar disponible en `https://tu-usuario.github.io/gastos-compartidos/`.

## Paso 4 — Primer uso

1. Entrá a la URL. Elegí tu nombre (Diego, Jessi o Bachi) e inventá un PIN de 6 dígitos — esa primera vez, el PIN queda guardado como el tuyo. Las próximas veces usás el mismo.
2. Al entrar por primera vez, la app carga sola los gastos de Agosto, Septiembre y Octubre 2026 que ya estaban en el Excel.
3. Cuando termine un mes, usá **"+ Generar mes siguiente"**: crea el mes que sigue y arrastra automáticamente los gastos en cuotas que todavía no se terminaron de pagar (por ejemplo el aire acondicionado).
4. Para saber cuánto hay que pasarse entre todos a fin de mes, andá a la pestaña **Informe** y tocá **"Generar informe"**.

---

## Cómo funciona el reparto automático

Cada gasto tiene: **monto total**, **cantidad de cuotas** y **quién pagó con su tarjeta**. La app calcula la cuota de ese mes (`monto total ÷ cuotas`) y la reparte en partes iguales entre las personas que tildes como "participantes":

- Si tildás a **una sola persona** (sin incluir a quien pagó), esa persona le debe el 100% de la cuota a quien pagó — para gastos que son 100% de otro pero se pagaron con tu tarjeta.
- Si tildás **a los tres**, cada uno de los otros dos le debe un tercio de la cuota a quien pagó (quien pagó se queda con su propio tercio).
- Si tildás a **dos personas**, se reparte a la mitad entre ellas.

Si algún gasto puntual no encaja en un reparto parejo (por ejemplo, montos redondeados a mano entre todos), tildá **"Ajustar montos manualmente"** en el formulario y cargá los montos exactos.

## Seguridad y resguardo de datos

- Los datos viven en Firestore (Google Cloud), con respaldo y disponibilidad estándar de Google — no dependen del navegador de nadie ni se pueden perder por borrar el historial.
- Solo se puede entrar con el nombre + PIN de Diego, Jessi o Bachi; las reglas de Firestore bloquean cualquier acceso sin login.
- Cada acción (alta, edición, borrado, generación de mes/informe, marcar un pago) queda registrada en la pestaña **Auditoría** con quién y cuándo.
- El plan gratuito de Firebase (Spark) tiene más que de sobra para el uso de tres personas cargando gastos mensuales.

## Estructura del proyecto

```
gastos-compartidos/
├── index.html          # pantalla única de la app
├── css/styles.css
├── js/
│   ├── firebase-config.js   # tus credenciales de Firebase (pegar acá)
│   ├── db.js                 # acceso a Firebase (auth + Firestore)
│   ├── calc.js                # cálculo de reparto de gastos e informe
│   ├── seed.js                 # datos históricos del Excel (carga única)
│   └── app.js                   # interfaz y lógica de pantalla
├── firestore.rules      # reglas de seguridad para pegar en Firebase
└── README.md
```
