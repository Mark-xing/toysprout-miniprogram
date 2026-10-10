// cloudfunctions/swap/index.js
// 交换订单云函数：发起 / 意向确认 / 服务费支付 / 运单 / 收货 / 取消 / 纠纷 / 互评。
// 状态机：requested -> accepted -> shipping -> received -> reviewed
//         requested -> rejected | cancelled（未成交阶段）
//         任意进行中状态 -> disputed
//
// 【云数据库无跨文档事务的应对策略】（详见 SPEC-PRODUCTION.md §7.1）：
// 1. 发起交换：先建 swap 记录，再更新两个 toy 状态；第二步失败则补偿删除 swap 记录。
// 2. 状态机流转：更新时带 status 前置条件（where 命中才 update），
//    天然形成乐观锁，避免并发下的状态覆写/重复流转。
// 3. 互评唯一性：写入前 count 校验 + 云数据库层唯一性兜底（极端并发下的小概率风险，
//    MVP/生产预留阶段可接受）。
'use strict';

const cloud = require('wx-server-sdk');
const { v4: uuidv4 } = require('uuid');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ok, fail, BizError } = require('./response');
const { deriveCreditLevel, ratingToCreditDelta, clampScore } = require('./credit');
const { assertProfileCompleted } = require('./publicUser');
const points = require('./points');
const storage = require('./storage');
const payService = require('./services/payService');

const SERVICE_FEE_FEN = 190; // ¥1.9（dev-checklist B-01 已拍板，双方发起快递时收取）
const DISPUTE_TYPES = ['item_mismatch', 'not_received', 'damaged', 'other'];

function isMemberActive(user) {
  return !!(user && user.isMember && user.memberExpiresAt && new Date(user.memberExpiresAt) > new Date());
}
function feeForUser(user) {
  return isMemberActive(user) ? 0 : SERVICE_FEE_FEN;
}

async function getUser(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get();
  return res.data[0] || null;
}
async function getUserOrThrow(openid) {
  const u = await getUser(openid);
  if (!u) throw new BizError(401, '请先登录');
  return u;
}
async function getToyOrThrow(id) {
  const doc = await db.collection('toys').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '玩具不存在');
  return doc.data;
}
async function getSwapOrThrow(id) {
  const doc = await db.collection('swaps').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '交换订单不存在');
  return { ...doc.data, id: doc.data._id };
}

function publicSwap(s) {
  return {
    id: s._id || s.id,
    // exchangeType 字段用于区分两条运费逻辑完全不同的交易路径（business-model-v3.md §2.1/§2.2）：
    // 'direct'（旧记录缺省该字段也视为 direct）= 一换一双向对等交换，运费双方协商；
    // 'points_redeem' = 积分单向兑换，运费按 §2.2 默认规则归属。
    exchangeType: s.exchangeType || 'direct',
    initiatorId: s.initiatorOpenid,
    targetOwnerId: s.targetOpenid,
    myToyId: s.myToyId || null,
    targetToyId: s.targetToyId,
    message: s.message,
    status: s.status,
    pointsAmount: s.pointsAmount || 0,
    shippingPayer: s.shippingPayer || null,
    isSameCity: !!s.isSameCity,
    serviceFeeAmountInitiator: s.serviceFeeAmountInitiator,
    serviceFeeAmountTarget: s.serviceFeeAmountTarget,
    serviceFeePaidByInitiator: !!s.serviceFeePaidByInitiator,
    serviceFeePaidByTarget: !!s.serviceFeePaidByTarget,
    initiatorTrackingNo: s.initiatorTrackingNo || null,
    targetTrackingNo: s.targetTrackingNo || null,
    initiatorReceivedAt: s.initiatorReceivedAt || null,
    targetReceivedAt: s.targetReceivedAt || null,
    createdAt: s.createdAt,
  };
}

function publicToySimple(t) {
  if (!t) return null;
  return {
    id: t._id, title: t.title, description: t.description, category: t.category,
    ageRange: t.ageRange, conditionLevel: t.conditionLevel, hasSmallParts: !!t.hasSmallParts,
    images: t.images || [], city: t.city || null, status: t.status, ownerId: t._openid,
  };
}
function publicAddress(a) {
  if (!a) return null;
  return { id: a._id, receiverName: a.receiverName, phone: a.phone, province: a.province, city: a.city, detail: a.detail, isDefault: !!a.isDefault };
}

