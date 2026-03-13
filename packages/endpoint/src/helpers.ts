/**
 * Inline browser helper functions embedded in generated bundles.
 * Minimal vanilla JS — no dependencies, no transpilation needed.
 */
export const INLINE_HELPERS = `\
function __dd_getCookie(n){var m=document.cookie.match(new RegExp('(?:^|; )'+encodeURIComponent(n)+'=([^;]*)'));return m?decodeURIComponent(m[1]):undefined}
function __dd_getJs(p){try{return p.split('.').reduce(function(o,k){return o[k]},window)}catch(e){return undefined}}
function __dd_getDomText(s){try{var e=document.querySelector(s);return e?e.textContent:undefined}catch(e){return undefined}}
function __dd_getDomAttr(s,a){try{var e=document.querySelector(s);return e?e.getAttribute(a):undefined}catch(e){return undefined}}
function __dd_getLocalStorage(k){try{return localStorage.getItem(k)}catch(e){return undefined}}
function __dd_extract(v,p){if(v==null)return undefined;var m=new RegExp(p).exec(String(v));return m?m[1]!==undefined?m[1]:m[0]:undefined}`
