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
const storage = require('./storage');

const ID_CARD_RE = /^\d{17}[\dXx]$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

// 举报目标的类型与原因枚举。这两个集合是服务端校验的唯一真相源，
// 前端 utils/format.js 的 REPORT_REASONS 必须与此保持一致（值一一对应）。
const REPORT_TARGET_TYPES = ['toy', 'user'];
const REPORT_REASONS = ['fake', 'prohibited', 'fraud', 'inappropriate', 'other'];

// 意见反馈的类型枚举与字段上限。同样是服务端校验的唯一真相源，
// 前端 utils/format.js 的 FEEDBACK_TYPES 必须与此保持一致（值一一对应）。
const FEEDBACK_TYPES = ['suggestion', 'report', 'transaction', 'other'];
const FEEDBACK_DESC_MAX = 500;
const FEEDBACK_CONTACT_MAX = 100;
const FEEDBACK_IMAGES_MAX = 3;

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

// ---------- 举报（玩具 / 用户） ----------
//
// 为什么放在 user 云函数而不是新建一个函数：举报属于「用户维度的内容治理行为」，
// 且新建云函数要额外走部署流程；本项目已有 8 个函数，能归入既有维度就不新增。
//
// ⚠️ 云函数侧 db.collection().add() **不会**自动注入 _openid（只有小程序端 SDK 才会），
// 因此这里必须显式写入 _openid，否则后台按 where({_openid}) 查举报人永远查不到。
function publicReport(r) {
  return {
    id: r._id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    description: r.description || '',
    evidenceImages: r.evidenceImages || [],
    status: r.status,
    createdAt: r.createdAt,
  };
}

async function handleCreateReport(data, openid) {
  const targetType = String(data.targetType || '').trim();
  const targetId = String(data.targetId || '').trim();
  const reason = String(data.reason || '').trim();
  const description = String(data.description || '').trim();
  const evidenceImages = Array.isArray(data.evidenceImages)
    ? data.evidenceImages.map((i) => String(i).trim()).filter(Boolean)
    : [];

  if (!REPORT_TARGET_TYPES.includes(targetType)) throw new BizError(400, '举报目标类型不合法');
  if (!REPORT_REASONS.includes(reason)) throw new BizError(400, '举报原因不合法');
  if (!targetId) throw new BizError(400, '缺少举报目标');

  // 「不能举报自己」的闸门。前端本该隐藏入口（见玩具详情页 !isMine 分支），
  // 但服务端必须独立成立 —— 绕开页面直接调云函数一样要被拒。
  if (targetType === 'toy') {
    const doc = await db.collection('toys').doc(targetId).get().catch(() => null);
    const toy = doc && doc.data;
    if (!toy) throw new BizError(404, '举报的玩具不存在');
    if (toy._openid === openid) throw new BizError(400, '不能举报自己发布的玩具');
  } else {
    const doc = await db.collection('users').doc(targetId).get().catch(() => null);
    const user = doc && doc.data;
    if (!user) throw new BizError(404, '举报的用户不存在');
    if (user._openid === openid) throw new BizError(400, '不能举报自己');
  }

  // 幂等：同一举报人对同一目标只落一条，重复提交返回提示而不重复插入
  // （否则点两次「提交」就在后台堆两条待处理记录）。
  const dup = await db.collection('reports')
    .where({ _openid: openid, targetType, targetId }).get();
  if (dup.data.length) {
    return { report: publicReport(dup.data[0]), duplicated: true, message: '你已经举报过该目标，我们正在处理，请勿重复提交' };
  }

  const now = db.serverDate();
  const addResult = await db.collection('reports').add({
    // ⚠️ _openid 显式写入（云函数侧 add() 不自动注入）
    data: { _openid: openid, targetType, targetId, reason, description, evidenceImages, status: 'pending', createdAt: now },
  });
  const fresh = await db.collection('reports').doc(addResult._id).get();
  return { report: publicReport(fresh.data), duplicated: false, message: '举报已提交，平台会尽快核实处理' };
}

