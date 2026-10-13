// packageUser/feedback/feedback.js
// 意见反馈页：类型枚举 + 详细描述（必填）+ 联系方式（选填）+ 图片（选填，最多 3 张）。
// 提交走 user 云函数的 createFeedback action（与举报同维度，复用既有函数，不新建）。
const api = require('../../utils/api');
const { FEEDBACK_TYPES } = require('../../utils/format');

const DESC_MAX = 500;
const CONTACT_MAX = 100;
const IMAGES_MAX = 3;

Page({
  data: {
    types: FEEDBACK_TYPES,
    type: '',
    description: '',
    contact: '',
    images: [], // 云存储 fileID 数组
    descMax: DESC_MAX,
    contactMax: CONTACT_MAX,
    imagesMax: IMAGES_MAX,
    submitting: false,
    uploading: false,
  },

  onTypeTap(e) {
    const value = e.currentTarget.dataset.value;
    if (value) this.setData({ type: value });
  },
  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },
  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  // 图片上传：与发布页同源流程（getUploadPath 规范路径 → wx.cloud.uploadFile 直传云存储）。
  // 反馈配图用 scope=feedback 单独分目录，便于按用途清理与统计配额。
  async onChooseImage() {
    if (this.data.images.length >= IMAGES_MAX) return api.toast(`最多上传 ${IMAGES_MAX} 张图片`, 'error');
    try {
      const chooseRes = await wx.chooseMedia({
        count: IMAGES_MAX - this.data.images.length,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
      });
      const files = chooseRes.tempFiles || [];
      if (!files.length) return;
      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中…', mask: true });

      const uploadedUrls = [];
      for (const file of files) {
        const ext = (file.tempFilePath.split('.').pop() || 'jpg').toLowerCase();
        const pathRes = await api.upload('getUploadPath', { ext, scope: 'feedback' });
        if (pathRes.code !== 0) continue;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: pathRes.data.cloudPath,
          filePath: file.tempFilePath,
        });
        uploadedUrls.push(uploadRes.fileID);
      }
      // 兜住 count 溢出（并发选择等边界），最终仍以 IMAGES_MAX 封顶
      this.setData({ images: this.data.images.concat(uploadedUrls).slice(0, IMAGES_MAX) });
    } catch (e) {
      console.error('[feedback] 图片上传失败:', e);
      api.toast('图片上传失败，请重试', 'error');
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  async onSubmit() {
    const { type, contact, images } = this.data;
    const description = (this.data.description || '').trim();
    if (!type) return api.toast('请选择反馈类型', 'error');
    if (!description) return api.toast('请填写详细描述', 'error');
    if (description.length > DESC_MAX) return api.toast(`描述过长，请控制在 ${DESC_MAX} 字以内`, 'error');

    this.setData({ submitting: true });
    const res = await api.user('createFeedback', {
      type,
      description,
      contact: (contact || '').trim(),
      images,
    });
    this.setData({ submitting: false });

    if (res.code === 0) {
      api.toast(res.message || '反馈已提交，感谢您的反馈', 'success');
      setTimeout(() => wx.navigateBack(), 800);
    } else {
      // 失败保留已填内容，方便用户修改后重试（不静默）
      api.toast(res.message || '提交失败，请稍后重试', 'error');
    }
  },
});