// ---------- create ----------
async function handleCreate(data, openid) {
  const targetToyId = data.targetToyId;
  const myToyId = data.myToyId;
  const message = String(data.message || '').trim();
  const myToy = await getToyOrThrow(myToyId);
  if (myToy._openid !== openid) throw new BizError(400, '请选择自己的一件玩具用于交换');
  if (myToy.status !== 'available') throw new BizError(400, '所选玩具当前不可用于交换');
  const targetToy = await getToyOrThrow(targetToyId);
  if (targetToy.status !== 'available') throw new BizError(400, '目标玩具已被其他用户发起交换，请换一件');
  if (targetToy._openid === openid) throw new BizError(400, '不能与自己发布的玩具交换');

  const initiator = assertProfileCompleted(await getUserOrThrow(openid));
  const targetOwner = await getUser(targetToy._openid);

  const now = db.serverDate();
  const addResult = await db.collection('swaps').add({
    data: {
      exchangeType: 'direct',
      initiatorOpenid: openid,
      targetOpenid: targetToy._openid,
      myToyId, targetToyId, message,
      status: 'requested',
      serviceFeeAmountInitiator: feeForUser(initiator),
      serviceFeeAmountTarget: feeForUser(targetOwner),
      serviceFeePaidByInitiator: false,
      serviceFeePaidByTarget: false,
      initiatorTrackingNo: null, targetTrackingNo: null,
      initiatorReceivedAt: null, targetReceivedAt: null,
      createdAt: now, updatedAt: now,
    },
  });

  try {
    // 双方玩具下架为 swapping（无跨文档事务，逐个更新；若第二步失败则补偿回滚）
    await db.collection('toys').doc(myToyId).update({ data: { status: 'swapping', updatedAt: now } });
    await db.collection('toys').doc(targetToyId).update({ data: { status: 'swapping', updatedAt: now } });
  } catch (e) {
    // 补偿：回滚已创建的 swap 记录与可能已更新的 myToy 状态
    await db.collection('swaps').doc(addResult._id).remove().catch(() => {});
    await db.collection('toys').doc(myToyId).update({ data: { status: 'available' } }).catch(() => {});
    throw new BizError(500, '发起交换失败，请重试：' + e.message);
  }

  const fresh = await getSwapOrThrow(addResult._id);
  return { swap: publicSwap(fresh) };
}

