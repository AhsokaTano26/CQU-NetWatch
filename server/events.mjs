import { buildExpression } from './prometheus.mjs';
const finite = n => typeof n === 'number' && Number.isFinite(n);

export function buildEventExpressions(config) {
  const { campus:c, building:b } = config.labels;
  const loss = buildExpression(config, 'loss');
  // Match the current event statistic: worst target of any probe, never a mean.
  const peak = loss && `max by(${c},${b}) (${loss})`;
  const history = peak && `(${peak})[7d:5m] offset 15m`;
  return { p95:history && `quantile_over_time(0.95, ${history})`, p99:history && `quantile_over_time(0.99, ${history})`, count:history && `count_over_time(${history})` };
}

export function evaluateEvents(buildings, signals, config, now, errors = []) {
  const options=config.events, items=[],resolvedIds=[],eligible=new Map(); let baselineBuildings=0;
  const healthy=errors.length===0;
  for (const b of buildings) {
    const recent=(b.probes||[]).filter(p=>finite(p.lastSeen)&&p.lastSeen>0&&p.lastSeen<=now+30&&now-p.lastSeen<=config.thresholds.nodeOfflineSeconds);
    if (!recent.length) continue;
    if (!eligible.has(b.campus)) eligible.set(b.campus,[]);
    eligible.get(b.campus).push(b);
    const s=signals[b.id]||{};
    const baseline=finite(s.p99)&&s.p99>=0&&s.p99<=1&&finite(s.count)&&s.count>=options.minSamples;
    if (baseline) baselineBuildings++;
    const critical=Math.max(options.lossCriticalFloor,baseline?s.p99+options.p99Margin:0);
    const common={scope:'building',campus:b.campus,buildingId:b.id,buildingName:b.name,since:now};
    const interrupted=recent.filter(p=>now-p.lastSeen>=config.thresholds.reportOfflineSeconds);
    if (interrupted.length) items.push({...common,id:`offline:${b.id}`,kind:'offline',severity:'critical',since:Math.min(...interrupted.map(p=>p.lastSeen+config.thresholds.reportOfflineSeconds)),
      title:`${b.name}${interrupted.length===recent.length?'疑似断网':'探针断网'}`,
      message:`${interrupted.length} 个探针距上次上报已达到 30 分钟，尚未超过 24 小时。${interrupted.length===recent.length?'全部近期有上报的探针受影响。':'其余探针仍有近期上报，不代表整栋楼断网。'}`,
      affectedProbes:interrupted.map(p=>({id:p.id,network:p.network,lastSeen:p.lastSeen}))});
    else if (healthy && recent.every(p=>p.reportState==='online') && !(b.probes||[]).some(p=>p.reportState==='unknown'||p.reportState==='retired')) resolvedIds.push(`offline:${b.id}`);
    const reporting=recent.filter(p=>now-p.lastSeen<config.thresholds.reportOfflineSeconds);
    const lossy=reporting.filter(p=>finite(p.lossMax)&&p.lossMax>0);
    if (lossy.length) {
      const measured=Math.max(...lossy.map(p=>p.lossMax));const severe=measured>critical;
      items.push({...common,id:`loss:${b.id}`,kind:'loss',severity:severe?'critical':'warning',title:`${b.name}${severe?'严重丢包':'出现丢包'}`,
        message:'任一探针、任一测量目标丢包率大于 0 即告警，按最高丢包率判断严重程度。',value:measured,threshold:severe?critical:0,criticalThreshold:critical,
        ...(baseline?{p99:s.p99,...(finite(s.p95)?{p95:s.p95}:{})}:{}),baselineAvailable:baseline,
        affectedProbes:lossy.map(p=>({id:p.id,network:p.network,value:p.lossMax,targets:(p.targets||[]).filter(t=>t.metric==='loss'&&t.value>0).map(t=>({target:t.target,value:t.value}))}))});
    } else if (healthy && reporting.length && reporting.every(p=>finite(p.lossMax)&&p.lossMax===0) && recent.length===reporting.length) resolvedIds.push(`loss:${b.id}`);
  }
  if (healthy) for (const [campus,monitored] of eligible) {
    const current=items.filter(e=>e.campus===campus);
    const ids=[...new Set(current.map(e=>e.buildingId))];
    if(ids.length<options.campusMinBuildings||ids.length/monitored.length<options.campusRatio)continue;
    const offline=monitored.filter(b=>b.status==='offline'&&current.some(e=>e.buildingId===b.id&&e.kind==='offline')).length;
    const lossy=current.filter(e=>e.kind==='loss').length;
    const quorum=n=>n>=options.campusMinBuildings&&n/monitored.length>=options.campusRatio;
    const kind=quorum(offline)?'offline':quorum(lossy)?'loss':'mixed';
    const name=config.campuses.find(c=>c.id===campus)?.name||campus;
    items.push({id:`campus:${campus}`,scope:'campus',campus,kind,severity:current.some(e=>e.severity==='critical')?'critical':'warning',since:Math.min(...current.map(e=>e.since)),
      title:`${name}${kind==='offline'?'校园网疑似中断':kind==='loss'?'丢包率上升':'网络大面积异常'}`,
      message:`近期有监控的 ${monitored.length} 栋中，${ids.length} 栋存在异常探针。此结果仅覆盖已部署探针的楼栋。`,affectedBuildings:ids.length,monitoredBuildings:monitored.length,buildingIds:ids});
  }
  items.sort((a,b)=>(a.scope==='campus'?0:1)-(b.scope==='campus'?0:1)||(a.severity==='critical'?0:1)-(b.severity==='critical'?0:1)||(a.kind==='offline'?0:1)-(b.kind==='offline'?0:1)||a.id.localeCompare(b.id));
  return {items,resolvedIds,baselineBuildings,monitoredBuildings:[...eligible.values()].reduce((n,b)=>n+b.length,0),baselineWindow:'7d',excludedMinutes:15,minSamples:options.minSamples,confirmSeconds:0,errors};
}

