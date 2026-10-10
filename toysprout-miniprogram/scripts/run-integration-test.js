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
  check('sendCode 返回固定验证码', r.data && r.data.code === '1234', r);
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