// ---------- redeemWithPoints ----------
// 积分单向兑换（business-model-v3.md §2.1）：兑换方只需看中对方玩具即可兑换，
// 不要求发布方也看中兑换方的玩具——这是打破"一换一双重巧合难题"的核心机制，
// 因此无需 respond 环节，兑换成立即直接进入 accepted（待邮寄/待自提）状态。
async function handleRedeemWithPoints(data, openid) {
  const toyId = data.toyId;
  if (!toyId) throw new BizError(400, '缺少玩具 id');
  const toy = await getToyOrThrow(toyId);
  if (toy._openid === openid) throw new BizError(400, '不能兑换自己发布的玩具');
  if (toy.status !== 'available') throw new BizError(400, '该玩具已被兑换或下架，请换一件');

  const redeemer = assertProfileCompleted(await getUserOrThrow(openid));
  const publisherOpenid = toy._openid;

  const pointsRequired = toy.points || 0;
  const sameCity = points.isSameCity(redeemer.city, toy.city);
  const isFreeShipping = !!toy.isFreeShipping;
  const shippingPayer = points.resolveShippingPayer({ sameCity, isFreeShipping });

  // 1) 先扣兑换方积分，余额不足直接抛错，不创建任何订单记录
  try {
    await points.adjustPoints(db, openid, -pointsRequired, {
      type: 'redeem_spend', relatedToyId: toyId, note: '积分兑换：' + toy.title,
    });
  } catch (e) {
    if (e.isInsufficientPoints) throw new BizError(409, '积分余额不足，无法兑换该玩具，先去发布闲置玩具赚积分吧');
    throw e;
  }

  // 2) 创建 swap 记录：initiator=兑换方，target=发布方，myToyId 为空（无需提供回换玩具）
  const now = db.serverDate();
  let addResult;
  try {
    addResult = await db.collection('swaps').add({
      data: {
        exchangeType: 'points_redeem',
        initiatorOpenid: openid,
        targetOpenid: publisherOpenid,
        myToyId: null,
        targetToyId: toyId,
        message: '',
        status: 'accepted',
        pointsAmount: pointsRequired,
        shippingPayer,
        isSameCity: sameCity,
        serviceFeeAmountInitiator: 0,
        serviceFeeAmountTarget: 0,
        serviceFeePaidByInitiator: false,
        serviceFeePaidByTarget: false,
        initiatorTrackingNo: null, targetTrackingNo: null,
        initiatorReceivedAt: null, targetReceivedAt: null,
        createdAt: now, updatedAt: now,
      },
    });
  } catch (e) {
    // 补偿：订单创建失败则退回已扣的积分
    await points.adjustPoints(db, openid, pointsRequired, {
      type: 'redeem_refund', relatedToyId: toyId, note: '兑换下单失败自动退还',
    }).catch(() => {});
    throw new BizError(500, '兑换失败，请重试：' + e.message);
  }

  // 3) 发布方入账积分 + 玩具下架为 swapping
  await points.adjustPoints(db, publisherOpenid, pointsRequired, {
    type: 'redeem_earn', relatedToyId: toyId, relatedSwapId: addResult._id, note: '玩具被兑换：' + toy.title,
  }).catch((e) => console.error('[swap] credit publisher points failed:', e));
  await db.collection('toys').doc(toyId).update({ data: { status: 'swapping', updatedAt: now } }).catch(() => {});

  const fresh = await getSwapOrThrow(addResult._id);
  const message = sameCity
    ? '兑换成功，同城可直接约定自提，无需邮寄'
    : (shippingPayer === 'publisher' ? '兑换成功，对方已选择包邮，等待对方寄出' : '兑换成功，运费由你承担，请与对方协商寄件后等待对方寄出');
  return { swap: publicSwap(fresh), message };
}

// ---------- confirmPickup（积分兑换·同城自提专用） ----------
async function handleConfirmPickup(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.exchangeType !== 'points_redeem' || !s.isSameCity) throw new BizError(400, '该订单不支持同城自提确认');
  if (s.initiatorOpenid !== openid) throw new BizError(403, '只有兑换方可确认自提');
  if (s.status !== 'accepted') throw new BizError(400, '当前状态不可确认自提');

  const upd = await db.collection('swaps').where({ _id: s.id, status: 'accepted' })
    .update({ data: { status: 'received', initiatorReceivedAt: db.serverDate(), updatedAt: db.serverDate() } });
  if (upd.stats.updated === 0) throw new BizError(409, '该订单状态已发生变化，请刷新重试');
  await db.collection('toys').doc(s.targetToyId).update({ data: { status: 'exchanged', updatedAt: db.serverDate() } }).catch(() => {});
  const fresh = await getSwapOrThrow(s.id);
  return { swap: publicSwap(fresh), message: '已确认自提，交易完成，请在 7 天内评价对方' };
}

// ---------- list ----------
async function handleList(data, openid) {
  const where = _.or([{ initiatorOpenid: openid }, { targetOpenid: openid }]);
  let query = db.collection('swaps').where(where);
  if (data.status) query = db.collection('swaps').where(_.and([where, { status: data.status }]));
  const res = await query.orderBy('createdAt', 'desc').get();
  return { items: res.data.map(publicSwap) };
}

