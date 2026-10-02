import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeBuilding} from '../server/status.mjs';import {loadConfig} from '../server/config.mjs';import {buildExpression} from '../server/prometheus.mjs';
const config=await loadConfig({});const now=1800000000;
const sample=(metric,value,probe='a',target='')=>({metric,value,probe,target,network:'wired',timestamp:now});
function summarize(age,more=[]){return summarizeBuilding({id:'hx-a',campus:'hx',building:'a'},[sample('lastSeen',now-age),sample('online',0),...more],config.thresholds,false,now)}
test('last report decides 30 minute interruption and greater than 24 hour node retirement',()=>{
 assert.equal(summarize(1799).probes[0].reportState,'online');assert.equal(summarize(1799).probes[0].online,1);
 assert.equal(summarize(1800).probes[0].reportState,'interrupted');assert.equal(summarize(1800).status,'offline');
 assert.equal(summarize(86400).probes[0].reportState,'interrupted');assert.equal(summarize(86401).probes[0].reportState,'retired');assert.equal(summarize(86401).status,'empty');
});
test('missing and future last report remain unknown, never inferred offline from exporter flag',()=>{
 const b={id:'hx-a'};assert.equal(summarizeBuilding(b,[sample('online',0)],config.thresholds,false,now).status,'empty');assert.equal(summarize(-40).probes[0].reportState,'unknown');
});
test('a single tiny target loss marks the building unstable despite a tiny building mean',()=>{
 const r=summarize(5,[sample('loss',0,'a','one'),sample('loss',.001,'a','two')]);assert.equal(r.status,'unstable');assert.equal(r.probes[0].lossMax,.001);
});
test('retired nodes do not contaminate live building status',()=>{
 const r=summarizeBuilding({id:'hx-a'},[sample('lastSeen',now-5),sample('loss',0,'a','dns'),sample('lastSeen',now-90000,'old'),sample('online',0,'old')],config.thresholds,false,now);assert.equal(r.status,'online');assert.equal(r.retiredProbes,1);
});
test('PromQL report ages drive current and history online while quality remains freshness gated',()=>{
 const q=buildExpression(config,'online');assert.ok(q.includes('1800'));assert.ok(q.includes('86400'));assert.ok(q.includes('last_seen'));assert.ok(!q.includes('campus_probe_online'));assert.ok(buildExpression(config,'loss').includes('<= 180'));
});
