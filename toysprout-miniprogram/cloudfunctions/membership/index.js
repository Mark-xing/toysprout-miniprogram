// cloudfunctions/membership/index.js
// 会员订阅（模拟支付 ¥10/月，立即生效 30 天，续订从当前到期时间顺延）。
'use strict';

const cloud = require('wx-server-sdk');
const { v4: uuidv4 } = require('uuid');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { ok, fail, BizError } = require('./response');
const payService = require('./services/payService');

const MEMBER_PRICE_FEN = 1000; // ¥10.00

function addDays(date, days) {
  const base = date ? new Date(date) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 19).replace('T', ' ');
}

async function getUserOrThrow(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get();
  const u = res.data[0];
  if (!u) throw new BizError(401, '请先登录');
  return u;
}

async function handleSubscribe(openid) {
  const user = await getUserOrThrow(openid);
  const isActive = !!(user.isMember && user.memberExpiresAt && new Date(user.memberExpiresAt) > new Date());
  const newExpires = addDays(isActive ? user.memberExpiresAt : null, 30);

  const payResult = await payService.charge({ openid, amountFen: MEMBER_PRICE_FEN, description: '童芽ToySprout会员订阅', outTradeNo: uuidv4() });
  if (!payResult.success) throw new BizError(500, '支付失败，请重试');

  await db.collection('users').doc(user._id).update({ data: { isMember: true, memberExpiresAt: newExpires, updatedAt: db.serverDate() } });
  return { isMember: true, memberExpiresAt: newExpires, amountPaid: MEMBER_PRICE_FEN };
}

async function handleStatus(openid) {
  const user = await getUserOrThrow(openid);
  const isActive = !!(user.isMember && user.memberExpiresAt && new Date(user.memberExpiresAt) > new Date());
  return { isMember: isActive, memberExpiresAt: isActive ? user.memberExpiresAt : null };
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'subscribe': return ok(await handleSubscribe(openid), '会员开通成功，已免每单服务费');
      case 'status': return ok(await handleStatus(openid));
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[membership] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
