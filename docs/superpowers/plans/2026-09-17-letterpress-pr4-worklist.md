# Letterpress PR 4: Portal Worklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-sequence `/patients` into the Letterpress worklist: four counts, a Needs review · All patients · Flagged filter, and one ruled table merging the review queue, urgent reports and the patient list, backed by one additive read-only clinician endpoint, with a fallback to today's page when the API is older.

**Architecture:** A new `GET /api/worklist` (thin route, zod query, Prisma query client inside one RepeatableRead transaction, constant query count, no raw SQL, no schema change) returns summary counts, one page of rows and per-row 14-day adherence computed from `care_routine_completions`. Pure adherence rules live in their own module and are unit tested; the route is tested with a recording Prisma mock; a loopback live probe proves the real queries. The portal gets a `WorklistController` (same pattern as `PatientListController`), presentational components rendered in tests with `react-dom/server`, and a thin container that swaps to the unchanged legacy queue+list view when the endpoint answers 404.

**Tech Stack:** Express + zod + Prisma 5 query client, Node test runner (`node --import tsx --test`); Next.js 15 / React 19 / Tailwind 3.4 / Radix Tabs; Playwright MCP for the visual pass.

**Spec:** `docs/design/letterpress/spec.md` (§0, §4.3, §4.6, §4.9, §5, §6 portal #1, §7, §8), master plan `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, Owner decisions, Roadmap row PR 4), PR 2 plan `docs/superpowers/plans/2026-09-17-letterpress-pr2-primitives.md` (Interfaces: Produces). Mockup: `docs/design/letterpress/portal.dc.html` screen 1 "Worklist" (lines 44–113). Spec wins over mockup.

## Global Constraints

- Master plan Global Constraints apply: no Supabase schema/RLS/table/column/RPC change; no auth/session change; review-queue ordering (oldest unreviewed upload first, then patient id) and existing pagination semantics untouched; completion timezone handling untouched (patient-local `localDate` strings are compared as stored).
- No skin score, streak, grade, adherence target line, colour grading, celebration, emoji or outcome promise. Adherence is shown as a number and a strip, never judged.
- Ink is the action colour. Ochre (`attention.*`) only for **unread** (the unread-messages count) and the spec §4.9 waiting bar supplied by PR 2's `TableRow data-attention`. Everything else is said in words. Urgent reports are labelled in words, no colour.
- Portal controls 32–36px (`Button size="sm"` 32px, default 36px). Radii only via PR 2 utilities (`rounded-none`, `rounded`, `rounded-full`). No shadows except PR 2's segmented thumb. No hex colours, no hue classes, no shadcn alias classes (PR 2 sweep test enforces this across `web-portal/src`).
- Copy: sentence case, no exclamation marks, clinician dates mono (`02 SEP · 07:04`), numbers mono with tabular figures.
- Access: clinicians only (`requireDermatologist`); every query filters by the patient's **current** `dermatologistId`. Patients get 403. The endpoint never returns message bodies, check-in answers or report descriptions.
- Two clients, one contract: iOS does not call this endpoint (no Codable change). Portal types in `web-portal/src/types/api.ts`. Reviewers for API tasks: `api-contract-checker` and `care-access-reviewer` agents.
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`. Live scripts never print credentials or free text.
- Commands: backend `cd backend && npm test && npm run build`; portal `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Depends on PR 2 (interfaces used exactly as its plan declares)

`Button` variants `default` (filled ink) / `outline`, sizes `default` 36px / `sm` 32px; `TableRow` `data-attention="true"` (rail + 4px `attention.mark` bar on the first cell); `TableHead` mono eyebrow; `TabsList variant` default `segmented`; `TabsContent` export unchanged; `Label` mono persistent label; `Input` baseline rule; Tailwind colours `canvas surface rail sunk ink{,-secondary,-tertiary,-future} attention-{mark,text,wash} error rule{,-strong,-field}`; `.portal-page`, `.editorial-title`; `tests/letterpress-rules.ts` (`classesOf`, `read`). If PR 2's merged `patients/page.tsx` class names differ from the legacy code in Task 6, keep PR 2's class names (the move is verbatim).

## Decisions made while planning

1. **Adherence under 60% is included: it is sourceable from real events.** Evidence: `care_routine_completions` stores one row per routine revision per patient-local `localDate`, joined to `care_routine_revisions.timeOfDay`; `GET /care-support/patients/:id/calendar` already derives morning/evening per day from exactly these rows. The mockup's `79%` strip has 11 non-empty bars out of 14, and spec §4.6's patient label is "11 of last 14 days", so the clinician figure is `days with a recorded completion ÷ counted days`. Rules (module `worklistAdherence.ts`): window = the 14 dates ending on the clinician's local date (sent by the portal, same pattern as `GET /routines/patients/:id?localDate=`); a day counts if it has a completion, or if it is after the UTC date of the patient's first routine save and before today (today is not over; days before a routine existed never count against the patient); patients whose latest revision is inactive in every slot have `adherence: null` ("No active routine") and are excluded from the count.
2. **Needs review = the photo review queue**: patients with ≥ 1 unreviewed upload, ordered by oldest unreviewed upload then patient id (the same order as `reviewQueue`), 20 per page. **All patients** keeps `GET /users` order (`updatedAt desc, id desc`), not the alphabetical order the spec describes (§0: existing ordering untouched). **Flagged** = patients with an unresolved urgent report (open *or* seen), oldest unresolved report first. Seen reports stay flagged because `UrgentReportQueue` leaves the page; acknowledging must not make a report vanish from the worklist.
3. **One filled button per row** (§4.9 is the component rule and is explicit) — the mockup fills only the first row and adds a header "Open next"; "Open next" is omitted (it would be a second action with no spec row). Refresh and empty-state actions are outlined.
4. **Mockup ochre on the "Photos to review" count and the `43%` figure is not built** (ochre is for unread only); ochre is kept on the unread-messages count.
5. **"Latest note" column becomes "Latest activity" in words** ("2 unread messages", "Check-in · 15 SEP · 07:04", "Urgent report · 1 open"). The endpoint never returns message content. The mockup's age/diagnosis metadata has no data source; the second line is `SINCE 02 MAR` from `joinDate`.
6. **Waiting rows** (`data-attention`) = unreviewed photos or unread messages.
7. **Stale state** (§5 prescribes an `attention.text` eyebrow) uses words in `ink.tertiary` ("Last checked 08:40") shown with the error, to keep ochre for unread only.
8. **Filter travels in the list context**: `patientListQuery(page, search, filter?)` appends `filter` only when it isn't `needs-review`, so existing links are unchanged; `patientListContext` validates it against the enum.
9. **Fallback**: `WorklistController` marks `unsupported` only on `APIError` status 404 (an API without the route answers 404 from its catch-all handler before auth). The container then renders `LegacyPatientList`, which is today's page body moved verbatim.

## File map

| File | Task | Responsibility |
|---|---|---|
| `backend/src/services/worklistAdherence.ts` | 1 | Window dates, adherence rules, active-routine state (pure) |
| `backend/src/services/worklistValidation.ts` | 1 | zod query schema |
| `backend/tests/worklist-rules.test.ts` | 1 | Pure rule and schema tests |
| `backend/src/services/worklist.ts` | 2 | Prisma queries in one transaction; response assembly |
| `backend/src/routes/worklist.ts`, `backend/src/server.ts` | 2 | Thin route, mount at `/api/worklist` behind `authenticateToken` |
| `backend/tests/worklist.test.ts` | 2 | Route tests with recording Prisma mock |
| `backend/scripts/worklist-live.cjs` | 3 | Loopback live probe; `--keep-for-ui` fixture |
| `web-portal/src/types/api.ts` | 4 | Worklist contract types |
| `web-portal/src/lib/api.ts` | 4 | `getWorklist` |
| `web-portal/src/lib/patient-navigation.ts` | 4 | `filter` in list context |
| `web-portal/src/lib/worklist.ts` | 4 | Controller, copy and format helpers |
| `web-portal/tests/worklist.test.ts`, `worklist-api.test.ts`, `patient-navigation.test.ts` | 4 | Controller/helper/client tests |
| `web-portal/src/components/patients/worklist/{WorklistSummary,AdherenceSparkline,WorklistTable,WorklistView}.tsx` | 5 | Presentational worklist |
| `web-portal/tests/worklist-view.test.ts` | 5 | Rendered state tests |
| `web-portal/src/components/patients/worklist/Worklist.tsx` | 6 | Container: controller, URL sync, fallback |
| `web-portal/src/components/patients/LegacyPatientList.tsx` | 6 | Today's queue + list, moved verbatim |
| `web-portal/src/app/patients/page.tsx`, `web-portal/src/app/patients/[id]/page.tsx` | 6 | Page wiring; back link keeps filter |
| `web-portal/tests/worklist-page.test.ts` | 6 | Wiring source assertions |

## API contract (produced by Task 2, consumed by Tasks 3–6)

`GET /api/worklist?localDate=YYYY-MM-DD&filter=needs-review|all|flagged&page=1..10000&limit=1..50&search=<≤100 chars>` — `localDate` required; defaults `filter=needs-review`, `page=1`, `limit=20`; unknown keys → 400. Auth: `authenticateToken` + `requireDermatologist`. 200:

```ts
{
  filter: 'needs-review' | 'all' | 'flagged';
  localDate: string;
  summary: {
    assignedPatients: number;
    photosToReview: { count: number; oldestUploadAt: string | null };   // unreviewed photos, not patients
    unreadMessages: { count: number; patients: number };                 // patient→clinician, readAt null
    checkInsSubmitted: { count: number; since: string; days: 7 };        // responses received in the last 7 days
    adherenceUnderThreshold: { count: number; threshold: 60; windowDays: 14 };
  };
  data: Array<{
    patientId: string; name: string | null; joinedAt: string;
    photos: { unreviewedCount: number; oldestUploadAt: string | null };
    unreadMessages: number;
    latestCheckInAt: string | null;
    urgent: { open: number; acknowledged: number; oldestAt: string | null };
    adherence: null | { percent: number | null; completedDays: number; countedDays: number;
                        days: Array<{ localDate: string; routines: 0 | 1 | 2 | null }> };  // 14 entries, oldest first
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
```

Errors: 400 `VALIDATION_ERROR`, 401 (no/invalid session), 403 `INSUFFICIENT_PERMISSIONS` (patient), 500 `WORKLIST_OPERATION_FAILED`. An API without this route returns 404.

---

### Task 1: Adherence rules and query validation [judgment]

**Files:**
- Create: `backend/src/services/worklistAdherence.ts`
- Create: `backend/src/services/worklistValidation.ts`
- Test: `backend/tests/worklist-rules.test.ts`

**Interfaces:**
- Consumes: `dayInput` from `backend/src/services/careSupportValidation.ts`.
- Produces: `WINDOW_DAYS = 14`, `ADHERENCE_UNDER = 60`, `type DayState = 0|1|2|null`, `type Adherence = {percent:number|null;completedDays:number;countedDays:number;days:{localDate:string;routines:DayState}[]}`, `windowDates(localDate:string):string[]`, `adherence(localDate:string, firstRoutineAt:Date, slots:ReadonlyMap<string,number>):Adherence`, `underThreshold(a:Adherence|null):boolean`, `type RevisionRow={userId:string;timeOfDay:string;version:number;isActive:boolean;createdAt:Date}`, `routineState(revisions:RevisionRow[]):{first:Map<string,Date>;active:Set<string>}`; `WORKLIST_FILTERS`, `type WorklistFilter`, `worklistQuery` (zod), `type WorklistQuery = z.infer<typeof worklistQuery>`.

- [ ] **Step 1: Write the failing test** — `backend/tests/worklist-rules.test.ts`

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADHERENCE_UNDER,WINDOW_DAYS,adherence,routineState,underThreshold,windowDates} from '../src/services/worklistAdherence';
import {worklistQuery} from '../src/services/worklistValidation';
const TODAY='2026-09-16';
const past=(days:number)=>new Date(Date.parse(`${TODAY}T00:00:00.000Z`)-days*86_400_000).toISOString().slice(0,10);
const LONG_AGO=new Date('2026-08-01T09:00:00.000Z');

test('the window is the 14 patient-local dates ending on the requested date',()=>{
 const dates=windowDates('2026-03-01');
 assert.equal(dates.length,WINDOW_DAYS);
 assert.deepEqual([dates[0],dates[12],dates[13]],['2026-02-16','2026-02-28','2026-03-01']);
});

test('the mock-up strip is 11 of 14 recorded days, which is 79%',()=>{
 const pattern=[1,2,0,2,2,1,0,2,2,1,2,0,2,2];
 const result=adherence(TODAY,LONG_AGO,new Map(pattern.map((n,i)=>[past(13-i),n])));
 assert.deepEqual([result.percent,result.completedDays,result.countedDays],[79,11,14]);
 assert.deepEqual(result.days.map(d=>d.routines),pattern);
 assert.deepEqual([result.days[0].localDate,result.days[13].localDate],[past(13),TODAY]);
});

test('today counts only once something is recorded, because the day is not over',()=>{
 const result=adherence(TODAY,LONG_AGO,new Map([[past(1),1]]));
 assert.equal(result.days[13].routines,null);
 assert.deepEqual([result.percent,result.completedDays,result.countedDays],[8,1,13]);
});

test('days before the first routine never count against the patient, but a completion always counts',()=>{
 const result=adherence(TODAY,new Date('2026-09-12T23:30:00.000Z'),new Map([['2026-09-12',1],['2026-09-14',2]]));
 assert.deepEqual(result.days.map(d=>d.routines),[null,null,null,null,null,null,null,null,null,1,0,2,0,null]);
 assert.deepEqual([result.percent,result.completedDays,result.countedDays],[50,2,4]);
});

test('a routine saved today with nothing recorded has no percentage; counts above two clamp',()=>{
 assert.equal(adherence(TODAY,new Date(`${TODAY}T07:00:00.000Z`),new Map()).percent,null);
 assert.equal(adherence(TODAY,LONG_AGO,new Map([[past(1),3]])).days[12].routines,2);
});

