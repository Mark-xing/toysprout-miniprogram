// cloudfunctions/toy/index.js
// 玩具：发布 / 浏览 / 筛选 / 我的玩具 / 编辑 / 下架。
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ok, fail, BizError } = require('./response');
const { deriveCreditLevel } = require('./credit');
const { assertProfileCompleted } = require('./publicUser');
const points = require('./points');
const storage = require('./storage');

const CATEGORIES = ['building_blocks', 'outdoor_sports', 'pretend_play', 'early_education', 'plush_fabric'];
const CONDITIONS = ['new', '9new', '8new', 'used'];

async function getUserByOpenid(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get();
  return res.data[0] || null;
}

function publicToy(t, ownerUser, viewerOpenid) {
  const base = {
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
    // wantCount：被多少人"想要"。冗余存在玩具文档上（而非实时 count 聚合），
    // 因为发现页每页要展示 N 张卡片，逐卡片 count 会变成 N+1 查询。
    // 写入侧用读改写维护（见 handleToggleWant），并发下极小概率少计一次，MVP 阶段可接受。
    wantCount: t.wantCount || 0,
    createdAt: t.createdAt,
    // isMine：当前查看者是不是这件玩具的发布者。
    // 必须由服务端算 —— 身份只以 cloud.getWXContext().OPENID 为准，前端无法也不该自己判断。
    // 前端据此把「用积分兑换 / 发起一换一」换成提示：这两个动作服务端都会拒
    // （swap.redeemWithPoints / swap.create 都有 `_openid === openid` 的 400），
    // 留着按钮只会让用户点了没有任何反应。
    // 刻意放在 base 内（而非下面的 if (ownerUser) 分支）：即使拿不到 owner 用户文档
    // （作者已注销等），也必须能判断"这是不是自己的玩具"。
    // handleList 也一并下发，是为了让"玩具长什么样"只有一处定义；发现页卡片后续可
    // 用它在自己的玩具上隐藏心形按钮（本轮不改卡片）。
    isMine: !!viewerOpenid && t._openid === viewerOpenid,
  };
  if (ownerUser) {
    base.owner = {
      // ⚠️ owner.id 是数据库 users 文档的主键 `_id`，**不是** openid。
      // 前端「点击作者卡进入他人主页」正是拿这个 id 作为路由参数（user.getPublicProfile 入参），
      // openid 属敏感标识、不下发前端，因此这里不能下发 _openid。
      // 判断「是不是自己的玩具」请用 base.isMine（服务端按查看者 openid 算），不要拿 owner.id 比 ownerId。
      id: ownerUser._id,
      name: ownerUser.name,
      avatarUrl: ownerUser.avatarUrl || null,
      isVerified: !!ownerUser.isVerified,
      creditScore: ownerUser.creditScore,
      creditLevel: deriveCreditLevel(ownerUser.creditScore),
    };
  }
  return base;
}

function validateInput(data) {
  const title = String(data.title || '').trim();
  const category = data.category;
  const ageRange = String(data.ageRange || '').trim();
  const conditionLevel = data.conditionLevel;
  const images = Array.isArray(data.images) ? data.images.map((i) => String(i).trim()).filter(Boolean) : [];
  if (!title) throw new BizError(400, '请填写玩具标题');
  if (!CATEGORIES.includes(category)) throw new BizError(400, '请选择有效的品类');
  if (!ageRange) throw new BizError(400, '请填写适龄范围');
  if (!CONDITIONS.includes(conditionLevel)) throw new BizError(400, '请选择成色等级');
  if (images.length < 3) throw new BizError(400, '请至少上传 3 张实拍图片（整体、细节、瑕疵特写）');

  // 积分双向流通（business-model-v3.md §2.1）：按品类基准分×成色系数算出建议区间，
  // 家长可在区间内微调 finalPoints；超出区间或未提供则回退为算法建议值，避免定价失真/通胀。
  const range = points.computeValuationRange(category, conditionLevel);
  const clamped = points.clampToRange(data.finalPoints, range.min, range.max);
  const finalPoints = clamped != null ? clamped : range.suggested;

  return {
    title,
    description: String(data.description || '').trim(),
    category,
    ageRange,
    conditionLevel,
    hasSmallParts: !!data.hasSmallParts,
    images,
    points: finalPoints,
    isFreeShipping: !!data.isFreeShipping,
  };
}

