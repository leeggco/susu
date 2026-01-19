Page({
  data: {
    tabs: ['拼多多', '淘宝', '抖音'],
    activeTab: 0,
    topOptions: [
      { label: '暂不', value: 0 },
      { label: '2小时', value: 2 },
      { label: '6小时', value: 6 }
    ],
    selectedTopOption: 0,
    uploadedImage: ''
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
        this.setData({ uploadedImage: tempFilePath })
      }
    })
  },

  onOptionSelect(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ selectedTopOption: value })
  },

  onSubmit() {
    if (!this.data.uploadedImage) {
      wx.showToast({
        title: '请上传拼团图片',
        icon: 'none'
      })
      return
    }
    
    wx.showLoading({ title: '发布中...' })
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '发布成功',
        icon: 'success',
        success: () => {
          setTimeout(() => {
            wx.switchTab({ url: '/pages/index/index' })
          }, 1500)
        }
      })
    }, 1500)
  },

  onGoHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