// ---------- detail ----------
async function handleDetail(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权查看该订单');
  const [myToyDoc, targetToyDoc] = await Promise.all([
    s.myToyId ? db.collection('toys').doc(s.myToyId).get().catch(() => null) : Promise.resolve(null),
    db.collection('toys').doc(s.targetToyId).get().catch(() => null),
  ]);
  const myRole = s.initiatorOpenid === openid ? 'initiator' : 'target';
  let counterpartAddress = null;
  if (['accepted', 'shipping', 'received', 'reviewed', 'disputed'].includes(s.status)) {
    const counterpartOpenid = s.initiatorOpenid === openid ? s.targetOpenid : s.initiatorOpenid;
    const addrRes = await db.collection('addresses').where({ _openid: counterpartOpenid }).orderBy('isDefault', 'desc').orderBy('createdAt', 'desc').limit(1).get();
    if (addrRes.data[0]) counterpartAddress = publicAddress(addrRes.data[0]);
  }
  // 云存储 ACL 兜底：双方玩具图片若是 cloud:// fileID，在此换成签名临时链接，
  // 否则非图片创建者（即对方）看到的会是破图。详见 _shared/storage.js。
  const [myToy, targetToy] = await storage.attachImageTempUrls(cloud, [
    publicToySimple(myToyDoc && myToyDoc.data),
    publicToySimple(targetToyDoc && targetToyDoc.data),
  ]);
  return {
    ...publicSwap(s),
    myRole,
    myToy,
    targetToy,
    counterpartAddress,
  };
}

// ---------- respond ----------
async function handleRespond(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.targetOpenid !== openid) throw new BizError(403, '只有意向接收方可以处理该交换');
  if (s.status !== 'requested') throw new BizError(400, '该交换当前状态不可处理');
  const accept = data.accept === true;
  const newStatus = accept ? 'accepted' : 'rejected';

  // 乐观锁：更新条件带 status='requested'，命中数为0说明已被并发修改
  const updateRes = await db.collection('swaps').where({ _id: s.id, status: 'requested' })
    .update({ data: { status: newStatus, updatedAt: db.serverDate() } });
  if (updateRes.stats.updated === 0) throw new BizError(409, '该交换状态已发生变化，请刷新重试');

  if (!accept) {
    await db.collection('toys').doc(s.myToyId).update({ data: { status: 'available', updatedAt: db.serverDate() } }).catch(() => {});
    await db.collection('toys').doc(s.targetToyId).update({ data: { status: 'available', updatedAt: db.serverDate() } }).catch(() => {});
  }
  const fresh = await getSwapOrThrow(s.id);
  return { swap: publicSwap(fresh), message: accept ? '已同意交换，请与对方协商寄件并填写运单' : '已拒绝该交换意向' };
}

// ---------- payFee ----------
async function handlePayFee(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权操作该订单');
  // 积分兑换模式已取消强制服务费（business-model-v3.md §3），只对 direct 一换一订单生效
  if (s.exchangeType === 'points_redeem') throw new BizError(400, '积分兑换订单无需支付服务费');
  if (!['accepted', 'shipping'].includes(s.status)) throw new BizError(400, '当前状态无需支付服务费');
  const isInitiator = s.initiatorOpenid === openid;
  const paidField = isInitiator ? 'serviceFeePaidByInitiator' : 'serviceFeePaidByTarget';
  const amountField = isInitiator ? 'serviceFeeAmountInitiator' : 'serviceFeeAmountTarget';
  if (s[paidField]) throw new BizError(400, '本单服务费已支付');
  const user = await getUserOrThrow(openid);
  const amount = s[amountField] != null ? s[amountField] : feeForUser(user);

  const payResult = await payService.charge({ openid, amountFen: amount, description: '童芽ToySprout交换服务费', outTradeNo: uuidv4() });
  if (!payResult.success) throw new BizError(500, '支付失败，请重试');

  await db.collection('swaps').doc(s.id).update({ data: { [paidField]: true, updatedAt: db.serverDate() } });
  return { swapId: s.id, amountPaid: amount, isMember: isMemberActive(user) };
}

