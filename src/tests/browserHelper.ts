export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function isIE(version: number) {
  const ua = navigator.userAgent.toLowerCase();
  return ua.indexOf("msie") !== -1 && parseInt(ua.split("msie")[1], 10) === version;
}

export function isAndroid() {
  return /android/i.test(navigator.userAgent);
}
