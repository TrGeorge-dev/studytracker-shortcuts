/* StudyTracker V3 data engine. No external service or dependencies.
   Historical seconds stay integer-exact. Clock positions of legacy rows are minute-resolution.
   v3.1.2: Monday notification now includes total + count; notification tap URL uses the
   documented scriptable:///run/<name> form; exposes version + viewerURL for the self-check script.
   v3.1.3: local cache writes now remove an existing destination before move (device move()
   refuses to overwrite). */
const STCore = (() => {
  'use strict';
  const DAY=86400000;
  function pad(x){return String(x).padStart(2,'0')}
  function localDate(k){
    if(typeof k!=='string'||!/^(\d{4})-(\d\d)-(\d\d)$/.test(k)) return null;
    const [y,m,d]=k.split('-').map(Number);
    const dt=new Date(0);dt.setFullYear(y,m-1,d);dt.setHours(0,0,0,0);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?dt:null;
  }
  function dateKey(d){return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')}
  function addDays(k,n){const d=localDate(k);if(!d)return null;d.setDate(d.getDate()+n);return dateKey(d)}
  function weekStart(k){const d=localDate(k); if(!d)return null;d.setDate(d.getDate()-(d.getDay()+6)%7);return dateKey(d)}
  function startOf(k){const d=localDate(k);return d?d.getTime():NaN}
  function dur(seconds,secondsVisible=false){
    if(!Number.isFinite(seconds)||seconds<0) return '—';
    const s=Math.round(seconds),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
    if(secondsVisible) return (h?`${h}小时`:'')+(m?`${m}分钟`:'')+`${r}秒`;
    if(seconds>0&&seconds<60)return '<1分钟';
    const minutes=Math.round(s/60);const hh=Math.floor(minutes/60),mm=minutes%60;
    return (hh?`${hh}小时`:'')+(mm||!hh?`${mm}分钟`:'');
  }
  function pct(current,previous){return previous>0?(current-previous)*100/previous:null}
  function clockDistance(startText, endText, seconds) {
    const minutes = text => {const [h,m] = text.split(':').map(Number); return h*60+m;};
    const clockSeconds = ((minutes(endText)-minutes(startText)+1440)%1440)*60;
    const delta = Math.abs(seconds%86400-clockSeconds);
    return Math.min(delta, 86400-delta);
  }
  function inspectLine(raw, lineNumber) {
    const fields = String(raw).replace(/^\uFEFF/, '').trim().split('|').map(x=>x.trim());
    if (fields.length!==4 || !/^\d{4}-\d{2}-\d{2}$/.test(fields[0]) || !/^\d{2}:\d{2}$/.test(fields[1]) || !/^\d{2}:\d{2}$/.test(fields[2])) return {issue:'格式不符合 yyyy-MM-dd|HH:mm|HH:mm|秒数'};
    let number = fields[3];
    const grouped = /^-?\d{1,3}(?:[,，]\d{3})+$/.test(number);
    if (grouped) number = number.replace(/[,，]/g, '');
    if (!/^-?\d+$/.test(number)) return {issue:'秒数必须为整数'};
    const date=localDate(fields[0]),[sh,sm]=fields[1].split(':').map(Number),[eh,em]=fields[2].split(':').map(Number);
    const value=Number(number),seconds=Math.abs(value);
    if (!date || sh>23 || eh>23 || sm>59 || em>59 || !Number.isSafeInteger(seconds) || seconds<=0 || seconds>36*3600) return {issue:'日期、时刻或时长异常（有效会话为 1 秒至 36 小时）'};
    const mismatch=clockDistance(fields[1],fields[2],seconds)>60;
    if (value<0 && mismatch) return {issue:'负秒数与起止时刻不一致，无法安全自动修复'};
    const start=localDate(fields[0]);start.setHours(sh,sm,0,0);
    return {canonical:fields.slice(0,3).join('|')+'|'+seconds,
      recovered:value<0 || grouped, negative:value<0, mismatch,
      record:{id:lineNumber,date:fields[0],startText:fields[1],endText:fields[2],seconds,start:start.getTime(),finish:start.getTime()+seconds*1000,sourceLine:lineNumber}};
  }
  function parse(text) {
    const records=[],issues=[],warnings=[],seen=new Set();let recovered=0;
    const lines=String(text==null?'':text).replace(/^\uFEFF/, '').split(/\r\n?|\n/);
    lines.forEach((raw,index)=>{
      if (!raw.trim()) return;
      const row=inspectLine(raw,index+1);
      if (row.issue) {issues.push({line:index+1,reason:row.issue});return;}
      if (row.recovered) {recovered++;warnings.push({line:index+1,reason:row.negative?'旧版把结束减开始的方向写反：已按一致的起止时刻恢复正秒数。原文件未由周报修改。':'已识别旧版带千位分隔符的整数秒数。'});}
      if (row.mismatch) warnings.push({line:index+1,reason:'结束时刻与持续秒数不一致；仍使用原始正秒数，小时分布仅作近似。'});
      if (seen.has(row.canonical)) warnings.push({line:index+1,reason:'与另一条会话完全相同，可能重复；为避免误删，保留两条。'});
      seen.add(row.canonical);records.push(row.record);
    });
    return {records,issues,warnings,recovered,lines:lines.length};
  }
  function repairLegacy(text) {
    let count=0;
    const output=String(text==null?'':text).split(/\r\n?|\n/).map((raw,index)=>{
      if (!raw.trim()) return raw;
      const row=inspectLine(raw,index+1);
      if (!row.issue && row.recovered) {count++;return row.canonical;}
      return raw;
    });
    return {text:output.join('\n'),count};
  }
  function sum(items){return items.reduce((a,r)=>a+r.seconds,0)}
  function onDay(items,k){return items.filter(x=>x.date===k)}
  function day(items,k){const sessions=onDay(items,k);return {date:k,total:sum(sessions),count:sessions.length,sessions}}
  function week(items,k){const key=weekStart(k),dates=Array.from({length:7},(_,i)=>addDays(key,i)),days=dates.map(x=>day(items,x));
    return {key,end:dates[6],days,total:days.reduce((a,b)=>a+b.total,0),count:days.reduce((a,b)=>a+b.count,0)}
  }
  function hourly(items,k){
    // Actual clock-time view: includes the post-midnight slice of preceding-day sessions.
    // The daily total elsewhere still credits the entire session to its START DATE.
    const lo=startOf(k),hi=startOf(addDays(k,1)); const bins=Array(24).fill(0),byHour=Array.from({length:24},()=>[]);
    for(const r of items){
      const a=Math.max(lo,r.start),b=Math.min(hi,r.finish);if(b<=a)continue;
      for(let h=0;h<24;h++){
        const hlo=new Date(localDate(k).getFullYear(),localDate(k).getMonth(),localDate(k).getDate(),h,0,0).getTime();
        const hhi=new Date(localDate(k).getFullYear(),localDate(k).getMonth(),localDate(k).getDate(),h+1,0,0).getTime();
        const sec=Math.max(0,Math.min(b,hhi)-Math.max(a,hlo))/1000;
        if(sec>0){bins[h]+=sec;byHour[h].push({record:r,seconds:sec})}
      }
    }
    return {date:k,bins,byHour,total:bins.reduce((a,b)=>a+b,0)};
  }
  function metrics(items,k,mode){
    if(mode==='week'){
      const w=week(items,k),prev=week(items,addDays(w.key,-7));
      const days=w.days,most=days.reduce((a,b)=>!a||b.count>a.count?b:a,null);
      const sess=days.flatMap(x=>x.sessions);
      return {...w,avg:w.total/7,avgCount:w.count/7,longest:sess.length?Math.max(...sess.map(x=>x.seconds)):0,avgSession:w.count?w.total/w.count:0,busiest:most,pct:pct(w.total,prev.total),countPct:pct(w.count,prev.count),sessions:sess};
    }
    const d=day(items,k),prev=day(items,addDays(k,-1));
    return {...d,avg:d.total,avgCount:d.count,longest:d.sessions.length?Math.max(...d.sessions.map(x=>x.seconds)):0,avgSession:d.count?d.total/d.count:0,pct:pct(d.total,prev.total),countPct:pct(d.count,prev.count)};
  }
  function shortDate(k){const p=String(k).split('-');return Number(p[1])+'月'+Number(p[2])+'日'}
  function notificationSummary(items,now){
    const today=dateKey(now),thisMonday=weekStart(today),lastMonday=addDays(thisMonday,-7);
    const last=metrics(items,lastMonday,'week'),previous=week(items,addDays(lastMonday,-7));
    const p=pct(last.total,previous.total);
    const change=p===null?'较前周 暂无可比数据':`较前周 ${p>0?'↑ ':p<0?'↓ ':'→ '}${Math.abs(p).toFixed(1)}%`;
    const headline=last.count?`上周学习 ${dur(last.total)} · 共 ${last.count} 次`:'上周没有学习记录';
    return {week:lastMonday,end:last.end,range:`${shortDate(lastMonday)} – ${shortDate(last.end)}`,
      avg:last.avg,total:last.total,count:last.count,previous:previous.total,percent:p,
      body:`${headline}\n日均 ${dur(last.avg)} · ${change}`};
  }
  return {inspectLine,clockDistance,repairLegacy,pad,dateKey,localDate,addDays,weekStart,startOf,dur,pct,parse,sum,onDay,day,week,hourly,metrics,notificationSummary};
})();

const ST_REPORT_HTML = "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\"><meta name=\"color-scheme\" content=\"light dark\"><title>学习时间 · V3.1</title>\n<style>\n:root{color-scheme:light dark;--bg:#f2f2f7;--card:#fff;--ink:#14141a;--muted:#8e8e93;--border:#dedee3;--primary:#0a84ff;--bar:#3399ff;--fill:#d7eafa;--track:#e5e5ea;--green:#30a46c;--red:#ee5e5e;--focus:#c7e6ff}\n@media(prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--ink:#f5f5f7;--muted:#98989f;--border:#36363b;--primary:#4ca7ff;--bar:#409cff;--fill:#102e4a;--track:#3a3a3c;--focus:#183d62}}\n*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC',system-ui,sans-serif;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased;padding-bottom:calc(34px + env(safe-area-inset-bottom))}\nmain{max-width:720px;margin:auto;padding:24px 16px 12px}.top{margin:5px 4px 18px}.top h1{font-size:31px;letter-spacing:-.7px;margin:0 0 5px;font-weight:750}.minor{font-size:12px;color:var(--muted)}\n.toggle{display:flex;background:var(--track);padding:3px;border-radius:9px;margin:19px 2px 17px}.toggle button{width:50%;background:none;border:0;border-radius:7px;padding:9px;color:var(--ink);font-size:14px;font-weight:600}.toggle button.active{background:var(--card);box-shadow:0 2px 5px #0002}\n.nav{display:flex;align-items:center;justify-content:space-between;margin:0 2px 13px;gap:10px}.nav .range{font-weight:700;font-size:17px;text-align:center}.nav button{border:none;color:var(--primary);font-size:23px;background:none;padding:5px 13px;cursor:pointer}.nav button:disabled{opacity:.28}.card{background:var(--card);border-radius:17px;padding:18px 16px;margin:0 0 15px;overflow:hidden}.section-title{margin:23px 4px 11px;color:var(--muted);font-weight:650;font-size:12px;letter-spacing:.8px}.kicker{font-size:12px;color:var(--muted);margin-bottom:6px}.big{font-size:37px;font-weight:720;letter-spacing:-1.4px;line-height:1.16}.change{font-size:13px;color:var(--muted);margin-top:8px}.change.pos{color:var(--green)}.change.neg{color:var(--red)}.kpis{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:17px;border-top:1px solid var(--border);padding-top:16px}.kpis .value{font-size:19px;font-weight:650;margin-top:5px}.kpis .label{color:var(--muted);font-size:12px}.chart-wrap{position:relative;margin-top:22px}.chart-title{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);margin-bottom:2px}\n.hit{fill:transparent;cursor:pointer}svg{display:block;width:100%;height:auto;overflow:visible}.bar{fill:var(--bar);cursor:pointer;transition:opacity .15s;transform-box:fill-box;transform-origin:bottom;animation:rise .48s ease both}.bar.unselected{opacity:.36}.bar.selected{fill:var(--primary)}.bars-count .bar{fill:#62b0f7}.gridline{stroke:var(--border);stroke-width:.65}.avg-line{stroke:#3db27b;stroke-width:1.5;stroke-dasharray:5 4}.axis-text{fill:var(--muted);font-size:11px}.axis-label{fill:var(--muted);font-size:12px}.axis-label.picked{fill:var(--primary);font-weight:700}.dot{fill:var(--green)}\n@keyframes rise{from{transform:scaleY(.08);opacity:.5}to{transform:scaleY(1);opacity:1}}\n.selected-panel{margin-top:12px;background:var(--fill);border-radius:11px;padding:12px 13px;display:flex;align-items:center;justify-content:space-between;gap:8px}.selected-panel .mainline{font-size:14px;font-weight:650}.selected-panel .subline{font-size:12px;color:var(--muted);margin-top:3px}.link-btn{border:0;color:var(--primary);background:transparent;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;padding:6px 0}\n.hr{height:1px;background:var(--border);margin:18px -16px 14px}.stats-list{display:flex;flex-direction:column}.stat-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:14px}.stat-row:last-child{border:0}.stat-row span:first-child{color:var(--muted);font-size:14px}.stat-row strong{font-weight:650;font-size:14px;text-align:right}.rowhead{display:flex;align-items:center;justify-content:space-between}.subhint{font-size:12px;color:var(--muted);line-height:1.55;margin-top:10px}\n.session{width:100%;background:none;color:inherit;border:0;text-align:left;padding:13px 1px;display:flex;align-items:center;border-bottom:1px solid var(--border);gap:12px;cursor:pointer}.session:last-child{border:0}.session-icon{width:33px;height:33px;background:var(--fill);border-radius:9px;display:grid;place-items:center;color:var(--primary);font-size:16px}.session-data{flex:1;min-width:0}.session-data b{font-size:14px;display:block;font-weight:590}.session-data small{font-size:11px;color:var(--muted)}.session-time{font-size:14px;font-weight:650;white-space:nowrap}.chevron{color:var(--muted);font-size:19px}\n.picker{display:flex;align-items:center;gap:8px}.picker button{background:var(--track);border:0;border-radius:7px;color:var(--ink);padding:7px 11px;font-size:12px}.picker button.on{color:var(--primary);font-weight:700}.empty{text-align:center;color:var(--muted);padding:30px 15px;font-size:13px;line-height:1.6}\nfooter{color:var(--muted);font-size:11px;line-height:1.7;padding:0 6px;margin-top:22px}.modal{position:fixed;inset:0;background:#0007;display:flex;align-items:flex-end;z-index:200;animation:fade .13s}.sheet{max-width:720px;width:100%;margin:auto auto 0;background:var(--card);border-radius:22px 22px 0 0;padding:18px 23px calc(30px + env(safe-area-inset-bottom));box-shadow:0 -12px 35px #0002}.sheet .close{float:right;border:0;background:var(--track);color:var(--ink);border-radius:50%;height:30px;width:30px;font-size:20px}.sheet h3{margin-top:18px}.sheet{max-height:85vh;overflow-y:auto}.sheet p{font-size:14px;color:var(--muted)}@keyframes fade{from{opacity:0}to{opacity:1}}\n.warn{margin:10px 0;color:#b77c11;background:var(--card);padding:10px 12px;border-radius:9px;font-size:12px}\n</style></head><body><main>\n<header class=\"top\"><h1>学习时间</h1><span class=\"minor\" id=\"updated\">个人学习记录 · 本地统计</span></header>\n<div class=\"toggle\" role=\"tablist\"><button id=\"weekTab\" aria-selected=\"true\">每周</button><button id=\"dayTab\">每天</button></div>\n<div class=\"nav\"><button id=\"prev\" aria-label=\"上一周期\">‹</button><div class=\"range\" id=\"range\"></div><button id=\"next\" aria-label=\"下一周期\">›</button></div>\n<div style=\"display:flex;justify-content:center;gap:12px;margin-bottom:14px\"><input id=\"dateJump\" type=\"date\" aria-label=\"选择历史日期\" style=\"font:inherit;color:var(--ink);background:var(--card);border:0;border-radius:8px;padding:6px\"><button id=\"today\" class=\"link-btn\">今天</button></div><div class=\"card\"><div class=\"kicker\" id=\"heroLabel\">每天平均学习时间</div><div class=\"big\" id=\"hero\"></div><div class=\"change\" id=\"change\"></div><div class=\"chart-wrap\"><div class=\"chart-title\"><span id=\"chartTop\">学习时间</span><span id=\"chartScale\"></span></div><div id=\"durationChart\"></div><div id=\"selectedArea\"></div></div><div class=\"kpis\"><div><div class=\"label\">总学习时长</div><div class=\"value\" id=\"total\"></div></div><div><div class=\"label\">学习次数</div><div class=\"value\" id=\"counts\"></div></div></div></div>\n<div class=\"section-title\">学习次数</div><div class=\"card\"><div class=\"rowhead\"><div><div class=\"kicker\" id=\"countHeadline\">本周学习次数</div><div class=\"big\" id=\"countBig\" style=\"font-size:29px\"></div></div><div id=\"countDelta\" class=\"change\"></div></div><div id=\"countChart\" class=\"chart-wrap bars-count\"></div><div class=\"hr\"></div><div id=\"countStats\" class=\"stats-list\"></div></div>\n<div class=\"section-title\">学习明细</div><div class=\"card\"><div class=\"rowhead\"><div class=\"kicker\" id=\"detailTitle\">全部学习会话</div><div class=\"picker\"><button id=\"sortStart\" class=\"on\">按时间</button><button id=\"sortDuration\">按时长</button></div></div><div id=\"sessionList\"></div></div>\n<div id=\"issueWarning\"></div><footer id=\"foot\">所有时长按原始秒数计算；旧格式只记录到分钟，24小时时间轴位置为近似还原。日总时长按会话开始日期归属，24小时图按实际跨日位置展示，因此跨午夜时两者可能不同。没有科目或通知历史，不会推测这些数据。 · 引擎 v3.1.3</footer>\n</main><div id=\"modalRoot\"></div>\n<script>\nconst DB=__STV3_DATA__;\nconst C=(()=>{\nconst DAY=86400000,pad=n=>String(n).padStart(2,'0');\nconst d=k=>{let p=k.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])},key=t=>`${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;\nconst add=(k,n)=>{let t=d(k);t.setDate(t.getDate()+n);return key(t)};\nconst monday=k=>{let t=d(k);t.setDate(t.getDate()-(t.getDay()+6)%7);return key(t)};\nconst fmt=(s,precise=false)=>{let v=Math.round(s);if(precise){let h=Math.floor(v/3600),m=Math.floor(v%3600/60);return `${h?h+'小时':''}${m?m+'分钟':''}${v%60}秒`};if(s>0&&s<60)return '<1分钟';let m=Math.round(s/60),h=Math.floor(m/60);return`${h?h+'小时':''}${m%60||!h?m%60+'分钟':''}`};\nconst sum=a=>a.reduce((t,v)=>t+v.seconds,0),byDay=k=>DB.records.filter(x=>x.date===k),day=k=>({date:k,sessions:byDay(k),total:sum(byDay(k)),count:byDay(k).length});\nconst week=k=>{let m=monday(k),days=Array.from({length:7},(_,i)=>day(add(m,i)));return {date:m,days,total:days.reduce((s,v)=>s+v.total,0),count:days.reduce((s,v)=>s+v.count,0),sessions:days.flatMap(v=>v.sessions)}};\nconst pct=(x,p)=>p>0?(x-p)*100/p:null;\nconst delta=(p,brief=false)=>p===null?'暂无可比数据':`${p>0?'↑ ':p<0?'↓ ':'→ '}${Math.abs(p).toFixed(1)}%${brief?'':' 较上一周期'}`;\nconst hours=k=>{const dayStart=d(k).getTime(),end=d(add(k,1)).getTime(),bins=Array(24).fill(0),members=Array.from({length:24},()=>[]);for(const r of DB.records){let a=Math.max(dayStart,r.start),b=Math.min(end,r.finish);if(b<=a)continue;for(let h=0;h<24;h++){let lo=new Date(d(k).getFullYear(),d(k).getMonth(),d(k).getDate(),h,0).getTime();let hi=new Date(d(k).getFullYear(),d(k).getMonth(),d(k).getDate(),h+1,0).getTime();let s=Math.max(0,Math.min(b,hi)-Math.max(a,lo))/1000;if(s>0){bins[h]+=s;members[h].push({r,s})}}}return {bins,members,total:bins.reduce((a,b)=>a+b,0)}};\nreturn {key,add,monday,fmt,sum,byDay,day,week,pct,delta,hours};})();\nconst $=id=>document.getElementById(id),tod=C.key(new Date(DB.now)),maxWeek=C.monday(tod);\nconst state={mode:'week',date:DB.initialWeek||maxWeek,selection:null,countSelection:null,sort:'time'};\nfunction labelDate(k){const [y,m,d]=k.split('-');return `${Number(m)}月${Number(d)}日`}\nfunction nameDay(k){return ['周日','周一','周二','周三','周四','周五','周六'][new Date(k+'T12:00:00').getDay()]}\nfunction esc(t){return String(t).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}\nfunction makeChart(bins,labels,opt={}){\n let width=344,height=188,left=8,right=28,top=14,bottom=30,span=width-left-right,plot=height-top-bottom;\n let max=Math.max(1,...bins,opt.reference||0),step=opt.count?Math.max(1,Math.ceil(max/4)):Math.max(600,Math.ceil(max/4/900)*900),ceil=Math.max(step,Math.ceil(max/step)*step);\n if(opt.count){ceil=Math.max(1,Math.ceil(max/step)*step)}\n let cell=span/bins.length,barW=Math.min(opt.hourly?8:30,cell*.67),refY=top+plot*(1-(opt.reference||0)/ceil),frag=[];\n for(let i=0;i<=4;i++){let y=top+plot*i/4;frag.push(`<line class=\"gridline\" x1=\"${left}\" y1=\"${y}\" x2=\"${width-right}\" y2=\"${y}\"/>`);if(i%2===0)frag.push(`<text x=\"${width-2}\" y=\"${y+4}\" text-anchor=\"end\" class=\"axis-text\">${opt.count?Math.round(ceil*(1-i/4)):Math.round(ceil*(1-i/4)/60)+'分'}</text>`)}\n if(opt.reference!=null&&!opt.count){frag.push(`<line class=\"avg-line\" x1=\"${left}\" y1=\"${refY}\" x2=\"${width-right}\" y2=\"${refY}\"/>`)}\n bins.forEach((v,i)=>{let x=left+i*cell+(cell-barW)/2,y=top+plot*(1-v/ceil),h=plot*v/ceil,selected=opt.selected===i;frag.push(`<g data-index=\"${i}\"><rect class=\"hit\" x=\"${left+i*cell}\" y=\"${top}\" width=\"${cell}\" height=\"${plot}\"/><rect class=\"bar ${opt.selected!=null&&!selected?'unselected':''} ${selected?'selected':''}\" x=\"${x}\" y=\"${Math.max(top,y)}\" width=\"${barW}\" height=\"${v?Math.max(h,2):0}\" rx=\"${Math.min(barW/3,4)}\"/></g>`);if(i===0||i===bins.length-1||!opt.hourly||i%3===0){frag.push(`<text data-index=\"${i}\" class=\"axis-label ${selected?'picked':''}\" x=\"${left+(i+.5)*cell}\" y=\"${height-9}\" text-anchor=\"middle\">${esc(labels[i])}</text>`)}});\n return `<svg viewBox=\"0 0 ${width} ${height}\" role=\"img\" aria-label=\"${opt.count?'学习次数':'学习时长'}柱状图\">${frag.join('')}</svg>`;\n}\nfunction stats(rows){return rows.map(([a,b])=>`<div class=\"stat-row\"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}\nfunction current(){if(state.mode==='week'){let w=C.week(state.date),p=C.week(C.add(w.date,-7));return {w,p,series:w.days.map(x=>x.total),cnt:w.days.map(x=>x.count),count:w.count,total:w.total,avg:w.total/7,sessions:w.sessions,ratio:C.pct(w.total,p.total),countRatio:C.pct(w.count,p.count)}}let d=C.day(state.date),prev=C.day(C.add(d.date,-1)),h=C.hours(d.date),cnt=Array(24).fill(0);d.sessions.forEach(r=>cnt[new Date(r.start).getHours()]++);return{w:d,p:prev,series:h.bins,cnt,count:d.count,total:d.total,avg:d.total,sessions:d.sessions,ratio:C.pct(d.total,prev.total),countRatio:C.pct(d.count,prev.count),hourly:h}}\nfunction render(){const x=current(),isW=state.mode==='week';$('dateJump').max=tod;$('dateJump').value=state.date;$('weekTab').classList.toggle('active',isW);$('dayTab').classList.toggle('active',!isW);$('weekTab').setAttribute('aria-selected',isW);$('dayTab').setAttribute('aria-selected',!isW);\n let last=isW?C.add(x.w.date,6):state.date;$('range').textContent=isW?(x.w.date.slice(0,4)===last.slice(0,4)?`${labelDate(x.w.date)} – ${labelDate(last)} · ${x.w.date.slice(0,4)}`:`${x.w.date.slice(0,4)}年${labelDate(x.w.date)} – ${last.slice(0,4)}年${labelDate(last)}`):`${state.date.slice(0,4)}年${labelDate(state.date)} · ${nameDay(state.date)}`;\n $('next').disabled=isW?x.w.date>=maxWeek:state.date>=tod;$('heroLabel').textContent=isW?'每天平均学习时间':'当天学习总时长';$('hero').textContent=C.fmt(x.avg);$('change').textContent=C.delta(x.ratio);$('change').className='change '+(x.ratio>0?'pos':x.ratio<0?'neg':'');$('total').textContent=C.fmt(x.total);$('counts').textContent=x.count+' 次';\n $('chartTop').textContent=isW?'本周每天学习时长':'每小时学习时长（实际日历时间）';$('chartScale').textContent=isW?'周一至周日 · 绿虚线为日均':'00:00–24:00';\n let labels=isW?['一','二','三','四','五','六','日']:Array.from({length:24},(_,i)=>`${i}`);\n $('durationChart').innerHTML=makeChart(x.series,labels,{hourly:!isW,reference:isW?x.avg:null,selected:state.selection});\n $('durationChart').querySelectorAll('[data-index]').forEach(e=>{e.addEventListener('click',()=>{const index=Number(e.dataset.index);if(isW&&x.w.days[index].date>tod)return;state.selection=index;render()})});\n if(state.selection!==null){let i=state.selection;\n if(isW){let obj=x.w.days[i];$('selectedArea').innerHTML=`<div class=\"selected-panel\"><div><div class=\"mainline\">${labelDate(obj.date)} · ${C.fmt(obj.total,true)}</div><div class=\"subline\">${obj.count} 次学习</div></div><button class=\"link-btn\" id=\"drill\">查看当天 ›</button></div>`;$('drill').onclick=()=>switchTo('day',obj.date)}\n else{$('selectedArea').innerHTML=`<div class=\"selected-panel\"><div><div class=\"mainline\">${String(i).padStart(2,'0')}:00–${String(i+1).padStart(2,'0')}:00 · ${C.fmt(x.series[i],true)}</div><div class=\"subline\">涉及 ${x.hourly.members[i].length} 段会话（按钟点重建）</div></div><button class=\"link-btn\" id=\"drill\">查看明细 ›</button></div>`;$('drill').onclick=()=>{$('sessionList').scrollIntoView({behavior:'smooth'})}}\n }else {$('selectedArea').innerHTML=''}\n $('countHeadline').textContent=isW?'本周学习次数':'当天学习次数';$('countBig').textContent=x.count+' 次';$('countDelta').textContent=C.delta(x.countRatio,true);\n if(isW){$('countChart').innerHTML=makeChart(x.cnt,['一','二','三','四','五','六','日'],{count:true,selected:state.countSelection});$('countChart').querySelectorAll('[data-index]').forEach(e=>e.addEventListener('click',()=>{state.countSelection=Number(e.dataset.index);let k=x.w.days[state.countSelection].date;if(k<=tod)switchTo('day',k)}))}\n else{$('countChart').innerHTML=makeChart(x.cnt,Array.from({length:24},(_,i)=>String(i)),{count:true,hourly:true,selected:state.selection});$('countChart').querySelectorAll('[data-index]').forEach(e=>e.addEventListener('click',()=>{const index=Number(e.dataset.index);if(isW&&x.w.days[index].date>tod)return;state.selection=index;render()}))}\n let ss=x.sessions,average=ss.length?C.sum(ss)/ss.length:0,most=ss.length?Math.max(...ss.map(r=>r.seconds)):0,rows=[['平均单次学习时长',C.fmt(average)],['最长单次学习时长',C.fmt(most,true)]];\n if(isW){let max=x.w.days.reduce((a,b)=>b.count>a.count?b:a,x.w.days[0]);rows.unshift(['平均每天学习次数',(x.count/7).toFixed(2)+' 次']);rows.push(['学习次数最多的一天',x.count?`${labelDate(max.date)} · ${max.count} 次`:'暂无学习记录']);}\n $('countStats').innerHTML=stats(rows);\n $('detailTitle').textContent=isW?'本周全部学习会话':(state.selection===null?'当天全部学习会话':`${String(state.selection).padStart(2,'0')}:00 时段的相关会话`);$('sortStart').classList.toggle('on',state.sort==='time');$('sortDuration').classList.toggle('on',state.sort==='duration');\n const reportSessions=(!isW&&state.selection!==null)?x.hourly.members[state.selection].map(z=>z.r):ss;\n const visible=reportSessions.slice().sort((a,b)=>state.sort==='time'?a.start-b.start||a.id-b.id:b.seconds-a.seconds||a.start-b.start);\n $('sessionList').innerHTML=visible.length?visible.map(r=>`<button class=\"session\" data-sid=\"${r.id}\"><span class=\"session-icon\">◷</span><span class=\"session-data\"><b>${esc(labelDate(r.date))} · ${esc(r.startText)}–${esc(r.endText)}</b><small>第 ${r.sourceLine} 行 · ${esc(nameDay(r.date))}</small></span><span class=\"session-time\">${C.fmt(r.seconds)}</span><span class=\"chevron\">›</span></button>`).join(''):`<div class=\"empty\">这个${isW?'星期':(state.selection!==null?'时段':'日期')}没有对应的学习会话</div>`;\n $('sessionList').querySelectorAll('[data-sid]').forEach(el=>{el.onclick=()=>detail(DB.records.find(r=>r.id===Number(el.dataset.sid))) });\n $('issueWarning').innerHTML=(DB.issues.length+DB.warnings.length)?`<div class=\"warn\">发现 ${DB.issues.length} 条无法统计的数据及 ${DB.warnings.length} 条需要核对的提示。未修改原文件。<button class=\"link-btn\" id=\"issues\">查看原因</button></div>`:'';\n if(DB.issues.length+DB.warnings.length)$('issues').onclick=showIssues;\n}\nfunction switchTo(m,k){if(k>tod)return;state.mode=m;state.date=m==='week'?C.monday(k):k;state.selection=null;state.countSelection=null;render();window.scrollTo({top:0,behavior:'smooth'})}\nfunction detail(r){if(!r)return;modal(`<h3>学习会话详情</h3>${stats([['归属日期',r.date],['开始时间',r.startText],['结束时间',r.endText],['持续时长',C.fmt(r.seconds,true)],['原始精度',r.seconds+' 秒'],['原始记录行',String(r.sourceLine)]])}<p>日总时长按开始日期归属；结束时刻取自原始数据，跨午夜时可能落在次日。</p>`)}\nfunction showIssues(){modal(`<h3>数据检查</h3><p>报告未更改任何原始文件。</p>${[...DB.issues,...DB.warnings].slice(0,80).map(x=>`<p>第 ${x.line} 行：${esc(x.reason)}</p>`).join('')}`)}\nfunction modal(t){$('modalRoot').innerHTML=`<div class=\"modal\" id=\"overlay\"><div class=\"sheet\"><button class=\"close\" id=\"close\">×</button>${t}</div></div>`;$('close').onclick=()=>$('modalRoot').innerHTML='';$('overlay').onclick=e=>{if(e.target.id==='overlay')$('modalRoot').innerHTML=''}}\n$('weekTab').onclick=()=>switchTo('week',state.mode==='day'?state.date:state.date);\n$('dayTab').onclick=()=>switchTo('day',state.mode==='week'?(state.selection!==null?C.add(C.week(state.date).date,state.selection):(tod<C.week(state.date).date?C.week(state.date).date:(tod<C.add(C.week(state.date).date,6)?tod:C.add(C.week(state.date).date,6)))):state.date);\n$('prev').onclick=()=>switchTo(state.mode,C.add(state.date,state.mode==='week'?-7:-1));\n$('next').onclick=()=>switchTo(state.mode,C.add(state.date,state.mode==='week'?7:1));\n$('sortStart').onclick=()=>{state.sort='time';render()};$('sortDuration').onclick=()=>{state.sort='duration';render()};\n$('dateJump').onchange=e=>{if(e.target.value&&e.target.value<=tod)switchTo(state.mode,e.target.value)};$('today').onclick=()=>switchTo(state.mode,tod);$('updated').textContent=DB.syncedAt?'数据同步：'+new Date(DB.syncedAt).toLocaleString('zh-CN',{hour12:false})+' · 本地统计':'尚未同步：请运行学习周报快捷指令';render();\n</script></body></html>\n";
/* Scriptable V3.1 bridge. Original active.txt/sessions.txt are written by Shortcuts. */
const ST = (() => {
  const VIEWER = 'StudyTracker V3 报告';
  function store() {
    // Use the same local storage from foreground and Shortcuts extension.
    // Never silently switch between iCloud and local caches between invocations.
    const fm = FileManager.local(), home = fm.joinPath(fm.libraryDirectory(), 'StudyTrackerV3');
    if (!fm.fileExists(home)) fm.createDirectory(home, true);
    return {fm, home, path: name => fm.joinPath(home, name)};
  }
  async function read(s, name, fallback = '') {
    const p = s.path(name);
    if (!s.fm.fileExists(p)) return fallback;
    return s.fm.readString(p);
  }
  function write(s, name, text) {
    // A local rename installs the new journal/cache only after the write succeeds.
    // Device note: FileManager.move() refuses to replace an existing destination
    // (unlike the docs), so remove the previous file first.
    const temporary = s.path(name + '.writing');
    s.fm.writeString(temporary, String(text));
    const destination = s.path(name);
    if (s.fm.fileExists(destination)) s.fm.remove(destination);
    s.fm.move(temporary, destination);
  }
  async function readJSON(s, name, fallback) {
    const text = await read(s, name, '');
    if (!text) return fallback;
    try { return JSON.parse(text); }
    catch (_) {
      write(s, name + '.invalid-' + Date.now() + '.txt', text);
      return fallback;
    }
  }
  async function sync(s, raw) {
    raw = String(raw == null ? '' : raw);
    const previous = await read(s, 'sessions-mirror.txt');
    if (!raw.trim() && previous.trim()) throw new Error('收到空记录，但缓存已有历史数据：已停止同步，请检查 sessions.txt。');
    const parsed = STCore.parse(raw);
    if (raw.trim() && !parsed.records.length && parsed.issues.length) throw new Error('文件非空，但没有可统计的记录。已保留旧缓存和原文件，不能把损坏数据当成 0 分钟。');
    if (raw !== previous) write(s, 'sessions-mirror.txt', raw);
    write(s, 'last-sync.json', JSON.stringify({when: new Date().toISOString(), valid: parsed.records.length, issues: parsed.issues.length, recovered: parsed.recovered}));
    return parsed;
  }
  function viewerURL(week) {
    // Documented run URL: scriptable:///run/<name>. The week query lets the report script
    // open the exact week that the notification describes.
    return 'scriptable:///run/' + encodeURIComponent(VIEWER) + (week ? '?week=' + encodeURIComponent(week) : '');
  }
  async function notify(s, parsed, now) {
    const info = STCore.notificationSummary(parsed.records, now);
    let state = await readJSON(s, 'sent-weeks.json', {sent: []});
    if (!state || !Array.isArray(state.sent)) state = {sent: []};
    const id = 'StudyTrackerV3-' + info.week;
    if (state.sent.includes(info.week)) return {status: 'already_sent', week: info.week};
    // The OS identifier also protects a retry after schedule succeeded but state write failed.
    const scheduled = (await Notification.allPending()).concat(await Notification.allDelivered());
    if (scheduled.some(n => n.identifier === id)) {
      state.sent.push(info.week); write(s, 'sent-weeks.json', JSON.stringify(state));
      return {status: 'already_sent', week: info.week};
    }
    const reports = s.path('reports');
    if (!s.fm.fileExists(reports)) s.fm.createDirectory(reports, true);
    write(s, 'reports/' + info.week + '.json', JSON.stringify({week: info.week, generatedAt: now.toISOString(), notification: info}));
    const n = new Notification();
    n.identifier = id; n.title = '学习周报'; n.subtitle = info.range; n.body = info.body; n.threadIdentifier = 'StudyTrackerV3';
    n.openURL = viewerURL(info.week);
    n.userInfo = {week: info.week};
    await n.schedule();
    state.sent.push(info.week); state.sent = Array.from(new Set(state.sent)).slice(-520);
    write(s, 'sent-weeks.json', JSON.stringify(state));
    return {status: 'sent', week: info.week, body: info.body};
  }
  function renderHTML(parsed, options = {}) {
    const now = options.now || new Date();
    const selected = STCore.localDate(options.week) && STCore.weekStart(options.week) === options.week && options.week <= STCore.weekStart(STCore.dateKey(now)) ? options.week : null;
    const payload = {records: parsed.records, issues: parsed.issues, warnings: parsed.warnings, now: now.toISOString(), syncedAt: options.syncedAt || null, initialWeek: selected};
    const safe = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return ST_REPORT_HTML.replace('__STV3_DATA__', safe);
  }
  async function view(s, options = {}) {
    const parsed = STCore.parse(await read(s, 'sessions-mirror.txt'));
    const syncInfo = await readJSON(s, 'last-sync.json', {});
    const web = new WebView();
    await web.loadHTML(renderHTML(parsed, {...options, syncedAt: syncInfo && syncInfo.when}));
    await web.present(false);
    return {status: 'viewed', count: parsed.records.length};
  }
  async function run(input = null, options = {}) {
    const s = store();
    // Accept the old V3 framing so an already installed weekly Shortcut keeps working.
    const p = String(input == null ? '' : input).replace(/\r\n/g, '\n');
    for (const mode of ['NOTIFY', 'VIEW', 'REFRESH']) {
      const marker = '__STV3_' + mode + '__\n';
      if (p.startsWith(marker)) {
        const parsed = await sync(s, p.slice(marker.length));
        if (mode === 'NOTIFY') return await notify(s, parsed, new Date());
        if (mode === 'REFRESH') return {status: 'synced', count: parsed.records.length};
        return await view(s, options);
      }
    }
    if (p) throw new Error('周报参数无效。请使用配套快捷指令；缓存未改变。');
    return await view(s, options);
  }
  return {store, read, write, readJSON, sync, notify, renderHTML, view, run, viewerURL};
})();

/* V3.1 recorder: Scriptable calculates; Shortcuts owns the original files. */
const STRecorder = (() => {
  const MAX_SECONDS = 36 * 3600;
  function clean(value) {
    return String(value == null ? '' : value).replace(/^[\uFEFF\u200B]+/, '').trim();
  }
  function normalizedHistory(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  }
  function clock(date) { return STCore.pad(date.getHours()) + ':' + STCore.pad(date.getMinutes()); }
  function activeStamp(date) {
    const offset = -date.getTimezoneOffset();
    return STCore.dateKey(date) + 'T' + clock(date) + ':' + STCore.pad(date.getSeconds()) + '.' + String(date.getMilliseconds()).padStart(3, '0') +
      (offset < 0 ? '-' : '+') + STCore.pad(Math.floor(Math.abs(offset) / 60)) + ':' + STCore.pad(Math.abs(offset) % 60);
  }
  function parseActive(value) {
    const text = clean(value);
    if (!text || text.toUpperCase() === 'CLOSED') return null;
    if (/^\d{10}(?:\d{3})?$/.test(text)) {
      const date = new Date(Number(text) * (text.length === 10 ? 1000 : 1));
      return Number.isFinite(date.getTime()) ? {date, key: STCore.dateKey(date), time: clock(date)} : null;
    }
    // Never use locale-sensitive Date.parse for legacy, zone-less timestamps.
    const a = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(text);
    if (!a) return null;
    const [y, m, d, h, min, sec] = [a[1], a[2], a[3], a[4], a[5], a[6] || '0'].map(Number);
    const key = String(y).padStart(4, '0') + '-' + STCore.pad(m) + '-' + STCore.pad(d);
    if (!STCore.localDate(key) || h > 23 || min > 59 || sec > 59) return null;
    const ms = Number((a[7] || '').padEnd(3, '0'));
    let date;
    if (a[8]) {
      let offset = 0;
      if (a[8] !== 'Z') {
        const zone = /^([+-])(\d{2}):?(\d{2})$/.exec(a[8]);
        if (Number(zone[2]) > 14 || Number(zone[3]) > 59 || (Number(zone[2]) === 14 && Number(zone[3]) !== 0)) return null;
        offset = (Number(zone[2]) * 60 + Number(zone[3])) * (zone[1] === '-' ? -1 : 1);
      }
      const utc = new Date(0); utc.setUTCFullYear(y, m - 1, d); utc.setUTCHours(h, min, sec, ms);
      date = new Date(utc.getTime() - offset * 60000);
    } else {
      date = STCore.localDate(key); date.setHours(h, min, sec, ms);
      if (date.getHours() !== h || date.getMinutes() !== min) return null;
    }
    return {date, key, time: STCore.pad(h) + ':' + STCore.pad(min)};
  }
  function recordEvent(input, now = new Date()) {
    const fields = String(input || '').replace(/\r\n?/g, '\n').split('\n');
    if (fields.shift() !== '__STV31_EVENT__') throw new Error('学习记录参数不完整。请使用配套 V3.1 快捷指令。');
    let mode = clean(fields.shift()).toLowerCase();
    const replay = /^(start|end)\|(\d+)$/.exec(mode);
    if (replay) {
      if (!Number.isFinite(new Date(Number(replay[2])).getTime())) throw new Error('恢复事件时间无效。');
      return replay[1] + '|' + replay[2];
    }
    const focus = clean(fields.join('\n'));
    if (mode && !['start', 'end'].includes(mode)) throw new Error('学习记录只接收 start 或 end；请检查自动化输入。');
    if (!Number.isFinite(now.getTime())) throw new Error('当前系统时间无效。');
    return (mode || (focus === '学习' ? 'start' : 'end')) + '|' + now.getTime();
  }
  function parsePlanInput(input) {
    const text = String(input || '').replace(/\r\n?/g, '\n');
    const a = /^__STV31_RECORD__\n(start|end)\|(\d+)\n([\s\S]*?)\n__STV31_HISTORY__\n([\s\S]*)$/.exec(text);
    if (!a) throw new Error('学习记录参数不完整，未修改任何原始文件。');
    const now = new Date(Number(a[2]));
    if (!Number.isFinite(now.getTime())) throw new Error('学习触发时间无效，未修改文件。');
    return {mode: a[1], now, active: clean(a[3]), sessions: normalizedHistory(a[4])};
  }
  function compute(event) {
    const active = event.active;
    const closed = !active || active.toUpperCase() === 'CLOSED';
    const parsedActive = closed ? null : parseActive(active);
    if (!closed && !parsedActive) throw new Error('active.txt 不是有效开始时间（也不是 CLOSED）。原内容已保留；请检查该文件，不能猜测实际开始时间。');
    const repair = STCore.repairLegacy(event.sessions);
    let sessions = normalizedHistory(repair.text), nextActive = active, status;
    if (event.mode === 'start') {
      if (parsedActive) status = 'already_started';
      else { nextActive = activeStamp(event.now); status = 'started'; }
    } else if (closed) status = 'already_closed';
    else {
      const elapsed = event.now.getTime() - parsedActive.date.getTime();
      if (elapsed < 0) throw new Error('结束时间早于开始时间。已保留 active.txt；请检查系统时钟，未写入负时长。');
      const seconds = Math.floor(elapsed / 1000);
      if (seconds > MAX_SECONDS) throw new Error('未结束的学习会话已超过 36 小时。已保留起始时间，避免把遗忘关闭误记为学习。');
      if (seconds > 0) {
        const line = [parsedActive.key, parsedActive.time, clock(event.now), seconds].join('|');
        sessions += (sessions ? '\n' : '') + line;
        status = 'recorded';
      } else status = 'zero_second_closed';
      nextActive = 'CLOSED';
    }
    return {active: nextActive, sessions, status, repaired: repair.count};
  }
  function output(journal, event) {
    return {
      receipt: journal ? journal.id : '',
      status: journal ? journal.status : 'unchanged',
      writeSessions: journal && !journal.historyVerified && normalizedHistory(event.sessions) !== journal.sessionsAfter ? 'yes' : 'no',
      writeActive: journal && clean(event.active) !== journal.activeAfter ? 'yes' : 'no',
      sessions: journal ? journal.sessionsAfter : event.sessions,
      active: journal ? journal.activeAfter : event.active,
      backupName: journal && journal.repaired ? 'sessions-before-v3.1-' + journal.id + '.txt' : '',
      backup: journal ? journal.sessionsBefore : '',
      event: event.mode + '|' + event.now.getTime(),
      retry: journal && journal.mode !== event.mode ? 'yes' : 'no'
    };
  }
  async function recordPlan(input) {
    const event = parsePlanInput(input), s = ST.store();
    const pending = await ST.read(s, 'record-pending.json', '');
    if (pending) {
      let j;
      try { j = JSON.parse(pending); } catch (_) { throw new Error('学习记录恢复日志损坏；已保留原始文件。'); }
      if (j.version !== 1 || typeof j.sessionsAfter !== 'string' || typeof j.activeAfter !== 'string') throw new Error('恢复日志结构异常，未修改文件。');
      if (![j.activeBefore, j.activeAfter].includes(event.active)) {
        if (!j.activeAfter.startsWith(event.active)) throw new Error('active.txt 在上次未完成保存后发生变化。已停止写入，避免覆盖新会话。');
        ST.write(s, 'active-interrupted-' + Date.now() + '.txt', event.active);
      }
      if (![j.sessionsBefore, j.sessionsAfter].includes(event.sessions)) {
        if (!j.sessionsAfter.startsWith(event.sessions)) throw new Error('sessions.txt 在上次未完成保存后发生变化。已停止写入，避免覆盖历史。');
        ST.write(s, 'sessions-interrupted-' + Date.now() + '.txt', event.sessions);
      }
      j.historyVerified = event.sessions === j.sessionsAfter;
      ST.write(s, 'record-pending.json', JSON.stringify(j));
      return output(j, event);
    }
    const previous = await ST.read(s, 'sessions-mirror.txt');
    if (!event.sessions && normalizedHistory(previous)) throw new Error('没有读到 sessions.txt，但已有历史缓存。已停止记录，防止覆盖历史；请检查 iCloud 文件是否可用。');
    const previousCanonical = normalizedHistory(STCore.repairLegacy(previous).text);
    const incomingCanonical = normalizedHistory(STCore.repairLegacy(event.sessions).text);
    if (previousCanonical && incomingCanonical !== previousCanonical && !incomingCanonical.startsWith(previousCanonical + '\n')) throw new Error('读到的历史与上次成功保存的内容不一致。已停止写入，防止用过期或截断的文件覆盖历史。');
    const target = compute(event);
    if (target.active === event.active && target.sessions === event.sessions) return output(null, event);
    const j = {version: 1, id: String(event.now.getTime()), mode: event.mode, status: target.status,
      activeBefore: event.active, activeAfter: target.active,
      sessionsBefore: event.sessions, sessionsAfter: target.sessions,
      repaired: target.repaired, historyVerified: target.sessions === event.sessions};
    ST.write(s, 'record-pending.json', JSON.stringify(j));
    return output(j, event);
  }
  async function verifyHistory(input) {
    const a = /^__STV31_VERIFY__\n(\d+)\n([\s\S]*)$/.exec(String(input || ''));
    if (!a) throw new Error('保存验证参数无效。');
    const s = ST.store(), j = JSON.parse(await ST.read(s, 'record-pending.json', '{}'));
    if (j.id !== a[1] || normalizedHistory(a[2]) !== j.sessionsAfter) throw new Error('学习记录保存后读回不一致。未关闭会话；重试会恢复同一条记录，不会重新计时。');
    j.historyVerified = true; ST.write(s, 'record-pending.json', JSON.stringify(j));
    return 'verified';
  }
  async function recordCommit(input) {
    const a = /^__STV31_COMMIT__\n(\d*)\n([\s\S]*?)\n__STV31_HISTORY__\n([\s\S]*)$/.exec(String(input || '').replace(/\r\n?/g, '\n'));
    if (!a) throw new Error('完成验证参数无效。');
    const s = ST.store();
    if (a[1]) {
      let j = JSON.parse(await ST.read(s, 'record-pending.json', '{}'));
      const completed = !j.id;
      if (completed) j = JSON.parse(await ST.read(s, 'record-completed.json', '{}'));
      if (j.id !== a[1] || clean(a[2]) !== j.activeAfter || normalizedHistory(a[3]) !== j.sessionsAfter) throw new Error('会话状态或学习记录保存不一致。恢复日志已保留，未确认完成。');
      // Mirror refresh happens before removing the receipt. A failed refresh remains retryable.
      await ST.sync(s, a[3]);
      if (!completed) {
        ST.write(s, 'record-completed.json', JSON.stringify(j));
        s.fm.remove(s.path('record-pending.json'));
      }
      return j.status;
    }
    await ST.sync(s, a[3]);
    return 'unchanged';
  }
  return {clean, normalizedHistory, clock, activeStamp, parseActive, recordEvent, parsePlanInput, compute, recordPlan, verifyHistory, recordCommit};
})();

const ST_VERSION='3.1.3'; /* exposed for the self-check script and the report footer */
module.exports={version:ST_VERSION,run:ST.run,core:STCore,recorder:STRecorder,bridge:ST,
  recordEvent:STRecorder.recordEvent,recordPlan:STRecorder.recordPlan,
  verifyHistory:STRecorder.verifyHistory,recordCommit:STRecorder.recordCommit};
