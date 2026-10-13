// cloudfunctions/auth/index.js
// 认证云函数：openid 静默登录/建档 + 资料完善 + 验证码模拟发送（保留，供将来主体升级后使用）。
//
// 与 MVP Web 版差异：不再需要 JWT——云函数天然通过 cloud.getWXContext() 获得 openid，
// 前端小程序调用云函数无需携带任何鉴权 header。
//
// 【登录策略 · 2026-10-10 定稿】方案 A：登录只依赖 openid，手机号移出登录流程。
//   背景：本项目为「个人主体」，微信的「手机号快速验证」(openType=getPhoneNumber) 要求
//   非个人主体且已认证，个人主体无法调用。因此手机号不再作为登录前置条件，降级为
//   「收货地址里的收件联系方式」（见 cloudfunctions/user 的 addresses 相关 action）。
//   登录流程变为：小程序启动 → 静默调 auth.login → openid 即身份，无需任何用户交互；
//   交付物收货信息时再填写手机号。后续若主体升级为企业/个体工商户，可再接入手机号
//   快速验证（下方 handleLogin 已保留 phone+code 的完整建档分支，无需重写）。
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { ok, fail, BizError } = require('./response');
const { publicUser } = require('./publicUser');
const { sendVerificationCode, verifyCode } = require('./services/smsService');

const PHONE_RE = /^1[3-9]\d{9}$/;
const NAME_MAX_LEN = 20;

async function handleSendCode(data) {
  const phone = String(data.phone || '').trim();
  if (!PHONE_RE.test(phone)) throw new BizError(400, '手机号格式不正确');
  const result = await sendVerificationCode({ phone });
  // ⚠️ 绝不把验证码回传给调用方。
  // 当前是模拟实现（固定 1234）看起来无害，但「接口把验证码告诉你」这个行为一旦带上线，
  // 就等于任何客户端都能自助通过验证——等真接入短信网关那天，它会原地变成账号接管漏洞，
  // 而那时没人会记得回来删这一行。开发期要看码请查后端日志（下一行已打），不要走响应体。
  console.log('[auth] sendCode 开发态验证码 phone=%s code=%s', phone, result.code);
  return { devOnly: result.mock, expiresIn: result.expiresIn };
}

// 登录 / 建档。两种调用形态：
//   1) 无参（静默登录，主路径）：openid 即身份。已建档直接返回；未建档建一条空资料记录
//      （name 为空串），由前端在「我的」页引导用户去「完善资料」补昵称头像。
//   2) 带 phone+code+name（兼容路径）：保留给旧调用方与将来接入手机号快速验证时使用，
//      校验通过后按完整资料建档。已建档用户传 phone+code 则走手机号换绑分支。
async function handleLogin(data, openid) {
  const usersCol = db.collection('users');
  const existing = await usersCol.where({ _openid: openid }).get();
  let userDoc = existing.data[0];

  if (!userDoc) {
    const phone = String(data.phone || '').trim();
    let profile;
    if (phone) {
      // 路径 2：完整建档（要求手机号 + 验证码 + 昵称）
      const code = String(data.code || '').trim();
      const name = String(data.name || '').trim();
      if (!PHONE_RE.test(phone)) throw new BizError(400, '请填写正确的手机号');
      const codeOk = await verifyCode({ phone, code });
      if (!codeOk) throw new BizError(400, '验证码错误');
      if (!name) throw new BizError(400, '请填写昵称');
      profile = { phone, name };
    } else {
      // 路径 1：静默建档。昵称留空 → publicUser 里 profileCompleted 为 false。
      profile = { phone: null, name: '' };
    }

    const now = db.serverDate();
    const addResult = await usersCol.add({
      data: {
        // ⚠️ 云函数侧 add() 不会自动注入 _openid（只有小程序端 SDK 才会），必须显式写入。
        // 否则 where({ _openid: openid }) 永远查不到该用户 → 登录后所有接口 401，且每次登录重复建档。
        _openid: openid,
        ...profile,
        avatarUrl: null,
        idCardHash: null,
        idCardMasked: null,
        isVerified: false,
        creditScore: 500,
        isMember: false,
        memberExpiresAt: null,
        city: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    // 补一条信用分基线日志，便于信用分明细页追溯（沿用 MVP 版约定）
    await db.collection('credit_logs').add({
      data: { userOpenid: openid, delta: 0, reason: '新用户注册', relatedSwapId: null, createdAt: now },
    });
    const fresh = await usersCol.doc(addResult._id).get();
    userDoc = fresh.data;
  } else if (data.phone && data.code) {
    // 已有账号但传了新手机号+验证码：允许更新手机号（换绑场景）
    const phone = String(data.phone).trim();
    const code = String(data.code).trim();
    if (!PHONE_RE.test(phone)) throw new BizError(400, '手机号格式不正确');
    const codeOk = await verifyCode({ phone, code });
    if (!codeOk) throw new BizError(400, '验证码错误');
    await usersCol.doc(userDoc._id).update({ data: { phone, updatedAt: db.serverDate() } });
    userDoc.phone = phone;
  }

  return { user: publicUser(userDoc) };
}

// 完善 / 修改资料：昵称必填，头像可选。
// 头像只接受云存储 fileID（cloud:// 开头）——chooseAvatar 给出的是本地临时路径，
// 小程序端需先 wx.cloud.uploadFile 换成 fileID 再传上来；临时路径与任意外链都会过期或不可控，
// 一旦落库就会表现为「头像突然变成破图」，因此在服务端兜底拒绝。
async function handleUpdateProfile(data, openid) {
  const usersCol = db.collection('users');
  const existing = await usersCol.where({ _openid: openid }).get();
  const userDoc = existing.data[0];
  // 走到这里通常不会发生：静默登录已在启动时建好档案。保留 401 以便前端兜底重登。
  if (!userDoc) throw new BizError(401, '账号不存在，请重新进入小程序');

  const name = String(data.name || '').trim();
  if (!name) throw new BizError(400, '请填写昵称');
  if (name.length > NAME_MAX_LEN) throw new BizError(400, `昵称最多 ${NAME_MAX_LEN} 个字符`);

  const patch = { name, updatedAt: db.serverDate() };
  // avatarUrl 未传（undefined）= 不改动头像；传空串 = 清空头像
  if (data.avatarUrl !== undefined) {
    const avatarUrl = String(data.avatarUrl || '').trim();
    if (avatarUrl && avatarUrl.indexOf('cloud://') !== 0) throw new BizError(400, '头像地址不合法');
    patch.avatarUrl = avatarUrl || null;
  }

  await usersCol.doc(userDoc._id).update({ data: patch });
  const fresh = await usersCol.doc(userDoc._id).get();
  return { user: publicUser(fresh.data) };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  try {
    switch (event.action) {
      case 'sendCode':
        return ok(await handleSendCode(event));
      case 'login':
        return ok(await handleLogin(event, openid));
      case 'updateProfile':
        return ok(await handleUpdateProfile(event, openid), '资料已保存');
      default:
        return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[auth] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
