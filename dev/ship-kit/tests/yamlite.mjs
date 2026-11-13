// yamlite — мини-парсер подмножества YAML для реестра ship-kit.
// Поддерживает: блочные mapping/sequence с отступами, flow-карты {k: v} и
// seq [a, b], строки в двойных кавычках, целые/true/false/null, комментарии
// (# в начале строки и хвостовые после пробела вне кавычек), свернутые
// блоки >- и литеральные |. Полный YAML не поддерживается — сознательно:
// формат реестра ведётся скиллом registry в этом же подмножестве.

const RE_KEY = /^([^:]+):(?:\s+(.*))?$/;

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q && line[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || line[i - 1] === ' ')) return line.slice(0, i);
  }
  return line;
}

function toLines(text) {
  return text.split('\n')
    .map((raw) => {
      const noComment = stripComment(raw);
      const content = noComment.replace(/\s+$/, '');
      if (!content.trim()) return null;
      const indent = content.length - content.replace(/^ +/, '').length;
      return { indent, content: content.slice(indent) };
    })
    .filter(Boolean);
}

function parseScalar(s) {
  const t = s.trim();
  if (t === '' ) return null;
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  if (t.startsWith('{') || t.startsWith('[')) return parseFlow(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  return t;
}

function splitFlow(inner, open, close) {
  // режет внутренность flow на элементы верхнего уровня
  const parts = [];
  let depth = 0, q = null, cur = '';
  for (const c of inner) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '{' || c === '[') { depth++; cur += c; continue; }
    if (c === '}' || c === ']') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseFlow(t) {
  if (t.startsWith('{')) {
    if (!t.endsWith('}')) throw new Error(`flow-map без закрывающей «}»: ${t.slice(0, 40)}`);
    const inner = t.slice(1, -1);
    const out = {};
    for (const p of splitFlow(inner)) {
      const m = p.match(/^([^:]+):(.*)$/);
      if (!m) throw new Error(`flow-map: не разобрать «${p.trim()}»`);
      out[parseScalar(m[1])] = parseScalar(m[2]);
    }
    return out;
  }
  if (!t.endsWith(']')) throw new Error(`flow-seq без закрывающей «]»: ${t.slice(0, 40)}`);
  const inner = t.slice(1, -1);
  return splitFlow(inner).map((p) => parseScalar(p));
}

function parseBlock(lines, start, indent) {
  // возвращает [value, nextIndex]
  const first = lines[start];
  if (first.content.startsWith('- ')) {
    const out = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent && lines[i].content.startsWith('- ')) {
      const itemRest = lines[i].content.slice(2);
      const t = itemRest.trim();
      if (t && (t.startsWith('{') || t.startsWith('[') || !RE_KEY.test(t))) {
        // скаляр или flow-элемент: children не бывает
        out.push(parseScalar(itemRest));
        i++;
        continue;
      }
      const sub = [];
      if (itemRest.trim()) sub.push({ indent: indent + 2, content: itemRest });
      let j = i + 1;
      while (j < lines.length && lines[j].indent > indent) sub.push(lines[j++]);
      const [v] = itemRest.trim() ? parseBlock(sub, 0, indent + 2) : [null, 0];
      out.push(v);
      i = j;
    }
    return [out, i];
  }
  // mapping
  const out = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i];
    if (line.content.startsWith('- ')) break;
    const m = line.content.match(RE_KEY);
    if (!m) throw new Error(`строка ${JSON.stringify(line.content)}: ожидалось «ключ: значение»`);
    const key = parseScalar(m[1]);
    const val = m[2] ? m[2].trim() : '';
    if (val === '>-' || val === '>' || val === '|' || val === '|-') {
      const fold = val.startsWith('>');
      const buf = [];
      let j = i + 1;
      while (j < lines.length && lines[j].indent > indent) buf.push(lines[j++].content.trim());
      out[key] = buf.join(fold ? ' ' : '\n').trim();
      i = j;
    } else if (val === '') {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const [v, ni] = parseBlock(lines, i + 1, lines[i + 1].indent);
        out[key] = v; i = ni;
      } else { out[key] = null; i++; }
    } else {
      out[key] = parseScalar(val); i++;
    }
  }
  return [out, i];
}

// элемент последовательности «- key: v» — виртуальная строка уже с нужным
// отступом, остальные строки блока следом: пропускаем через общий parseBlock
function padVirtual(sub) { return sub; }

export function parse(text) {
  const lines = toLines(text);
  if (!lines.length) return {};
  const [v] = parseBlock(lines, 0, lines[0].indent);
  return v;
}
