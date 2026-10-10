// src/routes/toys.js
// 玩具：发布 / 浏览 / 筛选 / 我的玩具 / 编辑 / 下架。
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { HttpError, ok } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['building_blocks', 'outdoor_sports', 'pretend_play', 'early_education', 'plush_fabric'];
const CONDITIONS = ['new', '9new', '8new', 'used'];

function publicToy(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    category: row.category,
    ageRange: row.age_range,
    conditionLevel: row.condition_level,
    hasSmallParts: row.has_small_parts === 1,
    images: JSON.parse(row.images || '[]'),
    city: row.city || null,
    status: row.status,
    createdAt: row.created_at,
    owner: row.owner_name
      ? {
          id: row.owner_id,
          name: row.owner_name,
          isVerified: row.owner_verified === 1,
          creditScore: row.owner_credit,
          creditLevel: row.owner_level,
        }
      : undefined,
  };
}

function validateInput(body) {
  const title = String(body.title || '').trim();
  const category = body.category;
  const ageRange = String(body.ageRange || '').trim();
  const conditionLevel = body.conditionLevel;
  const images = Array.isArray(body.images) ? body.images.map((i) => String(i).trim()).filter(Boolean) : [];
  if (!title) throw new HttpError(400, '请填写玩具标题');
  if (!CATEGORIES.includes(category)) throw new HttpError(400, '请选择有效的品类');
  if (!ageRange) throw new HttpError(400, '请填写适龄范围');
  if (!CONDITIONS.includes(conditionLevel)) throw new HttpError(400, '请选择成色等级');
  if (images.length < 3) throw new HttpError(400, '请至少上传 3 张实拍图片（整体、细节、瑕疵特写）');
  return {
    title,
    description: String(body.description || '').trim(),
    category,
    ageRange,
    conditionLevel,
    hasSmallParts: !!body.hasSmallParts ? 1 : 0,
    images,
  };
}

// 玩具列表（公开）：筛选 category/age/condition/creditVerified/keyword，分页。
router.get('/', (req, res, next) => {
  try {
    const where = ["t.status = 'available'"];
    const params = [];
    if (req.query.category && CATEGORIES.includes(req.query.category)) {
      where.push('t.category = ?');
      params.push(req.query.category);
    }
    if (req.query.condition && CONDITIONS.includes(req.query.condition)) {
      where.push('t.condition_level = ?');
      params.push(req.query.condition);
    }
    if (req.query.age) {
      // 适龄为展示字符串（如 "1.5-5"），做包含匹配即可满足 MVP 筛选需求。
      where.push('t.age_range LIKE ?');
      params.push(`%${req.query.age}%`);
    }
    if (req.query.keyword) {
      where.push('t.title LIKE ?');
      params.push(`%${req.query.keyword}%`);
    }
    if (req.query.creditVerified === 'true' || req.query.creditVerified === '1') {
      where.push('u.credit_score >= 800'); // AC-05 仅信用达标
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db
      .prepare(`SELECT COUNT(*) AS cnt FROM toys t JOIN users u ON u.id = t.owner_id ${whereSql}`)
      .get(...params).cnt;
    const rows = db
      .prepare(
        `SELECT t.*, u.name AS owner_name, u.is_verified AS owner_verified, u.credit_score AS owner_credit, u.credit_level AS owner_level
         FROM toys t JOIN users u ON u.id = t.owner_id ${whereSql}
         ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, (page - 1) * limit);
    return ok(res, {
      items: rows.map(publicToy),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (e) {
    return next(e);
  }
});

// 我的玩具（需登录）。
router.get('/mine', requireAuth, (req, res, next) => {
  try {
    const where = ['owner_id = ?'];
    const params = [req.userId];
    if (req.query.status && ['available', 'swapping', 'exchanged', 'removed'].includes(req.query.status)) {
      where.push('status = ?');
      params.push(req.query.status);
    }
    const rows = db
      .prepare(
        `SELECT t.*, u.name AS owner_name, u.is_verified AS owner_verified, u.credit_score AS owner_credit, u.credit_level AS owner_level
         FROM toys t JOIN users u ON u.id = t.owner_id
         WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC`
      )
      .all(...params);
    return ok(res, rows.map(publicToy));
  } catch (e) {
    return next(e);
  }
});

// 玩具详情（公开）：含作者信息与互评摘要。
router.get('/:id', (req, res, next) => {
  try {
    const row = db
      .prepare(
        `SELECT t.*, u.name AS owner_name, u.is_verified AS owner_verified, u.credit_score AS owner_credit, u.credit_level AS owner_level
         FROM toys t JOIN users u ON u.id = t.owner_id WHERE t.id = ?`
      )
      .get(req.params.id);
    if (!row) throw new HttpError(404, '玩具不存在或已下架');
    const summary = db
      .prepare(
        `SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM reviews WHERE reviewee_id = ?`
      )
      .get(row.owner_id);
    return ok(res, {
      ...publicToy(row),
      reviewSummary: {
        avgRating: summary.avg_rating ? Math.round(summary.avg_rating * 10) / 10 : null,
        count: summary.cnt || 0,
      },
    });
  } catch (e) {
    return next(e);
  }
});

// 发布玩具（AC-04：图片>=3、成色、适龄必填）。
router.post('/', requireAuth, (req, res, next) => {
  try {
    const input = validateInput(req.body);
    const id = uuidv4();
    const city = req.user.city || null;
    db.prepare(
      `INSERT INTO toys (id, owner_id, title, description, category, age_range, condition_level, has_small_parts, images, city, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', datetime('now'), datetime('now'))`
    ).run(id, req.userId, input.title, input.description, input.category, input.ageRange, input.conditionLevel, input.hasSmallParts, JSON.stringify(input.images), city);
    const row = db.prepare('SELECT * FROM toys WHERE id = ?').get(id);
    return res.status(201).json({ code: 0, data: publicToy(row), message: '发布成功，玩具已进入交换池' });
  } catch (e) {
    return next(e);
  }
});

// 编辑我的玩具。
router.put('/:id', requireAuth, (req, res, next) => {
  try {
    const toy = db.prepare('SELECT * FROM toys WHERE id = ?').get(req.params.id);
    if (!toy) throw new HttpError(404, '玩具不存在');
    if (toy.owner_id !== req.userId) throw new HttpError(403, '无权编辑该玩具');
    if (toy.status !== 'available') throw new HttpError(400, '该玩具正在交换流程中，暂不可编辑');
    const input = validateInput(req.body);
    db.prepare(
      `UPDATE toys SET title = ?, description = ?, category = ?, age_range = ?, condition_level = ?, has_small_parts = ?, images = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(input.title, input.description, input.category, input.ageRange, input.conditionLevel, input.hasSmallParts, JSON.stringify(input.images), req.params.id);
    const row = db.prepare('SELECT * FROM toys WHERE id = ?').get(req.params.id);
    return ok(res, publicToy(row), '玩具已更新');
  } catch (e) {
    return next(e);
  }
});

// 下架我的玩具（软删除）。
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const toy = db.prepare('SELECT * FROM toys WHERE id = ?').get(req.params.id);
    if (!toy) throw new HttpError(404, '玩具不存在');
    if (toy.owner_id !== req.userId) throw new HttpError(403, '无权下架该玩具');
    if (toy.status === 'swapping') throw new HttpError(400, '该玩具正在交换流程中，暂不可下架');
    db.prepare("UPDATE toys SET status = 'removed', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    return ok(res, null, '玩具已下架');
  } catch (e) {
    return next(e);
  }
});

module.exports = { router, publicToy };
