const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const missing = [];

function checkFile(reference, fromDir, label) {
  const filePath = path.resolve(fromDir, reference);
  if (!fs.existsSync(filePath)) {
    missing.push(`${label}: ${path.relative(rootDir, filePath)}`);
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(readFile(packageJsonPath));

if (packageJson.main) {
  checkFile(packageJson.main, rootDir, 'package.json main');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      files.push(...walk(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

const appFilePath = path.join(rootDir, 'src', 'main', 'app.js');
if (fs.existsSync(appFilePath)) {
  const appSource = readFile(appFilePath);
  const loadFilePattern = /loadFile\(path\.join\(__dirname,\s*([^)]+)\)\)/g;
  for (const match of appSource.matchAll(loadFilePattern)) {
    const segments = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((part) => part[1]);
    if (segments.length > 0) checkFile(path.join(...segments), path.dirname(appFilePath), 'BrowserWindow.loadFile');
  }

  const toolWindowPattern = /createToolWindow\(\s*['"]([^'"]+)['"]/g;
  for (const match of appSource.matchAll(toolWindowPattern)) {
    checkFile(path.join('..', match[1]), path.dirname(appFilePath), 'BrowserWindow.loadFile');
  }
}

const htmlFiles = walk(path.join(rootDir, 'src')).filter((filePath) => filePath.endsWith('.html'));
for (const htmlFile of htmlFiles) {
  const html = readFile(htmlFile);
  const htmlDir = path.dirname(htmlFile);

  const scriptPattern = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/g;
  for (const match of html.matchAll(scriptPattern)) {
    if (!/^[a-z]+:/i.test(match[1]) && !match[1].startsWith('//')) {
      checkFile(match[1], htmlDir, 'HTML script');
    }
  }

  const stylePattern = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g;
  for (const match of html.matchAll(stylePattern)) {
    if (!/^[a-z]+:/i.test(match[1]) && !match[1].startsWith('//')) {
      checkFile(match[1], htmlDir, 'HTML stylesheet');
    }
  }
}

if (missing.length > 0) {
  console.error('Missing local file references:');
  for (const item of missing) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('All checked local file references exist.');
}
