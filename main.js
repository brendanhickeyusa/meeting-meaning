const {app,BrowserWindow,ipcMain,session,desktopCapturer,safeStorage,dialog,shell}=require('electron');
const path=require('node:path'); const fs=require('node:fs'); const crypto=require('node:crypto'); const WebSocket=require('ws');
const {atomic,read,matches,normalize,segments,transcript,updateKeys}=require('./core');
const {providers,generateDefinitions,listGeminiModels}=require('./providers');
// Preserve the original profile and its Windows-protected keys after renaming.
app.setPath('userData',path.join(app.getPath('appData'),'meeting-companion'));
const dataRoot=process.env.COMPANION_DATA_DIR || path.join(app.getPath('userData'),'library');
if(process.env.COMPANION_DATA_DIR) app.setPath('userData',path.resolve(process.env.COMPANION_DATA_DIR,'runtime'));
let win,settings,glossary,meeting=null,active=false,stopping=false,streams=new Map(),timer,analysisBusy=false,analysisPaused=false,lastAnalyzed=0;
const settingsFile=path.join(dataRoot,'settings.json'), glossaryFile=path.join(dataRoot,'glossary.json');
const defaults={interval:10,maxCalls:60,mode:'learn',provider:'gemini',geminiModel:'gemini-3.5-flash-lite'};
const decrypt=v=>v?safeStorage.decryptString(Buffer.from(v,'base64')):'';
const encrypt=v=>{if(!safeStorage.isEncryptionAvailable()) throw Error('Windows key protection is unavailable.'); return safeStorage.encryptString(v).toString('base64');};
function send(type,data){if(win&&!win.isDestroyed())win.webContents.send('update',{type,data});}
function publicSettings(){return {...settings,deepgram:undefined,openai:undefined,gemini:undefined,hasDeepgram:!!settings.deepgram,hasOpenai:!!settings.openai,hasGemini:!!settings.gemini};}
function saveMeeting(){if(meeting){atomic(path.join(dataRoot,'meetings',meeting.id+'.json'),meeting);send('meeting',meeting);}}
function add(parts){if(!meeting)return; for(const p of parts){meeting.segments.push({...p,id:crypto.randomUUID()});const rolling=meeting.segments.filter(s=>s.source===p.source).slice(-3).map(s=>s.text).join(' '); for(const term of glossary) if(matches(rolling,term)&&!meeting.terms.includes(term.id))meeting.terms.push(term.id);}saveMeeting();}
function newMeeting(title,demo=false){meeting={id:crypto.randomUUID(),title:String(title||'Untitled meeting').slice(0,160),started:new Date().toISOString(),demo,segments:[],names:{you:'You'},terms:[],usage:{calls:0,input:0,output:0},events:[]};lastAnalyzed=0;analysisPaused=false;saveMeeting();}
function problem(message){if(meeting){meeting.events.push({time:new Date().toISOString(),message});saveMeeting();}send('error',message);}
async function connect(source,rate){
 const params=new URLSearchParams({model:'nova-3',language:'en',encoding:'linear16',sample_rate:String(rate),channels:'1',smart_format:'true',interim_results:'true',endpointing:'300'});
 if(source==='system')params.set('diarize_model','v1');
 const ws=new WebSocket('wss://api.deepgram.com/v1/listen?'+params,{headers:{Authorization:'Token '+decrypt(settings.deepgram)},handshakeTimeout:12000});
 const entry={ws,offset:0,closing:false};streams.set(source,entry);
 ws.on('message',raw=>{try {const m=JSON.parse(raw);if(m.type==='Error'){problem(`${source}: ${m.description||'Transcription error'}`);return;}if(m.type==='Results'){if(m.is_final)add(segments(m,source,entry.offset));else send('interim',{source,text:m.channel?.alternatives?.[0]?.transcript||''});}}catch(e){problem('Could not process transcription: '+e.message);}});
 ws.on('close',()=>{clearInterval(entry.keepalive);if(active&&!entry.closing){problem(`${source==='mic'?'Microphone':'Meeting audio'} connection ended. Capture stopped to avoid an unnoticed transcript gap. Start a new session to reconnect.`);stop();}});
 ws.on('error',e=>{if(active)problem(`${source} connection: ${e.message}`);});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);ws.once('unexpected-response',(_,res)=>{ws.terminate();reject(Error(`Transcription authorization failed (HTTP ${res.statusCode}). Check your Deepgram key and credit.`));});});
 entry.keepalive=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'KeepAlive'}));},4000);
}
async function stop(){
 if(stopping)return;stopping=true;active=false;clearInterval(timer);send('capture-stop');
 await Promise.all([...streams.values()].map(e=>new Promise(resolve=>{e.closing=true;clearInterval(e.keepalive);if(e.ws.readyState!==WebSocket.OPEN){e.ws.terminate();resolve();return;}const timeout=setTimeout(()=>{e.ws.terminate();resolve();},4000);e.ws.once('close',()=>{clearTimeout(timeout);resolve();});e.ws.send(JSON.stringify({type:'CloseStream'}));})));
 streams.clear();if(meeting){meeting.ended=new Date().toISOString();saveMeeting();}stopping=false;send('status','Stopped · transcript saved');
}
async function analyze(manual=false){
 if(analysisBusy||!meeting||meeting.demo||!settings[settings.provider])return;
 if(!manual&&(!active||settings.mode!=='learn'||analysisPaused))return;
 const target=meeting;if(target.usage.calls>=settings.maxCalls){send('status','Definition request limit reached · transcription continues');return;}
 const end=target.segments.length;if(end<=lastAnalyzed)return;
 const text=target.segments.slice(Math.max(lastAnalyzed,end-20)).map(s=>s.text).join(' ').slice(-6000);
 const known=glossary.filter(t=>matches(text,t)).map(t=>t.term).slice(0,100);
 analysisBusy=true;target.usage.calls++;saveMeeting();
 try{
 const result=await generateDefinitions({provider:settings.provider,key:decrypt(settings[settings.provider]),model:settings.geminiModel,text,known});
 target.usage.input+=result.usage.input;target.usage.output+=result.usage.output;const terms=result.terms;analysisPaused=false;send('definitions-ready');
 for(const t of terms.slice(0,5)){if(typeof t.term!=='string'||typeof t.definition!=='string'||!matches(text,t)||glossary.some(g=>normalize(g.term)===normalize(t.term)))continue;
 const term={id:crypto.randomUUID(),term:t.term.slice(0,120),definition:t.definition.slice(0,1200),aliases:(t.aliases||[]).filter(a=>typeof a==='string').slice(0,10),reviewed:false,created:new Date().toISOString()};glossary.push(term);target.terms.push(term.id);}
 atomic(glossaryFile,glossary);lastAnalyzed=end;send('glossary',glossary);saveMeeting();
 }catch(e){analysisPaused=true;problem(e.message+' Automatic definitions are paused; transcription continues. After fixing Settings, restart capture or click Find new terms to retry.');}finally{analysisBusy=false;}
}
async function command(method,arg={}){
 switch(method){
 case 'init':return {settings:publicSettings(),glossary,meeting,dataRoot};
 case 'settings':if(active||analysisBusy)throw Error('Stop capture before changing settings.');settings={...settings,interval:Math.max(5,Math.min(60,Number(arg.interval)||10)),maxCalls:Math.max(0,Math.min(720,Number(arg.maxCalls)||0)),mode:arg.mode==='local'?'local':'learn',provider:providers[arg.provider]?arg.provider:'gemini',geminiModel:/^gemini-[a-z0-9.-]+$/.test(arg.geminiModel||'')?arg.geminiModel:(settings.geminiModel||providers.gemini.model)};settings=updateKeys(settings,arg,encrypt);atomic(settingsFile,settings);return publicSettings();
 case 'gemini-models':{if(active||analysisBusy)throw Error('Stop capture before checking services.');const key=String(arg.gemini||'').trim()||decrypt(settings.gemini);if(!key)throw Error('Enter or save a Gemini API key first.');return listGeminiModels(key);}
 case 'test-definitions':{if(active||analysisBusy)throw Error('Stop capture before testing definitions.');const provider=providers[arg.provider]?arg.provider:settings.provider;const key=String(arg.key||'').trim()||decrypt(settings[provider]);if(!key)throw Error('Enter or save a key for the selected definition service first.');const result=await generateDefinitions({provider,key,model:arg.geminiModel||settings.geminiModel,text:'We use cross-validation to detect overfitting.',known:[]});if(!result.terms.length)throw Error('The service responded but returned no terms for the test sentence.');return {model:result.model,terms:result.terms,usage:result.usage};}
 case 'start':if(active||stopping||analysisBusy)throw Error('Wait for the previous session to finish.');if(!settings.deepgram)throw Error('Add a Deepgram API key in Settings first.');if(!Number.isFinite(arg.rate)||arg.rate<8000||arg.rate>96000)throw Error('Unsupported audio sample rate');newMeeting(arg.title);try{const results=await Promise.allSettled([connect('mic',arg.rate),connect('system',arg.rate)]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;active=true;timer=setInterval(()=>analyze(),settings.interval*1000);send('status',settings.mode==='learn'&&!settings[settings.provider]?'Live · glossary only until a definition service key is added':'Live · both audio sources connected');return meeting;}catch(e){await stop();throw e;}
 case 'stop':await stop();return true;
 case 'analyze':if(!settings[settings.provider])throw Error('Add a key for your selected definition service in Settings. Local glossary matching works without it.');if(meeting?.demo)throw Error('The sample meeting is offline. Use a live meeting for AI discovery.');await analyze(true);return true;
 case 'demo':if(active||analysisBusy)throw Error('Stop your meeting first.');newMeeting('Demo · Model evaluation',true);add([{speaker:'you',source:'mic',time:0,text:'How do we know whether the model is overfitting?'},{speaker:'remote-0',source:'system',time:4,text:'Compare training performance with cross-validation. Regularization can help reduce overfitting.'},{speaker:'remote-1',source:'system',time:12,text:'For imbalanced classes, look at precision and recall, not just accuracy.'}]);meeting.ended=new Date().toISOString();saveMeeting();return meeting;
 case 'rename':if(!meeting)return;meeting.names[String(arg.id)]=String(arg.name).slice(0,80);saveMeeting();return meeting;
 case 'glossary-save':{const existing=glossary.find(t=>t.id===arg.id);const t={id:existing?.id||crypto.randomUUID(),term:String(arg.term||'').trim().slice(0,120),definition:String(arg.definition||'').trim().slice(0,1200),aliases:String(arg.aliases||'').split(',').map(s=>s.trim()).filter(Boolean),reviewed:!!arg.reviewed};if(!t.term||!t.definition)throw Error('A term and definition are required.');if(existing)Object.assign(existing,t);else glossary.push(t);atomic(glossaryFile,glossary);if(meeting&&matches(meeting.segments.map(s=>s.text).join(' '),t)&&!meeting.terms.includes(t.id))meeting.terms.push(t.id);send('glossary',glossary);saveMeeting();return glossary;}
 case 'history':return fs.readdirSync(path.join(dataRoot,'meetings')).filter(n=>n.endsWith('.json')).map(n=>{const m=read(path.join(dataRoot,'meetings',n),{});return {id:m.id,title:m.title,started:m.started};}).sort((a,b)=>b.started.localeCompare(a.started));
 case 'load':if(active||stopping||analysisBusy)throw Error('Stop capture and wait for analysis before opening another meeting.');if(!/^[a-f0-9-]{36}$/.test(arg.id))throw Error('Invalid meeting');meeting=read(path.join(dataRoot,'meetings',arg.id+'.json'),null);lastAnalyzed=meeting.segments.length;send('meeting',meeting);return meeting;
 case 'export':if(!meeting)throw Error('No meeting to export.');{const dest=await dialog.showSaveDialog(win,{defaultPath:'Meeting transcript.txt',filters:[{name:'Text transcript',extensions:['txt']}]});if(!dest.canceled)fs.writeFileSync(dest.filePath,transcript(meeting),'utf8');return !dest.canceled;}
 case 'folder':await shell.openPath(dataRoot);return true;
 default:throw Error('Unknown action');
 }
}
app.whenReady().then(async()=>{
 fs.mkdirSync(path.join(dataRoot,'meetings'),{recursive:true});settings={...defaults,...read(settingsFile,{})};glossary=read(glossaryFile,[]);
 win=new BrowserWindow({width:1260,height:860,minWidth:900,minHeight:650,show:!process.env.COMPANION_SMOKE,backgroundColor:'#10171c',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(wc===win.webContents&&['media','display-capture'].includes(permission)));
 session.defaultSession.setDisplayMediaRequestHandler(async(request,cb)=>{try{if(!request.frame.url.startsWith('file:'))return cb({});const sources=await desktopCapturer.getSources({types:['screen']});cb({video:sources[0],audio:'loopback'});}catch{cb({});}});
 ipcMain.handle('command',async(e,method,arg)=>{if(e.sender!==win.webContents)throw Error('Invalid sender');return command(method,arg);});
 ipcMain.on('audio',(e,source,bytes)=>{if(e.sender!==win.webContents||!active)return;const entry=streams.get(source);if(entry?.ws.readyState===WebSocket.OPEN){if(entry.ws.bufferedAmount>2e6){problem('Network cannot keep up with audio. Capture stopped.');stop();return;}entry.ws.send(Buffer.from(bytes));}});
 let quitting=false;win.on('close',e=>{if((active||stopping)&&!quitting){e.preventDefault();stop().then(()=>{quitting=true;win.close();});}});
 await win.loadFile('index.html');
 if(process.env.COMPANION_SMOKE){
  try {
   const assert=require('node:assert/strict');await command('demo');assert.equal(meeting.segments.length,3);
   await command('rename',{id:'remote-0',name:'Sarah'});assert.ok(transcript(meeting).includes('Sarah:'));
   await command('glossary-save',{term:'cross-validation',definition:'Evaluate a model on different held-out portions of the data.',aliases:'cross validation',reviewed:true});
   await command('demo');assert.equal(meeting.terms.length,1);
   const history=await command('history');assert.equal(history.length,2);await command('load',{id:history[1].id});assert.ok(meeting);
   const errors=[];win.webContents.on('console-message',(_e,_level,message)=>{if(message.includes('Error'))errors.push(message);});
   const info=await win.webContents.executeJavaScript('({title:document.title,buttons:document.querySelectorAll("button").length,rows:document.querySelectorAll(".utterance").length})');assert.equal(info.rows,3);
   await win.webContents.executeJavaScript('document.getElementById("settings").click()');assert.equal(await win.webContents.executeJavaScript('document.getElementById("settingsDialog").open'),true);
   await win.webContents.executeJavaScript('document.getElementById("settingsDialog").close()');
   const shot=await win.webContents.capturePage();fs.writeFileSync(path.join(dataRoot,'smoke.png'),shot.toPNG());fs.writeFileSync(path.join(dataRoot,'smoke.json'),JSON.stringify({...info,errors,result:'passed'},null,2));app.quit();
  }catch(e){fs.writeFileSync(path.join(dataRoot,'smoke.json'),JSON.stringify({result:'failed',message:e.stack}));app.exit(1);}
 }
});
app.on('window-all-closed',()=>app.quit());
