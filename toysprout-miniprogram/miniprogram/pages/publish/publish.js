// pages/publish/publish.js
const api = require('../../utils/api');
const { CATEGORY_NAMES } = require('../../utils/format');

const CATEGORY_OPTIONS = Object.keys(CATEGORY_NAMES).map((k) => ({ value: k, label: CATEGORY_NAMES[k] }));
const CONDITION_OPTIONS = [
  { value: 'new', label: '全新' },
  { value: '9new', label: '9成新' },
  { value: '8new', label: '8成新' },
  { value: 'used', label: '有使用痕迹' },
];

Page({
  data: {
    title: '', description: '', ageRange: '',
    category: '', conditionLevel: '', hasSmallParts: false,
    images: [], // 云存储 fileID 数组
    categoryOptions: CATEGORY_OPTIONS,
    conditionOptions: CONDITION_OPTIONS,
    submitting: false,
    uploading: false,
    // 积分双向流通（business-model-v3.md §2.1）：品类+成色选定后实时预估积分区间，
    // 家长可在区间内微调最终 finalPoints，不填则按算法建议值发布。
    valuation: null, // { min, max, suggested }
    finalPoints: null,
    isFreeShipping: false,
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },
  onCategoryTap(e) {
    this.setData({ category: e.currentTarget.dataset.value });
    this.refreshValuation();
  },
  onConditionTap(e) {
    this.setData({ conditionLevel: e.currentTarget.dataset.value });
    this.refreshValuation();
  },
  onToggleSmallParts() { this.setData({ hasSmallParts: !this.data.hasSmallParts }); },
  onToggleFreeShipping() { this.setData({ isFreeShipping: !this.data.isFreeShipping }); },

  async refreshValuation() {
    const { category, conditionLevel } = this.data;
    if (!category || !conditionLevel) return;
    const res = await api.points('previewValuation', { category, conditionLevel });
    if (res.code === 0) {
      this.setData({ valuation: res.data, finalPoints: res.data.suggested });
    }
  },
  onFinalPointsInput(e) {
    const { valuation } = this.data;
    if (!valuation) return;
    const n = Math.max(valuation.min, Math.min(valuation.max, parseInt(e.detail.value, 10) || valuation.suggested));
    this.setData({ finalPoints: n });
  },

  async onChooseImage() {
    // 发布属于「对外可见」的操作，要求先有昵称。放在选图之前拦，避免用户传完 9 张图才被拒。
    // 服务端 toy.create 有同样的兜底校验，这里只是体验优化。
    if (!(await api.requireProfile())) return;
    if (this.data.images.length >= 9) return api.toast('最多上传 9 张图片', 'error');
    try {
      const chooseRes = await wx.chooseMedia({
        count: 9 - this.data.images.length,
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
        const pathRes = await api.upload('getUploadPath', { ext });
        if (pathRes.code !== 0) continue;
        const cloudPath = pathRes.data.cloudPath;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath });
        uploadedUrls.push(uploadRes.fileID);
      }
      this.setData({ images: this.data.images.concat(uploadedUrls) });
    } catch (e) {
      console.error('[publish] 图片上传失败:', e);
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
    if (!(await api.requireProfile())) return;
    const { title, category, ageRange, conditionLevel, description, hasSmallParts, images } = this.data;
    if (!title.trim()) return api.toast('请填写玩具名称', 'error');
    if (!category) return api.toast('请选择品类', 'error');
    if (!ageRange.trim()) return api.toast('请填写适龄范围', 'error');
    if (!conditionLevel) return api.toast('请选择成色等级', 'error');
    if (images.length < 3) return api.toast('请至少上传 3 张实拍图片', 'error');

    this.setData({ submitting: true });
    const { finalPoints, isFreeShipping } = this.data;
    const res = await api.toy('create', {
      title: title.trim(), description: description.trim(), category, ageRange: ageRange.trim(),
      conditionLevel, hasSmallParts, images, finalPoints, isFreeShipping,
    });
    this.setData({ submitting: false });

    if (res.code === 0) {
      api.toast(`发布成功，可获得 ${res.data.points} 积分（兑换时到账）`, 'success');
      this.setData({
        title: '', description: '', ageRange: '', category: '', conditionLevel: '', hasSmallParts: false,
        images: [], valuation: null, finalPoints: null, isFreeShipping: false,
      });
      setTimeout(() => wx.switchTab({ url: '/pages/discover/discover' }), 800);
    } else {
      api.toast(res.message, 'error');
    }
  },
});
