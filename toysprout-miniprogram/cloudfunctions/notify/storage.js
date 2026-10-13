// cloudfunctions/_shared/storage.js
// 云存储读取兜底：把 images 里的 cloud:// fileID（以及 owner.avatarUrl 这种"他人头像"）
// 换成带签名的临时 HTTPS 链接。
//
// 为什么需要这个模块：
//   本项目云环境（cloud1-d9gtvt3k34dcfec16）处于「免费体验期」，云存储 ACL 无法从
//   PRIVATE 改为 READONLY——CloudBase 接口直接拒绝（OperationDenied.FreePackageDenied）。
//   在 PRIVATE（仅创建者可读写）下，用户 A 上传的玩具图片用公开 CDN 地址访问会返回 403
//   （已实测），发现页对用户 B 就是一片破图。
//
//   云函数持管理员权限，可在服务端用 getTempFileURL 签发带签名的链接。签名链接不校验
//   ACL，任何持有者可匿名访问（已实测：HTTP 200，内容 MD5 与源文件一致）。因此由云函数
//   在下发数据前把 fileID 换成签名链接，即可在不升级套餐的前提下修好图片跨用户可见性。
//
// 代价与边界：
//   - 签名链接会过期（服务端默认策略，实测约 2 小时）。若页面长时间驻留后图片
//     失效，前端重新拉一次列表即可拿到新链接。
//   - 仅处理以 `cloud://` 开头的值；已是 http(s) 的值原样保留（兼容将来升级套餐后
//     改回直接返回 fileID 的场景）。
//
// 源码位于 _shared/，各云函数目录下的同名文件由 scripts/sync-shared.js 分发复制，请勿直接改后者。
'use strict';

// getTempFileURL 单次调用上限为 50 个文件，超出需分批
const BATCH_SIZE = 50;

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

// 收集这批对象里需要换取签名链接的、去重后的 cloud:// fileID。
// 会跳过 null 对象，并保持传入数组的原始顺序与长度（调用方依赖下标对应）。
//
// 处理两个位置：
//   - images[]            —— 玩具实拍图；
//   - owner.avatarUrl     —— **他人**头像。卡片 / 详情页要把作者头像展示给非创建者，
//                            而云存储 ACL 锁在 PRIVATE，fileID 直连对他人是 403。
// 刻意**不**处理顶层 avatarUrl：那是本人资料页的返回值，可能被原样回传给
// auth.updateProfile 落库，换成会过期的签名链接就等于把过期链接持久化了。
function collectFileIds(objects) {
  const ids = [];
  const push = (v) => {
    if (isCloudFileId(v) && ids.indexOf(v) === -1) ids.push(v);
  };
  for (const obj of objects) {
    if (!obj) continue;
    if (Array.isArray(obj.images)) obj.images.forEach(push);
    if (obj.owner) push(obj.owner.avatarUrl);
  }
  return ids;
}

// 批量换取签名链接，返回 { [fileID]: tempFileURL }。
// 单个文件失败不影响其余文件——失败的 fileID 不入 map，调用方会回退为原值。
async function buildUrlMap(cloud, fileIds) {
  const map = {};
  if (!fileIds.length) return map;
  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE);
    try {
      // wx-server-sdk 的 fileList 只接受 fileID 字符串数组；
      // 传 {fileID, maxAge} 对象会导致每项 status 非 0（已实测，勿改回对象形式）。
      // 有效期由服务端默认策略决定，实测约 2 小时。
      const res = await cloud.getTempFileURL({ fileList: batch });
      for (const f of (res && res.fileList) || []) {
        if (f && f.status === 0 && f.tempFileURL) {
          map[f.fileID] = f.tempFileURL;
        } else {
          console.error('[storage] 换取签名链接失败:', JSON.stringify(f));
        }
      }
    } catch (e) {
      console.error('[storage] getTempFileURL 调用异常，本次回退为原始 fileID:', e && e.message);
    }
  }
  return map;
}

// 就地替换传入对象数组上 images / owner.avatarUrl 里的 fileID。返回值与入参同一数组引用，便于链式使用。
// 注意：入参数组元素必须是由 publicXxx() 新建的对象（而非数据库原始文档），
// 否则会把签名链接写回数据库——签名的临时链接不该持久化。
async function attachImageTempUrls(cloud, objects) {
  const list = Array.isArray(objects) ? objects : [objects];
  const ids = collectFileIds(list);
  if (!ids.length) return list;
  const map = await buildUrlMap(cloud, ids);
  for (const obj of list) {
    if (!obj) continue;
    if (Array.isArray(obj.images)) obj.images = obj.images.map((id) => map[id] || id);
    // 换取失败时保留原始 fileID，前端 onAvatarError 会降级为默认头像占位
    if (obj.owner && map[obj.owner.avatarUrl]) obj.owner.avatarUrl = map[obj.owner.avatarUrl];
  }
  return list;
}

module.exports = {
  isCloudFileId,
  collectFileIds,
  buildUrlMap,
  attachImageTempUrls,
};
