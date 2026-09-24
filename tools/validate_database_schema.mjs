// Disposable PostgreSQL/WASM checks: no application database is accessed.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(new URL('../tmp/database-validation/pglite/package/dist/index.js', import.meta.url));
const db = new PGlite();
const results=[];
async function test(name, fn) {
  try { await fn(); results.push({name,status:'PASS'}); }
  catch(e) { results.push({name,status:'FAIL',error:e.message,code:e.code}); }
}
async function rejected(name, code, fn) {
  await test(name, async()=>{
    try { await fn(); } catch(e) { if(e.code===code)return; throw e; }
    throw new Error('Expected SQLSTATE '+code+' but statement succeeded');
  });
}
async function ins(table, fields) {
  const f={id:randomUUID(),...fields};
  const names=Object.keys(f);
  await db.query(`INSERT INTO biletflow."${table}" (${names.map(x=>'"'+x+'"').join(',')}) VALUES (${names.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(f));
  return f.id;
}
const future=new Date(Date.now()+3600_000).toISOString();
const later=new Date(Date.now()+7200_000).toISOString();
const now=new Date().toISOString();
await test('Complete reference DDL loads in disposable PostgreSQL', async()=>await db.exec(await readFile(path.join(root,'docs/database/BiletFlow_PostgreSQL_Schema.sql'),'utf8')));
if(results[0].status==='FAIL') {console.log(JSON.stringify(results,null,2));process.exit(1);}
await test('All 66 physical tables created',async()=>{
  const r=await db.query("SELECT count(*)::integer n FROM information_schema.tables WHERE table_schema='biletflow' AND table_type='BASE TABLE'");
  if(r.rows[0].n!==66)throw new Error('Unexpected table count '+r.rows[0].n);
});
const u1=await ins('app_user',{email:'buyer@example.test',password_hash:'test-only',display_name:'Buyer',email_verified_at:now});
const u2=await ins('app_user',{email:'scanner@example.test',password_hash:'test-only',display_name:'Scanner',email_verified_at:now});
const session1=await ins('auth_session',{user_id:u1,refresh_token_hash:'refresh1',client_kind:'web',expires_at:future});
const session2=await ins('auth_session',{user_id:u2,refresh_token_hash:'refresh2',client_kind:'scanner',expires_at:future});
await rejected('Duplicate normalized account email rejected','23505',()=>ins('app_user',{email:'buyer@example.test',password_hash:'test',display_name:'Other'}));
const org1=await ins('organization',{owner_user_id:u1,name:'Org 1',contact_email:'org1@example.test'});
const org2=await ins('organization',{owner_user_id:u2,name:'Org 2',contact_email:'org2@example.test'});
const member1=await ins('organization_member',{organization_id:org1,user_id:u1});
const category=await ins('category',{code:'demo',name_kk:'Demo',name_ru:'Demo',name_en:'Demo'});
const venue=await ins('venue',{name:'Demo venue',address:'Demo address',city:'Almaty'});
const layout=await ins('venue_layout',{venue_id:venue,name:'Demo',canvas_width:1000,canvas_height:1000});
const section=await ins('venue_section',{layout_id:layout,label:'A'});
const row=await ins('venue_row',{layout_id:layout,section_id:section,label:'1'});
const seat=await ins('venue_seat',{layout_id:layout,row_id:row,label:'1',price_category:'standard',x:100,y:100});
async function event(org,uid) {return ins('event',{organization_id:org,category_id:category,venue_id:venue,venue_layout_id:layout,title:'Demo '+uid,description:'Fixture',seating_mode:'assigned',capacity:1,starts_at:future,ends_at:later,registration_opens_at:now,registration_closes_at:future,admission_opens_at:now,admission_closes_at:later,refund_allowed:false,calendar_uid:uid});}
const e1=await event(org1,'event1@example.test'); const e2=await event(org2,'event2@example.test');
await rejected('Cross-organization event staff assignment rejected','23503',()=>ins('event_staff',{event_id:e2,organization_id:org2,member_id:member1}));
async function type(e) {return ins('ticket_type',{event_id:e,name:'Free',description:'Demo',kind:'free',price_minor:0,quantity_limit:1,per_order_limit:1,sales_open_at:now,sales_close_at:future});}
const t1=await type(e1);const t2=await type(e2);
await rejected('Negative ticket price rejected','23514',()=>ins('ticket_type',{event_id:e1,name:'Bad',description:'Bad',kind:'paid',price_minor:-1,quantity_limit:1,per_order_limit:1,sales_open_at:now,sales_close_at:future}));
const es1=await ins('event_seat',{event_id:e1,layout_id:layout,venue_seat_id:seat,ticket_type_id:t1,section_label:'A',row_label:'1',seat_label:'1'});
await test('Same physical seat can belong to a different event',()=>ins('event_seat',{event_id:e2,layout_id:layout,venue_seat_id:seat,ticket_type_id:t2,section_label:'A',row_label:'1',seat_label:'1'}));
const seat2=await ins('venue_seat',{layout_id:layout,row_id:row,label:'2',price_category:'standard',x:120,y:100});
await rejected('Seat cannot map to another event ticket type','23503',()=>ins('event_seat',{event_id:e1,layout_id:layout,venue_seat_id:seat2,ticket_type_id:t2,section_label:'A',row_label:'1',seat_label:'2'}));
const h1=await ins('checkout_hold',{event_id:e1,buyer_user_id:u1,expires_at:future});
const h2=await ins('checkout_hold',{event_id:e1,buyer_user_id:u1,expires_at:future});
const al1=await ins('inventory_allocation',{event_id:e1,hold_id:h1,ticket_type_id:t1,event_seat_id:es1});
const allocation2=()=>ins('inventory_allocation',{event_id:e1,hold_id:h2,ticket_type_id:t1,event_seat_id:es1});
await rejected('Second live seat allocation rejected','23505',allocation2);
await db.query("UPDATE biletflow.inventory_allocation SET state='refund_quarantine' WHERE id=$1",[al1]);
await rejected('Refund-quarantined seat remains unavailable','23505',allocation2);
await db.query("UPDATE biletflow.inventory_allocation SET state='released',released_at=now(),release_reason='refund_succeeded' WHERE id=$1",[al1]);
let al2;await test('Released seat permits a new allocation while preserving old row',async()=>{al2=await allocation2();if(al1===al2)throw new Error('Reused old identity');});
const order=await ins('ticket_order',{event_id:e1,buyer_user_id:u1,hold_id:h2,gross_minor:0,payable_minor:0,policy_snapshot:{version:1},event_snapshot:{version:1},quote_expires_at:future});
const item=await ins('order_item',{order_id:order,event_id:e1,hold_id:h2,ticket_type_id:t1,allocation_id:al2,unit_number:1,ticket_type_name:'Free',recipient_name:'Buyer',recipient_email:'buyer@example.test',face_value_minor:0,paid_minor:0});
await rejected('Order arithmetic mismatch rejected','23514',()=>db.query('UPDATE biletflow.ticket_order SET payable_minor=1 WHERE id=$1',[order]));
const ticket=await ins('ticket',{event_id:e1,order_item_id:item,recipient_user_id:u1,claimed_at:now,qr_token_hash:'ticket-hash'});
await rejected('Duplicate canonical ticket per unit rejected','23505',()=>ins('ticket',{event_id:e1,order_item_id:item,qr_token_hash:'second-hash'}));
await rejected('Entry confirmation cannot use different recipient','23503',()=>ins('entry_confirmation',{ticket_id:ticket,event_id:e1,attendee_user_id:u2,session_id:session2,token_hash:'bad-proof',signing_key_id:'demo',expires_at:future}));
const proof1=await ins('entry_confirmation',{ticket_id:ticket,event_id:e1,attendee_user_id:u1,session_id:session1,token_hash:'proof1',signing_key_id:'demo',expires_at:future});
const proof2=await ins('entry_confirmation',{ticket_id:ticket,event_id:e1,attendee_user_id:u1,session_id:session1,token_hash:'proof2',signing_key_id:'demo',expires_at:future});
const device=await ins('scanner_device',{owner_user_id:u2,device_key:'device-1',label:'Fixture'});
function admission(proof) {return ins('check_in',{ticket_id:ticket,event_id:e1,entry_confirmation_id:proof,scanner_user_id:u2,scanner_session_id:session2,device_id:device,operation_id:randomUUID(),source:'online',captured_at:now});}
const ci1=await admission(proof1);
await rejected('Duplicate current admission rejected','23505',()=>admission(proof2));
await ins('check_in_reversal',{check_in_id:ci1,actor_user_id:u2,reason:'Fixture reversal'});
await db.query('UPDATE biletflow.check_in SET reversed_at=now() WHERE id=$1',[ci1]);
await test('A new admission after reversal preserves first check-in',()=>admission(proof2));
const activation=await ins('sales_activation',{event_id:e1,organization_id:org1});
const intent=await ins('payment_intent',{event_id:e1,activation_id:activation,purpose:'activation',expected_minor:500000});
async function paidAttempt(key) {return ins('payment_attempt',{intent_id:intent,event_id:e1,environment:'simulation',provider:'simulator',merchant_account_key:'demo',request_key:key,status:'succeeded',charged_minor:500000,confirmed_at:now});}
const charge1=await paidAttempt('charge1');
await test('Extra successful external charge can be retained for compensation',()=>paidAttempt('charge2'));
const refund=await ins('refund',{payment_attempt_id:charge1,event_id:e1,reason:'duplicate_charge',amount_minor:500000});
await rejected('Second logical refund for same charge rejected','23505',()=>ins('refund',{payment_attempt_id:charge1,event_id:e1,reason:'duplicate_charge',amount_minor:500000}));
const audit=await ins('audit_log',{event_id:e1,organization_id:org1,service_actor:'test',action:'fixture',entity_type:'event',entity_id:e1,description:'Validation only',correlation_id:randomUUID()});
await rejected('Audit updates rejected by append-only trigger','55000',()=>db.query("UPDATE biletflow.audit_log SET description='altered' WHERE id=$1",[audit]));
await rejected('Audit deletion rejected by append-only trigger','55000',()=>db.query('DELETE FROM biletflow.audit_log WHERE id=$1',[audit]));
await rejected('Deleting event with dependent records is restricted','23001',()=>db.query('DELETE FROM biletflow.event WHERE id=$1',[e1]));
const catalog=await db.query("SELECT contype,count(*)::integer n FROM pg_constraint WHERE connamespace='biletflow'::regnamespace GROUP BY contype ORDER BY contype");
const report={runtime:'PGlite '+(await readFile(path.join(root,'tmp/database-validation/pglite-version.txt'),'utf8')).trim(),database:'Disposable in-memory PostgreSQL; not project/application database',results,catalog:catalog.rows,limitations:['These are structural DDL checks, not tests of unimplemented FastAPI TX contracts.','No multi-connection concurrency benchmark was run.','Fixtures directly manipulate state to test indexes; application guards remain required as documented.']};
await writeFile(path.join(root,'docs/database/sql_validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL'),catalog:catalog.rows},null,2));
await db.close();
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