// ---------- 意见反馈 ----------
//
// 与举报同属「用户维度的内容治理 / 产品沟通行为」，因此复用 user 云函数，
// 不新建函数（新建要走额外部署流程，能归入既有维度就不新增）。
//
// ⚠️ 云函数侧 db.collection().add() **不会**自动注入 _openid（只有小程序端 SDK 才会），
// 因此这里必须显式写入 _openid，否则后台按 where({_openid}) 查提交人永远查不到。
function publicFeedback(f) {
  return {
    id: f._id,
    type: f.type,
    description: f.description,
    contact: f.contact || '',
    images: f.images || [],
    status: f.status,
    createdAt: f.createdAt,
  };
}

async function handleCreateFeedback(data, openid) {
  const type = String(data.type || '').trim();
  const description = String(data.description || '').trim();
  const contact = String(data.contact || '').trim();
  const images = Array.isArray(data.images)
    ? data.images.map((i) => String(i).trim()).filter(Boolean)
    : [];

  if (!FEEDBACK_TYPES.includes(type)) throw new BizError(400, '反馈类型不合法');
  if (!description) throw new BizError(400, '请填写详细描述');
  if (description.length > FEEDBACK_DESC_MAX) throw new BizError(400, `描述过长，请控制在 ${FEEDBACK_DESC_MAX} 字以内`);
  if (contact.length > FEEDBACK_CONTACT_MAX) throw new BizError(400, `联系方式过长，请控制在 ${FEEDBACK_CONTACT_MAX} 字以内`);
  if (images.length > FEEDBACK_IMAGES_MAX) throw new BizError(400, `最多上传 ${FEEDBACK_IMAGES_MAX} 张图片`);

  const now = db.serverDate();
  const addResult = await db.collection('feedbacks').add({
    // ⚠️ _openid 显式写入（云函数侧 add() 不自动注入）
    data: { _openid: openid, type, description, contact, images, status: 'pending', createdAt: now },
  });
  const fresh = await db.collection('feedbacks').doc(addResult._id).get();
  return { feedback: publicFeedback(fresh.data), message: '反馈已提交，感谢您的反馈' };
}

// ---------- 拉黑 / 取消拉黑 / 黑名单列表 ----------
// 入参统一用 users._id（不是 openid）—— openid 属敏感标识，不下发前端。
// 服务端在此把 _id 解析成 openid 后再落库 blocks.blockedOpenid，保证真实过滤能生效。
async function resolveUserByDocId(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new BizError(400, '缺少用户标识');
  const doc = await db.collection('users').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '用户不存在');
  return doc.data;
}

async function handleBlock(data, openid) {
  const target = await resolveUserByDocId(data.userId);
  if (target._openid === openid) throw new BizError(400, '不能拉黑自己');

  const existing = await db.collection('blocks').where({ _openid: openid, blockedOpenid: target._openid }).get();
  if (existing.data.length) {
    return { block: { blockedOpenid: target._openid }, message: '该用户已在你的黑名单中' };
  }
  await db.collection('blocks').add({
    // ⚠️ _openid 显式写入（云函数侧 add() 不自动注入），否则 handleList 的拉黑过滤读不到自己的黑名单
    data: { _openid: openid, blockedOpenid: target._openid, createdAt: db.serverDate() },
  });
  return { block: { blockedOpenid: target._openid }, message: '已拉黑，对方的玩具不再出现在你的发现页' };
}

async function handleUnblock(data, openid) {
  const target = await resolveUserByDocId(data.userId);
  await db.collection('blocks').where({ _openid: openid, blockedOpenid: target._openid }).remove();
  return { message: '已取消拉黑' };
}

