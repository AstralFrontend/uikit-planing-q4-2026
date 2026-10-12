// Перенос задач в браузере. Изменения сроков хранятся в localStorage поверх data/snapshot.json,
// а выгружается полный снимок с ними, чтобы заменить файл в репозитории.
const $ = s => document.querySelector(s);
const data = JSON.parse($('#data').textContent);
const {snapshot, cap} = data, q = snapshot.q, storageKey = `uikit-plan-overrides-${q}`;
const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const baseItems = new Map(Object.values(snapshot.scope).filter(Array.isArray).flat().map(x => [x.key, x]));
const iterations = cap.iterations;
const inIteration = (due, it) => due != null && it.start <= due && due <= it.end;
const ruDate = d => d ? d.split('-').reverse().join('.') : 'без срока';

let local = {};
try { local = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
const openGroups = new Map();
let dragKey = null, dialogKey = null;

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(local)); }
  catch { message('Не удалось сохранить в localStorage: изменения пропадут после перезагрузки.'); }
}
function message(text) { $('#message').hidden = false; $('#message').textContent = text; clearTimeout(message.timer); message.timer = setTimeout(() => { $('#message').hidden = true; }, 5000); }
// Тот же формат, что пишет scripts/extract-from-html.mjs.
const exportText = () => JSON.stringify(applyOverrides(snapshot, local), null, 1) + '\n';

function render() {
  for (const group of document.querySelectorAll('#tablePlan [data-group]')) openGroups.set(group.dataset.group, group.open);
  const parts = renderParts(applyOverrides(snapshot, local), cap, {today, changed: new Set(Object.keys(local)), openGroups});
  $('#totals').innerHTML = parts.totals;
  $('#overview').innerHTML = parts.overview;
  $('#tablePlan').innerHTML = parts.table;
  $('#warnings summary').textContent = `Предупреждения · ${parts.warnings.length}`;
  $('#warnings ul').innerHTML = parts.warnings.map(w => `<li>${esc(w)}</li>`).join('');
  const keys = Object.keys(local);
  $('#journalCount').textContent = keys.length;
  $('#entries').innerHTML = keys.length ? keys.map(k => `<div class="entry"><b>${esc(k)}</b><span>${esc(baseItems.get(k)?.summary || '')}</span><span>${esc(ruDate(baseItems.get(k)?.due))} → ${esc(ruDate(local[k].due))}</span><button type="button" data-undo="${esc(k)}">Отменить</button></div>`).join('') : '<p class="muted">Перетащите задачу за ⠿ в итерацию, плитку загрузки или «Без срока».</p>';
  $('#reset').disabled = !keys.length;
}

// Как в live-plan-board: срок ставится на конец итерации; перенос внутри той же итерации ничего не меняет.
function move(key, target) {
  const base = baseItems.get(key);
  if (!base || base.rejected) return;
  const current = key in local ? local[key].due : base.due;
  const it = iterations.find(i => i.id === target);
  if (target === NO_DUE ? current == null : it && inIteration(current, it)) return;
  if (target === NO_DUE ? base.due == null : inIteration(base.due, it)) delete local[key];
  else local[key] = {due: target === NO_DUE ? null : it.end};
  save(); render();
  message(`${key}: ${target === NO_DUE ? 'срок снят' : `перенесена в ${target}, срок ${ruDate(it.end)}`}`);
}

function chooseMove(key) {
  dialogKey = key;
  $('#moveKey').textContent = `${key} · ${baseItems.get(key)?.summary || ''}`;
  $('#moveTarget').innerHTML = iterations.map(it => `<option value="${esc(it.id)}">${esc(it.id)} · ${ruDate(it.start)} — ${ruDate(it.end)}</option>`).join('') + `<option value="${NO_DUE}">Без срока</option>`;
  $('#moveDialog').showModal();
}
$('#moveCancel').onclick = () => $('#moveDialog').close();
$('#moveForm').onsubmit = () => { const key = dialogKey, target = $('#moveTarget').value; setTimeout(() => move(key, target)); };

$('#export').onclick = () => {
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob([exportText()], {type: 'application/json'})), download: 'snapshot.json'});
  a.click(); URL.revokeObjectURL(a.href);
};
$('#copy').onclick = async () => {
  try { await navigator.clipboard.writeText(exportText()); message('JSON скопирован. Вставьте его в data/snapshot.json.'); }
  catch { message('Не удалось скопировать: используйте «Скачать snapshot.json».'); }
};
$('#reset').onclick = () => { if (confirm('Сбросить все локальные переносы?')) { local = {}; save(); render(); } };

document.addEventListener('click', e => {
  const undo = e.target.closest('[data-undo]');
  if (undo) { delete local[undo.dataset.undo]; save(); render(); return; }
  const handle = e.target.closest('[data-move]');
  if (handle) { chooseMove(handle.dataset.move); return; }
  const tile = e.target.closest('.iteration-tile');
  if (tile) { const g = document.querySelector(tile.getAttribute('href')); if (g) g.open = true; }
});
document.addEventListener('keydown', e => { if (e.code === 'KeyM' && e.target.closest('[data-key]')?.matches('tr[draggable=true]')) { e.preventDefault(); chooseMove(e.target.closest('[data-key]').dataset.key); } });

function clearDrag() { dragKey = null; document.querySelectorAll('.over,.dragging').forEach(el => el.classList.remove('over', 'dragging')); }
document.addEventListener('dragstart', e => {
  const row = e.target.closest?.('tr[draggable=true]');
  if (!row) return;
  dragKey = row.dataset.key; e.dataTransfer.setData('text/plain', dragKey); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging');
});
document.addEventListener('dragover', e => {
  const target = e.target.closest?.('[data-iteration]');
  if (!target || !dragKey) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.over').forEach(el => { if (el !== target) el.classList.remove('over'); });
  target.classList.add('over');
});
document.addEventListener('dragleave', e => { const target = e.target.closest?.('[data-iteration]'); if (target && !target.contains(e.relatedTarget)) target.classList.remove('over'); });
document.addEventListener('drop', e => {
  const target = e.target.closest?.('[data-iteration]'), key = dragKey;
  clearDrag();
  if (target && key) { e.preventDefault(); move(key, target.dataset.iteration); }
});
document.addEventListener('dragend', clearDrag);

const themeToggle = $('#themeToggle');
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  themeToggle.innerHTML = dark ? '☀ <span>Светлая тема</span>' : '☾ <span>Тёмная тема</span>';
  try { localStorage.setItem('planning-theme', dark ? 'dark' : 'light'); } catch {}
}
setTheme(document.documentElement.dataset.theme === 'dark');
themeToggle.onclick = () => setTheme(document.documentElement.dataset.theme !== 'dark');

render();
