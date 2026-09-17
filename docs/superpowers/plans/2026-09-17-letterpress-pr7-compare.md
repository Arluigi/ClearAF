# Letterpress PR 7: iOS Photo Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Compare to the iOS photo record: two of the patient's own photos side by side, overlaid (opacity slider) or flipped (tap/swipe), on a near-black mat, with a filmstrip pair picker and a "What changed in between" timeline of routine version changes, recorded days and check-in answers between the two capture dates.

**Architecture:** Compare is the third segment of Record's native segmented control. With two or more photos it presents `ComparePhotosView` full screen (no tab bar, no bottom spacer) under a forced dark scheme, so every surface is an existing Letterpress dark token. Photos come from the local Core Data store through a new `ComparePhotoStrip` that pages object IDs and capture dates 24 at a time and reads image bytes one photo at a time. The timeline comes from one additive, read-only, patient-only endpoint `GET /api/care-support/timeline` (no patient API lists routine revisions today), loaded by `CompareTimelineLoader` with a 404 fallback for an older API and a stale state. Copy and state mapping live in pure helpers (`ComparePair`, `CompareCopy`, `CompareTimeline`) tested with Swift Testing.

**Tech Stack:** SwiftUI (deployment target 18.5, Swift 5 mode), Swift Testing, Core Data (SQLite, dictionary fetches); Express + zod + Prisma query client, Node test runner.

