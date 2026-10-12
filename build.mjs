// Собирает dist/index.html из снимка Jira, ёмкости и ручных правок плана.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {renderPage} from './src/render.mjs';

const read = async (path, json = true) => { const text = await readFile(new URL(path, import.meta.url), 'utf8'); return json ? JSON.parse(text) : text; };
const [snapshot, cap, overrides, css] = await Promise.all([read('data/snapshot.json'), read('data/capacity.json'), read('data/overrides.json'), read('src/style.css', false)]);

// Правки применяются поверх снимка: перенос в итерацию задаётся сроком, null убирает срок.
for (const list of Object.values(snapshot.scope)) if (Array.isArray(list)) for (const x of list) Object.assign(x, overrides[x.key]);

const now = new Date();
const today = process.env.TODAY || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
await mkdir(new URL('dist/', import.meta.url), {recursive: true});
await writeFile(new URL('dist/index.html', import.meta.url), renderPage(snapshot, cap, {today, css}));
console.log('dist/index.html собран, сегодня', today);
