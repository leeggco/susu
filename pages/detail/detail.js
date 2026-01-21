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
    relatedGoods: [],
    heroRemainCount: 0,
    heroGroupSize: 3,
    heroCountdown: { h: '00', m: '00', s: '00', ms: '0' },
    heroHasEndTime: false,
    heroImageStatus: 'idle'
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
      this.setupHero(goods)
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      const msg = e && e.message ? String(e.message) : '加载失败'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  onUnload() {
    this.stopHeroTimer()
  },
  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  setupHero(goods) {
    const groupSize = goods && goods.group_size ? Number(goods.group_size) : 3
    const joined = goods && typeof goods.joined_count === 'number' ? goods.joined_count : 0
    const remain = Math.max(0, groupSize - Math.max(0, joined))
    const hasEndTime = Boolean(goods && goods.end_time)
    const imageStatus = goods && goods.image ? 'loading' : 'empty'
    this.setData({
      heroGroupSize: groupSize,
      heroRemainCount: remain,
      heroHasEndTime: hasEndTime,
      heroImageStatus: imageStatus
    })
    if (hasEndTime) this.startHeroTimer(goods.end_time)
  },

  startHeroTimer(endTime) {
    this.stopHeroTimer()
    const tick = () => {
      const now = Date.now()
      const diff = endTime - now
      if (diff <= 0) {
        this.setData({ heroCountdown: { h: '00', m: '00', s: '00', ms: '0' } })
        this.stopHeroTimer()
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      const ms = Math.floor((diff % 1000) / 100)
      const pad = (n) => n.toString().padStart(2, '0')
      this.setData({
        heroCountdown: {
          h: pad(h),
          m: pad(m),
          s: pad(s),
          ms: ms.toString()
        }
      })
    }
    tick()
    this.heroTimer = setInterval(tick, 100)
  },

  stopHeroTimer() {
    if (this.heroTimer) {
      clearInterval(this.heroTimer)
      this.heroTimer = null
    }
  },

  onHeroImageLoad() {
    this.setData({ heroImageStatus: 'ok' })
  },

  onHeroImageError() {
    this.setData({ heroImageStatus: 'error' })
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

    try {
      await ensureUser({ interactive: true })
    } catch (e) {
      wx.showToast({ title: '需要先授权登录', icon: 'none' })
      return
    }

    try {
      await addParticipation({ postId: goods.id, action: 'click_buy' })
    } catch (e) {}

    const orderLink = goods.order_link ? String(goods.order_link) : ''

    if ((goods.platform === '拼多多' || goods.platform === 'PDD') && orderLink) {
      const candidates = []
      const mainPath = getPddPathFromOrderLink(orderLink)
      if (mainPath) candidates.push(mainPath)
      if (orderLink.startsWith('http://') || orderLink.startsWith('https://')) {
        candidates.push(`pages/web/web?specialUrl=1&src=${encodeURIComponent(orderLink)}`)
      }

      const unique = Array.from(new Set(candidates)).filter(Boolean)

      wx.showLoading({ title: '正在跳转...', mask: true })
      let success = false
      for (const p of unique) {
        success = await tryNavigateToPdd(p, orderLink)
        if (success) break
      }
      wx.hideLoading()

      // if (!success) {
      //   wx.showModal({
      //     title: '跳转失败',
      //     content: '无法跳转拼多多小程序，建议复制链接后手动打开拼多多。',
      //     confirmText: '复制链接',
      //     success: (res) => {
      //       if (!res.confirm) return
      //       wx.setClipboardData({
      //         data: orderLink,
      //         success: () => {
      //           wx.showToast({ title: '链接已复制', icon: 'success' })
      //         }
      //       })
      //     }
      //   })
      // }
      return
    }

    if (!orderLink) {
      wx.showToast({ title: '暂无跳转链接', icon: 'none' })
      return
    }

    wx.showModal({
      title: '打开拼团链接',
      content: '已为你准备好链接，复制后到对应 App 打开。',
      confirmText: '复制链接',
      success: (res) => {
        if (!res.confirm) return
        wx.setClipboardData({
          data: orderLink,
          success: () => {
            wx.showToast({ title: '链接已复制', icon: 'success' })
          }
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