// ---------- ship ----------
async function handleShip(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权操作该订单');

  // 积分兑换为单向实物流动（只有发布方寄出），逻辑与双向 direct 交换完全不同，单独分支处理
  if (s.exchangeType === 'points_redeem') {
    if (s.isSameCity) throw new BizError(400, '该订单为同城自提，无需填写运单，请使用「确认自提」');
    if (s.targetOpenid !== openid) throw new BizError(403, '积分兑换订单仅由玩具发布方登记运单');
    if (s.status !== 'accepted') throw new BizError(400, '当前状态不可填写运单');
    const trackingNo = String(data.trackingNo || '').trim();
    if (!trackingNo) throw new BizError(400, '请填写快递单号');
    const upd = await db.collection('swaps').where({ _id: s.id, status: 'accepted' })
      .update({ data: { targetTrackingNo: trackingNo, status: 'shipping', updatedAt: db.serverDate() } });
    if (upd.stats.updated === 0) throw new BizError(409, '该订单状态已发生变化，请刷新重试');
    const fresh = await getSwapOrThrow(s.id);
    return { swap: publicSwap(fresh), message: '运单号已登记，等待兑换方确认收货' };
  }

  if (!['accepted', 'shipping'].includes(s.status)) throw new BizError(400, '当前状态不可填写运单');
  const isInitiator = s.initiatorOpenid === openid;
  const paidField = isInitiator ? 'serviceFeePaidByInitiator' : 'serviceFeePaidByTarget';
  if (!s[paidField]) throw new BizError(400, '请先支付本单服务费（会员自动免单）再发起邮寄');
  const trackingNo = String(data.trackingNo || '').trim();
  if (!trackingNo) throw new BizError(400, '请填写快递单号');
  const trackField = isInitiator ? 'initiatorTrackingNo' : 'targetTrackingNo';

  await db.collection('swaps').doc(s.id).update({ data: { [trackField]: trackingNo, updatedAt: db.serverDate() } });
  const fresh = await getSwapOrThrow(s.id);
  let message = '运单号已登记';
  if (fresh.initiatorTrackingNo && fresh.targetTrackingNo && fresh.status === 'accepted') {
    const upd = await db.collection('swaps').where({ _id: s.id, status: 'accepted' }).update({ data: { status: 'shipping', updatedAt: db.serverDate() } });
    if (upd.stats.updated > 0) message += '，双方均已寄出，等待收货';
  }
  const finalDoc = await getSwapOrThrow(s.id);
  return { swap: publicSwap(finalDoc), message };
}

// ---------- confirmReceipt ----------
async function handleConfirmReceipt(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权操作该订单');

  // 积分兑换只有兑换方收货，无需等待对方（发布方不接收任何实物），单独分支处理
  if (s.exchangeType === 'points_redeem') {
    if (s.initiatorOpenid !== openid) throw new BizError(403, '积分兑换订单仅由兑换方确认收货');
    if (s.status !== 'shipping') throw new BizError(400, '当前状态不可确认收货');
    const upd = await db.collection('swaps').where({ _id: s.id, status: 'shipping' })
      .update({ data: { status: 'received', initiatorReceivedAt: db.serverDate(), updatedAt: db.serverDate() } });
    if (upd.stats.updated === 0) throw new BizError(409, '该订单状态已发生变化，请刷新重试');
    await db.collection('toys').doc(s.targetToyId).update({ data: { status: 'exchanged', updatedAt: db.serverDate() } }).catch(() => {});
    const fresh = await getSwapOrThrow(s.id);
    return { swap: publicSwap(fresh), message: '已确认收货，交易完成，请在 7 天内评价对方' };
  }

  if (s.status !== 'shipping') throw new BizError(400, '当前状态不可确认收货');
  const isInitiator = s.initiatorOpenid === openid;
  const field = isInitiator ? 'initiatorReceivedAt' : 'targetReceivedAt';

  await db.collection('swaps').doc(s.id).update({ data: { [field]: db.serverDate(), updatedAt: db.serverDate() } });
  const fresh = await getSwapOrThrow(s.id);
  let message = '已确认收货，等待对方确认';
  if (fresh.initiatorReceivedAt && fresh.targetReceivedAt) {
    const upd = await db.collection('swaps').where({ _id: s.id, status: 'shipping' }).update({ data: { status: 'received', updatedAt: db.serverDate() } });
    if (upd.stats.updated > 0) {
      message = '双方均已收货，请在 7 天内互相评价';
      await db.collection('toys').doc(s.myToyId).update({ data: { status: 'exchanged', updatedAt: db.serverDate() } }).catch(() => {});
      await db.collection('toys').doc(s.targetToyId).update({ data: { status: 'exchanged', updatedAt: db.serverDate() } }).catch(() => {});
    }
  }
  const finalDoc = await getSwapOrThrow(s.id);
  return { swap: publicSwap(finalDoc), message };
}

