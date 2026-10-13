#!/usr/bin/env node
// scripts/sync-shared.js
// 微信云函数各自独立打包上传，不支持跨函数目录 require 共享代码。
// 本脚本在部署前把 cloudfunctions/_shared/ 下的公共模块（response.js/credit.js/points.js/storage.js/publicUser.js/notify.js/subscribe-templates.js）
// 分发复制到每个云函数目录下，作为唯一权威源（cloudfunctions/_shared/ 是源码，
// 各云函数目录下的同名文件是构建产物，请勿直接修改后者，改完 _shared 后重跑本脚本）。
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED_DIR = path.join(ROOT, 'cloudfunctions', '_shared');
const TARGET_FUNCTIONS = ['auth', 'user', 'toy', 'swap', 'review', 'membership', 'upload', 'points', 'notify'];
// notify.js / subscribe-templates.js：站内消息与订阅消息的统一入口，swap 与 notify 云函数都要用。
const SHARED_FILES = ['response.js', 'credit.js', 'points.js', 'storage.js', 'publicUser.js', 'notify.js', 'subscribe-templates.js'];

let copied = 0;
for (const fn of TARGET_FUNCTIONS) {
  const targetDir = path.join(ROOT, 'cloudfunctions', fn);
  if (!fs.existsSync(targetDir)) {
    console.warn(`[sync-shared] 跳过不存在的云函数目录: ${fn}`);
    continue;
  }
  for (const file of SHARED_FILES) {
    const src = path.join(SHARED_DIR, file);
    const dest = path.join(targetDir, file);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, dest);
    copied++;
    console.log(`[sync-shared] ${fn}/${file} 已同步`);
  }
}
console.log(`[sync-shared] 完成，共同步 ${copied} 个文件到 ${TARGET_FUNCTIONS.length} 个云函数目录。`);
