describe('developer-extension', () => {
  it('should switch between tabs', async () => {
    const panel = new DeveloperExtensionPanel()
    await panel.open()
    expect(await panel.getSelectedTab()).toEqual('Events')

    await panel.getTab('Infos').click()
    expect(await panel.getSelectedTab()).toEqual('Infos')
  })
})

class DeveloperExtensionPanel {
  async open() {
    await browser.url('chrome://extensions')
    const extensionId = await $('>>>extensions-item').getAttribute('id')
    const url = `chrome-extension://${extensionId}/panel.html`
    await browser.url(url)
    expect(await browser.getUrl()).toEqual(url)
  }

  getSelectedTab() {
    return $("button[role='tab'][aria-selected='true']").getText()
  }

  getTab(content: string) {
    return $(`button[role='tab']=${content}`)
  }
}
