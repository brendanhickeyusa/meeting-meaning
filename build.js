// Packages the already-downloaded Windows runtime without fetching another copy.
const fs=require('node:fs');const path=require('node:path');
const target=path.resolve(__dirname,'../Windows/MeetingMeaning');
fs.mkdirSync(target,{recursive:true});
fs.cpSync(path.join(__dirname,'node_modules/electron/dist'),target,{recursive:true});
fs.renameSync(path.join(target,'electron.exe'),path.join(target,'MeetingMeaning.exe'));
const dest=path.join(target,'resources/app');fs.mkdirSync(dest,{recursive:true});
for(const name of ['package.json','main.js','preload.js','core.js','providers.js','renderer.js','capture-worklet.js','index.html','style.css'])fs.copyFileSync(path.join(__dirname,name),path.join(dest,name));
fs.cpSync(path.join(__dirname,'node_modules/ws'),path.join(dest,'node_modules/ws'),{recursive:true});
fs.copyFileSync(path.join(__dirname,'README.md'),path.join(target,'START-HERE.md'));
console.log(target);
