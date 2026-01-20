const { getGoodsList, getAuthSkipped, setAuthSkipped, authorizeUser, getCurrentUser } = require('../../utils/request')

const noticeNames = [
  '小雨',
  '阿Ken',
  '小北',
  '小乐',
  '小夕',
  '可可',
  '安妮',
  '小白',
  '阿宝',
  '海星'
]

const randomPick = (list) => list[Math.floor(Math.random() * list.length)]

const getShortTitle = (title) => title.replace(/【.*?】/g, '').slice(0, 10)

const buildNoticeList = (goodsList) =>
  goodsList.slice(0, 12).map((item) => ({
    text: `用户${randomPick(noticeNames)}抢到了${getShortTitle(item.title)}`,
    time: Math.random() > 0.7 ? '刚刚' : '1分钟前'
  }))

Page({
  data: {
    goodsList: [],
    noticeList: [],
    loadingText: '上拉加载更多',
    isLoading: false,
    isRefreshing: false,
    searchValue: '',
    hasMore: true,
    offset: 0
  },
  async loadHomeData({ reset = false } = {}) {
    const limit = 20
    const nextOffset = reset ? 0 : Number(this.data.offset) || 0
    const query = String(this.data.searchValue || '').trim()

    if (!reset && (!this.data.hasMore || this.data.isLoading)) {
      return
    }

    this.setData({
      isLoading: true,
      loadingText: '加载中...'
    })

    try {
      const res = await getGoodsList({ limit, offset: nextOffset, query })
      const list = res && Array.isArray(res.list) ? res.list : []
      const merged = reset ? list : this.data.goodsList.concat(list)
      const hasMore = res && typeof res.hasMore === 'boolean' ? res.hasMore : list.length === limit
      const newOffset = nextOffset + list.length

      this.setData({
        goodsList: merged,
        noticeList: buildNoticeList(merged),
        hasMore,
        offset: newOffset,
        loadingText: hasMore ? '上拉加载更多' : '没有更多了',
        isLoading: false,
        isRefreshing: false
      })
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '加载失败'
      this.setData({
        isLoading: false,
        isRefreshing: false,
        loadingText: '加载失败'
      })
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  onSearchInput(e) {
    this.setData({
      searchValue: e.detail.value
    })
  },
  onSearchConfirm() {
    const { searchValue } = this.data
    if (!String(searchValue || '').trim()) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }
    this.setData({ offset: 0, hasMore: true })
    this.loadHomeData({ reset: true })
  },
  onLoad() {
    this.setData({ offset: 0, hasMore: true })
    this.loadHomeData({ reset: true })

    const current = getCurrentUser()
    if (!current && !getAuthSkipped()) {
      wx.showModal({
        title: '授权登录',
        content: '首次进入需要授权获取昵称和头像，用于关联发布与参团记录。',
        confirmText: '去授权',
        cancelText: '暂不',
        success: async (res) => {
          if (!res.confirm) {
            setAuthSkipped(true)
            return
          }
          try {
            await authorizeUser()
            wx.showToast({ title: '授权成功', icon: 'success' })
          } catch (e) {
            const msg = e && e.errMsg ? String(e.errMsg) : '授权失败'
            wx.showToast({ title: msg, icon: 'none' })
          }
        }
      })
    }
  },
  onShow() {
    this.setData({ offset: 0, hasMore: true })
    this.loadHomeData({ reset: true })
  },
  onRefresherRefresh() {
    this.setData({ offset: 0, hasMore: true, isRefreshing: true })
    this.loadHomeData({ reset: true })
  },
  onReachBottom() {
    this.loadHomeData({ reset: false })
  },
  handleBuyClick(e) {
    const { item: goods } = e.detail
    if (!goods) return

    wx.navigateTo({
      url: `/pages/detail/detail?id=${goods.id}`,
      fail: (err) => {
        console.error('Navigation failed:', err)
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        })
      }
    })
  }
})
