const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('companion',{
  call:(method,data)=>ipcRenderer.invoke('command',method,data),
  audio:(source,bytes)=>ipcRenderer.send('audio',source,bytes),
  listen:fn=>{ipcRenderer.on('update',(_,data)=>fn(data));}
});
