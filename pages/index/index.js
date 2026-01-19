const { getGoodsList } = require('../../utils/mock')

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
  goodsList.slice(0, 12).map((item) => `用户${randomPick(noticeNames)}刚刚抢到了${getShortTitle(item.title)}`)

Page({
  data: {
    goodsList: [],
    noticeList: [],
    loadingText: '上拉加载更多',
    isLoading: false,
    isRefreshing: false,
    searchValue: ''
  },
  onSearchInput(e) {
    this.setData({
      searchValue: e.detail.value
    })
  },
  onSearchConfirm() {
    const { searchValue } = this.data
    if (!searchValue.trim()) {
      wx.showToast({
        title: '请输入搜索内容',
        icon: 'none'
      })
      return
    }
    wx.showToast({
      title: `搜索：${searchValue}`,
      icon: 'none'
    })
  },
  onLoad() {
    const goodsList = getGoodsList()
    this.setData({
      goodsList,
      noticeList: buildNoticeList(goodsList)
    })
  },
  onRefresherRefresh() {
    const goodsList = getGoodsList()
    this.setData({
      goodsList,
      noticeList: buildNoticeList(goodsList),
      loadingText: '上拉加载更多',
      isRefreshing: false
    })
  },
  onReachBottom() {
    if (this.data.isLoading) {
      return
    }
    // Limit to 20 items
    if (this.data.goodsList.length >= 20) {
      this.setData({ loadingText: '没有更多了' })
      return
    }

    this.setData({ isLoading: true, loadingText: '加载中...' })
    const moreList = getGoodsList(10) // Load fewer items if needed, or just standard batch
    
    // Check if adding moreList exceeds 20
    let nextList = this.data.goodsList.concat(moreList)
    if (nextList.length > 20) {
        nextList = nextList.slice(0, 20)
    }

    this.setData({
      goodsList: nextList,
      loadingText: nextList.length >= 20 ? '没有更多了' : '已为你加载更多',
      isLoading: false
    })
  },
  handleGoodsTap(event) {
    const id = event.currentTarget.dataset.id
    // Use loose equality to handle potential string/number mismatch
    const goods = this.data.goodsList.find((item) => item.id == id)
    if (!goods) {
      console.error('Goods not found:', id)
      return
    }
    console.log('Navigating to:', goods.path)
    wx.navigateTo({
      url: goods.path,
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
