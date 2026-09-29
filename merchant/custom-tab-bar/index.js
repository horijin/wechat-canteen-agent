Component({
  data: {
    selected: 0,
    badgeCount: 0,
    list: [
      {
        pagePath: "/pages/dashboard/dashboard",
        text: "工作台",
        iconPath: "/assets/tabbar/dashboard.png",
        selectedIconPath: "/assets/tabbar/dashboard-active.png"
      },
      {
        pagePath: "/pages/orders/orders",
        text: "订单",
        iconPath: "/assets/tabbar/orders.png",
        selectedIconPath: "/assets/tabbar/orders-active.png"
      },
      {
        pagePath: "/pages/menu/menu",
        text: "菜单",
        iconPath: "/assets/tabbar/menu.png",
        selectedIconPath: "/assets/tabbar/menu-active.png"
      },
      {
        pagePath: "/pages/settings/settings",
        text: "设置",
        iconPath: "/assets/tabbar/settings.png",
        selectedIconPath: "/assets/tabbar/settings-active.png"
      }
    ]
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      wx.switchTab({ url: data.path })
    },

    setBadge(count) {
      this.setData({ badgeCount: count })
    }
  }
})