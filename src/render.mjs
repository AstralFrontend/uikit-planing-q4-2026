// Статичная версия таблицы live-plan-board (public/table.mjs и public/app.mjs) без переноса задач.
import {build} from './domain.mjs';

const NOT_READY = new Set(['Согласование', 'Бэклог', 'Анализ', 'Дизайн', 'Груминг']);
const LOW = new Set(['Низкий', 'Низший']);
const QUARTER_LABEL = /^Q[1-4]_\d{4}(_Резерв)?$/;
const rels = {'blocks': 'Блокирует', 'is blocked by': 'Заблокирована задачей', 'relates to': 'Связана с', 'duplicates': 'Дублирует', 'is duplicated by': 'Дублируется задачей', 'clones': 'Клонирует', 'is cloned by': 'Клонируется задачей'};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = n => n == null ? '—' : n.toLocaleString('ru-RU', {maximumFractionDigits: 1});
const sum = xs => xs.reduce((n, x) => n + x.sp, 0);
const rel = l => rels[l.rel] || l.rel;
const blocked = x => !x.done && x.blocked;
const iterationAnchor = it => 'iteration-' + it.id.replace(/\D/g, '');

export function renderPage(snapshot, cap, {today, css}) {
  const {q, base, scope} = snapshot;
  const P = build(q, cap, scope, false);
  const link = k => `<a target="_blank" rel="noopener" href="${esc(base)}/browse/${encodeURIComponent(k)}">${esc(k)}</a>`;
  const allItems = [...scope.labelled, ...scope.reserve, ...scope.unlabelled];
  const eligibleInternalKeys = new Set([...scope.labelled, ...scope.reserve].map(x => x.key));

  const status = x => `<span class="status-badge ${x.done ? 'status-done' : NOT_READY.has(x.status) ? 'status-not-ready' : x.rejected ? 'status-rejected' : 'status-active'}">${esc(x.status || 'Статус недоступен')}</span>`;
  const scale = Math.max(1, ...P.its.map(it => Math.max(it.cap || 0, it.sp + it.rsp)));
  let meterIndex = 0;
  const meter = it => {
    const patternId = `low-priority-${++meterIndex}`;
    const core = sum(it.items.filter(x => !x.done && !LOW.has(x.priority))), low = sum(it.items.filter(x => !x.done && LOW.has(x.priority)));
    const w = n => Math.max(0, n) / scale * 100;
    const segment = (cls, start, value) => `<rect class="${cls}" ${cls === 'load-low' ? `fill="url(#${patternId})"` : ''} x="${w(start)}%" y="5" width="${w(value)}%" height="12"/>`;
    return `<svg class="load-meter" width="100%" height="24" role="img" aria-label="${esc(it.id)}: закрыто ${fmt(it.done)}, основной незакрытый план ${fmt(core)}, низкий незакрытый ${fmt(low)}, резерв ${fmt(it.rsp)}, потолок ${fmt(it.ceil)}, ёмкость ${fmt(it.cap)} SP"><defs><pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" stroke-width="2"/></pattern></defs>${it.cap != null ? `<rect class="load-cap" width="${w(it.cap)}%" height="22" rx="3"/>` : ''}${segment('load-done', 0, it.done)}${segment('load-core', it.done, core)}${segment('load-low', it.done + core, low)}${it.rsp ? segment('load-reserve', it.sp, it.rsp) : ''}${it.ceil != null ? `<line class="load-ceiling" x1="${w(it.ceil)}%" x2="${w(it.ceil)}%" y1="0" y2="24"/>` : ''}</svg>`;
  };
  const legend = '<div class="load-legend"><span><i class="load-done"></i>Закрыто</span><span><i class="load-core"></i>Основной план · открыт</span><span><i class="load-low"></i>Низкий · открыт</span><span><i class="load-reserve"></i>Резерв · вне плана</span><span><i class="load-cap"></i>Ёмкость</span><span><i class="load-ceiling"></i>Потолок</span></div>';
  const metric = (label, value, cls = '') => `<span class="iteration-metric ${cls}"><span>${label}</span><b>${fmt(value)} <small>SP</small></b></span>`;
  const metrics = it => {
    const left = it.ceil == null ? null : it.ceil - it.sp;
    return `<span class="iteration-metrics">${metric('План', it.sp, it.ceil != null && it.sp > it.ceil + .05 ? 'bad' : '')}${metric('Ёмкость', it.cap)}${metric('Потолок', it.ceil)}${metric('Закрыто', it.done, 'completed-metric')}${metric('Низкий', it.low)}${metric('Можно снять', sum(it.items.filter(x => LOW.has(x.priority) && !x.done)))}${metric(left != null && left < 0 ? 'Перебор' : 'Запас', left != null && left < 0 ? -left : left, left != null && left < 0 ? 'bad' : '')}${metric('Резерв', it.rsp)}</span>`;
  };
  const capacity = it => `<details class="iteration-capacity"><summary>Ёмкость и люди · ${fmt(it.wd)} раб. дней · ${fmt(it.pd)} чел.-дней</summary><div class="capacity-content"><div class="capacity-people">${[...new Set([...Object.keys(it.per_person || {}), ...Object.keys(it.byPerson)])].map(p => {
    const ceiling = it.per_person?.[p] != null && P.spd != null ? it.per_person[p] * P.spd * (1 - P.res) : null, value = it.byPerson[p] || 0;
    return `<span class="${ceiling != null && value > ceiling + .05 ? 'bad' : ''}">${esc(p)} <b>${fmt(value)} / ${fmt(ceiling)} SP</b></span>`;
  }).join('') || '<span class="muted">Нет данных по людям</span>'}</div><div class="iteration-metrics">${metric('Под внеплан', it.cap == null ? null : it.cap - it.ceil)}${metric('Место без внеплана', it.cap == null ? null : it.cap - it.sp)}${metric('После резерва', it.cap == null ? null : it.cap - it.sp - it.rsp, it.cap != null && it.cap - it.sp - it.rsp < -.05 ? 'bad' : '')}</div></div></details>`;
  const linksCell = x => {
    const external = x.links.filter(l => l.project !== scope.project);
    const internal = x.links.filter(l => l.project === scope.project && eligibleInternalKeys.has(l.key));
    return external.map(l => `<div class="product-link"><strong>${esc(l.projectName || l.project)}</strong><div><span class="relation-label">${esc(rel(l))}</span> ${link(l.key)}</div>${l.summary ? `<span class="linked-summary">${esc(l.summary)}</span>` : ''}${status(l)}</div>`).join('')
      + internal.map(l => `<div class="product-link internal-link"><strong>${link(l.key)}</strong><span class="linked-summary">${esc(l.summary || 'Название недоступно')}</span><span class="relation-label">${esc(rel(l))}</span></div>`).join('')
      + `<span class="links-detail">${x.linkCount ? 'Всего связей · ' + x.linkCount : 'Нет связей'}</span>`;
  };
  const row = (x, outside) => {
    const reserve = x.labels.includes(q + '_Резерв') && !x.labels.includes(q);
    const flags = [reserve ? 'Резерв' : null, !reserve && !x.labels.includes(q) ? 'Без метки' : null, blocked(x) ? 'Блокировка' : null, !x.done && x.due && x.due < today ? 'Просрочена' : null, !x.hasSp ? 'Нет SP' : null].filter(Boolean);
    const labels = x.labels.filter(l => !QUARTER_LABEL.test(l));
    return `<tr class="task-row ${reserve ? 'reserve-row' : ''} ${x.done ? 'task-done' : ''}"><td class="task-cell"><div class="task-heading">${link(x.key)}${flags.map(f => `<span class="tag ${['Блокировка', 'Просрочена', 'Нет SP'].includes(f) ? 'warn' : ''}">${esc(f)}</span>`).join('')}</div><span class="task-title">${esc(x.summary)}</span><div class="task-meta"><span>${esc(x.type || '')}</span>${labels.map(l => `<span class="task-label">${esc(l)}</span>`).join('')}</div>${outside ? `<small>Срок: ${esc(x.due ? x.due.split('-').reverse().join('.') : 'не задан')}</small>` : ''}</td><td class="epic-cell">${x.parentKey ? `${link(x.parentKey)}<span>${esc(x.parentName || 'Название недоступно')}</span>` : esc(x.parentName || '—')}</td><td class="product-cell">${linksCell(x)}</td><td>${status(x)}</td><td><span class="priority-badge ${['Высокий', 'Высший', 'Критический'].includes(x.priority) ? 'priority-high' : x.priority === 'Средний' ? 'priority-medium' : 'priority-low'}">${esc(x.priority || '—')}</span></td><td>${esc(x.assignee || 'Не назначено')}</td><td class="numeric">${x.hasSp ? fmt(x.sp) : '—'}</td></tr>`;
  };
  const group = (title, items, it = null) => {
    const current = it && it.start <= today && today <= it.end;
    return `<details class="table-group ${current ? 'current-iteration' : ''}" ${it ? `id="${iterationAnchor(it)}"` : ''} ${it ? 'open' : ''}><summary><span class="iteration-title"><strong>${esc(title)}${current ? ' · сейчас' : ''}</strong><span>Задач: ${items.length}</span>${it?.info ? `<small class="warn">${esc(it.info)}</small>` : ''}</span>${it ? `<span class="iteration-summary-load"><span class="iteration-load-value ${it.ceil != null && it.sp > it.ceil + .05 ? 'bad' : ''}">${fmt(it.sp)} / ${fmt(it.ceil)} SP <small>Весь UIKIT${it.ceil > 0 ? ' · ' + fmt(it.sp / it.ceil * 100) + '% потолка' : ''}</small></span>${meter(it)}</span>${metrics(it)}` : ''}</summary>${it ? capacity(it) : ''}<div class="table-scroll"><table><caption class="sr-only">${esc(title)}</caption><colgroup><col class="task-col"><col class="epic-col"><col class="product-col"><col class="status-col"><col class="priority-col"><col class="person-col"><col class="sp-col"></colgroup><thead><tr>${['Задача', 'Родительская задача', 'Продукты и связи', 'Статус', 'Приоритет', 'Исполнитель', 'SP'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${items.map(x => row(x, !it)).join('') || '<tr><td colspan="7" class="empty">Нет задач</td></tr>'}</tbody></table></div></details>`;
  };

  const known = P.its.every(it => it.ceil != null), plan = P.its.reduce((s, i) => s + i.sp, 0), ceiling = known ? P.its.reduce((s, i) => s + i.ceil, 0) : null;
  const totals = [['План', plan], ['Потолок', ceiling], ['Закрыто', P.its.reduce((s, i) => s + i.done, 0)], ['Запас', ceiling == null ? null : ceiling - plan]].map(([t, n]) => `<div><span>${t}</span><b class="${n < 0 ? 'bad' : ''}">${fmt(n)} <small>SP</small></b></div>`).join('');
  const reserveOutside = P.reserve.filter(x => !x.iter);
  const groups = [
    ['Без срока', P.outside.nodue.concat(reserveOutside.filter(x => !x.due))],
    ['До квартала', P.outside.before.concat(reserveOutside.filter(x => x.due && x.due < P.its[0].start))],
    ['После квартала / вне сетки', P.outside.after.concat(reserveOutside.filter(x => x.due && !P.its.some(it => it.start <= x.due && x.due <= it.end) && x.due >= P.its[0].start && !(P.plan && P.plan.start <= x.due && x.due <= P.plan.end)))],
    ['Период планирования', P.outside.planning.concat(reserveOutside.filter(x => P.plan && P.plan.start <= x.due && x.due <= P.plan.end))],
    ['Без метки · не учтены', scope.unlabelled.filter(x => x.type !== 'Epic' && !x.rejected)],
    ['Отказы', allItems.filter(x => x.rejected && x.type !== 'Epic')]
  ];
  const overview = '<div class="overview-label">Загрузка итераций <span>Весь UIKIT · единая шкала SP</span></div><div class="iteration-overview">' + P.its.map(it => `<a class="iteration-tile ${it.ceil != null && it.sp > it.ceil + .05 ? 'overloaded' : ''}" href="#${iterationAnchor(it)}"><strong>${esc(it.id)} <small>${esc(it.dates)}</small></strong><b>${fmt(it.sp)} <span>/ ${fmt(it.ceil)} SP</span></b>${meter(it)}<small>${it.ceil == null ? 'Ёмкость неизвестна' : it.sp > it.ceil ? 'Перебор ' + fmt(it.sp - it.ceil) + ' SP' : 'Запас ' + fmt(it.ceil - it.sp) + ' SP'}</small><small>Закрыто ${fmt(it.done)} · резерв ${fmt(it.rsp)} SP</small></a>`).join('') + '</div>' + legend;
  const table = P.its.map(it => group(it.id + ' · ' + it.dates, it.items.concat(it.resv), it)).join('') + '<h2>Вне итераций</h2>' + groups.map(([name, xs]) => group(name, xs)).join('');
  const warnings = warningList(P, allItems, scope, q, today);

  return `<!doctype html>
<html lang="ru" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UIKIT · Планирование ${esc(q.replace('_', ' '))}</title>
<script>try{if(localStorage.getItem('planning-theme')==='dark')document.documentElement.dataset.theme='dark'}catch{}</script>
<style>${css}</style></head><body>
<header><div class="brand"><span class="logo">▦</span> UI Kit <span class="muted">/ Планирование</span></div><nav aria-label="Квартал"><strong id="quarter">${esc(q.replace('_', ' '))}</strong></nav><div class="connection"><span>Статичный снимок</span><small>Данные Jira на ${esc(snapshot.loaded || '—')}</small></div><button id="themeToggle" type="button" aria-label="Включить тёмную тему" aria-pressed="false">☾ <span>Тёмная тема</span></button></header>
<main><section class="intro"><div><div class="eyebrow">ПЛАН ПО СРОКАМ ЗАДАЧ</div><h1>План квартала</h1><p id="subtitle">${esc(cap?.title || 'Двухнедельная сетка · ёмкость неизвестна')}</p></div><div id="totals" class="totals">${totals}</div></section>
<details id="warnings"><summary>Предупреждения · ${warnings.length}</summary><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>
<section id="overview" aria-label="Загрузка итераций">${overview}</section><div class="workspace"><section id="tablePlan" aria-label="План в таблице">${table}</section></div>
</main>
<script>
const t=document.getElementById('themeToggle');
function setTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';t.setAttribute('aria-pressed',String(dark));t.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему');t.innerHTML=dark?'☀ <span>Светлая тема</span>':'☾ <span>Тёмная тема</span>';try{localStorage.setItem('planning-theme',dark?'dark':'light')}catch{}}
setTheme(document.documentElement.dataset.theme==='dark');t.onclick=()=>setTheme(document.documentElement.dataset.theme!=='dark');
for(const a of document.querySelectorAll('.iteration-tile'))a.addEventListener('click',()=>{const g=document.querySelector(a.getAttribute('href'));if(g)g.open=true});
</script>
</body></html>
`;
}

