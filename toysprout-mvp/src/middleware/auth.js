// src/middleware/auth.js
// JWT 鉴权中间件：解析 Authorization: Bearer <token>，将用户信息挂到 req.user。
'use strict';

const jwt = require('jsonwebtoken');
const db = require('../db');
const { HttpError } = require('./error-handler');

const JWT_SECRET = process.env.JWT_SECRET || 'toysprout-dev-secret';
const JWT_EXPIRES_IN = '30d';

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return next(new HttpError(401, '请先登录'));
  }
  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET);
  } catch (e) {
    return next(new HttpError(401, '登录状态已失效，请重新登录'));
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    return next(new HttpError(401, '用户不存在，请重新登录'));
  }
  req.user = user;
  req.userId = user.id;
  return next();
}

module.exports = { requireAuth, signToken, JWT_SECRET };
