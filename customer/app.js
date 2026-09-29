App({
  globalData: {
    baseUrl: 'http://127.0.0.1:8000',
    userInfo: {  
      customer_name: "刘同学",
      customer_no: "ST20260003"
    },
    cartMap: {}
  },

  request(optionsOrUrl, methodOrData = 'GET', rawData = {}) {
    let relativeUrl = ''
    let httpMethod = 'GET'
    let requestData = {}
    let header = { 'content-type': 'application/json' }

    // 1. 参数解析与标准化
    if (typeof optionsOrUrl === 'object' && optionsOrUrl !== null) {
      relativeUrl = optionsOrUrl.url || ''
      httpMethod = (optionsOrUrl.method || 'GET').toUpperCase()
      requestData = optionsOrUrl.data || {}
      if (optionsOrUrl.header) {
        header = { ...header, ...optionsOrUrl.header }
      }
    } else {
      relativeUrl = optionsOrUrl || ''
      if (typeof methodOrData === 'string') {
        httpMethod = methodOrData.toUpperCase()
        requestData = rawData
      } else {
        requestData = methodOrData || {}
      }
    }

    // 2. 
    let base = this.globalData.baseUrl.replace(/\/+$/, '')
    
    if (!relativeUrl.startsWith('/')) {
      relativeUrl = '/' + relativeUrl
    }
    const fullUrl = base + relativeUrl

    // 3. 执行微信原生请求
    return new Promise((resolve, reject) => {
      wx.request({
        url: fullUrl,
        method: httpMethod,
        data: requestData,
        header: header,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            const errorMsg = res.data?.detail || `请求失败(${res.statusCode})`
            wx.showToast({ title: errorMsg, icon: 'none' })
            reject(new Error(errorMsg))
          }
        },
        fail: (err) => {
          wx.showToast({ title: '网络连接异常', icon: 'none' })
          reject(err)
        }
      })
    })
  },

  // 获取当前日期字符串 (YYYY-MM-DD)[cite: 3]
  today() {
   const d = new Date()
   const pad = (n) => String(n).padStart(2, "0")
   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
})

