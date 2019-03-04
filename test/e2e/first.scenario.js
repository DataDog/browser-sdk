const expect = require('chai').expect

describe('scenario', () => {
  it('should open browser', () => {
    browser.url('http://localhost:8000/')
    expect(browser.getUrl()).to.equal('http://localhost:8000/')
  })
})
