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
    countdown: { h: '00', m: '00', s: '00', ms: '0' }
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
      })
      
      if (item.end_time) {
        this.startTimer(item.end_time)
      }
    },
    
    onCtaTap() {
      this.triggerEvent('buy', { item: this.properties.item })
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
