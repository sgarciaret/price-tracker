import { existsSync, rmSync } from 'node:fs';

// Borra la base temporal (y sus ficheros WAL) antes de cada suite para partir de cero.
// Es a propósito "best effort": los ficheros de test se ejecutan uno a uno (ver
// `fileParallelism` en vitest.config.ts), pero el worker del fichero anterior puede
// aún tener la base abierta y Windows bloquea el borrado (EPERM). En ese caso se
// ignora y la suite se limpia a sí misma (ver el beforeAll de api.test.ts) en vez de fallar.
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
