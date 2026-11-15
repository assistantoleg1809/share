#!/usr/bin/env node
// collect.mjs — сборка центрального индекса проектов ship-kit.
//
// node collect.mjs <репо1> [репо2 ...]
//   <репоN> — путь к репозиторию с файлом проектов (мастер записи).
//
// Читает файл проектов каждого репо, контролирует уникальность имён
// проектов и пишет projects.index.md рядом с собой — автособираемое
// зеркало: руками не правится, правки — только в репо-файлах.
// Дубликат имени → ненулевой exit, индекс не обновляется.
//
// Зависимостей нет: node:fs / node:path. Имя файла проектов —
// конвенция этого примера; организация может назвать иначе
// (скиллы ship-kit формат не фиксируют).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECTS_FILE = 'ship-kit.projects.md';
const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, 'projects.index.md');

const repos = process.argv.slice(2);
if (repos.length === 0) {
  console.error('использование: node collect.mjs <репо1> [репо2 ...]');
  process.exit(2);
}

const errors = [];
const records = [];

for (const repo of repos) {
  const file = join(repo, PROJECTS_FILE);
  if (!existsSync(file)) {
    errors.push(`${repo}: нет ${PROJECTS_FILE}`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^##\s+(.+)$/m); // имя проекта — первый «## …»
  if (!m) {
    errors.push(`${file}: нет заголовка проекта (## <имя>)`);
    continue;
  }
  records.push({ name: m[1].trim(), file, text });
}

const seen = new Map();
for (const r of records) {
  if (seen.has(r.name)) {
    errors.push(
      `дубликат имени «${r.name}»: ${seen.get(r.name).file} и ${r.file}`
    );
  } else {
    seen.set(r.name, r);
  }
}

if (errors.length > 0) {
  console.error('❌ индекс не собран:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
let md = `# Центральный каталог проектов — индекс

<!-- АВТОГЕНЕРАТ collect.mjs ${stamp} UTC: руками не править. -->
<!-- Мастер каждой записи — файл проекта в репозитории; правка записи
     только там, затем пересборка индекса. -->

Индекс — зеркало репо-файлов, собранное генератором
[collect.mjs](collect.mjs). Скиллы ship-kit читают его как обычный
контекст сессии (ярус «центральный каталог» каскада; репо-файл в cwd
сильнее). Проектов: ${seen.size}.

`;

for (const r of records) {
  md += `---

<!-- источник: ${r.file} -->

${r.text.trimEnd()}

`;
}

writeFileSync(INDEX, md);
console.log(`OK: ${seen.size} проектов → ${INDEX}`);
