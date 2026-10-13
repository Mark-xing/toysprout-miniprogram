// pages/about/about.js
// 关于我们（主包）。内容只陈述可从本项目确认的事实（名称、简介、协议入口），
// 运营主体名称、备案号、客服电话等无法从代码中确认的信息一律用【待补充】占位，
// 绝不编造——上线前必须由运营方替换为真实信息。
// 版本号从 wx.getAccountInfoSync().miniProgram.version 读取，读不到时显示占位，不写死。
'use strict';

const PLACEHOLDER = '【待补充】';

Page({
  data: {
    appName: '童芽 ToySprout',
    version: PLACEHOLDER,
    intro: '「童芽」是一个面向家长的闲置玩具交换小程序。我们相信好玩具不该被闲置——'
      + '在这里，你可以发布孩子不再玩的玩具，用积分兑换或与彼此看中的玩具一换一，'
      + '让每一件玩具继续被玩下去，也让更多家庭以更环保的方式找到合适的玩具。',
    email: PLACEHOLDER,
  },

  onLoad() {
    // 版本号以微信运行时信息为准：体验版 / 正式版能读到号，开发预览可能为空串，
    // 此时回落到占位符，绝不硬编码一个版本号。
    let version = PLACEHOLDER;
    try {
      const info = typeof wx.getAccountInfoSync === 'function' ? wx.getAccountInfoSync() : null;
      const v = info && info.miniProgram && info.miniProgram.version;
      if (v) version = v;
    } catch (e) {
      console.warn('[about] 读取版本号失败，使用占位:', (e && e.message) || e);
    }
    this.setData({ version });
  },

  // 协议入口：?type=user 用户协议 / ?type=privacy 隐私政策（agreement 页默认回落到隐私政策）
  onGoAgreement(e) {
    const type = e.currentTarget.dataset.type === 'user' ? 'user' : 'privacy';
    wx.navigateTo({ url: '/pages/agreement/agreement?type=' + type });
  },
});
