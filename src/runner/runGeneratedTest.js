import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

async function cleanPlaywrightArtifacts() {
  const targets = [
    path.resolve(process.cwd(), '.playwright-output')
  ];

  await Promise.all(targets.map((target) => fs.rm(target, { recursive: true, force: true })));
}

export async function runGeneratedTest(testFiles = []) {
  await cleanPlaywrightArtifacts();

  const args = ['playwright', 'test'];
  if (Array.isArray(testFiles) && testFiles.length > 0) {
    args.push(...testFiles);
  } else {
    args.push('generated_tests');
  }

  return new Promise((resolve, reject) => {
    let outputBuffer = '';
    const maxOutputChars = 12_000;

    function appendOutput(chunk) {
      outputBuffer += chunk;
      if (outputBuffer.length > maxOutputChars) {
        outputBuffer = outputBuffer.slice(outputBuffer.length - maxOutputChars);
      }
    }

    const proc = spawn('npx', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    proc.stdout.on('data', (data) => {
      const text = String(data);
      process.stdout.write(text);
      appendOutput(text);
    });

    proc.stderr.on('data', (data) => {
      const text = String(data);
      process.stderr.write(text);
      appendOutput(text);
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', async (code) => {
      if (code === 0) {
        resolve({ passed: true, code, outputTail: outputBuffer.trim() });
      } else {
        resolve({ passed: false, code, outputTail: outputBuffer.trim() });
      }
    });
  });
}
