// packageUser/membership/membership.js
const api = require('../../utils/api');

Page({
  data: {
    memberStatusText: '',
    buttonLabel: '开通会员 ¥10/月',
    submitting: false,
  },

  onShow() {
    this.loadStatus();
  },

  async loadStatus() {
    const res = await api.membership('status', {});
    if (res.code === 0 && res.data.isMember) {
      this.setData({
        memberStatusText: `你已是会员 · ${String(res.data.memberExpiresAt).slice(0, 10)} 到期`,
        buttonLabel: '续费会员 ¥10/月',
      });
    }
  },

  async onSubscribe() {
    this.setData({ submitting: true });
    const res = await api.membership('subscribe', {});
    this.setData({ submitting: false });
    if (res.code === 0) {
      api.toast('会员开通成功，已免每单服务费', 'success');
      this.setData({
        memberStatusText: `你已是会员 · ${String(res.data.memberExpiresAt).slice(0, 10)} 到期`,
        buttonLabel: '续费会员 ¥10/月',
      });
    } else {
      api.toast(res.message, 'error');
    }
  },
});
