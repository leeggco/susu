Component({
  properties: {
    messages: {
      type: Array,
      value: [],
      observer(list) {
        if (!Array.isArray(list) || list.length === 0) {
          this.setData({ currentText: '', currentIndex: 0 })
          return
        }
        this.setData({ currentText: list[0], currentIndex: 0 })
      }
    }
  },
  data: {
    currentText: '',
    currentIndex: 0
  },
  lifetimes: {
    attached() {
      this.startLoop()
    },
    detached() {
      this.stopLoop()
    }
  },
  methods: {
    startLoop() {
      this.stopLoop()
      this._timer = setInterval(() => {
        const list = this.data.messages || []
        if (list.length === 0) {
          return
        }
        const nextIndex = (this.data.currentIndex + 1) % list.length
        this.setData({
          currentIndex: nextIndex,
          currentText: list[nextIndex]
        })
      }, 2600)
    },
    stopLoop() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
    }
  }
})
