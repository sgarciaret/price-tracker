import { existsSync, rmSync } from 'node:fs';

// Borra la base temporal (y sus ficheros WAL) antes de cada suite para partir de cero.
// Es a propósito "best effort": los tests corren en paralelo y, si otro worker tiene la
// base abierta, Windows bloquea el fichero -shm (EPERM). En ese caso se ignora y la suite
// se limpia a sí misma (ver el beforeAll de api.test.ts) en lugar de fallar.
const dbPath = process.env.DB_PATH;
if (dbPath) {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!existsSync(path)) continue;
    try {
      rmSync(path);
    } catch {
      // Otro worker la tiene abierta: se omite el borrado.
    }
  }
}
