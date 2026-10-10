// src/routes/swaps.js
// 交换订单：发起 / 意向确认 / 服务费支付 / 运单 / 收货 / 取消 / 纠纷 / 互评。
// 状态机：requested -> accepted -> shipping -> received -> reviewed
//         requested -> rejected | cancelled（未成交阶段）
//         任意进行中状态 -> disputed（AC-15）
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { HttpError, ok } = require('../middleware/error-handler');
const { publicToy } = require('./toys');
const { publicAddress } = require('./addresses');

const router = express.Router();

const SERVICE_FEE_FEN = 190; // ¥1.9 = 190 分（dev-checklist B-01 已拍板）

function isMemberActive(user) {
  return user.is_member === 1 && !!user.member_expires_at && new Date(user.member_expires_at) > new Date();
}

// 创建订单时固化双方服务费金额（会员一方为 0，AC-10/AC-11）。
function feeForUser(user) {
  return isMemberActive(user) ? 0 : SERVICE_FEE_FEN;
}

function publicSwap(row) {
  return {
    id: row.id,
    initiatorId: row.initiator_id,
    targetOwnerId: row.target_owner_id,
    myToyId: row.my_toy_id,
    targetToyId: row.target_toy_id,
    message: row.message,
    status: row.status,
    serviceFeeAmountInitiator: row.service_fee_amount_initiator,
    serviceFeeAmountTarget: row.service_fee_amount_target,
    serviceFeePaidByInitiator: row.service_fee_paid_by_initiator === 1,
    serviceFeePaidByTarget: row.service_fee_paid_by_target === 1,
    initiatorTrackingNo: row.initiator_tracking_no || null,
    targetTrackingNo: row.target_tracking_no || null,
    initiatorReceivedAt: row.initiator_received_at || null,
    targetReceivedAt: row.target_received_at || null,
    createdAt: row.created_at,
  };
}

