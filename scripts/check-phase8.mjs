import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mapStatus, facilityMapStates} from '../assets/js/map-core.js';
for (const [status,tone] of Object.entries({pending:'waiting',pickup:'accepted',transit:'progress',arrived:'progress',completed:'complete',cancelled:'rejected'})) {
    assert.equal(mapStatus('pickup',{status}).tone,tone,status);
}
for (const [status,tone] of Object.entries({pending:'waiting',revision_required:'revision',rejected:'rejected',approved:'accepted'})) {
    assert.equal(mapStatus('facility',{status}).tone,tone,status);
}
for (const [status,tone] of Object.entries({assigned:'accepted',assessment_in_progress:'progress',handling_in_progress:'progress',resolution_submitted:'progress',resolution_revision_required:'revision',completed:'complete'})) {
    assert.equal(mapStatus('facility',{status:'approved',handling_status:status}).tone,tone,status);
}
assert.equal(mapStatus('facility',{status:'rejected',handling_status:'completed'}).tone,'rejected');
assert.equal(mapStatus('facility',{status:'approved',handling_unavailable:true}).tone,'neutral');
assert.equal(mapStatus('facility',{status:'approved',handling_status:'future_state'}).tone,'neutral');
assert.equal(mapStatus('pickup',{status:'future_state'}).tone,'neutral');
const reads=[];
const enriched=await facilityMapStates([{id:1,status:'pending'},{id:2,status:'approved'},{id:3,status:'approved'}],async path=>{
    reads.push(path); if(path.includes('/3/'))throw Error('unavailable'); return {status:'completed'};
},'/reports');
assert.deepEqual(reads,['/reports/2/handling','/reports/3/handling']);
assert.equal(mapStatus('facility',enriched[1]).tone,'complete');
assert.equal(mapStatus('facility',enriched[2]).tone,'neutral');
const source=readFileSync(new URL('../assets/js/dashboard.js',import.meta.url),'utf8');
const summaryCode=source.slice(source.indexOf('function summarizeUserPickups('),source.indexOf('function setDashboardMarkup('));
const chartCode=source.slice(source.indexOf('function renderChart('),source.indexOf('// Init',source.indexOf('function renderChart(')));
const canvas={parentElement:{}},empty={}; let chart;
const context=vm.createContext({Intl,Date,Number,console,monthlyChart:null,renderUserActivePickup:()=>'',document:{getElementById:id=>id==='monthlyWasteChart'?canvas:empty},Chart:function(_ctx,config){chart=config;this.destroy=()=>{};}});
vm.runInContext(summaryCode+chartCode,context);
context.pickups=[['2026-10-10T00:00:00Z',2],['2025-12-31T18:00:00Z',4],['2026-08-15T00:00:00Z',3],['2026-09-15T00:00:00Z',1]].map(([verified_at,final_weight_kg])=>({status:'completed',verified_at,final_weight_kg,created_at:'2024-01-01T00:00:00Z'}));
vm.runInContext('renderChart(summarizeUserPickups(pickups).monthlyWeights)',context);
assert.deepEqual(Array.from(chart.data.datasets[0].data),[4,3,1,2]);
assert.match(chart.data.labels[0],/2026/);
vm.runInContext('renderChart({})',context);
assert.equal(canvas.parentElement.hidden,true);
console.log('PASS Phase 8: all real status mappings, unknown/failed handling, approved-only enrichment, chronological verified month aggregation including Jakarta year boundary, empty chart.');
