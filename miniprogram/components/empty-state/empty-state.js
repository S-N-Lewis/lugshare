Component({
  properties: {
    text: { type: String, value: '暂无数据' },
    buttonText: { type: String, value: '' }
  },
  methods: {
    onAction() { this.triggerEvent('action'); }
  }
});
