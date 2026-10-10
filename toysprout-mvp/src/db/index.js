// src/db/index.js
// 数据库连接初始化：加载 better-sqlite3、执行 schema.sql 建表、
// 首次启动（users 表为空）时自动跑种子数据。
//
// 架构决策记录（简版 ADR，详见 SendMessage 汇报 / docs/decisions）：
// - 选择 better-sqlite3 而非 sqlite3 / sequelize+sqlite：
//   MVP 场景下同步 API 心智负担最低（无需 async/await 包裹每个查询），
//   事务用 db.transaction() 原生支持，无 ORM 抽象泄漏问题，
//   性能对单机 MVP 数据量（几百到几千行）绰绰有余。
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/toysprout.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// 确保 data/ 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);
}

function needsSeed() {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  return row.cnt === 0;
}

function bootstrap() {
  initSchema();
  if (needsSeed()) {
    // 延迟 require，避免 seed.js 反向 require 本文件造成循环依赖问题
    const { seed } = require('./seed');
    seed(db);
    console.log('[db] users 表为空，已自动注入种子数据（4 位用户 / 10 件玩具）');
  } else {
    console.log('[db] 已检测到既有数据，跳过种子数据注入');
  }
}

bootstrap();

module.exports = db;
