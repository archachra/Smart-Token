import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 [DevRunner] Starting SmartToken Backend API Server (port 3001)...');
const serverProc = spawn('node', ['server/index.js'], {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log('⚡ [DevRunner] Starting SmartToken Vite Dev Server (port 5173)...');
const viteProc = spawn('npx', ['vite'], {
  cwd: rootDir,
  stdio: 'inherit',
});

function cleanup(code = 0) {
  try {
    serverProc.kill('SIGINT');
  } catch {}
  try {
    viteProc.kill('SIGINT');
  } catch {}
  process.exit(code);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

serverProc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[DevRunner] Backend server exited with code ${code}`);
  }
});

viteProc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[DevRunner] Vite dev server exited with code ${code}`);
  }
  cleanup(code || 0);
});
