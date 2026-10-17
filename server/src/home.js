// Carpeta de datos de la app (configuración, tokens, registro de operaciones y log del servidor).
// Por defecto ~/.repomancer. Si aún no existe y queda la de cuando la app se llamaba Git Manager
// (~/.git-manager), se mueve a la nueva; si no se puede mover (archivos abiertos), se copia.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function appHome() {
  const fromEnv = process.env.REPOMANCER_HOME || process.env.GIT_MANAGER_HOME;
  if (fromEnv) return fromEnv;
  const home = path.join(os.homedir(), '.repomancer');
  const legacy = path.join(os.homedir(), '.git-manager');
  if (!fs.existsSync(home) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, home);
    } catch {
      try { fs.cpSync(legacy, home, { recursive: true }); } catch { /* se crea vacía al guardar */ }
    }
  }
  return home;
}
