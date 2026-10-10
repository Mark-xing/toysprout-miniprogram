// cloudfunctions/swap/services/payService.js
// 【生产接入预留点】统一支付服务接口。当前为模拟实现，调用即视为支付成功。
// 接入真实微信支付时，只需替换本文件内部实现（调用统一下单 API 拿 prepay_id，
// 返回给前端调用 wx.requestPayment，并在支付回调云函数中确认后再调用 markPaid），
// 调用方（swap 云函数 payFee action、membership 云函数 subscribe action）无需改动。
'use strict';

async function charge({ openid, amountFen, description, outTradeNo }) {
  // TODO(生产接入)：
  // 1. 调用微信支付统一下单 API（需商户号 mch_id + API 密钥）
  // 2. 返回 prepay_id，前端调用 wx.requestPayment 拉起支付
  // 3. 微信支付回调云函数验证签名后，调用数据库更新对应 swap/membership 记录的支付状态
  // 当前模拟阶段：amountFen 为 0（会员）时直接返回成功；非 0 时同样直接模拟支付成功，
  // 不做真实扣款，保证 MVP/生产预留阶段功能链路可演示。
  return { success: true, amountFen, mock: true, outTradeNo };
}

module.exports = { charge };
