// cloudfunctions/_shared/points.js
// 积分双向流通机制：估值算法 + 运费归属判定 + 积分账户/流水操作。
// 对应 .workbuddy/outputs/toy-share-saas/strategy/business-model-v3.md §2.1 / §2.2。
// 源码位于 _shared/，各云函数目录下的同名文件由 scripts/sync-shared.js 分发复制，请勿直接改后者。
'use strict';

// 品类基准积分（§2.1：按「品类基准分 × 成色系数 × 适龄热度系数」给出建议积分区间）
// 适龄热度系数当前阶段固定为 1.0（MVP 简化，不做实时热度统计），后续可接入真实成交数据迭代。
const CATEGORY_BASE_POINTS = {
  building_blocks: 80,
  outdoor_sports: 100,
  pretend_play: 60,
  early_education: 70,
  plush_fabric: 50,
};

const CONDITION_MULTIPLIER = {
  new: 1.2,
  '9new': 1.0,
  '8new': 0.8,
  used: 0.6,
};

// 返回建议积分区间：家长可在 [min, max] 内微调最终 finalPoints，避免纯算法定价失真，
// 也避免完全自定价导致通胀（business-model-v3.md §2.1 规则设计）。
function computeValuationRange(category, conditionLevel) {
  const base = CATEGORY_BASE_POINTS[category] || 60;
  const multiplier = CONDITION_MULTIPLIER[conditionLevel] != null ? CONDITION_MULTIPLIER[conditionLevel] : 1.0;
  const suggested = Math.round(base * multiplier);
  const min = Math.max(10, Math.round(suggested * 0.8));
  const max = Math.round(suggested * 1.2);
  return { min, max, suggested };
}

function clampToRange(value, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function isSameCity(cityA, cityB) {
  if (!cityA || !cityB) return false;
  return String(cityA).trim() === String(cityB).trim();
}

// 运费归属判定（business-model-v3.md §2.2）：
// 同城 -> 'none'（线下自提/约定交接，零运费）
// 发布方选择包邮 -> 'publisher'
// 跨城且未包邮 -> 'redeemer'（兑换方承担，默认规则）
function resolveShippingPayer({ sameCity, isFreeShipping }) {
  if (sameCity) return 'none';
  if (isFreeShipping) return 'publisher';
  return 'redeemer';
}

async function getAccount(db, openid) {
  const res = await db.collection('points_accounts').where({ _openid: openid }).get();
  return res.data[0] || null;
}

async function ensureAccount(db, openid) {
  const existing = await getAccount(db, openid);
  if (existing) return existing;
  const now = db.serverDate();
  const addResult = await db.collection('points_accounts').add({
    data: { _openid: openid, balance: 0, createdAt: now, updatedAt: now },
  });
  return { _id: addResult._id, _openid: openid, balance: 0 };
}

// delta 为正表示入账（如换出玩具得分），为负表示扣减（如兑换消耗积分）。
// 扣减后余额为负时抛出错误，调用方需 catch 并转换为业务错误码（如 409 积分不足）。
async function adjustPoints(db, openid, delta, meta) {
  meta = meta || {};
  const account = await ensureAccount(db, openid);
  const newBalance = (account.balance || 0) + delta;
  if (newBalance < 0) {
    const err = new Error('积分余额不足');
    err.isInsufficientPoints = true;
    throw err;
  }
  const now = db.serverDate();
  await db.collection('points_accounts').doc(account._id).update({ data: { balance: newBalance, updatedAt: now } });
  await db.collection('points_ledger').add({
    data: {
      _openid: openid,
      delta,
      balanceAfter: newBalance,
      type: meta.type || 'adjust',
      relatedToyId: meta.relatedToyId || null,
      relatedSwapId: meta.relatedSwapId || null,
      note: meta.note || '',
      createdAt: now,
    },
  });
  return newBalance;
}

module.exports = {
  CATEGORY_BASE_POINTS,
  CONDITION_MULTIPLIER,
  computeValuationRange,
  clampToRange,
  isSameCity,
  resolveShippingPayer,
  getAccount,
  ensureAccount,
  adjustPoints,
};
