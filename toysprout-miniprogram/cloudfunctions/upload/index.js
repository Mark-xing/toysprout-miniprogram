// cloudfunctions/upload/index.js
// 生成规范化云存储路径。实际文件上传由小程序前端直接调用 wx.cloud.uploadFile 完成
// （云存储上传无需经过云函数中转，此函数仅用于路径规范化与基础校验，
//  确保 toys/{openid}/... 目录结构统一、避免文件名冲突）。
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const { ok, fail, BizError } = require('./response');

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp'];
// 上传用途分流：玩具实拍图与用户头像分目录存放，便于按用途单独清理与统计配额。
// 缺省保持 'toys'，兼容既有 publish 页的调用（它不传 scope）。
const ALLOWED_SCOPES = ['toys', 'avatars'];

async function handleGetUploadPath(data, openid) {
  const ext = String(data.ext || 'jpg').toLowerCase().replace('.', '');
  if (!ALLOWED_EXT.includes(ext)) throw new BizError(400, '仅支持 jpg/png/webp 格式图片');
  const scope = String(data.scope || 'toys').toLowerCase();
  if (!ALLOWED_SCOPES.includes(scope)) throw new BizError(400, '不支持的上传用途');
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const cloudPath = `${scope}/${openid}/${timestamp}-${random}.${ext}`;
  return { cloudPath };
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    switch (event.action) {
      case 'getUploadPath': return ok(await handleGetUploadPath(event, openid));
      default: return fail(404, '未知的 action: ' + event.action);
    }
  } catch (e) {
    if (e instanceof BizError) return fail(e.code, e.message);
    console.error('[upload] unhandled error:', e);
    return fail(500, '服务内部错误：' + e.message);
  }
};
