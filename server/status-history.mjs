import { buildExpression } from './prometheus.mjs';
export function buildStatusExpressions(config) {
  const c=config.labels.campus,b=config.labels.building;
  const online=buildExpression(config,'online'),seen=buildExpression(config,'lastSeen'),loss=buildExpression(config,'loss');
  if(!online||!seen)return {online:null,loss:null,monitored:null};
  const group=`${c},${b}`;
  const eligible=`(max by(${group}) (${online})) and ((max by(${group}) (${seen})) >= time() - ${config.thresholds.nodeOfflineSeconds})`;
  const monitored=`count by(${c}) (${eligible})`;
  const buildingLoss=loss&&`max by(${group}) (${loss})`;
  return { online:`avg by(${c}) (${eligible})`, monitored,
    loss:buildingLoss&&`(sum by(${c}) ((${buildingLoss} > bool 0) and (${eligible}))) / (${monitored})` };
}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function summarizeStatusHistory(raw,config,start,end,step,errors) {
  const indexes={};
  for(const [key,series] of Object.entries(raw)){
    indexes[key]=new Map();
    for(const s of series){const campus=s.metric?.[config.labels.campus];if(!campus)continue;
      indexes[key].set(campus,new Map((s.values||[]).filter(([t,v])=>Number.isFinite(Number(t)) && v!==null && v!=='' && Number.isFinite(Number(v))).map(([t,v])=>[Number(t),Number(v)])));}
  }
  const ids=[...new Set([...config.campuses.map(c=>c.id),...[...(indexes.online?.keys()||[])]])];const incidents=[];
  const campuses=ids.map(id=>{
    const name=config.campuses.find(c=>c.id===id)?.name||id;const samples=[];
    let open;
    for(let t=start+step;t<=end;t+=step){
      const online=indexes.online?.get(id)?.get(t),loss=indexes.loss?.get(id)?.get(t),monitored=indexes.monitored?.get(id)?.get(t);
      const observed=finite(online)&&online>=0&&online<=1&&finite(monitored)&&monitored>0;
      const quality=finite(loss)&&loss>=0&&loss<=1&&!errors.length;
      const enough=monitored>=config.events.campusMinBuildings;
      const offline=observed&&enough&&(1-online)*monitored>=config.events.campusMinBuildings-1e-6&&1-online>=config.events.campusRatio-1e-6;
      const unstable=quality&&enough&&loss*monitored>=config.events.campusMinBuildings-1e-6&&loss>=config.events.campusRatio-1e-6;
      const status=!observed?'empty':offline?'offline':unstable?'unstable':!quality||online<1||loss>0?'pending':'online';
      samples.push({time:t,status,online:observed?online:null,loss:quality?loss:null,monitored:observed?monitored:0});
      const kind=offline?'offline':unstable?'loss':null;
      if(open&&kind!==open.kind){open.end=t;open.outcome=status==='empty'?'unknown':'resolved';incidents.push(open);open=null;}
      if(kind&&!open)open={id:`${id}:${t}:${kind}`,campus:id,name,kind,start:t,end:null,outcome:'ongoing',severity:kind==='offline'?'critical':'warning',title:`${name}${kind==='offline'?'大面积探针断网':'大面积丢包'}`,affectedBuildings:Math.round((kind==='offline'?1-online:loss)*monitored),monitoredBuildings:monitored};
    }
    if(open)incidents.push(open);
    const observed=samples.filter(s=>s.online!==null);
    return {id,name,samples,availability:observed.length?observed.reduce((sum,s)=>sum+s.online,0)/observed.length:null,coverage:samples.length?observed.length/samples.length:0};
  });
  incidents.sort((a,b)=>b.start-a.start);
  return {campuses,incidents:incidents.slice(0,100),start,end,step,generatedAt:Math.floor(Date.now()/1000),timezone:'Asia/Shanghai',errors};
}
export function createStatusHistory(config,prometheus){
  return async()=>{
    const step=900,end=Math.floor(Date.now()/1000/step)*step,start=end-604800;
    const expressions=buildStatusExpressions(config),keys=Object.keys(expressions);
    const results=await Promise.allSettled(keys.map(k=>expressions[k]&&config.prometheusUrl?prometheus.queryExpression(expressions[k],{start,end,step},300):Promise.resolve([])));
    const raw={},errors=[];results.forEach((r,i)=>{if(r.status==='fulfilled')raw[keys[i]]=r.value;else{raw[keys[i]]=[];errors.push(keys[i]);}});
    return {...summarizeStatusHistory(raw,config,start,end,step,errors),source:{state:!config.prometheusUrl?'unconfigured':errors.length===keys.length?'error':errors.length?'partial':'ready',errors:errors.map(metric=>({metric,code:'unreachable'}))}};
  };
}
