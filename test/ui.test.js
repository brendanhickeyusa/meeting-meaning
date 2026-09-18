const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
test('browser preview opens Settings without a desktop bridge and disables secret entry',async()=>{
 const root=path.join(__dirname,'..');const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only'});const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(w.navigator,'mediaDevices',{value:{enumerateDevices:async()=>[]}});
 w.eval(fs.readFileSync(path.join(root,'renderer.js'),'utf8'));await new Promise(r=>setImmediate(r));
 w.document.getElementById('settings').click();assert.equal(w.document.getElementById('settingsDialog').open,true);
 assert.match(w.document.getElementById('keyStatus').textContent,/Preview only/);assert.equal(w.document.getElementById('deepgram').disabled,true);
 assert.equal(w.document.querySelector('#settingsForm button.primary').disabled,true);assert.equal(w.document.querySelector('#settingsForm [data-close]').disabled,false);
 dom.window.close();
});
test('UI renders untrusted transcript safely and saves selected provider without retaining visible keys',async()=>{
 const root=path.join(__dirname,'..');const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only'});const w=dom.window;let listener,submitted;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(w.navigator,'mediaDevices',{value:{enumerateDevices:async()=>[]}});
 w.companion={listen:fn=>listener=fn,call:async(method,data)=>{if(method==='init')return {settings:{provider:'gemini',mode:'learn',interval:10,maxCalls:60},glossary:[],meeting:null};if(method==='settings'){submitted=data;return {...data,hasGemini:true,gemini:undefined};}}};
 w.eval(fs.readFileSync(path.join(root,'renderer.js'),'utf8'));await new Promise(r=>setImmediate(r));
 listener({type:'meeting',data:{title:'Demo',demo:true,names:{},usage:{calls:0,input:0,output:0},terms:[],segments:[{time:1,speaker:'you',text:'<img src=x onerror=alert(1)>'}]}});
 assert.equal(w.document.querySelectorAll('.utterance').length,1);assert.equal(w.document.querySelector('#transcript img'),null);assert.ok(w.document.querySelector('#transcript').textContent.includes('<img'));
 w.document.getElementById('settings').click();assert.equal(w.document.getElementById('settingsDialog').open,true);assert.equal(w.document.getElementById('provider').value,'gemini');
 w.document.getElementById('gemini').value='fake-test-key';w.document.getElementById('settingsForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));
 assert.equal(submitted.provider,'gemini');assert.equal(submitted.gemini,'fake-test-key');assert.equal(w.document.getElementById('gemini').value,'');assert.equal(w.document.getElementById('settingsDialog').open,false);
 w.document.getElementById('settings').click();assert.match(w.document.getElementById('gemini').placeholder,/Key saved/);assert.match(w.document.getElementById('keyStatus').textContent,/Gemini: key saved/);dom.window.close();
});
test('Settings diagnostics preserve the selected model and show the real service error',async()=>{
 const root=path.join(__dirname,'..');const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only'});const w=dom.window;let tested;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};Object.defineProperty(w.navigator,'mediaDevices',{value:{enumerateDevices:async()=>[]}});
 w.companion={listen:()=>{},call:async(method,data)=>{if(method==='init')return {settings:{provider:'gemini',geminiModel:'gemini-2.5-flash-lite',mode:'learn',interval:10,maxCalls:60,hasGemini:true},glossary:[],meeting:null};if(method==='gemini-models')return ['gemini-3.1-flash-lite'];if(method==='test-definitions'){tested=data;throw Error('Gemini: HTTP 404. Model access unavailable.');}}};
 w.eval(fs.readFileSync(path.join(root,'renderer.js'),'utf8'));await new Promise(r=>setImmediate(r));w.document.getElementById('settings').click();w.document.getElementById('refreshModels').click();await new Promise(r=>setImmediate(r));
 assert.equal(w.document.getElementById('geminiModel').value,'gemini-2.5-flash-lite');assert.match(w.document.getElementById('geminiModel').textContent,/not listed/);
 w.document.getElementById('geminiModel').value='gemini-3.1-flash-lite';w.document.getElementById('testDefinitions').click();await new Promise(r=>setImmediate(r));assert.equal(tested.geminiModel,'gemini-3.1-flash-lite');assert.equal(tested.key,'');assert.match(w.document.getElementById('serviceStatus').textContent,/Model access unavailable/);assert.equal(w.document.getElementById('testDefinitions').disabled,false);dom.window.close();
});
