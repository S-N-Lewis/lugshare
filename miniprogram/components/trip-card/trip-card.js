// components/trip-card/trip-card.js
const { fromNow, money } = require('../../utils/format.js');

Component({
  properties: {
    trip: { type: Object, value: {} }
  },
  data: {
    ago: '',
    feeText: '',
    remainKg: 0
  },
  observers: {
    'trip': function (t) {
      if (!t || !t._id) return;
      const remain = (Number(t.capacityKg) || 0) - (Number(t.usedKg) || 0);
      let fee = '面议';
      if (Number(t.pricePerKg) > 0) {
        fee = `¥${money(t.pricePerKg)}/kg` + (Number(t.minFee) > 0 ? ` 起¥${money(t.minFee)}` : '');
      }
      this.setData({
        ago: fromNow(t.createdAt),
        feeText: fee,
        remainKg: Math.max(0, Math.round(remain * 10) / 10)
      });
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.trip._id });
    }
  }
});
