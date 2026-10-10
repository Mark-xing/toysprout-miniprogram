// cloudfunctions/membership/services/payService.js
// 与 swap 云函数共用同一套支付预留接口约定（各云函数独立打包，代码在部署前由脚本同步）。
'use strict';

async function charge({ openid, amountFen, description, outTradeNo }) {
  // TODO(生产接入)：接入微信支付统一下单，详见 swap/services/payService.js 同名文件注释。
  return { success: true, amountFen, mock: true, outTradeNo };
}

module.exports = { charge };
