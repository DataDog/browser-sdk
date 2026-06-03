export function getScrollX() {
  let scrollX
  const visual = window.visualViewport
  if (visual) {
    scrollX = visual.pageLeft - visual.offsetLeft
  } else if (window.scrollX !== undefined) {
    scrollX = window.scrollX
  } else {
    scrollX = window.pageXOffset || 0
  }
  return Math.round(scrollX)
}

export function getScrollY() {
  let scrollY
  const visual = window.visualViewport
  if (visual) {
    scrollY = visual.pageTop - visual.offsetTop
  } else if (window.scrollY !== undefined) {
    scrollY = window.scrollY
  } else {
    scrollY = window.pageYOffset || 0
  }
  return Math.round(scrollY)
}
