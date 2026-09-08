// Deploy service — runs deploy scripts

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export function deployClient(slug) {
  return new Promise((resolve, reject) => {
    const script = path.join(REPO_ROOT, 'scripts', 'deploy.sh');
    const profilePath = `clients/${slug}`;
    
    const proc = spawn('bash', [script, profilePath], {
      cwd: REPO_ROOT,
      env: { ...process.env },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        reject(new Error(`Deploy failed (exit ${code}): ${stderr || stdout}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to run deploy script: ${err.message}`));
    });
  });
}

export function deployInternal() {
  return new Promise((resolve, reject) => {
    const script = path.join(REPO_ROOT, 'scripts', 'deploy.sh');
    
    const proc = spawn('bash', [script, 'internal'], {
      cwd: REPO_ROOT,
      env: { ...process.env },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        reject(new Error(`Deploy failed (exit ${code}): ${stderr || stdout}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to run deploy script: ${err.message}`));
    });
  });
}
