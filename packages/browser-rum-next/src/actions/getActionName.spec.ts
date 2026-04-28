import { getActionName } from './getActionName'

describe('getActionName', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('returns data-dd-action-name when present', () => {
    const el = document.createElement('div')
    el.setAttribute('data-dd-action-name', 'My Action')
    container.appendChild(el)
    expect(getActionName(el)).toEqual({ name: 'My Action', nameSource: 'custom_attribute' })
  })

  it('walks up DOM for data-dd-action-name', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-dd-action-name', 'Parent Action')
    const child = document.createElement('span')
    parent.appendChild(child)
    container.appendChild(parent)
    expect(getActionName(child)).toEqual({ name: 'Parent Action', nameSource: 'custom_attribute' })
  })

  it('returns button text content', () => {
    const btn = document.createElement('button')
    btn.textContent = 'Click Me'
    container.appendChild(btn)
    expect(getActionName(btn)).toEqual({ name: 'Click Me', nameSource: 'text_content' })
  })

  it('returns input label text', () => {
    const label = document.createElement('label')
    label.textContent = 'Email'
    label.setAttribute('for', 'email-input')
    const input = document.createElement('input')
    input.id = 'email-input'
    container.appendChild(label)
    container.appendChild(input)
    expect(getActionName(input).name).toBe('Email')
  })

  it('returns input value for submit buttons', () => {
    const input = document.createElement('input')
    input.type = 'submit'
    input.value = 'Submit Form'
    container.appendChild(input)
    expect(getActionName(input)).toEqual({ name: 'Submit Form', nameSource: 'standard_attribute' })
  })

  it('returns aria-label', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-label', 'Close dialog')
    container.appendChild(el)
    expect(getActionName(el)).toEqual({ name: 'Close dialog', nameSource: 'standard_attribute' })
  })

  it('returns fallback text content', () => {
    const el = document.createElement('div')
    el.textContent = 'Some text'
    container.appendChild(el)
    expect(getActionName(el)).toEqual({ name: 'Some text', nameSource: 'text_content' })
  })

  it('returns empty string when no name found', () => {
    const el = document.createElement('div')
    container.appendChild(el)
    expect(getActionName(el)).toEqual({ name: '', nameSource: 'blank' })
  })

  it('truncates to 100 chars', () => {
    const el = document.createElement('button')
    el.textContent = 'a'.repeat(150)
    container.appendChild(el)
    const result = getActionName(el)
    expect(result.name.length).toBe(106) // 100 + ' [...]' (6 chars)
    expect(result.name.endsWith(' [...]')).toBe(true)
  })

  it('normalizes whitespace', () => {
    const el = document.createElement('button')
    el.textContent = '  Click   Me  \n Now  '
    container.appendChild(el)
    expect(getActionName(el).name).toBe('Click Me Now')
  })
})
