#!/usr/bin/env node
// scripts/run-integration-test.js
// 本地集成测试：用 mock-wx-server-sdk 模拟微信云开发环境，加载各云函数 index.js 的
// exports.main，串联跑通完整业务链路（注册→发布→交换→状态机→互评→信用分→会员→地址→纠纷）。
// 这是在无法接入真实云开发环境时，验证云函数业务逻辑正确性的替代方案。
'use strict';

const path = require('path');
const Module = require('module');
const mockSdk = require('./mock-wx-server-sdk');

const ROOT = path.join(__dirname, '..');

// 劫持 require('wx-server-sdk')（返回 mock 实现）与 require('uuid')（用 Node 内置 crypto 兜底，
// 使本地测试无需 npm install 云函数依赖即可运行）
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return mockSdk.createMockCloud(mockSdk.getStore());
  }
  if (request === 'uuid') {
    return { v4: () => require('crypto').randomUUID() };
  }
  return originalLoad.apply(this, arguments);
};

function loadFn(name) {
  const modPath = path.join(ROOT, 'cloudfunctions', name, 'index.js');
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

const auth = loadFn('auth');
const user = loadFn('user');
const toy = loadFn('toy');
const swap = loadFn('swap');
const review = loadFn('review');
const membership = loadFn('membership');
const pointsFn = loadFn('points');
const notify = loadFn('notify');

let PASS = 0, FAIL = 0;
function check(desc, cond, extra) {
  if (cond) { PASS++; console.log('  PASS:', desc); }
  else { FAIL++; console.log('  FAIL:', desc, extra !== undefined ? '=> ' + JSON.stringify(extra) : ''); }
}
async function call(fn, openid, action, data) {
  mockSdk.setCurrentOpenid(openid);
  return fn.main(Object.assign({ action }, data || {}), {});
}

async function main() {
  mockSdk.resetStore();

  console.log('===== A. 认证（微信登录，openid自动建档） =====');
  let r = await call(auth, 'openid-A', 'sendCode', { phone: '13711112222' });
  // 约束的是「服务端不把验证码告诉调用方」这件事本身，与当前用的是固定码还是随机码无关。
  check('sendCode 不回传验证码明文', r.code === 0 && r.data && r.data.code === undefined, r);
  check('sendCode 仍返回有效期与开发态标记', r.code === 0 && r.data.expiresIn > 0 && r.data.devOnly === true, r);
  check('sendCode 响应体整体不含验证码明文', !JSON.stringify(r).includes('1234'), r);
  r = await call(auth, 'openid-A', 'login', { phone: '13711112222', code: '1234', name: '回归测试用户A' });
  check('登录成功建档', r.code === 0 && r.data.user, r);
  r = await call(auth, 'openid-A', 'login', { phone: '13711112222', code: '9999', name: 'x' });
  // 已存在用户 + 错误验证码 -> 应该走"更新手机号"分支校验失败
  check('错误验证码被拒', r.code === 400, r);

  console.log('===== A2. 静默登录与资料完善（方案 A：登录只依赖 openid） =====');
  // 用独立 openid，避免干扰后面依赖 openid-A/B/C/D 信用分与城市的既有用例
  const SILENT = 'openid-silent';
  const store0 = mockSdk.getStore();

  r = await call(auth, SILENT, 'login', {});
  check('无参 login 静默建档成功', r.code === 0 && !!r.data.user, r);
  const silentUserId = r.data && r.data.user && r.data.user.id;
  check('静默建档昵称为空且未完善', r.data.user.name === '' && r.data.user.profileCompleted === false, r.data.user);
  check('静默建档不带手机号', r.data.user.phone === null, r.data.user);
  // 云函数侧 add() 不自动注入 _openid，静默建档同样必须显式写入，否则 getProfile 恒 401
  check('静默建档已写入 _openid', !!store0.col('users').find((u) => u._openid === SILENT), null);

  r = await call(auth, SILENT, 'login', {});
  check('重复静默登录幂等（userId 不变）', r.code === 0 && r.data.user.id === silentUserId, r.data && r.data.user);
  check('users 集合未重复建档',
    store0.col('users').filter((u) => u._openid === SILENT).length === 1, null);

  r = await call(user, SILENT, 'getProfile', {});
  check('静默建档后 getProfile 不再 401', r.code === 0 && r.data.user.name === '', r);

  r = await call(auth, SILENT, 'updateProfile', { name: '' });
  check('空昵称被拒', r.code === 400, r);
  r = await call(auth, SILENT, 'updateProfile', { name: 'x'.repeat(21) });
  check('昵称超 20 字被拒', r.code === 400, r);
  r = await call(auth, SILENT, 'updateProfile', { name: '静静', avatarUrl: 'https://evil.test/a.jpg' });
  check('非云存储头像地址被拒', r.code === 400, r);

  // 未设昵称前不得发布：服务端兜底闸门（前端拦截只是体验优化，这里才是真正防线）
  const validToyPayload = {
    title: '无名氏玩具', category: 'building_blocks', ageRange: '3-6', conditionLevel: 'new',
    images: ['cloud://s/1.jpg', 'cloud://s/2.jpg', 'cloud://s/3.jpg'],
  };
  r = await call(toy, SILENT, 'create', validToyPayload);
  check('未设昵称时发布被服务端拒绝', r.code === 400 && /昵称/.test(r.message), r);

  r = await call(auth, SILENT, 'updateProfile', { name: '静静妈妈', avatarUrl: 'cloud://mock-env/avatars/silent/1.png' });
  check('设置昵称+头像成功', r.code === 0 && r.data.user.name === '静静妈妈' && r.data.user.profileCompleted === true, r);
  check('头像以 fileID 原样返回', r.data.user.avatarUrl === 'cloud://mock-env/avatars/silent/1.png', r.data.user);

  r = await call(auth, SILENT, 'updateProfile', { name: '静静妈妈改名' });
  check('不传 avatarUrl 时不清空已有头像',
    r.code === 0 && r.data.user.avatarUrl === 'cloud://mock-env/avatars/silent/1.png', r.data.user);

  r = await call(auth, SILENT, 'updateProfile', { name: '静静妈妈改名', avatarUrl: '' });
  check('显式传空串可清空头像', r.code === 0 && r.data.user.avatarUrl === null, r.data.user);

  r = await call(toy, SILENT, 'create', validToyPayload);
  check('设好昵称后发布成功', r.code === 0, r);

  console.log('===== B. 实名认证 =====');
  r = await call(user, 'openid-A', 'verify', { name: '回归A', idCard: '440301199001011234' });
  check('实名成功', r.code === 0 && r.data.user.isVerified === true, r);
  r = await call(user, 'openid-A', 'verify', { name: '回归A', idCard: '123' });
  check('身份证格式错误被拒', r.code === 400, r);

  console.log('===== C. 发布与筛选 =====');
  r = await call(toy, 'openid-A', 'create', {
    title: '回归专用磁力片', description: '测试', category: 'building_blocks', ageRange: '3-6',
    conditionLevel: 'new', hasSmallParts: true,
    images: ['cloud://a/1.jpg', 'cloud://a/2.jpg', 'cloud://a/3.jpg'],
  });
  check('发布成功', r.code === 0 && r.data.id, r);
  const toyA = r.data.id;
  r = await call(toy, 'openid-A', 'create', { title: '缺图', category: 'building_blocks', ageRange: '3-6', conditionLevel: 'new', images: ['x'] });
  check('缺图发布被拒', r.code === 400, r);

  // 注册用户B（会员，模拟种子）
  await call(auth, 'openid-B', 'login', { phone: '13800000002', code: '1234', name: '阿哲爸爸' });
  r = await call(toy, 'openid-B', 'create', {
    title: '磁力片100片装', description: '测试', category: 'building_blocks', ageRange: '3-8',
    conditionLevel: '9new', hasSmallParts: true,
    images: ['cloud://b/1.jpg', 'cloud://b/2.jpg', 'cloud://b/3.jpg'],
  });
  const toyB = r.data.id;
  check('B发布玩具成功', r.code === 0, r);

  r = await call(toy, 'openid-A', 'list', { keyword: '磁力片' });
  check('关键词筛选生效', r.code === 0 && r.data.total === 2, r);

  console.log('===== C2. 想要（发现页瀑布流交互） =====');
  r = await call(toy, 'openid-A', 'toggleWant', { toyId: toyB });
  check('首次想要成功且计数为 1', r.code === 0 && r.data.wanted === true && r.data.wantCount === 1, r);

  r = await call(toy, 'openid-A', 'list', { keyword: '磁力片' });
  const wantedCard = (r.data.items || []).find((t) => t.id === toyB);
  const notWantedCard = (r.data.items || []).find((t) => t.id === toyA);
  check('列表中已想要的卡片 wanted=true', wantedCard && wantedCard.wanted === true, wantedCard);
  check('列表中未想要的卡片 wanted=false', notWantedCard && notWantedCard.wanted === false, notWantedCard);
  check('卡片带 wantCount 字段', wantedCard && wantedCard.wantCount === 1, wantedCard);

  r = await call(toy, 'openid-C', 'toggleWant', { toyId: toyB });
  check('第二个人想要后计数为 2', r.code === 0 && r.data.wantCount === 2, r);

  r = await call(toy, 'openid-A', 'toggleWant', { toyId: toyB });
  check('再次点击取消想要且计数回落为 1',
    r.code === 0 && r.data.wanted === false && r.data.wantCount === 1, r);

  // 幂等性反证：取消后 wants 集合不应残留记录，否则计数只会加不会减
  const wantsLeft = mockSdk.getStore().col('wants').filter((w) => w.toyId === toyB).length;
  check('取消后 wants 集合只剩余 1 条（openid-C 的）', wantsLeft === 1, { wantsLeft });

  r = await call(toy, 'openid-A', 'toggleWant', { toyId: toyA });
  check('不能对自己发布的玩具点想要', r.code === 400, r);
  r = await call(toy, 'openid-A', 'toggleWant', { toyId: 'not-exist-toy-id' });
  check('不存在的玩具返回 404', r.code === 404, r);

  r = await call(toy, 'openid-A', 'detail', { id: toyB });
  check('详情接口也带 wanted 标记', r.code === 0 && typeof r.data.wanted === 'boolean', r.data);

  // 故障路径：wants 集合漏建（真实环境报 -502005 collection not exists）。
  // 真机踩过这个坑——attachWanted 在 handleList 主链路上，不兜住整个发现页直接 500。
  // 期望：读侧降级为"全部未想要"，列表照常返回；写侧仍然明确报错。
  mockSdk.failCollection('wants', true);
  r = await call(toy, 'openid-A', 'list', { page: 1, limit: 20 });
  mockSdk.failCollection('wants', false);
  check('wants 集合缺失时 list 不 500（降级返回）', r.code === 0 && r.data && r.data.items.length >= 2, r);
  check('降级时所有卡片 wanted=false（心形空心，但信息流正常）',
    r.code === 0 && r.data.items.every((t) => t.wanted === false), r.code === 0 ? r.data.items.map((t) => t.wanted) : r);

  mockSdk.failCollection('wants', true);
  r = await call(toy, 'openid-A', 'detail', { id: toyB });
  mockSdk.failCollection('wants', false);
  check('wants 集合缺失时 detail 仍可用且 wanted=false', r.code === 0 && r.data.wanted === false, r);

  mockSdk.failCollection('wants', true);
  r = await call(toy, 'openid-A', 'toggleWant', { toyId: toyB });
  mockSdk.failCollection('wants', false);
  check('wants 集合缺失时写侧明确报错（不静默吞掉）', r.code !== 0, r);

  console.log('===== C3. 「我想要的」列表（listWants） =====');
  // 前置：C2 结束时 openid-A 已取消对 toyB 的想要（wants 里只剩 C 的那条），先重新想要一次。
  r = await call(toy, 'openid-A', 'toggleWant', { toyId: toyB });
  check('A 重新想要 toyB 成功', r.code === 0 && r.data.wanted === true, r);

  r = await call(toy, 'openid-A', 'listWants', { page: 1, limit: 20 });
  const wantItems = (r.data && r.data.items) || [];
  const wantTarget = wantItems.find((t) => t.id === toyB);
  check('listWants 返回 code=0 且含 items/total',
    r.code === 0 && Array.isArray(r.data.items) && typeof r.data.total === 'number', r.data);
  check('listWants 命中已想要的玩具', !!wantTarget, wantItems.map((t) => t.id));
  check('listWants 卡片 wanted=true',
    !!wantTarget && wantTarget.wanted === true, wantTarget && wantTarget.wanted);
  // 与 list / detail 同源：复用 publicToy，必须带 isMine / wantCount / images
  check('listWants 卡片字段与 list 一致（isMine/wantCount/images 齐备）',
    !!wantTarget && typeof wantTarget.isMine === 'boolean' && typeof wantTarget.wantCount === 'number'
      && Array.isArray(wantTarget.images),
    wantTarget);
  // A 不是这些玩具的发布者 → isMine 必须为 false（与 detail 口径一致）
  check('listWants 中他人玩具 isMine=false', !!wantTarget && wantTarget.isMine === false, wantTarget && wantTarget.isMine);
  // 数量断言不写死：从实时 wants 记录推导 total
  const wantsA = mockSdk.getStore().col('wants').filter((w) => w._openid === 'openid-A').length;
  check('listWants total 等于该用户 wants 记录数（实时推导）',
    r.data.total === wantsA, { total: r.data.total, wantsA });

  // 过滤：已下架玩具、已删除（查不到）的玩具都不能出现在结果里，更不能是空壳对象
  r = await call(toy, 'openid-B', 'create', {
    title: 'listWants-下架玩具', category: 'plush_fabric', ageRange: '0-6', conditionLevel: '9new',
    images: ['cloud://w/1.jpg', 'cloud://w/2.jpg', 'cloud://w/3.jpg'],
  });
  const toyWRemoved = r.data.id;
  await call(toy, 'openid-A', 'toggleWant', { toyId: toyWRemoved });
  await call(toy, 'openid-B', 'remove', { id: toyWRemoved });

  r = await call(toy, 'openid-B', 'create', {
    title: 'listWants-删除玩具', category: 'plush_fabric', ageRange: '0-6', conditionLevel: '9new',
    images: ['cloud://w/4.jpg', 'cloud://w/5.jpg', 'cloud://w/6.jpg'],
  });
  const toyWDeleted = r.data.id;
  await call(toy, 'openid-A', 'toggleWant', { toyId: toyWDeleted });
  // 模拟文档被彻底删除（管理员清理 / 作者注销），wants 里仍残留指向它的记录
  const storeW = mockSdk.getStore();
  const delIdx = storeW.col('toys').findIndex((t) => t._id === toyWDeleted);
  if (delIdx >= 0) storeW.col('toys').splice(delIdx, 1);

  r = await call(toy, 'openid-A', 'listWants', { page: 1, limit: 50 });
  const wantIds = (r.data.items || []).map((t) => t.id);
  check('listWants 过滤已下架玩具', !wantIds.includes(toyWRemoved), wantIds);
  check('listWants 过滤已删除(查不到)玩具，不返回空壳',
    !wantIds.includes(toyWDeleted) && r.data.items.every((t) => !!t && !!t.id && !!t.title), wantIds);

  // 故障路径：wants 集合漏建（真实环境 -502005）→ 不能 500，降级为空列表
  mockSdk.failCollection('wants', true);
  r = await call(toy, 'openid-A', 'listWants', {});
  mockSdk.failCollection('wants', false);
  check('wants 集合缺失时 listWants 不 500（降级空列表）',
    r.code === 0 && Array.isArray(r.data.items) && r.data.items.length === 0, r);

  // 分页：limit=1 时当前页至多 1 条，hasMore 与实际总量一致
  const wantsNow = mockSdk.getStore().col('wants').filter((w) => w._openid === 'openid-A').length;
  r = await call(toy, 'openid-A', 'listWants', { page: 1, limit: 1 });
  check('listWants 支持分页（limit 生效且 hasMore 正确）',
    r.code === 0 && r.data.items.length <= 1 && r.data.hasMore === (wantsNow > 1), { data: r.data, wantsNow });

  console.log('===== D. 发起交换 + 状态机 =====');
  // 手动把 B 设为会员（模拟种子数据状态）
  const store = mockSdk.getStore();
  const bUser = store.col('users').find((u) => u._openid === 'openid-B');
  bUser.isMember = true;
  bUser.memberExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');

  r = await call(swap, 'openid-A', 'create', { targetToyId: toyB, myToyId: toyA, message: '想换' });
  check('发起交换创建订单', r.code === 0 && r.data.status === 'requested', r);
  const swapId = r.data.id;

  r = await call(toy, 'openid-A', 'detail', { id: toyB });
  check('目标玩具转swapping', r.data.status === 'swapping', r);

  r = await call(swap, 'openid-B', 'detail', { id: swapId });
  check('AC-16 requested不暴露地址', r.data.counterpartAddress === null, r);

  r = await call(swap, 'openid-B', 'respond', { id: swapId, accept: true });
  check('对方同意->accepted', r.code === 0 && r.data.status === 'accepted', r);

  // 补充地址后校验可见性
  await call(user, 'openid-B', 'createAddress', { receiverName: '阿哲爸爸', phone: '13800000002', province: '北京市', city: '北京市', detail: '海淀区1号', isDefault: true });
  r = await call(swap, 'openid-A', 'detail', { id: swapId });
  check('AC-16 accepted后地址可见', r.data.counterpartAddress && r.data.counterpartAddress.receiverName === '阿哲爸爸', r);

  console.log('===== E. 服务费（会员联动） =====');
  r = await call(swap, 'openid-A', 'payFee', { id: swapId });
  check('非会员付¥1.9', r.code === 0 && r.data.amountPaid === 190, r);
  r = await call(swap, 'openid-B', 'payFee', { id: swapId });
  check('会员免单¥0', r.code === 0 && r.data.amountPaid === 0, r);

  console.log('===== F. 运单与收货 =====');
  r = await call(swap, 'openid-A', 'ship', { id: swapId, trackingNo: 'SF1000000001' });
  check('A填运单', r.code === 0 && r.data.initiatorTrackingNo === 'SF1000000001', r);
  r = await call(swap, 'openid-B', 'ship', { id: swapId, trackingNo: 'SF1000000002' });
  check('双方填单后转shipping', r.code === 0 && r.data.status === 'shipping', r);
  r = await call(swap, 'openid-A', 'confirmReceipt', { id: swapId });
  check('A确认收货', r.code === 0 && r.data.initiatorReceivedAt, r);
  r = await call(swap, 'openid-B', 'confirmReceipt', { id: swapId });
  check('双方确认后转received', r.code === 0 && r.data.status === 'received', r);

  console.log('===== G. 互评与信用分 =====');
  r = await call(swap, 'openid-A', 'review', { id: swapId, rating: 5, tags: ['成色如描述'], comment: '很满意' });
  check('A好评B +5', r.code === 0 && r.data.creditDelta === 5, r);
  r = await call(user, 'openid-B', 'getProfile', {});
  check('B信用分500->505', r.data.user.creditScore === 505, r);
  r = await call(swap, 'openid-B', 'review', { id: swapId, rating: 4, tags: ['沟通友好'], comment: '顺利' });
  check('B评A +5', r.code === 0 && r.data.creditDelta === 5, r);
  r = await call(user, 'openid-A', 'getProfile', {});
  check('A信用分500->505', r.data.user.creditScore === 505, r);
  r = await call(swap, 'openid-A', 'review', { id: swapId, rating: 5 });
  check('重复评价409', r.code === 409, r);
  r = await call(swap, 'openid-A', 'detail', { id: swapId });
  check('双评后订单reviewed', r.data.status === 'reviewed', r);

  console.log('===== H. 会员订阅 =====');
  r = await call(membership, 'openid-A', 'subscribe', {});
  check('订阅会员¥10', r.code === 0 && r.data.amountPaid === 1000, r);
  r = await call(membership, 'openid-A', 'status', {});
  check('会员状态生效', r.code === 0 && r.data.isMember === true, r);

  console.log('===== I. 地址管理 =====');
  r = await call(user, 'openid-A', 'createAddress', { receiverName: '回归A', phone: '13711112222', province: '广东省', city: '深圳市', detail: '南山1号', isDefault: true });
  check('新增地址', r.code === 0, r);
  const addrId = r.data.address.id;
  r = await call(user, 'openid-A', 'updateAddress', { id: addrId, receiverName: '回归A2', phone: '13711112222', province: '广东省', city: '深圳市', detail: '南山2号', isDefault: true });
  check('编辑地址', r.code === 0 && r.data.address.receiverName === '回归A2', r);
  r = await call(user, 'openid-A', 'deleteAddress', { id: addrId });
  check('删除地址', r.code === 0, r);

  console.log('===== J. 纠纷 =====');
  await call(toy, 'openid-B', 'create', { title: '纠纷测试玩具B', category: 'plush_fabric', ageRange: '0-6', conditionLevel: '9new', images: ['cloud://j/1.jpg', 'cloud://j/2.jpg', 'cloud://j/3.jpg'] });
  const listB = await call(toy, 'openid-B', 'mine', { status: 'available' });
  const toyB2 = listB.data.items[0].id;
  await call(toy, 'openid-A', 'create', { title: '纠纷测试玩具A', category: 'early_education', ageRange: '2-5', conditionLevel: '8new', images: ['cloud://j/4.jpg', 'cloud://j/5.jpg', 'cloud://j/6.jpg'] });
  const listA = await call(toy, 'openid-A', 'mine', { status: 'available' });
  const toyA2 = listA.data.items[0].id;
  r = await call(swap, 'openid-A', 'create', { targetToyId: toyB2, myToyId: toyA2, message: '纠纷测试' });
  const swap2Id = r.data.id;
  await call(swap, 'openid-B', 'respond', { id: swap2Id, accept: true });
  r = await call(swap, 'openid-A', 'dispute', { id: swap2Id, type: 'damaged', description: '收到货有破损', evidenceImages: ['cloud://d/1.jpg'] });
  check('提交纠纷', r.code === 0 && r.data.status === 'pending', r);
  r = await call(swap, 'openid-A', 'detail', { id: swap2Id });
  check('订单转disputed', r.data.status === 'disputed', r);

  console.log('===== K. 取消流程 =====');
  await call(toy, 'openid-B', 'create', { title: 'B取消测试', category: 'plush_fabric', ageRange: '0-6', conditionLevel: '9new', images: ['cloud://k/1.jpg', 'cloud://k/2.jpg', 'cloud://k/3.jpg'] });
  const listB2 = await call(toy, 'openid-B', 'mine', { status: 'available' });
  const toyB3 = listB2.data.items.find((t) => t.title === 'B取消测试').id;
  await call(toy, 'openid-A', 'create', { title: 'A取消测试', category: 'early_education', ageRange: '2-5', conditionLevel: '9new', images: ['cloud://k/4.jpg', 'cloud://k/5.jpg', 'cloud://k/6.jpg'] });
  const listA2 = await call(toy, 'openid-A', 'mine', { status: 'available' });
  const toyA3 = listA2.data.items.find((t) => t.title === 'A取消测试').id;
  r = await call(swap, 'openid-B', 'create', { targetToyId: toyA3, myToyId: toyB3, message: '取消测试' });
  const swap3Id = r.data.id;
  r = await call(swap, 'openid-B', 'cancel', { id: swap3Id });
  check('取消订单', r.code === 0 && r.data.status === 'cancelled', r);
  r = await call(toy, 'openid-A', 'detail', { id: toyA3 });
  check('取消后玩具回available', r.data.status === 'available', r);

  console.log('===== L. 积分双向流通与运费归属（business-model-v3.md §2.1/§2.2） =====');
  await call(auth, 'openid-C', 'login', { phone: '13600000003', code: '1234', name: '测试妈妈C' });
  await call(auth, 'openid-D', 'login', { phone: '13600000004', code: '1234', name: '测试妈妈D' });
  await call(auth, 'openid-E', 'login', { phone: '13600000005', code: '1234', name: '测试妈妈E' });
  await call(auth, 'openid-F', 'login', { phone: '13600000006', code: '1234', name: '测试妈妈F' });
  const store2 = mockSdk.getStore();
  store2.col('users').find((u) => u._openid === 'openid-C').city = '深圳市';
  store2.col('users').find((u) => u._openid === 'openid-D').city = '深圳市'; // 与C同城
  store2.col('users').find((u) => u._openid === 'openid-E').city = '北京市'; // 跨城+包邮
  store2.col('users').find((u) => u._openid === 'openid-F').city = '广州市'; // 跨城+不包邮

  r = await call(toy, 'openid-D', 'create', {
    title: '积分测试-同城玩具', description: '测试', category: 'building_blocks', ageRange: '3-6',
    conditionLevel: '9new', hasSmallParts: false,
    images: ['cloud://l/1.jpg', 'cloud://l/2.jpg', 'cloud://l/3.jpg'],
  });
  check('D发布玩具自动估值(80分=建筑积木基准80×9新系数1.0)', r.code === 0 && r.data.points === 80, r);
  const toyD = r.data.id;

  r = await call(toy, 'openid-E', 'create', {
    title: '积分测试-跨城包邮玩具', description: '测试', category: 'outdoor_sports', ageRange: '3-8',
    conditionLevel: 'new', hasSmallParts: false, isFreeShipping: true,
    images: ['cloud://l/4.jpg', 'cloud://l/5.jpg', 'cloud://l/6.jpg'],
  });
  check('E发布跨城包邮玩具(120分=户外基准100×全新系数1.2)', r.code === 0 && r.data.points === 120 && r.data.isFreeShipping === true, r);
  const toyE = r.data.id;

  r = await call(toy, 'openid-F', 'create', {
    title: '积分测试-跨城不包邮玩具', description: '测试', category: 'early_education', ageRange: '2-5',
    conditionLevel: '8new', hasSmallParts: false,
    images: ['cloud://l/7.jpg', 'cloud://l/8.jpg', 'cloud://l/9.jpg'],
  });
  check('F发布跨城不包邮玩具(56分=早教基准70×8新系数0.8)', r.code === 0 && r.data.points === 56, r);
  const toyF = r.data.id;

  r = await call(swap, 'openid-C', 'redeemWithPoints', { toyId: toyD });
  check('积分余额为0时兑换被拒(409)', r.code === 409, r);

  // 模拟 C 已通过换出其他玩具累积了积分（真实场景由"换出玩具得分"链路产生，此处直接注入用于测试兑换链路）。
  // 注意：上一步失败的兑换请求已触发 ensureAccount 自动建档（余额0），此处须更新该已存在记录，
  // 不能再 push 一条新记录——否则同 _openid 命中数组首个旧记录（余额仍为0），而非新注入的余额。
  const existingAccC = store2.col('points_accounts').find((a) => a._openid === 'openid-C');
  if (existingAccC) existingAccC.balance = 1000;
  else store2.col('points_accounts').push({ _id: 'acc-C', _openid: 'openid-C', balance: 1000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  r = await call(swap, 'openid-C', 'redeemWithPoints', { toyId: toyD });
  check('C兑换同城玩具成功且判定shippingPayer=none', r.code === 0 && r.data.exchangeType === 'points_redeem' && r.data.isSameCity === true && r.data.shippingPayer === 'none', r);
  const swapCD = r.data.id;

  r = await call(pointsFn, 'openid-C', 'getBalance', {});
  check('C积分扣减为920(1000-80)', r.data.balance === 920, r);
  r = await call(pointsFn, 'openid-D', 'getBalance', {});
  check('D积分入账为80', r.data.balance === 80, r);
  r = await call(toy, 'openid-C', 'detail', { id: toyD });
  check('被兑换玩具转swapping', r.data.status === 'swapping', r);

  r = await call(swap, 'openid-C', 'payFee', { id: swapCD });
  check('积分兑换订单拒绝支付服务费(400)', r.code === 400, r);

  r = await call(swap, 'openid-C', 'confirmPickup', { id: swapCD });
  check('同城自提确认成功', r.code === 0 && r.data.status === 'received', r);
  r = await call(toy, 'openid-C', 'detail', { id: toyD });
  check('自提后玩具转exchanged', r.data.status === 'exchanged', r);

  r = await call(swap, 'openid-C', 'redeemWithPoints', { toyId: toyE });
  check('C兑换跨城包邮玩具成功且shippingPayer=publisher', r.code === 0 && r.data.isSameCity === false && r.data.shippingPayer === 'publisher', r);
  const swapCE = r.data.id;
  r = await call(swap, 'openid-E', 'ship', { id: swapCE, trackingNo: 'SF2000000001' });
  check('发布方登记运单后转shipping', r.code === 0 && r.data.status === 'shipping' && r.data.targetTrackingNo === 'SF2000000001', r);
  r = await call(swap, 'openid-C', 'confirmReceipt', { id: swapCE });
  check('兑换方确认收货后转received', r.code === 0 && r.data.status === 'received', r);

  r = await call(swap, 'openid-C', 'redeemWithPoints', { toyId: toyF });
  check('C兑换跨城不包邮玩具成功且shippingPayer=redeemer(默认兑换方付运费)', r.code === 0 && r.data.isSameCity === false && r.data.shippingPayer === 'redeemer', r);
  const swapCF = r.data.id;
  r = await call(pointsFn, 'openid-C', 'getBalance', {});
  check('C积分扣减为744(920-120-56)', r.data.balance === 744, r);

  r = await call(swap, 'openid-C', 'cancel', { id: swapCF });
  check('取消积分兑换订单', r.code === 0 && r.data.status === 'cancelled', r);
  r = await call(pointsFn, 'openid-C', 'getBalance', {});
  check('取消后C积分退回800(744+56)', r.data.balance === 800, r);
  r = await call(pointsFn, 'openid-F', 'getBalance', {});
  check('取消后F积分冲正为0', r.data.balance === 0, r);
  r = await call(toy, 'openid-C', 'detail', { id: toyF });
  check('取消后玩具回available', r.data.status === 'available', r);

  r = await call(pointsFn, 'openid-C', 'previewValuation', { category: 'building_blocks', conditionLevel: 'new' });
  check('估值预览区间合理(min<=suggested<=max)', r.code === 0 && r.data.min > 0 && r.data.suggested >= r.data.min && r.data.suggested <= r.data.max, r);

  r = await call(toy, 'openid-D', 'create', {
    title: '积分测试-运费预览玩具', category: 'plush_fabric', ageRange: '0-6', conditionLevel: 'used',
    images: ['cloud://l/10.jpg', 'cloud://l/11.jpg', 'cloud://l/12.jpg'],
  });
  const toyD2 = r.data.id;
  r = await call(pointsFn, 'openid-C', 'previewShipping', { toyId: toyD2 });
  check('同城运费预览sameCity=true,payer=none', r.code === 0 && r.data.sameCity === true && r.data.shippingPayer === 'none', r);
  r = await call(pointsFn, 'openid-F', 'previewShipping', { toyId: toyD2 });
  check('跨城未包邮运费预览sameCity=false,payer=redeemer', r.code === 0 && r.data.sameCity === false && r.data.shippingPayer === 'redeemer', r);

  console.log('===== M. 云存储 ACL 兜底：fileID → 签名链接（_shared/storage.js） =====');
  // 背景：当前环境免费体验期内云存储 ACL 锁死在 PRIVATE（仅创建者可读写），
  // 他人上传的图片走公开 CDN 地址实测返回 403，发现页对非创建者即破图。
  // 云函数持管理员权限，用 getTempFileURL 签发临时链接绕开 ACL。本段验证：
  // ①成功的 fileID 被替换为签名 https 链接 ②非 cloud:// 值原样保留
  // ③换取失败的 fileID 回退为原值（不能让一个坏文件毁掉整条列表）
  r = await call(toy, 'openid-D', 'create', {
    title: '图片URL兜底测试', category: 'plush_fabric', ageRange: '0-6', conditionLevel: '9new',
    images: ['cloud://m/ok1.jpg', 'https://example.com/keep.jpg', 'cloud://m/missing3.jpg'],
  });
  const toyM = r.data.id;
  check('create 成功文件已转为签名链接', /^https:\/\/mock-cdn\.test\//.test(r.data.images[0]), r.data.images);
  check('签名链接带 sign 签名参数', /[?&]sign=/.test(r.data.images[0]), r.data.images[0]);
  check('非 cloud:// 值原样保留', r.data.images[1] === 'https://example.com/keep.jpg', r.data.images);
  check('换取失败的文件回退为原始 fileID', r.data.images[2] === 'cloud://m/missing3.jpg', r.data.images);

  r = await call(toy, 'openid-C', 'detail', { id: toyM });
  check('detail 图片已转签名链接(非创建者视角)', /^https:\/\/mock-cdn\.test\//.test(r.data.images[0]), r.data.images);

  r = await call(toy, 'openid-C', 'list', { keyword: '图片URL兜底测试' });
  check('list 图片已转签名链接', r.data.items.length > 0 && /^https:\/\/mock-cdn\.test\//.test(r.data.items[0].images[0]), r.data.items.map((t) => t.images));

  r = await call(toy, 'openid-D', 'mine', {});
  const mineM = (r.data.items || []).find((t) => t.id === toyM);
  check('mine 图片已转签名链接', !!mineM && /^https:\/\/mock-cdn\.test\//.test(mineM.images[0]), mineM && mineM.images);

  r = await call(swap, 'openid-C', 'redeemWithPoints', { toyId: toyM });
  check('兑换该玩具成功(用于验证订单详情图片)', r.code === 0, r);
  const swapM = r.data.id;
  r = await call(swap, 'openid-C', 'detail', { id: swapM });
  check('swap.detail 对方玩具图片已转签名链接', r.code === 0 && !!r.data.targetToy && /^https:\/\/mock-cdn\.test\//.test(r.data.targetToy.images[0]), r.data.targetToy && r.data.targetToy.images);
  check('swap.detail 换取失败文件回退为原始 fileID', r.data.targetToy.images[2] === 'cloud://m/missing3.jpg', r.data.targetToy.images);
  check('swap.detail myToy 为 null(积分兑换无需回换玩具)', r.data.myToy === null, r.data.myToy);

  // 他人头像同样要走签名链接（发现页卡片/详情页要展示作者头像，ACL 锁 PRIVATE 时 fileID 直连 403）。
  // 注意 updateProfile 的昵称是必填参数，更新头像时必须一并带上。
  // 另外此处用 detail 而非 list：toyM 已被兑换，list 只返回 available，查不到它。
  await call(auth, 'openid-D', 'updateProfile', { name: 'D 家长', avatarUrl: 'cloud://mock-env/avatars/openid-D/ok.png' });
  r = await call(toy, 'openid-C', 'detail', { id: toyM });
  check('detail 中他人头像已转签名链接',
    r.code === 0 && !!r.data.owner && /^https:\/\/mock-cdn\.test\//.test(r.data.owner.avatarUrl), r.data && r.data.owner);

  await call(auth, 'openid-D', 'updateProfile', { name: 'D 家长', avatarUrl: 'cloud://mock-env/avatars/openid-D/missing.png' });
  r = await call(toy, 'openid-C', 'detail', { id: toyM });
  check('他人头像换取失败时回退为原始 fileID',
    r.code === 0 && r.data.owner.avatarUrl === 'cloud://mock-env/avatars/openid-D/missing.png', r.data && r.data.owner);

  await call(auth, 'openid-D', 'updateProfile', { name: 'D 家长', avatarUrl: '' });
  r = await call(toy, 'openid-C', 'detail', { id: toyM });
  check('未设头像时 owner.avatarUrl 为 null（前端走默认头像）',
    r.code === 0 && r.data.owner.avatarUrl === null, r.data && r.data.owner);

  // 反证：本人资料接口的顶层 avatarUrl 不能被换成签名链接（否则会被原样回传给 updateProfile 落库）。
  // getProfile 返回 { user } 包一层，别的接口（toy.detail 等）是扁平结构。
  await call(auth, 'openid-D', 'updateProfile', { name: 'D 家长', avatarUrl: 'cloud://mock-env/avatars/openid-D/self.png' });
  r = await call(user, 'openid-D', 'getProfile', {});
  check('本人资料顶层 avatarUrl 保持原始 fileID（不被签名链接污染）',
    r.code === 0 && !!r.data.user && r.data.user.avatarUrl === 'cloud://mock-env/avatars/openid-D/self.png',
    r.data && r.data.user && r.data.user.avatarUrl);

  console.log('===== N. 详情页 isMine 与服务端「不能兑换自己的玩具」兜底 =====');
  // 背景：玩具详情页要用服务端下发的 isMine 决定「用积分兑换 / 发起一换一」按钮的可用性。
  // 前端拿不到 openid，只能由 toy.detail 基于 cloud.getWXContext().OPENID 计算，因此这里锁死服务端口径：
  // 本人看自己的玩具 isMine=true，他人看同一件玩具 isMine=false。
  // 注意实际结构：toy.detail 的 data 就是玩具对象本身（如既有用例的 r.data.wanted），故取 r.data.isMine。
  r = await call(toy, 'openid-A', 'detail', { id: toyA });
  check('toy.detail 传发布者本人 → isMine=true', r.code === 0 && r.data.isMine === true, r.data && r.data.isMine);
  r = await call(toy, 'openid-C', 'detail', { id: toyA });
  check('toy.detail 传他人 → isMine=false', r.code === 0 && r.data.isMine === false, r.data && r.data.isMine);

  // 兑换预览的服务端兜底：自己的玩具必然 400，前端 isMine 分支据此给出正确文案（而非静默）。
  r = await call(pointsFn, 'openid-A', 'previewShipping', { toyId: toyA });
  check('previewShipping 传自己的玩具 → 400 且提示「自己发布的玩具」',
    r.code === 400 && /自己发布的玩具/.test(r.message || ''), r);

  console.log('===== O. 举报 / 拉黑 / 他人主页（社交与安全） =====');
  const storeO = mockSdk.getStore();
  const userB = storeO.col('users').find((u) => u._openid === 'openid-B');
  const userA = storeO.col('users').find((u) => u._openid === 'openid-A');
  const userBId = userB._id; // users._id（**不是** openid）
  const userAId = userA._id;

  // owner.id 必须是 users._id（他人主页的路由参数来源），不能是 openid（敏感标识不下发）
  r = await call(toy, 'openid-A', 'detail', { id: toyB3 });
  check('toy.detail 的 owner.id 是 users._id 而非 openid',
    r.code === 0 && !!r.data.owner && r.data.owner.id === userBId && r.data.owner.id !== 'openid-B',
    r.data && r.data.owner);

  // ---- 举报玩具 ----
  r = await call(user, 'openid-A', 'createReport', { targetType: 'toy', targetId: toyB3, reason: 'fake', description: '信息不实' });
  check('举报玩具成功（status=pending）', r.code === 0 && r.data && r.data.status === 'pending' && r.data.targetType === 'toy', r);
  const toyReports = storeO.col('reports').filter((x) => x.targetType === 'toy' && x.targetId === toyB3);
  check('reports 落库且显式写入 _openid（云函数侧 add 不自动注入）',
    toyReports.length === 1 && toyReports[0]._openid === 'openid-A', toyReports);

  r = await call(user, 'openid-A', 'createReport', { targetType: 'toy', targetId: toyB3, reason: 'fraud' });
  check('重复举报同一目标幂等（不重复插入、给出提示）',
    r.code === 0 && /举报过/.test(r.message || '')
      && storeO.col('reports').filter((x) => x.targetType === 'toy' && x.targetId === toyB3).length === 1, r);

  r = await call(user, 'openid-A', 'createReport', { targetType: 'toy', targetId: toyA, reason: 'fake' });
  check('不能举报自己发布的玩具（400）', r.code === 400, r);
  r = await call(user, 'openid-A', 'createReport', { targetType: 'toy', targetId: toyB3, reason: 'not_a_reason' });
  check('非法举报原因被拒（400）', r.code === 400, r);
  r = await call(user, 'openid-A', 'createReport', { targetType: 'alien', targetId: toyB3, reason: 'fake' });
  check('非法 targetType 被拒（400）', r.code === 400, r);
  r = await call(user, 'openid-A', 'createReport', { targetType: 'toy', targetId: 'not-exist-toy', reason: 'fake' });
  check('举报不存在的玩具返回 404', r.code === 404, r);

  // ---- 举报用户（targetId = users._id）----
  r = await call(user, 'openid-A', 'createReport', { targetType: 'user', targetId: userBId, reason: 'inappropriate', description: '言语不当' });
  check('举报用户成功', r.code === 0 && r.data && r.data.targetType === 'user', r);
  r = await call(user, 'openid-A', 'createReport', { targetType: 'user', targetId: userAId, reason: 'other' });
  check('不能举报自己（400）', r.code === 400, r);
  r = await call(user, 'openid-A', 'createReport', { targetType: 'user', targetId: 'not-exist-user-id', reason: 'other' });
  check('举报不存在的用户返回 404', r.code === 404, r);

  // ---- 拉黑前：A 能搜到 B 的玩具 ----
  r = await call(toy, 'openid-A', 'list', { keyword: 'B取消测试' });
  check('拉黑前 A 能看到 B 的玩具',
    r.code === 0 && (r.data.items || []).some((t) => t.ownerId === 'openid-B'), r.data);

  // ---- 拉黑 ----
  r = await call(user, 'openid-A', 'block', { userId: userBId });
  check('拉黑成功', r.code === 0, r);
  const blockRows = storeO.col('blocks').filter((x) => x._openid === 'openid-A');
  check('blocks 落库且 blockedOpenid 是 openid（供发现页过滤）',
    blockRows.length === 1 && blockRows[0].blockedOpenid === 'openid-B', blockRows);

  r = await call(user, 'openid-A', 'block', { userId: userBId });
  check('重复拉黑幂等（不重复插入）',
    r.code === 0 && /黑名单/.test(r.message || '')
      && storeO.col('blocks').filter((x) => x._openid === 'openid-A').length === 1, r);

  r = await call(user, 'openid-A', 'block', { userId: userAId });
  check('不能拉黑自己（400）', r.code === 400, r);

  // ---- 拉黑后：发现页过滤生效（本次关键点）----
  r = await call(toy, 'openid-A', 'list', { keyword: 'B取消测试' });
  const afterBlock = (r.data && r.data.items) || [];
  check('拉黑后 A 的发现页不再出现 B 的玩具',
    r.code === 0 && !afterBlock.some((t) => t.ownerId === 'openid-B'), afterBlock.map((t) => t.ownerId));
  // total 与过滤自洽：关键词「B取消测试」只有 B 有；过滤后应为 0（从实时数据推导，不写死无关数字）
  const expectedTotal = storeO.col('toys')
    .filter((t) => t.status === 'available' && t._openid !== 'openid-B' && /B取消测试/.test(t.title || '')).length;
  check('拉黑后 total 与过滤后的可见条目自洽',
    r.code === 0 && r.data.total === expectedTotal, { total: r.data && r.data.total, expectedTotal });

  // ---- 故障路径：blocks 集合漏建（真机 -502005）→ 发现页降级为不过滤，仍 200 ----
  mockSdk.failCollection('blocks', true);
  r = await call(toy, 'openid-A', 'list', { keyword: 'B取消测试' });
  mockSdk.failCollection('blocks', false);
  check('blocks 集合缺失时 list 不 500（降级为不过滤）',
    r.code === 0 && (r.data.items || []).some((t) => t.ownerId === 'openid-B'), r);

  // ---- 黑名单列表 ----
  r = await call(user, 'openid-A', 'listBlocks', {});
  check('listBlocks 返回已拉黑的用户（id=users._id）',
    r.code === 0 && (r.data.items || []).some((i) => i.id === userBId), r.data);
  check('listBlocks 不泄露 openid',
    r.code === 0 && (r.data.items || []).every((i) => i._openid === undefined), r.data);

  // ---- 他人主页 ----
  r = await call(user, 'openid-A', 'getPublicProfile', { userId: userBId });
  check('getPublicProfile 返回用户公开资料', r.code === 0 && !!r.data.user && r.data.user.name === userB.name, r.data && r.data.user);
  check('他人主页 isSelf=false', r.code === 0 && r.data.user.isSelf === false, r.data && r.data.user && r.data.user.isSelf);
  check('他人主页不泄露 phone', r.code === 0 && r.data.user.phone === undefined, r.data && r.data.user);
  check('他人主页不泄露 _openid / 证件哈希',
    r.code === 0 && r.data.user._openid === undefined && r.data.user.idCardHash === undefined, r.data && r.data.user);
  check('他人主页标记我已拉黑 TA', r.code === 0 && r.data.user.blocked === true, r.data && r.data.user && r.data.user.blocked);
  const bAvailable = storeO.col('toys').filter((t) => t._openid === 'openid-B' && t.status === 'available');
  check('他人主页在架玩具均为该用户且状态 available',
    r.code === 0 && r.data.toys.every((t) => t.ownerId === 'openid-B' && t.status === 'available')
      && r.data.toys.length === bAvailable.length,
    { got: r.data.toys.length, bAvailable: bAvailable.length });
  check('他人主页在架玩具带 owner.id=users._id（卡片可再点进主页）',
    r.code === 0 && r.data.toys.every((t) => t.owner && t.owner.id === userBId),
    r.code === 0 ? r.data.toys.map((t) => t.owner && t.owner.id) : r);
  const bReviews = storeO.col('reviews').filter((x) => x.revieweeOpenid === 'openid-B');
  check('他人主页返回收到的评价（条数与实时 reviews 一致）',
    r.code === 0 && r.data.reviewTotal === bReviews.length && r.data.reviews.length === bReviews.length,
    { got: r.data.reviewTotal, bReviews: bReviews.length });
  check('他人主页评价带均分',
    r.code === 0 && (bReviews.length === 0 ? r.data.avgRating === null : typeof r.data.avgRating === 'number'),
    r.data && r.data.avgRating);

  // 看自己主页
  r = await call(user, 'openid-A', 'getPublicProfile', { userId: userAId });
  check('getPublicProfile 看自己 isSelf=true', r.code === 0 && r.data.user.isSelf === true, r.data && r.data.user && r.data.user.isSelf);

  // 入参错误
  r = await call(user, 'openid-A', 'getPublicProfile', {});
  check('缺少 userId 返回 400', r.code === 400, r);
  r = await call(user, 'openid-A', 'getPublicProfile', { userId: 'not-exist-user-id' });
  check('不存在的用户返回 404', r.code === 404, r);

  // ---- 取消拉黑后恢复 ----
  r = await call(user, 'openid-A', 'unblock', { userId: userBId });
  check('取消拉黑成功', r.code === 0, r);
  check('blocks 记录已删除', storeO.col('blocks').filter((x) => x._openid === 'openid-A').length === 0, storeO.col('blocks'));
  r = await call(toy, 'openid-A', 'list', { keyword: 'B取消测试' });
  check('取消拉黑后 B 的玩具重新可见',
    r.code === 0 && (r.data.items || []).some((t) => t.ownerId === 'openid-B'), r.data);

  console.log('===== P. 意见反馈（user.createFeedback） =====');
  const storeP = mockSdk.getStore();

  // 正常提交（含选填的联系方式与图片）
  r = await call(user, 'openid-A', 'createFeedback', {
    type: 'suggestion', description: '希望增加按城市筛选玩具', contact: 'a@example.com',
    images: ['cloud://f/1.jpg', 'cloud://f/2.jpg'],
  });
  check('提交反馈成功（status=pending）',
    r.code === 0 && r.data && r.data.status === 'pending' && r.data.type === 'suggestion', r);
  check('反馈落库且显式写入 _openid（云函数侧 add 不自动注入）',
    storeP.col('feedbacks').length === 1 && storeP.col('feedbacks')[0]._openid === 'openid-A',
    storeP.col('feedbacks'));
  check('反馈回执带 description / contact / images',
    r.code === 0 && r.data.description === '希望增加按城市筛选玩具'
      && r.data.contact === 'a@example.com' && Array.isArray(r.data.images) && r.data.images.length === 2, r.data);

  // 选填字段缺省：contact 归一为 ''、images 归一为 []
  r = await call(user, 'openid-A', 'createFeedback', { type: 'other', description: '只填了必填项' });
  check('选填字段缺省时 contact 为空串且 images 为空数组',
    r.code === 0 && r.data.contact === '' && Array.isArray(r.data.images) && r.data.images.length === 0, r.data);

  // 校验类分支（服务端为唯一真相源，前端拦截只是体验优化）
  r = await call(user, 'openid-A', 'createFeedback', { type: 'suggestion', description: '   ' });
  check('空白描述被拒（400）', r.code === 400 && /描述/.test(r.message || ''), r);
  r = await call(user, 'openid-A', 'createFeedback', { type: 'not_a_type', description: 'x' });
  check('非法反馈类型被拒（400）', r.code === 400 && /类型/.test(r.message || ''), r);
  r = await call(user, 'openid-A', 'createFeedback', { type: 'suggestion', description: 'x'.repeat(501) });
  check('描述超 500 字被拒（400）', r.code === 400, r);
  r = await call(user, 'openid-A', 'createFeedback', { type: 'suggestion', description: 'x', contact: 'x'.repeat(101) });
  check('联系方式超 100 字被拒（400）', r.code === 400, r);
  r = await call(user, 'openid-A', 'createFeedback', {
    type: 'suggestion', description: 'x',
    images: ['cloud://f/1.jpg', 'cloud://f/2.jpg', 'cloud://f/3.jpg', 'cloud://f/4.jpg'],
  });
  check('图片超过 3 张被拒（400）', r.code === 400, r);

  // 校验失败不应落库（仅上面 2 条合法反馈）
  check('校验失败不产生脏数据（feedbacks 仍为 2 条）', storeP.col('feedbacks').length === 2, storeP.col('feedbacks').length);

  console.log('===== Q. 站内消息中心（notifications 集合 + notify 云函数 + swap 写消息） =====');
  const storeQ = mockSdk.getStore();
  // 未读数一律从实时 store 推导（禁止写死绝对值，避免数据漂移误报）
  const unreadOf = (openid) => storeQ.col('notifications').filter((n) => n._openid === openid && !n.read).length;
  const notifOf = (openid) => storeQ.col('notifications').filter((n) => n._openid === openid);

  // 造 2 件 A 的 + 2 件 B 的可用玩具（各 3 图满足发布校验）
  const mkToy = (openid, title, imgs) => call(toy, openid, 'create', {
    title, category: 'building_blocks', ageRange: '3-6', conditionLevel: 'new', images: imgs,
  });
  r = await mkToy('openid-A', 'Q消息A玩具1', ['cloud://q/a1.jpg', 'cloud://q/a2.jpg', 'cloud://q/a3.jpg']);
  check('Q: A 造玩具1成功', r.code === 0, r);
  const qToyA = r.data.id;
  r = await mkToy('openid-A', 'Q消息A玩具2', ['cloud://q/a4.jpg', 'cloud://q/a5.jpg', 'cloud://q/a6.jpg']);
  const qToyA2 = r.data.id;
  r = await mkToy('openid-B', 'Q消息B玩具1', ['cloud://q/b1.jpg', 'cloud://q/b2.jpg', 'cloud://q/b3.jpg']);
  check('Q: B 造玩具1成功', r.code === 0, r);
  const qToyB = r.data.id;
  r = await mkToy('openid-B', 'Q消息B玩具2', ['cloud://q/b4.jpg', 'cloud://q/b5.jpg', 'cloud://q/b6.jpg']);
  const qToyB2 = r.data.id;

  // ---- 写入：A 发起交换 → B 收到 1 条未读 swap_request ----
  const beforeB = unreadOf('openid-B');
  r = await call(swap, 'openid-A', 'create', { targetToyId: qToyB, myToyId: qToyA, message: 'Q消息测试' });
  check('Q: 发起交换成功', r.code === 0 && r.data.status === 'requested', r);
  const qSwapId = r.data.id;
  check('Q: 被交换方未读数恰好 +1（站内消息已写入）',
    unreadOf('openid-B') === beforeB + 1, { before: beforeB, after: unreadOf('openid-B') });
  const qNewest = notifOf('openid-B').filter((n) => n.targetId === qSwapId)[0];
  check('Q: 该消息 type=swap_request / read=false / 归属 B / targetType=swap',
    !!qNewest && qNewest.type === 'swap_request' && qNewest.read === false
      && qNewest._openid === 'openid-B' && qNewest.targetType === 'swap', qNewest);
  check('Q: 消息带标题与内容（非空）',
    !!qNewest && !!qNewest.title && !!qNewest.content, qNewest);

  // ---- list：未读数与实时一致 + 跨用户隔离 ----
  r = await call(notify, 'openid-B', 'list', {});
  check('Q: B list 返回 items 数组', r.code === 0 && Array.isArray(r.data.items), r);
  check('Q: list 未读数与实时统计一致',
    r.code === 0 && r.data.unreadCount === unreadOf('openid-B'),
    { got: r.code === 0 ? r.data.unreadCount : null, live: unreadOf('openid-B') });
  check('Q: list 包含刚写入的消息', r.code === 0 && r.data.items.some((n) => n.targetId === qSwapId),
    r.code === 0 ? r.data.items.map((n) => n.id) : r);
  check('Q: list item 形状完整（id/type/title/content/targetType/targetId/read/createdAt）',
    r.code === 0 && r.data.items.length > 0 && r.data.items.every((n) =>
      'id' in n && 'type' in n && 'title' in n && 'content' in n
      && 'targetType' in n && 'targetId' in n && typeof n.read === 'boolean' && 'createdAt' in n),
    r.code === 0 ? r.data.items[0] : r);
  r = await call(notify, 'openid-C', 'list', {});
  check('Q: 跨用户隔离（C 拉不到 B 的那条消息）',
    r.code === 0 && !r.data.items.some((n) => n.targetId === qSwapId),
    r.code === 0 ? r.data.items.map((n) => n.targetId) : r);

  // ---- markRead：单条已读 + 幂等 + 缺参 400 ----
  const beforeRead = unreadOf('openid-B');
  r = await call(notify, 'openid-B', 'markRead', { id: qNewest._id });
  check('Q: 单条已读后未读数 -1',
    r.code === 0 && r.data.unreadCount === beforeRead - 1,
    { got: r.code === 0 ? r.data.unreadCount : null, before: beforeRead });
  r = await call(notify, 'openid-B', 'markRead', { id: qNewest._id });
  check('Q: 重复 markRead 幂等（未读数不再下降）',
    r.code === 0 && r.data.unreadCount === beforeRead - 1,
    r.code === 0 ? r.data.unreadCount : r);
  check('Q: 已读后 store 中该条 read=true',
    notifOf('openid-B').find((n) => n._id === qNewest._id).read === true, null);
  r = await call(notify, 'openid-B', 'markRead', {});
  check('Q: markRead 缺 id 返回 400', r.code === 400, r);

  // ---- markAllRead ----
  r = await call(notify, 'openid-B', 'markAllRead', {});
  check('Q: 全部已读后未读数归零（响应与实时双确认）',
    r.code === 0 && r.data.unreadCount === 0 && unreadOf('openid-B') === 0,
    { got: r.code === 0 ? r.data.unreadCount : null, live: unreadOf('openid-B') });

  // ---- 读侧降级：notifications 集合缺失时 list 不 500 ----
  mockSdk.failCollection('notifications', true);
  r = await call(notify, 'openid-B', 'list', {});
  mockSdk.failCollection('notifications', false);
  check('Q: 集合缺失时 list 降级为空列表（code=0）',
    r.code === 0 && r.data.items.length === 0 && r.data.unreadCount === 0, r);

  // ---- 核心：通知写入失败不影响主流程 ----
  const beforeFailA = notifOf('openid-A').length;
  mockSdk.failCollection('notifications', true);
  r = await call(swap, 'openid-B', 'respond', { id: qSwapId, accept: true });
  mockSdk.failCollection('notifications', false);
  check('Q: notifications 写失败时 respond 仍成功且状态流转到 accepted（通知不阻断主流程）',
    r.code === 0 && r.data.status === 'accepted',
    { code: r.code, status: r.code === 0 ? r.data.status : null });
  // 反向对照：确认「写失败」真的发生了（否则上面这条是空转），A 不应收到 swap_accepted
  check('Q: 反向对照——写失败期间 A 确实没收到 swap_accepted（证明降级路径被走到）',
    !notifOf('openid-A').some((n) => n.targetId === qSwapId && n.type === 'swap_accepted')
      && notifOf('openid-A').length === beforeFailA,
    { aCount: notifOf('openid-A').length, before: beforeFailA });

  // ---- 恢复后写入正常 ----
  const beforeRecover = unreadOf('openid-B');
  r = await call(swap, 'openid-A', 'create', { targetToyId: qToyB2, myToyId: qToyA2, message: 'Q恢复测试' });
  check('Q: 集合恢复后新发起交换成功', r.code === 0, r);
  check('Q: 恢复后未读数再次 +1（写入链路整体可用）',
    unreadOf('openid-B') === beforeRecover + 1, { before: beforeRecover, after: unreadOf('openid-B') });

  console.log('');
  console.log('========================================');
  console.log(`结果: PASS=${PASS} FAIL=${FAIL}`);
  console.log('========================================');
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('测试运行异常:', e);
  process.exit(1);
});
