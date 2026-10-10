// packageUser/verify/verify.js
const api = require('../../utils/api');

Page({
  data: { name: '', idCard: '', submitting: false },

  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onIdCardInput(e) { this.setData({ idCard: e.detail.value }); },

  async onSubmit() {
    const { name, idCard } = this.data;
    if (!name.trim()) return api.toast('请填写真实姓名', 'error');
    if (!/^\d{17}[\dXx]$/.test(idCard.trim())) return api.toast('身份证号格式不正确', 'error');

    this.setData({ submitting: true });
    const res = await api.user('verify', { name: name.trim(), idCard: idCard.trim() });
    this.setData({ submitting: false });

    if (res.code === 0) {
      api.toast('实名认证成功', 'success');
      setTimeout(() => wx.navigateBack(), 800);
    } else {
      api.toast(res.message, 'error');
    }
  },
});
