/* 檔案用途：邊播邊收集最多二十秒的音量，不保存音訊。所在層：Web Audio 執行緒。主要關聯：metronome.js、tempo.js。 */
const scope = /** @type {{AudioWorkletProcessor: new()=>{port:MessagePort}, sampleRate:number, registerProcessor:(name:string, processor:unknown)=>void}} */ (/** @type {unknown} */ (globalThis));
class TempoEnvelope extends scope.AudioWorkletProcessor {
  constructor() {
    super(); this.requestId = 0; this.active = false; this.sum = 0; this.count = 0; this.values = /** @type {number[]} */ ([]);
    this.port.onmessage = event => {
      if (event.data?.type === 'start') { this.requestId = event.data.id; this.values = []; this.sum = 0; this.count = 0; this.active = true; }
      if (event.data === 'stop') this.finish();
      if (event.data === 'cancel') { this.active = false; this.values = []; }
    };
  }
  finish() { if (this.active) { this.active = false; this.port.postMessage({ id: this.requestId, values: this.values }); this.values = []; } }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    // 原聲直通才能邊聽邊校正；只取音量包絡，記憶體不隨影片長度成長。
    for (let c = 0; c < output.length; c++) output[c].set(input[c] ?? input[0] ?? new Float32Array(output[c].length));
    if (this.active && input[0]) for (let i = 0; i < input[0].length; i++) {
      let mono = 0; for (const channel of input) mono += channel[i] ** 2 / input.length;
      this.sum += mono; this.count++;
      if (this.count >= Math.round(scope.sampleRate / 100)) { this.values.push(Math.sqrt(this.sum / this.count)); this.sum = 0; this.count = 0; }
      if (this.values.length >= 2000) { this.finish(); break; }
    }
    return true;
  }
}
scope.registerProcessor('tempo-envelope', TempoEnvelope);