test('under the threshold means a real percentage below 60',()=>{
 const withPercent=(percent:number|null)=>({percent,completedDays:0,countedDays:0,days:[]});
 assert.equal(ADHERENCE_UNDER,60);
 assert.equal(underThreshold(withPercent(59)),true);
 assert.equal(underThreshold(withPercent(60)),false);
 assert.equal(underThreshold(withPercent(null)),false);
 assert.equal(underThreshold(null),false);
});

test('the latest revision per slot decides whether a routine is active; the first save starts the window',()=>{
 const r=(userId:string,timeOfDay:string,version:number,isActive:boolean,createdAt:string)=>({userId,timeOfDay,version,isActive,createdAt:new Date(createdAt)});
 const state=routineState([
  r('a','morning',2,false,'2026-09-02T00:00:00Z'),r('a','morning',1,true,'2026-08-01T00:00:00Z'),
  r('b','morning',1,false,'2026-08-05T00:00:00Z'),r('b','evening',1,true,'2026-08-03T00:00:00Z'),
 ]);
 assert.deepEqual([...state.active],['b']);
 assert.deepEqual([state.first.get('a')?.toISOString(),state.first.get('b')?.toISOString()],['2026-08-01T00:00:00.000Z','2026-08-03T00:00:00.000Z']);
});

