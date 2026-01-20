const {
  getCurrentUser,
  authorizeUser,
  getUserStats,
  getMyPublishedGoods,
  getMyParticipatedGoods
} = require('../../utils/request')

Page({
  data: {
    user: null,
    postsCount: 0,
    participationsCount: 0,
    publishedList: [],
    participatedList: [],
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
      const published = await getMyPublishedGoods({ limit: 10, offset: 0 })
      const participated = await getMyParticipatedGoods({ limit: 10 })

      this.setData({
        user: stats.user,
        postsCount: stats.postsCount || 0,
        participationsCount: stats.participationsCount || 0,
        publishedList: published && Array.isArray(published.list) ? published.list : [],
        participatedList: Array.isArray(participated) ? participated : [],
        isLoading: false
      })
    } catch (e) {
      const msg = e && e.message ? String(e.message) : ''
      if (msg === 'need_authorization') {
        this.setData({
          user: null,
          postsCount: 0,
          participationsCount: 0,
          publishedList: [],
          participatedList: [],
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
  onGoodsTap(e) {
    const goods = e && e.detail && e.detail.item ? e.detail.item : null
    if (!goods || !goods.id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${goods.id}` })
  }
})
