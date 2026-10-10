// cloudfunctions/review/index.js
// 我收到的评价列表。
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ok, fail, BizError } = require('./response');
const { deriveCreditLevel } = require('./credit');

async function handleListReceived(data, openid) {
  const page = Math.max(1, parseInt(data.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20));

  const countRes = await db.collection('reviews').where({ revieweeOpenid: openid }).count();
  const total = countRes.total;
  const res = await db.collection('reviews').where({ revieweeOpenid: openid })
    .orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get();

  const reviewerOpenids = [...new Set(res.data.map((r) => r.reviewerOpenid))];
  let userMap = {};
  if (reviewerOpenids.length) {
    const usersRes = await db.collection('users').where({ _openid: _.in(reviewerOpenids) }).get();
    usersRes.data.forEach((u) => { userMap[u._openid] = u; });
  }

  const items = res.data.map((r) => {
    const reviewer = userMap[r.reviewerOpenid];
    return {
      id: r._id, swapId: r.swapId, reviewerId: r.reviewerOpenid, revieweeId: r.revieweeOpenid,
      rating: r.rating, tags: r.tags || [], comment: r.comment, createdAt: r.createdAt,
      reviewer: reviewer ? { id: reviewer._openid, name: reviewer.name, creditScore: reviewer.creditScore, creditLevel: deriveCreditLevel(reviewer.creditScore) } : null,
    };
  });

  return { items, total, page, limit, hasMore: page * limit < total };
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'listReceived': return ok(await handleListReceived(event, openid));
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[review] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