// 批量补充作者信息（一次性查询去重 openid，避免 N+1）
async function enrichOwners(toys, openid) {
  const openids = [...new Set(toys.map((t) => t._openid))];
  if (!openids.length) return toys.map((t) => publicToy(t, null, openid));
  const usersRes = await db.collection('users').where({ _openid: _.in(openids) }).get();
  const userMap = {};
  usersRes.data.forEach((u) => { userMap[u._openid] = u; });
  return toys.map((t) => publicToy(t, userMap[t._openid], openid));
}

// 标记"当前用户是否已想要"，供卡片渲染实心心形。
// 一次 in 查询覆盖整页所有 toyId，避免每张卡片查一次（N+1）。
//
// 容错：`wants` 集合漏建时 where().get() 会抛 -502005（collection not exists），
// 而本函数在 handleList 的主链路上——不兜住就会让整个发现页 500（实测踩过）。
// 读侧降级为"全部未想要"（心形是空心的，但信息流照常出），写侧 handleToggleWant 依然会
// 明确报错，所以不会出现"看着点上了其实没写进去"的静默错误。
async function attachWanted(items, openid) {
  const withFlag = (list, map) => list.map((t) => Object.assign({}, t, { wanted: !!(map && map[t.id]) }));
  if (!items.length || !openid) return withFlag(items, null);
  const ids = items.map((t) => t.id).filter(Boolean);
  if (!ids.length) return withFlag(items, null);
  let res;
  try {
    res = await db.collection('wants').where({ _openid: openid, toyId: _.in(ids) }).get();
  } catch (e) {
    console.error('[toy] 读取 wants 失败，本次降级为全部未想要:', (e && e.message) || e);
    return withFlag(items, null);
  }
  const wantedMap = {};
  res.data.forEach((w) => { wantedMap[w.toyId] = true; });
  return withFlag(items, wantedMap);
}

// 云存储 ACL 兜底：当前环境免费体验期内存储 ACL 锁死在「仅创建者可读写」，
// 他人上传的图片用公开 CDN 地址访问返回 403。这里把 images 里的 cloud:// fileID
// 换成云函数签发的临时链接，使非创建者也能正常看到图片。详见 _shared/storage.js。
async function withImageUrls(pubToys) {
  return storage.attachImageTempUrls(cloud, pubToys);
}

async function handleList(data, openid) {
  const where = { status: 'available' };
  if (data.category && CATEGORIES.includes(data.category)) where.category = data.category;
  if (data.condition && CONDITIONS.includes(data.condition)) where.conditionLevel = data.condition;
  if (data.age) where.ageRange = db.RegExp({ regexp: data.age, options: 'i' });
  if (data.keyword) where.title = db.RegExp({ regexp: data.keyword, options: 'i' });

  // 拉黑过滤：被当前用户拉黑的人发布的玩具不出现在发现页。
  //
  // 关键：过滤必须作用在**查询条件**上（where._openid = _.nin(...)），而不是取回一页后
  // 再在应用层 filter —— 后者会让 count() 的 total 与实际可见条目对不上，分页自相矛盾。
  // 放在 DB 层后 count() 与 get() 用同一份条件，total 与 items 天然自洽。
  //
  // 容错：`blocks` 集合漏建时 where().get() 抛 -502005，而本函数是发现页主链路，
  // 不兜住整个发现页直接 500（与 attachWanted 踩过的坑同源）。降级为「不过滤」而非报错。
  if (openid) {
    try {
      const blocksRes = await db.collection('blocks').where({ _openid: openid }).get();
      const blockedOpenids = blocksRes.data.map((b) => b.blockedOpenid).filter(Boolean);
      if (blockedOpenids.length) where._openid = _.nin(blockedOpenids);
    } catch (e) {
      console.error('[toy] 读取 blocks 失败，本次发现页不做拉黑过滤:', (e && e.message) || e);
    }
  }

  const page = Math.max(1, parseInt(data.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20));

  let query = db.collection('toys').where(where);
  const countRes = await query.count();
  let total = countRes.total;

  // creditVerified 筛选需要先拿作者信息再过滤，云数据库不支持跨集合 join 条件查询，
  // 采用"先按其他条件查一批 → 补充作者信息 → 应用层过滤"的策略（MVP 阶段数据量小可接受）
  const rawRes = await query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get();
  let items = await enrichOwners(rawRes.data, openid);

  if (data.creditVerified === true || data.creditVerified === 'true') {
    items = items.filter((t) => t.owner && t.owner.creditScore >= 800);
    // creditVerified 场景下 total 无法精确增量计算（NoSQL 无法在 DB 层 join 过滤），
    // 退化为返回当前页命中数，前端分页体验略降级但功能正确，MVP 阶段可接受
    total = items.length < limit ? (page - 1) * limit + items.length : total;
  }

  items = await withImageUrls(items);
  items = await attachWanted(items, openid);
  return { items, total, page, limit, hasMore: page * limit < total };
}

