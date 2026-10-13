// cloudfunctions/_shared/subscribe-templates.js
// 微信订阅消息「模板 ID」的唯一存放处（服务端侧）。
//
// ⚠️ 模板 ID 目前未知：需**运营方**在微信公众平台 MP 后台 →「订阅消息」里申请模板，
//    拿到模板 ID 后**填在下面对象的对应 key 上**（值当前是空字符串 ''）。
//
// 前端也有一份同名 key 的常量（miniprogram/utils/subscribe.js 的 TMPL_IDS），
// 因为小程序端与云函数端无法互相 require，只能各存一份、保持 key 一致。
// 申请到模板后，**两处都要填**，否则会出现「前端授权了 / 服务端不发送」或反之。
//
// 空值时的行为（已实现，见 _shared/notify.js）：
//   - 只写站内消息（notifications 集合），**跳过订阅消息推送**；
//   - 不报错、不阻断任何主流程。
//
// ⚠️ 以微信官方文档为准：
//   微信订阅消息分为「一次性订阅」与「长期订阅」两类，其可申请类目、下发次数、
//   以及**个人主体**小程序能否使用，均以微信官方文档与 MP 后台实际可申请项为准。
//   本文件不臆造模板类目，也不断言某类模板一定可用——请先在 MP 后台确认后再填。
//
// 源码位于 _shared/，各云函数目录下的同名文件由 scripts/sync-shared.js 分发复制，请勿直接改后者。
'use strict';

module.exports = {
  // 交换意向被发起时通知「被交换方」
  SWAP_REQUEST: '',
  // 交换意向被同意 / 拒绝时通知「发起方」
  SWAP_ACCEPTED: '',
  SWAP_REJECTED: '',
  // 对方填写运单时通知「收货方」
  SWAP_SHIPPED: '',
  // 对方确认收货时通知「收货方」
  SWAP_RECEIVED: '',
  // 收到新评价时通知「被评价方」
  SWAP_REVIEWED: '',
};
