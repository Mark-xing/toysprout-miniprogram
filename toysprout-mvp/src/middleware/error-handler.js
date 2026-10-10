// src/middleware/error-handler.js
// 统一错误处理与业务异常类。
'use strict';

// 业务异常：携带 HTTP 状态码与错误信息，由 error-handler 中间件统一转为 JSON 响应。
class HttpError extends Error {
  constructor(status, message, code = status) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ok(res, data = null, message = '') {
  return res.json({ code: 0, data, message });
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    code: 404,
    data: null,
    message: `接口不存在：${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  void next;
  if (err instanceof HttpError) {
    return res.status(err.status).json({ code: err.code, data: null, message: err.message });
  }
  console.error('[server] unhandled error:', err);
  return res.status(500).json({
    code: 500,
    data: null,
    message: '服务内部错误，请稍后重试',
  });
}

module.exports = { HttpError, ok, notFoundHandler, errorHandler };
