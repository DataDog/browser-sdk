export function lazyLoadRecorder() {
  return import(/* webpackChunkName: "recorder" */ './startRecording').then((module) => module.startRecording)
}
