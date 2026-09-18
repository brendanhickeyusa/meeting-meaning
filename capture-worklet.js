class PCM extends AudioWorkletProcessor {
 constructor(){super();this.samples=[];this.level=0;}
 process(inputs){const input=inputs[0];if(input?.[0]){for(let i=0;i<input[0].length;i++){let v=0;for(const channel of input)v+=channel[i]/input.length;this.samples.push(Math.max(-1,Math.min(1,v)));this.level=Math.max(this.level,Math.abs(v));}
 if(this.samples.length>=2048){const pcm=new Int16Array(this.samples.length);for(let i=0;i<pcm.length;i++)pcm[i]=this.samples[i]*(this.samples[i]<0?32768:32767);this.port.postMessage({bytes:pcm.buffer,level:this.level},[pcm.buffer]);this.samples=[];this.level=0;}}
 return true;}
}
registerProcessor('pcm',PCM);
