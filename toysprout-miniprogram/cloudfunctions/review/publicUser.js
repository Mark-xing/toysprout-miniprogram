// cloudfunctions/_shared/publicUser.js
// 用户对外返回体的唯一构造入口。
//
// 为什么抽到 _shared：
//   auth（登录/建档/改资料）与 user（getProfile / verify）都要返回用户对象。
//   此前 user/index.js 自己写了一份，auth 直接返回数据库原始文档，两份形状不一致
//   （auth 会漏掉 creditLevel / isMember 等派生字段，前端得自己算）。抽成一份后
//   「用户长什么样」只有一处定义，改字段不会再漏改另一边。
//
// 注意：本文件是源码，各云函数目录下的同名文件是 scripts/sync-shared.js 的构建产物，
// 请勿直接修改产物，改完本文件后重跑 sync-shared.js。
'use strict';

const { deriveCreditLevel } = require('./credit');
const { BizError } = require('./response');

// 把数据库 users 文档转成可下发给客户端的形状。
// 刻意不下发：_openid（客户端无需要）、idCardHash（敏感哈希）、idCardMasked 之外的证件信息。
function publicUser(u) {
  if (!u) return null;
  const isMemberActive = !!u.isMember && !!u.memberExpiresAt && new Date(u.memberExpiresAt) > new Date();
  return {
    // ⚠️ id 是数据库 users 文档的主键 `_id`，**不是** openid。两者都是长十六进制串，
    // 形状相似、肉眼极易混淆（这里真实发生过一次混淆事故：有人误以为 userInfo.id 就是
    // openid，写进了项目档案和记忆文件）。
    // 例：users 文档 _id='aeb30c436ac9a62f0007d87741086bab'，
    //     而它对应的 _openid='ohav85CnID4kBNChnkEgNKmEcgrA'。
    // 全项目通用的身份键是 **openid**（toy.ownerId、swap.targetOpenid 存的都是 openid）。
    // 因此：需要判断「是不是自己的」时，不要拿这里的 id 去和 ownerId 比对；
    // 应改用服务端下发的 isMine（见 cloudfunctions/toy/index.js 的 publicToy）。
    id: u._id,
    phone: u.phone || null,
    name: u.name || '',
    // 头像以云存储 fileID（cloud://...）形式存储，小程序 <image> 组件可直接渲染自己的文件
    avatarUrl: u.avatarUrl || null,
    // profileCompleted：昵称是否已填写。前端据此决定要不要把用户引导到「完善资料」页。
    // 静默登录建档时昵称为空串，所以新用户首次进入一定是 false。
    profileCompleted: !!u.name,
    isVerified: !!u.isVerified,
    creditScore: u.creditScore,
    creditLevel: deriveCreditLevel(u.creditScore),
    isMember: isMemberActive,
    memberExpiresAt: u.memberExpiresAt || null,
    city: u.city || null,
    createdAt: u.createdAt,
  };
}

// 「需要对外可见身份」的写操作（发布玩具、发起交换/积分兑换）前置校验：昵称必须已设置。
//
// 为什么必须放在服务端：静默登录建档时昵称为空串，此时用户对外是个"无名氏"。
// 若只在前端拦截，绕开页面直接调云函数就能落库一条 owner.name 为空的玩具，
// 在发现页/详情页表现为「发布者：（空白）」。所以前端拦截只是体验优化，这里才是真正的闸门。
function assertProfileCompleted(user) {
  if (!user) throw new BizError(401, '请重新进入小程序');
  if (!user.name) throw new BizError(400, '请先设置昵称');
  return user;
}

module.exports = { publicUser, assertProfileCompleted };
