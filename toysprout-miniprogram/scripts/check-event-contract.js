#!/usr/bin/env node
// scripts/check-event-contract.js
// 【跨文件事件契约检查】自定义组件对外事件名 ↔ 页面 bind: 绑定的一致性。
//
// 为什么需要它（2026-10-10 真实事故）：toy-card 组件 triggerEvent('tap', {id})，
// 发现页写 <toy-card bind:tap="onToyTap">。`tap` 是原生事件名 —— 组件内部的原生 tap
// 会冒泡出组件边界，直接命中组件标签上的 bind:tap，页面拿到的是原生事件的
// detail = {x,y}（触点坐标）而不是 {id}，于是拼出 ?id=undefined，详情页报「玩具不存在」。
//
// 这个 bug 有两个特性让它极易漏过：
//   1) 两侧代码各自看都没毛病 —— 组件发 tap、页面收 tap，名字对得上；
//   2) 组件的离线单测全绿（因为断言的正是组件自己发的事件名）。
// 所以必须有一个**跨文件**的检查：不仅看两处名字是否一致，更要看名字是不是原生事件名。
//
// 本脚本做三件事：
//   A. 从组件 JS 解析出它真正 triggerEvent 的事件名集合（支持 `triggerEvent('open')` 与 `triggerEvent(EVT_OPEN)` 两种写法）；
//   B. 扫描所有 WXML，找出挂在该组件标签上的 bind:/catch: 事件名；
//   C. 断言：绑定的名字 ∈ 组件真正会发的集合，且 ∉ 小程序原生事件名黑名单。
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// MP_ROOT 覆盖用于「反向对照」：把改坏的副本放进去，确认本脚本真的会 FAIL。
// 抓不到 bug 的检查等于没写，所以每次改动检查逻辑都该跑一遍对照。
const MP = process.env.MP_ROOT ? path.resolve(process.env.MP_ROOT) : path.join(ROOT, 'miniprogram');
const rel = (p) => path.relative(process.env.MP_ROOT ? path.dirname(MP) : ROOT, p);

// 小程序内置事件名：自定义组件**绝对不能**用这些名字对外发事件。
// 一旦重名，组件内部的原生事件会冒泡出组件边界命中父级的 bind:<name>，
// 父级收到的是原生事件的 detail（如 tap 的 {x,y}），而不是你 triggerEvent 传的 detail。
const RESERVED = new Set([
  // 触摸类
  'touchstart', 'touchmove', 'touchcancel', 'touchend', 'tap', 'longpress', 'longtap',
  // 动画 / 过渡
  'transitionend', 'animationstart', 'animationiteration', 'animationend',
  // 表单类
  'submit', 'reset', 'input', 'focus', 'blur', 'change', 'confirm', 'linechange',
  // 其它内置
  'load', 'error', 'scroll', 'scrolltolower', 'scrolltoupper', 'columnchange',
  'getuserinfo', 'getphonenumber', 'opensetting', 'contact', 'chooseavatar',
]);

// 要检查的组件：JS 定义路径 + 在 WXML 里出现的标签名
const COMPONENTS = [
  { tag: 'toy-card', js: 'components/toy-card/toy-card.js' },
];

// 递归收集所有 wxml
function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (d.name.endsWith('.wxml')) out.push(p);
  });
  return out;
}