function warningList(P, allItems, scope, q, today) {
  const low = x => LOW.has(x.priority), out = [];
  for (const it of P.its) {
    if (it.ceil != null && it.sp > it.ceil + .05) out.push(`${it.id}: превышение потолка на ${fmt(it.sp - it.ceil)} SP`);
    if (it.end >= today && it.items.length && !it.items.some(x => low(x) && !x.done)) out.push(`${it.id}: нет незакрытых задач низкого приоритета — снимать нечего`);
    for (const [person, days] of Object.entries(it.per_person || {})) { const ceiling = days * P.spd * (1 - P.res); if ((it.byPerson[person] || 0) > ceiling + .05) out.push(`${it.id}: ${person} — ${fmt(it.byPerson[person])} / ${fmt(ceiling)} SP, превышен личный потолок`); }
    if (it.cap != null && it.sp + it.rsp > it.cap + .05) out.push(`${it.id}: резерв не помещается даже без внеплана`);
  }
  const current = P.its.findIndex(it => it.start <= today && today <= it.end);
  for (const x of allItems.filter(x => x.type !== 'Epic' && !x.rejected && (x.labels.includes(q) || x.labels.includes(q + '_Резерв')))) {
    if (!x.hasSp) out.push(`${x.key}: нет оценки SP`); if (!x.due) out.push(`${x.key}: без срока`);
    if (!x.done && x.due && x.due < today) out.push(`${x.key}: просрочена`); if (blocked(x)) out.push(`${x.key}: открытая блокирующая задача`);
    const index = P.its.findIndex(it => it.start <= x.due && x.due <= it.end); if (x.due && index < 0) out.push(`${x.key}: срок вне итераций (${x.due})`);
    if (!x.done && current >= 0 && index >= 0 && index <= current + 1 && NOT_READY.has(x.status)) out.push(`${x.key}: не готова к разработке при близком сроке`);
  }
  if (scope.unlabelled.length) out.push(`Без метки: ${scope.unlabelled.length} задач не включены в расчёт`);
  return out;
}
