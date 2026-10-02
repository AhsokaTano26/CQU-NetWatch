import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStatusHistory } from '../server/status-history.mjs';
const now=1800000000;
const config={labels:{campus:'campus'},campuses:[{id:'hx',name:'虎溪'}],events:{campusMinBuildings:3,campusRatio:.6}};
const series=(values)=>[{metric:{campus:'hx'},values:values.map(([t,v])=>[t,String(v)])}];
test('historical status distinguishes outage, degradation and missing observations',()=>{
 const raw={online:series([[now-2700,1],[now-1800,.4],[now-900,.9]]),loss:series([[now-2700,0],[now-1800,0],[now-900,.1]]),monitored:series([[now-2700,5],[now-1800,5],[now-900,5]])};
 const r=summarizeStatusHistory(raw,config,now-3600,now,900,[]);
 assert.deepEqual(r.campuses[0].samples.map(s=>s.status),['online','offline','pending','empty']);assert.equal(r.incidents.length,1);assert.equal(r.incidents[0].severity,'critical');
 assert.equal(r.campuses[0].availability, .7666666666666666);assert.equal(r.campuses[0].coverage,.75);
});
test('missing quality query cannot appear fully operational',()=>{
 const raw={online:series([[now,1]]),monitored:series([[now,5]])};
 const r=summarizeStatusHistory(raw,config,now-900,now,900,['loss']);assert.equal(r.campuses[0].samples[0].status,'pending');assert.equal(r.incidents.length,0);
});
test('below three monitored buildings cannot imply campus-wide outage',()=>{
 const raw={online:series([[now,0]]),loss:series([[now,0]]),monitored:series([[now,2]])};
 const r=summarizeStatusHistory(raw,config,now-900,now,900,[]);assert.equal(r.campuses[0].samples[0].status,'pending');assert.equal(r.incidents.length,0);
});
