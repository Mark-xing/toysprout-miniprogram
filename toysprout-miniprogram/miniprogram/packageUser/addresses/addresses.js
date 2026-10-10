// packageUser/addresses/addresses.js
const api = require('../../utils/api');

const EMPTY_FORM = { receiverName: '', phone: '', province: '', city: '', detail: '', isDefault: false };

Page({
  data: {
    addresses: [],
    formVisible: false,
    editingId: '',
    form: Object.assign({}, EMPTY_FORM),
  },

  onShow() {
    this.loadAddresses();
  },

  async loadAddresses() {
    const res = await api.user('listAddresses', {});
    if (res.code === 0) this.setData({ addresses: res.data.addresses });
    else api.toast(res.message, 'error');
  },

  onAddNew() {
    this.setData({ formVisible: true, editingId: '', form: Object.assign({}, EMPTY_FORM) });
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const addr = this.data.addresses.find((a) => a.id === id);
    if (!addr) return;
    this.setData({ formVisible: true, editingId: id, form: Object.assign({}, addr) });
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除该地址？',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await api.user('deleteAddress', { id });
        if (res.code === 0) { api.toast('地址已删除', 'success'); this.loadAddresses(); }
        else api.toast(res.message, 'error');
      },
    });
  },
  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },
  onToggleDefault() {
    this.setData({ 'form.isDefault': !this.data.form.isDefault });
  },
  onCancelForm() {
    this.setData({ formVisible: false });
  },
  async onSave() {
    const f = this.data.form;
    if (!f.receiverName || !f.phone || !f.province || !f.city || !f.detail) {
      return api.toast('请完整填写地址信息', 'error');
    }
    const action = this.data.editingId ? 'updateAddress' : 'createAddress';
    const payload = this.data.editingId ? Object.assign({}, f, { id: this.data.editingId }) : f;
    const res = await api.user(action, payload);
    if (res.code === 0) {
      api.toast(res.message || '保存成功', 'success');
      this.setData({ formVisible: false });
      this.loadAddresses();
    } else {
      api.toast(res.message, 'error');
    }
  },
});
