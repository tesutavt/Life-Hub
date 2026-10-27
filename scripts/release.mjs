#!/usr/bin/env node
// Выпуск новой версии Life Hub: версия → CHANGELOG → сборка exe и APK → коммит, тег, пуш → релиз на GitHub.
//
//   node scripts/release.mjs minor            # 1.1.0 → 1.2.0 (новые возможности)
//   node scripts/release.mjs patch            # 1.1.0 → 1.1.1 (исправления)
//   node scripts/release.mjs major            # 1.1.0 → 2.0.0 (крупные несовместимые изменения)
//   node scripts/release.mjs patch --dry-run  # только показать, что будет сделано
//   node scripts/release.mjs patch --no-build # не пересобирать (взять уже собранные файлы)
//
// Что попадёт в описание релиза — раздел «## [Не выпущено]» в CHANGELOG.md. Пустой раздел — ошибка:
// релиз без описания изменений не выпускается.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'tesutavt/Life-Hub';
const UNRELEASED = '## [Не выпущено]';

const args = process.argv.slice(2);
const bump = args.find((a) => ['major', 'minor', 'patch'].includes(a));
const dryRun = args.includes('--dry-run');
const noBuild = args.includes('--no-build');
if (!bump) {
  console.error('Укажите тип версии: major | minor | patch');
  process.exit(1);
}

const file = (rel) => path.join(ROOT, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => (dryRun ? console.log(`[dry-run] записать ${rel}`) : fs.writeFileSync(file(rel), text));
const run = (cmd, cwd = ROOT) => {
  console.log(`\n$ ${cmd}`);
  // ELECTRON_RUN_AS_NODE (ставит терминал VS Code) ломает сборку Electron — убираем
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!dryRun) execSync(cmd, { cwd, stdio: 'inherit', env });
};

// ── 1. Новая версия ──
const current = JSON.parse(read('electron/package.json')).version;
const [maj, min, pat] = current.split('.').map(Number);
const next = bump === 'major' ? `${maj + 1}.0.0` : bump === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
const tag = `v${next}`;
console.log(`Версия: ${current} → ${next}`);

// ── 2. Список изменений из CHANGELOG ──
const changelog = read('CHANGELOG.md');
const start = changelog.indexOf(UNRELEASED);
if (start === -1) throw new Error(`В CHANGELOG.md нет раздела «${UNRELEASED}»`);
const bodyStart = start + UNRELEASED.length;
const nextSection = changelog.indexOf('\n## ', bodyStart);
const notes = changelog.slice(bodyStart, nextSection === -1 ? undefined : nextSection).trim();
if (!notes) throw new Error('Раздел «Не выпущено» в CHANGELOG.md пуст — опишите, что исправлено или добавлено');
console.log(`\nЧто нового:\n${notes}\n`);

// ── 3. Версия во всех частях проекта ──
for (const rel of ['package.json', 'electron/package.json', 'client/package.json', 'server/package.json']) {
  write(rel, read(rel).replace(/"version":\s*"[^"]+"/, `"version": "${next}"`));
}
const gradle = read('android/app/build.gradle.kts');
const code = Number(gradle.match(/versionCode\s*=\s*(\d+)/)[1]) + 1;
write(
  'android/app/build.gradle.kts',
  gradle.replace(/versionCode\s*=\s*\d+/, `versionCode = ${code}`).replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${next}"`),
);
const date = new Date().toISOString().slice(0, 10);
write(
  'CHANGELOG.md',
  changelog.slice(0, start) + `${UNRELEASED}\n\n## [${next}] — ${date}\n\n${notes}\n` + (nextSection === -1 ? '' : changelog.slice(nextSection)),
);

// ── 4. Сборка ──
const exe = file(`electron/dist/Life Hub Setup ${next}.exe`);
const portable = file(`electron/dist/LifeHub-${next}-portable.exe`);
const apk = file('android/app/build/outputs/apk/release/app-release.apk');
if (!noBuild) {
  run('npm run electron:dist');
  // Полный путь: в некоторых окружениях cmd не ищет программы в текущей папке
  run(process.platform === 'win32' ? `"${file('android/gradlew.bat')}" assembleRelease -q` : './gradlew assembleRelease -q', file('android'));
}
const assets = [
  [exe, `Life-Hub-Setup-${next}.exe`, 'application/vnd.microsoft.portable-executable'],
  [portable, `LifeHub-${next}-portable.exe`, 'application/vnd.microsoft.portable-executable'],
  [apk, `LifeHub-${next}.apk`, 'application/vnd.android.package-archive'],
];
if (!dryRun) {
  for (const [p] of assets) if (!fs.existsSync(p)) throw new Error(`Нет файла сборки: ${p}`);
}

// ── 5. Коммит, тег, пуш ──
run('git add -A');
const msgFile = file('.git/RELEASE_MSG');
if (!dryRun) fs.writeFileSync(msgFile, `Релиз ${tag}\n\n${notes}\n`);
run(`git commit -F "${msgFile}"`);
run(`git tag -a ${tag} -m "Life Hub ${next}"`);
run('git push origin HEAD --follow-tags');

// ── 6. Релиз на GitHub ──
if (dryRun) {
  console.log(`[dry-run] создать релиз ${tag} и загрузить: ${assets.map((a) => a[1]).join(', ')}`);
  process.exit(0);
}
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = cred.match(/^password=(.+)$/m)?.[1]?.trim();
if (!token) throw new Error('Нет токена GitHub в git credential manager');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

const install =
  '\n\n---\n\n**Установка**\n' +
  `- Windows: \`Life-Hub-Setup-${next}.exe\` — установщик (ставится поверх, данные сохраняются), \`LifeHub-${next}-portable.exe\` — без установки\n` +
  `- Android: \`LifeHub-${next}.apk\` — установить поверх прошлой версии\n` +
  '\nПолный список изменений — [CHANGELOG.md](https://github.com/' + REPO + '/blob/main/CHANGELOG.md)';
const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ tag_name: tag, name: `Life Hub ${next}`, body: notes + install, draft: false, prerelease: false }),
});
const release = await res.json();
if (!res.ok) throw new Error(`GitHub: ${release.message}`);
for (const [p, name, type] of assets) {
  const up = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': type },
    body: fs.readFileSync(p),
  });
  console.log(`загружено: ${name} — ${up.ok ? 'ok' : (await up.json()).message}`);
}
console.log(`\nГотово: ${release.html_url}`);