// 黑名单列表。blocks 集合若漏建（真机 -502005），读侧降级为空列表而不是让「我的」页 500
// —— 与 toy.attachWanted / listWants 的读侧容错同一策略。
async function handleListBlocks(openid) {
  let blockRes;
  try {
    blockRes = await db.collection('blocks').where({ _openid: openid }).orderBy('createdAt', 'desc').get();
  } catch (e) {
    console.error('[user] 读取 blocks 失败，黑名单列表降级为空:', (e && e.message) || e);
    return { items: [] };
  }
  const openids = [...new Set(blockRes.data.map((b) => b.blockedOpenid).filter(Boolean))];
  if (!openids.length) return { items: [] };

  const usersRes = await db.collection('users').where({ _openid: _.in(openids) }).get();
  const userMap = {};
  usersRes.data.forEach((u) => { userMap[u._openid] = u; });
  const blockedAtMap = {};
  blockRes.data.forEach((b) => { blockedAtMap[b.blockedOpenid] = b.createdAt; });

  const items = openids
    .map((oid) => userMap[oid])
    .filter(Boolean)
    .map((u) => {
      const pu = publicUser(u);
      return {
        id: pu.id,
        name: pu.name,
        avatarUrl: pu.avatarUrl,
        isVerified: pu.isVerified,
        creditScore: pu.creditScore,
        creditLevel: pu.creditLevel,
        blockedAt: blockedAtMap[u._openid],
      };
    });

  // 头像同样是「他人头像」，PRIVATE ACL 下 fileID 直连会 403，需换签名链接。
  // 注意：这里头像在 items 顶层（不是 owner.avatarUrl），storage.attachImageTempUrls 只认
  // owner.avatarUrl / images，故直接调 buildUrlMap 手工替换。
  const ids = items.map((i) => i.avatarUrl).filter((v) => storage.isCloudFileId(v));
  if (ids.length) {
    const map = await storage.buildUrlMap(cloud, ids);
    items.forEach((i) => { if (i.avatarUrl && map[i.avatarUrl]) i.avatarUrl = map[i.avatarUrl]; });
  }
  return { items };
}

// ---------- 他人主页 ----------
// 入参 userId = users._id。返回「公开字段 + 在架玩具 + 收到的评价」。
// 复用 publicUser() 构造用户返回体（保证与本人资料页同源），但**必须剥离 phone**：
// publicUser 是给「本人」用的，含 phone 字段；他人主页下发 phone 就是隐私泄露。
function publicProfileToy(t, ownerPub, viewerOpenid) {
  return {
    id: t._id,
    ownerId: t._openid,
    title: t.title,
    description: t.description,
    category: t.category,
    ageRange: t.ageRange,
    conditionLevel: t.conditionLevel,
    hasSmallParts: !!t.hasSmallParts,
    images: t.images || [],
    city: t.city || null,
    status: t.status,
    points: t.points || 0,
    isFreeShipping: !!t.isFreeShipping,
    wantCount: t.wantCount || 0,
    createdAt: t.createdAt,
    isMine: !!viewerOpenid && t._openid === viewerOpenid,
    owner: ownerPub,
  };
}

// 与 toy.attachWanted 同源逻辑：一次性 in 查询覆盖整页 toyId，避免 N+1。
// wants 集合漏建时降级为「全部未想要」（心形空心但列表照常出）。
async function attachWanted(items, openid) {
  const withFlag = (list, map) => list.map((t) => Object.assign({}, t, { wanted: !!(map && map[t.id]) }));
  if (!items.length || !openid) return withFlag(items, null);
  const ids = items.map((t) => t.id).filter(Boolean);
  if (!ids.length) return withFlag(items, null);
  let res;
  try {
    res = await db.collection('wants').where({ _openid: openid, toyId: _.in(ids) }).get();
  } catch (e) {
    console.error('[user] 读取 wants 失败，本次降级为全部未想要:', (e && e.message) || e);
    return withFlag(items, null);
  }
  const map = {};
  res.data.forEach((w) => { map[w.toyId] = true; });
  return withFlag(items, map);
}

