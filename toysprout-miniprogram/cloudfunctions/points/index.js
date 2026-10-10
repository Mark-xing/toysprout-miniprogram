// cloudfunctions/points/index.js
// 积分账户云函数：余额查询 / 发布估值预览 / 兑换前运费预览。
// 对应 business-model-v3.md §2.1（积分双向流通）§2.2（运费归属规则）。
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { ok, fail, BizError } = require('./response');
const points = require('./points');

const CATEGORIES = ['building_blocks', 'outdoor_sports', 'pretend_play', 'early_education', 'plush_fabric'];
const CONDITIONS = ['new', '9new', '8new', 'used'];

async function handleGetBalance(openid) {
  const account = await points.ensureAccount(db, openid);
  const ledgerRes = await db.collection('points_ledger').where({ _openid: openid }).orderBy('createdAt', 'desc').limit(20).get();
  return {
    balance: account.balance || 0,
    ledger: ledgerRes.data.map((l) => ({
      id: l._id,
      delta: l.delta,
      balanceAfter: l.balanceAfter,
      type: l.type,
      relatedToyId: l.relatedToyId || null,
      relatedSwapId: l.relatedSwapId || null,
      note: l.note || '',
      createdAt: l.createdAt,
    })),
  };
}

function handlePreviewValuation(data) {
  const category = data.category;
  const conditionLevel = data.conditionLevel;
  if (!CATEGORIES.includes(category)) throw new BizError(400, '请选择有效的品类');
  if (!CONDITIONS.includes(conditionLevel)) throw new BizError(400, '请选择成色等级');
  return points.computeValuationRange(category, conditionLevel);
}

async function handlePreviewShipping(data, openid) {
  const toyId = data.toyId;
  if (!toyId) throw new BizError(400, '缺少玩具 id');
  const toyDoc = await db.collection('toys').doc(toyId).get().catch(() => null);
  if (!toyDoc || !toyDoc.data) throw new BizError(404, '玩具不存在或已下架');
  const toy = toyDoc.data;
  if (toy._openid === openid) throw new BizError(400, '不能兑换自己发布的玩具');
  if (toy.status !== 'available') throw new BizError(400, '该玩具当前不可兑换');

  const userRes = await db.collection('users').where({ _openid: openid }).get();
  const redeemer = userRes.data[0];
  if (!redeemer) throw new BizError(401, '请先登录');

  const sameCity = points.isSameCity(redeemer.city, toy.city);
  const isFreeShipping = !!toy.isFreeShipping;
  const shippingPayer = points.resolveShippingPayer({ sameCity, isFreeShipping });
  const account = await points.ensureAccount(db, openid);
  const pointsRequired = toy.points || 0;

  let shippingNote;
  if (sameCity) {
    shippingNote = '同城可自提，无需邮寄运费';
  } else if (shippingPayer === 'publisher') {
    shippingNote = '发布方已选择包邮，你无需支付运费';
  } else {
    shippingNote = '跨城邮寄，运费由你（兑换方）承担，具体金额请与对方协商后在订单内确认';
  }

  return {
    toyId,
    pointsRequired,
    myBalance: account.balance || 0,
    sufficientBalance: (account.balance || 0) >= pointsRequired,
    sameCity,
    isFreeShipping,
    shippingPayer,
    shippingNote,
  };
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'getBalance': return ok(await handleGetBalance(openid));
      case 'previewValuation': return ok(handlePreviewValuation(event));
      case 'previewShipping': return ok(await handlePreviewShipping(event, openid));
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[points] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
