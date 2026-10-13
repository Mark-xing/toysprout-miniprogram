// cloudfunctions/notify/index.js
// 站内消息中心云函数：拉取消息列表（分页 + 未读数）/ 单条已读 / 全部已读。
//
// 为什么要单独一个云函数（而不是塞进 user / swap）：
//   消息是一个独立的读多写少的领域（收件箱），有自己的集合（notifications）与语义。
//   写消息由各业务云函数通过 _shared/notify.js 完成（如 swap 在各状态流转处写），
//   读消息只服务「消息中心」这一个页面。独立成函数与项目既有的一函数一领域
//   （auth/user/toy/swap/review/membership/upload/points）保持一致，避免把
//   swap 越堆越大、也避免把收件箱耦合进某个业务函数的 action 列表。
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { ok, fail, BizError } = require('./response');
const notify = require('./notify');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function publicNotification(n) {
  return {
    id: n._id,
    type: n.type,
    title: n.title || '',
    content: n.content || '',
    targetType: n.targetType || 'system',
    targetId: n.targetId || '',
    read: !!n.read,
    createdAt: n.createdAt,
  };
}

async function countUnread(openid) {
  const res = await db.collection(notify.COLLECTION).where({ _openid: openid, read: false }).count();
  return res.total || 0;
}

// ---------- list ----------
async function handleList(data, openid) {
  let page = parseInt(data.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = parseInt(data.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  try {
    const totalRes = await db.collection(notify.COLLECTION).where({ _openid: openid }).count();
    const total = totalRes.total || 0;
    const listRes = await db.collection(notify.COLLECTION)
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();
    const items = (listRes.data || []).map(publicNotification);
    const unreadCount = await countUnread(openid);
    return { items, unreadCount, page, total, hasMore: page * limit < total };
  } catch (e) {
    // 读侧降级：notifications 集合尚未创建时（真实报 -502005 collection not exists），
    // 收件箱是全新功能、且这是其入口页，若直接 500 会让「消息」永远打不开。
    // 与 toy.list 对 wants 集合缺失的降级思路一致：缺失 -> 返回空列表，其余错误照常抛出。
    if (notify.isCollectionMissingError(e)) {
      console.error('[notify] notifications 集合不存在，list 降级为空列表:', e && e.message);
      return { items: [], unreadCount: 0, page, total: 0, hasMore: false };
    }
    throw e;
  }
}

// ---------- markRead ----------
async function handleMarkRead(data, openid) {
  const id = String(data.id || '').trim();
  if (!id) throw new BizError(400, '缺少消息 id');
  // where 条件带上 _openid，防止越权把别人的消息标为已读。
  await db.collection(notify.COLLECTION)
    .where({ _id: id, _openid: openid })
    .update({ data: { read: true } });
  return { unreadCount: await countUnread(openid) };
}

// ---------- markAllRead ----------
async function handleMarkAllRead(openid) {
  await db.collection(notify.COLLECTION)
    .where({ _openid: openid, read: false })
    .update({ data: { read: true } });
  return { unreadCount: 0 };
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  // 拿不到 openid 说明这次调用不来自小程序端（开发者工具直调 / 云函数间误调 / 异常环境）。
  // 明确返回 401，而不是任其落到下面的 catch 变成
  // 「服务内部错误：查询参数对象值不能均为undefined」——后者对调用方毫无信息量，
  // 还会把「未登录」伪装成「服务故障」，排查时白白绕一圈。
  if (!openid) return fail(401, '请先登录');
  try {
    switch (event.action) {
      case 'list': return ok(await handleList(event, openid));
      case 'markRead': return ok(await handleMarkRead(event, openid));
      case 'markAllRead': return ok(await handleMarkAllRead(openid));
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[notify] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
