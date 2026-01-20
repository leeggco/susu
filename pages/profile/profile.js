const {
  getCurrentUser,
  authorizeUser,
  getUserStats
} = require('../../utils/request')

Page({
  data: {
    user: null,
    postsCount: 0,
    participationsCount: 0,
    isLoading: false
  },
  onShow() {
    this.refresh()
  },
  async refresh() {
    this.setData({ isLoading: true })

    const cached = getCurrentUser()
    if (cached) {
      this.setData({ user: cached })
    }

    try {
      const stats = await getUserStats()
      this.setData({
        user: stats.user,
        postsCount: stats.postsCount || 0,
        participationsCount: stats.participationsCount || 0,
        isLoading: false
      })
    } catch (e) {
      const msg = e && e.message ? String(e.message) : ''
      if (msg === 'need_authorization') {
        this.setData({
          user: null,
          postsCount: 0,
          participationsCount: 0,
          isLoading: false
        })
        return
      }
      this.setData({ isLoading: false })
    }
  },
  async onAuthorizeTap() {
    wx.showLoading({ title: '授权中...', mask: true })
    try {
      await authorizeUser()
      wx.hideLoading()
      wx.showToast({ title: '授权成功', icon: 'success' })
      this.refresh()
    } catch (e) {
      wx.hideLoading()
      const msg = e && e.errMsg ? String(e.errMsg) : '授权失败'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  navToMyPublished() {
    if (!this.data.user) {
      wx.showToast({ title: '请先授权', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/my-published/my-published' })
  },
  navToMyParticipated() {
    if (!this.data.user) {
      wx.showToast({ title: '请先授权', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/my-participated/my-participated' })
  }
})