async function handleMine(data, openid) {
  const where = { _openid: openid };
  if (data.status && ['available', 'swapping', 'exchanged', 'removed'].includes(data.status)) {
    where.status = data.status;
  }
  const res = await db.collection('toys').where(where).orderBy('createdAt', 'desc').get();
  const items = await enrichOwners(res.data, openid);
  return { items: await withImageUrls(items) };
}

// 「我想要的」：把 wants（关系表）里的 toyId 还原成完整玩具卡片。
//
// 分页在 wants 记录上进行（按 createdAt 倒序），再按本页 toyId 批量取 toys，
// 这样避免了"先把该用户所有玩具查出来再排序"的 N+1 / 全量扫描。
// 返回体与 handleList 完全一致（复用 enrichOwners→publicToy / withImageUrls / attachWanted），
// 保证卡片字段（isMine / wanted / wantCount / images…）与发现页、详情页同源。
//
// 过滤：已下架（status=removed）与已删除（文档查不到）的玩具一律剔除，绝不返回空壳对象，
// 否则卡片会渲染成没有标题、作者为空的"幽灵卡片"。
// 注意 total 统计的是 wants 记录数——被过滤掉的玩具仍计入 total，因此翻到末页可能出现
// "这一页为空" 的情况（与 handleList 的 creditVerified 降级同理）。MVP 阶段可接受：
// 用户看到的条目永远是真的，只是页尾可能提前到底。
async function handleListWants(data, openid) {
  const page = Math.max(1, parseInt(data.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20));

  // 兜底：`wants` 集合漏建时 where().get() 抛 -502005，不能让「我想要的」整页 500。
  // 降级为空列表（而不是报错），与 attachWanted 的读侧容错同一策略。
  let wantRes;
  try {
    wantRes = await db.collection('wants')
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();
  } catch (e) {
    console.error('[toy] 读取 wants 失败，listWants 降级为空列表:', (e && e.message) || e);
    return { items: [], total: 0, page, limit, hasMore: false };
  }

  let total = 0;
  try {
    const countRes = await db.collection('wants').where({ _openid: openid }).count();
    total = countRes.total;
  } catch (e) {
    // count 失败不影响本页数据，退化为"至少本页这么多"
    total = (wantRes.data || []).length;
  }

  // 去重（同一 toyId 理论上只会有一条 want 记录，容错处理重复数据）并保序
  const ids = [...new Set((wantRes.data || []).map((w) => w.toyId).filter(Boolean))];
  if (!ids.length) {
    return { items: [], total, page, limit, hasMore: page * limit < total };
  }

  const toysRes = await db.collection('toys').where({ _id: _.in(ids) }).get();
  const toyMap = {};
  toysRes.data.forEach((t) => { toyMap[t._id] = t; });
  // 按"想要的先后顺序"排列；toyMap 里查不到 = 文档已删除，status=removed = 已下架，两者都剔除
  const ordered = ids
    .map((id) => toyMap[id])
    .filter((t) => t && t.status !== 'removed');

  let items = await enrichOwners(ordered, openid);
  items = await withImageUrls(items);
  items = await attachWanted(items, openid);
  return { items, total, page, limit, hasMore: page * limit < total };
}

async function handleDetail(data, openid) {
  const id = data.id;
  const doc = await db.collection('toys').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '玩具不存在或已下架');
  const t = doc.data;
  const owner = await db.collection('users').where({ _openid: t._openid }).get();
  const summaryRes = await db.collection('reviews').where({ revieweeOpenid: t._openid }).get();
  const ratings = summaryRes.data.map((r) => r.rating);
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
  const [toy] = await withImageUrls([
    {
      ...publicToy(t, owner.data[0], openid),
      reviewSummary: { avgRating, count: ratings.length },
    },
  ]);
  const [withWant] = await attachWanted([toy], openid);
  return { toy: withWant };
}

