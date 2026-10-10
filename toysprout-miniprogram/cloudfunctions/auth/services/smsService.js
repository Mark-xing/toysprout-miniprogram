// cloudfunctions/auth/services/smsService.js
// 【生产接入预留点】统一短信验证码服务。当前为模拟实现，固定验证码 1234。
// 接入真实短信网关（如腾讯云 SMS）时，只需替换本文件内部实现，
// 调用方（index.js 的 sendCode / login action）无需任何改动。
'use strict';

const DEV_CODE = '1234';

async function sendVerificationCode({ phone }) {
  // TODO(生产接入)：
  // 1. 生成随机 6 位验证码
  // 2. 调用腾讯云 SMS / 阿里云短信 API 发送
  // 3. 将验证码写入云数据库 sms_codes 集合（含 5 分钟过期时间），供 verifyCode 校验
  // 当前模拟阶段：固定返回 1234，不做真实发送，前端直接展示该码方便演示/测试。
  return { code: DEV_CODE, mock: true, expiresIn: 300 };
}

async function verifyCode({ phone, code }) {
  // TODO(生产接入)：查询 sms_codes 集合校验 phone+code+未过期，命中后删除该记录（一次性使用）
  // 当前模拟阶段：固定校验值为 1234
  return code === DEV_CODE;
}

module.exports = { sendVerificationCode, verifyCode };
