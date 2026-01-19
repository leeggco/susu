const { getGoodsList, getGoodsById } = require('../../utils/mock')

Page({
  data: {
    goods: null
  },
  onLoad(query) {
    const goodsId = Number(query.id)
    // Try to find in cache first, otherwise generate a list (which populates cache)
    let goods = getGoodsById(goodsId)
    
    if (!goods) {
       // Fallback: This shouldn't happen if navigating from list, 
       // but if deep linking, we might need to generate some data.
       const list = getGoodsList() 
       goods = getGoodsById(goodsId) || list[0]
    }
    
    this.setData({ goods })
  },
  handleBuyClick() {
    const goods = this.data.goods
    if (!goods) {
      return
    }
    wx.showModal({
      title: '提示',
      content: '正在为您接入拼多多补贴频道...',
      showCancel: false,
      success: () => {
        // CPS 导购跳转到目标小程序完成交易
        wx.navigateToMiniProgram({
          appId: goods.app_id,
          path: goods.path
        })
      }
    })
  }
})