// ---------- cancel ----------
async function handleCancel(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权操作该订单');

  // 积分兑换取消需要把已结算的积分冲正（兑换方退回、发布方扣除），单独分支处理
  if (s.exchangeType === 'points_redeem') {
    if (s.status !== 'accepted') throw new BizError(400, '订单已进入邮寄/完成阶段，不可取消，如有问题请发起纠纷');
    const upd = await db.collection('swaps').where({ _id: s.id, status: 'accepted' }).update({ data: { status: 'cancelled', updatedAt: db.serverDate() } });
    if (upd.stats.updated === 0) throw new BizError(409, '该交换状态已发生变化，请刷新重试');
    await points.adjustPoints(db, s.initiatorOpenid, s.pointsAmount, {
      type: 'redeem_refund', relatedSwapId: s.id, relatedToyId: s.targetToyId, note: '兑换取消退还积分',
    }).catch((e) => console.error('[swap] refund redeemer points failed:', e));
    // 发布方积分冲正：若其已将积分消费于其他兑换，此处扣减可能导致负余额（MVP 简化，暂未做二次兜底，
    // 已记录为已知限制，待真实交易量上来后评估是否需要"冻结期"机制）
    await points.adjustPoints(db, s.targetOpenid, -s.pointsAmount, {
      type: 'redeem_reverse', relatedSwapId: s.id, relatedToyId: s.targetToyId, note: '兑换取消冲正积分',
    }).catch((e) => console.error('[swap] reverse publisher points failed:', e));
    await db.collection('toys').doc(s.targetToyId).update({ data: { status: 'available', updatedAt: db.serverDate() } }).catch(() => {});
    const fresh = await getSwapOrThrow(s.id);
    return { swap: publicSwap(fresh), message: '兑换已取消，积分已退还，玩具已退回交换池' };
  }

  if (!['requested', 'accepted'].includes(s.status)) throw new BizError(400, '订单已进入邮寄/完成阶段，不可取消，如有问题请发起纠纷');

  const upd = await db.collection('swaps').where({ _id: s.id, status: s.status }).update({ data: { status: 'cancelled', updatedAt: db.serverDate() } });
  if (upd.stats.updated === 0) throw new BizError(409, '该交换状态已发生变化，请刷新重试');
  await db.collection('toys').doc(s.myToyId).update({ data: { status: 'available', updatedAt: db.serverDate() } }).catch(() => {});
  await db.collection('toys').doc(s.targetToyId).update({ data: { status: 'available', updatedAt: db.serverDate() } }).catch(() => {});
  const fresh = await getSwapOrThrow(s.id);
  return { swap: publicSwap(fresh), message: '交换已取消，双方玩具已退回交换池' };
}

// ---------- dispute ----------
async function handleDispute(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权操作该订单');
  if (['reviewed', 'cancelled'].includes(s.status)) throw new BizError(400, '该订单已完结，不可发起纠纷');
  const type = String(data.type || '').trim();
  const description = String(data.description || '').trim();
  if (!DISPUTE_TYPES.includes(type)) throw new BizError(400, '请选择有效的纠纷类型');
  if (!description) throw new BizError(400, '请描述纠纷情况');
  const evidenceImages = Array.isArray(data.evidenceImages) ? data.evidenceImages.map(String) : [];

  const now = db.serverDate();
  const addResult = await db.collection('disputes').add({
    data: { swapId: s.id, reporterOpenid: openid, type, description, evidenceImages, status: 'pending', createdAt: now, updatedAt: now },
  });
  await db.collection('swaps').doc(s.id).update({ data: { status: 'disputed', updatedAt: now } });
  const fresh = await db.collection('disputes').doc(addResult._id).get();
  const d = fresh.data;
  return {
    dispute: { id: d._id, swapId: d.swapId, reporterId: d.reporterOpenid, type: d.type, description: d.description, evidenceImages: d.evidenceImages, status: d.status, createdAt: d.createdAt },
    message: '纠纷已提交，平台将在 3 个工作日内复核（举证期 7 天）',
  };
}