**Spec:** `docs/design/letterpress/spec.md` (authority: §0, §2, §3, §4.1, §4.3, §4.5, §4.8, §5, §6 iOS row 6 and the tab-bar paragraph on pushed views, §7, §8). Master plan `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, Owner decisions 1–2, PR 7 roadmap row). PR 3 plan `docs/superpowers/plans/2026-09-17-letterpress-pr3-ios-core.md` (`PhotoRecordLayout`, `PhotoDetailView`, `LetterpressFormat`, `RoutineRecordCopy.lastChecked`). PR 6 plan (no shared files; see "Depends on"). Mockup `docs/design/letterpress/mobile.dc.html` screen "6 · Compare" (lines 200–273) and the Record segmented control (line 170). Spec wins over mockup.

## Global Constraints

- Master plan Global Constraints apply: no Supabase schema/RLS/table/column/RPC change; no auth/session change; routine versioning, check-in form versioning and required flags, the photo share/review state machine, existing pagination (Record's 24-photo Previous/Next pages), completion timezone handling and message reference payloads are untouched.
- Never introduce a skin score, streak, grade, adherence target line, celebration, emoji or outcome promise. **Never imply improvement from photo order** (§7): pair roles are "Earlier" and "Later" only. Check-in answers are shown as given, never averaged, scored or summarised.
- Photos are never tinted, cropped, filtered, aligned, warped, scaled beyond aspect fit or beautified. Both photos use `.resizable().scaledToFit()` inside the same 4:5 mat. The uncropped photo stays reachable: every mode has a path to the existing `PhotoDetailView`.
- Photos sit on near-black: `ComparePhotosView` applies `.preferredColorScheme(.dark)`, so `Letterpress.canvas` (#171716) and `Letterpress.surface` (#1F201E) are the backgrounds and every text token is one the PR 1 contrast tests already verify in dark. **No new colour values.** Never set `inkFuture` text on `sunk` or `attentionWash`.
- No glass on Compare (§4.8: never over a photograph being judged). The native tab bar is not shown (full-screen cover).
- Ochre: only the stale `Last checked` eyebrow (`attentionText`, PR 3 ruling on §5). Errors use `Letterpress.error`.
- One filled ink button per screen: Compare itself has none (read-only); the Compare empty state in Record has "Take a photo".
- iOS buttons use `.buttonStyle(.letterpress(...))` (pinned 44pt). Mode switch uses `LetterpressPicker` (native segmented, menu at accessibility sizes). Rules use `LetterpressRule`, eyebrows `.letterpressEyebrow()`, spacing `Letterpress.Space.*`. Hit targets ≥ 44pt.
- Reduce Motion: every `.animation(` in `CompareView.swift` is written `.animation(reduceMotion ? nil : …)`; no `withAnimation`. Flip is a crossfade, never a 3D rotation (a rotation warps the photo).
- Largest Dynamic Type: side-by-side stacks vertically, row date columns stack above text, thumbnail labels are never truncated, every multi-line `Text` uses `.fixedSize(horizontal: false, vertical: true)`.
- Access: the new endpoint is `requirePatient` and scoped to `req.user.id`; the client checks every returned row belongs to the signed-in account and drops results from a replaced `AccountAccess.Ticket`. Photo bytes are read only from the signed-in account's context (`userInfo["accountID"]`).
- Two clients, one contract: the endpoint is additive and iOS-only; it reuses the existing `CareRoutineRevision` and `CheckInResponse` shapes. The portal (`web-portal/src/types/api.ts`) is unaffected. Reviewers for Tasks 1–2: `api-contract-checker` and `care-access-reviewer`.
- The PR 2 sweep test `ClearAFTests/LetterpressSweepTests.swift` stays green (no hue names, no `.shadow(`, no `cornerRadius:` numbers, no `.foregroundStyle(.secondary)`).
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`.
- iOS test command (**TEST** below, suites appended as `-only-testing:ClearAFTests/<Suite>`):
  ```bash
  xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
    -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
    -derivedDataPath /tmp/clearaf-build-lp7 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
    -only-testing:ClearAFTests/<Suite> test | xcbeautify
  ```
- Backend single file: `cd backend && node --import tsx --test tests/<file>`; backend gate: `cd backend && npm test && npm run build`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Depends on

- PR 2 (merged): `Letterpress.*` tokens, `Letterpress.Space`, `Letterpress.minTouch`, `LetterpressPicker(title:selection:options:)`, `.letterpress(.filled|.outlined|.underline, fullWidth:)`, `LetterpressRule`, `.letterpressEyebrow(color:)`, `PhotoImageLoader(byteLimit:countLimit:)` with `image(data:key:maxPixelSize:)` and `contains(key:maxPixelSize:)`, test helper `LetterpressSweepTests.repoRoot`.
- PR 3 (merged before this PR): `enum PhotoRecordLayout: Hashable { case grid, list }` and the Record screen in `ClearAF/Views/ProgressView.swift` exactly as committed at `7bd405d`; `PhotoDetailView(photo:images:reviewed:)`; `LetterpressFormat.stamp/stampTime/dayMonthYear`; `RoutineRecordCopy.lastChecked(_:)`; `DurablePhotoCaptureView()`.
- PR 5 adds `GET /api/routines/patients/:patientId/revisions` (clinician) in `routineCare.ts`/`routes/routines.ts`; this PR touches neither file. PR 6 changes no file this PR touches.
- Branch `design/letterpress-7-compare` from `main` after PR 6 merges. If a PR 3 name above differs in the merged code, use the merged name and keep the behaviour.

## Decisions made while planning

1. **An additive endpoint is needed.** The patient API returns only the latest routine revision per slot (`GET /routines`), completion events only for revisions that were completed, and no revision history (`deferred.md` already lists "No patient API lists previous routine versions"). One composed read replaces what would otherwise be up to 36 calendar-month calls plus response paging: `GET /api/care-support/timeline?from=&to=&timeZone=` (contract below).
2. **Compare presents full screen.** Selecting the Compare segment with ≥ 2 photos presents `ComparePhotosView` as a `fullScreenCover`; "Done" dismisses and the segment returns to the layout that was showing. This matches the mockup's Done header and §6's "pushed detail views (compare) have no tab bar, no bottom spacer". With 0 or 1 photos the segment shows an inline empty state in Record with one filled action ("Take a photo"); the cover never opens while the camera sheet is up, and closing the camera sheet returns the segment to Grid/List.
3. **Pair picker.** A horizontal filmstrip, newest first, loads the next 24 photos when its last thumbnail appears. Tapping a thumbnail adds it to the pair (the oldest pick drops out past two); tapping a picked one removes it. The pair is always shown earlier first, by capture date (ties keep pick order; an undated photo counts as earliest). The default pair is the newest photo and the one before it (same default as the portal in PR 5). Picked thumbnails get a 1.5pt inset ink outline and the words `EARLIER`/`LATER`/`SELECTED` under them (never colour alone).
4. **Memory.** `ComparePhotoStrip` fetches `NSDictionary` rows (object ID + capture date) so no `SkinPhoto` or image bytes stay registered; bytes are read per photo with a one-row dictionary fetch and decoded into two bounded `PhotoImageLoader`s (thumbnails 160px, stage 1600px, 4 entries). Record's `PhotoPageStore` is untouched.
5. **Modes.** Side by side: two panes in one row (stacked at accessibility sizes), each a button opening the photo in `PhotoDetailView`. Overlay: both photos in one mat, later photo on top at the slider's opacity (default 50%), with "Open earlier photo" / "Open later photo". Flip: both photos in one mat, crossfading on tap or a horizontal swipe ≥ 44pt; VoiceOver gets one button element whose label names the shown photo; "Open this photo" opens the shown one. Mode changes and the flip crossfade animate only when Reduce Motion is off.
6. **Timeline rows** (`CompareTimeline.rows`): first one summary row per routine slot that existed in the period ("Morning routine recorded on 11 of 14 days", "No evening routine recorded in these 14 days", "… that day" for a same-day pair), dated with the local range (`2–15 SEP`); then routine revisions ("Morning routine updated to v4", "… assigned · v1", "… archived · v5") and check-ins ("Check-in sent" with each answered question's prompt and the answer as given: text in quotes, choice as its label) in time order; then "Showing the first 50 of 73 check-ins from this period." when truncated. Completion counts are server-recorded completions only, like the calendar. Under each photo in side-by-side: the active versions at that moment (`MORNING V3 · EVENING V2`).
7. **States.** A 404 from the endpoint (an API deployed before this PR) shows "What changed in between isn't available from the server yet. Your photos can still be compared." and nothing else changes. Pairs more than 1096 days apart show a sentence instead of calling the API. A failed re-check of a pair already loaded this session keeps the last answer with an `attentionText` `LAST CHECKED 8:40 AM` eyebrow and an underline "Try again".
8. **Omitted (owner decision 1), recorded in `deferred.md`:** the mockup's "Share" (no way to share clinical photos outside the record exists, and adding one is a data-handling change) and "by Dr. Om" on routine changes (revisions store an author ID, not a name).

### Nine states (§5) for Compare

| State | Where | Treatment / copy |
|---|---|---|
| Loading | filmstrip, timeline | "Loading your photos" (strip, while `loading`); "Loading what changed in between"; stage keeps its 4:5 mat while images decode |
| Empty | Record with < 2 photos; timeline with no rows | Serif "Two photos needed" + one sentence + filled "Take a photo"; "Nothing was recorded between these two photos." |
| Populated | stage, strip, timeline | Photos first, mono stamps below |
| Selected | strip, mode picker | Inset 1.5pt ink outline + `EARLIER`/`LATER`/`SELECTED`; native segmented selection |
| Disabled | mode picker | Disabled until two photos are picked + "Pick two photos to choose how to compare them." |
| Saving | — | Not applicable: Compare writes nothing. "Take a photo" opens the existing capture flow, which owns saving |
| Success | — | Not applicable (no write). A loaded timeline is the populated state |
| Error | strip, image, timeline | "Photos could not be loaded. Please try again." + Try again; "This photo couldn't be opened on this device."; "Couldn't load what changed in between. Your photos are still here." + Try again |
| Stale / offline | timeline | `attentionText` eyebrow "Last checked 8:40 am" over the kept rows + underline "Try again"; 404 → "isn't available from the server yet" |

### Spec contradictions and rulings

- Mockup "Share" and "by Dr. Om": omitted (Decision 8).
- Mockup filmstrip thumbnails are 38×46pt: below the 44pt touch floor (§8). Thumbnails are 60×75pt (88×110 at accessibility sizes).
- Mockup "Recorded 11 of 14 mornings": rewritten to §7's form "Morning routine recorded on 11 of 14 days".
- Mockup background #131413 is not a token: the forced dark scheme's `canvas` (#171716) and `surface` mat (#1F201E) are used instead (no new colour values).
- §6 says compare is a "pushed" detail view; the mockup's Done header is a modal. A full-screen cover satisfies both rules that matter (no tab bar, no bottom spacer) and keeps a segment from pushing navigation.
- Mockup "Done" is plain text; §4.1 has no plain-text button, so it is the underline variant.

## API contract (Task 1)

`GET /api/care-support/timeline?from=<ISO instant>&to=<ISO instant>&timeZone=<IANA>`

- Auth: `authenticateToken` (mount) + `requirePatient`; data is always `req.user.id`'s. Not enrollment-gated (read-only, like `/care-support/calendar`). Clinicians get 403 `INSUFFICIENT_PERMISSIONS`.
- Query (strict, unknown keys → 400): `from`, `to` ISO 8601 with offset (≤ 40 chars, real calendar date), `from ≤ to`, `to − from ≤ 1096 days`; `timeZone` an IANA name (offset strings like `+05:30` rejected).
- 200:
  ```ts
  {
    fromDate: string;               // YYYY-MM-DD, `from` in timeZone
    toDate: string;                 // YYYY-MM-DD, `to` in timeZone
    days: number;                   // inclusive count of local dates fromDate..toDate
    routinesAtFrom: RoutineRevision[]; // latest revision per slot created at or before `from` (0–2, morning first)
    routinesAtTo: RoutineRevision[];   // same at `to`
    revisions: RoutineRevision[];      // created after `from` and at or before `to`, ascending by createdAt
    completions: { morning: number; evening: number }; // distinct local dates in fromDate..toDate with a recorded completion of that slot
    responses: CheckInResponse[];      // submitted after `from` and at or before `to`, ascending by submittedAt, at most 50, each with `form`
    responsesTotal: number;            // all responses in that window
  }
  ```
  `RoutineRevision` = existing `{ id userId timeOfDay version createdBy createdAt name isActive steps }`; `CheckInResponse` = existing `{ id userId formId submittedAt receivedAt answers form }`.
- Errors: 400 `VALIDATION_ERROR`, 401, 403 `INSUFFICIENT_PERMISSIONS`, 500 `ROUTINE_ERROR` ("Care support operation failed"). An API without the route answers 404 `{ error: 'Route not found' }`; iOS treats any 404 from this endpoint as "not available yet".

## File map

| File | Task | Responsibility |
|---|---|---|
| `backend/src/services/careSupportValidation.ts` | 1 | `timelineQuery`, `timelineMaxDays`, `localDateIn`, `daySpan` |
| `backend/src/services/careSupport.ts` | 1 | `timeline(userId, query)` |
| `backend/src/routes/care-support.ts` | 1 | Thin patient-only GET route |
| `backend/tests/care-support.test.ts`, `backend/tests/care-support-service.test.ts` | 1 | Validation tests; route tests (range-aware mock matcher) |
| `ClearAF/Services/CompareTimelineModels.swift` | 2 | `CompareTimelineResponse`, `CompareTimelineTransport`, `CompareTimelineQuery` |
| `ClearAF/Services/CompareTimelineLoader.swift` | 2 | Load, cache, stale, unavailable, account checks |
| `ClearAF/Services/APIService.swift` | 2 | `APIService: CompareTimelineTransport` |
| `ClearAFTests/CompareTimelineTests.swift` | 2 | Decoding, validation, query, loader states |
| `ClearAF/Views/CompareCopy.swift` | 3 | `CompareMode`, `CompareRole`, `ComparePair`, `CompareCopy`, `CompareTimelineRow`, `CompareTimeline` |
| `ClearAFTests/CompareCopyTests.swift` | 3 | Pair rules, copy, timeline rows |
| `ClearAF/Services/ComparePhotoStrip.swift` | 4 | `ComparePhoto`, paged IDs + dates, per-photo bytes, image caches |
| `ClearAFTests/ComparePhotoStripTests.swift` | 4 | Paging, no retained bytes, account guard |
| `ClearAF/Views/CompareView.swift` | 5 | `ComparePhotosView`, `CompareEmptyState`, mat, image, thumbnail, timeline row |
| `ClearAFTests/CompareViewSourceTests.swift` | 5 | Untouched photos, Reduce Motion, dark, no Share, one filled button |
| `ClearAF/Views/ProgressView.swift`, `ClearAF/Views/PhotoRecordDisplay.swift` | 6 | Third segment, empty state, full-screen cover |
| `ClearAFTests/CompareRecordEntryTests.swift` | 6 | Segment routing and wiring |
| `docs/design/letterpress/deferred.md` | 6 | Share, clinician byline |

---

### Task 1: Read-only patient timeline endpoint [judgment]

Reviewers after this task: `care-access-reviewer` (patient-only, own `userId` on every query, lock pattern same as `/care-support/calendar`, no clinician path) and `api-contract-checker` (new endpoint only; `RoutineRevision` and `CheckInResponse` shapes reused; iOS model lands in Task 2; portal unaffected).

**Files:**
- Modify: `backend/src/services/careSupportValidation.ts` (append)
- Modify: `backend/src/services/careSupport.ts` (import, append `timeline`)
- Modify: `backend/src/routes/care-support.ts` (import, one route)
- Test: `backend/tests/care-support.test.ts` (import line, append two tests)
- Test: `backend/tests/care-support-service.test.ts` (replace the `matches` line, append two tests)

**Interfaces:**
- Consumes: `lockPatient(tx, userId)`, `prisma`, `careError` (existing in `careSupport.ts`); `requirePatient`; the service-test harness (`call(path, identity)`, `revisions`, `completions`, `forms`, `responses` arrays, `question`, identities `A`/`B` patients, `C`/`D` clinicians).
- Produces: `timelineQuery` (zod), `timelineMaxDays = 1096`, `localDateIn(instant: Date, timeZone: string): string`, `daySpan(fromDate: string, toDate: string): number`; `timeline(userId: string, query: z.infer<typeof timelineQuery>)`; route per **API contract**.

- [ ] **Step 1: Write the failing validation tests** — `backend/tests/care-support.test.ts`

Replace the import line

```ts
import {formInput,responseInput,validateAnswers,monthInput,monthBounds} from '../src/services/careSupportValidation';
```

with

```ts
import {formInput,responseInput,validateAnswers,monthInput,monthBounds,timelineQuery,localDateIn,daySpan} from '../src/services/careSupportValidation';
```

and append:

```ts
test('timeline query needs ordered ISO instants at most 1096 days apart and an IANA zone',()=>{
 const ok={from:'2026-09-02T07:04:00.000Z',to:'2026-09-15T07:12:00.000Z',timeZone:'America/New_York'};
 assert.equal(timelineQuery.safeParse(ok).success,true);
 assert.equal(timelineQuery.safeParse({...ok,to:ok.from}).success,true,'a same-instant pair is allowed');
 for(const patch of [{to:'2026-09-01T00:00:00.000Z'},{from:'2023-09-01T00:00:00.000Z'},{from:'2026-02-30T00:00:00Z'},{from:'yesterday'},{timeZone:'+05:30'},{timeZone:'Mars/Olympus'},{timeZone:''},{extra:'1'}])
  assert.equal(timelineQuery.safeParse({...ok,...patch}).success,false,JSON.stringify(patch));
 assert.equal(timelineQuery.safeParse({from:ok.from,to:ok.to}).success,false,'timeZone is required');
});
test('timeline local dates follow the requested zone and day spans are inclusive',()=>{
 assert.equal(localDateIn(new Date('2026-09-02T20:00:00Z'),'Asia/Kolkata'),'2026-09-03');
 assert.equal(localDateIn(new Date('2026-09-02T03:00:00Z'),'America/Los_Angeles'),'2026-09-01');
 assert.equal(daySpan('2026-09-02','2026-09-15'),14);
 assert.equal(daySpan('2026-09-15','2026-09-15'),1);
 assert.equal(daySpan('2024-02-28','2024-03-01'),3);
});
```

- [ ] **Step 2: Write the failing route tests** — `backend/tests/care-support-service.test.ts`

Replace the line

```ts
const matches=(r:any,w:any):boolean=>Object.entries(w||{}).every(([k,v]:any)=>typeof v==='object'&&v!==null?matches(r,v):r[k]===v);
```

with (adds Prisma range filters `gt/gte/lt/lte` to the in-memory mock; every existing where clause behaves as before):

```ts
const isRange=(v:any)=>typeof v==='object'&&v!==null&&!(v instanceof Date)&&Object.keys(v).length>0&&Object.keys(v).every(k=>['gt','gte','lt','lte'].includes(k));
const inRange=(value:any,cond:any)=>Object.entries(cond).every(([op,bound]:any)=>op==='gt'?value>bound:op==='gte'?value>=bound:op==='lt'?value<bound:value<=bound);
const matches=(r:any,w:any):boolean=>Object.entries(w||{}).every(([k,v]:any)=>isRange(v)?inRange(r[k],v):typeof v==='object'&&v!==null?matches(r,v):r[k]===v);
```

Append:

```ts
function seedTimeline(){
 const at=(iso:string)=>new Date(iso);
 const m1={id:randomUUID(),userId:A,timeOfDay:'morning',version:1,createdBy:C,createdAt:at('2026-08-20T09:00:00Z'),name:'Synthetic morning',isActive:true,steps:[]};
 const m2={...m1,id:randomUUID(),version:2,createdAt:at('2026-09-05T09:00:00Z')};
 const e1={...m1,id:randomUUID(),timeOfDay:'evening',createdAt:at('2026-09-20T09:00:00Z')};
 const other={...m1,id:randomUUID(),userId:B,createdBy:D,createdAt:at('2026-09-06T09:00:00Z')};
 revisions.push(m1,m2,e1,other);
 const done=(revisionId:string,localDate:string,userId=A)=>completions.push({id:randomUUID(),userId,revisionId,localDate,completedAt:at(`${localDate}T07:00:00Z`),timeZone:'UTC',receivedAt:new Date()});
 done(m1.id,'2026-09-01');done(m1.id,'2026-09-02');done(m1.id,'2026-09-03');done(m2.id,'2026-09-05');done(m2.id,'2026-09-15');done(m2.id,'2026-09-16');done(other.id,'2026-09-04',B);
 const form={id:randomUUID(),userId:A,version:1,createdBy:C,createdAt:at('2026-08-01T00:00:00Z'),title:'Neutral form',isActive:true,questions:[question]};
 forms.push(form);
 const reply=(submittedAt:string,userId=A)=>responses.push({id:randomUUID(),userId,formId:form.id,submittedAt:at(submittedAt),receivedAt:at(submittedAt),answers:[{questionId:question.id,optionId:question.options[1].id}]});
 reply('2026-09-01T12:00:00Z');reply('2026-09-14T12:00:00Z');reply('2026-09-10T12:00:00Z');reply('2026-09-16T12:00:00Z');reply('2026-09-12T12:00:00Z',B);
 return {m1,m2,other};
}
test('timeline returns only the patient\'s own versions, recorded days and check-ins between two instants',async()=>{
 const {m1,m2,other}=seedTimeline();
 const r=await call('/timeline?from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC');
 assert.equal(r.status,200);
 assert.deepEqual([r.body.fromDate,r.body.toDate,r.body.days],['2026-09-02','2026-09-15',14]);
 assert.deepEqual(r.body.routinesAtFrom.map((x:any)=>x.id),[m1.id]);
 assert.deepEqual(r.body.routinesAtTo.map((x:any)=>x.id),[m2.id]);
 assert.deepEqual(r.body.revisions.map((x:any)=>x.id),[m2.id]);
 assert.deepEqual(r.body.completions,{morning:4,evening:0});
 assert.deepEqual(r.body.responses.map((x:any)=>x.submittedAt),['2026-09-10T12:00:00.000Z','2026-09-14T12:00:00.000Z']);
 assert.equal(r.body.responses[0].form.title,'Neutral form');
 assert.equal(r.body.responsesTotal,2);
 const shifted=await call('/timeline?from=2026-09-02T20:00:00.000Z&to=2026-09-15T20:00:00.000Z&timeZone=Asia/Kolkata');
 assert.deepEqual([shifted.body.fromDate,shifted.body.toDate,shifted.body.days],['2026-09-03','2026-09-16',14]);
 assert.deepEqual(shifted.body.completions,{morning:4,evening:0});
 const b=await call('/timeline?from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC',B);
 assert.deepEqual(b.body.revisions.map((x:any)=>x.id),[other.id]);
 assert.deepEqual(b.body.completions,{morning:1,evening:0});
 assert.equal(b.body.responsesTotal,1);
});
test('timeline rejects clinicians and invalid queries before reading records',async()=>{
 seedTimeline();
 const q='from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC';
 assert.equal((await call('/timeline?'+q,C)).status,403);
 assert.equal((await call(`/patients/${A}/timeline?`+q,C)).status,404,'no clinician twin');
 for(const query of ['',q.replace('timeZone=UTC','timeZone=%2B05:30'),q+'&page=2','from=2026-09-15T07:12:00.000Z&to=2026-09-02T07:04:00.000Z&timeZone=UTC','from=2020-01-01T00:00:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC'])
  assert.equal((await call('/timeline?'+query)).status,400,query);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && node --import tsx --test tests/care-support.test.ts tests/care-support-service.test.ts`
Expected: FAIL — `timelineQuery` is undefined (`Cannot read properties of undefined (reading 'safeParse')`); the route tests get 404 instead of 200/403/400. Existing tests pass.

- [ ] **Step 4: Add validation helpers** — append to `backend/src/services/careSupportValidation.ts`

```ts
// Compare timeline (iOS): two capture instants and the device zone that turns them into local dates.
export const timelineMaxDays=1096;
const instantInput=z.string().max(40).datetime({offset:true}).refine(v=>validDate(v.slice(0,10))&&Number.isFinite(Date.parse(v)),'Invalid timestamp');
const zoneInput=z.string().min(1).max(100).refine(zone=>{if(/^[+-]/.test(zone))return false;try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return true}catch{return false}},'Invalid IANA timezone');
export const timelineQuery=z.object({from:instantInput,to:instantInput,timeZone:zoneInput}).strict().superRefine((v,c)=>{const from=Date.parse(v.from),to=Date.parse(v.to);if(from>to)c.addIssue({code:'custom',path:['to'],message:'to must not be before from'});else if(to-from>timelineMaxDays*86400000)c.addIssue({code:'custom',path:['to'],message:'Range is too long'})});
export function localDateIn(instant:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);const part=(type:string)=>parts.find(p=>p.type===type)?.value;return `${part('year')}-${part('month')}-${part('day')}`}
export function daySpan(fromDate:string,toDate:string){return Math.round((Date.parse(`${toDate}T00:00:00Z`)-Date.parse(`${fromDate}T00:00:00Z`))/86400000)+1}
```

- [ ] **Step 5: Add the service** — `backend/src/services/careSupport.ts`

Change the validation import to:

```ts
import {formInput,responseInput,validateAnswers,questionInput,monthBounds,timelineQuery,localDateIn,daySpan} from './careSupportValidation';
```

Append:

```ts
const TIMELINE_RESPONSES=50;
/** Compare timeline for the signed-in patient only: versions in force at each capture, versions saved in between, recorded days and check-ins. Read-only. */
export async function timeline(userId:string,query:z.infer<typeof timelineQuery>){return prisma.$transaction(async tx=>{
 await lockPatient(tx,userId);
 const from=new Date(query.from),to=new Date(query.to);
 const fromDate=localDateIn(from,query.timeZone),toDate=localDateIn(to,query.timeZone);
 // Revisions are clinician-authored and few per patient; one ordered read serves "in force at" and "saved between".
 const known=await tx.careRoutineRevision.findMany({where:{userId,createdAt:{lte:to}},orderBy:[{createdAt:'asc'},{version:'asc'}]});
 const inForce=(instant:Date)=>['morning','evening'].flatMap(slot=>{const saved=known.filter(r=>r.timeOfDay===slot&&r.createdAt.getTime()<=instant.getTime());return saved.length?[saved[saved.length-1]]:[]});
 const done=await tx.careRoutineCompletion.findMany({where:{userId,localDate:{gte:fromDate,lte:toDate}},include:{routine:true}});
 const recorded=(slot:string)=>new Set(done.filter(c=>c.routine.timeOfDay===slot).map(c=>c.localDate)).size;
 const window={userId,submittedAt:{gt:from,lte:to}};
 const responsesTotal=await tx.careFormResponse.count({where:window});
 const responses=await tx.careFormResponse.findMany({where:window,include:{form:true},orderBy:[{submittedAt:'asc'},{id:'asc'}],take:TIMELINE_RESPONSES});
 return {fromDate,toDate,days:daySpan(fromDate,toDate),routinesAtFrom:inForce(from),routinesAtTo:inForce(to),revisions:known.filter(r=>r.createdAt.getTime()>from.getTime()),completions:{morning:recorded('morning'),evening:recorded('evening')},responses,responsesTotal};
})}
```

- [ ] **Step 6: Add the route** — `backend/src/routes/care-support.ts`

Change the validation import to:

```ts
import {dayInput,monthInput,formInput,responseInput,timelineQuery} from '../services/careSupportValidation';
```

Directly before the `for(const clinician of [false,true]){` line add:

```ts
router.get('/timeline',requirePatient,route(async(req,res)=>{res.json(await care.timeline(req.user!.id,timelineQuery.parse(req.query)))}));
```

- [ ] **Step 7: Run tests and build**

Run: `cd backend && node --import tsx --test tests/care-support.test.ts tests/care-support-service.test.ts`
Expected: PASS (all tests, including the four new ones).
Run: `cd backend && npm test && npm run build`
Expected: every test passes; `tsc` exits 0.

- [ ] **Step 8: Review, then commit**

Run the `care-access-reviewer` and `api-contract-checker` agents on the diff (brief: new patient-only read endpoint per this task's API contract; iOS client lands in Task 2). Fix findings, rerun Step 7's first command.

```bash
git add backend/src/services/careSupportValidation.ts backend/src/services/careSupport.ts backend/src/routes/care-support.ts backend/tests/care-support.test.ts backend/tests/care-support-service.test.ts
git commit -m "api: read-only patient timeline between two capture instants" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: iOS timeline model, transport and loader [judgment]

Reviewers after this task: `api-contract-checker` (Codable model vs Task 1 response) and `care-access-reviewer` (owner checks, ticket checks, no cross-account cache).

**Files:**
- Create: `ClearAF/Services/CompareTimelineModels.swift`
- Create: `ClearAF/Services/CompareTimelineLoader.swift`
- Modify: `ClearAF/Services/APIService.swift` (append an extension at the end of the file)
- Test: create `ClearAFTests/CompareTimelineTests.swift`

**Interfaces:**
- Consumes: `CareRoutineRevision`, `CheckInResponse`, `CheckInValidation.form/answers`, `RoutineDates.instant/timestamp`, `SupportDates.days`, `RoutineFailure.invalidData`, `AccountAccess` (`Ticket`, `require`, `activate`), `AccountFailure.requestFailed(Int)`, `APIService.request(endpoint:method:body:ticket:)` (private, same file).
- Produces:
  - `struct CompareTimelineResponse: Decodable` — `fromDate, toDate: String`, `days: Int`, `routinesAtFrom, routinesAtTo, revisions: [CareRoutineRevision]`, `completions: Recorded` (`struct Recorded: Decodable, Equatable { morning, evening: Int }`), `responses: [CheckInResponse]`, `responsesTotal: Int`.
  - `@MainActor protocol CompareTimelineTransport { func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse }`.
  - `enum CompareTimelineQuery` — `maxDays = 1096`, `endpoint(from: Date, to: Date, zoneIdentifier: String) -> String`, `valid(_: CompareTimelineResponse, owner: UUID) -> Bool`.
  - `@MainActor final class CompareTimelineLoader: ObservableObject` — `enum State: Equatable { case idle, loading, ready(checkedAt: Date, stale: Bool), unavailable, tooFarApart, failed }`, `@Published state`, `@Published response: CompareTimelineResponse?`, `init(access:transport:now:)`, `load(from:to:timeZone:ticket:) async`, `clear()`, `cancel()`.
  - Test fixture `CompareTimelineTests.json(owner:days:morning:) -> Data`, `CompareTimelineTests.date(_:) -> Date`, `CompareTimelineTests.owner` (Task 3 reuses them).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/CompareTimelineTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

@MainActor struct CompareTimelineTests {
    static let owner = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!

    static func date(_ value: String) -> Date { RoutineDates.instant(value)! }

    /// The Task 1 response shape with synthetic, neutral content.
    static func json(owner: UUID = owner, days: Int = 14, morning: Int = 11) -> Data {
        let o = owner.uuidString.lowercased()
        return """
        {"fromDate":"2026-09-02","toDate":"2026-09-15","days":\(days),
         "routinesAtFrom":[{"id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","userId":"\(o)","timeOfDay":"morning","version":3,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-08-20T09:00:00.000Z","name":"Synthetic morning","isActive":true,"steps":[{"title":"Synthetic step","instructions":"Synthetic instructions"}]}],
         "routinesAtTo":[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","userId":"\(o)","timeOfDay":"morning","version":4,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-09-02T09:00:00.000Z","name":"Synthetic morning","isActive":true,"steps":[{"title":"Synthetic step","instructions":"Synthetic instructions"}]}],
         "revisions":[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","userId":"\(o)","timeOfDay":"morning","version":4,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-09-02T09:00:00.000Z","name":"Synthetic morning","isActive":true,"steps":[{"title":"Synthetic step","instructions":"Synthetic instructions"}]}],
         "completions":{"morning":\(morning),"evening":0},
         "responses":[{"id":"88888888-8888-4888-8888-888888888888","userId":"\(o)","formId":"ffffffff-ffff-4fff-8fff-ffffffffffff","submittedAt":"2026-09-14T12:00:00.000Z","receivedAt":"2026-09-14T12:00:01.000Z",
           "answers":[{"questionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","optionId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},{"questionId":"99999999-9999-4999-8999-999999999999","text":"Synthetic note about the chin"}],
           "form":{"id":"ffffffff-ffff-4fff-8fff-ffffffffffff","userId":"\(o)","version":1,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-08-01T00:00:00.000Z","title":"Weekly check-in","isActive":true,
             "questions":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","prompt":"Pick one","type":"choice","required":true,"options":[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","label":"Neutral first"},{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","label":"Neutral second"}]},
                          {"id":"99999999-9999-4999-8999-999999999999","prompt":"Anything else?","type":"text","required":false,"options":[]}]}}],
         "responsesTotal":1}
        """.data(using: .utf8)!
    }

    @Test func decodesTheEndpointShapeAndAcceptsOnlyTheOwnersRecords() throws {
        let response = try JSONDecoder().decode(CompareTimelineResponse.self, from: Self.json())
        #expect(response.days == 14 && response.completions == .init(morning: 11, evening: 0))
        #expect(response.routinesAtFrom.map(\.version) == [3] && response.routinesAtTo.map(\.version) == [4] && response.revisions.map(\.version) == [4])
        #expect(response.responses.first?.answers.count == 2 && response.responsesTotal == 1)
        #expect(CompareTimelineQuery.valid(response, owner: Self.owner))
        #expect(!CompareTimelineQuery.valid(response, owner: UUID()), "another account's rows are rejected")
        let impossible = try JSONDecoder().decode(CompareTimelineResponse.self, from: Self.json(morning: 15))
        #expect(!CompareTimelineQuery.valid(impossible, owner: Self.owner), "more recorded days than days in the period")
    }

    @Test func queryCarriesInstantsAndAnEncodedZone() {
        let from = Self.date("2026-09-02T07:04:00.000Z"), to = Self.date("2026-09-15T07:12:00.000Z")
        #expect(CompareTimelineQuery.endpoint(from: from, to: to, zoneIdentifier: "America/New_York")
            == "/care-support/timeline?from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=America/New_York")
        #expect(CompareTimelineQuery.endpoint(from: from, to: to, zoneIdentifier: "Etc/GMT+5").hasSuffix("timeZone=Etc/GMT%2B5"),
                "a literal + would reach the server as a space")
    }

    @Test func loaderPublishesFreshThenStaleThenFailedThenUnavailable() async {
        let access = AccountAccess(), ticket = access.activate(Self.owner)
        let fake = TimelineFake()
        let checked = Date(timeIntervalSince1970: 1_789_000_000)
        let loader = CompareTimelineLoader(access: access, transport: fake, now: { checked })
        let from = Self.date("2026-09-02T07:04:00.000Z"), to = Self.date("2026-09-15T07:12:00.000Z")
        #expect(loader.state == .idle)
        await loader.load(from: from, to: to, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .ready(checkedAt: checked, stale: false))
        #expect(loader.response?.days == 14)
        fake.result = .failure(URLError(.notConnectedToInternet))
        await loader.load(from: from, to: to, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .ready(checkedAt: checked, stale: true), "a failed re-check keeps the last answer and marks it stale")
        #expect(loader.response?.days == 14)
        let other = Self.date("2026-09-10T07:00:00.000Z")
        await loader.load(from: from, to: other, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .failed)
        #expect(loader.response?.days == nil)
        fake.result = .failure(AccountFailure.requestFailed(404))
        await loader.load(from: from, to: other, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .unavailable, "an API without the route is not an error")
        #expect(fake.calls == 4)
        loader.cancel()
        #expect(loader.state == .idle && loader.response?.days == nil)
    }

    @Test func loaderRefusesLongRangesForeignRecordsAndReplacedTickets() async {
        let access = AccountAccess(), ticket = access.activate(Self.owner)
        let fake = TimelineFake()
        let loader = CompareTimelineLoader(access: access, transport: fake)
        await loader.load(from: Self.date("2020-01-01T00:00:00.000Z"), to: Self.date("2026-09-15T00:00:00.000Z"), timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .tooFarApart)
        #expect(fake.calls == 0)
        let start = Self.date("2026-09-02T07:04:00.000Z"), end = Self.date("2026-09-15T07:12:00.000Z")
        fake.result = .success(Self.json(owner: UUID()))
        await loader.load(from: start, to: end, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .failed, "another account's rows are never shown")
        fake.result = .success(Self.json())
        _ = access.activate(UUID())
        await loader.load(from: start, to: end, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .failed)
        #expect(fake.calls == 1, "a replaced ticket never reaches the network")
    }
}

@MainActor private final class TimelineFake: CompareTimelineTransport {
    var result: Result<Data, Error> = .success(CompareTimelineTests.json())
    var calls = 0
    func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse {
        calls += 1
        return try JSONDecoder().decode(CompareTimelineResponse.self, from: try result.get())
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: **TEST** with `-only-testing:ClearAFTests/CompareTimelineTests`
Expected: build FAIL — `cannot find type 'CompareTimelineResponse' in scope`.

- [ ] **Step 3: Create `ClearAF/Services/CompareTimelineModels.swift`**

```swift
import Foundation

/// `GET /care-support/timeline` (additive, patient-only, read-only): what the record holds between two capture instants.
struct CompareTimelineResponse: Decodable {
    struct Recorded: Decodable, Equatable {
        let morning: Int
        let evening: Int
    }

    let fromDate: String
    let toDate: String
    let days: Int
    let routinesAtFrom: [CareRoutineRevision]
    let routinesAtTo: [CareRoutineRevision]
    let revisions: [CareRoutineRevision]
    let completions: Recorded
    let responses: [CheckInResponse]
    let responsesTotal: Int
}

@MainActor protocol CompareTimelineTransport {
    func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse
}

enum CompareTimelineQuery {
    /// Same bound as the server's `timelineMaxDays`.
    static let maxDays = 1096

    static func endpoint(from: Date, to: Date, zoneIdentifier: String) -> String {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "from", value: RoutineDates.timestamp(from)),
            URLQueryItem(name: "to", value: RoutineDates.timestamp(to)),
            URLQueryItem(name: "timeZone", value: zoneIdentifier),
        ]
        // URLComponents leaves "+" alone in a query; Express would read it as a space.
        let query = (components.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B")
        return "/care-support/timeline?\(query)"
    }

    /// Every row must belong to the signed-in patient and every count must be possible for the period.
    static func valid(_ response: CompareTimelineResponse, owner: UUID) -> Bool {
        let routines = response.routinesAtFrom + response.routinesAtTo + response.revisions
        return (1...(maxDays + 2)).contains(response.days)
            && SupportDates.days(String(response.fromDate.prefix(7))).contains(response.fromDate)
            && SupportDates.days(String(response.toDate.prefix(7))).contains(response.toDate)
            && (0...response.days).contains(response.completions.morning)
            && (0...response.days).contains(response.completions.evening)
            && response.responsesTotal >= response.responses.count
            && routines.allSatisfy { $0.userId == owner && RoutineDates.instant($0.createdAt) != nil }
            && response.responses.allSatisfy {
                $0.userId == owner && $0.form.id == $0.formId && CheckInValidation.form($0.form, owner: owner)
                    && CheckInValidation.answers($0.answers, questions: $0.form.questions) && RoutineDates.instant($0.submittedAt) != nil
            }
    }
}
```

- [ ] **Step 4: Create `ClearAF/Services/CompareTimelineLoader.swift`**

```swift
import Combine
import Foundation

/// Loads "What changed in between" for one pair. A 404 means the API predates the endpoint; a failed re-check of a
/// pair already loaded keeps that answer and marks it stale. Results are keyed by account, so nothing crosses accounts.
@MainActor final class CompareTimelineLoader: ObservableObject {
    enum State: Equatable {
        case idle, loading, ready(checkedAt: Date, stale: Bool), unavailable, tooFarApart, failed
    }

    @Published private(set) var state = State.idle
    @Published private(set) var response: CompareTimelineResponse?
    private let access: AccountAccess
    private let transport: any CompareTimelineTransport
    private let now: () -> Date
    private var cache: [String: (response: CompareTimelineResponse, checkedAt: Date)] = [:]
    private var requestID = UUID()

    init(access: AccountAccess, transport: any CompareTimelineTransport, now: @escaping () -> Date = { Date() }) {
        self.access = access
        self.transport = transport
        self.now = now
    }

    func load(from: Date, to: Date, timeZone: TimeZone = .current, ticket: AccountAccess.Ticket) async {
        let request = UUID()
        requestID = request
        guard (try? access.require(ticket)) != nil, from <= to else { response = nil; state = .failed; return }
        guard to.timeIntervalSince(from) <= Double(CompareTimelineQuery.maxDays) * 86_400 else { response = nil; state = .tooFarApart; return }
        let key = "\(ticket.accountID.uuidString)|\(from.timeIntervalSince1970)|\(to.timeIntervalSince1970)|\(timeZone.identifier)"
        if let cached = cache[key] {
            response = cached.response
            state = .ready(checkedAt: cached.checkedAt, stale: false)
        } else {
            response = nil
            state = .loading
        }
        do {
            let fresh = try await transport.fetchCompareTimeline(from: from, to: to, timeZone: timeZone, ticket: ticket)
            try access.require(ticket)
            try Task.checkCancellation()
            guard requestID == request else { return }
            guard CompareTimelineQuery.valid(fresh, owner: ticket.accountID) else { throw RoutineFailure.invalidData }
            let checkedAt = now()
            if cache.count >= 8 { cache.removeAll() }
            cache[key] = (fresh, checkedAt)
            response = fresh
            state = .ready(checkedAt: checkedAt, stale: false)
        } catch {
            guard requestID == request else { return }
            if case AccountFailure.requestFailed(404) = error { response = nil; state = .unavailable; return }
            if (try? access.require(ticket)) != nil, !(error is CancellationError), let cached = cache[key] {
                response = cached.response
                state = .ready(checkedAt: cached.checkedAt, stale: true)
            } else {
                response = nil
                state = .failed
            }
        }
    }

    /// Drops the visible result (no pair, or an undated photo) and keeps answers already loaded.
    func clear() {
        requestID = UUID()
        response = nil
        state = .idle
    }

    func cancel() {
        clear()
        cache.removeAll()
    }
}
```

- [ ] **Step 5: Add the transport** — append to the end of `ClearAF/Services/APIService.swift`

```swift


extension APIService: CompareTimelineTransport {
    @MainActor func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse {
        try access.require(ticket)
        let response: CompareTimelineResponse = try await request(
            endpoint: CompareTimelineQuery.endpoint(from: from, to: to, zoneIdentifier: timeZone.identifier),
            method: "GET", body: Optional<String>.none, ticket: ticket)
        try access.require(ticket)
        return response
    }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: **TEST** with `-only-testing:ClearAFTests/CompareTimelineTests`
Expected: PASS (4 tests).

- [ ] **Step 7: Review, then commit**

Run `api-contract-checker` (compare `CompareTimelineResponse` with Task 1's service return) and `care-access-reviewer` (loader and transport). Fix findings, rerun Step 6.

```bash
git add ClearAF/Services/CompareTimelineModels.swift ClearAF/Services/CompareTimelineLoader.swift ClearAF/Services/APIService.swift ClearAFTests/CompareTimelineTests.swift
git commit -m "ios: load the compare timeline with stale and not-yet-available states" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pair rules, copy and timeline rows [judgment]

**Files:**
- Create: `ClearAF/Views/CompareCopy.swift`
- Test: create `ClearAFTests/CompareCopyTests.swift`

**Interfaces:**
- Consumes: Task 2 `CompareTimelineResponse`, `CompareTimelineTests.json()` (tests); `CareRoutineRevision`, `CheckInResponse`, `RoutineTimeOfDay` (`title`, `allCases`), `RoutineDates.instant`, `LetterpressFormat.stamp/dayMonthYear`.
- Produces (Tasks 5–6 rely on these):
  - `enum CompareMode: CaseIterable, Hashable { case sideBySide, overlay, flip; var title: String }`.
  - `enum CompareRole: Equatable { case earlier, later, selected; var label: String; var accessibilityValue: String }`.
  - `struct ComparePair<Item: Equatable>: Equatable` — `picks: [Item]` (read-only), `init(_ picks: [Item] = [])`, `mutating toggle(_:)`, `ordered(date: (Item) -> Date?) -> (earlier: Item, later: Item)?`, `role(of:date:) -> CompareRole?`.
  - `enum CompareCopy` — string constants `footnote pickEyebrow changedEyebrow pickTwo pickHelp modeDisabledReason loadingPhotos loadingTimeline photosError photoUnreadable timelineError timelineUnavailable tooFarApart undated nothingRecorded undatedStamp emptyTitle emptyAction overlaySlider overlayLabel flipHelp flipHint openHint openEarlier openLater openShown`; functions `emptySentence(total:)`, `apart(_:_:timeZone:) -> String?`, `routineLine(_:) -> String?`, `percent(_:)`, `overlayValue(_:)`, `flipLabel(showingLater:date:locale:timeZone:)`, `paneLabel(role:date:locale:timeZone:)`, `thumbnailLabel(date:locale:timeZone:)`.
  - `struct CompareTimelineRow: Equatable, Identifiable` — `id, date, text: String`, `answers: [Answer]` (`struct Answer: Equatable { prompt, answer: String }`).
  - `enum CompareTimeline` — `rows(_:locale:timeZone:)`, `rangeStamp(fromDate:toDate:locale:)`, `recordedText(_:count:days:)`, `revisionText(_:)`, `answers(_:)`, `moreCheckIns(shown:total:) -> String?`.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/CompareCopyTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

@MainActor struct CompareCopyTests {
    static let us = Locale(identifier: "en_US")
    static let utc = TimeZone(identifier: "UTC")!
    struct Item: Equatable { let name: String; let date: Date? }

    private func d(_ value: String) -> Date { CompareTimelineTests.date(value) }

    private func rev(_ slot: RoutineTimeOfDay, _ version: Int, active: Bool = true) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: version, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic", isActive: active, steps: [])
    }

    @Test func pairKeepsTheLastTwoPicksAndShowsTheEarlierFirst() {
        let a = Item(name: "a", date: d("2026-09-15T07:12:00.000Z"))
        let b = Item(name: "b", date: d("2026-09-02T07:04:00.000Z"))
        let c = Item(name: "c", date: d("2026-09-10T07:00:00.000Z"))
        var pair = ComparePair<Item>()
        #expect(pair.ordered(date: \.date) == nil)
        pair.toggle(a)
        #expect(pair.role(of: a, date: \.date) == .selected)
        #expect(pair.ordered(date: \.date) == nil)
        pair.toggle(b)
        #expect(pair.ordered(date: \.date).map { [$0.earlier.name, $0.later.name] } == ["b", "a"])
        #expect(pair.role(of: b, date: \.date) == .earlier && pair.role(of: a, date: \.date) == .later)
        pair.toggle(c)
        #expect(pair.picks.map(\.name) == ["b", "c"], "a third pick drops the oldest pick")
        #expect(pair.role(of: a, date: \.date) == nil)
        pair.toggle(b)
        #expect(pair.picks.map(\.name) == ["c"], "tapping a picked photo removes it")
        let tie = Item(name: "tie", date: c.date)
        pair.toggle(tie)
        #expect(pair.ordered(date: \.date).map { [$0.earlier.name, $0.later.name] } == ["c", "tie"], "equal dates keep pick order")
        let undated = Item(name: "undated", date: nil)
        #expect(ComparePair([undated, a]).ordered(date: \.date).map { $0.earlier.name } == "undated")
        #expect(ComparePair([a, a, b]).picks.map(\.name) == ["a", "b"])
    }

    @Test func apartCountsCalendarDaysAndRoutineLineNamesActiveVersions() {
        #expect(CompareCopy.apart(d("2026-09-02T07:04:00.000Z"), d("2026-09-15T07:12:00.000Z"), timeZone: Self.utc) == "13 days apart")
        #expect(CompareCopy.apart(d("2026-09-14T23:30:00.000Z"), d("2026-09-15T00:10:00.000Z"), timeZone: Self.utc) == "1 day apart")
        #expect(CompareCopy.apart(d("2026-09-15T07:00:00.000Z"), d("2026-09-15T19:00:00.000Z"), timeZone: Self.utc) == "Same day")
        #expect(CompareCopy.apart(nil, d("2026-09-15T19:00:00.000Z"), timeZone: Self.utc) == nil)
        #expect(CompareCopy.routineLine([rev(.evening, 2), rev(.morning, 3)]) == "Morning v3 · Evening v2")
        #expect(CompareCopy.routineLine([rev(.evening, 2), rev(.morning, 5, active: false)]) == "Evening v2")
        #expect(CompareCopy.routineLine([]) == nil)
        #expect(CompareMode.allCases.map(\.title) == ["Side by side", "Overlay", "Flip"])
        #expect([CompareRole.earlier, .later, .selected].map(\.label) == ["Earlier", "Later", "Selected"])
    }

    @Test func accessibilityAndEmptyCopyIsPlainAndPromisesNothing() {
        #expect(CompareCopy.emptyTitle == "Two photos needed")
        #expect(CompareCopy.emptySentence(total: 0) == "Compare shows two of your photos next to each other. Take your first photo today.")
        #expect(CompareCopy.emptySentence(total: 1) == "You have one photo so far. Take another to compare the two.")
        #expect(CompareCopy.percent(0.504) == "50%")
        #expect(CompareCopy.overlayValue(0.504) == "Later photo at 50%")
        let sept15 = d("2026-09-15T07:12:00.000Z")
        #expect(CompareCopy.flipLabel(showingLater: true, date: sept15, locale: Self.us, timeZone: Self.utc) == "Showing the later photo, 15 Sep 2026")
        #expect(CompareCopy.flipLabel(showingLater: false, date: nil, locale: Self.us, timeZone: Self.utc) == "Showing the earlier photo")
        #expect(CompareCopy.paneLabel(role: .earlier, date: sept15, locale: Self.us, timeZone: Self.utc) == "Earlier photo, 15 Sep 2026")
        #expect(CompareCopy.thumbnailLabel(date: sept15, locale: Self.us, timeZone: Self.utc) == "Photo, 15 Sep 2026")
        #expect(CompareCopy.thumbnailLabel(date: nil) == "Undated photo")
        let lines = [CompareCopy.footnote, CompareCopy.pickTwo, CompareCopy.pickHelp, CompareCopy.modeDisabledReason, CompareCopy.loadingPhotos,
                     CompareCopy.loadingTimeline, CompareCopy.photosError, CompareCopy.photoUnreadable, CompareCopy.timelineError,
                     CompareCopy.timelineUnavailable, CompareCopy.tooFarApart, CompareCopy.undated, CompareCopy.nothingRecorded,
                     CompareCopy.emptyTitle, CompareCopy.emptySentence(total: 0), CompareCopy.emptySentence(total: 1), CompareCopy.flipHelp,
                     CompareCopy.flipHint, CompareCopy.openHint, CompareCopy.overlayLabel]
        for line in lines {
            #expect(!line.contains("!"), "\(line)")
            #expect(line.range(of: #"improv|better|worse|progress|score|streak|great|clearer|%"#, options: [.regularExpression, .caseInsensitive]) == nil, "\(line)")
        }
    }

    @Test func timelineRowsSummariseRecordedDaysThenListEventsInOrder() throws {
        let response = try JSONDecoder().decode(CompareTimelineResponse.self, from: CompareTimelineTests.json())
        let rows = CompareTimeline.rows(response, locale: Self.us, timeZone: Self.utc)
        #expect(rows.map(\.date) == ["2–15 SEP", "2 SEP", "14 SEP"])
        #expect(rows.map(\.text) == ["Morning routine recorded on 11 of 14 days", "Morning routine updated to v4", "Check-in sent"])
        #expect(rows[2].answers == [.init(prompt: "Pick one", answer: "Neutral second"),
                                    .init(prompt: "Anything else?", answer: "“Synthetic note about the chin”")])
        #expect(Set(rows.map(\.id)).count == rows.count)
    }

    @Test func recordedRevisionRangeAndTruncationCopy() {
        #expect(CompareTimeline.recordedText(.evening, count: 0, days: 14) == "No evening routine recorded in these 14 days")
        #expect(CompareTimeline.recordedText(.morning, count: 1, days: 1) == "Morning routine recorded that day")
        #expect(CompareTimeline.recordedText(.morning, count: 0, days: 1) == "No morning routine recorded that day")
        #expect(CompareTimeline.revisionText(rev(.evening, 1)) == "Evening routine assigned · v1")
        #expect(CompareTimeline.revisionText(rev(.morning, 4)) == "Morning routine updated to v4")
        #expect(CompareTimeline.revisionText(rev(.morning, 5, active: false)) == "Morning routine archived · v5")
        #expect(CompareTimeline.rangeStamp(fromDate: "2026-08-28", toDate: "2026-09-15", locale: Self.us) == "28 AUG – 15 SEP")
        #expect(CompareTimeline.rangeStamp(fromDate: "2025-12-28", toDate: "2026-01-03", locale: Self.us) == "28 DEC 2025 – 3 JAN 2026")
        #expect(CompareTimeline.rangeStamp(fromDate: "2026-09-15", toDate: "2026-09-15", locale: Self.us) == "15 SEP")
        #expect(CompareTimeline.moreCheckIns(shown: 50, total: 73) == "Showing the first 50 of 73 check-ins from this period.")
        #expect(CompareTimeline.moreCheckIns(shown: 2, total: 2) == nil)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: **TEST** with `-only-testing:ClearAFTests/CompareCopyTests`
Expected: build FAIL — `cannot find 'ComparePair' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/CompareCopy.swift`**

```swift
import Foundation

/// Compare modes (spec §6 iOS #6), switched with the native segmented control.
enum CompareMode: CaseIterable, Hashable {
    case sideBySide, overlay, flip

    var title: String {
        switch self {
        case .sideBySide: "Side by side"
        case .overlay: "Overlay"
        case .flip: "Flip"
        }
    }
}

/// A photo's place in the pair, in words (selection never relies on the outline alone).
enum CompareRole: Equatable {
    case earlier, later, selected

    var label: String {
        switch self {
        case .earlier: "Earlier"
        case .later: "Later"
        case .selected: "Selected"
        }
    }

    var accessibilityValue: String {
        switch self {
        case .earlier: "Earlier photo in the pair"
        case .later: "Later photo in the pair"
        case .selected: "Selected. Pick one more photo."
        }
    }
}

/// The two photos being compared, in tap order. A third pick drops the oldest; tapping a pick removes it.
/// Display order is always by capture date, never by which looks different (spec §7).
struct ComparePair<Item: Equatable>: Equatable {
    private(set) var picks: [Item] = []

    init(_ picks: [Item] = []) {
        for item in picks where !self.picks.contains(item) { self.picks.append(item) }
        self.picks = Array(self.picks.suffix(2))
    }

    mutating func toggle(_ item: Item) {
        if let index = picks.firstIndex(of: item) {
            picks.remove(at: index)
        } else {
            picks.append(item)
            if picks.count > 2 { picks.removeFirst() }
        }
    }

    /// Earlier then later by capture date; an undated photo counts as earliest; equal dates keep pick order.
    func ordered(date: (Item) -> Date?) -> (earlier: Item, later: Item)? {
        guard picks.count == 2 else { return nil }
        let first = picks[0], second = picks[1]
        return (date(second) ?? .distantPast) < (date(first) ?? .distantPast) ? (second, first) : (first, second)
    }

    func role(of item: Item, date: (Item) -> Date?) -> CompareRole? {
        guard picks.contains(item) else { return nil }
        guard let pair = ordered(date: date) else { return .selected }
        return pair.earlier == item ? .earlier : .later
    }
}

enum CompareCopy {
    static let footnote = "Lighting and capture conditions may differ. No filtering is applied to either photograph."
    static let pickEyebrow = "Pick the pair"
    static let changedEyebrow = "What changed in between"
    static let pickTwo = "Pick two photos from the strip below to compare them."
    static let pickHelp = "Tap photos to choose the pair. The earlier photo is always shown first."
    static let modeDisabledReason = "Pick two photos to choose how to compare them."
    static let loadingPhotos = "Loading your photos"
    static let loadingTimeline = "Loading what changed in between"
    static let photosError = "Photos could not be loaded. Please try again."
    static let photoUnreadable = "This photo couldn't be opened on this device."
    static let timelineError = "Couldn't load what changed in between. Your photos are still here."
    static let timelineUnavailable = "What changed in between isn't available from the server yet. Your photos can still be compared."
    static let tooFarApart = "These photos are more than three years apart. Pick a closer pair to see what changed in between."
    static let undated = "One of these photos has no capture date, so what changed in between can't be shown."
    static let nothingRecorded = "Nothing was recorded between these two photos."
    static let undatedStamp = "Undated"
    static let emptyTitle = "Two photos needed"
    static let emptyAction = "Take a photo"
    static let overlaySlider = "Later photo opacity"
    static let overlayLabel = "Earlier and later photos, overlaid"
    static let flipHelp = "Tap or swipe the photo to switch between the two."
    static let flipHint = "Double-tap to show the other photo."
    static let openHint = "Opens the full, uncropped photo."
    static let openEarlier = "Open earlier photo"
    static let openLater = "Open later photo"
    static let openShown = "Open this photo"

    static func emptySentence(total: Int) -> String {
        total == 1
            ? "You have one photo so far. Take another to compare the two."
            : "Compare shows two of your photos next to each other. Take your first photo today."
    }

    /// "13 days apart", counted in local calendar days.
    static func apart(_ earlier: Date?, _ later: Date?, timeZone: TimeZone = .current) -> String? {
        guard let earlier, let later else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let days = abs(calendar.dateComponents([.day], from: calendar.startOfDay(for: earlier), to: calendar.startOfDay(for: later)).day ?? 0)
        switch days {
        case 0: return "Same day"
        case 1: return "1 day apart"
        default: return "\(days) days apart"
        }
    }

    /// Active routine versions in force when a photo was taken: "Morning v3 · Evening v2".
    static func routineLine(_ revisions: [CareRoutineRevision]) -> String? {
        let parts = RoutineTimeOfDay.allCases.compactMap { slot in
            revisions.first { $0.timeOfDay == slot && $0.isActive }.map { "\(slot.title) v\($0.version)" }
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    static func percent(_ opacity: Double) -> String { "\(Int((opacity * 100).rounded()))%" }

    static func overlayValue(_ opacity: Double) -> String { "Later photo at \(percent(opacity))" }

    static func flipLabel(showingLater: Bool, date: Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let base = "Showing the \(showingLater ? "later" : "earlier") photo"
        return date.map { "\(base), \(LetterpressFormat.dayMonthYear($0, locale: locale, timeZone: timeZone))" } ?? base
    }

    static func paneLabel(role: CompareRole, date: Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let base = "\(role.label) photo"
        return date.map { "\(base), \(LetterpressFormat.dayMonthYear($0, locale: locale, timeZone: timeZone))" } ?? base
    }

    static func thumbnailLabel(date: Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        date.map { "Photo, \(LetterpressFormat.dayMonthYear($0, locale: locale, timeZone: timeZone))" } ?? "Undated photo"
    }
}

struct CompareTimelineRow: Equatable, Identifiable {
    struct Answer: Equatable {
        let prompt: String
        let answer: String
    }

    let id: String
    let date: String
    let text: String
    var answers: [Answer] = []
}

/// "What changed in between": recorded days per slot, then routine versions and check-ins in time order.
/// Answers are shown as given; nothing is averaged, scored or read as a trend.
enum CompareTimeline {
    static func rows(_ response: CompareTimelineResponse, locale: Locale = .current, timeZone: TimeZone = .current) -> [CompareTimelineRow] {
        var rows: [CompareTimelineRow] = []
        let slots = Set((response.routinesAtFrom + response.revisions + response.routinesAtTo).map(\.timeOfDay))
        let range = rangeStamp(fromDate: response.fromDate, toDate: response.toDate, locale: locale)
        for slot in RoutineTimeOfDay.allCases where slots.contains(slot) {
            let count = slot == .morning ? response.completions.morning : response.completions.evening
            rows.append(CompareTimelineRow(id: "recorded-\(slot.rawValue)", date: range, text: recordedText(slot, count: count, days: response.days)))
        }
        var events: [(at: Date, row: CompareTimelineRow)] = []
        for revision in response.revisions {
            guard let at = RoutineDates.instant(revision.createdAt) else { continue }
            events.append((at, CompareTimelineRow(id: "revision-\(revision.id.uuidString)",
                                                  date: LetterpressFormat.stamp(at, locale: locale, timeZone: timeZone),
                                                  text: revisionText(revision))))
        }
        for checkIn in response.responses {
            guard let at = RoutineDates.instant(checkIn.submittedAt) else { continue }
            events.append((at, CompareTimelineRow(id: "check-in-\(checkIn.id.uuidString)",
                                                  date: LetterpressFormat.stamp(at, locale: locale, timeZone: timeZone),
                                                  text: "Check-in sent", answers: answers(checkIn))))
        }
        rows += events.enumerated()
            .sorted { ($0.element.at, $0.offset) < ($1.element.at, $1.offset) }
            .map { $0.element.row }
        if let more = moreCheckIns(shown: response.responses.count, total: response.responsesTotal) {
            rows.append(CompareTimelineRow(id: "more-check-ins", date: "", text: more))
        }
        return rows
    }

    /// "2–15 SEP", "28 AUG – 15 SEP", "28 DEC 2025 – 3 JAN 2026", "15 SEP". Inputs are server local dates (YYYY-MM-DD).
    static func rangeStamp(fromDate: String, toDate: String, locale: Locale = .current) -> String {
        let utc = TimeZone(identifier: "UTC")!
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = utc
        parser.dateFormat = "yyyy-MM-dd"
        guard let from = parser.date(from: fromDate), let to = parser.date(from: toDate) else { return "" }
        let stamp = { (date: Date) in LetterpressFormat.stamp(date, locale: locale, timeZone: utc) }
        if fromDate == toDate { return stamp(from) }
        if fromDate.prefix(7) == toDate.prefix(7) { return "\(Int(fromDate.suffix(2)) ?? 0)–\(stamp(to))" }
        if fromDate.prefix(4) == toDate.prefix(4) { return "\(stamp(from)) – \(stamp(to))" }
        let withYear = { (date: Date) in LetterpressFormat.dayMonthYear(date, locale: locale, timeZone: utc).uppercased(with: locale) }
        return "\(withYear(from)) – \(withYear(to))"
    }

    static func recordedText(_ slot: RoutineTimeOfDay, count: Int, days: Int) -> String {
        let name = "\(slot.rawValue) routine"
        if days == 1 { return count > 0 ? "\(slot.title) routine recorded that day" : "No \(name) recorded that day" }
        return count == 0 ? "No \(name) recorded in these \(days) days" : "\(slot.title) routine recorded on \(count) of \(days) days"
    }

    static func revisionText(_ revision: CareRoutineRevision) -> String {
        let name = "\(revision.timeOfDay.title) routine"
        if !revision.isActive { return "\(name) archived · v\(revision.version)" }
        return revision.version == 1 ? "\(name) assigned · v1" : "\(name) updated to v\(revision.version)"
    }

    static func answers(_ response: CheckInResponse) -> [CompareTimelineRow.Answer] {
        response.form.questions.compactMap { question in
            guard let given = response.answers.first(where: { $0.questionId == question.id }) else { return nil }
            switch question.type {
            case .choice:
                guard let label = question.options.first(where: { $0.id == given.optionId })?.label else { return nil }
                return CompareTimelineRow.Answer(prompt: question.prompt, answer: label)
            case .text:
                guard let text = given.text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
                return CompareTimelineRow.Answer(prompt: question.prompt, answer: "“\(text)”")
            }
        }
    }

    static func moreCheckIns(shown: Int, total: Int) -> String? {
        total > shown ? "Showing the first \(shown) of \(total) check-ins from this period." : nil
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: **TEST** with `-only-testing:ClearAFTests/CompareCopyTests -only-testing:ClearAFTests/CompareTimelineTests`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add ClearAF/Views/CompareCopy.swift ClearAFTests/CompareCopyTests.swift
git commit -m "ios: compare pair rules, plain copy and in-between timeline rows" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Filmstrip photo store [judgment]

Reviewer note: per-task review checks the account guard (bytes only from the signed-in account's context) and that no `SkinPhoto` or image bytes are retained by the strip.

**Files:**
- Create: `ClearAF/Services/ComparePhotoStrip.swift`
- Test: create `ClearAFTests/ComparePhotoStripTests.swift`

**Interfaces:**
- Consumes: `SkinPhoto` (Core Data: `captureDate`, `id`, `photoData`), `PhotoPageStore.pageSize` (24), `PhotoImageLoader(byteLimit:countLimit:)`, `.image(data:key:maxPixelSize:)`, `.contains(key:maxPixelSize:)`, `.clear()`; `PersistenceController(accountID:directory:)` (tests); Task 3 `CompareCopy.photosError`.
- Produces (Task 5 relies on these): `struct ComparePhoto: Identifiable, Equatable { let id: NSManagedObjectID; let captureDate: Date? }`; `@MainActor final class ComparePhotoStrip: ObservableObject` with `static let pageSize`, `static let thumbnailPixelSize = 160`, `static let stagePixelSize = 1600`, `@Published photos: [ComparePhoto]`, `total: Int`, `loading: Bool`, `error: String?`, `hasMore: Bool`, `let thumbnails: PhotoImageLoader`, `let stageImages: PhotoImageLoader`, `bind(context:)`, `reload()`, `loadMore()`, `imageData(for:) -> Data?`, `image(for:maxPixelSize:in:) -> UIImage?`, `skinPhoto(for:) -> SkinPhoto?`, `dispose()`.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/ComparePhotoStripTests.swift`

```swift
import CoreData
import Foundation
import Testing
import UIKit
@testable import ClearAF

@MainActor struct ComparePhotoStripTests {
    private static let bytes: Data = {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 400, height: 500), format: format)
            .jpegData(withCompressionQuality: 0.8) { $0.fill(CGRect(x: 0, y: 0, width: 400, height: 500)) }
    }()

    /// Dictionary fetches need the SQLite store the app uses, so tests open a throwaway account store.
    private func store(_ account: UUID) throws -> (PersistenceController, URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ComparePhotoStripTests-\(UUID().uuidString)")
        return (try PersistenceController(accountID: account, directory: root), root)
    }

    @Test func pagesNewestFirstWithoutHoldingPhotosOrBytes() throws {
        let (persistence, root) = try store(UUID())
        defer { try? FileManager.default.removeItem(at: root) }
        let context = persistence.container.viewContext
        for index in 0..<60 {
            let photo = SkinPhoto(context: context)
            photo.id = UUID()
            photo.captureDate = Date(timeIntervalSince1970: 1_788_000_000 + Double(index) * 86_400)
            photo.photoData = Self.bytes
            photo.uploadState = "shared"
        }
        try context.save()
        context.reset()

        let strip = ComparePhotoStrip()
        strip.bind(context: context)
        #expect(strip.total == 60 && strip.photos.count == 24 && strip.hasMore)
        #expect(strip.photos.first?.captureDate == Date(timeIntervalSince1970: 1_788_000_000 + 59 * 86_400))
        #expect(context.registeredObjects.isEmpty, "the strip keeps IDs and dates, not managed photos or their bytes")
        strip.loadMore(); strip.loadMore(); strip.loadMore()
        #expect(strip.photos.count == 60 && !strip.hasMore)
        #expect(Set(strip.photos.map(\.id)).count == 60)
        #expect(zip(strip.photos, strip.photos.dropFirst()).allSatisfy { ($0.captureDate ?? .distantPast) >= ($1.captureDate ?? .distantPast) })

        let first = try #require(strip.photos.first)
        #expect(strip.imageData(for: first) == Self.bytes)
        let thumb = try #require(strip.image(for: first, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails))
        #expect(max(thumb.cgImage!.width, thumb.cgImage!.height) <= ComparePhotoStrip.thumbnailPixelSize)
        #expect(strip.thumbnails.contains(key: first.id.uriRepresentation().absoluteString, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize))
        #expect(strip.image(for: first, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails) === thumb, "a cached decode is reused")
        #expect(context.registeredObjects.isEmpty)
        #expect(strip.skinPhoto(for: first)?.photoData == Self.bytes, "the detail sheet still gets the full photo")

        strip.dispose()
        #expect(strip.photos.isEmpty && strip.total == 0 && strip.thumbnails.cachedCount == 0)
    }

    @Test func aContextThatChangedAccountOrHasNoAccountReadsNothing() throws {
        let (persistence, root) = try store(UUID())
        defer { try? FileManager.default.removeItem(at: root) }
        let context = persistence.container.viewContext
        let photo = SkinPhoto(context: context)
        photo.id = UUID(); photo.captureDate = Date(); photo.photoData = Self.bytes
        try context.save()

        let strip = ComparePhotoStrip()
        strip.bind(context: context)
        let item = try #require(strip.photos.first)
        context.userInfo["accountID"] = UUID()
        #expect(strip.imageData(for: item) == nil)
        #expect(strip.skinPhoto(for: item) == nil)
        strip.loadMore()
        #expect(strip.photos.isEmpty && strip.total == 0, "a context that changed account is dropped")

        let unbound = ComparePhotoStrip()
        #expect(unbound.imageData(for: item) == nil)
        let anonymous = PersistenceController(inMemory: true)
        unbound.bind(context: anonymous.container.viewContext)
        #expect(unbound.photos.isEmpty && unbound.total == 0, "an identity-free context is never read")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: **TEST** with `-only-testing:ClearAFTests/ComparePhotoStripTests`
Expected: build FAIL — `cannot find 'ComparePhotoStrip' in scope`.

- [ ] **Step 3: Create `ClearAF/Services/ComparePhotoStrip.swift`**

```swift
import Combine
import CoreData
import UIKit

/// One photo in the Compare filmstrip: its object ID and capture date, nothing else.
struct ComparePhoto: Identifiable, Equatable {
    let id: NSManagedObjectID
    let captureDate: Date?
}

/// The signed-in account's photos for Compare, newest first in pages of 24 (Record's order). Rows are dictionary
/// fetches, so no `SkinPhoto` or image bytes stay registered; bytes are read one photo at a time and decoded into
/// bounded caches. Record's `PhotoPageStore` and its pagination are untouched.
@MainActor final class ComparePhotoStrip: ObservableObject {
    static let pageSize = PhotoPageStore.pageSize
    static let thumbnailPixelSize = 160
    static let stagePixelSize = 1600

    @Published private(set) var photos: [ComparePhoto] = []
    @Published private(set) var total = 0
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    let thumbnails = PhotoImageLoader(byteLimit: 8 * 1024 * 1024, countLimit: 72)
    let stageImages = PhotoImageLoader(byteLimit: 64 * 1024 * 1024, countLimit: 4)
    private var context: NSManagedObjectContext?
    private var accountID: UUID?

    var hasMore: Bool { photos.count < total }

    func bind(context: NSManagedObjectContext) {
        let account = context.userInfo["accountID"] as? UUID
        if self.context === context && accountID == account { return }
        dispose()
        guard let account else { return }
        self.context = context
        accountID = account
        reload()
    }

    func reload() {
        photos = []
        total = 0
        error = nil
        loadMore()
    }

    func loadMore() {
        guard let context, !loading else { return }
        guard context.userInfo["accountID"] as? UUID == accountID else { dispose(); return }
        guard photos.isEmpty || hasMore else { return }
        loading = true
        defer { loading = false }
        do {
            total = try context.count(for: SkinPhoto.fetchRequest())
            let objectID = NSExpressionDescription()
            objectID.name = "objectID"
            objectID.expression = .expressionForEvaluatedObject()
            objectID.expressionResultType = .objectIDAttributeType
            let request = NSFetchRequest<NSDictionary>(entityName: "SkinPhoto")
            request.resultType = .dictionaryResultType
            request.propertiesToFetch = [objectID, "captureDate"]
            request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
            request.fetchOffset = photos.count
            request.fetchLimit = Self.pageSize
            let known = Set(photos.map(\.id))
            let page = try context.fetch(request).compactMap { row -> ComparePhoto? in
                guard let id = row["objectID"] as? NSManagedObjectID, !known.contains(id) else { return nil }
                return ComparePhoto(id: id, captureDate: row["captureDate"] as? Date)
            }
            photos += page
            error = nil
        } catch {
            self.error = CompareCopy.photosError
        }
    }

    /// The stored bytes of one photo, read for a single decode. Nil for another account's context or a missing photo.
    func imageData(for photo: ComparePhoto) -> Data? {
        guard let context, context.userInfo["accountID"] as? UUID == accountID, accountID != nil else { return nil }
        let request = NSFetchRequest<NSDictionary>(entityName: "SkinPhoto")
        request.resultType = .dictionaryResultType
        request.predicate = NSPredicate(format: "SELF == %@", photo.id)
        request.propertiesToFetch = ["photoData"]
        request.fetchLimit = 1
        return (try? context.fetch(request))?.first?["photoData"] as? Data
    }

    /// A decoded, aspect-preserving downsample. A cached decode is returned without reading bytes again
    /// (`PhotoImageLoader` answers a cache hit before it looks at the data).
    func image(for photo: ComparePhoto, maxPixelSize: Int, in loader: PhotoImageLoader) -> UIImage? {
        let key = photo.id.uriRepresentation().absoluteString
        if loader.contains(key: key, maxPixelSize: maxPixelSize) {
            return loader.image(data: Data(), key: key, maxPixelSize: maxPixelSize)
        }
        guard let data = imageData(for: photo) else { return nil }
        return loader.image(data: data, key: key, maxPixelSize: maxPixelSize)
    }

    /// The managed photo for the existing detail sheet, which shows the whole, uncropped photo.
    func skinPhoto(for photo: ComparePhoto) -> SkinPhoto? {
        guard let context, context.userInfo["accountID"] as? UUID == accountID, accountID != nil else { return nil }
        return try? context.existingObject(with: photo.id) as? SkinPhoto
    }

    func dispose() {
        context = nil
        accountID = nil
        photos = []
        total = 0
        loading = false
        error = nil
        thumbnails.clear()
        stageImages.clear()
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: **TEST** with `-only-testing:ClearAFTests/ComparePhotoStripTests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add ClearAF/Services/ComparePhotoStrip.swift ClearAFTests/ComparePhotoStripTests.swift
git commit -m "ios: paged compare filmstrip that keeps no photo bytes" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The Compare screen [judgment]

**Files:**
- Create: `ClearAF/Views/CompareView.swift`
- Test: create `ClearAFTests/CompareViewSourceTests.swift`

**Interfaces:**
- Consumes: Task 2 `CompareTimelineLoader` (`state`, `response`, `load`, `clear`, `cancel`); Task 3 `CompareMode`, `CompareRole`, `ComparePair`, `CompareCopy`, `CompareTimeline`, `CompareTimelineRow`; Task 4 `ComparePhoto`, `ComparePhotoStrip`; PR 3 `PhotoDetailView(photo:images:)`, `LetterpressFormat.stamp/stampTime`, `RoutineRecordCopy.lastChecked(_:)`; PR 2 primitives; `APIService.shared.access`; `LetterpressSweepTests.repoRoot` (tests).
- Produces (Task 6 relies on these): `ComparePhotosView()` (reads `\.managedObjectContext`); `CompareEmptyState(total: Int, takePhoto: () -> Void)`.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/CompareViewSourceTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

/// Rules for Compare that a unit test can only see in source: untouched photos, Reduce Motion, dark mat, no Share.
struct CompareViewSourceTests {
    static func source() throws -> String {
        try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/CompareView.swift"), encoding: .utf8)
    }

    @Test func photosAreFittedOnTheMatAndNeverAltered() throws {
        let text = try Self.source()
        #expect(text.contains(".scaledToFit()"))
        for banned in ["scaledToFill", "aspectRatio(contentMode: .fill", ".clipped()", ".blur(", ".saturation(", ".contrast(", ".brightness(",
                       ".colorMultiply(", ".grayscale(", ".hueRotation(", ".colorInvert(", "rotation3DEffect", ".rotationEffect(",
                       ".scaleEffect(", ".offset(", "matchedGeometryEffect", "Material", ".glassEffect("] {
            #expect(!text.contains(banned), "CompareView uses \(banned)")
        }
    }

    @Test func motionRespectsReduceMotionAndFlipIsACrossfade() throws {
        let text = try Self.source()
        #expect(text.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"))
        let animations = text.components(separatedBy: ".animation(").count - 1
        let guarded = text.components(separatedBy: ".animation(reduceMotion ? nil :").count - 1
        #expect(animations > 0 && animations == guarded, "every animation is off under Reduce Motion")
        #expect(!text.contains("withAnimation"))
    }

    @Test func compareIsDarkReadOnlyAndOmitsShare() throws {
        let text = try Self.source()
        #expect(text.contains(".preferredColorScheme(.dark)"))
        #expect(text.components(separatedBy: ".letterpress(.filled").count - 1 == 1, "only the empty state's Take a photo is filled")
        #expect(!text.contains("ShareLink") && !text.contains("UIActivityViewController"), "Share is deferred")
        #expect(text.contains("LetterpressPicker(title: \"Compare mode\""))
        #expect(!text.contains("NavigationStack") && !text.contains("safeAreaInset(edge: .bottom"), "no nested stack, no bottom spacer")
        #expect(text.contains("PhotoDetailView(photo:"), "the uncropped photo is reachable")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: **TEST** with `-only-testing:ClearAFTests/CompareViewSourceTests`
Expected: FAIL — the file `ClearAF/Views/CompareView.swift` does not exist (`The file “CompareView.swift” couldn’t be opened`).

- [ ] **Step 3: Create `ClearAF/Views/CompareView.swift`**

```swift
import CoreData
import SwiftUI
import UIKit

/// Compare (spec §6 iOS #6): two of the patient's own photos on a near-black mat, side by side, overlaid or flipped;
/// a filmstrip to pick the pair; and what the record holds between the two capture dates. Photos are fitted, never
/// cropped, aligned, warped or filtered, and each one opens whole in the existing detail sheet. Read-only.
struct ComparePhotosView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var strip = ComparePhotoStrip()
    @StateObject private var timeline = CompareTimelineLoader(access: APIService.shared.access, transport: APIService.shared)
    @State private var pair = ComparePair<ComparePhoto>()
    @State private var pickedDefault = false
    @State private var mode = CompareMode.sideBySide
    @State private var overlay = 0.5
    @State private var showingLater = true
    @State private var detail: ComparePhoto?
    @State private var retry = 0

    private typealias Ordered = (earlier: ComparePhoto, later: ComparePhoto)
    private var ordered: Ordered? { pair.ordered(date: \.captureDate) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                stage.padding(.top, Letterpress.Space.s18)
                modePicker.padding(.top, Letterpress.Space.s18)
                filmstrip.padding(.top, Letterpress.Space.s22)
                changed.padding(.top, Letterpress.Space.s28)
                Text(CompareCopy.footnote)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s22)
            }
            .padding(.horizontal, Letterpress.Space.s18)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .onAppear {
            strip.bind(context: viewContext)
            pickDefaultPair()
        }
        .onChange(of: strip.photos) { pickDefaultPair() }
        .onChange(of: pair) { showingLater = true }
        .task(id: timelineKey) { await loadTimeline() }
        .onDisappear {
            strip.dispose()
            timeline.cancel()
        }
        .sheet(item: $detail) { photo in
            if let skin = strip.skinPhoto(for: photo) {
                PhotoDetailView(photo: skin, images: strip.stageImages)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: Letterpress.Space.s10) {
            Button("Done") { dismiss() }
                .buttonStyle(.letterpress(.underline))
            Spacer(minLength: Letterpress.Space.s10)
            if let ordered, let apart = CompareCopy.apart(ordered.earlier.captureDate, ordered.later.captureDate) {
                Text(apart)
                    .font(Letterpress.data(11, weight: .medium, relativeTo: .caption))
                    .tracking(1.5)
                    .textCase(.uppercase)
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .padding(.top, Letterpress.Space.s10)
    }

    // MARK: Stage

    @ViewBuilder private var stage: some View {
        if let ordered {
            Group {
                switch mode {
                case .sideBySide: sideBySide(ordered).transition(.opacity)
                case .overlay: overlayStage(ordered).transition(.opacity)
                case .flip: flipStage(ordered).transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: mode)
        } else if let error = strip.error, strip.photos.isEmpty {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(error)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { strip.reload() }
                    .buttonStyle(.letterpress(.outlined))
            }
        } else if strip.photos.count < 2 && !strip.loading {
            sentence(CompareCopy.emptySentence(total: strip.photos.count))
        } else {
            sentence(CompareCopy.pickTwo)
        }
    }

    private func sideBySide(_ ordered: Ordered) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s18))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Letterpress.Space.s4))
        return layout {
            pane(ordered.earlier, role: .earlier, routines: timeline.response?.routinesAtFrom)
            pane(ordered.later, role: .later, routines: timeline.response?.routinesAtTo)
        }
    }

    private func pane(_ photo: ComparePhoto, role: CompareRole, routines: [CareRoutineRevision]?) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Button { detail = photo } label: {
                CompareMat { CompareImage(photo: photo, strip: strip) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CompareCopy.paneLabel(role: role, date: photo.captureDate))
            .accessibilityHint(CompareCopy.openHint)
            stamp(photo)
            if let line = routines.flatMap(CompareCopy.routineLine) {
                Text(line)
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .textCase(.uppercase)
                    .foregroundStyle(Letterpress.inkTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func overlayStage(_ ordered: Ordered) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            CompareMat {
                ZStack {
                    CompareImage(photo: ordered.earlier, strip: strip)
                    CompareImage(photo: ordered.later, strip: strip).opacity(overlay)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CompareCopy.overlayLabel)
            .accessibilityValue(CompareCopy.overlayValue(overlay))
            twoStamps(ordered)
            HStack(alignment: .firstTextBaseline) {
                Text(CompareCopy.overlaySlider)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                Spacer(minLength: Letterpress.Space.s10)
                Text(CompareCopy.percent(overlay))
                    .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.ink)
            }
            .accessibilityHidden(true)
            Slider(value: $overlay, in: 0...1)
                .tint(Letterpress.ink)
                .frame(minHeight: Letterpress.minTouch)
                .accessibilityLabel(CompareCopy.overlaySlider)
                .accessibilityValue(CompareCopy.overlayValue(overlay))
            adaptiveRow {
                Button(CompareCopy.openEarlier) { detail = ordered.earlier }.buttonStyle(.letterpress(.underline))
                Button(CompareCopy.openLater) { detail = ordered.later }.buttonStyle(.letterpress(.underline))
            }
        }
    }

    private func flipStage(_ ordered: Ordered) -> some View {
        let shown = showingLater ? ordered.later : ordered.earlier
        return VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            CompareMat {
                ZStack {
                    CompareImage(photo: ordered.earlier, strip: strip).opacity(showingLater ? 0 : 1)
                    CompareImage(photo: ordered.later, strip: strip).opacity(showingLater ? 1 : 0)
                }
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: showingLater)
            }
            .contentShape(Rectangle())
            .onTapGesture { showingLater.toggle() }
            .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { value in
                let width = abs(value.translation.width)
                if width > Letterpress.minTouch && width > abs(value.translation.height) { showingLater.toggle() }
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CompareCopy.flipLabel(showingLater: showingLater, date: shown.captureDate))
            .accessibilityHint(CompareCopy.flipHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { showingLater.toggle() }
            HStack(alignment: .firstTextBaseline) {
                Text(showingLater ? CompareRole.later.label : CompareRole.earlier.label)
                    .letterpressEyebrow(color: Letterpress.ink)
                Spacer(minLength: Letterpress.Space.s10)
                stamp(shown)
            }
            sentence(CompareCopy.flipHelp)
            Button(CompareCopy.openShown) { detail = shown }
                .buttonStyle(.letterpress(.underline))
        }
    }

    private func twoStamps(_ ordered: Ordered) -> some View {
        adaptiveRow {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(CompareRole.earlier.label).letterpressEyebrow()
                stamp(ordered.earlier)
            }
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(CompareRole.later.label).letterpressEyebrow()
                stamp(ordered.later)
            }
        }
    }

    private func stamp(_ photo: ComparePhoto) -> some View {
        Text(photo.captureDate.map { LetterpressFormat.stampTime($0) } ?? CompareCopy.undatedStamp.uppercased())
            .font(Letterpress.data(11, weight: .medium, relativeTo: .caption))
            .foregroundStyle(Letterpress.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Mode, filmstrip, timeline

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            LetterpressPicker(title: "Compare mode", selection: $mode) {
                ForEach(CompareMode.allCases, id: \.self) { Text($0.title).tag($0) }
            }
            .disabled(ordered == nil)
            if ordered == nil {
                sentence(CompareCopy.modeDisabledReason)
            }
        }
    }

    private var filmstrip: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CompareCopy.pickEyebrow).letterpressEyebrow()
            if strip.loading && strip.photos.isEmpty {
                sentence(CompareCopy.loadingPhotos)
            }
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: Letterpress.Space.s6) {
                    ForEach(strip.photos) { photo in
                        CompareThumbnail(photo: photo, role: pair.role(of: photo, date: \.captureDate), strip: strip) {
                            pair.toggle(photo)
                        }
                        .onAppear { if photo == strip.photos.last { strip.loadMore() } }
                    }
                }
                .padding(.vertical, Letterpress.Space.s4)
            }
            .scrollIndicators(.hidden)
            if let error = strip.error, !strip.photos.isEmpty {
                Text(error)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { strip.loadMore() }
                    .buttonStyle(.letterpress(.outlined))
            }
            sentence(CompareCopy.pickHelp)
        }
    }

    private var changed: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            adaptiveRow {
                Text(CompareCopy.changedEyebrow).letterpressEyebrow()
                if case .ready(let checkedAt, true) = timeline.state {
                    Text(RoutineRecordCopy.lastChecked(checkedAt)).letterpressEyebrow(color: Letterpress.attentionText)
                }
            }
            timelineBody
        }
    }

    @ViewBuilder private var timelineBody: some View {
        switch timeline.state {
        case .idle:
            sentence(ordered == nil ? CompareCopy.pickTwo : (hasDates ? CompareCopy.loadingTimeline : CompareCopy.undated))
        case .loading:
            sentence(CompareCopy.loadingTimeline)
        case .unavailable:
            sentence(CompareCopy.timelineUnavailable)
        case .tooFarApart:
            sentence(CompareCopy.tooFarApart)
        case .failed:
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(CompareCopy.timelineError)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { retry += 1 }
                    .buttonStyle(.letterpress(.outlined))
            }
        case .ready(_, let stale):
            let rows = timeline.response.map { CompareTimeline.rows($0) } ?? []
            VStack(alignment: .leading, spacing: 0) {
                if rows.isEmpty {
                    sentence(CompareCopy.nothingRecorded)
                } else {
                    ForEach(rows) { CompareTimelineRowView(row: $0) }
                    LetterpressRule()
                }
                if stale {
                    Button("Try again") { retry += 1 }
                        .buttonStyle(.letterpress(.underline))
                        .padding(.top, Letterpress.Space.s6)
                }
            }
        }
    }

    // MARK: Helpers

    private func sentence(_ text: String) -> some View {
        Text(text)
            .font(Letterpress.ui(13, relativeTo: .footnote))
            .foregroundStyle(Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func adaptiveRow<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s6))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Letterpress.Space.s18))
        return layout { content() }
    }

    private var hasDates: Bool {
        ordered.map { $0.earlier.captureDate != nil && $0.later.captureDate != nil } ?? false
    }

    private var timelineKey: String {
        guard let ordered else { return "none" }
        let generation = APIService.shared.access.snapshot()?.generation.uuidString ?? "signed-out"
        return "\(ordered.earlier.id.uriRepresentation().absoluteString)|\(ordered.later.id.uriRepresentation().absoluteString)|\(generation)|\(retry)"
    }

    private func pickDefaultPair() {
        guard !pickedDefault, strip.photos.count >= 2 else { return }
        pickedDefault = true
        pair = ComparePair([strip.photos[1], strip.photos[0]])
    }

    private func loadTimeline() async {
        guard let ordered, let from = ordered.earlier.captureDate, let to = ordered.later.captureDate,
              let ticket = APIService.shared.access.snapshot(),
              viewContext.userInfo["accountID"] as? UUID == ticket.accountID else {
            timeline.clear()
            return
        }
        await timeline.load(from: from, to: to, ticket: ticket)
    }
}

/// Record's Compare segment with fewer than two photos (spec §5 empty: serif title, one sentence, one action).
struct CompareEmptyState: View {
    let total: Int
    let takePhoto: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CompareCopy.emptyTitle)
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(CompareCopy.emptySentence(total: total))
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(CompareCopy.emptyAction, action: takePhoto)
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .padding(.top, Letterpress.Space.s6)
        }
        .accessibilityIdentifier("compareEmpty")
    }
}

/// 4:5 mat with square corners (spec §4.5). Under Compare's dark scheme `surface` is near-black.
private struct CompareMat<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        Rectangle()
            .fill(Letterpress.surface)
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay { content() }
    }
}

/// One photo, fitted inside its mat and never cropped. Decodes once per photo; a failed read says so in words.
private struct CompareImage: View {
    let photo: ComparePhoto
    let strip: ComparePhotoStrip
    @State private var image: UIImage?
    @State private var unreadable = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .accessibilityHidden(true)
            } else if unreadable {
                Text(CompareCopy.photoUnreadable)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(Letterpress.Space.s10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: photo.id) {
            image = strip.image(for: photo, maxPixelSize: ComparePhotoStrip.stagePixelSize, in: strip.stageImages)
            unreadable = image == nil
        }
    }
}

/// A filmstrip thumbnail: 60×75pt (88×110 at accessibility sizes), inset ink outline and a role word when picked.
private struct CompareThumbnail: View {
    let photo: ComparePhoto
    let role: CompareRole?
    let strip: ComparePhotoStrip
    let toggle: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var image: UIImage?

    var body: some View {
        let width: CGFloat = dynamicTypeSize.isAccessibilitySize ? 88 : 60
        Button(action: toggle) {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Rectangle()
                    .fill(Letterpress.surface)
                    .frame(width: width, height: width * 5 / 4)
                    .overlay {
                        if let image {
                            Image(uiImage: image).resizable().scaledToFit()
                        }
                    }
                    .overlay {
                        if role != nil {
                            Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5)
                        }
                    }
                if let role {
                    Text(role.label)
                        .letterpressEyebrow(color: Letterpress.ink)
                        .fixedSize(horizontal: true, vertical: true)
                } else {
                    Text(photo.captureDate.map { LetterpressFormat.stamp($0) } ?? CompareCopy.undatedStamp.uppercased())
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                        .fixedSize(horizontal: true, vertical: true)
                }
            }
            .frame(minWidth: width, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(CompareCopy.thumbnailLabel(date: photo.captureDate))
        .accessibilityValue(role?.accessibilityValue ?? "")
        .accessibilityAddTraits(role == nil ? [] : .isSelected)
        .task(id: photo.id) {
            image = strip.image(for: photo, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails)
        }
    }
}

/// One ruled timeline row: mono date column, then the change in words and any answers as given.
private struct CompareTimelineRowView: View {
    let row: CompareTimelineRow
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14))
        layout {
            Text(row.date)
                .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
                .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? nil : 72, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text(row.text)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(Array(row.answers.enumerated()), id: \.offset) { _, answer in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(answer.prompt)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(answer.answer)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .combine)
    }
}
```

(`spacing: 2` between a prompt and its answer is a text leading, not a spacing-scale gap; if the per-task reviewer rejects it, use `Letterpress.Space.s4`.)

- [ ] **Step 4: Run to verify it passes, plus the sweep**

Run: **TEST** with `-only-testing:ClearAFTests/CompareViewSourceTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (3 + 4 tests). The app target builds with `ComparePhotosView` unused until Task 6.

- [ ] **Step 5: Commit**

```bash
git add ClearAF/Views/CompareView.swift ClearAFTests/CompareViewSourceTests.swift
git commit -m "ios: compare screen with side by side, overlay, flip, filmstrip and timeline" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Record's Compare segment [judgment]

**Files:**
- Modify: `ClearAF/Views/ProgressView.swift` (layout enum, state, picker, content branch, modifiers, pagination guard)
- Modify: `ClearAF/Views/PhotoRecordDisplay.swift` (append a `PhotoRecordLayout` extension)
- Modify: `docs/design/letterpress/deferred.md` (two rows)
- Test: create `ClearAFTests/CompareRecordEntryTests.swift`

**Interfaces:**
- Consumes: Task 5 `ComparePhotosView()`, `CompareEmptyState(total:takePhoto:)`; PR 3 Record (`store`, `layout`, `capturing`, `viewContext`); `LetterpressSweepTests.repoRoot`.
- Produces: `enum PhotoRecordLayout: Hashable { case grid, list, compare }`; `PhotoRecordLayout.presentsCompare(_:total:capturing:) -> Bool`, `.showsCompareEmpty(_:total:) -> Bool`, `func browsing(fallback:) -> PhotoRecordLayout`. UI tests keep addressing segments by title (`Grid`, `List`, `Compare`).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/CompareRecordEntryTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

struct CompareRecordEntryTests {
    @Test func compareOpensOnlyWithTwoPhotosAndNeverOverTheCamera() {
        #expect(!PhotoRecordLayout.presentsCompare(.compare, total: 1, capturing: false))
        #expect(PhotoRecordLayout.presentsCompare(.compare, total: 2, capturing: false))
        #expect(!PhotoRecordLayout.presentsCompare(.compare, total: 2, capturing: true), "never stacks on the camera sheet")
        #expect(!PhotoRecordLayout.presentsCompare(.grid, total: 40, capturing: false))
        #expect(PhotoRecordLayout.showsCompareEmpty(.compare, total: 0))
        #expect(PhotoRecordLayout.showsCompareEmpty(.compare, total: 1))
        #expect(!PhotoRecordLayout.showsCompareEmpty(.compare, total: 2))
        #expect(!PhotoRecordLayout.showsCompareEmpty(.list, total: 0))
        #expect(PhotoRecordLayout.compare.browsing(fallback: .list) == .list)
        #expect(PhotoRecordLayout.grid.browsing(fallback: .list) == .grid)
    }

    @Test func recordOffersGridListCompareAndPresentsCompareFullScreen() throws {
        let text = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/ProgressView.swift"), encoding: .utf8)
        let grid = try #require(text.range(of: "Text(\"Grid\").tag(PhotoRecordLayout.grid)"))
        let list = try #require(text.range(of: "Text(\"List\").tag(PhotoRecordLayout.list)"))
        let compare = try #require(text.range(of: "Text(\"Compare\").tag(PhotoRecordLayout.compare)"))
        #expect(grid.lowerBound < list.lowerBound && list.lowerBound < compare.lowerBound)
        #expect(text.contains(".fullScreenCover(isPresented: comparing)"))
        #expect(text.contains("ComparePhotosView().environment(\\.managedObjectContext, viewContext)"))
        #expect(text.contains("CompareEmptyState(total: store.total)"))
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: **TEST** with `-only-testing:ClearAFTests/CompareRecordEntryTests`
Expected: build FAIL — `type 'PhotoRecordLayout' has no member 'presentsCompare'`.

- [ ] **Step 3: Add routing helpers** — append to `ClearAF/Views/PhotoRecordDisplay.swift`

```swift

/// Compare is Record's third segment (spec §4.3). It opens full screen only with two photos and never over the camera.
extension PhotoRecordLayout {
    static func presentsCompare(_ layout: PhotoRecordLayout, total: Int, capturing: Bool) -> Bool {
        layout == .compare && total >= 2 && !capturing
    }

    static func showsCompareEmpty(_ layout: PhotoRecordLayout, total: Int) -> Bool {
        layout == .compare && total < 2
    }

    /// The Grid or List layout drawn under Compare.
    func browsing(fallback: PhotoRecordLayout) -> PhotoRecordLayout {
        self == .compare ? fallback : self
    }
}
```

- [ ] **Step 4: Wire Record** — `ClearAF/Views/ProgressView.swift`

Replace

```swift
enum PhotoRecordLayout: Hashable { case grid, list }

/// Record (spec §6 #5): month rules over the existing 24-photo pages, 4:5 tiles with named states, native Grid/List.
```

with

```swift
enum PhotoRecordLayout: Hashable { case grid, list, compare }

/// Record (spec §6 #5): month rules over the existing 24-photo pages, 4:5 tiles with named states, native Grid/List/Compare.
```

Replace

```swift
    @State private var layout = PhotoRecordLayout.grid
```

with

```swift
    @State private var layout = PhotoRecordLayout.grid
    @State private var browsingLayout = PhotoRecordLayout.grid
```

Replace

```swift
                        Text("Grid").tag(PhotoRecordLayout.grid)
                        Text("List").tag(PhotoRecordLayout.list)
                    }
```

with

```swift
                        Text("Grid").tag(PhotoRecordLayout.grid)
                        Text("List").tag(PhotoRecordLayout.list)
                        Text("Compare").tag(PhotoRecordLayout.compare)
                    }
```

Replace

```swift
                    if !store.photos.isEmpty {
                        pagination.padding(.top, Letterpress.Space.s22)
                    }
```

with

```swift
                    if !store.photos.isEmpty && !PhotoRecordLayout.showsCompareEmpty(layout, total: store.total) {
                        pagination.padding(.top, Letterpress.Space.s22)
                    }
```

Replace

```swift
            .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
```

with

```swift
            .sheet(isPresented: $capturing, onDismiss: { if layout == .compare { layout = browsingLayout } }) { DurablePhotoCaptureView() }
            .fullScreenCover(isPresented: comparing) {
                ComparePhotosView().environment(\.managedObjectContext, viewContext)
            }
            .onChange(of: layout) { _, next in
                if next != .compare { browsingLayout = next }
            }
```

In `content`, replace

```swift
        } else if store.photos.isEmpty {
```

with

```swift
        } else if PhotoRecordLayout.showsCompareEmpty(layout, total: store.total) {
            CompareEmptyState(total: store.total) { capturing = true }
        } else if store.photos.isEmpty {
```

and replace

```swift
                if layout == .grid {
```

with

```swift
                if layout.browsing(fallback: browsingLayout) == .grid {
```

After the `columns` property add:

```swift
    /// Compare is presented while its segment is selected; closing it returns the segment to Grid or List.
    private var comparing: Binding<Bool> {
        Binding(get: { PhotoRecordLayout.presentsCompare(layout, total: store.total, capturing: capturing) },
                set: { if !$0 { layout = browsingLayout } })
    }
```

- [ ] **Step 5: Record the omitted controls** — append to the table in `docs/design/letterpress/deferred.md`

```markdown
| iOS Compare | "Share" | No way to share clinical photos outside the record; adding one is a data-handling change |
| iOS Compare | "by Dr. Om" on routine changes | Revisions store the author's ID, not a name |
```

- [ ] **Step 6: Run to verify it passes**

Run: **TEST** with `-only-testing:ClearAFTests/CompareRecordEntryTests -only-testing:ClearAFTests/PhotoRecordTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (2 + existing PhotoRecordTests + sweep).

- [ ] **Step 7: Commit**

```bash
git add ClearAF/Views/ProgressView.swift ClearAF/Views/PhotoRecordDisplay.swift ClearAFTests/CompareRecordEntryTests.swift docs/design/letterpress/deferred.md
git commit -m "ios: Compare as Record's third segment with an empty state" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: PR 7 verification [mechanical]

**Files:** none modified unless a check fails (fix, rerun only that check).

- [ ] **Step 1: Unit gates**

Run: `cd backend && npm test && npm run build`
Expected: all tests pass; `tsc` exits 0.
Run: **TEST** with `-only-testing:ClearAFTests` (whole unit bundle).
Expected: all suites pass, including `CompareTimelineTests`, `CompareCopyTests`, `ComparePhotoStripTests`, `CompareViewSourceTests`, `CompareRecordEntryTests`, `LetterpressSweepTests`, `LetterpressTests`.
Portal is untouched: `git diff --stat main -- web-portal` → no output.

- [ ] **Step 2: Reviews**

Run `/code-review` on the branch. Confirm `care-access-reviewer` and `api-contract-checker` findings from Tasks 1–2 are resolved (rerun each once on the final diff of `backend/` and `ClearAF/Services/`).

- [ ] **Step 3: One bounded Simulator pass** (local stack; `xcodebuildmcp-cli` skill)

Setup: `node scripts/local.cjs start`, `cd backend && npm run build && npm run dev`, `cd web-portal && npm run dev`. Sign in on iPhone 17 (Debug) as a local synthetic `@example.invalid` patient with an assigned clinician. Add two synthetic images to the Simulator library (`xcrun simctl addmedia booted <a.jpg> <b.jpg>`).

1. Record → Compare with 0 photos: "Two photos needed", one filled "Take a photo". Take one photo; closing the camera returns to Grid. Compare with 1 photo: the one-photo sentence.
2. Between captures, in the portal as the clinician save a morning routine version; in the app record that routine and send a check-in; take the second photo.
3. Record → Compare opens full screen, no tab bar: "Same day", both photos uncropped on the dark mat, stamps, `MORNING V…` lines, "What changed in between" shows the recorded-days row, "Morning routine updated to v…" (or "assigned · v1") and "Check-in sent" with answers as given. Tap a photo → the detail sheet shows it whole.
4. Overlay: slider moves the later photo's opacity; Flip: tap and swipe switch photos. Filmstrip: tap a picked thumbnail to remove it (mode picker disables with its reason), pick again.
5. Stop the backend and tap "Try again" on the loaded pair: rows stay with `LAST CHECKED …` in ochre. Restart the backend.
6. Screenshots in light and dark system appearance (Compare stays dark; Record underneath returns to the system appearance after Done), and at the largest accessibility text size: panes stack, mode picker becomes a menu, no clipped text.
7. Settings → Accessibility → Motion → Reduce Motion on: mode switch and flip change instantly.

Record findings in the PR description. Rerun only a failed item after its fix.

- [ ] **Step 4: §8 checklist for Compare and Record**

One filled ink button per screen (Compare: none; empty state: Take a photo); no hue except the stale eyebrow; no card or nested boxes; no glass on Compare; every number mono; text contrast from dark tokens only; light/dark checked; largest text doesn't clip; Reduce Motion respected; all nine §5 states as tabled above; iOS buttons ≥ 44pt; no bottom spacer; no score, streak, grade or improvement claim; photos untinted, uncropped, original reachable; no retired tokens.

---

## Controller notes (added at execution)

- PRs 1–6 are merged. Trust merged code over this plan's assumptions, especially in `ProgressView.swift` (grid tiles show state only; Share and Retry live in the photo detail), `PhotoRecordDisplay.swift`, `LetterpressFormat` (cached formatters) and `CompletionCalendarView` (the calendar grid now pins 44pt cells).
- ONE xcodebuild at a time, foreground, long timeout. Concurrent runs deadlocked this machine for 7 hours.
- The `axe` tap-automation channel is broken on this machine (Xcode 27 / macOS 26.6): use XCUITest, not simulated taps.
- The controller deploys the API before merge (owner authorized).
- Commits end with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014Fkk5DxDotGjtsofAxspCT`.
