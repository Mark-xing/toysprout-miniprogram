// src/routes/membership.js
// 会员订阅（模拟支付 ¥10/月，AC-14：立即生效 30 天，续订从当前到期时间顺延）。
'use strict';

const express = require('express');
const db = require('../db');
const { HttpError, ok } = require('../middleware/error-handler');

const router = express.Router();

const MEMBER_PRICE_FEN = 1000; // ¥10.00 = 1000 分

function addDays(iso, days) {
  const base = iso ? new Date(iso) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 19).replace('T', ' ');
}

router.post('/subscribe', (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    const isActive = user.is_member === 1 && !!user.member_expires_at && new Date(user.member_expires_at) > new Date();
    const newExpires = addDays(isActive ? user.member_expires_at : null, 30);
    db.prepare(
      "UPDATE users SET is_member = 1, member_expires_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newExpires, req.userId);
    return ok(res, { isMember: true, memberExpiresAt: newExpires, amountPaid: MEMBER_PRICE_FEN }, '会员开通成功，已免每单服务费');
  } catch (e) {
    return next(e);
  }
});

router.get('/status', (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    const isActive = user.is_member === 1 && !!user.member_expires_at && new Date(user.member_expires_at) > new Date();
    return ok(res, { isMember: isActive, memberExpiresAt: isActive ? user.member_expires_at : null });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
