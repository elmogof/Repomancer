// Runs the production server with its output in a log file. The "Repomancer" logon task
// (see startup.ps1) starts this hidden; it stays alive while the server runs, so stopping
// the task stops the server too.
// Options for testing a second copy: --port <n> --home <config folder>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appHome } from '../../server/src/home.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

// appHome() also moves the old ~/.git-manager folder to ~/.repomancer the first time.
const home = arg('home') || appHome();
fs.mkdirSync(home, { recursive: true });

// The log starts over once it passes 1 MB; the previous one is kept as server.old.log.
const log = path.join(home, 'server.log');
try { if (fs.statSync(log).size > 1024 * 1024) fs.renameSync(log, path.join(home, 'server.old.log')); } catch { /* no log yet */ }
const out = fs.openSync(log, 'a');
fs.writeSync(out, `\n--- ${new Date().toISOString()} starting Repomancer ---\n`);

const env = { ...process.env, REPOMANCER_HOME: home };
if (arg('port')) env.PORT = arg('port');
const server = spawn(process.execPath, ['server/src/index.js', '--prod'], { cwd: root, env, stdio: ['ignore', out, out], windowsHide: true });
server.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => server.kill());
