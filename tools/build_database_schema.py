"""Generate the editable draw.io atlas, PostgreSQL DDL and specification from one model."""
from pathlib import Path
from collections import defaultdict
import html
import json
import re
import textwrap
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'database'
MODEL = json.loads((OUT / 'schema_model.json').read_text(encoding='utf-8'))
TABLES = {t['name']: t for t in MODEL['tables']}
FKS = MODEL['foreignKeys']
for i, fk in enumerate(FKS, 1):
    fk['name'] = f"fk_{fk['table']}_{i:03d}"
    assert fk['target'] in TABLES
    tc = {c['name'] for c in TABLES[fk['table']]['columns']}
    rc = {c['name'] for c in TABLES[fk['target']]['columns']}
    assert set(fk['columns']) <= tc and set(fk['targetColumns']) <= rc, fk
    assert fk['targetColumns'] in [['id']] + TABLES[fk['target']]['unique'], fk

def q(s):
    return '"' + s.replace('"', '""') + '"'

def cols(xs):
    return ', '.join(q(x) for x in xs)

def lit(s):
    return "'" + s.replace("'", "''") + "'"

def fk_multiplicity(fk):
    t = TABLES[fk['table']]
    optional = any(c['nullable'] for c in t['columns'] if c['name'] in fk['columns'])
    # A unique subset of FK columns makes the child side at most one.
    unique_child = any(set(u) <= set(fk['columns']) for u in t['unique'])
    return ('0..1' if optional else '1', '0..1' if unique_child else '0..*')

def index_sql(i):
    w = ' WHERE ' + i['where'] if i.get('where') else ''
    return f"CREATE {'UNIQUE ' if i.get('unique') else ''}INDEX {q(i['name'])} ON {q(i['table'])} ({i['columns']}){w};"

def build_sql():
    lines = [
        '-- BiletFlow physical schema design, PostgreSQL. Generated from schema_model.json.',
        '-- Reference DDL only: TX contracts in the specification still require application/service implementation.',
        '-- Run against an EMPTY database/schema for validation, not an existing production database.',
        '-- Exact KZT minor units (1 KZT = 100 units); UUIDs generated with gen_random_uuid().',
        'BEGIN;', 'CREATE SCHEMA biletflow;', 'SET search_path TO biletflow, public;', ''
    ]
    for t in TABLES.values():
        definitions = []
        for c in t['columns']:
            d = f"  {q(c['name'])} {c['type']}"
            if not c['nullable']:
                d += ' NOT NULL'
            if c.get('default'):
                d += ' DEFAULT ' + c['default']
            definitions.append(d)
        definitions.append(f"  CONSTRAINT {q(t['name'] + '_pk')} PRIMARY KEY (id)")
        for i, u in enumerate(t['unique'], 1):
            definitions.append(f"  CONSTRAINT {q(t['name'] + '_uq' + str(i))} UNIQUE ({cols(u)})")
        for i, c in enumerate(t['checks'], 1):
            definitions.append(f"  CONSTRAINT {q(t['name'] + '_ck' + str(i))} CHECK ({c})")
        lines += [f"CREATE TABLE {q(t['name'])} (", ',\n'.join(definitions), ');',
                  f"COMMENT ON TABLE {q(t['name'])} IS {lit(t['purpose'])};"]
        for c in t['columns']:
            lines.append(f"COMMENT ON COLUMN {q(t['name'])}.{q(c['name'])} IS {lit(c['note'])};")
        lines.append('')
    lines += ['-- Add FKs after all tables exist (intent/activation/order/attempt references are cyclic).']
    for f in FKS:
        lines.append(f"ALTER TABLE {q(f['table'])} ADD CONSTRAINT {q(f['name'])} FOREIGN KEY ({cols(f['columns'])}) REFERENCES {q(f['target'])} ({cols(f['targetColumns'])}) ON DELETE RESTRICT ON UPDATE RESTRICT;")
    lines += ['', '-- Conditional uniqueness and workload indexes. Never use now() in a partial predicate.']
    for i in MODEL['indexes']:
        lines.append(index_sql(i))
    # PostgreSQL does not automatically index referencing FK columns.
    for f in FKS:
        t = TABLES[f['table']]
        candidates = [['id']] + t['unique'] + [re.split(r',\s*', i['columns']) for i in MODEL['indexes'] if i['table'] == t['name'] and not i.get('where')]
        if not any(u[:len(f['columns'])] == f['columns'] for u in candidates):
            name = 'ix_' + f['name'][3:]
            lines.append(f"CREATE INDEX {q(name)} ON {q(t['name'])} ({cols(f['columns'])});")
    lines += ['', '-- Protect append-only evidence even from accidental ordinary UPDATE/DELETE statements.',
              'CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$',
              "BEGIN RAISE EXCEPTION 'append-only history: % cannot be %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000'; END;", '$$;']
    for name in MODEL['appendOnly']:
        lines += [f"CREATE TRIGGER {q(name + '_immutable')} BEFORE UPDATE OR DELETE ON {q(name)} FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();"]
    lines += ['', '-- Application and worker roles must not own the schema or have DDL/TRUNCATE privileges.',
              '-- Explicit grants and authenticated transaction services are deployment work; do not expose these tables directly to clients.',
              'COMMIT;', '']
    (OUT / 'BiletFlow_PostgreSQL_Schema.sql').write_text('\n'.join(lines), encoding='utf-8')

PALETTE = ['#22577A', '#276749', '#7056A5', '#9C4221', '#285E61', '#805AD5', '#245C80', '#7B341E']

