// src/routes/addresses.js
// 收货地址 CRUD（交换互邮前置）。
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { HttpError, ok } = require('../middleware/error-handler');

const router = express.Router();

function publicAddress(row) {
  return {
    id: row.id,
    userId: row.user_id,
    receiverName: row.receiver_name,
    phone: row.phone,
    province: row.province,
    city: row.city,
    detail: row.detail,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

function validateInput(body) {
  const receiverName = String(body.receiverName || '').trim();
  const phone = String(body.phone || '').trim();
  const province = String(body.province || '').trim();
  const city = String(body.city || '').trim();
  const detail = String(body.detail || '').trim();
  if (!receiverName) throw new HttpError(400, '请填写收件人姓名');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new HttpError(400, '收件手机号格式不正确');
  if (!province || !city || !detail) throw new HttpError(400, '请完整填写省、市、详细地址');
  return { receiverName, phone, province, city, detail, isDefault: !!body.isDefault };
}

router.get('/', (req, res, next) => {
  try {
    const rows = db
      .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
      .all(req.userId);
    return ok(res, rows.map(publicAddress));
  } catch (e) {
    return next(e);
  }
});

router.post('/', (req, res, next) => {
  try {
    const input = validateInput(req.body);
    const id = uuidv4();
    const setDefault = db.transaction(() => {
      if (input.isDefault) {
        db.prepare('UPDATE addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE user_id = ?').run(req.userId);
      }
      db.prepare(
        `INSERT INTO addresses (id, user_id, receiver_name, phone, province, city, detail, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(id, req.userId, input.receiverName, input.phone, input.province, input.city, input.detail, input.isDefault ? 1 : 0);
    });
    setDefault();
    const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(id);
    return res.status(201).json({ code: 0, data: publicAddress(row), message: '地址已添加' });
  } catch (e) {
    return next(e);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const addr = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
    if (!addr) throw new HttpError(404, '地址不存在');
    if (addr.user_id !== req.userId) throw new HttpError(403, '无权修改该地址');
    const input = validateInput(req.body);
    const update = db.transaction(() => {
      if (input.isDefault) {
        db.prepare('UPDATE addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE user_id = ?').run(req.userId);
      }
      db.prepare(
        `UPDATE addresses SET receiver_name = ?, phone = ?, province = ?, city = ?, detail = ?, is_default = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(input.receiverName, input.phone, input.province, input.city, input.detail, input.isDefault ? 1 : 0, req.params.id);
    });
    update();
    const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
    return ok(res, publicAddress(row), '地址已更新');
  } catch (e) {
    return next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const addr = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
    if (!addr) throw new HttpError(404, '地址不存在');
    if (addr.user_id !== req.userId) throw new HttpError(403, '无权删除该地址');
    db.prepare('DELETE FROM addresses WHERE id = ?').run(req.params.id);
    return ok(res, null, '地址已删除');
  } catch (e) {
    return next(e);
  }
});

module.exports = { router, publicAddress };
