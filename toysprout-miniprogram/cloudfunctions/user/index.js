// cloudfunctions/user/index.js
// 用户信息与实名认证、地址管理云函数。
'use strict';

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ok, fail, BizError } = require('./response');
const { publicUser } = require('./publicUser');

const ID_CARD_RE = /^\d{17}[\dXx]$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

function maskIdCard(idCard) {
  return idCard.slice(0, 6) + '*'.repeat(idCard.length - 10) + idCard.slice(-4);
}
function hashIdCard(idCard) {
  return crypto.createHash('sha256').update(idCard).digest('hex');
}

async function getCurrentUser(openid, { required = true } = {}) {
  const res = await db.collection('users').where({ _openid: openid }).get();
  const user = res.data[0];
  if (!user && required) throw new BizError(401, '请先登录');
  return user;
}

// publicUser 已抽到 _shared/publicUser.js（auth 与本函数共用同一份定义，
// 避免两处字段漂移）。此处不再本地实现，改为顶部 require。

function publicAddress(a) {
  return {
    id: a._id,
    receiverName: a.receiverName,
    phone: a.phone,
    province: a.province,
    city: a.city,
    detail: a.detail,
    isDefault: !!a.isDefault,
    createdAt: a.createdAt,
  };
}

async function handleGetProfile(openid) {
  const user = await getCurrentUser(openid);
  return { user: publicUser(user) };
}

async function handleVerify(data, openid) {
  const user = await getCurrentUser(openid);
  const name = String(data.name || '').trim();
  const idCard = String(data.idCard || '').trim().toUpperCase();
  if (!name) throw new BizError(400, '请填写真实姓名');
  if (!ID_CARD_RE.test(idCard)) throw new BizError(400, '身份证号格式不正确，需为 18 位');
  const hash = hashIdCard(idCard);
  const dup = await db.collection('users').where({ idCardHash: hash, _openid: _.neq(openid) }).get();
  if (dup.data.length) throw new BizError(409, '该身份证号已被其他账号实名认证');
  await db.collection('users').doc(user._id).update({
    data: { name, idCardHash: hash, idCardMasked: maskIdCard(idCard), isVerified: true, updatedAt: db.serverDate() },
  });
  const fresh = await db.collection('users').doc(user._id).get();
  return { user: publicUser(fresh.data) };
}

async function handleListAddresses(openid) {
  const res = await db.collection('addresses').where({ _openid: openid }).orderBy('isDefault', 'desc').orderBy('createdAt', 'desc').get();
  return { addresses: res.data.map(publicAddress) };
}

function validateAddressInput(data) {
  const receiverName = String(data.receiverName || '').trim();
  const phone = String(data.phone || '').trim();
  const province = String(data.province || '').trim();
  const city = String(data.city || '').trim();
  const detail = String(data.detail || '').trim();
  if (!receiverName) throw new BizError(400, '请填写收件人姓名');
  if (!PHONE_RE.test(phone)) throw new BizError(400, '收件手机号格式不正确');
  if (!province || !city || !detail) throw new BizError(400, '请完整填写省、市、详细地址');
  return { receiverName, phone, province, city, detail, isDefault: !!data.isDefault };
}

async function handleCreateAddress(data, openid) {
  const input = validateAddressInput(data);
  if (input.isDefault) {
    await db.collection('addresses').where({ _openid: openid }).update({ data: { isDefault: false, updatedAt: db.serverDate() } });
  }
  const now = db.serverDate();
  // ⚠️ _openid 必须显式写入（云函数侧 add() 不自动注入）：
  // 否则 listAddresses 永远返回空，且 updateAddress/deleteAddress 的权限校验恒 403。
  const addResult = await db.collection('addresses').add({ data: { _openid: openid, ...input, createdAt: now, updatedAt: now } });
  const fresh = await db.collection('addresses').doc(addResult._id).get();
  return { address: publicAddress(fresh.data) };
}

async function handleUpdateAddress(data, openid) {
  const id = data.id;
  if (!id) throw new BizError(400, '缺少地址 id');
  const doc = await db.collection('addresses').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '地址不存在');
  if (doc.data._openid !== openid) throw new BizError(403, '无权修改该地址');
  const input = validateAddressInput(data);
  if (input.isDefault) {
    await db.collection('addresses').where({ _openid: openid }).update({ data: { isDefault: false, updatedAt: db.serverDate() } });
  }
  await db.collection('addresses').doc(id).update({ data: { ...input, updatedAt: db.serverDate() } });
  const fresh = await db.collection('addresses').doc(id).get();
  return { address: publicAddress(fresh.data) };
}

async function handleDeleteAddress(data, openid) {
  const id = data.id;
  const doc = await db.collection('addresses').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '地址不存在');
  if (doc.data._openid !== openid) throw new BizError(403, '无权删除该地址');
  await db.collection('addresses').doc(id).remove();
  return {};
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'getProfile': return ok(await handleGetProfile(openid));
      case 'verify': return ok(await handleVerify(event, openid), '实名认证成功');
      case 'listAddresses': return ok(await handleListAddresses(openid));
      case 'createAddress': return ok(await handleCreateAddress(event, openid), '地址已添加');
      case 'updateAddress': return ok(await handleUpdateAddress(event, openid), '地址已更新');
      case 'deleteAddress': return ok(await handleDeleteAddress(event, openid), '地址已删除');
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[user] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};

module.exports.getCurrentUser = getCurrentUser;
module.exports.publicUser = publicUser;
