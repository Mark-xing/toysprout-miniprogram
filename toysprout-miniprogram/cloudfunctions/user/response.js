// cloudfunctions/_shared/response.js
// 统一响应格式工具：{code, data, message}，与 MVP Web 版 API 契约保持一致，
// 便于前端小程序沿用相同的数据结构约定。
'use strict';

function ok(data, message) {
  return { code: 0, data: data === undefined ? null : data, message: message || '' };
}

function fail(code, message) {
  return { code: code || 500, data: null, message: message || '操作失败' };
}

// 业务异常类：云函数内 throw new BizError(400, '...') 后在入口 try/catch 统一转换为 fail()
class BizError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = { ok, fail, BizError };
