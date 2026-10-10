// cloudfunctions/_shared/credit.js
// 信用分等级计算：不落库存储 creditLevel，任何需要返回给前端的地方都调用此函数实时计算，
// 从根本上避免 MVP 版曾出现的"信用分与等级双口径不一致"问题（dev-checklist A-06）。
'use strict';

const LEVELS = [
  { min: 950, key: 'elite', label: '优选' },
  { min: 800, key: 'trusted', label: '信赖' },
  { min: 600, key: 'growing', label: '成长' },
  { min: 0, key: 'sprout', label: '新芽' },
];

function deriveCreditLevel(creditScore) {
  const score = Number(creditScore) || 0;
  for (const lv of LEVELS) {
    if (score >= lv.min) return lv.key;
  }
  return 'sprout';
}

// rating>=4 好评+5；rating<=2 差评-10；rating=3 中评不变（沿用 MVP AC-12/AC-13 规则）
function ratingToCreditDelta(rating) {
  if (rating >= 4) return 5;
  if (rating <= 2) return -10;
  return 0;
}

function clampScore(score) {
  return Math.max(0, Math.min(1000, score));
}

module.exports = { deriveCreditLevel, ratingToCreditDelta, clampScore };
