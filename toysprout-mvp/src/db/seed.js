// src/db/seed.js
// 种子数据脚本：注入 4 个测试用户（覆盖新芽/成长/信赖/优选四级信用 + 1 名会员）
// 与 10 件玩具（覆盖 5 大品类 × 4 档成色），文案复用 exchange/web/explore.html
// 已通过设计审查（21/25 PASS）的真实玩具描述风格，不使用占位文案。
//
// 用法：
//   - 作为模块被 src/db/index.js 首次启动时自动调用：seed(db)
//   - 也支持独立执行：`npm run seed`（会先初始化 schema 再注入，重复运行前需清空 users 表）
'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function hashIdCard(idCard) {
  return crypto.createHash('sha256').update(idCard).digest('hex');
}

function maskIdCard(idCard) {
  return `${idCard.slice(0, 6)}${'*'.repeat(idCard.length - 10)}${idCard.slice(-4)}`;
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const USERS = [
  {
    id: uuidv4(),
    phone: '13800000001',
    name: '妈妈·小雨',
    id_card: '440301199001011234',
    is_verified: 1,
    credit_score: 862,          // trusted
    is_member: 0,
    member_expires_at: null,
    city: '深圳',
  },
  {
    id: uuidv4(),
    phone: '13800000002',
    name: '爸爸·阿哲',
    id_card: '110101198812083456',
    is_verified: 1,
    credit_score: 985,          // elite
    is_member: 1,
    member_expires_at: isoDaysFromNow(30),
    city: '北京',
  },
  {
    id: uuidv4(),
    phone: '13800000003',
    name: '妈妈·橙子',
    id_card: '440106199205207890',
    is_verified: 0,
    credit_score: 560,          // sprout（未实名，信用分较低，用于测试筛选/权限边界）
    is_member: 0,
    member_expires_at: null,
    city: '广州',
  },
  {
    id: uuidv4(),
    phone: '13800000004',
    name: '爸爸·大鹏',
    id_card: '510104198709155678',
    is_verified: 1,
    credit_score: 720,          // growing
    is_member: 0,
    member_expires_at: null,
    city: '成都',
  },
];

function buildToys(users) {
  const [xiaoyu, azhe, chengzi, dapeng] = users;
  // 每件玩具 3 张示例图（picsum 占位，前端的 app.js 提供离线降级插画）
  const pics = (seed) => JSON.stringify([
    `https://picsum.photos/seed/${seed}-1/640/480`,
    `https://picsum.photos/seed/${seed}-2/640/480`,
    `https://picsum.photos/seed/${seed}-3/640/480`,
  ]);
  return [
    {
      id: uuidv4(),
      owner_id: xiaoyu.id,
      title: '乐高得宝大颗粒积木 120 粒',
      description: '大颗粒积木，适合小手抓握，无小零件风险。原装收纳盒，配件齐全。',
      category: 'building_blocks',
      age_range: '1.5-5',
      condition_level: '9new',
      has_small_parts: 0,
      images: pics('toysprout-lego'),
      city: xiaoyu.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: azhe.id,
      title: '磁力片 100 片装',
      description: '百变创意磁力片，锻炼空间想象力，含收纳箱与图案卡。',
      category: 'building_blocks',
      age_range: '3-8',
      condition_level: '9new',
      has_small_parts: 1,
      images: pics('toysprout-magnet'),
      city: azhe.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: dapeng.id,
      title: '儿童平衡车 12 寸',
      description: '轻量铝合金车架，锻炼平衡感与协调性，坐垫可调节高度。',
      category: 'outdoor_sports',
      age_range: '3-6',
      condition_level: '8new',
      has_small_parts: 0,
      images: pics('toysprout-bike'),
      city: dapeng.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: chengzi.id,
      title: '仿真厨房过家家 26 件',
      description: '仿真厨具套装 26 件，含灶台、锅具、蔬果配件，锻炼角色扮演与生活认知。',
      category: 'pretend_play',
      age_range: '3-7',
      condition_level: '9new',
      has_small_parts: 1,
      images: pics('toysprout-kitchen'),
      city: chengzi.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: xiaoyu.id,
      title: '蒙特梭利形状配对木盒',
      description: '实木形状配对玩具，未拆封仅试玩过一次，锻炼手眼协调与形状认知。',
      category: 'early_education',
      age_range: '1-3',
      condition_level: 'new',
      has_small_parts: 1,
      images: pics('toysprout-montessori'),
      city: xiaoyu.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: azhe.id,
      title: '进阶拼图 12 盒套装',
      description: '12 盒渐进式拼图，从 20 片到 100 片，锻炼耐心与专注力。',
      category: 'early_education',
      age_range: '2-5',
      condition_level: '8new',
      has_small_parts: 1,
      images: pics('toysprout-puzzle'),
      city: azhe.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: dapeng.id,
      title: '木质火车轨道 38 件套',
      description: '经典木质轨道拼接套装，缺 1 棵小树配件，其余轨道与车头完好。',
      category: 'building_blocks',
      age_range: '3-8',
      condition_level: 'used',
      has_small_parts: 1,
      images: pics('toysprout-train'),
      city: dapeng.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: chengzi.id,
      title: '婴儿健身架（可折叠）',
      description: '可折叠婴儿健身架，悬挂玩偶三个，锻炼婴儿视觉追踪与抓握反射。',
      category: 'early_education',
      age_range: '0-1',
      condition_level: '9new',
      has_small_parts: 0,
      images: pics('toysprout-gym'),
      city: chengzi.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: xiaoyu.id,
      title: '摇摇马',
      description: '实木摇摇马，耳朵漆面有磕碰，结构稳固不影响正常使用。',
      category: 'outdoor_sports',
      age_range: '1-3',
      condition_level: 'used',
      has_small_parts: 0,
      images: pics('toysprout-rockinghorse'),
      city: xiaoyu.city,
      status: 'available',
    },
    {
      id: uuidv4(),
      owner_id: azhe.id,
      title: '儿童绘本 60 本',
      description: '中英双语绘本 60 本，个别书脊有折角，涵盖情绪认知、自然科普主题。',
      category: 'plush_fabric',
      age_range: '0-6',
      condition_level: '8new',
      has_small_parts: 0,
      images: pics('toysprout-books'),
      city: azhe.city,
      status: 'available',
    },
  ];
}

function seed(db) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, phone, name, id_card_hash, id_card_masked, is_verified, credit_score, is_member, member_expires_at, city)
    VALUES (@id, @phone, @name, @id_card_hash, @id_card_masked, @is_verified, @credit_score, @is_member, @member_expires_at, @city)
  `);

  const insertToy = db.prepare(`
    INSERT INTO toys (id, owner_id, title, description, category, age_range, condition_level, has_small_parts, images, city, status)
    VALUES (@id, @owner_id, @title, @description, @category, @age_range, @condition_level, @has_small_parts, @images, @city, @status)
  `);

  const insertCreditLog = db.prepare(`
    INSERT INTO credit_logs (id, user_id, delta, reason, related_swap_id, created_at)
    VALUES (@id, @user_id, @delta, @reason, NULL, datetime('now'))
  `);

  const insertAddress = db.prepare(`
    INSERT INTO addresses (id, user_id, receiver_name, phone, province, city, detail, is_default, created_at, updated_at)
    VALUES (@id, @user_id, @receiver_name, @phone, @province, @city, @detail, 1, datetime('now'), datetime('now'))
  `);

  // 种子用户的默认收货地址（用于交换互邮与 AC-16 对方地址可见性演示）
  const ADDRESSES = [
    { user: USERS[0], receiver_name: '小雨妈妈', phone: '13800000001', province: '广东省', city: '深圳市', detail: '南山区科技园南区 8 栋 1201' },
    { user: USERS[1], receiver_name: '阿哲爸爸', phone: '13800000002', province: '北京市', city: '北京市', detail: '海淀区中关村大街 27 号 5 层' },
    { user: USERS[2], receiver_name: '橙子妈妈', phone: '13800000003', province: '广东省', city: '广州市', detail: '天河区体育西路 101 号 3 栋 602' },
    { user: USERS[3], receiver_name: '大鹏爸爸', phone: '13800000004', province: '四川省', city: '成都市', detail: '武侯区天府大道北段 1700 号 2 栋 1503' },
  ];

  const runSeed = db.transaction(() => {
    for (const u of USERS) {
      insertUser.run({
        id: u.id,
        phone: u.phone,
        name: u.name,
        id_card_hash: hashIdCard(u.id_card),
        id_card_masked: maskIdCard(u.id_card),
        is_verified: u.is_verified,
        credit_score: u.credit_score,
        is_member: u.is_member,
        member_expires_at: u.member_expires_at,
        city: u.city,
      });
      // 为每位用户的初始信用分补一条 credit_logs 基线记录，避免信用分明细页出现"无来源分数"
      insertCreditLog.run({
        id: uuidv4(),
        user_id: u.id,
        delta: u.credit_score - 500,
        reason: '种子数据初始化基线分',
      });
    }

    const toys = buildToys(USERS);
    for (const t of toys) {
      insertToy.run(t);
    }

    for (const a of ADDRESSES) {
      insertAddress.run({
        id: uuidv4(),
        user_id: a.user.id,
        receiver_name: a.receiver_name,
        phone: a.phone,
        province: a.province,
        city: a.city,
        detail: a.detail,
      });
    }
  });

  runSeed();
}

// 支持独立执行：node src/db/seed.js（会通过 require('./index') 触发 schema 初始化）
if (require.main === module) {
  const db = require('./index');
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  if (existing.cnt > 0) {
    console.log('[seed] users 表非空，为避免重复数据，独立执行已跳过。如需重新播种，请先删除 data/toysprout.db');
  } else {
    seed(db);
    console.log('[seed] 种子数据注入完成');
  }
}

module.exports = { seed };
