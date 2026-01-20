const { getGoodsById, getRelatedGoods, addParticipation, ensureUser } = require('../../utils/request')

const PDD_APP_ID = 'wx32540bd863b27570'

const extractQueryValue = (url, key) => {
  const qIndex = url.indexOf('?')
  if (qIndex < 0) return ''
  const query = url.slice(qIndex + 1)
  const parts = query.split('&')
  for (const part of parts) {
    const [k, v = ''] = part.split('=')
    if (k === key) {
      try {
        return decodeURIComponent(v)
      } catch (e) {
        return v
      }
    }
  }
  return ''
}

const normalizeMiniProgramPath = (maybePath) => {
  if (!maybePath) return ''
  const s = String(maybePath).trim()
  if (!s) return ''
  if (s.startsWith('pages/') || s.startsWith('package_')) return s
  const idx1 = s.indexOf('pages/')
  if (idx1 >= 0) return s.slice(idx1)
  const idx2 = s.indexOf('package_')
  if (idx2 >= 0) return s.slice(idx2)
  return ''
}

const getPddPathFromOrderLink = (orderLink) => {
  if (!orderLink) return ''
  const raw = String(orderLink).trim()
  if (!raw) return ''

  // 1. If it's already a mini-program path, return it
  const direct = normalizeMiniProgramPath(raw)
  if (direct) return direct

  // 2. If it's a PDD domain URL
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const isPddDomain = raw.includes('pinduoduo.com') || raw.includes('yangkeduo.com')
    
    // Try to extract page_path first
    const pagePath = extractQueryValue(raw, 'page_path') || extractQueryValue(raw, 'pagePath') || extractQueryValue(raw, 'path')
    const normalized = normalizeMiniProgramPath(pagePath)
    if (normalized) return normalized

    if (isPddDomain) {
      return `pages/web/web?specialUrl=1&src=${encodeURIComponent(raw)}`
    }
  }

  return ''
}

const tryNavigateToPdd = (path, orderLink) => {
  return new Promise((resolve) => {
    wx.navigateToMiniProgram({
      appId: PDD_APP_ID,
      path,
      envVersion: 'release',
      success: () => resolve(true),
      fail: (err) => {
        console.error('PDD Navigation failed with path:', path, err)
        resolve(false)
      }
    })
  })
}

Page({
  data: {
    goods: null,
    relatedGoods: []
  },
  async onLoad(query) {
    const goodsId = query && query.id ? String(query.id) : ''
    if (!goodsId) {
      wx.showToast({ title: '缺少商品ID', icon: 'none' })
      return
    }

    wx.showLoading({ title: '加载中...', mask: true })
    try {
      const goods = await getGoodsById(goodsId)
      if (!goods) {
        wx.hideLoading()
        wx.showToast({ title: '商品不存在', icon: 'none' })
        return
      }

      const related = await getRelatedGoods({
        platform: goods.platform === '拼多多' ? 'pdd' : undefined,
        excludeId: goods.id,
        limit: 4
      })

      this.setData({
        goods,
        relatedGoods: related || []
      })
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      const msg = e && e.message ? String(e.message) : '加载失败'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  onCopyOrderLink() {
    const goods = this.data.goods
    if (!goods || !goods.order_link) return
    wx.setClipboardData({
      data: goods.order_link,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },
  async handleBuyClick(e) {
    const goods = e && e.detail && e.detail.item ? e.detail.item : this.data.goods
    if (!goods) {
      return
    }

    if (this.data.goods && String(goods.id) !== String(this.data.goods.id)) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${goods.id}`
      })
      return
    }

    if ((goods.platform === '拼多多' || goods.platform === 'PDD') && goods.order_link) {
      try {
        await ensureUser({ interactive: true })
      } catch (e) {
        wx.showToast({ title: '需要先授权登录', icon: 'none' })
        return
      }

      try {
        await addParticipation({ postId: goods.id, action: 'click_buy' })
      } catch (e) {}

      const orderLink = goods.order_link
      console.log('%c [ orderLink ]-150', 'font-size:13px; background:pink; color:#bf2c9f;', orderLink)
      const path = getPddPathFromOrderLink(orderLink)
      
      wx.showLoading({ title: '正在跳转...', mask: true })
      
      let success = await tryNavigateToPdd(path, orderLink)
      
      // If the first path fails OR it's a short link and we want to try an alternative
      const isShortLink = orderLink.includes('pinduoduo.com') || orderLink.includes('yangkeduo.com')
      if (!success && isShortLink) {
        // Try multiple common PDD proxy paths
        const altPaths = [
          `pages/web/web?specialUrl=1&src=${encodeURIComponent(orderLink)}`,
          `pages/web/web?src=${encodeURIComponent(orderLink)}`,
          `pages/web/web?url=${encodeURIComponent(orderLink)}`,
          `package_a/promotion_url/promotion_url?url=${encodeURIComponent(orderLink)}`,
          `package_a/welfare_coupon/welfare_coupon?url=${encodeURIComponent(orderLink)}`
        ]
        
        for (const altPath of altPaths) {
          console.log('%c [ altPath ]-170', 'font-size:13px; background:pink; color:#bf2c9f;', altPath)
          success = await tryNavigateToPdd(altPath, orderLink)
          if (success) break
        }
      }

      wx.hideLoading()

      if (!success) {
        wx.showModal({
          title: '跳转失败',
          content: '无法跳转拼多多小程序，建议复制链接后手动打开拼多多。',
          confirmText: '复制链接',
          success: (res) => {
            if (res.confirm) {
              wx.setClipboardData({
                data: orderLink,
                success: () => {
                  wx.showToast({ title: '链接已复制', icon: 'success' })
                }
              })
            }
          }
        })
      }
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
  },
  onShareAppMessage() {
    const goods = this.data.goods
    const id = goods && goods.id ? String(goods.id) : ''
    const title = goods && goods.title ? String(goods.title) : '拼团详情'
    const imageUrl = goods && goods.image ? String(goods.image) : ''
    const path = id ? `/pages/detail/detail?id=${encodeURIComponent(id)}` : '/pages/index/index'
    return {
      title,
      path,
      imageUrl
    }
  }
})
