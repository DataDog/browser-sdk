export const CONTEXT_RESOLUTION_HELPERS = `
function __dd_resolveContextValue(value) {
  if (!value || typeof value !== 'object') { return value; }
  var serializedType = value.rcSerializedType;
  if (serializedType === 'string') { return value.value; }
  if (serializedType !== 'dynamic') { return undefined; }
  var strategy = value.strategy;
  var resolved;
  if (strategy === 'cookie') {
    resolved = __dd_getCookie(value.name);
  } else if (strategy === 'js') {
    resolved = __dd_resolveJsPath(value.path);
  } else if (strategy === 'dom') {
    resolved = __dd_resolveDom(value.selector, value.attribute);
  } else if (strategy === 'localStorage') {
    try { resolved = localStorage.getItem(value.key); } catch(e) { resolved = undefined; }
  }
  if (value.extractor && typeof resolved === 'string') {
    return __dd_extract(value.extractor, resolved);
  }
  return resolved;
}

function __dd_getCookie(name) {
  if (typeof name !== 'string') { return undefined; }
  var match = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + name.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function __dd_resolveJsPath(path) {
  if (typeof path !== 'string' || path === '') { return undefined; }
  var parts = path.split('.');
  var obj = window;
  for (var i = 0; i < parts.length; i++) {
    if (obj == null || !(parts[i] in Object(obj))) { return undefined; }
    obj = obj[parts[i]];
  }
  return obj;
}

function __dd_resolveDom(selector, attribute) {
  var el;
  try { el = document.querySelector(selector); } catch(e) { return undefined; }
  if (!el) { return undefined; }
  if (el.getAttribute('type') === 'password') { return undefined; }
  if (attribute !== undefined) { return el.getAttribute(attribute); }
  return el.textContent;
}

function __dd_extract(extractor, value) {
  try {
    if (typeof extractor.value !== 'string') { return undefined; }
    var match = new RegExp(extractor.value).exec(value);
    return match ? (match[1] !== undefined ? match[1] : match[0]) : undefined;
  } catch(e) { return undefined; }
}
`
