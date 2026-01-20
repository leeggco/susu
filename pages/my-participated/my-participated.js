const { getMyParticipatedGoods, authorizeUser } = require('../../utils/request')

Page({
  data: {
    list: [],
    loadingText: '加载中...',
    isLoading: false,
    isRefreshing: false,
    limit: 20,
    hasMore: true
  },
  onLoad() {
    this.setData({ limit: 20, hasMore: true })
    this.loadData()
  },
  onShow() {
    this.setData({ limit: 20, hasMore: true })
    this.loadData()
  },
  async ensureAuthorized() {
    try {
      await authorizeUser()
      return true
    } catch (e) {
      const msg = e && e.errMsg ? String(e.errMsg) : '授权失败'
      wx.showToast({ title: msg, icon: 'none' })
      return false
    }
  },
  async loadData() {
    const limit = Number(this.data.limit) || 20
    if (this.data.isLoading) return

    this.setData({ isLoading: true, loadingText: '加载中...' })

    try {
      const res = await getMyParticipatedGoods({ limit })
      const list = Array.isArray(res) ? res : []
      const hasMore = list.length >= limit

      this.setData({
        list,
        hasMore,
        isLoading: false,
        isRefreshing: false,
        loadingText: hasMore ? '上拉加载更多' : '没有更多了'
      })
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '加载失败'
      this.setData({
        isLoading: false,
        isRefreshing: false,
        loadingText: '加载失败'
      })

      if (msg === 'need_authorization') {
        wx.showModal({
          title: '需要授权',
          content: '查看我的参团记录需要授权登录。',
          confirmText: '去授权',
          cancelText: '返回',
          success: async (res) => {
            if (!res.confirm) {
              wx.navigateBack()
              return
            }
            const ok = await this.ensureAuthorized()
            if (!ok) return
            this.setData({ limit: 20, hasMore: true, isRefreshing: true })
            this.loadData()
          }
        })
        return
      }

      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  onRefresherRefresh() {
    this.setData({ limit: 20, hasMore: true, isRefreshing: true })
    this.loadData()
  },
  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) return
    const nextLimit = (Number(this.data.limit) || 20) + 20
    this.setData({ limit: nextLimit })
    this.loadData()
  },
  onGoodsTap(e) {
    const goods = e && e.detail && e.detail.item ? e.detail.item : null
    if (!goods || !goods.id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${goods.id}` })
  }
})

