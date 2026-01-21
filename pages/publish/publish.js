const jsQR = require('../../utils/jsqr')

const getImageInfo = (src) =>
  new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    })
  })

const canvasGetImageData = (options) =>
  new Promise((resolve, reject) => {
    wx.canvasGetImageData({
      ...options,
      success: resolve,
      fail: reject
    })
  })

const nextTick = () =>
  new Promise((resolve) => {
    if (wx.nextTick) {
      wx.nextTick(resolve)
      return
    }
    setTimeout(resolve, 0)
  })

Page({
  data: {
    tabs: ['拼多多'],
    activeTab: 0,
    topOptions: [
      { label: '暂不', value: 0 },
      { label: '2小时', value: 2 },
      { label: '6小时', value: 6 }
    ],
    selectedTopOption: 0,
    uploadedImage: '',
    orderLink: '',
    qrStatus: 'idle',
    qrStatusText: '',
    canvasW: 0,
    canvasH: 0,
    isFetchingInfo: false,
    fetchedTitle: '',
    fetchedPrice: null,
    fetchedOriginalPrice: null,
    fetchedGroupSize: null,
    fetchedMissingCount: null,
    fetchedRemainingHours: null,
    fetchedIsBaiyiButie: false,
    fetchErrorText: '',
    recognizeState: 'idle',
    recognizeHint: '上传图片后自动识别',
    canSubmit: false,
    checkingDuplicate: false,
    duplicatePostId: '',
    duplicatePromptedOrderLink: ''
  },

  getFormStateSnapshot() {
    const d = this.data
    return {
      uploadedImage: d.uploadedImage,
      orderLink: d.orderLink,
      qrStatus: d.qrStatus,
      qrStatusText: d.qrStatusText,
      canvasW: d.canvasW,
      canvasH: d.canvasH,
      isFetchingInfo: d.isFetchingInfo,
      fetchedTitle: d.fetchedTitle,
      fetchedPrice: d.fetchedPrice,
      fetchedOriginalPrice: d.fetchedOriginalPrice,
      fetchedGroupSize: d.fetchedGroupSize,
      fetchedMissingCount: d.fetchedMissingCount,
      fetchedRemainingHours: d.fetchedRemainingHours,
      fetchedIsBaiyiButie: d.fetchedIsBaiyiButie,
      fetchErrorText: d.fetchErrorText,
      recognizeState: d.recognizeState,
      recognizeHint: d.recognizeHint,
      canSubmit: d.canSubmit,
      checkingDuplicate: d.checkingDuplicate,
      duplicatePostId: d.duplicatePostId,
      duplicatePromptedOrderLink: d.duplicatePromptedOrderLink
    }
  },

  resetForm() {
    this.setData({
      uploadedImage: '',
      orderLink: '',
      qrStatus: 'idle',
      qrStatusText: '',
      canvasW: 0,
      canvasH: 0,
      isFetchingInfo: false,
      fetchedTitle: '',
      fetchedPrice: null,
      fetchedOriginalPrice: null,
      fetchedGroupSize: null,
      fetchedMissingCount: null,
      fetchedRemainingHours: null,
      fetchedIsBaiyiButie: false,
      fetchErrorText: '',
      recognizeState: 'idle',
      recognizeHint: '上传图片后自动识别',
      canSubmit: false,
      checkingDuplicate: false,
      duplicatePostId: '',
      duplicatePromptedOrderLink: ''
    })
  },

  updateRecognizeState() {
    const uploadedOk = Boolean(this.data.uploadedImage)
    const qrOk = this.data.qrStatus === 'success' && Boolean(String(this.data.orderLink || '').trim())
    const ocrOk = Boolean(String(this.data.fetchedTitle || '').trim()) && !this.data.fetchErrorText
    const duplicate = Boolean(this.data.duplicatePostId)
    const processing =
      Boolean(this.data.isFetchingInfo) ||
      this.data.qrStatus === 'scanning' ||
      Boolean(this.data.checkingDuplicate)

    let recognizeState = 'idle'
    let recognizeHint = ''

    if (!uploadedOk) {
      recognizeState = 'idle'
      recognizeHint = '上传图片后自动识别'
    } else if (processing) {
      recognizeState = 'processing'
      recognizeHint = '正在识别拼团信息...'
    } else if (duplicate) {
      recognizeState = 'duplicate'
      recognizeHint = '该拼团已发布，建议直接参与，成团更快'
    } else if (qrOk && ocrOk) {
      recognizeState = 'success'
      recognizeHint = '已完成，可提交审核。'
    } else if (uploadedOk && !qrOk && !ocrOk && this.data.qrStatus === 'idle' && !this.data.fetchErrorText) {
      recognizeState = 'processing'
      recognizeHint = '正在识别拼团信息...'
    } else {
      recognizeState = 'failed'
      if (this.data.fetchErrorText) recognizeHint = '未识别到拼团信息，请更换更清晰的图片重试'
      else if (this.data.qrStatus === 'failed') recognizeHint = '未识别到二维码，请更换图片重试'
      else recognizeHint = '请更换图片重试'
    }

    const canSubmit = uploadedOk && qrOk && ocrOk && !duplicate && !processing
    this.setData({ recognizeState, recognizeHint, canSubmit })
  },

  async checkDuplicateIfNeeded() {
    const link = String(this.data.orderLink || '').trim()
    if (!link) return
    if (this.data.checkingDuplicate) return

    const { findDuplicateGroupPost } = require('../../utils/request')
    this.setData({ checkingDuplicate: true, duplicatePostId: '' })
    this.updateRecognizeState()

    try {
      const dup = await findDuplicateGroupPost({ orderLink: link })
      if (dup && dup.id) {
        this.setData({ checkingDuplicate: false, duplicatePostId: String(dup.id) })
        this.updateRecognizeState()

        if (this.data.duplicatePromptedOrderLink !== link) {
          this.setData({ duplicatePromptedOrderLink: link })
          const snapshot = this.getFormStateSnapshot()
          wx.showModal({
            title: '重复拼团',
            content: '该拼团已有人发布，建议直接参与，成团更快。',
            confirmText: '去查看',
            cancelText: '我知道了',
            success: (res) => {
              this.setData(snapshot, () => {
                this.updateRecognizeState()
                if (res.confirm) {
                  wx.navigateTo({ url: `/pages/detail/detail?id=${dup.id}` })
                }
              })
            }
          })
        }
        return
      }
      this.setData({ checkingDuplicate: false, duplicatePostId: '' })
      this.updateRecognizeState()
    } catch (e) {
      this.setData({ checkingDuplicate: false })
      this.updateRecognizeState()
    }
  },

  onTabClick(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ activeTab: index })
  },

  onUploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          uploadedImage: tempFilePath,
          orderLink: '',
          qrStatus: 'idle',
          qrStatusText: '',
          isFetchingInfo: false,
          fetchedTitle: '',
          fetchedPrice: null,
          fetchedOriginalPrice: null,
          fetchedGroupSize: null,
          fetchedMissingCount: null,
          fetchedRemainingHours: null,
          fetchedIsBaiyiButie: false,
          fetchErrorText: '',
          recognizeState: 'processing',
          recognizeHint: '正在识别拼团信息...',
          canSubmit: false,
          checkingDuplicate: false,
          duplicatePostId: '',
          duplicatePromptedOrderLink: ''
        })
        this.extractProductInfoFromImage(tempFilePath)
        this.onRecognizeQr()
      }
    })
  },

  onOptionSelect(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ selectedTopOption: value })
  },

  onCopyLink() {
    const { orderLink } = this.data
    if (!orderLink) return
    wx.setClipboardData({
      data: orderLink,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  async decodeQrFromImage(filePath) {
    const info = await getImageInfo(filePath)
    const width = Number(info.width) || 0
    const height = Number(info.height) || 0
    if (!width || !height) {
      return ''
    }

    const crops = [
      { name: 'full', x: 0, y: 0, w: width, h: height },
      { name: 'br50', x: Math.floor(width * 0.5), y: Math.floor(height * 0.5), w: Math.floor(width * 0.5), h: Math.floor(height * 0.5) },
      { name: 'br40', x: Math.floor(width * 0.6), y: Math.floor(height * 0.6), w: Math.floor(width * 0.4), h: Math.floor(height * 0.4) },
      { name: 'rbStrip', x: Math.floor(width * 0.55), y: Math.floor(height * 0.45), w: Math.floor(width * 0.45), h: Math.floor(height * 0.55) }
    ]

    for (const crop of crops) {
      const maxSide = 980
      const scale = Math.min(1, maxSide / Math.max(crop.w, crop.h))
      const dstW = Math.max(2, Math.floor(crop.w * scale))
      const dstH = Math.max(2, Math.floor(crop.h * scale))

      this.setData({ canvasW: dstW, canvasH: dstH })
      await nextTick()

      const ctx = wx.createCanvasContext('qrCanvas', this)
      ctx.clearRect(0, 0, dstW, dstH)
      ctx.drawImage(filePath, crop.x, crop.y, crop.w, crop.h, 0, 0, dstW, dstH)

      const imageData = await new Promise((resolve, reject) => {
        ctx.draw(false, async () => {
          try {
            const res = await canvasGetImageData({
              canvasId: 'qrCanvas',
              x: 0,
              y: 0,
              width: dstW,
              height: dstH
            })
            resolve(res)
          } catch (e) {
            reject(e)
          }
        })
      })

      const data = imageData && imageData.data ? imageData.data : null
      if (!data) {
        continue
      }

      const pixels = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data)
      const code = jsQR(pixels, dstW, dstH, { inversionAttempts: 'attemptBoth' })
      if (code && code.data) {
        return String(code.data).trim()
      }
    }

    return ''
  },

  async onRecognizeQr() {
    if (!this.data.uploadedImage) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    this.setData({
      qrStatus: 'scanning',
      qrStatusText: '正在识别二维码…'
    })
    this.updateRecognizeState()
    wx.showLoading({ title: '拼团识别中...' })
    try {
      const link = await this.decodeQrFromImage(this.data.uploadedImage)
      wx.hideLoading()
      if (!link) {
        this.setData({
          orderLink: '',
          qrStatus: 'failed',
          qrStatusText: '未识别到二维码，可使用扫一扫作为备选方案'
        })
        this.updateRecognizeState()
        wx.showToast({ title: '未识别到二维码', icon: 'none' })
        return
      }
      this.setData({
        orderLink: link,
        qrStatus: 'success',
        qrStatusText: '已识别到二维码，下单链接已提取'
      })
      this.updateRecognizeState()
      this.checkDuplicateIfNeeded()
      wx.showToast({ title: '拼团识别成功', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({
        orderLink: '',
        qrStatus: 'failed',
        qrStatusText: '识别失败，可使用扫一扫作为备选方案'
      })
      this.updateRecognizeState()
      wx.showToast({ title: '识别失败', icon: 'none' })
    }
  },

  async extractProductInfoFromImage(filePath) {
    if (!filePath) return
    try {
      this.setData({
        isFetchingInfo: true,
        fetchedTitle: '',
        fetchedPrice: null,
        fetchedOriginalPrice: null,
        fetchedGroupSize: null,
        fetchedMissingCount: null,
        fetchedRemainingHours: null,
        fetchedIsBaiyiButie: false,
        fetchErrorText: ''
      })
      this.updateRecognizeState()

      const { ocrScreenshot } = require('../../utils/request')
      const mimeType = await new Promise((resolve) => {
        wx.getImageInfo({
          src: filePath,
          success: (info) => {
            const t = info && info.type ? String(info.type).toLowerCase() : ''
            if (t === 'png') resolve('image/png')
            else resolve('image/jpeg')
          },
          fail: () => resolve('image/jpeg')
        })
      })
      const result = await ocrScreenshot({ filePath, mimeType })

      this.setData({
        isFetchingInfo: false,
        fetchedTitle: result && result.title ? String(result.title) : '',
        fetchedPrice: result && typeof result.price === 'number' ? result.price : null,
        fetchedOriginalPrice:
          result && typeof result.original_price === 'number' ? result.original_price : null,
        fetchedGroupSize: result && typeof result.group_size === 'number' ? result.group_size : null,
        fetchedMissingCount:
          result && typeof result.missing_count === 'number' ? result.missing_count : null,
        fetchedRemainingHours:
          result && typeof result.remaining_hours === 'number' ? result.remaining_hours : null,
        fetchedIsBaiyiButie:
          result && typeof result.is_baiyi_butie === 'boolean' ? result.is_baiyi_butie : false,
        fetchErrorText: !result || !result.title ? '未能从图片识别到商品信息' : ''
      })
      this.updateRecognizeState()
      this.checkDuplicateIfNeeded()
    } catch (e) {
      console.error('Fetch info failed:', e)
      const msg = e && e.message ? String(e.message) : (e && e.errMsg ? String(e.errMsg) : '未知错误')
      const isBusy =
        msg === 'gemini_overloaded' ||
        msg.includes('UNAVAILABLE') ||
        msg.toLowerCase().includes('overloaded') ||
        msg.toLowerCase().includes('try again later')
      this.setData({
        isFetchingInfo: false,
        fetchErrorText: isBusy ? '识别服务繁忙，请稍后重试' : `请求失败：${msg}`,
      })
      this.updateRecognizeState()
    }
  },

  onRecognizeQrByScanCode() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const result = (res && res.result ? String(res.result) : '').trim()
        if (!result) {
          wx.showToast({ title: '未识别到二维码', icon: 'none' })
          return
        }
        this.setData({
          orderLink: result,
          qrStatus: 'success',
          qrStatusText: '已识别到二维码，下单链接已提取',
          isFetchingInfo: this.data.isFetchingInfo
        })
        this.updateRecognizeState()
        this.checkDuplicateIfNeeded()
        wx.showToast({ title: '识别成功', icon: 'success' })
      },
      fail: () => {}
    })
  },

  async onSubmit() {
    const { submitGroupPost, findDuplicateGroupPost, uploadCoverImage } = require('../../utils/request')

    if (!this.data.uploadedImage) {
      wx.showToast({
        title: '请上传拼团图片',
        icon: 'none'
      })
      return
    }
    if (!String(this.data.orderLink || '').trim() || this.data.qrStatus !== 'success') {
      wx.showToast({
        title: '未识别到二维码',
        icon: 'none'
      })
      return
    }
    if (!String(this.data.fetchedTitle || '').trim() || this.data.fetchErrorText) {
      wx.showToast({ title: '未识别到拼团信息，请重试', icon: 'none' })
      return
    }
    if (!this.data.canSubmit) {
      wx.showToast({ title: this.data.recognizeHint || '暂不可提交', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '提交中...' })

    const now = Date.now()
    const topHours = Number(this.data.selectedTopOption) || 0
    const topUntil = topHours > 0 ? now + topHours * 60 * 60 * 1000 : 0
    const platform = this.data.tabs[this.data.activeTab] || '拼多多'

    const groupSize = typeof this.data.fetchedGroupSize === 'number' ? this.data.fetchedGroupSize : 3
    const missingCount = typeof this.data.fetchedMissingCount === 'number' ? this.data.fetchedMissingCount : null
    const joinedCount =
      typeof missingCount === 'number' ? Math.max(0, Math.min(groupSize, groupSize - missingCount)) : undefined
    const remainingHours =
      typeof this.data.fetchedRemainingHours === 'number' ? this.data.fetchedRemainingHours : null
    const endTime =
      typeof remainingHours === 'number' && remainingHours > 0 ? now + remainingHours * 60 * 60 * 1000 : null
    const isBaiyiButie = Boolean(this.data.fetchedIsBaiyiButie)

    try {
      const link = String(this.data.orderLink || '').trim()
      const dup = await findDuplicateGroupPost({ orderLink: link })
      if (dup && dup.id) {
        wx.hideLoading()
        this.setData({ duplicatePostId: String(dup.id) })
        this.updateRecognizeState()
        const snapshot = this.getFormStateSnapshot()
        wx.showModal({
          title: '重复拼团',
          content: '该拼团已有人发布，建议直接参与，成团更快。',
          confirmText: '去查看',
          cancelText: '我知道了',
          success: (res) => {
            this.setData(snapshot, () => {
              this.updateRecognizeState()
              if (res.confirm) {
                wx.navigateTo({ url: `/pages/detail/detail?id=${dup.id}` })
              }
            })
          }
        })
        return
      }

      const mimeType = await new Promise((resolve) => {
        wx.getImageInfo({
          src: this.data.uploadedImage,
          success: (info) => {
            const t = info && info.type ? String(info.type).toLowerCase() : ''
            if (t === 'png') resolve('image/png')
            else resolve('image/jpeg')
          },
          fail: () => resolve('image/jpeg')
        })
      })
      const up = await uploadCoverImage({ filePath: this.data.uploadedImage, mimeType })
      const coverUrl = up && up.cover_image_url ? String(up.cover_image_url) : ''
      if (!coverUrl) {
        wx.hideLoading()
        wx.showToast({ title: '封面上传失败', icon: 'none' })
        return
      }

      await submitGroupPost({
        title: this.data.fetchedTitle || '【3人团】新提交拼团...',
        image: coverUrl,
        platform,
        order_link: link,
        top_until: topUntil,
        price: typeof this.data.fetchedPrice === 'number' ? this.data.fetchedPrice : null,
        original_price: typeof this.data.fetchedOriginalPrice === 'number' ? this.data.fetchedOriginalPrice : null,
        sales_tip: isBaiyiButie ? '百亿补贴' : null,
        group_size: groupSize,
        joined_count: joinedCount,
        end_time: endTime,
        metadata: {
          missing_count: typeof missingCount === 'number' ? missingCount : null,
          remaining_hours: typeof remainingHours === 'number' ? remainingHours : null,
          is_baiyi_butie: isBaiyiButie
        }
      })

      wx.hideLoading()
      this.resetForm()
      wx.showToast({ title: '提交成功，待审核', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 500)
    } catch (e) {
      wx.hideLoading()
      const msg = e && e.message ? String(e.message) : '提交失败'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onGoHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
