// Runs the production server with its output in a log file. The "Git Manager" logon task
// (see startup.ps1) starts this hidden; it stays alive while the server runs, so stopping
// the task stops the server too.
// Options for testing a second copy: --port <n> --home <config folder>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

const home = arg('home') || process.env.GIT_MANAGER_HOME || path.join(os.homedir(), '.git-manager');
fs.mkdirSync(home, { recursive: true });

// The log starts over once it passes 1 MB; the previous one is kept as server.old.log.
const log = path.join(home, 'server.log');
try { if (fs.statSync(log).size > 1024 * 1024) fs.renameSync(log, path.join(home, 'server.old.log')); } catch { /* no log yet */ }
const out = fs.openSync(log, 'a');
fs.writeSync(out, `\n--- ${new Date().toISOString()} starting Git Manager ---\n`);

const env = { ...process.env, GIT_MANAGER_HOME: home };
if (arg('port')) env.PORT = arg('port');
const server = spawn(process.execPath, ['server/src/index.js', '--prod'], { cwd: root, env, stdio: ['ignore', out, out], windowsHide: true });
server.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => server.kill());