export function createEventReader(config, prometheus) {
  const expressions = buildEventExpressions(config); let snapshot; let pending;
  function update() {
    const keys = Object.keys(expressions);
    pending = Promise.allSettled(keys.map(k=>prometheus.queryEvent(k, expressions[k]))).then(results=>{
      const raw = {}; const errors=[];
      results.forEach((r,i)=>{if(r.status==='fulfilled')raw[keys[i]]=r.value;else{raw[keys[i]]=[];errors.push(keys[i]);}});
      snapshot={raw,errors,at:Date.now()/1000};
    }).finally(()=>{pending=null;});
  }
  return (buildings, source, now) => {
    if (!config.prometheusUrl || !config.events.enabled) return {state:config.events.enabled?'unconfigured':'disabled',items:[],baselineBuildings:0,monitoredBuildings:0};
    if (!pending && (!snapshot || now-snapshot.at>=config.refreshSeconds)) update();
    const baselineSnapshot=snapshot && now-snapshot.at<=600?snapshot:undefined;
    const signals={};
    for(const b of buildings) signals[b.id]={};
    const lookup=new Map(buildings.map(b=>[JSON.stringify([b.campus,b.building]),b.id]));
    for(const [key,series] of Object.entries(baselineSnapshot?.raw||{})) for(const s of series){
      const id=lookup.get(JSON.stringify([s.metric?.[config.labels.campus],s.metric?.[config.labels.building]]));
      const value=s.value?.[1];const timestamp=Number(s.value?.[0]);
      if(id && value!=='' && value!=null && Number.isFinite(timestamp) && timestamp<=now+30 && now-timestamp<= (['p95','p99','count'].includes(key)?600:config.thresholds.sampleMaxAge))signals[id][key]=Number(value);
    }
    const errors=source.state!=='ready'?['source']:[];
    return { ...evaluateEvents(buildings,signals,config,now,errors), state:errors.length?'partial':'ready', evaluatedAt:Math.floor(now), baselineState:!baselineSnapshot?'warming':baselineSnapshot.errors.length?'partial':'ready' };
  };
}
