const { getConfig, buildAuthHeaders, requestJson } = require('../../utils/request')

Page({
  data: {
    goodsList: [],
    loading: false,
    isRefreshing: false,
    offset: 0,
    hasMore: true,
    limit: 20
  },

  onLoad() {
    this.loadData(true)
  },

  onPullDownRefresh() {
    this.setData({ isRefreshing: true })
    this.loadData(true).then(() => {
      this.setData({ isRefreshing: false })
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false)
    }
  },

  async loadData(refresh = false) {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    if (refresh) {
      this.setData({ offset: 0, hasMore: true })
    }

    try {
      const { supabaseFunctionsBaseUrl } = getConfig()
      if (!supabaseFunctionsBaseUrl) {
        throw new Error('请配置 Supabase Functions URL')
      }

      const res = await requestJson(`${supabaseFunctionsBaseUrl}/pdd-recommend`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        data: {
          action: 'get-list',
          offset: this.data.offset,
          limit: this.data.limit,
          channel_type: 5 // Real-time best sellers
        }
      })

      // Parse PDD response structure
      const rawList = res.data && res.data.goods_basic_detail_response && res.data.goods_basic_detail_response.list 
        ? res.data.goods_basic_detail_response.list 
        : []

      const newList = rawList.map(item => {
        const price = (item.min_group_price || 0) / 100
        const discount = (item.coupon_discount || 0) / 100
        return {
          title: item.goods_name,
          price: price,
          original_price: price + discount,
          image: item.goods_thumbnail_url,
          sales_tip: `已售${item.sold_quantity || 0}件`,
          group_size: 2,
          joined_count: 2, // Fake it to look full
          goods_sign: item.goods_sign,
          goods_id: item.goods_id
        }
      })

      this.setData({
        goodsList: refresh ? newList : [...this.data.goodsList, ...newList],
        offset: this.data.offset + newList.length,
        hasMore: newList.length >= this.data.limit
      })

    } catch (err) {
      console.error('Fetch error:', err)
      if (refresh && this.data.goodsList.length === 0) {
         wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  async onTapGoods(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.goods_sign) return

    wx.showLoading({ title: '正在获取优惠...' })

    try {
      const { supabaseFunctionsBaseUrl } = getConfig()
      
      // Get Promotion URL (for commission)
      const res = await requestJson(`${supabaseFunctionsBaseUrl}/pdd-recommend`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        data: {
          action: 'get-promotion-url',
          goods_sign: item.goods_sign
        }
      })

      // Check for PDD Error explicitly
      if (res.data && res.data.error_response) {
        const errMsg = res.data.error_response.error_msg || '未知错误'
        // Common error: PID missing or invalid
        if (errMsg.includes('p_id')) {
           throw new Error('PDD配置错误: 缺少PID')
        }
        throw new Error(`PDD返回: ${errMsg}`)
      }

      const promoList = res.data && res.data.goods_promotion_url_generate_response && res.data.goods_promotion_url_generate_response.goods_promotion_url_list
        ? res.data.goods_promotion_url_generate_response.goods_promotion_url_list
        : []
      
      const target = promoList[0] && promoList[0].we_app_info

      if (target) {
        wx.navigateToMiniProgram({
          appId: target.app_id,
          path: target.page_path,
          fail: (err) => {
            console.error('Jump failed', err)
            // If user cancels, don't show error modal
            if (err.errMsg && err.errMsg.includes('cancel')) return
            
            wx.showModal({
              title: '跳转失败',
              content: '无法打开拼多多小程序: ' + err.errMsg,
              showCancel: false
            })
          }
        })
      } else {
        // No we_app_info found
        if (!promoList || promoList.length === 0) {
            throw new Error('未获取到推广信息，请检查后台 PDD_PID 配置')
        }
        throw new Error('该商品暂不支持小程序直接跳转')
      }

    } catch (err) {
      console.error('Jump error detail:', err)
      wx.hideLoading()
      
      let displayMsg = '无法跳转，请稍后重试'
      if (typeof err === 'string') {
        displayMsg = err
      } else if (err && err.message) {
        displayMsg = err.message
      } else if (err) {
        displayMsg = JSON.stringify(err)
      }

      wx.showModal({ 
        title: '提示', 
        content: displayMsg,
        showCancel: false
      })
    } finally {
      wx.hideLoading()
    }
  }
})