test('worklist query: defaults, trimmed name search and a required local date',()=>{
 const d=worklistQuery.parse({localDate:TODAY});
 assert.deepEqual([d.filter,d.page,d.limit,d.search,d.localDate],['needs-review',1,20,undefined,TODAY]);
 const f=worklistQuery.parse({localDate:TODAY,filter:'flagged',page:'3',limit:'50',search:'  Ada  '});
 assert.deepEqual([f.filter,f.page,f.limit,f.search],['flagged',3,50,'Ada']);
 assert.equal(worklistQuery.parse({localDate:TODAY,search:'   '}).search,undefined);
 for(const query of [{},{localDate:'2026-02-30'},{localDate:TODAY,filter:'urgent'},{localDate:TODAY,page:'0'},{localDate:TODAY,page:'1.5'},{localDate:TODAY,page:'10001'},{localDate:TODAY,limit:'51'},{localDate:TODAY,page:['1']},{localDate:TODAY,search:'x'.repeat(101)},{localDate:TODAY,sort:'name'}])
  assert.equal(worklistQuery.safeParse(query).success,false,JSON.stringify(query));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node --import tsx --test tests/worklist-rules.test.ts`
Expected: FAIL — `Cannot find module '../src/services/worklistAdherence'`.

- [ ] **Step 3: Write `backend/src/services/worklistAdherence.ts`**

```ts
// Worklist adherence (spec §4.6, clinician side). Pure: computed only from recorded completion events.
export const WINDOW_DAYS=14;
export const ADHERENCE_UNDER=60;
const DAY=86_400_000;
export type DayState=0|1|2|null;
export type Adherence={percent:number|null;completedDays:number;countedDays:number;days:{localDate:string;routines:DayState}[]};
export type RevisionRow={userId:string;timeOfDay:string;version:number;isActive:boolean;createdAt:Date};

/** The 14 patient-local dates ending on `localDate`, oldest first. */
export function windowDates(localDate:string):string[]{
 const end=Date.parse(`${localDate}T00:00:00.000Z`);
 return Array.from({length:WINDOW_DAYS},(_,i)=>new Date(end-(WINDOW_DAYS-1-i)*DAY).toISOString().slice(0,10));
}

/**
 * `slots` maps localDate → routines completed that day (only > 0 matters for the percentage; the strip clamps to 2).
 * A day counts when a completion was recorded on it, or when it is after the UTC date of the first routine save and
 * before `localDate` (today is not over). Uncounted days are null and never count against the patient.
 */
export function adherence(localDate:string,firstRoutineAt:Date,slots:ReadonlyMap<string,number>):Adherence{
 const saved=Date.UTC(firstRoutineAt.getUTCFullYear(),firstRoutineAt.getUTCMonth(),firstRoutineAt.getUTCDate());
 const countsFrom=new Date(saved+DAY).toISOString().slice(0,10);
 const days=windowDates(localDate).map(date=>{
  const done=Math.min(Math.max(slots.get(date)??0,0),2) as 0|1|2;
  const counted=done>0||(date>=countsFrom&&date<localDate);
  return {localDate:date,routines:counted?done:null};
 });
 const countedDays=days.filter(d=>d.routines!==null).length;
 const completedDays=days.filter(d=>(d.routines??0)>0).length;
 return {percent:countedDays?Math.round(100*completedDays/countedDays):null,completedDays,countedDays,days};
}

export const underThreshold=(value:Adherence|null)=>value!==null&&value.percent!==null&&value.percent<ADHERENCE_UNDER;

/** First routine save per patient, and patients whose latest revision in some slot is active. */
export function routineState(revisions:RevisionRow[]){
 const first=new Map<string,Date>(),latest=new Map<string,RevisionRow>();
 for(const row of revisions){
  const earliest=first.get(row.userId);
  if(!earliest||row.createdAt<earliest)first.set(row.userId,row.createdAt);
  const key=`${row.userId}:${row.timeOfDay}`,current=latest.get(key);
  if(!current||row.version>current.version)latest.set(key,row);
 }
 const active=new Set([...latest.values()].filter(row=>row.isActive).map(row=>row.userId));
 return {first,active};
}
```

- [ ] **Step 4: Write `backend/src/services/worklistValidation.ts`**

```ts
import {z} from 'zod';
import {dayInput} from './careSupportValidation';
// Validation is independent of database/session initialization.
export const WORKLIST_FILTERS=['needs-review','all','flagged'] as const;
export type WorklistFilter=typeof WORKLIST_FILTERS[number];
const decimal=(min:number,max:number,fallback:number)=>z.string().regex(/^\d+$/).default(String(fallback)).transform(Number).pipe(z.number().safe().int().min(min).max(max));
export const worklistQuery=z.object({
 filter:z.enum(WORKLIST_FILTERS).default('needs-review'),
 page:decimal(1,10_000,1),
 limit:decimal(1,50,20),
 // Same bound and trimming as GET /users search.
 search:z.string().trim().max(100).optional().transform(value=>value||undefined),
 // The clinician's local date anchors the 14-day window, like GET /routines/patients/:id?localDate=.
 localDate:dayInput,
}).strict();
export type WorklistQuery=z.infer<typeof worklistQuery>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && node --import tsx --test tests/worklist-rules.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/worklistAdherence.ts backend/src/services/worklistValidation.ts backend/tests/worklist-rules.test.ts
git commit -m "api: add worklist adherence rules and query validation" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: Worklist service, route and mount [judgment]

Reviewers after this task: `care-access-reviewer` (scoping, no content leakage) and `api-contract-checker` (new shape; confirm no iOS model is affected).

**Files:**
- Create: `backend/src/services/worklist.ts`
- Create: `backend/src/routes/worklist.ts`
- Modify: `backend/src/server.ts` (import next to `urgentReportRoutes`; mount after `/api/urgent-reports`)
- Test: `backend/tests/worklist.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `prisma` from `backend/src/config/database.ts`; `requireDermatologist` from `backend/src/middleware/auth.ts`; `errorHandler`.
- Produces: `worklist(clinicianId:string, query:WorklistQuery, now?:Date)` resolving to the **API contract** above; `CHECK_IN_WINDOW_DAYS = 7`; `worklistError(statusCode, code)`; route `GET /api/worklist`.

Query budget per request (no N+1): 6 summary reads, 2 page-selection reads, then at most 5 page-enrichment reads keyed by `id in (page ids)` and skipped when the page is empty. Every `where` includes the clinician id.

- [ ] **Step 1: Write the failing test** — `backend/tests/worklist.test.ts`

```ts
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
process.env.SUPABASE_URL='https://worklist-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
const P1='11111111-1111-4111-8111-111111111111',P2='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const TODAY='2026-09-16',at=(iso:string)=>new Date(iso);
const past=(days:number)=>new Date(Date.parse(`${TODAY}T00:00:00.000Z`)-days*86_400_000).toISOString().slice(0,10);
// The mock-up strip: index 0 is 13 days ago, index 13 is today; 11 of 14 days recorded.
const PATTERN=[1,2,0,2,2,1,0,2,2,1,2,0,2,2];
type Call={model:string;method:string;args:any};
let calls:Call[]=[],fixtures:Record<string,unknown>={},isolation:unknown;
// Recording Prisma model: every call is captured; results come from `fixtures['model.method']` (value, function of args, or Error).
const model=(name:string)=>new Proxy({},{get:(_target,method)=>async(args:any)=>{
 calls.push({model:name,method:String(method),args});
 const value=fixtures[`${name}.${String(method)}`];
 if(value instanceof Error)throw value;
 return typeof value==='function'?(value as (a:any)=>unknown)(args):value;
}});
const db:any={$transaction:async(fn:any,options?:any)=>{isolation=options?.isolationLevel;return fn(db)}};
for(const name of ['user','skinPhoto','assignedMessage','careFormResponse','careRoutineRevision','careRoutineCompletion','urgentReport'])db[name]=model(name);
function baseline(){
 fixtures={
  'user.count':({where}:any)=>where.skinPhotos||where.urgentReports?1:2,
  'user.findMany':({where}:any)=>where.id
   ?[{id:P1,name:'Synthetic Ada',joinDate:at('2026-03-02T00:00:00.000Z')},{id:P2,name:'Synthetic Ben',joinDate:at('2026-05-19T00:00:00.000Z')}].filter(u=>where.id.in.includes(u.id))
   :[{id:P2},{id:P1}],
  'skinPhoto.aggregate':{_count:{_all:3},_min:{createdAt:at('2026-09-12T08:00:00.000Z')}},
  'skinPhoto.groupBy':({orderBy}:any)=>orderBy?[{userId:P1,_min:{createdAt:at('2026-09-12T08:00:00.000Z')}}]:[{userId:P1,_count:{_all:3},_min:{createdAt:at('2026-09-12T08:00:00.000Z')}}],
  'assignedMessage.groupBy':[{patientId:P1,_count:{_all:2}}],
  'careFormResponse.count':1,
  'careFormResponse.groupBy':[{userId:P1,_max:{receivedAt:at('2026-09-15T07:04:00.000Z')}}],
  'careRoutineRevision.findMany':[
   {userId:P1,timeOfDay:'morning',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
   {userId:P1,timeOfDay:'evening',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
   {userId:P2,timeOfDay:'morning',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
   {userId:P2,timeOfDay:'morning',version:2,isActive:false,createdAt:at('2026-09-01T09:00:00.000Z')},
  ],
  'careRoutineCompletion.groupBy':PATTERN.flatMap((n,i)=>n?[{userId:P1,localDate:past(13-i),_count:{_all:n}}]:[]),
  'careRoutineCompletion.findMany':PATTERN.flatMap((n,i)=>['morning','evening'].slice(0,n).map(timeOfDay=>({userId:P1,localDate:past(13-i),routine:{timeOfDay}}))),
  'urgentReport.groupBy':({orderBy}:any)=>orderBy?[{patientId:P2,_min:{createdAt:at('2026-09-14T10:00:00.000Z')}}]:[{patientId:P2,status:'open',_count:{_all:1},_min:{createdAt:at('2026-09-14T10:00:00.000Z')}}],
 };
}
const originalLoad=(Module as any)._load;
(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{TransactionIsolationLevel:{RepeatableRead:'RepeatableRead'}}};return originalLoad.call(this,name,...args)};
const app=express();
app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:id===C?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/worklist',require('../src/routes/worklist').default);app.use(require('../src/middleware/errorHandler').errorHandler);
(Module as any)._load=originalLoad;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/worklist`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{calls=[];isolation=undefined;baseline()});
async function call(path:string,who:string=C){const r=await fetch(base+path,{headers:{'x-identity':who}});return {status:r.status,body:await r.json().catch(()=>({})) as any}}

test('only clinicians can read the worklist',async()=>{
 assert.equal((await call(`/?localDate=${TODAY}`,P1)).status,403);
 assert.equal((await fetch(`${base}/?localDate=${TODAY}`)).status,401);
 assert.equal(calls.length,0);
});

test('the query is strictly validated before any database read',async()=>{
 for(const query of ['','localDate=2026-02-30','localDate=16-09-2026',`localDate=${TODAY}&filter=urgent`,`localDate=${TODAY}&page=0`,`localDate=${TODAY}&page=1.5`,`localDate=${TODAY}&page=10001`,`localDate=${TODAY}&limit=51`,`localDate=${TODAY}&search=${'x'.repeat(101)}`,`localDate=${TODAY}&sort=name`,`localDate=${TODAY}&page=1&page=2`]){
  const r=await call('/?'+query);
  assert.equal(r.status,400,query);assert.equal(r.body.code,'VALIDATION_ERROR',query);
 }
 assert.equal(calls.length,0);
});

test('needs review returns the four counts and review-queue rows, scoped to the clinician in one snapshot',async()=>{
 const r=await call(`/?localDate=${TODAY}`);
 assert.equal(r.status,200);
 const since=r.body.summary.checkInsSubmitted.since;
 assert.ok(Math.abs(Date.parse(since)-(Date.now()-7*86_400_000))<60_000);
 assert.deepEqual(r.body.summary,{assignedPatients:2,photosToReview:{count:3,oldestUploadAt:'2026-09-12T08:00:00.000Z'},unreadMessages:{count:2,patients:1},checkInsSubmitted:{count:1,since,days:7},adherenceUnderThreshold:{count:0,threshold:60,windowDays:14}});
 assert.deepEqual(r.body.data,[{patientId:P1,name:'Synthetic Ada',joinedAt:'2026-03-02T00:00:00.000Z',photos:{unreviewedCount:3,oldestUploadAt:'2026-09-12T08:00:00.000Z'},unreadMessages:2,latestCheckInAt:'2026-09-15T07:04:00.000Z',urgent:{open:0,acknowledged:0,oldestAt:null},adherence:{percent:79,completedDays:11,countedDays:14,days:PATTERN.map((routines,i)=>({localDate:past(13-i),routines}))}}]);
 assert.deepEqual(r.body.pagination,{page:1,limit:20,total:1,totalPages:1});
 assert.deepEqual([r.body.filter,r.body.localDate],['needs-review',TODAY]);
 const queue=calls.find(c=>c.model==='skinPhoto'&&c.method==='groupBy'&&c.args.orderBy)!;
 assert.deepEqual(queue.args.orderBy,[{_min:{createdAt:'asc'}},{userId:'asc'}]);
 assert.deepEqual(queue.args.where,{review:{is:null},user:{dermatologistId:C}});
 assert.deepEqual([queue.args.skip,queue.args.take],[0,20]);
 for(const c of calls)assert.ok(JSON.stringify(c.args.where).includes(C),`${c.model}.${c.method} is not scoped to the clinician`);
 assert.equal(isolation,'RepeatableRead');
});

test('adherence under the threshold counts only patients with an active routine, from recorded days',async()=>{
 fixtures['careRoutineRevision.findMany']=[...(fixtures['careRoutineRevision.findMany'] as any[]),{userId:P2,timeOfDay:'morning',version:3,isActive:true,createdAt:at('2026-09-02T09:00:00.000Z')}];
 let r=await call(`/?filter=all&localDate=${TODAY}`);
 assert.equal(r.body.summary.adherenceUnderThreshold.count,1);
 const ben=r.body.data.find((p:any)=>p.patientId===P2);
 assert.deepEqual([ben.adherence.percent,ben.adherence.completedDays,ben.adherence.countedDays],[0,0,13]);
 baseline();
 r=await call(`/?filter=all&localDate=${TODAY}`);
 assert.equal(r.body.summary.adherenceUnderThreshold.count,0);
 assert.equal(r.body.data.find((p:any)=>p.patientId===P2).adherence,null);
});

test('flagged and all patients use their own order, search and totals',async()=>{
 let r=await call(`/?filter=flagged&search=%20ada%20&page=2&limit=5&localDate=${TODAY}`);
 assert.equal(r.status,200);
 const flagged=calls.find(c=>c.model==='urgentReport'&&c.args.orderBy)!;
 assert.deepEqual(flagged.args,{by:['patientId'],where:{status:{not:'resolved'},patient:{dermatologistId:C,name:{contains:'ada',mode:'insensitive'}}},_min:{createdAt:true},orderBy:[{_min:{createdAt:'asc'}},{patientId:'asc'}],skip:5,take:5});
 assert.deepEqual(calls.find(c=>c.model==='user'&&c.method==='count'&&c.args.where.urgentReports)!.args.where,{dermatologistId:C,name:{contains:'ada',mode:'insensitive'},urgentReports:{some:{status:{not:'resolved'}}}});
 assert.deepEqual(r.body.data.map((p:any)=>[p.patientId,p.urgent]),[[P2,{open:1,acknowledged:0,oldestAt:'2026-09-14T10:00:00.000Z'}]]);
 assert.deepEqual(r.body.pagination,{page:2,limit:5,total:1,totalPages:1});
 calls=[];
 r=await call(`/?filter=all&localDate=${TODAY}`);
 const list=calls.find(c=>c.model==='user'&&c.method==='findMany'&&!c.args.where.id)!;
 assert.deepEqual(list.args,{where:{dermatologistId:C},orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:0,take:20,select:{id:true}});
 assert.deepEqual(r.body.data.map((p:any)=>p.patientId),[P2,P1]);
});

test('an empty page makes no per-patient reads',async()=>{
 fixtures['skinPhoto.groupBy']=()=>[];
 fixtures['user.count']=({where}:any)=>where.skinPhotos?0:2;
 const r=await call(`/?localDate=${TODAY}`);
 assert.deepEqual([r.body.data,r.body.pagination],[[],{page:1,limit:20,total:0,totalPages:0}]);
 assert.deepEqual(calls.map(c=>`${c.model}.${c.method}`).filter(n=>['user.findMany','careFormResponse.groupBy','urgentReport.groupBy','careRoutineCompletion.findMany'].includes(n)),[]);
 assert.equal(calls.filter(c=>c.model==='skinPhoto'&&c.method==='groupBy').length,1);
});

test('unexpected failures are not leaked',async()=>{
 fixtures['user.count']=new Error('synthetic database detail');
 const r=await call(`/?localDate=${TODAY}`);
 assert.deepEqual([r.status,r.body],[500,{error:'WORKLIST_OPERATION_FAILED',code:'WORKLIST_OPERATION_FAILED'}]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node --import tsx --test tests/worklist.test.ts`
Expected: FAIL — `Cannot find module '../src/routes/worklist'`.

- [ ] **Step 3: Write `backend/src/services/worklist.ts`**

```ts
import {Prisma} from '@prisma/client';
import {prisma} from '../config/database';
import {ADHERENCE_UNDER,WINDOW_DAYS,adherence,routineState,underThreshold,windowDates,type Adherence} from './worklistAdherence';
import type {WorklistQuery} from './worklistValidation';

export const CHECK_IN_WINDOW_DAYS=7;
export const worklistError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const iso=(date:Date|null|undefined)=>date?date.toISOString():null;
const earliest=(dates:(Date|null)[])=>dates.filter((d):d is Date=>d!==null).sort((a,b)=>a.getTime()-b.getTime())[0]??null;

/**
 * Read-only clinician worklist. Every read filters by the patient's current assignment, inside one
 * RepeatableRead snapshot so counts and rows agree. Never returns message bodies, answers or report text.
 */
export async function worklist(clinicianId:string,query:WorklistQuery,now=new Date()){
 const assigned={dermatologistId:clinicianId};
 const name=query.search?{name:{contains:query.search,mode:'insensitive' as const}}:{};
 const unread={clinicianId,recipientId:clinicianId,recipientType:'dermatologist',readAt:null,patient:assigned};
 const dates=windowDates(query.localDate);
 const inWindow={gte:dates[0],lte:query.localDate};
 const since=new Date(now.getTime()-CHECK_IN_WINDOW_DAYS*86_400_000);
 const skip=(query.page-1)*query.limit,take=query.limit;
 return prisma.$transaction(async tx=>{
  // Summary across all currently assigned patients.
  const assignedPatients=await tx.user.count({where:assigned});
  const photos=await tx.skinPhoto.aggregate({where:{review:{is:null},user:assigned},_count:{_all:true},_min:{createdAt:true}});
  const unreadByPatient=await tx.assignedMessage.groupBy({by:['patientId'],where:unread,_count:{_all:true}});
  const checkIns=await tx.careFormResponse.count({where:{user:assigned,receivedAt:{gte:since}}});
  const revisions=await tx.careRoutineRevision.findMany({where:{user:assigned},select:{userId:true,timeOfDay:true,version:true,isActive:true,createdAt:true}});
  const daily=await tx.careRoutineCompletion.groupBy({by:['userId','localDate'],where:{user:assigned,localDate:inWindow},_count:{_all:true}});
  const routines=routineState(revisions);
  const adherenceFor=(userId:string,slots:Map<string,number>):Adherence|null=>
   routines.active.has(userId)?adherence(query.localDate,routines.first.get(userId)!,slots):null;
  const recordedDays=new Map<string,Map<string,number>>();
  for(const row of daily){const days=recordedDays.get(row.userId)??new Map<string,number>();days.set(row.localDate,row._count._all);recordedDays.set(row.userId,days)}
  let adherenceUnder=0;
  for(const userId of routines.active)if(underThreshold(adherenceFor(userId,recordedDays.get(userId)??new Map())))adherenceUnder++;

  // One page of patient ids in the filter's order.
  let ids:string[],total:number;
  if(query.filter==='needs-review'){
   // Same order as the photo review queue: oldest unreviewed upload first, then patient id.
   const groups=await tx.skinPhoto.groupBy({by:['userId'],where:{review:{is:null},user:{...assigned,...name}},_min:{createdAt:true},orderBy:[{_min:{createdAt:'asc'}},{userId:'asc'}],skip,take});
   ids=groups.map(group=>group.userId);
   total=await tx.user.count({where:{...assigned,...name,skinPhotos:{some:{review:{is:null}}}}});
  }else if(query.filter==='flagged'){
   // Open and seen reports stay flagged until resolved; oldest unresolved report first.
   const groups=await tx.urgentReport.groupBy({by:['patientId'],where:{status:{not:'resolved'},patient:{...assigned,...name}},_min:{createdAt:true},orderBy:[{_min:{createdAt:'asc'}},{patientId:'asc'}],skip,take});
   ids=groups.map(group=>group.patientId);
   total=await tx.user.count({where:{...assigned,...name,urgentReports:{some:{status:{not:'resolved'}}}}});
  }else{
   // Same order as GET /users.
   ids=(await tx.user.findMany({where:{...assigned,...name},orderBy:[{updatedAt:'desc'},{id:'desc'}],skip,take,select:{id:true}})).map(user=>user.id);
   total=await tx.user.count({where:{...assigned,...name}});
  }

  // Page enrichment: one grouped read per concern, never per patient.
  const onPage={in:ids};
  const users=ids.length?await tx.user.findMany({where:{...assigned,id:onPage},select:{id:true,name:true,joinDate:true}}):[];
  const pagePhotos=ids.length?await tx.skinPhoto.groupBy({by:['userId'],where:{userId:onPage,review:{is:null},user:assigned},_count:{_all:true},_min:{createdAt:true}}):[];
  const pageCheckIns=ids.length?await tx.careFormResponse.groupBy({by:['userId'],where:{userId:onPage,user:assigned},_max:{receivedAt:true}}):[];
  const pageUrgent=ids.length?await tx.urgentReport.groupBy({by:['patientId','status'],where:{patientId:onPage,status:{not:'resolved'},patient:assigned},_count:{_all:true},_min:{createdAt:true}}):[];
  const pageCompletions=ids.length?await tx.careRoutineCompletion.findMany({where:{userId:onPage,user:assigned,localDate:inWindow},select:{userId:true,localDate:true,routine:{select:{timeOfDay:true}}}}):[];

  const slots=new Map<string,Map<string,Set<string>>>();
  for(const row of pageCompletions){
   const days=slots.get(row.userId)??new Map<string,Set<string>>();
   const done=days.get(row.localDate)??new Set<string>();
   done.add(row.routine.timeOfDay);days.set(row.localDate,done);slots.set(row.userId,days);
  }
  const byId=new Map(users.map(user=>[user.id,user]));
  const data=ids.filter(id=>byId.has(id)).map(id=>{
   const user=byId.get(id)!;
   const photo=pagePhotos.find(row=>row.userId===id);
   const urgent=pageUrgent.filter(row=>row.patientId===id);
   const daySlots=new Map([...(slots.get(id)??new Map<string,Set<string>>()).entries()].map(([date,done])=>[date,done.size] as [string,number]));
   return {
    patientId:id,
    name:user.name,
    joinedAt:user.joinDate.toISOString(),
    photos:{unreviewedCount:photo?._count._all??0,oldestUploadAt:iso(photo?._min.createdAt)},
    unreadMessages:unreadByPatient.find(row=>row.patientId===id)?._count._all??0,
    latestCheckInAt:iso(pageCheckIns.find(row=>row.userId===id)?._max.receivedAt),
    urgent:{
     open:urgent.find(row=>row.status==='open')?._count._all??0,
     acknowledged:urgent.find(row=>row.status==='acknowledged')?._count._all??0,
     oldestAt:iso(earliest(urgent.map(row=>row._min.createdAt))),
    },
    adherence:adherenceFor(id,daySlots),
   };
  });
  return {
   filter:query.filter,
   localDate:query.localDate,
   summary:{
    assignedPatients,
    photosToReview:{count:photos._count._all,oldestUploadAt:iso(photos._min.createdAt)},
    unreadMessages:{count:unreadByPatient.reduce((sum,row)=>sum+row._count._all,0),patients:unreadByPatient.length},
    checkInsSubmitted:{count:checkIns,since:since.toISOString(),days:CHECK_IN_WINDOW_DAYS},
    adherenceUnderThreshold:{count:adherenceUnder,threshold:ADHERENCE_UNDER,windowDays:WINDOW_DAYS},
   },
   data,
   pagination:{page:query.page,limit:query.limit,total,totalPages:Math.ceil(total/query.limit)},
  };
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
```

- [ ] **Step 4: Write `backend/src/routes/worklist.ts`**

```ts
import express from 'express';
import {ZodError} from 'zod';
import {requireDermatologist} from '../middleware/auth';
import {worklist,worklistError} from '../services/worklist';
import {worklistQuery} from '../services/worklistValidation';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:worklistError(500,'WORKLIST_OPERATION_FAILED'))}};
// Read-only: counts plus one merged table of currently assigned patients.
router.get('/',requireDermatologist,route(async(req,res)=>{res.json(await worklist(req.user!.id,worklistQuery.parse(req.query)))}));
export default router;
```

- [ ] **Step 5: Mount it in `backend/src/server.ts`**

After `import urgentReportRoutes from './routes/urgent-reports';` add:

```ts
import worklistRoutes from './routes/worklist';
```

After `app.use('/api/urgent-reports', authenticateToken, urgentReportRoutes);` add:

```ts
app.use('/api/worklist', authenticateToken, worklistRoutes);
```

- [ ] **Step 6: Run the tests and the build**

Run: `cd backend && node --import tsx --test tests/worklist.test.ts tests/worklist-rules.test.ts`
Expected: PASS (15 tests).
Run: `cd backend && npm test && npm run build`
Expected: all tests pass; `tsc` exits 0. If `tsc` rejects a `groupBy` call, fix the argument shape against the generated `Prisma.<Model>GroupByArgs` type (do not add `any` casts to `where` or `orderBy`, which the access tests rely on).

- [ ] **Step 7: Review agents**

Run the `care-access-reviewer` agent on `backend/src/services/worklist.ts`, `backend/src/routes/worklist.ts`, `backend/src/server.ts`: every read scoped by current assignment, patient 403, no free text returned. Run the `api-contract-checker` agent: new endpoint only, no existing shape changed, no iOS model affected. Fix findings, rerun Step 6.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/worklist.ts backend/src/routes/worklist.ts backend/src/server.ts backend/tests/worklist.test.ts
git commit -m "api: add read-only clinician worklist endpoint" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Worklist live probe against the local stack [judgment]

The Task 2 tests prove scoping and assembly with a mock; this probe proves the real Prisma queries (groupBy ordering, relation filters, adherence from real completion rows) and doubles as the UI fixture for Task 7. It creates data through the real API wherever an endpoint exists and uses SQL only for photo rows (as `photo-review-live.cjs` does) and to backdate routine revisions.

**Files:**
- Create: `backend/scripts/worklist-live.cjs`

**Interfaces:**
- Consumes: `GET /api/worklist` (Task 2); existing endpoints `PUT /photo-reviews/photos/:id`, `PUT /routines/patients/:id/:slot/revisions/:id`, `PUT /routines/completions/:id`, `PUT /assigned-messages/patients/:p/clinicians/:c/messages/:id`, `PUT /care-support/patients/:id/forms/:id`, `PUT /care-support/responses/:id`, `PUT /urgent-reports/:id`, `POST /urgent-reports/:id/acknowledge|resolve`; `local` from `recovery-drill.cjs`; `enrollFixture`/`unenrollFixture`.
- Produces: `node scripts/worklist-live.cjs` (probe + exact cleanup), `--keep-for-ui` (requires `WORKLIST_UI_PASSWORD`, 20+ chars, used only for clinician A; prints clinician A's synthetic email, never a password), `--cleanup-ui`. No new tables, so `recovery-drill.cjs` `applicationTables` is unchanged.

Fixture: patients A, B assigned to clinician A; patient C assigned to clinician B. Unreviewed photos B `2026-01-01`, A `2026-01-02` and `2026-01-05` (A's `2026-01-03` is reviewed), C `2025-12-31`. A: morning + evening routines, morning completions on the last 10 days, evening on the last 5, 2 unread messages, 1 check-in. B: morning routine, completions on the last 2 days, one urgent report. Routines backdated 30 days.

- [ ] **Step 1: Write the probe** — `backend/scripts/worklist-live.cjs`

```js
// Loopback-only synthetic worklist contract probe and UI fixture. Never prints credentials, names or free text.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
require('dotenv').config({quiet:true});
const {local}=require('./recovery-drill.cjs');
const {enrollFixture,unenrollFixture}=require('./lib/enrollment-fixture.cjs');
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3002/api';
local(base,['http:','https:']);local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
const db=new Client({connectionString:process.env.DATABASE_URL});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const keep=process.argv.includes('--keep-for-ui'),cleanupOnly=process.argv.includes('--cleanup-ui');
assert(!(keep&&cleanupOnly),'Choose one fixture mode');
const uiPassword=process.env.WORKLIST_UI_PASSWORD;
assert(!keep||(typeof uiPassword==='string'&&uiPassword.length>=20),'Set WORKLIST_UI_PASSWORD (20+ characters) to keep a UI fixture');
const run=crypto.randomUUID();let s={run,accounts:[]};
const state=path.resolve(process.env.WORKLIST_FIXTURE_STATE||((keep||cleanupOnly)?'../.local/worklist-ui.json':`../.local/worklist-${run}.json`));
if(cleanupOnly){s=JSON.parse(fs.readFileSync(state,'utf8'));assert(s.run&&Array.isArray(s.accounts),'Invalid fixture manifest')}else assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
let checks=0;function ok(name){checks++;console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}}
async function enrollPatients(patients){const r=await call('/enrollment',patients[0]);assert.equal(r.status,200,'Enrollment lookup failed');await enrollFixture(db,patients.map(a=>a.id),{rulesVersion:r.body.rulesVersion,documentVersion:r.body.consent.version,documentSha256:r.body.consent.sha256})}
const created=(r,label)=>assert([200,201].includes(r.status),`${label} failed with ${r.status}`);
async function cleanup(){
 for(const a of s.accounts){const {data,error}=await admin.auth.admin.getUserById(a.id);assert(a.email===`clearaf-worklist-${s.run}-${a.role.toLowerCase()}@example.invalid`&&!error&&data.user.email===a.email,'Fixture identity mismatch')}
 const ids=s.accounts.map(a=>a.id);
 await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[ids]);
 await db.query('delete from assigned_messages where "patientId"=any($1::uuid[])',[ids]);
 await db.query('delete from photo_reviews where "photoId" in(select id from skin_photos where "userId"=any($1::uuid[]))',[ids]);
 for(const [table,column] of [['urgent_reports','patientId'],['care_form_responses','userId'],['care_form_revisions','userId'],['care_routine_completions','userId'],['care_routine_revisions','userId'],['skin_photos','userId'],['photo_cleanup','userId']])
  await db.query(`delete from public.${table} where "${column}"=any($1::uuid[])`,[ids]);
 await unenrollFixture(db,ids);
 await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);
 await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
 for(const a of s.accounts)assert(!(await admin.auth.admin.deleteUser(a.id)).error,'Synthetic auth cleanup failed');
 assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0);
 fs.unlinkSync(state);ok('recorded synthetic accounts, sessions and care rows removed');
}
(async()=>{
 await db.connect();if(cleanupOnly){try{await cleanup()}finally{await db.end()}return}save();
 let retained=false;
 try{
  for(const role of ['patientA','patientB','patientC','clinicianA','clinicianB']){
   const email=`clearaf-worklist-${run}-${role.toLowerCase()}@example.invalid`;
   const password=keep&&role==='clinicianA'?uiPassword:crypto.randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Worklist Test'}});assert(!error,'Synthetic signup failed');
   const account={id:data.user.id,email,role};s.accounts.push(account);save();
   if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[account.id,'Synthetic Worklist Clinician',email,'UNUSED_SUPABASE_AUTH']);
   const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');
   Object.defineProperty(account,'token',{value:login.data.session.access_token});
  }
  const [a,b,c,ca,cb]=s.accounts;
  await enrollPatients([a,b,c]);
  for(const [patient,clinician,name] of [[a,ca,'Synthetic Ada Worklist'],[b,ca,'Synthetic Ben Worklist'],[c,cb,'Synthetic Cy Worklist']])
   await db.query('update user_profiles set "dermatologistId"=$2,name=$3 where id=$1',[patient.id,clinician.id,name]);
  const today=new Date().toISOString().slice(0,10);
  const offset=k=>new Date(Date.parse(`${today}T00:00:00.000Z`)-k*86_400_000).toISOString().slice(0,10);
  const wl=(query={},who=ca)=>call(`/worklist?${new URLSearchParams({localDate:today,...query})}`,who);

  const photo=async(owner,date)=>{const id=crypto.randomUUID();await db.query('insert into skin_photos(id,"userId","photoUrl","createdAt","captureDate") values($1,$2,$3,$4,$5)',[id,owner.id,`${owner.id}/${id}.jpg`,date,'2020-01-01']);return id};
  await photo(b,'2026-01-01');await photo(a,'2026-01-02');const reviewed=await photo(a,'2026-01-03');await photo(a,'2026-01-05');await photo(c,'2025-12-31');
  created(await call(`/photo-reviews/photos/${reviewed}`,ca,'PUT',{}),'Photo review');

  const routine=async(patient,timeOfDay)=>{const id=crypto.randomUUID();created(await call(`/routines/patients/${patient.id}/${timeOfDay}/revisions/${id}`,ca,'PUT',{expectedRevisionId:null,name:'Synthetic routine',isActive:true,steps:[{title:'Synthetic step',instructions:'Synthetic instructions'}]}),'Routine save');return id};
  const aMorning=await routine(a,'morning'),aEvening=await routine(a,'evening'),bMorning=await routine(b,'morning');
  await db.query(`update care_routine_revisions set "createdAt"=now()-interval '30 days' where "userId"=any($1::uuid[])`,[[a.id,b.id]]);
  const complete=async(patient,revisionId,date)=>created(await call(`/routines/completions/${crypto.randomUUID()}`,patient,'PUT',{revisionId,completedAt:`${date}T08:00:00.000Z`,localDate:date,timeZone:'UTC'}),'Completion');
  for(let k=1;k<=10;k++)await complete(a,aMorning,offset(k));
  for(let k=1;k<=5;k++)await complete(a,aEvening,offset(k));
  for(const k of [1,2])await complete(b,bMorning,offset(k));

  for(let i=0;i<2;i++)created(await call(`/assigned-messages/patients/${a.id}/clinicians/${ca.id}/messages/${crypto.randomUUID()}`,a,'PUT',{content:'Synthetic worklist message',reference:null}),'Message');
  const question={id:crypto.randomUUID(),prompt:'Synthetic prompt',type:'choice',required:true,options:[{id:crypto.randomUUID(),label:'First'},{id:crypto.randomUUID(),label:'Second'}]};
  const form=await call(`/care-support/patients/${a.id}/forms/${crypto.randomUUID()}`,ca,'PUT',{expectedRevisionId:null,title:'Synthetic form',isActive:true,questions:[question]});created(form,'Form save');
  created(await call(`/care-support/responses/${crypto.randomUUID()}`,a,'PUT',{formId:form.body.form.id,submittedAt:new Date().toISOString(),answers:[{questionId:question.id,optionId:question.options[0].id}]}),'Check-in');
  const reportId=crypto.randomUUID();created(await call(`/urgent-reports/${reportId}`,b,'PUT',{category:'other',description:'Synthetic worklist report'}),'Urgent report');

  assert.equal((await call(`/worklist?localDate=${today}`)).status,401);
  assert.equal((await wl({},a)).status,403);
  for(const query of [{localDate:'2026-02-30'},{filter:'urgent'},{limit:'51'},{page:'0'},{sort:'name'}])assert.equal((await wl(query)).status,400);
  assert.equal((await call('/worklist',ca)).status,400);
  ok('clinician role, strict query and required local date');

  const r=await wl();assert.equal(r.status,200);
  assert.deepEqual(r.body.data.map(p=>p.patientId),[b.id,a.id]);
  assert.deepEqual(r.body.pagination,{page:1,limit:20,total:2,totalPages:1});
  const rowA=r.body.data[1],rowB=r.body.data[0];
  assert.deepEqual(rowA.photos,{unreviewedCount:2,oldestUploadAt:'2026-01-02T00:00:00.000Z'});
  assert.deepEqual(r.body.summary.photosToReview,{count:3,oldestUploadAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(r.body.summary.assignedPatients,2);
  ok('needs review lists only assigned patients with unreviewed uploads, oldest upload first');

  const first=await wl({page:'1',limit:'1'}),second=await wl({page:'2',limit:'1'});
  assert.deepEqual(first.body.pagination,{page:1,limit:1,total:2,totalPages:2});
  assert.equal(first.body.data[0].patientId,b.id);assert.equal(second.body.data[0].patientId,a.id);
  ok('needs review paginates stably in review-queue order');

  assert.deepEqual(r.body.summary.unreadMessages,{count:2,patients:1});assert.equal(rowA.unreadMessages,2);
  assert.equal(r.body.summary.checkInsSubmitted.count,1);assert.equal(typeof rowA.latestCheckInAt,'string');
  ok('unread messages and submitted check-ins counted for assigned patients');

  assert.deepEqual([rowA.adherence.percent,rowA.adherence.completedDays,rowA.adherence.countedDays],[77,10,13]);
  assert.deepEqual(rowA.adherence.days.map(d=>d.routines),[0,0,0,1,1,1,1,1,2,2,2,2,2,null]);
  assert.equal(rowB.adherence.percent,15);assert.equal(r.body.summary.adherenceUnderThreshold.count,1);
  ok('adherence comes from recorded completions in the 14-day window');

  let flagged=await wl({filter:'flagged'});
  assert.deepEqual(flagged.body.data.map(p=>p.patientId),[b.id]);assert.equal(flagged.body.data[0].urgent.open,1);
  created(await call(`/urgent-reports/${reportId}/acknowledge`,ca,'POST',{}),'Acknowledge');
  flagged=await wl({filter:'flagged'});
  assert.deepEqual([flagged.body.data[0].urgent.open,flagged.body.data[0].urgent.acknowledged],[0,1]);
  created(await call(`/urgent-reports/${reportId}/resolve`,ca,'POST',{resolutionNote:null}),'Resolve');
  assert.equal((await wl({filter:'flagged'})).body.pagination.total,0);
  created(await call(`/urgent-reports/${crypto.randomUUID()}`,b,'PUT',{category:'rapid_worsening',description:'Synthetic worklist report'}),'Second urgent report');
  assert.equal((await wl({filter:'flagged'})).body.pagination.total,1);
  ok('flagged keeps open and seen reports until resolved');

  assert.deepEqual((await wl({filter:'all',search:'ada worklist'})).body.data.map(p=>p.patientId),[a.id]);
  assert.equal((await wl({filter:'all',search:'Cy Worklist'})).body.pagination.total,0);
  assert.equal((await wl({filter:'all'})).body.pagination.total,2);
  ok('all patients searches by name within the assignment only');

  const other=await wl({},cb);
  assert.deepEqual(other.body.data.map(p=>p.patientId),[c.id]);assert.equal(other.body.summary.assignedPatients,1);assert.equal(other.body.summary.unreadMessages.count,0);
  await db.query('update user_profiles set "dermatologistId"=$1 where id=$2',[cb.id,a.id]);
  const moved=await wl({filter:'all'});
  assert.deepEqual(moved.body.data.map(p=>p.patientId),[b.id]);assert.equal(moved.body.summary.unreadMessages.count,0);assert.equal(moved.body.summary.checkInsSubmitted.count,0);
  assert.ok((await wl({filter:'all'},cb)).body.data.some(p=>p.patientId===a.id));
  await db.query('update user_profiles set "dermatologistId"=$1 where id=$2',[ca.id,a.id]);
  ok('reassignment moves every count and row to the current clinician');

  if(keep){retained=true;save();console.log('Retained exact UI fixture manifest: '+state);console.log('UI clinician: '+ca.email)}
 }finally{if(!retained)await cleanup();await db.end()}
 console.log(JSON.stringify({passed:true,checks,cleanup:!retained}));
})().catch(error=>{const location=String(error.stack||'').split('\n').find(line=>line.includes('worklist-live.cjs:'));console.error('Worklist live probe failed',error.code||error.name,location?.trim()||'');process.exitCode=1});
```

- [ ] **Step 2: Start the local stack and a worktree API on port 3002**

Run (worktree root): `node scripts/local.cjs start` (writes the ignored env files; do not read them). Then in the background: `cd backend && PORT=3002 npm run dev`. Wait until `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/health` prints `200`.

- [ ] **Step 3: Run the probe**

Run: `cd backend && node scripts/worklist-live.cjs`
Expected: 8 `PASS` lines (7 checks + cleanup) and `{"passed":true,"checks":8,"cleanup":true}`. If a check fails, fix the service (Task 2 files) or probe wiring; never loosen an assertion. After a service fix, rerun `node --import tsx --test tests/worklist.test.ts` and this probe only.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/worklist-live.cjs
git commit -m "api: add worklist live probe and UI fixture" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Portal contract types, client, controller and list context [judgment]

Reviewer after this task: `api-contract-checker` (portal types match the Task 2 response exactly).

**Files:**
- Modify: `web-portal/src/types/api.ts` (append)
- Modify: `web-portal/src/lib/api.ts` (type import list; new method after `getPatient`)
- Modify (full rewrite): `web-portal/src/lib/patient-navigation.ts`
- Create: `web-portal/src/lib/worklist.ts`
- Test: create `web-portal/tests/worklist.test.ts`, `web-portal/tests/worklist-api.test.ts`; modify `web-portal/tests/patient-navigation.test.ts:5-9`

**Interfaces:**
- Consumes: the API contract (Task 2).
- Produces:
  - Types `WorklistFilter`, `WorklistDayState`, `WorklistAdherence`, `WorklistRow`, `WorklistSummary`, `WorklistResponse`, `WorklistQuery` in `@/types/api`.
  - `apiService.getWorklist(query: WorklistQuery, limit = 20): Promise<WorklistResponse>`.
  - `WORKLIST_FILTERS: readonly WorklistFilter[]`, `DEFAULT_WORKLIST_FILTER`, `patientListContext(params) → { page: number; search: string; filter: WorklistFilter }`, `patientListQuery(page: number, search: string, filter?: WorklistFilter): string` in `@/lib/patient-navigation`.
  - From `@/lib/worklist`: `WorklistController` (`snapshot`, `subscribe`, `load(page?)`, `restore(filter, page, search)`, `setFilter(filter)`, `search(text)`, `goToPage(page)`, `retry()`, `cancelPending()`, `dispose()`), `type WorklistState = { filter; page; search; status: 'idle'|'loading'|'ready'|'error'|'unsupported'; result: WorklistResponse | null; checkedAt: Date | null }`, `type SummaryTile = { label: string; value: number | null; note: string; unread: boolean }`, `ADHERENCE_THRESHOLD`, `FILTER_LABEL`, `SORT_NOTE`, `plural`, `localDateOf`, `clock`, `day`, `stamp`, `longDate`, `waited`, `waitedWords`, `summaryTiles`, `isWaiting`, `rowAction`, `activity`, `adherenceText`, `dayBar`, `emptyCopy`.

- [ ] **Step 1: Write the failing tests**

`web-portal/tests/worklist.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIError } from '../src/types/api';
import type { WorklistFilter, WorklistQuery, WorklistResponse, WorklistRow } from '../src/types/api';
import { WorklistController, activity, adherenceText, dayBar, emptyCopy, localDateOf, longDate, rowAction, stamp, summaryTiles, waited } from '../src/lib/worklist';

const NOW = new Date(2026, 8, 16, 8, 40);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const summary: WorklistResponse['summary'] = {
  assignedPatients: 14,
  photosToReview: { count: 7, oldestUploadAt: hoursAgo(96) },
  unreadMessages: { count: 3, patients: 2 },
  checkInsSubmitted: { count: 5, since: hoursAgo(168), days: 7 },
  adherenceUnderThreshold: { count: 2, threshold: 60, windowDays: 14 },
};
const row = (over: Partial<WorklistRow> = {}): WorklistRow => ({
  patientId: 'patient a', name: 'Synthetic Ada', joinedAt: hoursAgo(5000),
  photos: { unreviewedCount: 0, oldestUploadAt: null }, unreadMessages: 0, latestCheckInAt: null,
  urgent: { open: 0, acknowledged: 0, oldestAt: null }, adherence: null, ...over,
});
const response = (filter: WorklistFilter, page = 1, data: WorklistRow[] = []): WorklistResponse => ({
  filter, localDate: '2026-09-16', summary, data, pagination: { page, limit: 20, total: data.length, totalPages: 1 },
});
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((ok) => { resolve = ok; }); return { promise, resolve }; };

test('loads with the filter, page, search and clinician local date; filter and search reset to page one', async () => {
  const calls: WorklistQuery[] = [];
  const controller = new WorklistController(async (query) => { calls.push(query); return response(query.filter, query.page); }, () => NOW);
  await controller.restore('all', 3, 'Ada');
  await controller.goToPage(4);
  await controller.setFilter('flagged');
  await controller.search('Ben');
  const localDate = '2026-09-16';
  assert.deepEqual(calls, [
    { filter: 'all', page: 3, search: 'Ada', localDate },
    { filter: 'all', page: 4, search: 'Ada', localDate },
    { filter: 'flagged', page: 1, search: 'Ada', localDate },
    { filter: 'flagged', page: 1, search: 'Ben', localDate },
  ]);
  assert.equal(controller.snapshot().status, 'ready');
  assert.equal(controller.snapshot().checkedAt, NOW);
});

test('an API without the worklist endpoint switches to the legacy lists and stops loading', async () => {
  let calls = 0;
  const controller = new WorklistController(async () => { calls += 1; throw new APIError(404, 'Route not found'); }, () => NOW);
  await controller.load();
  assert.equal(controller.snapshot().status, 'unsupported');
  await controller.retry();
  await controller.setFilter('all');
  assert.equal(calls, 1);
  assert.equal(controller.snapshot().status, 'unsupported');
});

test('other failures keep the last result on screen and retry repeats the same load', async () => {
  const calls: WorklistQuery[] = [];
  let fail = false;
  const controller = new WorklistController(async (query) => {
    calls.push(query);
    if (fail) throw new APIError(500, 'Worklist failed');
    return response(query.filter, query.page, [row()]);
  }, () => NOW);
  await controller.restore('needs-review', 2, '');
  fail = true;
  await controller.retry();
  assert.equal(controller.snapshot().status, 'error');
  assert.equal(controller.snapshot().result?.data.length, 1);
  fail = false;
  await controller.retry();
  assert.equal(controller.snapshot().status, 'ready');
  assert.deepEqual(calls.map((query) => [query.filter, query.page]), [['needs-review', 2], ['needs-review', 2], ['needs-review', 2]]);
});

test('an older response finishing last never replaces the newer filter', async () => {
  const slow = deferred<WorklistResponse>(), fast = deferred<WorklistResponse>();
  const controller = new WorklistController((query) => (query.filter === 'all' ? slow.promise : fast.promise), () => NOW);
  const first = controller.setFilter('all');
  const second = controller.setFilter('flagged');
  fast.resolve(response('flagged'));
  await second;
  slow.resolve(response('all'));
  await first;
  assert.equal(controller.snapshot().filter, 'flagged');
  assert.equal(controller.snapshot().result?.filter, 'flagged');
});

test('clinician dates and waiting times are mono stamps', () => {
  assert.equal(stamp(new Date(2026, 8, 2, 7, 4).toISOString()), '02 SEP · 07:04');
  assert.equal(longDate(NOW), 'Wednesday 16 September · 08:40');
  assert.equal(localDateOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(waited(hoursAgo(0.3), NOW), '<1H');
  assert.equal(waited(hoursAgo(6), NOW), '6H');
  assert.equal(waited(hoursAgo(96), NOW), '4D');
});

test('the four counts use real figures and plain notes', () => {
  assert.deepEqual(summaryTiles(summary, NOW), [
    { label: 'Photos to review', value: 7, note: 'Oldest waiting 4 days', unread: false },
    { label: 'Unread messages', value: 3, note: '2 patients', unread: true },
    { label: 'Check-ins submitted', value: 5, note: 'Last 7 days', unread: false },
    { label: 'Adherence under 60%', value: 2, note: '14-day window', unread: false },
  ]);
  const quiet = { ...summary, photosToReview: { count: 0, oldestUploadAt: null }, unreadMessages: { count: 0, patients: 0 } };
  assert.deepEqual(summaryTiles(quiet, NOW).slice(0, 2).map((tile) => [tile.note, tile.unread]), [['None waiting', false], ['None unread', false]]);
  assert.deepEqual(summaryTiles(null, NOW).map((tile) => [tile.label, tile.value]), [['Photos to review', null], ['Unread messages', null], ['Check-ins submitted', null], ['Adherence under 60%', null]]);
});

test('row actions keep the list context; flagged rows open the urgent report', () => {
  assert.deepEqual(rowAction('needs-review', row(), 'page=2'), { label: 'Review photos', href: '/patients/patient%20a?page=2', ariaLabel: 'Review photos for Synthetic Ada' });
  assert.deepEqual(rowAction('flagged', row(), 'page=1&filter=flagged'), { label: 'Open report', href: '/patients/patient%20a?page=1&filter=flagged#urgent', ariaLabel: 'Open urgent report for Synthetic Ada' });
  assert.deepEqual(rowAction('all', row({ name: null }), 'page=1&filter=all'), { label: 'Open patient', href: '/patients/patient%20a?page=1&filter=all', ariaLabel: 'Open patient' });
});

test('activity is said in words, never message content', () => {
  assert.deepEqual(activity(row()), ['No new activity']);
  assert.deepEqual(
    activity(row({ urgent: { open: 1, acknowledged: 1, oldestAt: hoursAgo(5) }, unreadMessages: 1, latestCheckInAt: new Date(2026, 8, 15, 7, 4).toISOString() })),
    ['Urgent reports · 1 open · 1 seen', '1 unread message', 'Check-in · 15 SEP · 07:04'],
  );
});

test('adherence reads from recorded days only, with no grading', () => {
  assert.equal(adherenceText(null), 'No active routine');
  assert.equal(adherenceText({ percent: null, completedDays: 0, countedDays: 0, days: [] }), 'No days recorded yet');
  assert.equal(adherenceText({ percent: 79, completedDays: 11, countedDays: 14, days: Array.from({ length: 14 }, (_, i) => ({ localDate: `d${i}`, routines: 2 as const })) }), '79% / 14d');
  assert.equal(dayBar(2), 'block h-full w-1.5 bg-ink');
  assert.equal(dayBar(1), 'block h-[70%] w-1.5 bg-ink');
  assert.equal(dayBar(0), 'block h-[40%] w-1.5 border border-ink/30 bg-sunk');
  assert.equal(dayBar(null), 'block h-px w-1.5 bg-rule');
});

test('empty states name what is empty and offer at most one next step', () => {
  assert.deepEqual(emptyCopy('needs-review', ''), { title: 'No photos waiting', body: 'Shared photos appear here until you mark them reviewed.', action: 'show-all' });
  assert.deepEqual(emptyCopy('flagged', ''), { title: 'No urgent reports', body: 'Nothing your patients have reported is waiting.', action: null });
  assert.deepEqual(emptyCopy('all', ''), { title: 'No assigned patients yet', body: 'Patients assigned to you will appear here.', action: null });
  assert.deepEqual(emptyCopy('flagged', 'Zed'), { title: 'No patients match this name', body: 'Check the spelling or clear the search.', action: 'clear-search' });
});
```

`web-portal/tests/worklist-api.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, authStorage, supabase } from '../src/lib/api';

test('worklist reads use one bounded clinician endpoint through the session-scoped facade', async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const session = { access_token: 'synthetic-token', user: { id: 'account-a' } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async (input) => { requests.push(String(input)); return new Response('{}', { status: 200 }); };
  try {
    const api = apiService.scoped();
    await api.getWorklist({ filter: 'flagged', page: 2, search: '  Ada ', localDate: '2026-09-16' });
    await api.getWorklist({ filter: 'needs-review', page: 1, search: '', localDate: '2026-09-16' });
    assert.deepEqual(requests.map((url) => new URL(url).pathname + new URL(url).search), [
      '/api/worklist?filter=flagged&page=2&limit=20&localDate=2026-09-16&search=Ada',
      '/api/worklist?filter=needs-review&page=1&limit=20&localDate=2026-09-16',
    ]);
    apiService.acceptSession({ access_token: 'other', user: { id: 'account-b' } });
    assert.throws(() => api.getWorklist({ filter: 'all', page: 1, search: '', localDate: '2026-09-16' }));
    assert.equal(requests.length, 2);
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});
```

In `web-portal/tests/patient-navigation.test.ts`, replace the first test (lines 5–9) with:

```ts
test('workspace return context preserves filter, search and page without allowing redirect destinations', () => {
  assert.deepEqual(patientListContext(new URLSearchParams(patientListQuery(3, 'Ada & Ben'))), { page: 3, search: 'Ada & Ben', filter: 'needs-review' });
  assert.deepEqual(patientListContext(new URLSearchParams(patientListQuery(2, '', 'flagged'))), { page: 2, search: '', filter: 'flagged' });
  assert.equal(patientListQuery(1, ''), 'page=1');
  assert.equal(patientListQuery(1, '', 'all'), 'page=1&filter=all');
  assert.deepEqual(patientListContext(new URLSearchParams('page=-4&filter=https://external.invalid&return=https://external.invalid')), { page: 1, search: '', filter: 'needs-review' });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web-portal && node --import tsx --test tests/worklist.test.ts tests/worklist-api.test.ts tests/patient-navigation.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/worklist'`, `api.getWorklist is not a function`, and the context deepEqual missing `filter`.

- [ ] **Step 3: Append the contract types to `web-portal/src/types/api.ts`**

```ts
// Clinician worklist (GET /worklist). Read-only; every figure covers currently assigned patients only.
export type WorklistFilter = 'needs-review' | 'all' | 'flagged';
/** Routines completed that day (clamped to 2); null = the day does not count. */
export type WorklistDayState = 0 | 1 | 2 | null;

export interface WorklistAdherence {
  percent: number | null;
  completedDays: number;
  countedDays: number;
  days: { localDate: string; routines: WorklistDayState }[];
}

export interface WorklistRow {
  patientId: string;
  name: string | null;
  joinedAt: string;
  photos: { unreviewedCount: number; oldestUploadAt: string | null };
  unreadMessages: number;
  latestCheckInAt: string | null;
  urgent: { open: number; acknowledged: number; oldestAt: string | null };
  adherence: WorklistAdherence | null;
}

export interface WorklistSummary {
  assignedPatients: number;
  photosToReview: { count: number; oldestUploadAt: string | null };
  unreadMessages: { count: number; patients: number };
  checkInsSubmitted: { count: number; since: string; days: number };
  adherenceUnderThreshold: { count: number; threshold: number; windowDays: number };
}

export interface WorklistResponse extends PaginatedResponse<WorklistRow> {
  filter: WorklistFilter;
  localDate: string;
  summary: WorklistSummary;
}

export interface WorklistQuery {
  filter: WorklistFilter;
  page: number;
  search: string;
  localDate: string;
}
```

- [ ] **Step 4: Add the client method in `web-portal/src/lib/api.ts`**

Add `WorklistQuery,` and `WorklistResponse,` to the `from '@/types/api'` import list (after `SaveRoutineRevisionInput,`). After `getPatient`:

```ts
  async getWorklist(query: WorklistQuery, limit = 20): Promise<WorklistResponse> {
    const params = new URLSearchParams({ filter: query.filter, page: String(query.page), limit: String(limit), localDate: query.localDate });
    if (query.search.trim()) params.set('search', query.search.trim());
    return this.request<WorklistResponse>(`/worklist?${params}`);
  }
```

- [ ] **Step 5: Rewrite `web-portal/src/lib/patient-navigation.ts`**

```ts
import type { WorklistFilter } from '@/types/api';

export const WORKLIST_FILTERS: readonly WorklistFilter[] = ['needs-review', 'all', 'flagged'];
export const DEFAULT_WORKLIST_FILTER: WorklistFilter = 'needs-review';

// Only list state can travel through patient workspace URLs; never arbitrary return URLs.
export function patientListContext(params: { get(name: string): string | null }) {
  const raw = params.get('page') || '1';
  const value = /^\d+$/.test(raw) ? Number(raw) : 1;
  const filter = WORKLIST_FILTERS.find((candidate) => candidate === params.get('filter')) ?? DEFAULT_WORKLIST_FILTER;
  return { page: Number.isSafeInteger(value) && value > 0 ? value : 1, search: (params.get('search') || '').slice(0, 120), filter };
}

/** The default filter is omitted, so links built before the worklist are unchanged. */
export function patientListQuery(page: number, search: string, filter: WorklistFilter = DEFAULT_WORKLIST_FILTER) {
  return new URLSearchParams({
    page: String(page),
    ...(search ? { search } : {}),
    ...(filter !== DEFAULT_WORKLIST_FILTER ? { filter } : {}),
  }).toString();
}
```

- [ ] **Step 6: Create `web-portal/src/lib/worklist.ts`**

```ts
import { APIError } from '@/types/api';
import type { WorklistAdherence, WorklistDayState, WorklistFilter, WorklistQuery, WorklistResponse, WorklistRow, WorklistSummary } from '@/types/api';

export const ADHERENCE_THRESHOLD = 60;
export const FILTER_LABEL: Record<WorklistFilter, string> = { 'needs-review': 'Needs review', all: 'All patients', flagged: 'Flagged' };
export const SORT_NOTE: Record<WorklistFilter, string> = {
  'needs-review': 'Sorted by oldest unreviewed upload',
  all: 'Most recently updated first',
  flagged: 'Oldest open report first',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (value: number) => String(value).padStart(2, '0');

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
/** The clinician's calendar date, which anchors the 14-day window. */
export const localDateOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
/** `02 SEP` */
export const day = (iso: string) => { const date = new Date(iso); return `${pad(date.getDate())} ${MONTHS[date.getMonth()]}`; };
/** `02 SEP · 07:04` */
export const stamp = (iso: string) => `${day(iso)} · ${clock(new Date(iso))}`;
/** `Wednesday 16 September · 08:40` (rendered as an uppercase eyebrow) */
export const longDate = (date: Date) => `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} · ${clock(date)}`;

const hoursSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000));
/** Mono waiting time: `<1H`, `6H`, `4D`. */
export function waited(iso: string, now: Date) {
  const hours = hoursSince(iso, now);
  return hours < 1 ? '<1H' : hours < 24 ? `${hours}H` : `${Math.floor(hours / 24)}D`;
}
export function waitedWords(iso: string, now: Date) {
  const hours = hoursSince(iso, now);
  return hours < 1 ? 'under an hour' : hours < 24 ? plural(hours, 'hour') : plural(Math.floor(hours / 24), 'day');
}

export type SummaryTile = { label: string; value: number | null; note: string; unread: boolean };
export function summaryTiles(summary: WorklistSummary | null, now: Date): SummaryTile[] {
  if (!summary) {
    return ['Photos to review', 'Unread messages', 'Check-ins submitted', `Adherence under ${ADHERENCE_THRESHOLD}%`]
      .map((label) => ({ label, value: null, note: '', unread: false }));
  }
  const { photosToReview: photos, unreadMessages: unread, checkInsSubmitted: checkIns, adherenceUnderThreshold: adherence } = summary;
  return [
    { label: 'Photos to review', value: photos.count, note: photos.oldestUploadAt ? `Oldest waiting ${waitedWords(photos.oldestUploadAt, now)}` : 'None waiting', unread: false },
    { label: 'Unread messages', value: unread.count, note: unread.patients ? plural(unread.patients, 'patient') : 'None unread', unread: unread.count > 0 },
    { label: 'Check-ins submitted', value: checkIns.count, note: `Last ${checkIns.days} days`, unread: false },
    { label: `Adherence under ${adherence.threshold}%`, value: adherence.count, note: `${adherence.windowDays}-day window`, unread: false },
  ];
}

/** Rows waiting on the clinician get the §4.9 attention bar. */
export const isWaiting = (row: WorklistRow) => row.photos.unreviewedCount > 0 || row.unreadMessages > 0;

export function rowAction(filter: WorklistFilter, row: WorklistRow, context: string) {
  const href = `/patients/${encodeURIComponent(row.patientId)}?${context}`;
  const name = row.name || 'patient';
  if (filter === 'needs-review') return { label: 'Review photos', href, ariaLabel: `Review photos for ${name}` };
  if (filter === 'flagged') return { label: 'Open report', href: `${href}#urgent`, ariaLabel: `Open urgent report for ${name}` };
  return { label: 'Open patient', href, ariaLabel: `Open ${name}` };
}

/** Latest activity in words. The worklist never shows message, answer or report text. */
export function activity(row: WorklistRow): string[] {
  const lines: string[] = [];
  const reports = row.urgent.open + row.urgent.acknowledged;
  if (reports) {
    lines.push([reports === 1 ? 'Urgent report' : 'Urgent reports', row.urgent.open ? `${row.urgent.open} open` : '', row.urgent.acknowledged ? `${row.urgent.acknowledged} seen` : ''].filter(Boolean).join(' · '));
  }
  if (row.unreadMessages) lines.push(plural(row.unreadMessages, 'unread message'));
  if (row.latestCheckInAt) lines.push(`Check-in · ${stamp(row.latestCheckInAt)}`);
  return lines.length ? lines : ['No new activity'];
}

/** Clinician-side figure (`79% / 14d`); patients never see a percentage. */
export function adherenceText(adherence: WorklistAdherence | null) {
  if (!adherence) return 'No active routine';
  if (adherence.percent === null) return 'No days recorded yet';
  return `${adherence.percent}% / ${adherence.days.length}d`;
}

/** Spec §4.6: both = full ink bar, one = 70%, none = 40% sunk (with an ink hairline so it holds on rail); uncounted = hairline. */
export function dayBar(state: WorklistDayState) {
  if (state === null) return 'block h-px w-1.5 bg-rule';
  if (state === 0) return 'block h-[40%] w-1.5 border border-ink/30 bg-sunk';
  return state === 2 ? 'block h-full w-1.5 bg-ink' : 'block h-[70%] w-1.5 bg-ink';
}

export function emptyCopy(filter: WorklistFilter, search: string): { title: string; body: string; action: 'clear-search' | 'show-all' | null } {
  if (search.trim()) return { title: 'No patients match this name', body: 'Check the spelling or clear the search.', action: 'clear-search' };
  if (filter === 'needs-review') return { title: 'No photos waiting', body: 'Shared photos appear here until you mark them reviewed.', action: 'show-all' };
  if (filter === 'flagged') return { title: 'No urgent reports', body: 'Nothing your patients have reported is waiting.', action: null };
  return { title: 'No assigned patients yet', body: 'Patients assigned to you will appear here.', action: null };
}

export type WorklistState = {
  filter: WorklistFilter;
  page: number;
  search: string;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
  result: WorklistResponse | null;
  checkedAt: Date | null;
};
type Loader = (query: WorklistQuery) => Promise<WorklistResponse>;

export class WorklistController {
  private state: WorklistState = { filter: 'needs-review', page: 1, search: '', status: 'idle', result: null, checkedAt: null };
  private listeners = new Set<() => void>();
  private request = 0;
  private disposed = false;
  constructor(private readonly loader: Loader, private readonly now: () => Date = () => new Date()) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: WorklistState) { if (!this.disposed) { this.state = next; this.listeners.forEach((listener) => listener()); } }
  async load(page = this.state.page) {
    if (this.state.status === 'unsupported') return;
    const request = ++this.request;
    const { filter, search } = this.state;
    // The previous result stays on screen while loading so the layout does not jump.
    this.publish({ ...this.state, page, status: 'loading' });
    try {
      const result = await this.loader({ filter, page, search, localDate: localDateOf(this.now()) });
      if (request !== this.request || this.disposed) return;
      this.publish({ ...this.state, page: result.pagination.page, result, status: 'ready', checkedAt: this.now() });
    } catch (cause) {
      if (request !== this.request || this.disposed) return;
      // An API deployed before GET /worklist answers 404: fall back to the separate queue and list.
      this.publish({ ...this.state, status: cause instanceof APIError && cause.status === 404 ? 'unsupported' : 'error' });
    }
  }
  restore(filter: WorklistFilter, page: number, search: string) { this.publish({ ...this.state, filter, page, search }); return this.load(page); }
  setFilter(filter: WorklistFilter) { if (filter === this.state.filter) return Promise.resolve(); this.publish({ ...this.state, filter, page: 1 }); return this.load(1); }
  search(search: string) { this.publish({ ...this.state, search, page: 1 }); return this.load(1); }
  goToPage(page: number) { return this.load(page); }
  retry() { return this.load(); }
  // Effect cleanup retires its request; subscription cleanup owns listener removal.
  cancelPending() { this.request += 1; }
  dispose() { this.disposed = true; this.request += 1; this.listeners.clear(); }
}
```

- [ ] **Step 7: Run the tests, lint and typecheck**

Run: `cd web-portal && node --import tsx --test tests/worklist.test.ts tests/worklist-api.test.ts tests/patient-navigation.test.ts && npm run lint && npm run typecheck`
Expected: PASS (13 tests); lint and typecheck clean. (`src/app/patients/[id]/page.tsx` still calls `patientListQuery(page, search)`, which remains valid.)

- [ ] **Step 8: Review agent and commit**

Run the `api-contract-checker` agent comparing `web-portal/src/types/api.ts` worklist types with `backend/src/services/worklist.ts`. Fix mismatches, rerun Step 7.

```bash
git add web-portal/src/types/api.ts web-portal/src/lib/api.ts web-portal/src/lib/patient-navigation.ts web-portal/src/lib/worklist.ts web-portal/tests/worklist.test.ts web-portal/tests/worklist-api.test.ts web-portal/tests/patient-navigation.test.ts
git commit -m "portal: add worklist client, controller and list context filter" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Worklist presentation components [mechanical]

**Files:**
- Create: `web-portal/src/components/patients/worklist/WorklistSummary.tsx`
- Create: `web-portal/src/components/patients/worklist/AdherenceSparkline.tsx`
- Create: `web-portal/src/components/patients/worklist/WorklistTable.tsx`
- Create: `web-portal/src/components/patients/worklist/WorklistView.tsx`
- Test: `web-portal/tests/worklist-view.test.ts`

**Interfaces:**
- Consumes: Task 4 helpers and types; PR 2 `Button`, `Input`, `Label`, `Table*`, `Tabs*`.
- Produces: `WorklistView` default export with `type WorklistViewProps = { state: WorklistState; now: Date; onFilter: (filter: WorklistFilter) => void; onSearch: (search: string) => void; onPage: (page: number) => void; onRetry: () => void }`. No hooks, no `@/lib/auth` import, so it renders under `react-dom/server`.

States covered (§5): loading (layout kept, counts show `–`, "Loading worklist"), empty (serif title, one sentence, at most one action), populated, selected (segmented tab), disabled (paging at bounds; `PAGE 1 / 1` says why), error (last result kept, "Last checked", "Try again" repeats the load), stale (the same "Last checked" words). Saving/success do not apply: the screen is read-only.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/worklist-view.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorklistView from '../src/components/patients/worklist/WorklistView';
import type { WorklistFilter, WorklistResponse, WorklistRow } from '../src/types/api';
import type { WorklistState } from '../src/lib/worklist';
import { classesOf } from './letterpress-rules';

const NOW = new Date(2026, 8, 16, 8, 40);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const row = (over: Partial<WorklistRow>): WorklistRow => ({
  patientId: 'patient-a', name: 'Synthetic Ada', joinedAt: new Date(2026, 2, 2, 12).toISOString(),
  photos: { unreviewedCount: 0, oldestUploadAt: null }, unreadMessages: 0, latestCheckInAt: null,
  urgent: { open: 0, acknowledged: 0, oldestAt: null }, adherence: null, ...over,
});
const result = (data: WorklistRow[], filter: WorklistFilter = 'needs-review'): WorklistResponse => ({
  filter, localDate: '2026-09-16',
  summary: {
    assignedPatients: 14, photosToReview: { count: 7, oldestUploadAt: hoursAgo(96) }, unreadMessages: { count: 3, patients: 2 },
    checkInsSubmitted: { count: 5, since: hoursAgo(168), days: 7 }, adherenceUnderThreshold: { count: 2, threshold: 60, windowDays: 14 },
  },
  data, pagination: { page: 1, limit: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});
const state = (over: Partial<WorklistState>): WorklistState => ({ filter: 'needs-review', page: 1, search: '', status: 'ready', result: null, checkedAt: NOW, ...over });
const render = (value: WorklistState) => renderToStaticMarkup(h(WorklistView, { state: value, now: NOW, onFilter() {}, onSearch() {}, onPage() {}, onRetry() {} }));
const waiting = row({
  photos: { unreviewedCount: 3, oldestUploadAt: hoursAgo(96) }, unreadMessages: 1,
  adherence: { percent: 79, completedDays: 11, countedDays: 14, days: [1, 2, 0, 2, 2, 1, 0, 2, 2, 1, 2, 0, 2, 2].map((routines, i) => ({ localDate: `2026-09-${String(3 + i).padStart(2, '0')}`, routines: routines as 0 | 1 | 2 })) },
});
const quiet = row({ patientId: 'patient-b', name: 'Synthetic Ben', latestCheckInAt: new Date(2026, 8, 15, 7, 4).toISOString() });
const actionLinks = (html: string) => [...html.matchAll(/<a [^>]*href="\/patients\/[^"]*"[^>]*>/g)].map((match) => match[0]);

test('loading keeps the layout: count labels, placeholders and a named loading line', () => {
  const html = render(state({ status: 'loading', result: null, checkedAt: null }));
  for (const text of ['Wednesday 16 September · 08:40', 'Needs you today', 'Photos to review', 'Unread messages', 'Check-ins submitted', 'Adherence under 60%', 'Loading worklist', '–']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<table/);
});

test('populated: four real counts, one merged table, exactly one filled action per row, attention only on waiting rows', () => {
  const html = render(state({ result: result([waiting, quiet]) }));
  for (const text of ['>7<', 'Oldest waiting 4 days', '2 patients', 'Last 7 days', '14-day window', '2 OF 14', 'Synthetic Ada', 'Since 02 MAR', '3 photos', 'Oldest 4D', '79% / 14d', '1 unread message', 'No photos waiting', 'No active routine', 'Check-in · 15 SEP · 07:04', 'Sorted by oldest unreviewed upload', 'PAGE 1 / 1'])
    assert.ok(html.includes(text), text);
  const links = actionLinks(html);
  assert.equal(links.length, 2);
  for (const link of links) assert.ok(classesOf(link).has('bg-ink'), link);
  assert.ok(links[0].includes('href="/patients/patient-a?page=1"'));
  assert.ok(links[0].includes('Review photos for Synthetic Ada'));
  assert.equal(html.match(/data-attention="true"/g)?.length, 1);
  assert.equal(html.match(/data-day=/g)?.length, 14);
  assert.equal(html.match(/text-attention-text/g)?.length, 1);
});

test('flagged rows open the urgent report and keep the not-a-live-alert note', () => {
  const report = row({ patientId: 'patient-b', name: 'Synthetic Ben', urgent: { open: 1, acknowledged: 0, oldestAt: hoursAgo(20) } });
  const html = render(state({ filter: 'flagged', result: result([report], 'flagged') }));
  for (const text of ['This is not a live alert.', 'Urgent report · 1 open', 'Open report', 'Oldest open report first']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('href="/patients/patient-b?page=1&amp;filter=flagged#urgent"'));
});

test('empty states: display-serif title, one sentence, one action', () => {
  let html = render(state({ result: result([]) }));
  assert.ok(html.includes('No photos waiting') && html.includes('Show all patients'));
  assert.match(html, /<h2 class="[^"]*editorial-title[^"]*">No photos waiting<\/h2>/);
  assert.equal(actionLinks(html).length, 0);
  html = render(state({ search: 'Zed', result: result([]) }));
  assert.ok(html.includes('No patients match this name') && html.includes('Clear search'));
});

test('error keeps the last result and offers a retry of the same load', () => {
  const html = render(state({ status: 'error', result: result([waiting]) }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Couldn(?:&#x27;|')t load the worklist/);
  assert.ok(html.includes('Last checked 08:40') && html.includes('Try again'));
  assert.match(html, /<table/);
});

test('rows from another filter are never shown under the selected tab', () => {
  const html = render(state({ filter: 'flagged', status: 'loading', result: result([waiting]) }));
  assert.doesNotMatch(html, /<table/);
  assert.ok(html.includes('Loading worklist'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/worklist-view.test.ts`
Expected: FAIL — `Cannot find module '../src/components/patients/worklist/WorklistView'`.

- [ ] **Step 3: Create `WorklistSummary.tsx`**

```tsx
import { cn } from '@/lib/utils';
import { summaryTiles } from '@/lib/worklist';
import type { WorklistSummary as Summary } from '@/types/api';

// The four counts that drive a morning (spec §6 portal #1). Mono figures; ochre only on unread.
export default function WorklistSummary({ summary, now }: { summary: Summary | null; now: Date }) {
  return (
    <dl aria-label="Worklist counts" className="grid grid-cols-2 gap-px bg-rule lg:grid-cols-4">
      {summaryTiles(summary, now).map((tile) => (
        <div key={tile.label} className="bg-rail px-4 py-3.5">
          <dt className="font-data text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-ink-tertiary">{tile.label}</dt>
          <dd className={cn('mt-2 font-data text-[28px] font-medium leading-none tabular-nums', tile.unread ? 'text-attention-text' : 'text-ink')}>{tile.value ?? '–'}</dd>
          <dd className="mt-1.5 min-h-[18px] text-xs text-ink-secondary">{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: Create `AdherenceSparkline.tsx`**

```tsx
import { adherenceText, dayBar } from '@/lib/worklist';
import type { WorklistAdherence } from '@/types/api';

// Spec §4.6, clinician side. Read from recorded completions; no target line, no colour grading.
export default function AdherenceSparkline({ adherence }: { adherence: WorklistAdherence | null }) {
  if (!adherence || adherence.percent === null) return <p className="text-xs text-ink-secondary">{adherenceText(adherence)}</p>;
  return (
    <div className="flex items-end gap-2">
      <div aria-hidden className="flex h-[26px] items-end gap-0.5">
        {adherence.days.map((entry) => <span key={entry.localDate} data-day={entry.routines ?? 'uncounted'} className={dayBar(entry.routines)} />)}
      </div>
      <p className="font-data text-xs font-medium tabular-nums text-ink">
        {adherenceText(adherence)}
        <span className="sr-only">{`, ${adherence.completedDays} of ${adherence.countedDays} days with a recorded completion`}</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Create `WorklistTable.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { activity, day, isWaiting, plural, rowAction, waited } from '@/lib/worklist';
import type { WorklistResponse } from '@/types/api';
import AdherenceSparkline from './AdherenceSparkline';

// Spec §4.9: one ruled table merging the review queue and the patient list. Waiting rows carry data-attention
// (rail fill + 4px attention.mark bar, from PR 2's TableRow); every row has exactly one filled action.
export default function WorklistTable({ result, context, now }: { result: WorklistResponse; context: string; now: Date }) {
  return (
    <Table aria-label="Worklist patients">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Patient</TableHead>
          <TableHead>Waiting</TableHead>
          <TableHead>Last 14 days</TableHead>
          <TableHead>Latest activity</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.data.map((row) => {
          const action = rowAction(result.filter, row, context);
          return (
            <TableRow key={row.patientId} data-attention={isWaiting(row) ? 'true' : undefined}>
              <TableCell className="pl-4">
                <p className="text-[15px] font-medium text-ink">{row.name || 'Unnamed patient'}</p>
                <p className="font-data text-[11px] uppercase tabular-nums text-ink-tertiary">{`Since ${day(row.joinedAt)}`}</p>
              </TableCell>
              <TableCell>
                {row.photos.unreviewedCount > 0 && row.photos.oldestUploadAt ? (
                  <>
                    <p className="font-data text-sm font-medium tabular-nums text-ink">{plural(row.photos.unreviewedCount, 'photo')}</p>
                    <p className="font-data text-[11px] uppercase tabular-nums text-ink-tertiary">{`Oldest ${waited(row.photos.oldestUploadAt, now)}`}</p>
                  </>
                ) : (
                  <p className="text-xs text-ink-secondary">No photos waiting</p>
                )}
              </TableCell>
              <TableCell><AdherenceSparkline adherence={row.adherence} /></TableCell>
              <TableCell>{activity(row).map((line) => <p key={line} className="text-xs text-ink-secondary">{line}</p>)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" asChild><a href={action.href} aria-label={action.ariaLabel}>{action.label}</a></Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 6: Create `WorklistView.tsx`**

```tsx
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WORKLIST_FILTERS, patientListQuery } from '@/lib/patient-navigation';
import { FILTER_LABEL, SORT_NOTE, clock, emptyCopy, longDate, type WorklistState } from '@/lib/worklist';
import type { WorklistFilter } from '@/types/api';
import WorklistSummary from './WorklistSummary';
import WorklistTable from './WorklistTable';

export type WorklistViewProps = {
  state: WorklistState;
  now: Date;
  onFilter: (filter: WorklistFilter) => void;
  onSearch: (search: string) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
};

export default function WorklistView({ state, now, onFilter, onSearch, onPage, onRetry }: WorklistViewProps) {
  // Rows are shown only under the tab they belong to; a tab switch in flight shows its loading line.
  const current = state.result?.filter === state.filter ? state.result : null;
  const busy = state.status === 'loading';
  const context = patientListQuery(state.page, state.search, state.filter);
  const empty = emptyCopy(state.filter, state.search);
  const totalPages = Math.max(1, current?.pagination.totalPages ?? 1);
  return (
    <div className="portal-page">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1 space-y-1">
          <p className="font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary">{longDate(now)}</p>
          <h1 className="editorial-title text-[34px] text-ink">Needs you today</h1>
        </div>
        <Button variant="outline" onClick={onRetry} disabled={busy}>Refresh</Button>
      </header>
      <WorklistSummary summary={state.result?.summary ?? null} now={now} />
      <Tabs value={state.filter} onValueChange={(value) => onFilter(value as WorklistFilter)} className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <TabsList aria-label="Worklist filter">
            {WORKLIST_FILTERS.map((filter) => <TabsTrigger key={filter} value={filter}>{FILTER_LABEL[filter]}</TabsTrigger>)}
          </TabsList>
          <div className="w-full max-w-xs space-y-1.5">
            <Label htmlFor="worklist-search">Search patients</Label>
            <div className="relative">
              <Search aria-hidden className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
              <Input id="worklist-search" aria-label="Search assigned patients by name" placeholder="Patient name" value={state.search} onChange={(event) => onSearch(event.target.value)} className="pl-6" />
            </div>
          </div>
          {current && <p className="ml-auto font-data text-[11px] tabular-nums text-ink-tertiary">{`${current.pagination.total} OF ${current.summary.assignedPatients}`}</p>}
        </div>
        {WORKLIST_FILTERS.map((filter) => (
          <TabsContent key={filter} value={filter} className="space-y-4">
            {filter === 'flagged' && <p className="text-xs text-ink-secondary">Reported by assigned patients. This is not a live alert.</p>}
            {busy && <p role="status" className="text-sm text-ink-secondary">Loading worklist</p>}
            {state.status === 'error' && (
              <div role="alert" className="space-y-3 border-l-2 border-ink pl-4">
                {state.checkedAt && <p className="font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary">{`Last checked ${clock(state.checkedAt)}`}</p>}
                <p className="text-sm text-ink">Couldn&apos;t load the worklist. Check your connection, then try again.</p>
                <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
              </div>
            )}
            {current && current.data.length > 0 && (
              <>
                <WorklistTable result={current} context={context} now={now} />
                <nav aria-label="Worklist pages" className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" disabled={busy || state.page <= 1} onClick={() => onPage(state.page - 1)}>Previous page</Button>
                  <p className="font-data text-[11px] tabular-nums text-ink-tertiary">{`PAGE ${current.pagination.page} / ${totalPages}`}</p>
                  <Button variant="outline" size="sm" disabled={busy || state.page >= totalPages} onClick={() => onPage(state.page + 1)}>Next page</Button>
                  <p className="ml-auto text-xs text-ink-tertiary">{SORT_NOTE[filter]}</p>
                </nav>
              </>
            )}
            {current && current.data.length === 0 && (
              <div className="space-y-2 border-t border-rule py-8">
                <h2 className="editorial-title text-2xl text-ink">{empty.title}</h2>
                <p className="text-sm text-ink-secondary">{empty.body}</p>
                {empty.action === 'clear-search' && <Button variant="outline" size="sm" onClick={() => onSearch('')}>Clear search</Button>}
                {empty.action === 'show-all' && <Button variant="outline" size="sm" onClick={() => onFilter('all')}>Show all patients</Button>}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests, the sweep and lint**

Run: `cd web-portal && node --import tsx --test tests/worklist-view.test.ts tests/letterpress-sweep.test.ts && npm run lint && npm run typecheck`
Expected: PASS (6 view tests plus the PR 2 sweep with no offences in the new files); lint and typecheck clean. If a text assertion fails only because React inserted markup between text nodes, change the component to a single template-literal child (as done for "Last checked"), not the test.

- [ ] **Step 8: Commit**

```bash
git add web-portal/src/components/patients/worklist web-portal/tests/worklist-view.test.ts
git commit -m "portal: add worklist counts, adherence strip and merged table" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: Re-sequence `/patients` with the legacy fallback [judgment]

**Files:**
- Create: `web-portal/src/components/patients/worklist/Worklist.tsx`
- Create: `web-portal/src/components/patients/LegacyPatientList.tsx`
- Modify (full rewrite): `web-portal/src/app/patients/page.tsx`
- Modify: `web-portal/src/app/patients/[id]/page.tsx:39` (back link keeps the filter)
- Test: `web-portal/tests/worklist-page.test.ts`

**Interfaces:**
- Consumes: `WorklistView` (Task 5); `WorklistController`, `patientListContext`, `patientListQuery` (Task 4); `apiService.getWorklist`; existing `PhotoReviewQueue`, `UrgentReportQueue`, `PatientListController`.
- Produces: `/patients` renders the worklist; on `status === 'unsupported'` it renders `LegacyPatientList` (today's behaviour). `PhotoReviewQueue` and `UrgentReportQueue` stay in the codebase for the fallback. The workspace back link returns to the same filter, page and search.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/worklist-page.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './letterpress-rules';

test('the patients page is the worklist; the separate queues live only in the legacy fallback', () => {
  const page = read('src/app/patients/page.tsx');
  assert.match(page, /<Worklist \/>/);
  assert.doesNotMatch(page, /PhotoReviewQueue|UrgentReportQueue|PatientListController/);
  const container = read('src/components/patients/worklist/Worklist.tsx');
  assert.match(container, /if \(state\.status === 'unsupported'\) return <LegacyPatientList \/>;/);
  assert.match(container, /patientListQuery\(state\.page, state\.search, state\.filter\)/);
  const legacy = read('src/components/patients/LegacyPatientList.tsx');
  for (const text of ['<UrgentReportQueue', '<PhotoReviewQueue', 'Previous patients', 'Next patients', 'api.getPatients(page, 20, search)']) assert.ok(legacy.includes(text), text);
});

test('the workspace back link returns to the same filter, page and search', () => {
  assert.ok(read('src/app/patients/[id]/page.tsx').includes("'/patients?' + patientListQuery(context.page, context.search, context.filter)"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/worklist-page.test.ts`
Expected: FAIL — `ENOENT ... Worklist.tsx` and the page still imports `PhotoReviewQueue`.

- [ ] **Step 3: Create `web-portal/src/components/patients/LegacyPatientList.tsx`**

Move the body of today's `PatientsPage` unchanged (everything inside `<DashboardLayout>`). The code below is `main` with PR 2's class mapping applied; if PR 2's merged page differs in class names, copy PR 2's version instead.

```tsx
'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import PhotoReviewQueue from '@/components/patients/PhotoReviewQueue';
import UrgentReportQueue from '@/components/patients/UrgentReportQueue';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClinicalAPI } from '@/lib/auth';
import { PatientListController } from '@/lib/patient-list';
import { patientListContext, patientListQuery } from '@/lib/patient-navigation';
import type { User } from '@/types/api';

// Shown only when the API predates GET /worklist (it answers 404). Behaviour is the pre-worklist page, unchanged.
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }
function joined(patient: User) { const value = patient.joinDate || patient.createdAt; if (!value) return 'Not available'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not available'; }
export default function LegacyPatientList() {
  const api = useClinicalAPI();
  const controller = useMemo(() => new PatientListController((page, search) => api.getPatients(page, 20, search)), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => {
    const restore = () => { const context = patientListContext(new URLSearchParams(window.location.search)); void controller.restore(context.page, context.search); };
    restore();
    window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('popstate', restore); controller.cancelPending(); };
  }, [controller]);
  useEffect(() => {
    if (state.status === 'ready') window.history.replaceState(null, '', '/patients?' + patientListQuery(state.page, state.search));
  }, [state.status, state.page, state.search]);
  return <div className="portal-page">
    <div className="space-y-2"><h1 className="text-2xl font-semibold">Assigned patients</h1><p className="max-w-prose text-ink-secondary">Review shared photos, assign routines, and follow patient-reported completions.</p></div>
    <UrgentReportQueue context={patientListQuery(state.page, state.search)} />
    <PhotoReviewQueue context={patientListQuery(state.page, state.search)} />
    <section aria-label="Patient list" className="space-y-5">
      <div className="max-w-xl space-y-2"><Label htmlFor="patient-search">Search patients</Label><div className="relative"><Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" /><Input id="patient-search" aria-label="Search assigned patients by name" placeholder="Patient name" value={state.search} onChange={event => void controller.search(event.target.value)} className="bg-surface pl-9" /></div></div>
      {state.status === 'loading' && <p role="status">Loading assigned patients…</p>}
      {state.status === 'error' && <div role="alert" className="space-y-3"><p>{state.error}</p><Button onClick={() => void controller.retry()}>Retry patient list</Button></div>}
      {state.status === 'ready' && <><p className="text-sm text-ink-secondary">{state.total} assigned {state.total === 1 ? 'patient' : 'patients'}{state.search ? ' matching this name' : ''}</p>
        {state.patients.length === 0 ? <p>{state.search ? 'No assigned patients match this name.' : 'Patients assigned to you will appear here.'}</p> : <div className="overflow-x-auto rounded-none bg-surface"><Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader><TableBody>{state.patients.map(patient => <TableRow key={patient.id}><TableCell><div className="flex items-center gap-3"><Avatar><AvatarFallback>{initials(patient.name || '')}</AvatarFallback></Avatar><span className="font-medium">{patient.name || 'Unnamed patient'}</span></div></TableCell><TableCell className="tabular-nums">{joined(patient)}</TableCell><TableCell className="text-right"><Button variant="outline" asChild><a href={`/patients/${encodeURIComponent(patient.id)}?${patientListQuery(state.page, state.search)}`} aria-label={`Open ${patient.name || 'patient'} review`}>Open patient</a></Button></TableCell></TableRow>)}</TableBody></Table></div>}
        <nav aria-label="Patient pages" className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={state.page <= 1} onClick={() => void controller.goToPage(state.page - 1)}>Previous patients</Button><p role="status" className="text-sm tabular-nums">Page {state.page} of {state.totalPages}</p><Button variant="outline" disabled={state.page >= state.totalPages} onClick={() => void controller.goToPage(state.page + 1)}>Next patients</Button></nav>
      </>}
    </section>
  </div>;
}
```

- [ ] **Step 4: Create `web-portal/src/components/patients/worklist/Worklist.tsx`**

```tsx
'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import LegacyPatientList from '@/components/patients/LegacyPatientList';
import { useClinicalAPI } from '@/lib/auth';
import { patientListContext, patientListQuery } from '@/lib/patient-navigation';
import { WorklistController } from '@/lib/worklist';
import WorklistView from './WorklistView';

export default function Worklist() {
  const api = useClinicalAPI();
  const controller = useMemo(() => new WorklistController((query) => api.getWorklist(query)), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [openedAt] = useState(() => new Date());
  useEffect(() => {
    const restore = () => {
      const context = patientListContext(new URLSearchParams(window.location.search));
      void controller.restore(context.filter, context.page, context.search);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('popstate', restore); controller.cancelPending(); };
  }, [controller]);
  useEffect(() => {
    if (state.status === 'ready') window.history.replaceState(null, '', '/patients?' + patientListQuery(state.page, state.search, state.filter));
  }, [state.status, state.page, state.search, state.filter]);
  // Older API without GET /worklist: keep the pre-worklist queues and list working.
  if (state.status === 'unsupported') return <LegacyPatientList />;
  return (
    <WorklistView
      state={state}
      now={state.checkedAt ?? openedAt}
      onFilter={(filter) => void controller.setFilter(filter)}
      onSearch={(search) => void controller.search(search)}
      onPage={(page) => void controller.goToPage(page)}
      onRetry={() => void controller.retry()}
    />
  );
}
```

- [ ] **Step 5: Rewrite `web-portal/src/app/patients/page.tsx`**

```tsx
'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Worklist from '@/components/patients/worklist/Worklist';

export default function PatientsPage() {
  return <DashboardLayout><Worklist /></DashboardLayout>;
}
```

- [ ] **Step 6: Keep the filter on the workspace back link**

In `web-portal/src/app/patients/[id]/page.tsx`, replace `'/patients?' + patientListQuery(context.page, context.search)` with `'/patients?' + patientListQuery(context.page, context.search, context.filter)`. Nothing else in that file changes (PR 5 owns the workspace).

- [ ] **Step 7: Run the full portal gate**

Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all tests pass (including `worklist-page`, `worklist-view`, `worklist`, `worklist-api`, `patient-navigation`, `patient-list`, PR 2's `letterpress-sweep`); lint, typecheck and build clean.

- [ ] **Step 8: Commit**

```bash
git add web-portal/src/components/patients/worklist/Worklist.tsx web-portal/src/components/patients/LegacyPatientList.tsx web-portal/src/app/patients/page.tsx "web-portal/src/app/patients/[id]/page.tsx" web-portal/tests/worklist-page.test.ts
git commit -m "portal: make the worklist the patients page, with a fallback for older APIs" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: PR 4 verification [judgment]

**Files:** none, unless a check fails (fix, then rerun only that check).

**Acceptance (defined up front):** backend and portal gates green; live probe 8/8 with cleanup; worklist renders the four counts, the three tabs and one merged table in light and dark at 1280px and 390px; keyboard focus visible on tabs, search and row actions; flagged tab reachable and labelled in words; a mocked 404 shows the legacy page; review agents clean.

- [ ] **Step 1: Gates**

Run: `cd backend && npm test && npm run build`
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 2: Live probe**

With the local stack and the worktree API on 3002 (Task 3 Step 2): `cd backend && node scripts/worklist-live.cjs`
Expected: `{"passed":true,"checks":8,"cleanup":true}`.

- [ ] **Step 3: Bounded visual pass (Playwright, one pass)**

Stop main-checkout dev servers on 3000/3001 first and restore them at the end. Start the worktree API on 3001 (`cd backend && npm run dev`) and portal on 3000 (`cd web-portal && npm run dev`). Create the UI fixture with a throwaway password the controller generates for this run: `cd backend && SECURITY_API_URL=http://127.0.0.1:3001/api WORKLIST_UI_PASSWORD=<generated, 20+ chars> node scripts/worklist-live.cjs --keep-for-ui`; it prints the synthetic clinician email. If the controller prefers not to handle the password, hand sign-in to the user for this step. With the Playwright tools on `http://localhost:3000`:
- Sign in as the printed clinician. `/patients` shows the eyebrow date, "Needs you today", four counts (Photos to review 3, Unread messages 2 in ochre, Check-ins submitted 1, Adherence under 60% 1), segmented tabs with Needs review selected, `2 OF 2`.
- Needs review: Ben first, then Ada; both rows have the rail fill and 4px bar; Ada shows `2 photos · OLDEST …D`, a 14-bar strip with `77% / 14d`, "2 unread messages" and a check-in stamp; each row has one filled 32px "Review photos" button; footer "Sorted by oldest unreviewed upload".
- Flagged: Ben with "Urgent report · 1 open", "This is not a live alert.", "Open report" goes to `/patients/<id>?page=1&filter=flagged#urgent`; the workspace "Back to patients" link returns to the Flagged tab.
- All patients + search "ada": one row; search "zz": "No patients match this name" with "Clear search".
- Keyboard: Tab from the header through Refresh, the tab triggers (arrow keys switch tabs), search and each row action; each shows the 2px ink outline.
- Dark mode (`page.emulateMedia({ colorScheme: 'dark' })` via `browser_run_code_unsafe`) and width 390px: counts wrap to two columns, the table scrolls horizontally inside its container, no page-level horizontal scroll, sparkline "none" bars still visible.
- Fallback: `browser_run_code_unsafe` with `await page.route('**/api/worklist**', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Route not found' }) }))`, reload `/patients`: "Assigned patients" with Urgent reports, Photos awaiting review and the patient table appear, no error. Remove the route.
- Record pass/fail per bullet for the PR description. Then `cd backend && node scripts/worklist-live.cjs --cleanup-ui` and confirm the cleanup PASS line.

- [ ] **Step 4: Review**

Run `care-access-reviewer` and `api-contract-checker` on the branch diff (backend worklist files, `web-portal/src/types/api.ts`, `web-portal/src/lib/api.ts`), then `/code-review`. Fix findings; rerun only the affected check.

- [ ] **Step 5: API deploy note (controller)**

The controller deploys the API before merging this PR, because the portal auto-deploys from `main`: `/ship-release` (record the rollback target with `vercel inspect`, `vercel --prod` from `backend`, check `/health` and `/ready`), then confirm the route exists in production with an unauthenticated `curl -s -o /dev/null -w '%{http_code}' https://<api host>/api/worklist?localDate=2026-09-17` → `401` (an API without the route answers `404`). Production deploy needs explicit user approval. No hosted migration is involved. The portal fallback keeps `/patients` working if the order is ever reversed.

---

## Controller notes (added at execution)

- PR 2 has merged (#18 iOS, #19 portal). Primitive names are final in `web-portal/src/components/ui/*`; trust the code over this plan's assumptions where they differ.
- Carry-in (Task 5/6): the patient search field must be a baseline-rule field (spec §4.2) without a `bg-surface` fill.
- The API is deployed by the controller before merge (owner authorized). The live check uses a throwaway local `WORKLIST_UI_PASSWORD` generated per run and never logged.
