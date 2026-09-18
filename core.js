const fs = require('node:fs');
const path = require('node:path');
function atomic(file, value) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file+'.tmp', JSON.stringify(value,null,2)); fs.renameSync(file+'.tmp',file); }
function read(file, fallback) { if(!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file,'utf8')); }
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function matches(text, term) { const t = ` ${normalize(text)} `; return [term.term,...(term.aliases||[])].some(a=>normalize(a) && t.includes(` ${normalize(a)} `)); }
function segments(message, source, offset=0) {
  if(message.type!=='Results' || !message.is_final) return [];
  const alt=message.channel?.alternatives?.[0]; if(!alt?.transcript) return [];
  const words=alt.words||[]; const out=[];
  for(const w of words) { const speaker=source==='mic'?'you':`remote-${w.speaker??'unknown'}`; const last=out.at(-1); const text=w.punctuated_word||w.word;
    if(last?.speaker===speaker) last.text+=' '+text; else out.push({speaker,text,time:offset+(w.start||0),source}); }
  return out.length?out:[{speaker:source==='mic'?'you':'remote-unknown',text:alt.transcript,time:offset+(message.start||0),source}];
}
function stamp(seconds) { return new Date(Math.max(0,seconds)*1000).toISOString().slice(11,19); }
function speakerName(id,names={}) { return names[id] || (id==='you'?'You':id==='remote-unknown'?'Remote speaker':`Speaker ${Number(id.split('-')[1])+1}`); }
function transcript(meeting) { return `${meeting.title}\n${meeting.started}\n${meeting.demo?'DEMO — sample transcript\n':''}\n`+ [...meeting.segments].sort((a,b)=>a.time-b.time).map(s=>`[${stamp(s.time)}] ${speakerName(s.speaker,meeting.names)}: ${s.text}`).join('\n'); }
function updateKeys(existing,input,encrypt){const result={...existing};for(const key of ['deepgram','openai','gemini']){const value=String(input[key]??'').trim();if(value)result[key]=encrypt(value);if(input['clear'+key]===true)delete result[key];}return result;}
module.exports={atomic,read,normalize,matches,segments,stamp,speakerName,transcript,updateKeys};
