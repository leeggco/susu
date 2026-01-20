Component({
  properties: {
    item: {
      type: Object,
      value: null,
      observer(item) {
        if (!item) return
        this.setupData(item)
      }
    }
  },
  data: {
    savePrice: '',
    groupSize: 3,
    remainCount: 0,
    countdown: { h: '00', m: '00', s: '00', ms: '0' },
    imageStatus: 'idle',
    imageErrorText: ''
  },
  lifetimes: {
    detached() {
      this.stopTimer()
    }
  },
  methods: {
    setupData(item) {
      const savePrice = (item.original_price - item.price).toFixed(1)
      const groupSize = item.group_size || 3
      const remainCount = Math.max(0, groupSize - (item.joined_count || 0))
      
      this.setData({
        savePrice,
        groupSize,
        remainCount,
        imageStatus: item && item.image ? 'loading' : 'empty',
        imageErrorText: ''
      })
      
      if (item.end_time) {
        this.startTimer(item.end_time)
      }
    },
    
    onCtaTap() {
      this.triggerEvent('buy', { item: this.properties.item })
    },

    onImageLoad() {
      this.setData({ imageStatus: 'ok', imageErrorText: '' })
    },

    onImageError() {
      this.setData({ imageStatus: 'error' })
      try {
        const key = 'img_domain_tip_shown'
        if (wx.getStorageSync(key)) return
        wx.setStorageSync(key, 1)
        const src = this.properties && this.properties.item && this.properties.item.image ? String(this.properties.item.image) : ''
        const m = src.match(/^https?:\/\/([^/]+)/i)
        const host = m && m[1] ? String(m[1]) : ''
        const domain = host ? `https://${host}` : '图片域名'
        wx.getImageInfo({
          src,
          success: () => {},
          fail: (err) => {
            const errMsg = err && err.errMsg ? String(err.errMsg) : ''
            this.setData({ imageErrorText: errMsg })
          }
        })
        wx.showModal({
          title: '图片未显示',
          content:
            `请在小程序后台「开发-开发设置-服务器域名」中将 ${domain} 加入 downloadFile 合法域名，然后重新编译预览。`,
          showCancel: false
        })
      } catch (e) {}
    },
    
    startTimer(endTime) {
      this.stopTimer()
      
      const tick = () => {
        const now = Date.now()
        const diff = endTime - now
        
        if (diff <= 0) {
          this.setData({ countdown: { h: '00', m: '00', s: '00', ms: '0' } })
          this.stopTimer()
          return
        }
        
        const h = Math.floor(diff / 3600000)
        const m = Math.floor((diff % 3600000) / 60000)
        const s = Math.floor((diff % 60000) / 1000)
        const ms = Math.floor((diff % 1000) / 100) // 1 digit
        
        const pad = (n) => n.toString().padStart(2, '0')
        
        this.setData({
          countdown: {
            h: pad(h),
            m: pad(m),
            s: pad(s),
            ms: ms.toString()
          }
        })
      }
      
      tick()
      this.timer = setInterval(tick, 100)
    },
    
    stopTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }
})
