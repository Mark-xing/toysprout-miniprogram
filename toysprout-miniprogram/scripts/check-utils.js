const { formatDate, joinMeta } = require('../miniprogram/utils/format');
const { cardRatio, distributeColumns, CARD_TEXT_H } = require('../miniprogram/utils/masonry');
let fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

// ---- formatDate：Date 对象不该退化成 "Wed Oct 08" ----
eq('Date -> yyyy-MM-dd', formatDate(new Date(2026, 9, 8, 9, 5)), '2026-10-08');
eq('Date + 时分', formatDate(new Date(2026, 9, 8, 9, 5), true), '2026-10-08 09:05');
eq('ISO 字符串', formatDate('2026-10-08T09:00:00.000Z'), '2026-10-08');
eq('空格分隔串', formatDate('2026-10-08 09:00:00'), '2026-10-08');
eq('时间戳', formatDate(new Date(2026, 0, 2).getTime()), '2026-01-02');
eq('空值 -> 空串', formatDate(null), '');
eq('undefined -> 空串', formatDate(undefined), '');
eq('乱码 -> 空串', formatDate('not-a-date'), '');
eq('String(Date) 反例被修复', formatDate(String(new Date(2026, 9, 8))) !== 'Wed Oct 08', true);

// ---- joinMeta：WXML 会把 null 渲染成字面量「null」，元信息行必须在 JS 侧滤空 ----
// 实测 bug：玩具详情页 city 为 null 时，`{{categoryLabel}} · {{city}} · 发布于 {{date}}`
// 渲染成了「积木拼搭 · null · 发布于 2026-10-10」。
eq('全有值', joinMeta(['积木拼搭', '深圳市', '发布于 2026-10-10']), '积木拼搭 · 深圳市 · 发布于 2026-10-10');
eq('中间 null 被滤掉，分隔符不悬空', joinMeta(['积木拼搭', null, '发布于 2026-10-10']), '积木拼搭 · 发布于 2026-10-10');
eq('undefined 被滤掉', joinMeta(['积木拼搭', undefined, '发布于 2026-10-10']), '积木拼搭 · 发布于 2026-10-10');
eq('空串被滤掉', joinMeta(['积木拼搭', '', '发布于 2026-10-10']), '积木拼搭 · 发布于 2026-10-10');
eq('纯空格被滤掉', joinMeta(['积木拼搭', '   ', 'x']), '积木拼搭 · x');
eq('数字 0 不被误滤（0 是有效值）', joinMeta(['a', 0, 'b']), 'a · 0 · b');
eq('信用分缺失只剩等级', joinMeta(['新芽', null]), '新芽');
eq('全部为空 -> 空串（而不是 "null"）', joinMeta([null, undefined, '']), '');
eq('空数组 -> 空串', joinMeta([]), '');
eq('undefined 入参不抛错', joinMeta(undefined), '');
eq('不会输出字面量 null', joinMeta(['a', null, 'b']).indexOf('null') < 0, true);
eq('自定义分隔符', joinMeta(['a', null, 'b'], ' / '), 'a / b');

// ---- masonry：确定性 + 分列平衡 ----
const ids = Array.from({ length: 20 }, (_, i) => 'toy-id-' + i);
eq('同一 id 两次比例一致', cardRatio('abc123'), cardRatio('abc123'));
const ratios = ids.map(cardRatio);
eq('比例档位落在 [0.8, 1.3]', ratios.every((r) => r >= 0.8 && r <= 1.3), true);
eq('比例确实多档（非恒定）', new Set(ratios).size >= 3, true);

const COL = 345;
const a = distributeColumns(ids.map((id) => ({ id })), COL);
eq('首屏 20 件左右各 10', a.left.length === 10 && a.right.length === 10, true);
const b = distributeColumns(ids.slice(0, 10).map((id) => ({ id })), COL);
const c = distributeColumns(ids.map((id) => ({ id })), COL);
eq('分列结果确定性（同入参同输出）', JSON.stringify(a) === JSON.stringify(c), true);
// 稳定性断言方向：前 10 件里原本落在左列的，追加后必须仍在左列（新件只会追加到列尾）。
const aLeftIds = new Set(a.left.map((t) => t.id));
const aRightIds = new Set(a.right.map((t) => t.id));
const movedL = b.left.filter((t) => !aLeftIds.has(t.id)).length;
const movedR = b.right.filter((t) => !aRightIds.has(t.id)).length;
eq('追加 10 件后 0 张卡片换列', movedL === 0 && movedR === 0, true);
eq('左列顺序保持前缀不变', a.left.slice(0, b.left.length).map((t) => t.id).join(',') === b.left.map((t) => t.id).join(','), true);

const hL = b.left.reduce((s, t) => s + COL * cardRatio(t.id) + CARD_TEXT_H, 0);
const hR = b.right.reduce((s, t) => s + COL * cardRatio(t.id) + CARD_TEXT_H, 0);
console.log('INFO  首屏列高 left=' + Math.round(hL) + ' right=' + Math.round(hR) + ' 差=' + Math.round(Math.abs(hL - hR)));
eq('首屏两列高度接近（差 < 1 张卡高）', Math.abs(hL - hR) < COL * 1.3 + CARD_TEXT_H, true);

console.log(fail === 0 ? '\n全部通过' : '\n失败 ' + fail + ' 条');
process.exit(fail ? 1 : 0);