function getSwapOr404(id) {
  const row = db.prepare('SELECT * FROM swaps WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, '交换订单不存在');
  return row;
}

// 我的交换订单列表。
router.get('/', (req, res, next) => {
  try {
    const where = ['(initiator_id = ? OR target_owner_id = ?)'];
    const params = [req.userId, req.userId];
    if (req.query.status && ['requested', 'accepted', 'rejected', 'shipping', 'received', 'reviewed', 'cancelled', 'disputed'].includes(req.query.status)) {
      where.push('status = ?');
      params.push(req.query.status);
    }
    const rows = db
      .prepare(`SELECT * FROM swaps WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
      .all(...params);
    return ok(res, rows.map(publicSwap));
  } catch (e) {
    return next(e);
  }
});

// 发起交换（AC-06：创建 requested 订单，双方玩具转 swapping）。
router.post('/', (req, res, next) => {
  try {
    const targetToyId = req.body.targetToyId;
    const myToyId = req.body.myToyId;
    const message = String(req.body.message || '').trim();
    const myToy = db.prepare('SELECT * FROM toys WHERE id = ?').get(myToyId);
    if (!myToy || myToy.owner_id !== req.userId) throw new HttpError(400, '请选择自己的一件玩具用于交换');
    if (myToy.status !== 'available') throw new HttpError(400, '所选玩具当前不可用于交换');
    const targetToy = db.prepare('SELECT * FROM toys WHERE id = ?').get(targetToyId);
    if (!targetToy) throw new HttpError(404, '目标玩具不存在');
    if (targetToy.status !== 'available') throw new HttpError(400, '目标玩具已被其他用户发起交换，请换一件');
    if (targetToy.owner_id === req.userId) throw new HttpError(400, '不能与自己发布的玩具交换');
    const initiator = req.user;
    const targetOwner = db.prepare('SELECT * FROM users WHERE id = ?').get(targetToy.owner_id);
    const id = uuidv4();
    const createSwap = db.transaction(() => {
      db.prepare(
        `INSERT INTO swaps (id, initiator_id, target_owner_id, my_toy_id, target_toy_id, message, status,
           service_fee_amount_initiator, service_fee_amount_target,
           service_fee_paid_by_initiator, service_fee_paid_by_target,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?, 0, 0, datetime('now'), datetime('now'))`
      ).run(id, req.userId, targetToy.owner_id, myToyId, targetToyId, message, feeForUser(initiator), feeForUser(targetOwner));
      db.prepare("UPDATE toys SET status = 'swapping', updated_at = datetime('now') WHERE id IN (?, ?)").run(myToyId, targetToyId);
    });
    createSwap();
    const row = db.prepare('SELECT * FROM swaps WHERE id = ?').get(id);
    return res.status(201).json({ code: 0, data: publicSwap(row), message: '交换意向已发出，等待对方确认' });
  } catch (e) {
    return next(e);
  }
});

// 订单详情（含双方玩具；AC-16：仅 accepted 及以上状态才暴露对方地址）。
router.get('/:id', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) {
      throw new HttpError(403, '无权查看该订单');
    }
    const myToyRow = db
      .prepare(
        `SELECT t.*, u.name AS owner_name, u.is_verified AS owner_verified, u.credit_score AS owner_credit, u.credit_level AS owner_level
         FROM toys t JOIN users u ON u.id = t.owner_id WHERE t.id = ?`
      )
      .get(row.my_toy_id);
    const targetToyRow = db
      .prepare(
        `SELECT t.*, u.name AS owner_name, u.is_verified AS owner_verified, u.credit_score AS owner_credit, u.credit_level AS owner_level
         FROM toys t JOIN users u ON u.id = t.owner_id WHERE t.id = ?`
      )
      .get(row.target_toy_id);
    let counterpartAddress = null;
    if (['accepted', 'shipping', 'received', 'reviewed', 'disputed'].includes(row.status)) {
      const counterpartId = row.initiator_id === req.userId ? row.target_owner_id : row.initiator_id;
      const addr = db
        .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 1')
        .get(counterpartId);
      if (addr) counterpartAddress = publicAddress(addr);
    }
    const myRole = row.initiator_id === req.userId ? 'initiator' : 'target';
    return ok(res, {
      ...publicSwap(row),
      myRole,
      myToy: myToyRow ? publicToy(myToyRow) : null,
      targetToy: targetToyRow ? publicToy(targetToyRow) : null,
      counterpartAddress,
    });
  } catch (e) {
    return next(e);
  }
});

// 对方同意/拒绝交换意向（AC-07：requested -> accepted/rejected）。
router.post('/:id/respond', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.target_owner_id !== req.userId) throw new HttpError(403, '只有意向接收方可以处理该交换');
    if (row.status !== 'requested') throw new HttpError(400, '该交换当前状态不可处理');
    const accept = req.body.accept === true;
    const update = db.transaction(() => {
      db.prepare(`UPDATE swaps SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(accept ? 'accepted' : 'rejected', row.id);
      if (!accept) {
        // 拒绝后双方玩具回到交换池。
        db.prepare("UPDATE toys SET status = 'available', updated_at = datetime('now') WHERE id IN (?, ?)").run(row.my_toy_id, row.target_toy_id);
      }
    });
    update();
    const updated = db.prepare('SELECT * FROM swaps WHERE id = ?').get(row.id);
    return ok(res, publicSwap(updated), accept ? '已同意交换，请与对方协商寄件并填写运单' : '已拒绝该交换意向');
  } catch (e) {
    return next(e);
  }
});

// 模拟支付服务费（AC-10/AC-11：会员免单，非会员需支付 ¥1.9 才可发起邮寄）。
router.post('/:id/pay-fee', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) throw new HttpError(403, '无权操作该订单');
    if (!['accepted', 'shipping'].includes(row.status)) throw new HttpError(400, '当前状态无需支付服务费');
    const isInitiator = row.initiator_id === req.userId;
    const paidField = isInitiator ? 'service_fee_paid_by_initiator' : 'service_fee_paid_by_target';
    const amountField = isInitiator ? 'service_fee_amount_initiator' : 'service_fee_amount_target';
    if (row[paidField] === 1) throw new HttpError(400, '本单服务费已支付');
    const amount = row[amountField] ?? feeForUser(req.user);
    // 模拟支付：无真实网关，直接视为支付成功。
    db.prepare(`UPDATE swaps SET ${paidField} = 1, updated_at = datetime('now') WHERE id = ?`).run(row.id);
    return ok(res, { swapId: row.id, amountPaid: amount, isMember: isMemberActive(req.user) }, amount === 0 ? '会员免服务费，已跳过支付' : `服务费 ¥${(amount / 100).toFixed(1)} 支付成功`);
  } catch (e) {
    return next(e);
  }
});