// 从组件 JS 里解析「对外事件名」
function parseTriggeredEvents(jsPath) {
  const src = fs.readFileSync(jsPath, 'utf8');
  // 先把 `const EVT_OPEN = 'open';` 这类常量表建起来
  const constMap = {};
  let m;
  const constRe = /const\s+(EVT_[A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g;
  while ((m = constRe.exec(src))) constMap[m[1]] = m[2];

  const names = new Set();
  const unresolved = [];
  const callRe = /triggerEvent\(\s*(\w+)/g;
  while ((m = callRe.exec(src))) {
    const arg = m[1];
    if (arg.startsWith('EVT_')) {
      if (constMap[arg]) names.add(constMap[arg]);
      else unresolved.push(arg);
    } else if (/^[A-Za-z_$][\w$]*$/.test(arg) && !constMap[arg]) {
      // 变量形式（本组件没有，但如实报告，避免静默漏检）
      unresolved.push(arg);
    }
  }
  return { names, constMap, unresolved, src };
}

// 从 wxml 里找出挂在指定组件标签上的 bind:/catch: 事件名
function parseBoundEvents(wxmlPath, tag) {
  const raw = fs.readFileSync(wxmlPath, 'utf8');
  const markup = raw.replace(/<!--[\s\S]*?-->/g, ' '); // 剥注释，避免注释里的示例被误判
  const bound = [];
  const tagRe = new RegExp('<' + tag + '\\b([\\s\\S]*?)/?>', 'g');
  let m;
  while ((m = tagRe.exec(markup))) {
    const attrs = m[1];
    // 同时支持 bind:open="x" 与 bindopen="x"（以及 catch: / catch）
    const attrRe = /\b(bind|catch):?([A-Za-z][\w-]*)\s*=/g;
    let a;
    while ((a = attrRe.exec(attrs))) bound.push({ name: a[2], raw: a[1] + ':' + a[2] });
  }
  return bound;
}

let PASS = 0, FAIL = 0;
function check(desc, cond, extra) {
  if (cond) { PASS++; console.log('  PASS:', desc); }
  else { FAIL++; console.log('  FAIL:', desc, extra !== undefined ? '=> ' + JSON.stringify(extra) : ''); }
}

console.log('===== 跨文件事件契约检查 =====\n');

const wxmlFiles = walk(MP, []);

COMPONENTS.forEach(({ tag, js }) => {
  console.log('--- 组件 <' + tag + '> ---');
  const jsPath = path.join(MP, js);
  const { names, constMap, unresolved } = parseTriggeredEvents(jsPath);

  console.log('  声明的事件名:', [...names].map((n) => '`' + n + '`').join(', ') || '(无)', '| 常量表:', JSON.stringify(constMap));
  check('能解析出组件对外事件名', names.size > 0, [...names]);
  check('triggerEvent 的参数全部可静态解析（无变量名漏检）', unresolved.length === 0, unresolved);

  // 核心断言：事件名不得命中原生事件名黑名单
  const reserved = [...names].filter((n) => RESERVED.has(n));
  check('组件对外事件名均未与小程序原生事件名撞名', reserved.length === 0, reserved);
  if (reserved.length) {
    console.log('    ↳ 后果：组件内部的原生 ' + reserved.join('/') + ' 会冒泡出组件边界命中父级 bind:' +
      reserved.join('/') + '，父级收到的是原生 detail（如 {x,y}）而不是你传的 detail。');
  }

  // 扫描所有页面/组件对该标签的绑定
  let totalBound = 0;
  const unknown = [];
  const reservedBound = [];
  const usedFiles = new Set();
  wxmlFiles.forEach((f) => {
    const bound = parseBoundEvents(f, tag);
    if (!bound.length) return;
    usedFiles.add(rel(f));
    bound.forEach((b) => {
      totalBound++;
      if (RESERVED.has(b.name)) reservedBound.push({ file: rel(f), evt: b.raw });
      if (!names.has(b.name)) unknown.push({ file: rel(f), evt: b.raw });
    });
  });

  console.log('  使用该组件的文件:', [...usedFiles].join(', ') || '(无)');
  check('有文件在使用该组件', usedFiles.size > 0, [...usedFiles]);
  check('存在对该组件的事件绑定（否则契约无从校验）', totalBound > 0, totalBound);
  check('所有 bind: 的名字都是组件真正会 triggerEvent 的', unknown.length === 0, unknown);
  check('页面侧未使用原生事件名绑定该组件', reservedBound.length === 0, reservedBound);
  console.log();
});

console.log('========================================');
console.log(`结果: PASS=${PASS} FAIL=${FAIL}`);
console.log('========================================');
process.exit(FAIL ? 1 : 0);