// ---------- review ----------
async function handleReview(data, openid) {
  const s = await getSwapOrThrow(data.id);
  if (s.initiatorOpenid !== openid && s.targetOpenid !== openid) throw new BizError(403, '无权评价该订单');

  const existing = await db.collection('reviews').where({ swapId: s.id, reviewerOpenid: openid }).get();
  if (existing.data.length) throw new BizError(409, '你已评价过该订单');
  if (s.status !== 'received') throw new BizError(400, '双方确认收货后才可互评');

  const rating = parseInt(data.rating, 10);
  if (![1, 2, 3, 4, 5].includes(rating)) throw new BizError(400, '请选择 1-5 星评价');
  const tags = Array.isArray(data.tags) ? data.tags.map(String).filter(Boolean) : [];
  const comment = String(data.comment || '').trim();
  const revieweeOpenid = s.initiatorOpenid === openid ? s.targetOpenid : s.initiatorOpenid;
  const creditDelta = ratingToCreditDelta(rating);

  const now = db.serverDate();
  let reviewId;
  try {
    const addResult = await db.collection('reviews').add({
      data: { swapId: s.id, reviewerOpenid: openid, revieweeOpenid, rating, tags, comment, createdAt: now },
    });
    reviewId = addResult._id;
  } catch (e) {
    throw new BizError(500, '评价提交失败：' + e.message);
  }

  if (creditDelta !== 0) {
    const revieweeUser = await getUser(revieweeOpenid);
    if (revieweeUser) {
      const newScore = clampScore(revieweeUser.creditScore + creditDelta);
      await db.collection('users').doc(revieweeUser._id).update({ data: { creditScore: newScore, updatedAt: now } });
      await db.collection('credit_logs').add({
        data: { userOpenid: revieweeOpenid, delta: creditDelta, reason: rating >= 4 ? '收到好评' : '收到差评', relatedSwapId: s.id, createdAt: now },
      });
    }
  }

  const reviewCountRes = await db.collection('reviews').where({ swapId: s.id }).count();
  if (reviewCountRes.total >= 2) {
    await db.collection('swaps').where({ _id: s.id, status: 'received' }).update({ data: { status: 'reviewed', updatedAt: now } });
  }

  const reviewDoc = await db.collection('reviews').doc(reviewId).get();
  const r = reviewDoc.data;
  return {
    review: { id: r._id, swapId: r.swapId, reviewerId: r.reviewerOpenid, revieweeId: r.revieweeOpenid, rating: r.rating, tags: r.tags, comment: r.comment, createdAt: r.createdAt },
    creditDelta,
    message: creditDelta > 0 ? `评价成功，对方信用分 +${creditDelta}` : creditDelta < 0 ? `评价成功，对方信用分 ${creditDelta}` : '评价成功',
  };
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'create': return ok((await handleCreate(event, openid)).swap, '交换意向已发出，等待对方确认');
      case 'redeemWithPoints': { const r = await handleRedeemWithPoints(event, openid); return ok(r.swap, r.message); }
      case 'confirmPickup': { const r = await handleConfirmPickup(event, openid); return ok(r.swap, r.message); }
      case 'list': return ok(await handleList(event, openid));
      case 'detail': return ok(await handleDetail(event, openid));
      case 'respond': { const r = await handleRespond(event, openid); return ok(r.swap, r.message); }
      case 'payFee': return ok(await handlePayFee(event, openid));
      case 'ship': { const r = await handleShip(event, openid); return ok(r.swap, r.message); }
      case 'confirmReceipt': { const r = await handleConfirmReceipt(event, openid); return ok(r.swap, r.message); }
      case 'cancel': { const r = await handleCancel(event, openid); return ok(r.swap, r.message); }
      case 'dispute': { const r = await handleDispute(event, openid); return ok(r.dispute, r.message); }
      case 'review': { const r = await handleReview(event, openid); return ok({ review: r.review, creditDelta: r.creditDelta }, r.message); }
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[swap] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
