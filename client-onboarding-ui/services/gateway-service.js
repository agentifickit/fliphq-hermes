// Gateway service — process management for client gateways

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HERMES_HOME = process.env.HERMES_HOME || path.join(process.env.HOME || '/home/pulkit', '.hermes');

const PID_DIR = path.join(HERMES_HOME, 'gateway-pids');
fs.mkdirSync(PID_DIR, { recursive: true });

function getPidFile(slug) {
  return path.join(PID_DIR, `${slug}.pid`);
}

export function getGatewayStatus(slug) {
  const pidFile = getPidFile(slug);
  
  if (!fs.existsSync(pidFile)) {
    return { status: 'stopped', pid: null, uptime: null };
  }
  
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  
  // Check if process is actually running
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    return { status: 'running', pid, uptime: getUptime(pid) };
  } catch {
    // Process not running, stale PID file
    fs.unlinkSync(pidFile);
    return { status: 'stopped', pid: null, uptime: null };
  }
}

function getUptime(pid) {
  try {
    const output = execSync(`ps -o etime= -p ${pid} 2>/dev/null || echo ''`, { encoding: 'utf8' }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function startGateway(slug) {
  const status = getGatewayStatus(slug);
  if (status.status === 'running') {
    return { status: 'already-running', pid: status.pid };
  }
  
  const logFile = path.join(HERMES_HOME, 'logs', `gateway-${slug}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  
  // Start gateway as background process
  const proc = spawn('hermes', ['--profile', slug, 'gateway', 'run'], {
    detached: true,
    stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
    env: { ...process.env, HERMES_HOME },
  });
  
  proc.unref();
  
  // Write PID file
  const pidFile = getPidFile(slug);
  fs.writeFileSync(pidFile, String(proc.pid), 'utf8');
  
  return { status: 'started', pid: proc.pid };
}

export function stopGateway(slug) {
  const status = getGatewayStatus(slug);
  if (status.status === 'stopped') {
    return { status: 'already-stopped' };
  }
  
  try {
    process.kill(status.pid, 'SIGTERM');
    
    // Wait for graceful shutdown
    setTimeout(() => {
      try {
        process.kill(status.pid, 0);
        // Still running, force kill
        process.kill(status.pid, 'SIGKILL');
      } catch {
        // Process exited
      }
    }, 5000);
    
    // Remove PID file
    const pidFile = getPidFile(slug);
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    
    return { status: 'stopped' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

export function restartGateway(slug) {
  stopGateway(slug);
  // Small delay to ensure clean shutdown
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = startGateway(slug);
      resolve({ status: 'restarted', ...result });
    }, 1000);
  });
}

export function getGatewayLogs(slug, lines = 100) {
  const logFile = path.join(HERMES_HOME, 'logs', `gateway-${slug}.log`);
  
  if (!fs.existsSync(logFile)) {
    return [];
  }
  
  try {
    const output = execSync(`tail -n ${lines} "${logFile}" 2>/dev/null || echo ''`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
