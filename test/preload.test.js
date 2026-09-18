const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
test('event subscription never returns the Electron IPC object across the bridge',()=>{
 let api,handler;const ipc={on:(_event,fn)=>{handler=fn;return ipc;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},ipcRenderer:ipc})});
 let received;assert.equal(api.listen(value=>received=value),undefined);handler({}, {type:'status',data:'ready'});assert.equal(received.data,'ready');
});