async function handleCreate(data, openid) {
  const input = validateInput(data);
  const user = await getUserByOpenid(openid);
  // 发布是「对外可见」的写操作：必须已有昵称，否则玩具在发现页会显示空名字。
  // 静默登录建档后昵称为空，用户需先到「资料」页设置。
  assertProfileCompleted(user);
  const now = db.serverDate();
  const addResult = await db.collection('toys').add({
    // ⚠️ _openid 必须显式写入（云函数侧 add() 不自动注入）：
    // 否则 toy.mine 永远查不到自己的玩具，且 handleUpdate/handleRemove 的
    // `doc.data._openid !== openid` 恒为真 → 编辑/下架永远 403。
    data: { _openid: openid, ...input, city: user.city || null, status: 'available', createdAt: now, updatedAt: now },
  });
  const fresh = await db.collection('toys').doc(addResult._id).get();
  const [toy] = await withImageUrls([publicToy(fresh.data, user, openid)]);
  return { toy };
}

async function handleUpdate(data, openid) {
  const id = data.id;
  const doc = await db.collection('toys').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '玩具不存在');
  if (doc.data._openid !== openid) throw new BizError(403, '无权编辑该玩具');
  if (doc.data.status !== 'available') throw new BizError(400, '该玩具正在交换流程中，暂不可编辑');
  const input = validateInput(data);
  await db.collection('toys').doc(id).update({ data: { ...input, updatedAt: db.serverDate() } });
  const fresh = await db.collection('toys').doc(id).get();
  const user = await getUserByOpenid(openid);
  const [toy] = await withImageUrls([publicToy(fresh.data, user, openid)]);
  return { toy };
}

// 想要 / 取消想要（发现页卡片右下角的心形，以及双击封面触发的动效）。
// 幂等语义：同一个人对同一件玩具反复点，只会在"想要/不想要"之间来回切，不会重复计数。
async function handleToggleWant(data, openid) {
  const toyId = data.toyId;
  if (!toyId) throw new BizError(400, '缺少玩具 id');

  const doc = await db.collection('toys').doc(toyId).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '玩具不存在');
  const toy = doc.data;
  if (toy._openid === openid) throw new BizError(400, '不能对自己发布的玩具点想要');

  const wantsCol = db.collection('wants');
  const existing = await wantsCol.where({ _openid: openid, toyId }).get();
  const alreadyWanted = existing.data.length > 0;

  if (alreadyWanted) {
    await wantsCol.doc(existing.data[0]._id).remove();
  } else {
    // ⚠️ _openid 必须显式写入（云函数侧 add() 不自动注入），否则 where({_openid}) 永远查不到 → 计数只会加不会减
    await wantsCol.add({ data: { _openid: openid, toyId, createdAt: db.serverDate() } });
  }

  // 读改写而非 $inc 原子自增：MVP 阶段并发量极低，代价是极端并发下可能少计一次。
  // 若将来发现页流量上来、计数要求精确，把这里换成 db.command.inc(±1) 即可。
  const nextCount = Math.max(0, (toy.wantCount || 0) + (alreadyWanted ? -1 : 1));
  await db.collection('toys').doc(toyId).update({ data: { wantCount: nextCount } });

  return { wanted: !alreadyWanted, wantCount: nextCount };
}

async function handleRemove(data, openid) {
  const id = data.id;
  const doc = await db.collection('toys').doc(id).get().catch(() => null);
  if (!doc || !doc.data) throw new BizError(404, '玩具不存在');
  if (doc.data._openid !== openid) throw new BizError(403, '无权下架该玩具');
  if (doc.data.status === 'swapping') throw new BizError(400, '该玩具正在交换流程中，暂不可下架');
  await db.collection('toys').doc(id).update({ data: { status: 'removed', updatedAt: db.serverDate() } });
  return {};
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'list': return ok(await handleList(event, openid));
      case 'mine': return ok(await handleMine(event, openid));
      case 'listWants': return ok(await handleListWants(event, openid));
      case 'detail': return ok((await handleDetail(event, openid)).toy);
      case 'create': return ok((await handleCreate(event, openid)).toy, '发布成功，玩具已进入交换池');
      case 'update': return ok((await handleUpdate(event, openid)).toy, '玩具已更新');
      case 'remove': return ok(await handleRemove(event, openid), '玩具已下架');
      case 'toggleWant': {
        const r = await handleToggleWant(event, openid);
        return ok(r, r.wanted ? '已加入想要' : '已取消想要');
      }
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[toy] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
