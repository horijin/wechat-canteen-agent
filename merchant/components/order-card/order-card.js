Component({
  properties: {
    order: { type: Object, value: {} },
    busy: { type: Boolean, value: false },
    showActions: { type: Boolean, value: true }
  },
  methods: {
    noop() {},
    openDetail() {
      this.triggerEvent("detail", { id: this.data.order.id })
    },
    advance() {
      const order = this.data.order
      if (!order._nextStatus || this.data.busy) return
      this.triggerEvent("advance", { id: order.id, status: order._nextStatus })
    },
    cancel() {
      if (this.data.busy) return
      this.triggerEvent("cancel", { id: this.data.order.id })
    }
  }
})
