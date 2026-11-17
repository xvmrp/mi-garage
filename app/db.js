// Almacenamiento local (IndexedDB): la colección y las fotos propias.
//
// Registro de la colección:
// { id, cantidad, deseo, condicion, fecha, precio, tienda, notas, tieneFoto,
//   creado, actualizado, personalizado, ref: {n, y, l, s, sn, t, c, co, p} }
// `ref` es una copia de los datos del catálogo, para que el registro se siga
// viendo bien aunque el catálogo cambie al actualizarlo.

const NOMBRE = "mi-garage";
const VERSION = 1;
let conexion;

function abrir() {
  if (!conexion) {
    conexion = new Promise((resolver, rechazar) => {
      const pet = indexedDB.open(NOMBRE, VERSION);
      pet.onupgradeneeded = () => {
        const db = pet.result;
        if (!db.objectStoreNames.contains("coleccion")) db.createObjectStore("coleccion", { keyPath: "id" });
        if (!db.objectStoreNames.contains("fotos")) db.createObjectStore("fotos");
      };
      pet.onsuccess = () => resolver(pet.result);
      pet.onerror = () => rechazar(pet.error);
    });
  }
  return conexion;
}

async function operar(almacen, modo, fn) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(almacen, modo);
    const resultado = fn(tx.objectStore(almacen));
    tx.oncomplete = () => resolver(resultado && "result" in resultado ? resultado.result : undefined);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

export const todos = () => operar("coleccion", "readonly", (s) => s.getAll());
export const guardar = (registro) => operar("coleccion", "readwrite", (s) => s.put(registro));
export const borrar = (id) => operar("coleccion", "readwrite", (s) => s.delete(id));

export const leerFoto = (id) => operar("fotos", "readonly", (s) => s.get(id));
export const guardarFoto = (id, blob) => operar("fotos", "readwrite", (s) => s.put(blob, id));
export const borrarFoto = (id) => operar("fotos", "readwrite", (s) => s.delete(id));
export const todasLasFotos = async () => {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const salida = new Map();
    const tx = db.transaction("fotos", "readonly");
    const cursor = tx.objectStore("fotos").openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) { salida.set(c.key, c.value); c.continue(); }
    };
    tx.oncomplete = () => resolver(salida);
    tx.onerror = () => rechazar(tx.error);
  });
};

export async function borrarTodo() {
  await operar("coleccion", "readwrite", (s) => s.clear());
  await operar("fotos", "readwrite", (s) => s.clear());
}

// Pide al navegador que no borre los datos si falta espacio.
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* no disponible */ }
}
