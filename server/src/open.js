// Abre una carpeta local en el explorador de archivos, VS Code o una terminal.
// Se usa spawn sin shell (salvo cmd /c para los .cmd de Windows) y la ruta siempre
// sale de la configuración del servidor, nunca de texto libre del cliente.
import { spawn } from 'node:child_process';

const win = process.platform === 'win32';
const mac = process.platform === 'darwin';

function launch(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, ...opts });
    child.once('error', (e) => reject(Object.assign(new Error(e.code === 'ENOENT' ? `No se encontró "${cmd}" en este equipo` : e.message), { status: 400 })));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export const TARGETS = ['folder', 'vscode', 'terminal'];

export async function openIn(target, dir) {
  switch (target) {
    case 'folder':
      if (win) return launch('explorer.exe', [dir]);
      return launch(mac ? 'open' : 'xdg-open', [dir]);
    case 'vscode':
      // "code" es un .cmd en Windows: hay que lanzarlo a través de cmd.exe.
      if (win) return launch('cmd.exe', ['/d', '/c', 'code', dir], { windowsHide: true });
      return launch('code', [dir]);
    case 'terminal':
      if (win) {
        // "start" crea una consola nueva con su propia entrada: lanzado directamente, PowerShell hereda la
        // entrada redirigida del servidor y se cierra al instante; y el alias wt.exe no abre nada cuando el
        // servidor corre dentro de otra app. Windows entrega la consola a la terminal predeterminada del sistema.
        return launch('cmd.exe', ['/d', '/c', 'start', 'powershell.exe', '-NoExit', '-NoLogo'], { cwd: dir, windowsHide: true });
      }
      if (mac) return launch('open', ['-a', 'Terminal', dir]);
      return launch('x-terminal-emulator', [], { cwd: dir });
    default:
      throw Object.assign(new Error('Destino no soportado'), { status: 400 });
  }
}

// Convierte la URL del remoto (https o ssh) en la URL web del proyecto, sin credenciales.
export function webUrl(remote) {
  if (!remote) return null;
  let m = remote.match(/^git@([^:]+):(.+?)(\.git)?$/) || remote.match(/^ssh:\/\/(?:[^@]+@)?([^/:]+)(?::\d+)?\/(.+?)(\.git)?$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  try {
    const u = new URL(remote);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.username = ''; u.password = '';
    return u.toString().replace(/\.git\/?$/, '');
  } catch { return null; }
}
