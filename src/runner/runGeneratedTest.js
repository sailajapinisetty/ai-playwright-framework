import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

async function cleanPlaywrightArtifacts() {
  const targets = [
    path.resolve(process.cwd(), '.playwright-output')
  ];

  await Promise.all(targets.map((target) => fs.rm(target, { recursive: true, force: true })));
}

export async function runGeneratedTest() {
  await cleanPlaywrightArtifacts();

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['playwright', 'test', 'generated_tests'], {
      stdio: 'inherit',
      shell: true
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', async (code) => {
      await cleanPlaywrightArtifacts();
      if (code === 0) {
        resolve({ passed: true, code });
      } else {
        resolve({ passed: false, code });
      }
    });
  });
}
