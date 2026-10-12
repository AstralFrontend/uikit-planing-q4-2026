const LOW = new Set(["Низкий", "Низший"]);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ddmm = s => s.slice(8, 10) + "." + s.slice(5, 7);
const TODAY = iso(new Date());
const parseLabel = l => { const m = /^Q([1-4])_(\d{4})$/.exec(l || ""); return m ? {q: +m[1], y: +m[2]} : null };
const mkLabel = (q, y) => `Q${q}_${y}`;
const shift = (l, n) => { const p = parseLabel(l); if (!p) return l; const i = p.y * 4 + p.q - 1 + n; return mkLabel(i % 4 + 1, Math.floor(i / 4)) };
// Квартал считается неделями с понедельника: старт — понедельник недели с 1-м числом квартала.
// Q1 — с первого понедельника января: последняя неделя года уходит на планирование в Q4.
const qStart = (q, y) => { const f = new Date(y, (q - 1) * 3, 1); return q === 1 ? addDays(f, (8 - f.getDay()) % 7) : addDays(f, -((f.getDay() + 6) % 7)) };
const qRange = l => {
  const {q, y} = parseLabel(l);
  const end = q === 4 ? new Date(y, 11, 31) : addDays(qStart(q + 1, y), -1);
  return {start: iso(qStart(q, y)), end: iso(end)};
};
const labelFor = day => { const d = parseIso(day); for (let y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) for (let q = 1; q <= 4; q++) { const r = qRange(mkLabel(q, y)); if (r.start <= day && day <= r.end) return mkLabel(q, y) } };

// Подпись итерации — только из фактов capacity-файла: праздники и отпуска.
function capInfo(it, cap) {
  if (!cap) return "";
  const hol = (cap.holidays || []).filter(h => it.start <= h && h <= it.end).map(h => `${ddmm(h)} праздник`);
  const vac = (cap.vacations || []).filter(v => v.start <= it.end && v.end >= it.start).map(v => {
    const s = v.start < it.start ? it.start : v.start, e = v.end > it.end ? it.end : v.end;
    return `${v.person} в отпуске ${s === e ? ddmm(s) : ddmm(s) + "–" + ddmm(e)}`;
  });
  return [...vac, ...hol].join(" · ");
}

const reserveLabel = l => `${l}_Резерв`;

function fallbackIterations(l) {
  const r = qRange(l), its = [];
  for (let s = parseIso(r.start), i = 1; iso(s) <= r.end; s = addDays(s, 14), i++) {
    const e = iso(addDays(s, 13)) < r.end ? iso(addDays(s, 13)) : r.end;
    its.push({id: "И" + i, start: iso(s), end: e, dates: `${ddmm(iso(s))}–${ddmm(e)}`, note: ""});
  }
  return its;
}

function build(label, cap, scope, withUnl) {
  const spd = cap?.sp_per_pd, res = cap?.reserve ?? 0.15;
  const its = (cap?.iterations || fallbackIterations(label)).map(it => {
    const c = spd != null && it.pd != null ? it.pd * spd : null;
    return {...it, dates: `${ddmm(it.start)}–${ddmm(it.end)}`, info: capInfo(it, cap),
            cap: c, ceil: c != null ? c * (1 - res) : null, items: [], resv: [], rsp: 0, sp: 0, core: 0, low: 0, done: 0, byPerson: {}};
  });
  const plan = cap?.planning, people = cap?.people || [];
  const outside = {before: [], after: [], planning: [], nodue: []}, rejected = [];
  const src = scope.labelled.filter(x => x.type !== "Epic").map(x => ({...x, labelled: true}))
    .concat(withUnl ? scope.unlabelled.filter(x => x.type !== "Epic").map(x => ({...x, labelled: false})) : []);
  const person = a => a ? people.find(p => a.includes(p)) || a : "не назначено";
  const put = (it, x) => {
    it.items.push(x);
    it.sp += x.sp; LOW.has(x.priority) ? it.low += x.sp : it.core += x.sp;
    if (x.done) it.done += x.sp;
    const p = person(x.assignee); it.byPerson[p] = (it.byPerson[p] || 0) + x.sp;
  };
  for (const x of src) {
    if (x.rejected) { rejected.push(x); continue }
    if (!x.due) { outside.nodue.push(x); continue }
    const it = its.find(it => it.start <= x.due && x.due <= it.end);
    if (it) put(it, x);
    else if (x.due < its[0].start) outside.before.push(x);
    else if (plan && plan.start <= x.due && x.due <= plan.end) outside.planning.push(x);
    else outside.after.push(x);
  }
  // Резерв раскладываем по сроку отдельно: в план и потолок он не входит.
  const reserve = scope.reserve.filter(x => !x.rejected && x.type !== "Epic").map(x => {
    const it = x.due ? its.find(it => it.start <= x.due && x.due <= it.end) : null;
    if (it) { it.resv.push(x); it.rsp += x.sp }
    return {...x, iter: it?.id || null};
  });
  const prOrd = {"Высокий": 0, "Средний": 1, "Низкий": 2, "Низший": 3};
  its.forEach(it => it.items.sort((a, b) => (prOrd[a.priority] ?? 9) - (prOrd[b.priority] ?? 9) || (a.parentName || "я").localeCompare(b.parentName || "я")));
  reserve.sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (prOrd[a.priority] ?? 9) - (prOrd[b.priority] ?? 9));
  return {its, outside, rejected, reserve, people, spd, res, plan};
}


export {qRange, shift, fallbackIterations, capInfo, build};
