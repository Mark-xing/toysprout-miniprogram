// src/routes/reviews.js
// 我收到的评价列表。
'use strict';

const express = require('express');
const db = require('../db');
const { ok } = require('../middleware/error-handler');

const router = express.Router();

router.get('/received', (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const total = db
      .prepare('SELECT COUNT(*) AS cnt FROM reviews WHERE reviewee_id = ?')
      .get(req.userId).cnt;
    const rows = db
      .prepare(
        `SELECT r.*, u.name AS reviewer_name, u.credit_score AS reviewer_credit, u.credit_level AS reviewer_level
         FROM reviews r JOIN users u ON u.id = r.reviewer_id
         WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(req.userId, limit, (page - 1) * limit);
    return ok(res, {
      items: rows.map((r) => ({
        id: r.id,
        swapId: r.swap_id,
        reviewerId: r.reviewer_id,
        revieweeId: r.reviewee_id,
        rating: r.rating,
        tags: JSON.parse(r.tags || '[]'),
        comment: r.comment,
        createdAt: r.created_at,
        reviewer: {
          id: r.reviewer_id,
          name: r.reviewer_name,
          creditScore: r.reviewer_credit,
          creditLevel: r.reviewer_level,
        },
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