// 填写运单号（AC-08：先付服务费；双方都填后转 shipping）。
router.post('/:id/ship', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) throw new HttpError(403, '无权操作该订单');
    if (!['accepted', 'shipping'].includes(row.status)) throw new HttpError(400, '当前状态不可填写运单');
    const isInitiator = row.initiator_id === req.userId;
    const paidField = isInitiator ? 'service_fee_paid_by_initiator' : 'service_fee_paid_by_target';
    if (row[paidField] !== 1) throw new HttpError(400, '请先支付本单服务费（会员自动免单）再发起邮寄');
    const trackingNo = String(req.body.trackingNo || '').trim();
    if (!trackingNo) throw new HttpError(400, '请填写快递单号');
    const trackField = isInitiator ? 'initiator_tracking_no' : 'target_tracking_no';
    const update = db.transaction(() => {
      db.prepare(`UPDATE swaps SET ${trackField} = ?, updated_at = datetime('now') WHERE id = ?`).run(trackingNo, row.id);
      const fresh = db.prepare('SELECT * FROM swaps WHERE id = ?').get(row.id);
      if (fresh.initiator_tracking_no && fresh.target_tracking_no && fresh.status === 'accepted') {
        db.prepare("UPDATE swaps SET status = 'shipping', updated_at = datetime('now') WHERE id = ?").run(row.id);
      }
    });
    update();
    const updated = db.prepare('SELECT * FROM swaps WHERE id = ?').get(row.id);
    return ok(res, publicSwap(updated), '运单号已登记' + (updated.status === 'shipping' ? '，双方均已寄出，等待收货' : ''));
  } catch (e) {
    return next(e);
  }
});

