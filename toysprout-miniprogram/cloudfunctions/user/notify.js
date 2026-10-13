// cloudfunctions/_shared/notify.js
// 站内消息（notifications 集合）+ 微信订阅消息推送的统一入口，供各云函数复用。
//
// 为什么放进 _shared：
//   微信云函数各自独立打包上传，**不支持跨函数目录 require**。
//   发起交换 / 同意 / 发货 / 确认收货 / 互评这些状态流转都在 swap 云函数里，
//   而「读消息」（list / markRead）要放在独立的 notify 云函数里。
//   两边都要用同一套「写消息」逻辑，因此抽到这里，再由 scripts/sync-shared.js
//   复制到每个云函数目录（那些副本是构建产物，改这份源文件后重跑 sync-shared.js）。
//
// ⚠️ 设计红线：**通知永远不能影响主流程**。
//   swap 的「确认收货」不能因为「写消息失败」而失败。所以对外主推
//   `notifyAndPush()` / `safeWriteNotification()`——它们内部已 try/catch，
//   任何异常只记日志、返回 null，绝不向调用方抛出。
'use strict';

const TEMPLATES = require('./subscribe-templates');

const COLLECTION = 'notifications';

// 消息类型（写入 notifications.type，前端据此决定图标/跳转语义）。
// 取值与产品需求一一对应，前端 messages 页面按这些值分支展示。
const TYPES = {
  SWAP_REQUEST: 'swap_request',
  SWAP_ACCEPTED: 'swap_accepted',
  SWAP_REJECTED: 'swap_rejected',
  SWAP_SHIPPED: 'swap_shipped',
  SWAP_RECEIVED: 'swap_received',
  SWAP_REVIEWED: 'swap_reviewed',
  POINTS_CHANGED: 'points_changed',
  SYSTEM: 'system',
};

// 页内跳转目标类型（写入 notifications.targetType）。
// 'swap'   -> /packageSwap/order-detail/order-detail?id={targetId}
// 'points' -> /packageUser/points-wallet/points-wallet
// 'system' -> 无跳转（仅已读）
const TARGET_SWAP = 'swap';
const TARGET_POINTS = 'points';
const TARGET_SYSTEM = 'system';

// 判断错误是否为「集合不存在」（真实云开发报错文案含 -502005 / collection not exists）。
// 供读侧做降级（与项目 toy.list 对 wants 集合缺失的处理思路一致）。
function isCollectionMissingError(e) {
  const msg = (e && e.message) || '';
  return msg.indexOf('-502005') !== -1 || /collection not exist/i.test(msg);
}

// 写一条站内消息。**会抛异常**（调用方若在关键路径上，请改用 safeWriteNotification）。
// 注意：云函数侧 add() 不会自动注入 _openid，接收者必须显式写入。
async function writeNotification(db, payload) {
  payload = payload || {};
  const doc = {
    _openid: payload.openid, // 接收者的 openid
    type: payload.type || TYPES.SYSTEM,
    title: String(payload.title || ''),
    content: String(payload.content || ''),
    targetType: payload.targetType || TARGET_SYSTEM,
    targetId: payload.targetId || '',
    read: false,
    createdAt: db.serverDate(),
  };
  const res = await db.collection(COLLECTION).add({ data: doc });
  return { _id: res && res._id };
}

// 写一条站内消息，**永不抛异常**。失败只 console.error 并返回 null。
// 这是「通知失败不影响主流程」的落点：swap 各状态流转直接 await 它即可。
async function safeWriteNotification(db, payload) {
  try {
    return await writeNotification(db, payload);
  } catch (e) {
    console.error('[notify] 写入站内消息失败（已忽略，不影响主流程）:', e && e.message);
    return null;
  }
}

// 发送一条微信订阅消息。**永不抛异常**，且以下情况直接「优雅跳过」：
//   1) templateId 为空字符串（模板尚未在 MP 后台申请 / 未填入 subscribe-templates.js）；
//   2) cloud.openapi.subscribeMessage.send 不可用（本地 mock、或权限未开）。
// 返回 { sent, reason } 便于日志排查，不影响调用方。
async function sendSubscribeMessage(cloud, opts) {
  opts = opts || {};
  const openid = opts.openid;
  const templateId = opts.templateId;
  if (!openid || !templateId) {
    // 模板 ID 为空 = 尚未申请，优雅跳过，不算错误。
    return { sent: false, reason: 'no_template' };
  }
  if (!cloud || !cloud.openapi || !cloud.openapi.subscribeMessage ||
      typeof cloud.openapi.subscribeMessage.send !== 'function') {
    console.warn('[notify] cloud.openapi.subscribeMessage 不可用，跳过订阅消息推送');
    return { sent: false, reason: 'openapi_unavailable' };
  }
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      // page 为点击订阅消息后跳转的小程序页面（可选）
      page: opts.page || undefined,
      // data 为模板数据，字段随模板而定；模板未申请前传空对象即可
      data: opts.data || {},
      miniprogramState: 'formal',
    });
    return { sent: true };
  } catch (e) {
    console.error('[notify] 发送订阅消息失败（已忽略，不影响主流程）:', e && e.message);
    return { sent: false, reason: 'error' };
  }
}

// 组合入口：先写站内消息，再（若模板已申请）尝试推送订阅消息。
// **按「绝不抛异常」设计**，可直接放在 swap 各状态流转的关键路径上。
//   payload.subscribeTemplateKey  —— subscribe-templates.js 里的 key（如 'SWAP_ACCEPTED'），
//                                    对应模板 ID 为空时自动跳过推送；
//   payload.subscribePage / subscribeData —— 订阅消息的跳转页与模板数据。
async function notifyAndPush(cloud, db, payload) {
  payload = payload || {};
  const written = await safeWriteNotification(db, payload);

  const key = payload.subscribeTemplateKey;
  if (key) {
    const templateId = TEMPLATES[key];
    await sendSubscribeMessage(cloud, {
      openid: payload.openid,
      templateId,
      page: payload.subscribePage,
      data: payload.subscribeData,
    });
  }
  return written;
}

module.exports = {
  COLLECTION,
  TYPES,
  TARGET_SWAP,
  TARGET_POINTS,
  TARGET_SYSTEM,
  isCollectionMissingError,
  writeNotification,
  safeWriteNotification,
  sendSubscribeMessage,
  notifyAndPush,
};
