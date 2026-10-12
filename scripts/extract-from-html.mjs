// Восстанавливает снимок доски из страницы live-plan-board, сохранённой браузером.
// node scripts/extract-from-html.mjs "<сохранённая страница>.html" > data/snapshot.json
import {readFile} from 'node:fs/promises';

const [file] = process.argv.slice(2);
if (!file) { console.error('Укажите путь к сохранённой HTML-странице'); process.exit(1); }
const html = await readFile(file, 'utf8');
const cap = JSON.parse(await readFile(new URL('../data/capacity.json', import.meta.url), 'utf8'));
const q = cap.label, project = cap.project || 'UIKIT';

const unesc = s => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const pick = (re, s) => { const m = re.exec(s); return m ? unesc(m[1]) : null; };
const all = (re, s) => [...s.matchAll(re)].map(m => unesc(m[1]));
const rels = {'Блокирует': 'blocks', 'Заблокирована задачей': 'is blocked by', 'Связана с': 'relates to', 'Дублирует': 'duplicates', 'Дублируется задачей': 'is duplicated by', 'Клонирует': 'clones', 'Клонируется задачей': 'is cloned by'};
const isoFromRu = s => s.split('.').reverse().join('-');

const base = pick(/href="([^"]+)\/browse\//, html);
const loaded = pick(/<small id="loaded">Обновлено ([^<]+)<\/small>/, html);
const products = [...html.matchAll(/<option value="([^"]+)">([^<]+?) \(([^)]+)\)<\/option>/g)].map(m => ({id: m[1], name: unesc(m[2]), projects: m[3].split(', ')}));

const iterations = new Map(cap.iterations.map(it => [it.id, it]));
const groups = html.split('<details class="table-group').slice(1);
const scope = {project, labelled: [], reserve: [], unlabelled: []};

for (const group of groups) {
  const id = /data-group="([^"]+)"/.exec(group)[1];
  const iteration = id.startsWith('iteration:') ? iterations.get(id.slice(10)) : null;
  for (const [, row] of group.matchAll(/<tr draggable="[^"]*" data-key="[^"]+"([\s\S]*?)<\/tr>/g)) {
    const [, task, parent, linksCell, status, priority, assignee, sp] = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>(?=<td|$)/g)].map(m => m[1]);
    const key = pick(/<a [^>]*>([^<]+)<\/a>/, task);
    const flags = all(/<span class="tag[^"]*">([^<]+)<\/span>/g, task);
    const meta = /<div class="task-meta">([\s\S]*?)<\/div>/.exec(task)[1];
    const dueText = pick(/<small>Срок: ([^<]+)<\/small>/, task);
    const statusClass = /status-badge (status-[a-z-]+)/.exec(status)[1];
    const parentKey = pick(/<a [^>]*>([^<]+)<\/a>/, parent);
    const external = [...linksCell.matchAll(/<div class="product-link">([\s\S]*?<\/span>)<\/div>/g)].map(([, l]) => ({
      key: pick(/<a [^>]*>([^<]+)<\/a>/, l), rel: rels[pick(/relation-label">([^<]+)</, l)] || pick(/relation-label">([^<]+)</, l),
      summary: pick(/linked-summary">([^<]*)</, l), status: pick(/status-badge [^"]+">([^<]*)</, l),
      done: /status-badge status-done/.test(l), projectName: pick(/<strong>([^<]+)<\/strong>/, l)
    }));
    const internal = [...linksCell.matchAll(/<div class="product-link internal-link">([\s\S]*?)<\/div>/g)].map(([, l]) => ({
      key: pick(/<a [^>]*>([^<]+)<\/a>/, l), rel: rels[pick(/relation-label">([^<]+)</, l)] || pick(/relation-label">([^<]+)</, l),
      summary: pick(/linked-summary">([^<]*)</, l), internal: true
    }));
    const links = [...external, ...internal].map(l => ({...l, project: l.key.split('-')[0]}));
    const spText = unesc(sp).trim();
    const x = {
      key, summary: pick(/<button class="task-title"[^>]*>([\s\S]*?)<\/button>/, task),
      type: pick(/^<span>([^<]*)<\/span>/, meta) || null,
      status: unesc(status), rejected: id === 'outside:Отказы', done: statusClass === 'status-done',
      priority: unesc(priority) === '—' ? null : unesc(priority),
      sp: spText === '—' ? 0 : Number(spText.replace(',', '.')), hasSp: spText !== '—',
      parentKey, parentName: parentKey ? pick(/<span>([^<]*)<\/span>/, parent) : (unesc(parent) === '—' ? null : unesc(parent)),
      labels: [...(flags.includes('Резерв') ? [q + '_Резерв'] : flags.includes('Без метки') ? [] : [q]), ...all(/<span class="task-label">([^<]+)<\/span>/g, meta)],
      assignee: unesc(assignee) === 'Не назначено' ? null : unesc(assignee),
      due: iteration ? iteration.end : dueText && dueText !== 'не задан' ? isoFromRu(dueText) : null,
      blocked: flags.includes('Блокировка'),
      linkCount: Number(pick(/links-detail[^>]*>[^<]*· (\d+)</, linksCell) || 0),
      links
    };
    scope[x.labels.includes(q) ? 'labelled' : x.labels.includes(q + '_Резерв') ? 'reserve' : 'unlabelled'].push(x);
  }
}

process.stdout.write(JSON.stringify({q, base, loaded, products, scope}, null, 1) + '\n');