// 确认收货（AC-09：双方都确认后转 received）。
router.post('/:id/confirm-receipt', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) throw new HttpError(403, '无权操作该订单');
    if (row.status !== 'shipping') throw new HttpError(400, '当前状态不可确认收货');
    const isInitiator = row.initiator_id === req.userId;
    const field = isInitiator ? 'initiator_received_at' : 'target_received_at';
    const update = db.transaction(() => {
      db.prepare(`UPDATE swaps SET ${field} = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(row.id);
      const fresh = db.prepare('SELECT * FROM swaps WHERE id = ?').get(row.id);
      if (fresh.initiator_received_at && fresh.target_received_at && fresh.status === 'shipping') {
        db.prepare("UPDATE swaps SET status = 'received', updated_at = datetime('now') WHERE id = ?").run(row.id);
        // 双方确认收货后玩具标记为已交换。
        db.prepare("UPDATE toys SET status = 'exchanged', updated_at = datetime('now') WHERE id IN (?, ?)").run(row.my_toy_id, row.target_toy_id);
      }
    });
    update();
    const updated = db.prepare('SELECT * FROM swaps WHERE id = ?').get(row.id);
    return ok(res, publicSwap(updated), updated.status === 'received' ? '双方均已收货，请在 7 天内互相评价' : '已确认收货，等待对方确认');
  } catch (e) {
    return next(e);
  }
});

// 取消交换（仅未成交：requested / accepted，且未进入邮寄阶段）。
router.post('/:id/cancel', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) throw new HttpError(403, '无权操作该订单');
    if (!['requested', 'accepted'].includes(row.status)) throw new HttpError(400, '订单已进入邮寄/完成阶段，不可取消，如有问题请发起纠纷');
    const update = db.transaction(() => {
      db.prepare("UPDATE swaps SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(row.id);
      db.prepare("UPDATE toys SET status = 'available', updated_at = datetime('now') WHERE id IN (?, ?)").run(row.my_toy_id, row.target_toy_id);
    });
    update();
    const updated = db.prepare('SELECT * FROM swaps WHERE id = ?').get(row.id);
    return ok(res, publicSwap(updated), '交换已取消，双方玩具已退回交换池');
  } catch (e) {
    return next(e);
  }
});

// 提交纠纷（AC-15：订单转 disputed 并冻结状态机推进）。
router.post('/:id/dispute', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) throw new HttpError(403, '无权操作该订单');
    if (['reviewed', 'cancelled'].includes(row.status)) throw new HttpError(400, '该订单已完结，不可发起纠纷');
    const type = String(req.body.type || '').trim();
    const description = String(req.body.description || '').trim();
    const validTypes = ['item_mismatch', 'not_received', 'damaged', 'other'];
    if (!validTypes.includes(type)) throw new HttpError(400, '请选择有效的纠纷类型');
    if (!description) throw new HttpError(400, '请描述纠纷情况');
    const evidenceImages = Array.isArray(req.body.evidenceImages) ? req.body.evidenceImages.map(String) : [];
    const disputeId = uuidv4();
    const createDispute = db.transaction(() => {
      db.prepare(
        `INSERT INTO disputes (id, swap_id, reporter_id, type, description, evidence_images, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`
      ).run(disputeId, row.id, req.userId, type, description, JSON.stringify(evidenceImages));
      db.prepare("UPDATE swaps SET status = 'disputed', updated_at = datetime('now') WHERE id = ?").run(row.id);
    });
    createDispute();
    const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId);
    return res.status(201).json({
      code: 0,
      data: {
        id: dispute.id,
        swapId: dispute.swap_id,
        reporterId: dispute.reporter_id,
        type: dispute.type,
        description: dispute.description,
        evidenceImages: JSON.parse(dispute.evidence_images || '[]'),
        status: dispute.status,
        createdAt: dispute.created_at,
      },
      message: '纠纷已提交，平台将在 3 个工作日内复核（举证期 7 天）',
    });
  } catch (e) {
    return next(e);
  }
});

// 提交互评（AC-12/AC-13：rating>=4 -> +5，rating<=2 -> -10，rating=3 -> 0；双评完转 reviewed）。
router.post('/:id/review', (req, res, next) => {
  try {
    const row = getSwapOr404(req.params.id);
    if (row.initiator_id !== req.userId && row.target_owner_id !== req.userId) throw new HttpError(403, '无权评价该订单');
    const existingReview = db.prepare('SELECT id FROM reviews WHERE swap_id = ? AND reviewer_id = ?').get(row.id, req.userId);
    if (existingReview) throw new HttpError(409, '你已评价过该订单');
    if (row.status !== 'received') throw new HttpError(400, '双方确认收货后才可互评');
    const rating = parseInt(req.body.rating, 10);
    if (![1, 2, 3, 4, 5].includes(rating)) throw new HttpError(400, '请选择 1-5 星评价');
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map(String).filter(Boolean) : [];
    const comment = String(req.body.comment || '').trim();
    const revieweeId = row.initiator_id === req.userId ? row.target_owner_id : row.initiator_id;
    const creditDelta = rating >= 4 ? 5 : rating <= 2 ? -10 : 0;
    const reviewId = uuidv4();
    const doReview = db.transaction(() => {
      // UNIQUE(swap_id, reviewer_id) 冲突由 SQLite 抛错，外层捕获转 409。
      db.prepare(
        `INSERT INTO reviews (id, swap_id, reviewer_id, reviewee_id, rating, tags, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(reviewId, row.id, req.userId, revieweeId, rating, JSON.stringify(tags), comment);
      if (creditDelta !== 0) {
        const reviewee = db.prepare('SELECT * FROM users WHERE id = ?').get(revieweeId);
        const newScore = Math.max(0, Math.min(1000, reviewee.credit_score + creditDelta));
        db.prepare('UPDATE users SET credit_score = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newScore, revieweeId);
        db.prepare(
          `INSERT INTO credit_logs (id, user_id, delta, reason, related_swap_id, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        ).run(uuidv4(), revieweeId, creditDelta, rating >= 4 ? '收到好评' : '收到差评', row.id);
      }
      const reviewCount = db.prepare('SELECT COUNT(*) AS cnt FROM reviews WHERE swap_id = ?').get(row.id).cnt;
      if (reviewCount >= 2 && row.status === 'received') {
        db.prepare("UPDATE swaps SET status = 'reviewed', updated_at = datetime('now') WHERE id = ?").run(row.id);
      }
    });
    try {
      doReview();
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new HttpError(409, '你已评价过该订单');
      }
      throw e;
    }
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
    return res.status(201).json({
      code: 0,
      data: {
        review: {
          id: review.id,
          swapId: review.swap_id,
          reviewerId: review.reviewer_id,
          revieweeId: review.reviewee_id,
          rating: review.rating,
          tags: JSON.parse(review.tags || '[]'),
          comment: review.comment,
          createdAt: review.created_at,
        },
        creditDelta,
      },
      message: creditDelta > 0 ? `评价成功，对方信用分 +${creditDelta}` : creditDelta < 0 ? `评价成功，对方信用分 ${creditDelta}` : '评价成功',
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = { router, isMemberActive, feeForUser, publicSwap };
