// Собирает dist/index.html из снимка Jira, ёмкости и ручных правок плана.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {renderPage} from './src/render.mjs';

const read = async (path, json = true) => { const text = await readFile(new URL(path, import.meta.url), 'utf8'); return json ? JSON.parse(text) : text; };
const [snapshot, cap, overrides, css, domain, render, client] = await Promise.all([
  read('data/snapshot.json'), read('data/capacity.json'), read('data/overrides.json'), read('src/style.css', false),
  read('src/domain.mjs', false), read('src/render.mjs', false), read('src/client.js', false)
]);

// Браузеру нужны те же модули: заворачиваем каждый в свою область видимости вместо бандлера.
const module = (source, names) => `(()=>{${source.replace(/^import .*$/gm, '').replace(/^export \{.*$/gm, '').replace(/^export /gm, '')}\nreturn {${names}};})()`;
const clientScript = `(()=>{const {build}=${module(domain, 'build')};
const {applyOverrides,renderParts,NO_DUE,esc}=${module(render, 'applyOverrides,renderParts,NO_DUE,esc')};
${client}})();`.replace(/<\/script/gi, '<\\/script');

const now = new Date();
const today = process.env.TODAY || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
await mkdir(new URL('dist/', import.meta.url), {recursive: true});
await writeFile(new URL('dist/index.html', import.meta.url), renderPage(snapshot, cap, overrides, {today, css, clientScript}));
console.log('dist/index.html собран, сегодня', today);
