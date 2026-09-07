import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopDir = path.resolve(rootDir, '..');

const zipName = 'online-examination-system.zip';
const desktopZip = path.join(desktopDir, zipName);
const localZip = path.join(rootDir, zipName);

const filesToInclude = [
  'src',
  'public',
  'api',
  'server',
  'scripts',
  'dist',
  'data',
  'index.html',
  'vercel.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'README.md',
  'Online_Examination_System.pdf'
].filter(f => fs.existsSync(path.join(rootDir, f)));

console.log('Packaging files:', filesToInclude.join(', '));

// Remove existing zips if present
if (fs.existsSync(desktopZip)) fs.unlinkSync(desktopZip);
if (fs.existsSync(localZip)) fs.unlinkSync(localZip);

// Execute tar to create zip archive
const tarCmd = `tar.exe -a -c -f "${desktopZip}" ${filesToInclude.join(' ')}`;
console.log('Executing:', tarCmd);
execSync(tarCmd, { cwd: rootDir, stdio: 'inherit' });

// Copy to project root as well
fs.copyFileSync(desktopZip, localZip);

const stats = fs.statSync(desktopZip);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n==================================================');
console.log('🎉 ZIP ARCHIVE GENERATED SUCCESSFULLY!');
console.log(`📦 Desktop Location:   ${desktopZip}`);
console.log(`📁 Project Location:   ${localZip}`);
console.log(`📊 Total Archive Size: ${sizeMB} MB`);
console.log('==================================================\n');
