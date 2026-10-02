import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventExpressions, evaluateEvents } from '../server/events.mjs';
import { loadConfig } from '../server/config.mjs';
const now=1800000000;const config=await loadConfig({});
const probe=(extra={})=>({id:'p',network:'wired',online:1,lastSeen:now-5,reportState:'online',lossMax:0,targets:[],...extra});
const building=(id,extra={})=>({id:`hx-${id}`,campus:'hx',building:id,name:`${id}栋`,status:'online',onlineProbes:1,totalProbes:1,probes:[probe()],...extra});
const inputs=bs=>Object.fromEntries(bs.map(b=>[b.id,{p95:.004,p99:.08,count:2016}]));
test('any target packet loss warns immediately without averages or baseline',()=>{
 const b=building('a',{probes:[probe({lossMax:.001,targets:[{metric:'loss',target:'dns',value:.001}]})],loss:.00001});
 const r=evaluateEvents([b],{},config,now);assert.equal(r.items[0].severity,'warning');assert.equal(r.items[0].value,.001);assert.equal(r.items[0].threshold,0);assert.equal(r.items[0].affectedProbes[0].id,'p');
});
test('serious loss strictly exceeds max(5 percent, P99 plus two percentage points)',()=>{
 const b=building('a',{probes:[probe({lossMax:.1})]});const s=inputs([b]);
 assert.equal(evaluateEvents([b],s,config,now).items[0].severity,'warning');
 b.probes[0].lossMax=.1001;const e=evaluateEvents([b],s,config,now).items[0];assert.equal(e.severity,'critical');assert.equal(e.threshold,.1);
 s[b.id].count=10;b.probes[0].lossMax=.051;const fallback=evaluateEvents([b],s,config,now).items[0];assert.equal(fallback.severity,'critical');assert.equal(fallback.threshold,.05);assert.equal(fallback.p99,undefined);
});
test('one interrupted probe produces an event even when other probes still report',()=>{
 const b=building('a',{status:'pending',probes:[probe(),probe({id:'bad',online:0,lastSeen:now-1800,reportState:'interrupted'})]});
 const e=evaluateEvents([b],{},config,now).items[0];assert.equal(e.kind,'offline');assert.equal(e.affectedProbes.length,1);assert.equal(e.affectedProbes[0].id,'bad');assert.match(e.title,/探针断网/);
 b.probes[1].lastSeen=now-1799;assert.equal(evaluateEvents([b],{},config,now).items.length,0);
 b.probes[1].lastSeen=now-86400;assert.equal(evaluateEvents([b],{},config,now).items.length,1);
 b.probes[1].lastSeen=now-86401;b.probes[1].reportState='retired';assert.equal(evaluateEvents([b],{},config,now).items.length,0);
});
test('retirement and missing observations never count as recovered',()=>{
 const b=building('a',{probes:[probe({lastSeen:now-90000,online:null,reportState:'retired'})]});
 assert.ok(!evaluateEvents([b],{},config,now).resolvedIds.includes(`offline:${b.id}`));
 b.probes.push(probe());assert.ok(!evaluateEvents([b],{},config,now).resolvedIds.includes(`offline:${b.id}`));
 b.probes=[probe({lastSeen:null,online:null,reportState:'unknown'})];assert.equal(evaluateEvents([b],{},config,now).resolvedIds.length,0);
});
test('campus denominator counts unique recent buildings; partial probe failure is not whole campus outage',()=>{
 const bs=['a','b','c','d','e'].map(x=>building(x));for(const b of bs.slice(0,3))b.probes=[probe({lossMax:.02}),probe({id:'bad',online:0,lastSeen:now-2000,reportState:'interrupted'})];
 const r=evaluateEvents(bs,inputs(bs),config,now);assert.equal(r.items[0].scope,'campus');assert.equal(r.items[0].affectedBuildings,3);assert.equal(r.items[0].monitoredBuildings,5);assert.notEqual(r.items[0].kind,'offline');
 bs.push(building('new'));assert.ok(!evaluateEvents(bs,inputs(bs),config,now).items.some(e=>e.scope==='campus'));
});
test('query failures suppress campus claims and explicit recovery',()=>{
 const bs=['a','b','c'].map(x=>building(x,{probes:[probe({lossMax:.02})]}));
 assert.ok(!evaluateEvents(bs,inputs(bs),config,now,['source']).items.some(e=>e.scope==='campus'));
 assert.equal(evaluateEvents([building('a')],{},config,now,['source']).resolvedIds.length,0);
});
test('historical baseline uses maximum target loss, current events need no persistence query',()=>{
 const q=buildEventExpressions(config);assert.ok(q.p99.includes('quantile_over_time(0.99'));assert.ok(q.p99.includes('max by(campus,building)'));assert.ok(q.p99.includes('[7d:5m] offset 15m'));assert.equal(q.sustainedLoss,undefined);assert.equal(q.sustainedOffline,undefined);
});