async function handleGetPublicProfile(data, openid) {
  const userId = String(data.userId || data.id || '').trim();
  if (!userId) throw new BizError(400, '缺少用户标识');
  const doc = await db.collection('users').doc(userId).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '用户不存在');
  const target = doc.data;
  const targetOpenid = target._openid;

  const full = publicUser(target);
  // 剥离敏感字段：phone 只该出现在「本人」的 getProfile，绝不能随他人主页下发。
  // （publicUser 本身已不下发 _openid / idCardHash / idCardMasked 之外的证件信息。）
  const { phone, ...pubUser } = full;

  // 是否本人：前端据此隐藏「拉黑 / 举报」这些注定失败（或多余）的入口。
  const isSelf = targetOpenid === openid;

  // 我是否已拉黑该用户。blocks 集合漏建时降级为「未拉黑」，不阻断主页访问。
  let blocked = false;
  try {
    const b = await db.collection('blocks').where({ _openid: openid, blockedOpenid: targetOpenid }).get();
    blocked = b.data.length > 0;
  } catch (e) {
    console.error('[user] 读取 blocks 失败，主页拉黑状态降级为未拉黑:', (e && e.message) || e);
  }

  // 他人头像先换签名链接（PRIVATE ACL 下 fileID 直连 403）。
  // 换好后作为 owner.avatarUrl 复用给每张玩具卡，避免 attachImageTempUrls 再对同一 fileID 重复签发。
  if (storage.isCloudFileId(pubUser.avatarUrl)) {
    const map = await storage.buildUrlMap(cloud, [pubUser.avatarUrl]);
    if (map[pubUser.avatarUrl]) pubUser.avatarUrl = map[pubUser.avatarUrl];
  }
  const ownerPub = {
    id: pubUser.id,
    name: pubUser.name,
    avatarUrl: pubUser.avatarUrl,
    isVerified: pubUser.isVerified,
    creditScore: pubUser.creditScore,
    creditLevel: pubUser.creditLevel,
  };

  // 在架玩具
  const toysRes = await db.collection('toys')
    .where({ _openid: targetOpenid, status: 'available' })
    .orderBy('createdAt', 'desc').limit(50).get();
  let toys = toysRes.data.map((t) => publicProfileToy(t, ownerPub, openid));
  toys = await attachWanted(toys, openid);
  toys = await storage.attachImageTempUrls(cloud, toys);

  // 收到的评价
  const reviewsRes = await db.collection('reviews')
    .where({ revieweeOpenid: targetOpenid }).orderBy('createdAt', 'desc').get();
  const all = reviewsRes.data;
  const reviewTotal = all.length;
  const avgRating = all.length
    ? Math.round((all.reduce((s, r) => s + (r.rating || 0), 0) / all.length) * 10) / 10
    : null;

  const pageReviews = all.slice(0, 20);
  const reviewerOpenids = [...new Set(pageReviews.map((r) => r.reviewerOpenid).filter(Boolean))];
  const reviewerMap = {};
  if (reviewerOpenids.length) {
    const ur = await db.collection('users').where({ _openid: _.in(reviewerOpenids) }).get();
    ur.data.forEach((u) => { reviewerMap[u._openid] = u; });
  }
  const reviews = pageReviews.map((r) => {
    const rv = publicUser(reviewerMap[r.reviewerOpenid]);
    return {
      id: r._id,
      rating: r.rating,
      tags: r.tags || [],
      comment: r.comment || '',
      createdAt: r.createdAt,
      reviewer: rv ? { id: rv.id, name: rv.name, creditLevel: rv.creditLevel } : null,
    };
  });

  return {
    user: Object.assign({}, pubUser, { isSelf, blocked }),
    toys,
    reviews,
    reviewTotal,
    avgRating,
  };
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
      case 'createReport': { const r = await handleCreateReport(event, openid); return ok(r.report, r.message); }
      case 'createFeedback': { const r = await handleCreateFeedback(event, openid); return ok(r.feedback, r.message); }
      case 'block': { const r = await handleBlock(event, openid); return ok(r.block, r.message); }
      case 'unblock': { const r = await handleUnblock(event, openid); return ok(null, r.message); }
      case 'listBlocks': return ok(await handleListBlocks(openid));
      case 'getPublicProfile': return ok(await handleGetPublicProfile(event, openid));
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
