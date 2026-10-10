// src/routes/auth.js
// 认证：验证码（开发态固定 1234 并回显）/ 注册（手机号已存在则等价登录）。
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { HttpError, ok } = require('../middleware/error-handler');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// 开发态固定验证码。生产环境替换为真实短信网关后，此处逻辑整体移除。
const DEV_CODE = '1234';

const PHONE_RE = /^1[3-9]\d{9}$/;

function publicUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    isVerified: row.is_verified === 1,
    creditScore: row.credit_score,
    creditLevel: row.credit_level,
    isMember: row.is_member === 1 && !!row.member_expires_at && new Date(row.member_expires_at) > new Date(),
    memberExpiresAt: row.member_expires_at || null,
    city: row.city || null,
    createdAt: row.created_at,
  };
}

router.post('/send-code', (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    if (!PHONE_RE.test(phone)) {
      throw new HttpError(400, '手机号格式不正确');
    }
    // 开发态直接回显验证码，方便前端与演示。
    return ok(res, { code: DEV_CODE, devOnly: true, expiresIn: 300 }, '验证码已发送（开发态）');
  } catch (e) {
    return next(e);
  }
});

// 注册与登录合并：验证码正确即可，手机号已存在则视为登录（AC-02），不存在则自动创建。
router.post('/register', (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const code = String(req.body.code || '').trim();
    const name = String(req.body.name || '').trim();
    if (!PHONE_RE.test(phone)) {
      throw new HttpError(400, '手机号格式不正确');
    }
    if (code !== DEV_CODE) {
      throw new HttpError(400, '验证码错误，开发态验证码为 1234');
    }
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      if (!name) {
        throw new HttpError(400, '新用户请填写昵称');
      }
      const id = uuidv4();
      db.prepare(
        `INSERT INTO users (id, phone, name, credit_score, is_member, created_at, updated_at)
         VALUES (?, ?, ?, 500, 0, datetime('now'), datetime('now'))`
      ).run(id, phone, name);
      db.prepare(
        `INSERT INTO credit_logs (id, user_id, delta, reason, created_at)
         VALUES (?, ?, 0, '新用户注册', datetime('now'))`
      ).run(uuidv4(), id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const token = signToken(user.id);
    return ok(res, { token, user: publicUser(user) }, '登录成功');
  } catch (e) {
    return next(e);
  }
});

// 独立登录入口：手机号+验证码，用户必须已存在。
router.post('/login', (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const code = String(req.body.code || '').trim();
    if (!PHONE_RE.test(phone)) {
      throw new HttpError(400, '手机号格式不正确');
    }
    if (code !== DEV_CODE) {
      throw new HttpError(400, '验证码错误，开发态验证码为 1234');
    }
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      throw new HttpError(404, '该手机号尚未注册，请先注册');
    }
    const token = signToken(user.id);
    return ok(res, { token, user: publicUser(user) }, '登录成功');
  } catch (e) {
    return next(e);
  }
});

module.exports = { router, publicUser };