class Atlas:
    def __init__(self):
        self.xml = ET.Element('mxfile', {'host':'app.diagrams.net','type':'device','compressed':'false','version':'26.0.0'})
        self.pages = []
        self.bounds = []
        self.count = 0

    def page(self, name, title, subtitle, width=1520, height=1800):
        self.count += 1
        self.current_id = f'bf-page-{self.count:02d}'
        d = ET.SubElement(self.xml, 'diagram', {'id':self.current_id, 'name':name})
        self.g = ET.SubElement(d, 'mxGraphModel', {'dx':'0','dy':'0','grid':'0','gridSize':'10','guides':'1','tooltips':'1','connect':'1','arrows':'1','fold':'1','page':'1','pageScale':'1','pageWidth':str(width),'pageHeight':str(height),'math':'0','shadow':'0','background':'#FFFFFF'})
        self.r = ET.SubElement(self.g, 'root')
        ET.SubElement(self.r,'mxCell',{'id':'0'})
        ET.SubElement(self.r,'mxCell',{'id':'1','parent':'0'})
        self.n=0
        self.current_bounds=[]
        self.pages.append({'id':self.current_id,'name':name,'width':width,'height':height})
        self.text(title,50,28,width-100,45,30,True,'#17324D')
        self.text(subtitle,50,82,width-100,55,15,False,'#526477')
        return self.current_id

    def cell(self, value, x,y,w,h,style, cid=None, track=True):
        self.n+=1
        cid=cid or f'v{self.n}'
        c=ET.SubElement(self.r,'mxCell',{'id':cid,'value':value,'vertex':'1','parent':'1','style':style})
        ET.SubElement(c,'mxGeometry',{'x':str(x),'y':str(y),'width':str(w),'height':str(h),'as':'geometry'})
        if track:
            self.current_bounds.append((cid,x,y,w,h))
        return cid

    def text(self,value,x,y,w,h,size=14,bold=False,color='#1F2937',cid=None):
        return self.cell(html.escape(value).replace('\n','<br>'),x,y,w,h,f'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontFamily=Arial;fontSize={size};fontStyle={1 if bold else 0};fontColor={color};spacing=0;',cid,False)

    def box(self,title,body,x,y,w,color='#22577A',minh=0,mono=False,cid=None):
        wrap_width=max(30,int((w-32)/(7.25 if mono else 7.1)))
        lines=[]
        for line in body.split('\n'):
            lines.extend(textwrap.wrap(line, wrap_width, break_long_words=True, replace_whitespace=False, drop_whitespace=True) or [''])
        h=max(minh,55+len(lines)*19+15)
        self.n+=1
        base=cid or f'box{self.n}'
        self.cell('',x,y,w,h,'rounded=0;html=1;fillColor=#FFFFFF;strokeColor=#CBD5E1;strokeWidth=1.2;',base)
        self.cell(html.escape(title),x,y,w,42,f'rounded=0;html=1;align=left;spacingLeft=14;fontFamily=Arial;fontSize=17;fontStyle=1;fontColor=#FFFFFF;fillColor={color};strokeColor={color};',base+'-title',False)
        font='Consolas, monospace' if mono else 'Arial'
        content='<div style="font-family:'+font+';font-size:13px;line-height:19px;white-space:pre;">'+html.escape('\n'.join(lines))+'</div>'
        self.cell(content,x+14,y+53,w-28,h-60,'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=0;overflow=visible;',base+'-body',False)
        return base,h

    def edge(self,source,target,label='',points=None,dashed=False,extra_style=''):
        self.n+=1
        c=ET.SubElement(self.r,'mxCell',{'id':f'e{self.n}','edge':'1','parent':'1','source':source,'target':target,'value':html.escape(label),'style':f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=open;endFill=0;strokeColor=#64748B;strokeWidth=1.5;fontFamily=Arial;fontSize=12;labelBackgroundColor=#FFFFFF;dashed={1 if dashed else 0};'+extra_style})
        g=ET.SubElement(c,'mxGeometry',{'relative':'1','as':'geometry'})
        if points:
            a=ET.SubElement(g,'Array',{'as':'points'})
            for x,y in points:
                ET.SubElement(a,'mxPoint',{'x':str(x),'y':str(y)})

    def finish(self, bottom=None):
        if bottom:
            self.g.set('pageHeight',str(int(bottom+70)))
            self.pages[-1]['height']=int(bottom+70)
        for i,a in enumerate(self.current_bounds):
            for b in self.current_bounds[i+1:]:
                if a[1]<b[1]+b[3] and b[1]<a[1]+a[3] and a[2]<b[2]+b[4] and b[2]<a[2]+a[4]:
                    raise AssertionError(f'Overlapping boxes: {self.current_id}: {a[0]}, {b[0]}')
        self.bounds += [(self.current_id,)+b for b in self.current_bounds]

def build_atlas():
    a=Atlas()
    a.page('00 Start here','BiletFlow / database atlas','FastAPI + PostgreSQL | Full academic scope | Editable UML-style relational schema and transaction specification',1520,1500)
    a.box('HOW TO READ THIS ATLAS',
          '66 tables, all columns and constraints, scoped foreign keys, and operation contracts.\n\nPages 01-16: domain tables. Every FK is listed with exact column mapping and UML multiplicity. Cross-page references name the target table; they are not missing relationships.\n\nCORE RELATIONS: simplified visual spine.\nRULES: global invariants and enforcement layer.\nACTIVITIES: checkout, refund, admission, offline and durable delivery.\nOPERATIONS: every transaction write set and failure behavior.\nSTATES: permitted transitions and guards.\n\nCompanion specification includes full data dictionary, relationship catalogue, indexes, access rules and SQL enforcement boundary.',50,165,680,'#22577A')
    a.box('NOTATION / ENFORCEMENT',
          '<<table>> = physical relational table shown as UML class.\nPK = primary key; FK = foreign key; UQ = unique key.\nNN = NOT NULL; ? = nullable.\nA child FK points to 1 or 0..1 parent.\nA parent has 0..* children unless a unique FK limits it to 0..1.\nNo composition diamonds: deletes do NOT cascade.\n\nDDL = enforced by supplied PostgreSQL schema.\nTX = required atomic application transaction; not implemented by DDL alone.\nAPP = authorization, parsing, storage or provider code.\nQUERY = read-model/query correctness.\n\nAll money is bigint minor units: 1 KZT = 100.\nTimes use timestamptz; event stores its named timezone.',790,165,680,'#276749')
    a.box('CRITICAL USER RULE',
          'Refund approval first invalidates the original ticket and quarantines inventory. Commit this BEFORE asking the provider for a refund.\n\nPending, uncertain or failed refunds do not make stock saleable. Only authoritative refund success releases the allocation.\n\nA later buyer receives a NEW allocation, order item and ticket. The old ticket and all financial relations remain in history.',50,840,680,'#9C4221')
    a.box('SCOPE AND STATUS',
          'This is a design baseline, not a claim that the application or migrations are deployed.\n\nAll requirements modules and bonuses are represented. Real-money operation and production KYC remain excluded.\n\nProposed defaults such as recipient claiming, one-time attendee entry proof and offline final admission remain labelled in the specification.\n\nOffline operations are provisional. They become central admissions only after current-state validation on reconnect.',790,840,680,'#7056A5')
    a.finish()
    groups=defaultdict(list)
    for t in TABLES.values(): groups[t['group']].append(t)
    for gi,(group,tables) in enumerate(groups.items()):
        a.page(group,group+' / physical tables','Each class lists attributes, keys, CHECK expressions and complete outbound FK mappings. FK line: parent multiplicity / children per parent.',1520)
        ys=[160,160]
        for ti,t in enumerate(tables):
            col=ti%2
            lines=[t['purpose'],'','ATTRIBUTES  (NN required / ? nullable)']
            fkcols={c for f in FKS if f['table']==t['name'] for c in f['columns']}
            uqcols={u[0] for u in t['unique'] if len(u)==1}
            for c in t['columns']:
                flags=[]
                if c['name']=='id':flags.append('PK')
                if c['name'] in fkcols:flags.append('FK')
                if c['name'] in uqcols:flags.append('UQ')
                flags.append('?' if c['nullable'] else 'NN')
                lines.append(f"{c['name']}: {c['type']} [{' '.join(flags)}]")
                if c.get('default'):
                    lines.append('  default '+c['default'])
            lines+=['','CONSTRAINTS']
            for i,u in enumerate(t['unique'],1):lines.append(f"UQ{i}: ({', '.join(u)})")
            for i,c in enumerate(t['checks'],1):lines.append(f'CK{i}: '+c)
            for ix in MODEL['indexes']:
                if ix['table']==t['name'] and ix.get('unique'):
                    lines.append(f"PARTIAL UQ: ({ix['columns']}) WHERE {ix['where']}")
            if t['name'] in MODEL['appendOnly']:lines.append('TRIGGER: reject UPDATE / DELETE (append-only).')
            ff=[f for f in FKS if f['table']==t['name']]
            if ff:lines+=['','FOREIGN KEYS / UML ASSOCIATIONS']
            for f in ff:
                parent,child=fk_multiplicity(f)
                lines.append(f"({', '.join(f['columns'])}) -> {f['target']}({', '.join(f['targetColumns'])}) [{parent} parent / {child} children]")
            lines.append('All FK deletes/updates: RESTRICT. See TX rules for cross-row guards.')
            _,h=a.box('<<table>> '+t['name'],'\n'.join(lines),50+col*740,ys[col],680,PALETTE[gi%len(PALETTE)],mono=True,cid=t['name'])
            ys[col]+=h+36
        a.finish(max(ys))
    # Focused UML association spine; full FK catalogue remains on entity pages.
    a.page('17 Core relationships','Core relational spine','Association labels show parent-to-child multiplicity. Extra actor/context FKs are fully listed on the domain pages.',1520,1690)
    nodes=[('organization',70,175),('event',565,175),('event_seat',1060,175),('checkout_hold',70,480),('inventory_allocation',565,480),('ticket_type',1060,480),('ticket_order',70,785),('order_item',565,785),('ticket',1060,785),('payment_intent',70,1090),('payment_attempt',565,1090),('check_in',1060,1090),('sales_activation',70,1395),('refund',565,1395),('entry_confirmation',1060,1395)]
    brief={'organization':'One owner; multiple staff','event':'Publication, gates, capacity','event_seat':'One physical seat in one event','checkout_hold':'Authenticated expiring basket','inventory_allocation':'One seat or GA unit; retained','ticket_type':'Price and quantity limit','ticket_order':'Buyer and immutable totals','order_item':'One admission unit per row','ticket':'One canonical QR identity','payment_intent':'Order XOR activation obligation','payment_attempt':'Real attempts, including extras','check_in':'One current admission per ticket','sales_activation':'Checklist + activation charge','refund':'One full obligation per charge','entry_confirmation':'Signed-in attendee proof'}
    for n,x,y in nodes:a.box(n,brief[n],x,y,390,'#22577A',minh=120,cid=n)
    for src,tgt,label in [('organization','event','1 -> 0..*'),('event','event_seat','1 -> 0..*'),('checkout_hold','inventory_allocation','1 -> 0..*'),('ticket_type','inventory_allocation','1 -> 0..*'),('checkout_hold','ticket_order','1 -> 0..1'),('ticket_order','order_item','1 -> 0..*'),('inventory_allocation','order_item','1 -> 0..1'),('order_item','ticket','1 -> 0..1'),('ticket_order','payment_intent','1 -> 0..1'),('payment_intent','payment_attempt','1 -> 0..*'),('payment_attempt','refund','1 -> 0..1'),('sales_activation','payment_intent','1 -> 0..1'),('ticket','check_in','1 -> history 0..*')]:a.edge(src,tgt,label)
    a.edge('ticket','entry_confirmation','1 -> 0..*',[(1490,845),(1490,1455)],extra_style='exitX=1;exitY=0.5;entryX=1;entryY=0.5;')
    a.edge('event','checkout_hold','1 -> 0..*',[(760,370),(265,370)])
    a.edge('event_seat','inventory_allocation','0..1 seat -> historical 0..*',[(1255,410),(760,410)])
    a.finish()
    # All actual FK edges, partitioned by referencing domain. Parent stubs are references,
    # not duplicate tables. Every edge originates at its own named FK row.
    for gi,(group,tables) in enumerate(groups.items()):
        own={t['name'] for t in tables}
        domain_fks=[f for f in FKS if f['table'] in own]
        if not domain_fks:continue
        a.page('Relations '+group.split()[0],group+' / complete FK graph','Every connector is an actual FK. Left = referencing row/table; right = referenced table. Parent stubs are the same entities on other pages. Edge direction is child to parent.',1860)
        parent_names=list(dict.fromkeys(f['target'] for f in domain_fks))
        sy=175;source_ports={};target_ports={};target_box={}
        for t in tables:
            ff=[f for f in domain_fks if f['table']==t['name']]
            if not ff:continue
            body=[]
            for f in ff:
                parent,child=fk_multiplicity(f)
                body.append(f"FK{FKS.index(f)+1:03d}: {', '.join(f['columns'])}")
                body.append(f"  -> {f['target']} | parent {parent}; children {child}")
                body.append('')
            cid,h=a.box('<<table>> '+t['name'],'\n'.join(body),50,sy,760,PALETTE[gi%len(PALETTE)],mono=True,cid='src-'+t['name'])
            # Separate connection point for every FK; enough room in its wrapped text compartment.
            for j,f in enumerate(ff):source_ports[f['name']]=(cid,sy,h,(j+0.6)/len(ff))
            sy+=h+45
        total=max(sy-175,len(parent_names)*135)
        for j,name in enumerate(parent_names):
            y=175+j*(total/len(parent_names))
            cid,h=a.box('<<reference>> '+name,'Attributes: '+TABLES[name]['group']+'\nPK / referenced unique key; RESTRICT deletes.',1260,y,550,'#526477',minh=105,cid='ref-'+name)
            target_box[name]=(cid,y,h)
        per_target=defaultdict(list)
        for f in domain_fks:per_target[f['target']].append(f)
        for f in domain_fks:
            src,sy0,sh,frac=source_ports[f['name']]
            tgt,ty,th=target_box[f['target']]
            tf=per_target[f['target']];pos=(tf.index(f)+1)/(len(tf)+1)
            exit_y=max(0.25,min(0.94,frac))
            lane=870+(domain_fks.index(f)%20)*16
            a.edge(src,tgt,'',[(lane,sy0+sh*exit_y),(lane,ty+th*pos)],extra_style=f'exitX=1;exitY={exit_y};entryX=0;entryY={pos};strokeColor={PALETTE[parent_names.index(f["target"])%len(PALETTE)]};')
        a.finish(max(sy,175+total))
    for start in range(0,len(MODEL['rules']),6):
        rr=MODEL['rules'][start:start+6]
        a.page(f'Rules {start+1:02d}-{start+len(rr):02d}','Integrity rules / '+str(start+1)+'-'+str(start+len(rr)),'Enforcement is deliberately explicit: foreign keys alone cannot enforce financial state transitions or authorization.',1520)
        ys=[160,160]
        for i,r in enumerate(rr):
            _,h=a.box(r[0]+' / '+r[1],r[2]+'\n\nENFORCEMENT: '+r[3]+'\nREFERENCE: '+r[4],50+(i%2)*740,ys[i%2],680,'#276749')
            ys[i%2]+=h+30
        a.finish(max(ys))
    # Readable UML-style activities: all actions have explicit database effects.
    flows=[
      ('Checkout activity','Checkout / hold to canonical ticket',[
       ('Authenticate and quote','Verified buyer; authorized event; server calculates immutable KZT amounts.','APP'),
       ('TX: reserve inventory + promotion','Lock event. INSERT hold + allocations; reserve campaign allowance. COMMIT.','DB'),
       ('TX: order + payment intent','INSERT one order_item per admission; persist snapshots. Positive total -> payment attempt/outbox; zero total -> fulfill. COMMIT.','DB'),
       ('External provider / simulator','Initialize/complete payment outside DB transaction. Authoritative callback or status query; never trust browser redirect.','EXT'),
       ('TX: fulfill OR compensate','Lock event; recheck expiry, gates, amount and promo. Success: consume hold/promo, allocations sold, order confirmed, tickets inserted. Late/extra charge: refund obligation, NO extra ticket.','DB'),
       ('Post-commit delivery','Persisted jobs generate PDFs, email and analytics. Repeated messages do not duplicate orders/tickets.','EXT')]),
      ('Refund activity','Refund / invalidation before money return',[
       ('Approve full actual paid amount','Check authorized actor, saved policy and check-in status. One refund per charged attempt.','APP'),
       ('TX-A: invalidate + quarantine','Lock event/order/tickets. Tickets -> refund_pending; allocations -> refund_quarantine; INSERT refund + audit + outbox. COMMIT.','DB'),
       ('External request after COMMIT','Send refund with stable logical request key. Provider accepted/pending is NOT refund success.','EXT'),
       ('Pending / failed / unknown','Keep ticket INVALID and inventory BLOCKED. Persist attempt. Retry/reconcile the same obligation; never release early.','APP'),
       ('TX-B: confirmed success','Lock event. Refund -> succeeded; old tickets -> refunded; allocations -> released once; financial effects + audit + notification. COMMIT.','DB'),
       ('New buyer, new identities','If event/sales still open: NEW hold/allocation/order_item/ticket can reference the same event_seat. Old rows remain.','APP')]),
      ('Admission activity','Admission / serialize check-in and refund',[
       ('Signed-in attendee proof','Verified recipient creates expiring entry_confirmation bound to their session and ticket. A printed QR alone is insufficient.','APP'),
       ('Scanner authentication','Validate scanner session, device ownership and current scan capability for the event.','APP'),
       ('TX: lock event + ticket','Revalidate current gate, attendee session, token purpose/expiry, ticket state and absence of current admission. Refund shares the same event mutex.','DB'),
       ('TX: accept exactly once','INSERT check_in; consume confirmation; ticket -> checked_in; audit + broadcast. Partial unique ticket admission rejects a race. COMMIT.','DB'),
       ('Authorized reversal only','INSERT reversal and set reversed_at together. Preserve admission history; invalid refunded/cancelled ticket never becomes valid.','DB'),
       ('Later re-entry','Needs fresh attendee confirmation and NEW check_in. Original confirmation remains consumed.','APP')]),
      ('Offline activity','Offline / provisional observations to central truth',[
       ('Online preparation','Authenticate scanner and download signed expiring manifest for one event/device/session.','APP'),
       ('Disconnected observation','Validate locally against snapshot; queue operation ID, sequence and device time. Display PROVISIONAL; final physical admission waits for online confirmation.','APP'),
       ('Upload persisted intent','INSERT offline_operation idempotently. Untrusted claimed ticket IDs may be invalid: retain them without pretending they are FKs.','DB'),
       ('TX: current-state validation','Recheck current user/session, permission, event, ticket and proof. Accept through online check-in transaction or record rejection/conflict.','DB'),
       ('Reconcile every result','Update operation accepted/duplicate/rejected/conflict; link resolved ticket/check_in FKs. Conflicts never create a second admission.','DB'),
       ('Refresh and review','Return cursor/results and new manifest; authorized organizer reviews sync_conflict while retained histories stay unchanged.','APP')]),
      ('Outbox activity','Side effects / atomic intent, retryable external work',[
       ('Business transaction','INSERT/UPDATE domain records + audit_log + unique outbox_job in SAME commit. A rollback leaves none of these effects.','DB'),
       ('Lease job','FOR UPDATE SKIP LOCKED; pending -> leased with random lease_token and deadline. COMMIT quickly.','DB'),
       ('Run outside transaction','Email, PDF, storage, provider request, GA4 or broadcast. Use stable logical IDs/idempotency at the destination.','EXT'),
       ('Acknowledge with fence','Only matching lease_token may mark done or schedule retry. Expired lease is reclaimable after crash.','DB'),
       ('Reconcile uncertainty','Provider timeout is unknown, not failed. Query authoritative state before sending an unrelated replacement operation.','EXT'),
       ('Retain failure evidence','Dead jobs and failed deliveries remain visible. Retrying delivery never creates a second ticket, refund or payout.','APP')])]
    for name,title,steps in flows:
        a.page(name,title,'UML-style activity sequence. DB boxes are atomic commits; orange external actions occur after commit. Failure/alternate paths are stated inside each action.',1400)
        previous=None;y=160
        for i,(st,body,kind) in enumerate(steps):
            c,h=a.box(f'{i+1:02d} / {st}',body,280,y,840,{'DB':'#22577A','EXT':'#9C4221','APP':'#276749'}[kind],minh=125)
            if previous:a.edge(previous,c,'')
            previous=c;y+=h+55
        a.finish(y)
    # All operation contracts are included in the editable file, not only in the companion markdown.
    for start in range(0,len(MODEL['transactions']),4):
        tt=MODEL['transactions'][start:start+4]
        a.page(f'Operations {start+1:02d}-{start+len(tt):02d}','Transaction catalogue / '+str(start+1)+'-'+str(start+len(tt)),'DML write sets, relationships, guards and retry behavior. Each TX is an implementation contract, not a stored procedure already installed.',1520)
        ys=[160,160]
        for i,t in enumerate(tt):
            body='GUARDS\n'+t['gate']+'\n\nLOCK / CONSISTENCY\n'+t['locks']+'\n\nDATABASE WRITES\n'+t['writes']+'\n\nRELATIONSHIP EFFECT\n'+t['relations']+'\n\nFAILURE / RETRY\n'+t['failure']
            _,h=a.box(t['id']+' / '+t['title'],body,50+(i%2)*740,ys[i%2],680,'#245C80')
            ys[i%2]+=h+30
        a.finish(max(ys))
    for start in range(0,len(MODEL['stateMachines']),4):
        states=MODEL['stateMachines'][start:start+4]
        a.page(f'States {start+1:02d}-{start+len(states):02d}','State transitions / '+str(start+1)+'-'+str(start+len(states)),'Arrows mean guarded state change, not row deletion or FK reassignment. All other transitions are rejected by the transaction layer.',1520)
        ys=[160,160]
        for i,st in enumerate(states):
            _,h=a.box(st['entity'],st['states']+'\n\nGUARD: '+st['guard']+'\n\nTRANSACTION: '+st['tx'],50+(i%2)*740,ys[i%2],680,'#7056A5')
            ys[i%2]+=h+35
        a.finish(max(ys))
    ET.indent(a.xml)
    data=ET.tostring(a.xml,encoding='unicode',xml_declaration=False)
    (OUT/'BiletFlow_Database.drawio').write_text(data,encoding='utf-8')
    (OUT/'atlas_manifest.json').write_text(json.dumps(a.pages,indent=2),encoding='utf-8')
    return a

def build_spec(a):
    m=['# BiletFlow database specification', '',
       'Design baseline | PostgreSQL | 22 September 2026', '',
       'Read with [the editable draw.io atlas](BiletFlow_Database.drawio), [reference DDL](BiletFlow_PostgreSQL_Schema.sql), and [backend requirements](../BiletFlow_Backend_Requirements.md).', '',
       f"The atlas has **{len(a.pages)} pages**, **{len(TABLES)} tables**, **{len(FKS)} foreign keys**, **{len(MODEL['rules'])} global integrity rules**, and **{len(MODEL['transactions'])} transaction contracts**. It includes all columns, row checks, keys, relationships and operation effects. This is schema design, not a deployed application.", '',
       '## 1. Interpretation and design choices', '',
       'Confirmed user requirements retain priority. The following choices make the physical design precise; they do not turn proposed product defaults into confirmed decisions.', '']
    for d in MODEL['decisions']:m += [f'### {d[0]} — {d[1]}', '',d[2], '', '**Status:** '+d[3], '']
    m += ['## 2. Navigation and UML notation', '',
          'The draw.io file uses editable UML-style table/class compartments. Exact SQL names are stable across diagram, DDL and this specification. PK/FK/UQ and NN/? annotate keys and nullability. Outbound foreign keys list full local-to-target mappings and multiplicities; references across pages are named explicitly to keep the atlas readable. The core-relation page is an overview, not a replacement for the complete FK catalogue.', '',
          'Association multiplicity is database cardinality: a mandatory FK gives exactly one parent per child; a nullable FK gives zero or one. Parent-side cardinality is zero-to-many unless a unique FK/subset gives zero-or-one. Requirements such as at least one order item or paid type before activation are transaction guards, not implied by a bare FK.', '',
          'No cascade/composition semantics: all foreign keys use `ON DELETE RESTRICT ON UPDATE RESTRICT`. UUID primary keys are immutable. Releasing a seat is a state update to its allocation, never deletion/reassignment of the old purchase.', '', '| Page | Name |','|---|---|']
    for i,p in enumerate(a.pages,1):m.append(f"| {i} | {p['name']} |")
    m += ['', '## 3. Enforcement boundary', '',
          '**Enforced by DDL:** types, NOT NULL, primary/unique keys, named row CHECKs, scoped foreign keys, conditional unique indexes and append-only triggers. Foreign keys are added after tables because payment intent/activation/attempt/order references form a creation-time cycle. Insert targets in pending/incomplete state with optional success reference NULL; set the reference only after the attempt exists.', '',
          '**Required in transactional service code:** authentication/authorization, legal state transitions, full-order amount and aggregate capacity/promo limits, verifying indirect ownership/intent relationships, immutable purchase snapshots, event gates, provider authenticity, and atomic audit/outbox changes. The reference SQL intentionally does not claim these are enforced by CHECK constraints: PostgreSQL CHECKs cannot safely express changing cross-row business state.', '',
          '**Application role contract:** create schema with a migration owner. Runtime API/worker roles must not own schema/tables or have ALTER/TRIGGER/TRUNCATE privileges. Grant only needed SELECT/INSERT/UPDATE operations; revoke DELETE on domain/history tables. Clients never connect directly to PostgreSQL. This baseline does not install row-level-security policies: scoped access lives in audited service queries, and must be tested. If direct SQL writers are introduced, move TX invariants into controlled stored functions/triggers and restrict direct DML.', '',
          '**SQL NULL semantics:** every optional scalar/composite relation has explicit documented nullability. MATCH SIMPLE skips a composite FK if any component is NULL; additional context CHECKs prevent missing required context. Cross-row rules still belong to the TX layer. An expired hold/claim remains active for index purposes until explicitly closed; no partial index depends on wall-clock time.', '',
          '## 4. Transaction isolation and lock protocol', '',
          'Use READ COMMITTED with explicit locks for all specified writes. The simple academic design serializes event business mutations on `SELECT ... FROM event WHERE id = :event_id FOR UPDATE`. Every writer affecting capacity, price/gates, promotion, order fulfillment, refund, admission, activation, finance or payout follows it, including background jobs and administrative changes. Event-scoped writes that bypass this protocol are invalid implementations.', '',
          'Lock hierarchy: request-idempotency guard first; relevant users and sessions; organization and memberships; event; ticket types; campaigns; hold; order; allocations; payment intent/attempt; refund; tickets; entry confirmations; check-ins; case/job-specific records. Acquire each class of IDs in sorted order. When a TX description lists several locks, this hierarchy governs acquisition order, not the prose order. A worker needing only an event lock must not later acquire an earlier authorization lock; resolve required authorization context first.', '',
          'For request idempotency, take a transaction-scoped advisory lock derived from (actor_user_id, operation, request_key) before domain locks. Then check an existing idempotency_record and compare request_hash. If absent, execute the business action and insert the successful resource/response record in the same commit. The table stores completed outcomes; it is not a prematurely inserted pending placeholder. A hash collision merely serializes unrelated requests, not their business identities.', '',
          'All event writes lock the event before any campaign/hold/order lock. Capacity/promotion counts are read AFTER acquiring this mutex; expired rows are closed within the protocol. Never hold database locks across a provider, email, storage, PDF or analytics network call. Keep parent/child row updates and audit/outbox inserts in one short atomic transaction.', '',
          'Use bounded retries for deadlock/serialization failures; rerun the whole transaction with the same idempotency key and revalidated request. For callbacks, persist a deduplicated verified inbox then process domain writes and inbox processed marker atomically. Payout/refund unknown outcomes must be reconciled, not treated as authorization for a second external operation.', '',
          'The event mutex intentionally limits per-event write throughput. Test it against the documented academic workload; optimize only after measuring, preserving the same invariants.', '',
          '## 5. Global constraints and enforcement matrix', '',
          '| ID | Invariant | Enforcement | References |','|---|---|---|']
    for r in MODEL['rules']:m.append('| '+' | '.join([r[0]+' '+r[1],r[2],r[3],r[4]]).replace('| state','/ state')+' |')
    m += ['', '## 6. Operations and database effects', '',
          'Each contract covers its reads/guards, lock boundary, INSERT/UPDATE effects, relationship preservation and retry behavior. Deletions are deliberately absent from normal business flows.', '']
    for t in MODEL['transactions']:
        m += [f"### {t['id']} — {t['title']}",'', '**Preconditions:** '+t['gate'],'','**Locks:** '+t['locks'],'','**Atomic writes / external boundary:** '+t['writes'],'','**Relationship effects:** '+t['relations'],'','**Failure / retry:** '+t['failure'],'']
    m += ['## 7. State transitions','', '| Entity | Allowed paths | Guards | Contracts |','|---|---|---|---|']
    for st in MODEL['stateMachines']:m.append('| '+st['entity']+' | '+st['states'].replace('|','/ ')+' | '+st['guard']+' | '+st['tx']+' |')
    m += ['', 'Event publication: draft -> published <-> unpublished; any allowed noncancelled state -> cancelled. Cancelled is terminal. Moderation normal/suspended is independent. Upcoming/active/completed are derived from times, not persisted lifecycle enum values.', '',
          'Campaign reservation: active -> consumed/released, no refund replenishment. Provider inbox: received -> processed/rejected. Notification delivery: pending -> sent/failed with bounded retries. Offline operation: received -> accepted/duplicate/rejected/conflict; conflicts are retained, not silently overwritten as accepted.', '',
          '## 8. Access and retention specifications','',
          '| Data | Readers | Writers / boundaries |','|---|---|---|',
          '| Public catalogue | Anonymous for published public events; unlisted by link; private grant/role | Authorized organizer editors; platform moderation |',
          '| Account/session/challenges | Account owner and narrow auth services | Auth service; digest-only secrets; no enumeration or public session listing |',
          '| Organization / staff | Owner and authorized workspace staff | Owner/manage_staff; no self-escalation; owner cannot be removed via ordinary revoke |',
          '| Order/payment/refund | Buyer; authorized event finance staff; platform support where permitted | Transaction services; scanner never receives financial data |',
          '| Ticket/entry proof | Assigned recipient, buyer delivery view, assigned scanner minimal view | Fulfillment/claim/admission services; no ticket reassignment marketplace |',
          '| Support/message/file | Requester and current authorized support staff; platform on escalation/platform case | Context-checked support services; assignment alone grants nothing |',
          '| Finance/payout profile | Owner/finance capability and authorized platform staff | Protected services; no real payout operation |',
          '| Audit/history | Authorized event staff or platform admin with purpose | Append-only service inserts; no normal update/delete |',
          '| Offline snapshot/queue | Assigned device/session only; conflict reviewers | Scanner upload and central reconciliation; no raw snapshot access for attendees |',
          '| Analytics | Authorized organization/event reports | Read-only aggregates; optional allowlisted export/cache worker |', '',
          'Keep academic operational and audit history through the project lifecycle. Disable/cancel/revoke instead of hard delete. Retention periods for expired auth/session material and abandoned uploads must be configured separately; do not set an invented permanent legal retention promise. Encrypt protected storage/backups and payout metadata. A schema alone cannot provide infrastructure encryption or provider compliance.', '',
          '## 9. Complete physical data dictionary','',
          'Every table has immutable UUID `id` and server `created_at`. Defaults in the SQL are exact; `updated_at` where present is set by the application in the same transaction. Required fields with no default must be supplied. Generated files share the same model, so diagram/DDL/dictionary names agree.', '']
    for t in TABLES.values():
        m += [f"### `{t['name']}` — {t['group']}",'',t['purpose'],'', '| Column | PostgreSQL type | Nullable | Default | Meaning |','|---|---|---|---|---|']
        for c in t['columns']:
            m.append(f"| `{c['name']}` | `{c['type']}` | {'Yes' if c['nullable'] else 'No'} | `{c.get('default') or '—'}` | {c['note']} |")
        m += ['', '**Primary key:** `id`.']
        for i,u in enumerate(t['unique'],1):m.append(f"- `{t['name']}_uq{i}`: UNIQUE ({', '.join(u)}).")
        for i,c in enumerate(t['checks'],1):m.append(f"- `{t['name']}_ck{i}`: `{c}`.")
        for f in FKS:
            if f['table']==t['name']:
                parent,child=fk_multiplicity(f)
                m.append(f"- `{f['name']}`: ({', '.join(f['columns'])}) -> `{f['target']}` ({', '.join(f['targetColumns'])}); child has **{parent}** parent; parent has **{child}** children; DELETE/UPDATE RESTRICT.")
        for ix in MODEL['indexes']:
            if ix['table']==t['name']:m.append('- Index: `'+index_sql(ix)+'`.')
        if t['name'] in MODEL['appendOnly']:m.append('- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.')
        m+=['']
    m += ['## 10. Query and integration contracts','',
          '- Current seat availability derives from event_seat.is_blocked plus the one live allocation. Accessible is venue_seat.is_accessible, not a sale state. Expired-but-active holds remain occupied until cleanup acquires the mutex.',
          '- General-admission available count = allowed capacity minus all held/sold/refund_quarantine allocations, bounded by ticket-type and event limits. Sold percentage uses sold/quarantine allocations, not released historical tickets. Separate held and refund-pending counts.',
          '- Fulfilled sales use ticket_order.confirmed_at and immutable item snapshots. Aggregate order totals before joining payment_attempt or check_in history to avoid multiplying amounts. Cumulative gross sales and current occupied inventory are different metrics.',
          '- Successful charged amounts and successful refunds come from attempt/refund records. finance_entry is an append-only organizer balance model: recognize ticket charges (including charges awaiting compensation) as sale credit plus fee debit; block unresolved/compensating amounts from payout; refund adds debit and fee reversal adds credit. Activation charge is debit; a compensating duplicate activation refund is activation_refund credit. An ordinary activation fee remains nonrefundable under the proposed demo policy.',
          '- Fees reversed by demo simulator use separate fee_reversal entries. Do not count activation_refund as ticket refund revenue. Provider sandbox settlement semantics must be matched by the adapter; demo payout only operates on simulation balance.',
          '- Pending/eligible payouts reserve amount; sent payout has one negative ledger entry, so do not subtract sent amount twice. Pending refund liabilities also reduce payable amount. Later successful refund can make balance negative after a prior payout, as an explicit adjustment.',
          '- Case/event history and inbox cursors use stable (created_at,id) ordering. Server receipt time is distinct from offline captured_at; timestamps from devices never establish globally earliest entry.',
          '- ICS is generated from event data, calendar_uid and calendar_sequence; cancellation uses same UID and increased sequence. No calendar token or account table is required.',
          '- GA4 connection must match event organization; exports honor consent and remove PII, ticket IDs and sensitive URL parameters. Keep transaction/analytics IDs distinct. Cache failure is unavailable, not zero operational sales.',
          '- UUID equality/foreign keys are not authorization. Every row, downloaded file and live subscription must be scoped to the current account and relationship.', '',
          '## 11. Validation and implementation checklist','',
          'The accompanying validation report records what was actually executed. Do not confuse a successful DDL load with complete application correctness. Before implementation acceptance, test:', '',
          '1. Concurrent last-seat/general-admission reservation and promo-limit exhaustion using independent PostgreSQL connections.',
          '2. Duplicate/out-of-order callbacks, payment amount mismatch, late/extra success and compensation without extra ticket issuance.',
          '3. Refund/check-in race, refund failure/retry, release after success, and rebuy with different IDs while old rows remain.',
          '4. Same-event/same-org FK rejection, revoked staff/session denial, private-file and support-context isolation.',
          '5. Concurrent scanner admission, reversal consistency, stale offline upload and same operation key with changed payload.',
          '6. Payout reservation versus refund race, post-payout adjustment, exact fee/discount/revenue reconciliation.',
          '7. Worker crash before/after external side effect, lease fencing, durable outbox retry and restore with preserved keys.',
          '8. Full integration with the requirements acceptance scenarios AC-01 through AC-28.', '',
          '## 12. Sources and regeneration','',
          '- Local authority: `../BiletFlow_Backend_Requirements.md` and the user-confirmed decisions recorded there.',
          '- [PostgreSQL constraint semantics](https://www.postgresql.org/docs/current/ddl-constraints.html): row checks, foreign keys and conditional uniqueness.',
          '- [draw.io XML generation reference](https://www.drawio.com/docs/reference/diagram-generation/): editable mxfile structure and validation.',
          '- [draw.io style reference](https://www.drawio.com/docs/reference/diagram-generation/style-reference/): class compartments, native shapes and connectors.',
          '- [PGlite documentation](https://pglite.dev/docs/): disposable PostgreSQL/WASM validation runtime when native PostgreSQL is unavailable.', '',
          'Regenerate using `python tools/build_database_schema.py` from the project root. `schema_model.json` is the shared design source. It is not an application ORM model. Hand edits in draw.io remain editable, but regenerating will replace them; reflect lasting changes in the shared model/builder first.', '']
    (OUT/'BiletFlow_Database_Specification.md').write_text('\n'.join(m),encoding='utf-8')

if __name__ == '__main__':
    build_sql()
    atlas=build_atlas()
    build_spec(atlas)
    # Structural XML and names/FKs checked again from the actual output.
    tree=ET.parse(OUT/'BiletFlow_Database.drawio')
    for diagram in tree.getroot():
        cells=diagram.findall('.//mxCell')
        ids=[c.get('id') for c in cells]
        assert len(ids)==len(set(ids))
        assert {'0','1'}<=set(ids)
        for c in cells:
            if c.get('edge')=='1':assert c.get('source') in ids and c.get('target') in ids
    print(json.dumps({'tables':len(TABLES),'foreign_keys':len(FKS),'pages':len(atlas.pages),'transactions':len(MODEL['transactions']),'checks':sum(len(t['checks']) for t in TABLES.values()),'xml_valid':True,'box_overlap_check':'passed'}))
