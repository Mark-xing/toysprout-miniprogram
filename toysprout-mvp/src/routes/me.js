// src/routes/me.js
// 当前用户信息 / 实名认证。
'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { HttpError, ok } = require('../middleware/error-handler');
const { publicUser } = require('./auth');

const router = express.Router();

const ID_CARD_RE = /^\d{17}[\dXx]$/;

function maskIdCard(idCard) {
  return `${idCard.slice(0, 6)}${'*'.repeat(idCard.length - 10)}${idCard.slice(-4)}`;
}

function hashIdCard(idCard) {
  return crypto.createHash('sha256').update(idCard).digest('hex');
}

router.get('/', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    return ok(res, publicUser(row));
  } catch (e) {
    return next(e);
  }
});

// 实名认证：姓名 + 身份证号（18 位，AC-03 格式校验）。仅存哈希 + 掩码，不落地明文。
router.post('/verify', (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const idCard = String(req.body.idCard || '').trim().toUpperCase();
    if (!name) {
      throw new HttpError(400, '请填写真实姓名');
    }
    if (!ID_CARD_RE.test(idCard)) {
      throw new HttpError(400, '身份证号格式不正确，需为 18 位');
    }
    const dup = db.prepare('SELECT id FROM users WHERE id_card_hash = ? AND id <> ?').get(hashIdCard(idCard), req.userId);
    if (dup) {
      throw new HttpError(409, '该身份证号已被其他账号实名认证');
    }
    db.prepare(
      `UPDATE users SET name = ?, id_card_hash = ?, id_card_masked = ?, is_verified = 1, updated_at = datetime('now') WHERE id = ?`
    ).run(name, hashIdCard(idCard), maskIdCard(idCard), req.userId);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    return ok(res, publicUser(row), '实名认证成功');
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
