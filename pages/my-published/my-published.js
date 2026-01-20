const { getMyPublishedGoods, authorizeUser } = require('../../utils/request')

Page({
  data: {
    list: [],
    loadingText: '加载中...',
    isLoading: false,
    isRefreshing: false,
    hasMore: true,
    offset: 0
  },
  onLoad() {
    this.setData({ offset: 0, hasMore: true })
    this.loadData({ reset: true })
  },
  onShow() {
    this.setData({ offset: 0, hasMore: true })
    this.loadData({ reset: true })
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
  async loadData({ reset = false } = {}) {
    const limit = 20
    const nextOffset = reset ? 0 : Number(this.data.offset) || 0

    if (!reset && (!this.data.hasMore || this.data.isLoading)) {
      return
    }

    this.setData({ isLoading: true, loadingText: '加载中...' })

    try {
      const res = await getMyPublishedGoods({ limit, offset: nextOffset })
      const list = res && Array.isArray(res.list) ? res.list : []
      const merged = reset ? list : this.data.list.concat(list)
      const hasMore = res && typeof res.hasMore === 'boolean' ? res.hasMore : list.length === limit
      const newOffset = nextOffset + list.length

      this.setData({
        list: merged,
        hasMore,
        offset: newOffset,
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
          content: '查看我的发布记录需要授权登录。',
          confirmText: '去授权',
          cancelText: '返回',
          success: async (res) => {
            if (!res.confirm) {
              wx.navigateBack()
              return
            }
            const ok = await this.ensureAuthorized()
            if (!ok) return
            this.setData({ offset: 0, hasMore: true, isRefreshing: true })
            this.loadData({ reset: true })
          }
        })
        return
      }

      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  onRefresherRefresh() {
    this.setData({ offset: 0, hasMore: true, isRefreshing: true })
    this.loadData({ reset: true })
  },
  onReachBottom() {
    this.loadData({ reset: false })
  },
  onGoodsTap(e) {
    const goods = e && e.detail && e.detail.item ? e.detail.item : null
    if (!goods || !goods.id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${goods.id}` })
  }
})

