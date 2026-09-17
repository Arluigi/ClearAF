# Letterpress PR 5: Portal Patient Workspace and Remaining Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-sequence the portal patient workspace into URL-addressed tabs (Photos · Routine · Check-ins · Messages · History) with Compare as the default photo view, a care rail, "Send & mark reviewed", a visible routine draft with version history, question-by-question check-ins, and bring Messages, Templates, Sign in, Account, the auth pages, the nav rail and the Release 1 components to Letterpress 1.0, with one additive read-only API endpoint.

**Architecture:** The workspace page owns tab state in the URL (`?tab=`, pushed with `history.pushState`, read with `useSearchParams`) on top of PR 4's list context, keeps each visited tab mounted (hidden when inactive) so drafts survive tab switches, and lifts the routine controller so the Routine tab, the History tab and the Photos rail share one snapshot. Every new screen is split into a pure view (rendered in tests with `react-dom/server`) and a thin container that owns API calls. New client logic lives in small pure modules (`lib/workspace.ts`, `lib/photo-feedback.ts`, helpers added to `routine-care.ts`, `care-support.ts`, `assigned-messaging.ts`, `urgent-reports.ts`). The only backend change is `GET /api/routines/patients/:patientId/revisions`, a read-only list of saved routine versions; the portal treats a route-level 404 as "not available yet".

**Tech Stack:** Next.js 15 App Router / React 19 / Tailwind 3.4 / Radix Tabs + Dialog, Node test runner (`node --import tsx --test`); Express + zod + Prisma 5 query client; Playwright MCP for the visual pass.

**Spec:** `docs/design/letterpress/spec.md` (authority: §0, §2, §3, §4.1–4.3, §4.5, §4.7, §4.9, §5, §6 portal #2–#8, §7, §8). Master plan `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, Owner decisions, Findings, Roadmap row PR 5). PR 2 plan `docs/superpowers/plans/2026-09-17-letterpress-pr2-primitives.md` (Interfaces: Produces). PR 4 plan `docs/superpowers/plans/2026-09-17-letterpress-pr4-worklist.md` (Task 4 Produces). Mockup `docs/design/letterpress/portal.dc.html` screens "Workspace photos" (lines 119–177), "Workspace routine" (182–248), "Workspace check-ins" (253–306), "Portal messages" (311–340), "Portal templates" (345–361), "Portal login" (366–388), "Portal account" (392–415). Spec wins over mockup.

## Global Constraints

- Master plan Global Constraints apply: no Supabase schema/RLS/table/column/RPC change; no auth/session change; routine versioning (save creates a new version; the patient stays on the previous version until save completes), check-in form versioning and required flags, photo review state machine (per-photo `PUT /photo-reviews/photos/:id`), review-queue ordering, existing pagination, completion timezone handling and message reference payloads are untouched.
- Never introduce a skin score, streak, grade, adherence target line, celebration, emoji or outcome promise. Check-in answers are shown as given, never averaged. If a number can't be sourced from real events, omit the block.
- Ink is the action colour. Ochre (`attention.*`) only for unread (unread patient messages, unread thread count) and the spec §6 portal #3 edited-step tint (`bg-attention-wash`). Urgent reports, care decisions, eligibility and errors are said in words (ink or `error`), never ochre.
- Dark-mode forbidden pairs stay forbidden: no `ink.future` text on `sunk`/`attention.wash`; no `ink.tertiary` text on `attention.wash` (inside an edited step, labels and metadata switch to `text-ink-secondary`).
- Exactly one filled ink button (`Button` default variant) visible per screen or tab. Portal controls 32–36px (`size="sm"` 32px, default 36px); `size="lg"` 44px only for the full-width Sign in / reset actions. Disabled buttons come with a sentence that says why.
- PR 2 names only: `Button` variants `default | outline | secondary | destructive | ghost | link`, sizes `default | sm | lg | icon`; `Badge` variants `default | secondary | destructive | outline | attention`; `TableCell numeric`; `TableRow data-state="selected"`; `TabsList variant="underline"`; Tailwind colours `canvas surface rail sunk ink{,-secondary,-tertiary,-future} attention-{mark,text,wash} error rule{,-strong,-field}`; radii `rounded-none | rounded | rounded-sheet | rounded-full`; utilities `selected-rule`, `selected-outline`, `.editorial-title`, `.font-data`, `.portal-page`. No shadow utilities except arbitrary inset rules, no hex colours, no hue classes, no shadcn alias classes (`tests/letterpress-sweep.test.ts`), and every class token must compile under Tailwind 3.4 (`tests/class-definitions.test.ts`).
- Photos are never cropped, tinted or filtered: `object-contain` on the `.photo-mat` (fixed near-black) mat; originals stay reachable (the compare panes load the signed original).
- Copy: sentence case, no exclamation marks, clinician dates mono (`02 SEP · 07:04`, from PR 4's `day`/`stamp`), numbers mono with tabular figures. The clinician and patient names come from real data.
- Two clients, one contract: the new endpoint is additive and portal-only (no iOS Codable change). Reviewers for Task 1: `api-contract-checker` and `care-access-reviewer`.
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`. No `console.*` in portal source (`tests/privacy.test.mjs`).
- Commands: portal single file `cd web-portal && node --import tsx --test tests/<file>`; portal gate `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`; backend `cd backend && npm test && npm run build`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Depends on PR 2 and PR 4 (used exactly as their plans declare)

- PR 2 (merged, `5dcb9c7`): the primitive names above; `tests/letterpress-rules.ts` exports `read`, `classesOf`, `allClasses`, `has`.
- PR 4 (lands before this PR):
  - `@/lib/patient-navigation`: `patientListContext(params) → { page, search, filter }`, `patientListQuery(page, search, filter?)` (default filter omitted from the query).
  - `@/lib/worklist`: `plural(count, word)`, `localDateOf(date)`, `clock(date)` (`08:40`), `day(iso)` (`02 SEP`), `stamp(iso)` (`02 SEP · 07:04`).
  - `tests/worklist-page.test.ts` asserts `src/app/patients/[id]/page.tsx` contains `'/patients?' + patientListQuery(context.page, context.search, context.filter)`. The rewrite in Task 2 keeps that exact expression.
  - Flagged worklist rows link to `/patients/<id>?…#urgent`; Task 2 keeps `id="urgent"` above the tabs and scrolls to it.
- Branch `design/letterpress-5-workspace` from `main` after PR 4 merges. If any PR 4 name above differs in the merged code, use the merged name and keep the behaviour.

## Decisions made while planning

1. **Tab state.** `?tab=photos|routine|check-ins|messages|history` (photos omitted), appended to PR 4's list query. Tabs change with `window.history.pushState` (Next 15 syncs `useSearchParams`), so reload restores the tab and Back steps through tabs. Radix `activationMode="manual"` keeps arrow keys from pushing a history entry per key press. Unknown values fall back to Photos.
2. **Drafts survive tab switches.** A tab mounts on first visit and then stays mounted with `forceMount` + `data-[state=inactive]:hidden`. The routine controller is lifted to the page (`useRoutineCare`), so the Routine tab, the History tab (completion events) and the Photos rail share one snapshot and one completion-history state. `beforeunload` still guards unsaved routine drafts; the check-in form editor and composers keep their own `useUnsaved` guards.
3. **Urgent reports stay above the tabs**, always visible: open and seen reports as ruled rows in words, resolved reports folded into a `<details>`. This keeps PR 4's `#urgent` link working without tab juggling and never hides an unresolved report behind a tab. Care status, the completion calendar and completion events move to History.
4. **"Send & mark reviewed" sequences two existing idempotent calls** (`PUT /assigned-messages/…/messages/:id` with a photo reference, then `PUT /photo-reviews/photos/:id`) through `PhotoFeedbackController`. A lost send keeps the frozen message and retries the same id; a failed mark after a confirmed send retries only the mark ("Message sent. The photo is not marked reviewed yet."). The review is written through the existing `PhotoReviewController.mark`, so review state has one owner. No combined endpoint.
5. **Compare is the default Photos view**: side by side (one or two photos) with zoom, originals on the photo mat, defaulting to the newest photo on the page and the one before it. Selection keeps PR 1's "at most two" rule; a third tile is disabled with a sentence saying why. The single-photo and compare dialogs are removed (`restorePhotoFocus`, `photoDetailState` and their tests go with them). Overlay/Grid modes, a bulk "Mark N reviewed" and "Save draft" are deferred.
6. **Routine version history needs an endpoint.** Today's API returns only the latest revision per slot; completions carry only revisions that were completed. `GET /api/routines/patients/:patientId/revisions?timeOfDay=&page=&limit=` returns saved revisions newest first (same auth, lock and 404 concealment as `/completions`). A 404 **without** a `code` (the API's catch-all "Route not found") renders "Earlier versions are not available from this server yet."; 404 `NOT_FOUND` (not assigned) and network errors stay errors.
7. **Draft diff is positional.** Each draft step is compared with the saved step at the same index: changed title → `Edited · was "<old title>"`, changed instructions → `Edited · was "<old instructions>"`, extra step → `New step`, fewer steps → `N steps removed`. A move therefore shows as edits, which is accurate about what the patient will see. "Discard draft" (new `RoutineCareController.discard`) restores the saved revision and is refused while a save is unresolved. Saving still calls the unchanged `save`.
8. **One filled button with two panes.** `Save as v{n}` is filled only on the first dirty slot (morning before evening); the other slot's save is outlined. Photos tab: `Send & mark reviewed`. Check-ins: `Reply to {first name}` (the form editor's save is filled only while editing, when responses are hidden). Messages: `Send`. Templates: `Save as v{n}` when the editor is open, otherwise `New template`. Sign in: `Sign in`. Account has no filled button: its only primary action in the mockup (Save profile) is omitted.
9. **Check-ins:** response rate and schedule are not derivable (forms have no schedule, so there is no expected count) and are omitted. The rail plots one choice question at a time across the loaded page: each response is a column with one slot per option **of that response's form version**, first option at the bottom, a dot on the answer as given, plus the same answers in a words table. No averaging, no score.
10. **Templates:** "In use" is omitted (no link from a patient routine to its source template). Archive is supported today (saving with `isActive: false`), so Archive/Restore buttons replace the checkbox and each saves the next version.
11. **Messages:** "Attach photo reference" is supported today (`reference: { type: 'photo', id }` on send, already used via the URL). A picker dialog lists the patient's shared photos (existing summaries + thumbnails). Thread search is omitted (inbox has no search).
12. **Sign in** uses a shared `AuthShell` (also register, forgot and reset password): wordmark text placeholder (`data-placeholder="wordmark"`, PR 8 replaces it), baseline-rule fields, ink quote panel, and a true session line in mono ("Signed-in sessions stay in this browser until you sign out"). The mockup's "HIPAA-aligned handling · 30 min idle" is not true of this product and `tests/privacy.test.mjs` forbids unverified compliance claims. "Show" is a Plex text control (§2: control labels never mono).
13. **Account** is a read-only ruled profile (display name, specialization when present, work email) with Change password and Sign out. `PATCH /users/profile` exists but the portal has never edited clinician profiles; adding a write flow is out of scope for a redesign and is recorded in `deferred.md`.
14. **Redirect-only pages** (`dashboard`, `appointments`, `prescriptions`, `profile`, `settings`, root) render nothing and are unchanged (`tests/privacy.test.mjs` requires the redirects).
15. **Nav rail** is 200px on `rail`: Worklist (`/patients`), Messages, Templates, Account; Stethoscope + "ClearAF" as the placeholder mark (PR 8); user and Sign out at the foot. Mockup counts, the unread dot and "Check-in forms" are omitted (the rail loads no worklist or inbox data; there is no forms page).
16. **Shared type classes** added once in `globals.css` (`@layer components`/`utilities`, allowed by the class-definitions test): `.eyebrow` (mono 500 10px .16em uppercase `ink.tertiary`), `.meta-mono` (mono 11px tabular uppercase `ink.tertiary`), `.photo-mat` (fixed `rgb(18 19 18)` with `rgb(242 239 231)` text in both appearances).

### Spec contradictions and rulings

- §1/Global "ochre only for unread and prescription" vs §6 portal #3 "edited step tinted attention.wash": the screen-specific rule wins (as PR 3 ruled for §4.5); ochre appears nowhere else in this PR except unread.
- Mockup filled buttons "Mark 3 reviewed" + "Send & mark reviewed", and "New template" + "Save as v4": §8 "exactly one filled ink button" wins (Decision 8).
- Mockup sign-in session line and mono SHOW: see Decision 12.
- §6 portal #8 practice/notifications/session timeout/audit export and #4 response rate/schedule, #6 "In use": omitted per owner decision 1.
- §5 stale state (`attention.text` eyebrow): not used; stale/error copy is words in ink, as PR 4 ruled.

## API contract (Task 1)

`GET /api/routines/patients/:patientId/revisions?timeOfDay=morning|evening&page=1..1000000&limit=1..50` — `timeOfDay` required, `page` default 1, `limit` default 20, unknown keys → 400. Auth: `authenticateToken` + `requireDermatologist`; the patient row is locked and the **current** assignment checked inside the transaction (`404 NOT_FOUND` when not assigned). 200: `{ data: RoutineRevision[]; pagination: { page, limit, total, totalPages } }`, `data` ordered `version desc`, each row exactly the existing `RoutineRevision` shape (`id userId timeOfDay version createdBy createdAt name isActive steps`). Errors: 400 `VALIDATION_ERROR`, 401, 403 `INSUFFICIENT_PERMISSIONS` (patient), 404 `NOT_FOUND`, 500 `ROUTINE_ERROR`. An API without the route answers 404 `{ error: 'Route not found' }` (no `code`).

## File map

| File | Task | Responsibility |
|---|---|---|
| `backend/src/services/routineCare.ts`, `backend/src/routes/routines.ts` | 1 | `revisions()` service; thin GET route |
| `backend/tests/routine-care.test.ts` | 1 | Route tests (append) |
| `web-portal/src/lib/api.ts`, `web-portal/src/lib/routine-care.ts` | 1 | `getPatientRoutineRevisions`; `loadRevisionHistory` fallback |
| `web-portal/tests/routine-revisions-api.test.ts` | 1 | Client path and fallback |
| `web-portal/src/lib/workspace.ts` | 2, 3 | Tabs, URL, since label, first name (2); compare/reply helpers (3) |
| `web-portal/src/app/globals.css` | 2 | `.eyebrow`, `.meta-mono`, `.photo-mat` |
| `web-portal/src/app/patients/[id]/page.tsx` | 2, 3, 4, 5 | Tabbed workspace (2); wiring props (3–5) |
| `web-portal/src/components/patients/useRoutineCare.ts`, `RoutineCompletionHistory.tsx` | 2 | Lifted routine controller; completion events table |
| `web-portal/src/components/patients/workspace/WorkspaceHeader.tsx` | 2 | Serif name, since line, Message action |
| `web-portal/src/components/patients/PatientUrgentReports.tsx`, `EnrollmentStatus.tsx`, `web-portal/src/lib/urgent-reports.ts` | 2 | Words-only urgent reports above tabs; mono eligibility |
| `web-portal/src/components/layout/Sidebar.tsx`, `web-portal/src/components/care-support/shared.tsx` | 2 | 200px rail; named loading copy |
| `web-portal/src/app/messages/page.tsx`, `web-portal/src/lib/assigned-messaging.ts` | 2, 6 | `messageReference` (2); thread list page and helpers (6) |
| `web-portal/src/components/patients/PatientRoutineCare.tsx` | 2, 4 | Controller as props (2); two-pane editor container (4) |
| `web-portal/tests/workspace.test.ts` | 2 | Shell tests |
| `web-portal/src/lib/photo-review.ts`, `photo-history.ts`, `photo-feedback.ts`, `care-support.ts` | 3 | Preselect + persistent compare; remove dialog state; reply controller; `answerText` |
| `web-portal/src/components/patients/PatientPhotoHistory.tsx`, `workspace/{PhotoCompareView,PhotoStrip,PhotoReplyView,CareRailView,CareRail}.tsx` | 3 | Photos tab |
| `web-portal/tests/photo-feedback.test.ts`, `workspace-photos.test.ts`, `photo-review.test.ts`, `photo-history.test.ts`, `photo-focus.test.ts` (deleted) | 3 | Tests |
| `web-portal/src/lib/routine-care.ts`, `workspace/{RoutineSlotEditor,RoutineVersionList,RoutineVersionHistory}.tsx`, `care-support/{TemplatePicker,TemplateList}.tsx` | 4 | Draft diff, badges, discard; editor panes; version history; templates beside |
| `web-portal/tests/routine-editor.test.ts` | 4 | Tests |
| `web-portal/src/components/care-support/{PatientCheckIns,CheckInViews,FormEditor}.tsx`, `web-portal/src/lib/care-support.ts` | 5 | Check-ins tab |
| `web-portal/tests/check-ins.test.ts` | 5 | Tests |
| `web-portal/src/components/messages/{ConversationView,MessageTurn,ThreadList,PhotoReferencePicker,PhotoReferenceList}.tsx` | 6 | Messages |
| `web-portal/tests/messages-view.test.ts` | 6 | Tests |
| `web-portal/src/app/templates/page.tsx`, `care-support/{TemplateEditor,TemplateTable}.tsx` | 7 | Templates |
| `web-portal/tests/templates-view.test.ts` | 7 | Tests |
| `web-portal/src/components/layout/AuthShell.tsx`, `app/{login,register,forgot-password,reset-password,account}/page.tsx`, `components/patients/{CareStatusCard,CareDecisionDialog}.tsx` | 8 | Sign in, auth pages, account, care status |
| `web-portal/tests/auth-pages.test.ts` | 8 | Tests |
| `docs/design/letterpress/deferred.md` | 2–8 | Omitted controls |

---

### Task 1: Read-only routine revision history endpoint and client [judgment]

Reviewers after this task: `care-access-reviewer` (lock + current-assignment check, patient 403, concealment 404) and `api-contract-checker` (new endpoint only; `RoutineRevision` shape reused; no iOS model affected).

**Files:**
- Modify: `backend/src/services/routineCare.ts` (append `revisions`)
- Modify: `backend/src/routes/routines.ts` (import, query schema, route)
- Test: `backend/tests/routine-care.test.ts` (append two tests)
- Modify: `web-portal/src/lib/api.ts` (method after `getPatientRoutineCompletions`)
- Modify: `web-portal/src/lib/routine-care.ts` (value import of `APIError`; append `RevisionHistory`, `loadRevisionHistory`)
- Test: create `web-portal/tests/routine-revisions-api.test.ts`

**Interfaces:**
- Consumes: `lock`, `authorize`, `prisma`, `slot`, `uuid` in `routineCare.ts`; `requireDermatologist`; the existing test harness in `routine-care.test.ts` (`edit`, `call`, `definition`, identities `A` patient, `C` assigned clinician, `D` other clinician).
- Produces: service `revisions(userId, clinicianId, timeOfDay, page, limit)`; route per **API contract**; `apiService.getPatientRoutineRevisions(patientId: string, timeOfDay: RoutineTimeOfDay, page = 1): Promise<PaginatedResponse<RoutineRevision>>`; `type RevisionHistory = { status: 'ready'; page: PaginatedResponse<RoutineRevision> } | { status: 'unsupported' }`; `loadRevisionHistory(fetch: () => Promise<PaginatedResponse<RoutineRevision>>): Promise<RevisionHistory>`.

- [ ] **Step 1: Write the failing backend tests** — append to `backend/tests/routine-care.test.ts`

```ts
test('revision history lists one slot newest first with bounded pagination for the assigned clinician',async()=>{
 const one=await edit();assert.equal(one.status,201);
 const two=await edit(randomUUID(),{...definition(one.body.routine.id),name:'Second synthetic routine'});assert.equal(two.status,201);
 assert.equal((await edit(randomUUID(),definition(),C,A,'evening')).status,201);
 const first=await call(`/patients/${A}/revisions?timeOfDay=morning&limit=1`,C);
 assert.equal(first.status,200);
 assert.deepEqual(first.body.data.map((r:any)=>[r.version,r.name,r.timeOfDay]),[[2,'Second synthetic routine','morning']]);
 assert.deepEqual(first.body.data[0].steps,[{title:'Synthetic step',instructions:'Synthetic instructions'}]);
 assert.deepEqual(first.body.pagination,{page:1,limit:1,total:2,totalPages:2});
 const second=await call(`/patients/${A}/revisions?timeOfDay=morning&page=2&limit=1`,C);
 assert.deepEqual(second.body.data.map((r:any)=>r.version),[1]);
 const evenings=await call(`/patients/${A}/revisions?timeOfDay=evening`,C);
 assert.deepEqual(evenings.body.data.map((r:any)=>r.timeOfDay),['evening']);
 assert.equal(evenings.body.pagination.limit,20);
});
test('revision history rejects patients, unassigned clinicians and invalid queries without writes',async()=>{
 assert.equal((await edit()).status,201);
 assert.equal((await call(`/patients/${A}/revisions?timeOfDay=morning`,A)).status,403);
 assert.equal((await call(`/patients/${A}/revisions?timeOfDay=morning`,D)).status,404);
 afterLock=()=>{assigned=D};assert.equal((await call(`/patients/${A}/revisions?timeOfDay=morning`,C)).status,404);assigned=C;
 for(const query of['','timeOfDay=noon','timeOfDay=morning&limit=51','timeOfDay=morning&page=0','timeOfDay=morning&limit=2.5','timeOfDay=morning&sort=version'])assert.equal((await call(`/patients/${A}/revisions?${query}`,C)).status,400,query);
 assert.equal((await call('/patients/not-a-uuid/revisions?timeOfDay=morning',C)).status,400);
 assert.equal(revisions.length,1);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && node --import tsx --test tests/routine-care.test.ts`
Expected: FAIL — the two new tests get 404 instead of 200/403/400 (no such route); existing tests pass.

- [ ] **Step 3: Add the service** — append to `backend/src/services/routineCare.ts`

```ts
/** Saved revisions for one slot, newest first. Read-only; same lock and assignment check as completion history. */
export async function revisions(userId: string, clinicianId: string, timeOfDay: 'morning'|'evening', page: number, limit: number) {
  return prisma.$transaction(async tx => {
    await lock(tx,userId); await authorize(tx,userId,clinicianId);
    const where = {userId,timeOfDay};
    const total = await tx.careRoutineRevision.count({where});
    const data = await tx.careRoutineRevision.findMany({where,orderBy:[{version:'desc'}],skip:(page-1)*limit,take:limit});
    return {data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
  });
}
```

- [ ] **Step 4: Add the route** — `backend/src/routes/routines.ts`

Change the service import to:

```ts
import { careError, completionInput, history, localDate, revisionInput, revisions, saveCompletion, saveRevision, slot, snapshot, uuid } from '../services/routineCare';
```

After the `const pagination = …` line add:

```ts
const revisionQuery = z.object({timeOfDay:slot,page:z.coerce.number().int().min(1).max(1000000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
```

After the `router.get('/patients/:patientId/completions', …)` line add:

```ts
router.get('/patients/:patientId/revisions',requireDermatologist,route(async(req,res)=>{const {timeOfDay,page,limit}=revisionQuery.parse(req.query);res.json(await revisions(uuid.parse(req.params.patientId),req.user!.id,timeOfDay,page,limit))}));
```

- [ ] **Step 5: Run backend tests and build**

Run: `cd backend && node --import tsx --test tests/routine-care.test.ts`
Expected: PASS (all tests, including the two new ones).
Run: `cd backend && npm test && npm run build`
Expected: all tests pass; `tsc` exits 0.

- [ ] **Step 6: Write the failing portal test** — `web-portal/tests/routine-revisions-api.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, authStorage, supabase } from '../src/lib/api';
import { APIError } from '../src/types/api';
import { loadRevisionHistory } from '../src/lib/routine-care';

test('revision history client targets the bounded clinician endpoint', async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const session = { access_token: 'synthetic-token', user: { id: 'account-a' } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async input => {
    requests.push(String(input));
    return new Response(JSON.stringify({ data: [], pagination: { page: 2, limit: 20, total: 0, totalPages: 0 } }), { status: 200 });
  };
  try {
    await apiService.getPatientRoutineRevisions('patient a', 'evening', 2);
    assert.deepEqual(requests.map(url => new URL(url).pathname + new URL(url).search), [
      '/api/routines/patients/patient%20a/revisions?timeOfDay=evening&page=2&limit=20',
    ]);
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});

test('an API without the endpoint reads as unsupported; access and network errors still surface', async () => {
  const page = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  assert.deepEqual(await loadRevisionHistory(async () => page), { status: 'ready', page });
  assert.deepEqual(await loadRevisionHistory(async () => { throw new APIError(404, 'Route not found'); }), { status: 'unsupported' });
  await assert.rejects(loadRevisionHistory(async () => { throw new APIError(404, 'Patient not found', 'NOT_FOUND'); }));
  await assert.rejects(loadRevisionHistory(async () => { throw new TypeError('offline'); }));
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/routine-revisions-api.test.ts`
Expected: FAIL — `apiService.getPatientRoutineRevisions is not a function` and `loadRevisionHistory` is not exported.

- [ ] **Step 8: Add the client method** — `web-portal/src/lib/api.ts`, after `getPatientRoutineCompletions`

```ts
  async getPatientRoutineRevisions(
    patientId: string,
    timeOfDay: RoutineTimeOfDay,
    page: number = 1,
  ): Promise<PaginatedResponse<RoutineRevision>> {
    const params = new URLSearchParams({ timeOfDay, page: String(page), limit: '20' });
    return this.request<PaginatedResponse<RoutineRevision>>(
      `/routines/patients/${encodeURIComponent(patientId)}/revisions?${params}`,
    );
  }
```

- [ ] **Step 9: Add the fallback helper** — `web-portal/src/lib/routine-care.ts`

Below the existing `import type {…} from '../types/api';` add:

```ts
import { APIError } from '../types/api';
```

Append at the end of the file:

```ts
export type RevisionHistory =
  | { status: 'ready'; page: PaginatedResponse<RoutineRevision> }
  | { status: 'unsupported' };

/** An API deployed before the revisions route answers its catch-all 404, which carries no code. */
export async function loadRevisionHistory(
  fetch: () => Promise<PaginatedResponse<RoutineRevision>>,
): Promise<RevisionHistory> {
  try {
    return { status: 'ready', page: await fetch() };
  } catch (cause) {
    if (cause instanceof APIError && cause.status === 404 && !cause.code) return { status: 'unsupported' };
    throw cause;
  }
}
```

- [ ] **Step 10: Run the portal tests**

Run: `cd web-portal && node --import tsx --test tests/routine-revisions-api.test.ts tests/routine-care.test.ts`
Expected: PASS.
Run: `cd web-portal && npm run typecheck`
Expected: exit 0.

- [ ] **Step 11: Review agents**

Run `care-access-reviewer` on `backend/src/services/routineCare.ts` and `backend/src/routes/routines.ts` (read-only, locked, current assignment, patient 403, concealment 404, no new data beyond existing revision rows). Run `api-contract-checker` (new route; `RoutineRevision` reused in `web-portal/src/types/api.ts`; no iOS model affected). Fix findings and rerun Steps 5 and 10.

- [ ] **Step 12: Commit**

```bash
git add backend/src/services/routineCare.ts backend/src/routes/routines.ts backend/tests/routine-care.test.ts web-portal/src/lib/api.ts web-portal/src/lib/routine-care.ts web-portal/tests/routine-revisions-api.test.ts
git commit -m "api: add read-only routine revision history for clinicians" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tabbed workspace shell, nav rail, urgent reports and eligibility [judgment]

**Files:**
- Create: `web-portal/src/lib/workspace.ts`
- Modify: `web-portal/src/app/globals.css` (`@layer components`, `@layer utilities`)
- Create: `web-portal/src/components/patients/useRoutineCare.ts`, `web-portal/src/components/patients/RoutineCompletionHistory.tsx`, `web-portal/src/components/patients/workspace/WorkspaceHeader.tsx`
- Modify (full rewrite): `web-portal/src/app/patients/[id]/page.tsx`, `web-portal/src/components/patients/PatientUrgentReports.tsx`, `web-portal/src/components/patients/EnrollmentStatus.tsx`, `web-portal/src/components/layout/Sidebar.tsx`
- Modify: `web-portal/src/components/patients/PatientRoutineCare.tsx` (imports and default export only), `web-portal/src/components/care-support/shared.tsx` (`LoadState`), `web-portal/src/lib/assigned-messaging.ts` (append `messageReference`), `web-portal/src/app/messages/page.tsx` (use it), `web-portal/src/lib/urgent-reports.ts` (append `splitReports`), `docs/design/letterpress/deferred.md`
- Test: create `web-portal/tests/workspace.test.ts`

**Interfaces:**
- Consumes: PR 4 `patientListContext`, `patientListQuery`, `day`, `localDateOf`, `stamp`, `plural`; PR 2 `Tabs`/`TabsList variant="underline"`/`TabsTrigger`/`TabsContent`, `Table*`, `Badge`, `Button`, `Label`, `Textarea`.
- Produces:
  - `@/lib/workspace`: `WORKSPACE_TABS: readonly ['photos','routine','check-ins','messages','history']`, `type WorkspaceTab`, `TAB_LABEL: Record<WorkspaceTab, string>`, `workspaceTab(params: { get(name: string): string | null }): WorkspaceTab`, `workspaceHref(patientId: string, listQuery: string, tab: WorkspaceTab, extra?: Record<string, string>): string`, `sinceLabel(iso: string | undefined): string`, `firstName(name: string | null | undefined): string`.
  - `@/lib/assigned-messaging`: `messageReference(type: string | null, id: string | null): MessageReference | null`.
  - `@/lib/urgent-reports`: `splitReports(rows: UrgentReport[]): { active: UrgentReport[]; resolved: UrgentReport[] }`.
  - `useRoutineCare(patientId: string): { controller: RoutineCareController; state: RoutineCareState }` (default export none; named).
  - `RoutineCompletionHistory` (default) props `{ controller: RoutineCareController; state: RoutineCareState }`.
  - `WorkspaceHeader` (default) props `{ name: string; since: string; onMessage: () => void; children?: ReactNode }`.
  - `PatientRoutineCare` props become `{ controller: RoutineCareController; state: RoutineCareState }` (Task 4 extends them).
  - `LoadState` gains `loading?: string` (default `"Loading"`).
  - CSS classes `.eyebrow`, `.meta-mono`, `.photo-mat`.
  - Page: `openTab(tab, extra?)` inside the page pushes `workspaceHref(id, listQuery, tab, extra)`; Tasks 3–5 wire props through it.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/workspace.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TAB_LABEL, WORKSPACE_TABS, firstName, sinceLabel, workspaceHref, workspaceTab } from '../src/lib/workspace';
import { messageReference } from '../src/lib/assigned-messaging';
import { splitReports, type UrgentReport } from '../src/lib/urgent-reports';
import WorkspaceHeader from '../src/components/patients/workspace/WorkspaceHeader';
import { LoadState } from '../src/components/care-support/shared';
import { read } from './letterpress-rules';

const noop = () => {};

test('tabs are Photos · Routine · Check-ins · Messages · History and default to Photos', () => {
  assert.deepEqual(WORKSPACE_TABS.map(tab => TAB_LABEL[tab]), ['Photos', 'Routine', 'Check-ins', 'Messages', 'History']);
  assert.equal(workspaceTab(new URLSearchParams('')), 'photos');
  assert.equal(workspaceTab(new URLSearchParams('tab=check-ins')), 'check-ins');
  assert.equal(workspaceTab(new URLSearchParams('tab=javascript:alert(1)')), 'photos');
});

test('workspace links keep the worklist context, omit the default tab and carry only known keys', () => {
  const href = workspaceHref('patient a', 'page=2&search=Ada&filter=flagged', 'routine');
  const [path, query] = href.split('?');
  assert.equal(path, '/patients/patient%20a');
  const params = new URLSearchParams(query);
  assert.deepEqual([params.get('page'), params.get('search'), params.get('filter'), params.get('tab')], ['2', 'Ada', 'flagged', 'routine']);
  assert.equal(new URLSearchParams(workspaceHref('p', 'page=1', 'photos').split('?')[1]).has('tab'), false);
  const linked = new URLSearchParams(workspaceHref('p', 'page=1', 'messages', { referenceType: 'photo', referenceId: 'x' }).split('?')[1]);
  assert.deepEqual([linked.get('tab'), linked.get('referenceType'), linked.get('referenceId')], ['messages', 'photo', 'x']);
});

test('message references from the URL accept only photo or routine revision UUIDs', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.deepEqual(messageReference('photo', id), { type: 'photo', id });
  assert.deepEqual(messageReference('routineRevision', id), { type: 'routineRevision', id });
  assert.equal(messageReference('appointment', id), null);
  assert.equal(messageReference('photo', '../x'), null);
  assert.equal(messageReference(null, null), null);
});

test('since label is a mono stamp with the year; first name falls back to empty', () => {
  assert.equal(sinceLabel(new Date(2026, 2, 2, 12).toISOString()), 'Since 02 MAR 2026');
  assert.equal(sinceLabel(undefined), '');
  assert.equal(sinceLabel('not a date'), '');
  assert.equal(firstName('  Synthetic   Ada '), 'Synthetic');
  assert.equal(firstName(''), '');
  assert.equal(firstName(null), '');
});

test('workspace header: serif name, mono since line, one outlined Message action and no filled button', () => {
  const html = renderToStaticMarkup(h(WorkspaceHeader, { name: 'Synthetic Ada', since: 'Since 02 MAR 2026', onMessage: noop }));
  assert.match(html, /<h1 class="[^"]*editorial-title[^"]*">Synthetic Ada<\/h1>/);
  assert.match(html, /class="meta-mono">Since 02 MAR 2026</);
  assert.match(html, />Message<\/button>/);
  assert.doesNotMatch(html, /bg-ink text-canvas/);
  assert.match(renderToStaticMarkup(h(WorkspaceHeader, { name: '', since: '', onMessage: noop })), />Unnamed patient</);
});

test('loading states name what is loading', () => {
  assert.match(renderToStaticMarkup(h(LoadState, { status: 'loading', error: '', retry: noop, loading: 'Loading photos' })), /role="status"[^>]*>Loading photos</);
  assert.match(renderToStaticMarkup(h(LoadState, { status: 'error', error: 'Could not load this record.', retry: noop })), /Could not load this record\.[\s\S]*>Retry</);
});

test('urgent reports: unresolved first, resolved folded away, words only', () => {
  const report = (id: string, status: UrgentReport['status']): UrgentReport => ({ id, patientId: 'p', category: 'other', description: 'Synthetic', status, createdAt: '2026-09-15T00:00:00.000Z', acknowledgedAt: null, resolvedAt: null, resolutionNote: null });
  const split = splitReports([report('a', 'resolved'), report('b', 'open'), report('c', 'acknowledged')]);
  assert.deepEqual([split.active.map(r => r.id), split.resolved.map(r => r.id)], [['b', 'c'], ['a']]);
  const urgent = read('src/components/patients/PatientUrgentReports.tsx');
  assert.match(urgent, /id="urgent"/);
  assert.match(urgent, /window\.location\.hash === '#urgent'/);
  assert.doesNotMatch(urgent, /AlertTriangle|attention-|'destructive'/);
  assert.doesNotMatch(read('src/components/patients/EnrollmentStatus.tsx'), /AlertTriangle|border-error/);
});

test('the workspace page is tabbed, URL-addressed, keeps visited tabs mounted and returns to the worklist context', () => {
  const page = read('src/app/patients/[id]/page.tsx');
  assert.ok(page.includes("'/patients?' + patientListQuery(context.page, context.search, context.filter)"));
  assert.match(page, /<TabsList variant="underline"/);
  assert.match(page, /activationMode="manual"/);
  assert.match(page, /window\.history\.pushState\(null, '', workspaceHref\(id, listQuery, next, extra\)\)/);
  assert.match(page, /forceMount className="mt-6 data-\[state=inactive\]:hidden">\{visited\.has\(value\) && content\}/);
  for (const tab of WORKSPACE_TABS) assert.ok(page.includes(`panel('${tab}'`), tab);
  assert.match(page, /<PatientUrgentReports key=\{'urgent-' \+ id\} patientId=\{id\} \/>\s*<Tabs/);
  for (const component of ['<PatientPhotoHistory', '<PatientRoutineCare', '<PatientCheckIns', '<ConversationView', '<CareStatusCard', '<CompletionCalendar', '<RoutineCompletionHistory']) assert.ok(page.includes(component), component);
  assert.doesNotMatch(page, /href=\{"\/messages\?patient=/);
  assert.doesNotMatch(read('src/components/patients/PatientRoutineCare.tsx'), /new RoutineCareController|CompletionCalendar|Recent completion events/);
});

test('sidebar is a 200px rail: Worklist, Messages, Templates, Account; Stethoscope only as the placeholder mark', () => {
  const sidebar = read('src/components/layout/Sidebar.tsx');
  assert.match(sidebar, /w-\[200px\]/);
  assert.deepEqual([...sidebar.matchAll(/name: '([^']+)'/g)].map(match => match[1]), ['Worklist', 'Messages', 'Templates', 'Account']);
  assert.equal((sidebar.match(/<Stethoscope/g) ?? []).length, 1);
});

test('eyebrow, mono metadata and the photo mat are defined once in globals.css', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.eyebrow\s*{[^}]*font-size:\s*10px;[^}]*letter-spacing:\s*0\.16em;[^}]*text-transform:\s*uppercase;/);
  assert.match(css, /\.meta-mono\s*{[^}]*font-size:\s*11px;[^}]*font-variant-numeric:\s*tabular-nums;/);
  assert.match(css, /\.photo-mat\s*{\s*background-color:\s*rgb\(18 19 18\);\s*color:\s*rgb\(242 239 231\);\s*}/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/workspace.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/workspace'`.

- [ ] **Step 3: Create `web-portal/src/lib/workspace.ts`**

```ts
import { day } from './worklist';

export const WORKSPACE_TABS = ['photos', 'routine', 'check-ins', 'messages', 'history'] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
export const TAB_LABEL: Record<WorkspaceTab, string> = {
  photos: 'Photos',
  routine: 'Routine',
  'check-ins': 'Check-ins',
  messages: 'Messages',
  history: 'History',
};

export function workspaceTab(params: { get(name: string): string | null }): WorkspaceTab {
  return WORKSPACE_TABS.find(tab => tab === params.get('tab')) ?? 'photos';
}

/** Workspace URLs carry only the worklist context, the tab and message reference keys; never a return URL. */
export function workspaceHref(patientId: string, listQuery: string, tab: WorkspaceTab, extra: Record<string, string> = {}) {
  const query = new URLSearchParams(listQuery);
  if (tab !== 'photos') query.set('tab', tab);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return `/patients/${encodeURIComponent(patientId)}?${query}`;
}

/** `Since 02 MAR 2026`, set in mono uppercase by `.meta-mono`. */
export function sinceLabel(iso: string | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `Since ${day(iso)} ${date.getFullYear()}` : '';
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';
```

- [ ] **Step 4: Add shared type classes** — `web-portal/src/app/globals.css`

Inside `@layer components { … }`, after the `.portal-page` rule, add:

```css
  /* Section eyebrow (spec §2): mono 500, 10px, .16em, uppercase. Never a sentence or a control label. */
  .eyebrow { font-family: var(--font-data); font-size: 10px; font-weight: 500; line-height: 1.3; letter-spacing: 0.16em; text-transform: uppercase; color: rgb(var(--ink-tertiary)); }
  /* Clinician metadata (spec §2): mono 11px with tabular figures, stamps like 02 SEP · 07:04. */
  .meta-mono { font-family: var(--font-data); font-size: 11px; font-weight: 400; line-height: 1.45; font-variant-numeric: tabular-nums; text-transform: uppercase; color: rgb(var(--ink-tertiary)); }
```

Inside `@layer utilities { … }`, after `.selected-outline`, add:

```css
  /* Clinical photos sit on a fixed near-black mat in both appearances (spec §4.5); text on it stays paper-light. */
  .photo-mat { background-color: rgb(18 19 18); color: rgb(242 239 231); }
```

- [ ] **Step 5: Name loading states** — in `web-portal/src/components/care-support/shared.tsx` replace the whole `LoadState` function with:

```tsx
export function LoadState({
  status,
  error,
  retry,
  loading = "Loading",
}: {
  status: string;
  error: string;
  retry: () => void;
  loading?: string;
}) {
  return status === "loading" ? (
    <p role="status" className="text-sm text-ink-secondary">
      {loading}
    </p>
  ) : status === "error" ? (
    <div role="alert" className="space-y-2">
      <p className="text-sm">{error}</p>
      <Button variant="outline" size="sm" onClick={retry}>
        Retry
      </Button>
    </div>
  ) : null;
}
```

- [ ] **Step 6: Add `messageReference`** — append to `web-portal/src/lib/assigned-messaging.ts`

```ts
const REFERENCE_ID = /^[0-9a-f-]{36}$/i;
/** Only a photo or routine revision UUID from the URL can become a message reference. */
export function messageReference(type: string | null, id: string | null): MessageReference | null {
  return (type === "photo" || type === "routineRevision") && id && REFERENCE_ID.test(id) ? { type, id } : null;
}
```

In `web-portal/src/app/messages/page.tsx`, add `messageReference` to the imports (`import { messageReference, type Conversation } from "@/lib/assigned-messaging";`, dropping the unused `MessageReference` type import) and replace the block from `const type = params.get("referenceType"),` through the end of the `useMemo<MessageReference | null>(…)` call with:

```tsx
  const referenceType = params.get("referenceType"),
    referenceId = params.get("referenceId");
  const reference = useMemo(
    () => messageReference(referenceType, referenceId),
    [referenceType, referenceId],
  );
```

- [ ] **Step 7: Add `splitReports`** — append to `web-portal/src/lib/urgent-reports.ts`

```ts
/** Unresolved reports stay in view; resolved ones fold away. Order within each group is kept (newest first). */
export function splitReports(rows: UrgentReport[]) {
  return { active: rows.filter((r) => r.status !== 'resolved'), resolved: rows.filter((r) => r.status === 'resolved') };
}
```

- [ ] **Step 8: Create `web-portal/src/components/patients/useRoutineCare.ts`**

```ts
'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { RoutineCareController, type RoutineCareState } from '@/lib/routine-care';
import { localDateOf } from '@/lib/worklist';

/** One routine controller per workspace: the Routine tab, History tab and Photos rail share its snapshot. */
export function useRoutineCare(patientId: string): { controller: RoutineCareController; state: RoutineCareState } {
  const api = useClinicalAPI();
  const controller = useMemo(() => new RoutineCareController({
    fetchSnapshot: () => api.getPatientRoutines(patientId, localDateOf(new Date())),
    saveRevision: (slot, revisionId, body) => api.savePatientRoutine(patientId, slot, revisionId, body),
    fetchHistory: page => api.getPatientRoutineCompletions(patientId, page, 20),
  }), [api, patientId]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => {
    void controller.load();
    void controller.loadHistory(1);
    return () => controller.cancel();
  }, [controller]);
  return { controller, state };
}
```

- [ ] **Step 9: Create `web-portal/src/components/patients/RoutineCompletionHistory.tsx`**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RoutineCareController, RoutineCareState } from '@/lib/routine-care';
import { stamp } from '@/lib/worklist';

export default function RoutineCompletionHistory({ controller, state }: { controller: RoutineCareController; state: RoutineCareState }) {
  const history = state.history;
  const reload = (page: number) => { void controller.loadHistory(page); };
  return <section aria-label="Recent completion events" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <p className="eyebrow">Completion events</p>
        <h2 className="editorial-title text-2xl">Recent completions</h2>
        <p className="max-w-prose text-sm text-ink-secondary">Patient-reported completions keep the routine version they were recorded against. Dates are the patient&apos;s own.</p>
      </div>
      <Button variant="outline" size="sm" disabled={history.status === 'loading'} onClick={() => reload(history.page)}>Refresh history</Button>
    </div>
    {history.status === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading completion history</p>}
    {history.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">{history.error}</p><Button variant="outline" size="sm" onClick={() => reload(history.page)}>Retry history</Button></div>}
    {history.status === 'ready' && (history.entries.length === 0
      ? <p className="text-sm text-ink-secondary">No completion events recorded yet.</p>
      : <Table>
        <TableHeader><TableRow><TableHead>Routine</TableHead><TableHead>Version</TableHead><TableHead>Completed</TableHead><TableHead>Patient date</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
        <TableBody>{history.entries.map(entry => <TableRow key={entry.id}>
          <TableCell><span className="block font-medium">{entry.routine.name}</span><span className="block text-xs text-ink-secondary">{entry.routine.timeOfDay === 'morning' ? 'Morning' : 'Evening'}</span></TableCell>
          <TableCell numeric>V{entry.routine.version}</TableCell>
          <TableCell numeric>{stamp(entry.completedAt)}</TableCell>
          <TableCell numeric>{entry.localDate} · {entry.timeZone}</TableCell>
          <TableCell numeric>{stamp(entry.receivedAt)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>)}
    {history.status === 'ready' && <nav aria-label="Completion history pages" className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="outline" size="sm" disabled={history.page <= 1} onClick={() => reload(history.page - 1)}>Previous events</Button>
      <p role="status" className="meta-mono">Page {history.page} of {history.totalPages} · {history.total} events</p>
      <Button variant="outline" size="sm" disabled={history.page >= history.totalPages} onClick={() => reload(history.page + 1)}>Next events</Button>
    </nav>}
  </section>;
}
```

- [ ] **Step 10: Take the controller as props in `PatientRoutineCare.tsx`**

Replace lines 1–27 (the imports, `localDateToday` and `displayTime`) with:

```tsx
'use client';

import TemplatePicker from '@/components/care-support/TemplatePicker';
import { ArrowDown, ArrowUp, ClipboardCheck, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { RoutineCareController, RoutineCareState, RoutineEditorState } from '@/lib/routine-care';
import type { RoutineTimeOfDay } from '@/types/api';
```

Replace everything from `export default function PatientRoutineCare(` to the end of the file with:

```tsx
export default function PatientRoutineCare({ controller, state }: { controller: RoutineCareController; state: RoutineCareState }) {
  const reloadAssignments = () => { void controller.load(); };
  const reloadConflict = (slot: RoutineTimeOfDay) => { void controller.reloadConflict(slot); };
  const saving = state.slots.morning.status === 'saving' || state.slots.evening.status === 'saving';
  const reloadBlocked = saving || state.slots.morning.hasPendingSave || state.slots.evening.hasPendingSave;

  return <section aria-label="Patient routine care" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-medium"><ClipboardCheck className="h-4 w-4" /> Assigned routines</h2>
        <p className="mt-1 text-sm text-ink-secondary">Edit clinician-assigned morning and evening routines.</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={reloadBlocked || Object.values(state.slots).some(editor => editor.dirty) || state.loadStatus === 'loading'} onClick={reloadAssignments}>
        <RefreshCw className="mr-2 h-4 w-4" /> Refresh assignments
      </Button>
    </div>

    {state.loadStatus === 'loading' && <p role="status">Loading routine assignments…</p>}
    {state.loadStatus === 'error' && <div role="alert" className="space-y-2">
      <p>{state.loadError}</p>
      <Button type="button" variant="outline" onClick={reloadAssignments}>Retry assignments</Button>
    </div>}
    {state.loadStatus === 'ready' && <div className="grid items-start gap-6 lg:grid-cols-2">
      <RoutineEditor slot="morning" editor={state.slots.morning} controller={controller} reload={() => reloadConflict('morning')} />
      <RoutineEditor slot="evening" editor={state.slots.evening} controller={controller} reload={() => reloadConflict('evening')} />
    </div>}
  </section>;
}
```

(The `RoutineEditor` function in between is unchanged here; Task 4 replaces it.)

- [ ] **Step 11: Create `web-portal/src/components/patients/workspace/WorkspaceHeader.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export default function WorkspaceHeader({ name, since, onMessage, children }: { name: string; since: string; onMessage: () => void; children?: ReactNode }) {
  return <header className="flex flex-wrap items-end gap-4 border-b-2 border-ink pb-5">
    <div className="min-w-0 flex-1 space-y-2">
      {since && <p className="meta-mono">{since}</p>}
      <h1 className="editorial-title break-words text-[36px] leading-tight">{name || 'Unnamed patient'}</h1>
      {children}
    </div>
    <Button variant="outline" onClick={onMessage}>Message</Button>
  </header>;
}
```

- [ ] **Step 12: Rewrite `web-portal/src/components/patients/EnrollmentStatus.tsx`**

```tsx
'use client';
import { useCallback } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { enrollmentLines } from '@/lib/enrollment';
import { useRead, LoadState } from '@/components/care-support/shared';
import { cn } from '@/lib/utils';

// Eligibility and consent as mono metadata. Lines that need attention say so in words and are set in ink at weight 500.
export default function EnrollmentStatus({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => api.getEnrollmentSummary(patientId), [api, patientId]);
  const result = useRead(fetch);
  return (
    <div aria-label="Enrollment status">
      {result.status === 'loading' && <p role="status" className="meta-mono">Checking eligibility</p>}
      {result.status === 'error' && <LoadState {...result} />}
      {result.data && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {enrollmentLines(result.data).map((line, index) => (
            <li
              key={index}
              className={cn('font-data text-[11px] uppercase tracking-[0.06em] tabular-nums', line.tone === 'alert' ? 'font-medium text-ink' : 'text-ink-secondary')}
            >
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Rewrite `web-portal/src/components/patients/PatientUrgentReports.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { categoryLabel, clearStaleErrors, normalizeNote, runReportAction, splitReports, statusLabel } from '@/lib/urgent-reports';
import type { UrgentAttempt, UrgentReport } from '@/lib/urgent-reports';
import { plural, stamp } from '@/lib/worklist';

// Always above the workspace tabs. Status is said in words; nothing here uses ochre or a warning glyph.
export default function PatientUrgentReports({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getPatientUrgentReports(patientId, page), [api, patientId, page]);
  const result = useRead(fetch);
  const [rows, setRows] = useState<UrgentReport[]>([]);
  const [attempts, setAttempts] = useState<Record<string, UrgentAttempt>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    const newRows = result.data?.data ?? [];
    setRows(newRows);
    setErrors((e) => clearStaleErrors(e, newRows, attempts));
  }, [result.data, attempts]);
  // The worklist Flagged tab links here with #urgent; the section mounts after the patient loads.
  useEffect(() => {
    if (result.data && window.location.hash === '#urgent') document.getElementById('urgent')?.scrollIntoView({ block: 'start' });
  }, [result.data]);

  const replace = (row: UrgentReport) => setRows((current) => current.map((r) => (r.id === row.id ? row : r)));

  // A failed transition refetches the page so the row shows its current state; the failed attempt is kept so the
  // error clears only once the refetched row shows it took effect.
  const run = async (id: string, action: () => Promise<UrgentReport>, attempt: UrgentAttempt, afterSave?: () => void) => {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: false }));
    try {
      const saved = await runReportAction(action, {
        saved: replace,
        failed: () => {
          setAttempts((a) => ({ ...a, [id]: attempt }));
          setErrors((e) => ({ ...e, [id]: true }));
        },
        refetch: result.retry,
      });
      if (saved) afterSave?.();
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };
  const acknowledge = (id: string) => run(id, () => api.acknowledgeUrgentReport(id), { type: 'acknowledge' });
  const resolve = (id: string) => {
    const note = normalizeNote(notes[id]);
    return run(id, () => api.resolveUrgentReport(id, note), { type: 'resolve', note }, () => setResolving((r) => ({ ...r, [id]: false })));
  };

  const { active, resolved } = splitReports(rows);
  const item = (report: UrgentReport) => (
    <li key={report.id} className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[15px] font-medium">{categoryLabel(report.category)}</p>
        <Badge variant="outline">{statusLabel(report.status)}</Badge>
        <span className="meta-mono">{stamp(report.createdAt)}</span>
      </div>
      <p className="max-w-prose whitespace-pre-wrap break-words text-sm">{report.description}</p>
      {report.resolutionNote && <p className="text-sm text-ink-secondary">Note to patient: {report.resolutionNote}</p>}
      {errors[report.id] && <p role="alert" className="text-sm text-error">Not saved. Showing the latest state; try again if still needed.</p>}
      {report.status !== 'resolved' && (
        <div className="flex flex-wrap items-start gap-2">
          {report.status === 'open' && (
            <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => void acknowledge(report.id)}>
              {pending[report.id] ? 'Saving…' : 'Acknowledge'}
            </Button>
          )}
          {!resolving[report.id] ? (
            <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => setResolving((r) => ({ ...r, [report.id]: true }))}>
              Resolve
            </Button>
          ) : (
            <div className="w-full max-w-xl space-y-2">
              <Label htmlFor={`resolve-note-${report.id}`}>Note to the patient (optional)</Label>
              <Textarea
                id={`resolve-note-${report.id}`}
                maxLength={2000}
                disabled={pending[report.id]}
                value={notes[report.id] ?? ''}
                onChange={(event) => setNotes((n) => ({ ...n, [report.id]: event.target.value }))}
              />
              <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => void resolve(report.id)}>
                {pending[report.id] ? 'Saving…' : 'Confirm resolve'}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );

  return (
    <section id="urgent" aria-label="Urgent reports" className="scroll-mt-6 space-y-2">
      <p className="eyebrow">Urgent reports</p>
      <LoadState {...result} loading="Checking urgent reports" />
      {result.data && rows.length === 0 && <p className="text-sm text-ink-secondary">No urgent reports for this patient.</p>}
      {active.length > 0 && <ul className="divide-y divide-rule border-y-2 border-ink">{active.map(item)}</ul>}
      {resolved.length > 0 && (
        <details className="border-b border-rule pb-2">
          <summary className="cursor-pointer py-2 text-sm text-ink-secondary">{plural(resolved.length, 'resolved report')} on this page</summary>
          <ul className="divide-y divide-rule">{resolved.map(item)}</ul>
        </details>
      )}
      {result.data && result.data.pagination.totalPages > 1 && (
        <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />
      )}
    </section>
  );
}
```

- [ ] **Step 14: Rewrite `web-portal/src/components/layout/Sidebar.tsx`**

```tsx
'use client';
import { usePathname } from 'next/navigation';
import { ClipboardList, List, LogOut, MessageSquare, Stethoscope, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Worklist', href: '/patients', icon: List },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Templates', href: '/templates', icon: ClipboardList },
  { name: 'Account', href: '/account', icon: UserRound },
];
const initials = (name?: string) => (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'C';

// Letterpress nav rail (spec §3: 190–210px). Stethoscope is a placeholder mark until PR 8 ships the identity.
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname(); const { user, logout } = useAuth();
  return <div className="flex h-full w-[200px] flex-col border-r border-rule bg-rail">
    <div className="px-4 pb-5 pt-6">
      <div className="flex items-center gap-2"><Stethoscope aria-hidden className="h-5 w-5 text-ink" /><p className="font-display text-[19px] font-light">ClearAF</p></div>
      <p className="eyebrow mt-2">Clinician</p>
    </div>
    <nav aria-label="Portal" className="flex-1">{navigation.map(item => {
      const current = pathname === item.href || pathname.startsWith(item.href + '/');
      return <a key={item.href} href={item.href} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={cn('flex items-center gap-2.5 px-3.5 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink', current ? 'bg-ink font-medium text-canvas' : 'font-[450] text-ink-secondary hover:bg-sunk hover:text-ink')}><item.icon aria-hidden className="h-4 w-4" />{item.name}</a>;
    })}</nav>
    <div className="space-y-2 border-t border-rule p-3.5">
      <div className="flex items-center gap-2.5"><Avatar className="h-8 w-8"><AvatarFallback>{initials(user?.name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-[13px] font-medium">{user?.name}</p><p className="truncate font-data text-[11px] text-ink-tertiary">{user?.email}</p></div></div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void logout()}><LogOut aria-hidden />Sign out</Button>
    </div>
  </div>;
}
```

- [ ] **Step 15: Rewrite `web-portal/src/app/patients/[id]/page.tsx`**

```tsx
'use client';
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CompletionCalendar from '@/components/care-support/CompletionCalendar';
import PatientCheckIns from '@/components/care-support/PatientCheckIns';
import ConversationView from '@/components/messages/ConversationView';
import CareStatusCard from '@/components/patients/CareStatusCard';
import EnrollmentStatus from '@/components/patients/EnrollmentStatus';
import PatientPhotoHistory from '@/components/patients/PatientPhotoHistory';
import PatientRoutineCare from '@/components/patients/PatientRoutineCare';
import PatientUrgentReports from '@/components/patients/PatientUrgentReports';
import RoutineCompletionHistory from '@/components/patients/RoutineCompletionHistory';
import { useRoutineCare } from '@/components/patients/useRoutineCare';
import WorkspaceHeader from '@/components/patients/workspace/WorkspaceHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, useClinicalAPI } from '@/lib/auth';
import { messageReference } from '@/lib/assigned-messaging';
import { patientListContext, patientListQuery } from '@/lib/patient-navigation';
import { TAB_LABEL, WORKSPACE_TABS, sinceLabel, workspaceHref, workspaceTab, type WorkspaceTab } from '@/lib/workspace';
import type { User } from '@/types/api';

const ignoreConversation = () => {};

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const context = patientListContext(params);
  const listQuery = patientListQuery(context.page, context.search, context.filter);
  const tab = workspaceTab(params);
  const referenceType = params.get('referenceType'), referenceId = params.get('referenceId');
  const reference = useMemo(() => messageReference(referenceType, referenceId), [referenceType, referenceId]);
  const api = useClinicalAPI();
  const { user } = useAuth();
  const routine = useRoutineCare(id);
  const [patient, setPatient] = useState<User | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [careRefresh, setCareRefresh] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<WorkspaceTab>>(() => new Set([tab]));
  useEffect(() => { setVisited(current => (current.has(tab) ? current : new Set([...current, tab]))); }, [tab]);
  useEffect(() => {
    let current = true; setPatient(null); setFailed(false);
    void api.getPatient(id).then(value => { if (current) setPatient(value); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [api, id, attempt]);
  const dirty = Object.values(routine.state.slots).some(editor => editor.dirty || editor.hasPendingSave);
  useEffect(() => {
    if (!dirty) return;
    // Leaving the page warns. Switching tabs does not: visited tabs stay mounted, so drafts survive.
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  // Tabs are URL state: reload keeps the tab and Back steps through tabs.
  const openTab = useCallback((next: WorkspaceTab, extra?: Record<string, string>) => {
    window.history.pushState(null, '', workspaceHref(id, listQuery, next, extra));
  }, [id, listQuery]);
  const panel = (value: WorkspaceTab, content: ReactNode) => <TabsContent key={value} value={value} forceMount className="mt-6 data-[state=inactive]:hidden">{visited.has(value) && content}</TabsContent>;
  const name = patient?.name || 'Unnamed patient';

  return <DashboardLayout title={patient ? `Patient · ${name}` : 'Patient workspace'}><div className="portal-page">
    <Button variant="link" size="sm" className="px-0" asChild><a href={'/patients?' + patientListQuery(context.page, context.search, context.filter)}><ArrowLeft aria-hidden />Back to worklist</a></Button>
    {failed ? <div role="alert" className="space-y-3"><h1 className="editorial-title text-[32px]">Patient unavailable</h1><p className="max-w-prose text-ink-secondary">This patient could not be opened. Check your connection and current assignment.</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : !patient ? <p role="status" className="text-sm text-ink-secondary">Opening patient</p>
      : <>
        <WorkspaceHeader name={patient.name} since={sinceLabel(patient.joinDate ?? patient.createdAt)} onMessage={() => openTab('messages')}><EnrollmentStatus patientId={id} /></WorkspaceHeader>
        <PatientUrgentReports key={'urgent-' + id} patientId={id} />
        <Tabs value={tab} onValueChange={value => openTab(value as WorkspaceTab)} activationMode="manual">
          <TabsList variant="underline" aria-label="Patient record">{WORKSPACE_TABS.map(value => <TabsTrigger key={value} value={value}>{TAB_LABEL[value]}</TabsTrigger>)}</TabsList>
          {panel('photos', <PatientPhotoHistory key={'photos-' + id} patientId={id} onCareDecision={() => setCareRefresh(value => value + 1)} />)}
          {panel('routine', <PatientRoutineCare controller={routine.controller} state={routine.state} />)}
          {panel('check-ins', <PatientCheckIns key={'check-ins-' + id} patientId={id} />)}
          {panel('messages', user ? <ConversationView key={'messages-' + id + '-' + user.id} patientId={id} clinicianId={user.id} initialReference={reference} onConversationChange={ignoreConversation} /> : null)}
          {panel('history', <div className="space-y-12">
            <CareStatusCard key={'care-' + id} patientId={id} refresh={careRefresh} />
            <CompletionCalendar key={'calendar-' + id} patientId={id} />
            <RoutineCompletionHistory controller={routine.controller} state={routine.state} />
          </div>)}
        </Tabs>
      </>}
  </div></DashboardLayout>;
}
export default function PatientWorkspacePage() {
  return <Suspense fallback={<p className="p-8" role="status">Opening patient</p>}><Workspace /></Suspense>;
}
```

- [ ] **Step 16: Record omissions** — append to the table in `docs/design/letterpress/deferred.md`

```markdown
| Portal nav rail | Worklist count, Messages unread dot, "Check-in forms" item | The rail loads no worklist or inbox data; there is no standalone forms page |
| Portal Workspace header | Age, sex and diagnosis line | No such patient fields |
| Portal Workspace header | "Adherence 79% / 14d", "2 of 4" position, tab counts | Worklist-only data; the workspace does not load the worklist or every tab's totals |
```

- [ ] **Step 17: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/workspace.test.ts`
Expected: PASS (10 tests).
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green, including PR 4's `worklist-page.test.ts`, `letterpress-sweep.test.ts` and `class-definitions.test.ts`.

- [ ] **Step 18: Commit**

```bash
git add web-portal/src/lib/workspace.ts web-portal/src/app/globals.css web-portal/src/components/patients/useRoutineCare.ts web-portal/src/components/patients/RoutineCompletionHistory.tsx web-portal/src/components/patients/workspace/WorkspaceHeader.tsx "web-portal/src/app/patients/[id]/page.tsx" web-portal/src/components/patients/PatientUrgentReports.tsx web-portal/src/components/patients/EnrollmentStatus.tsx web-portal/src/components/layout/Sidebar.tsx web-portal/src/components/patients/PatientRoutineCare.tsx web-portal/src/components/care-support/shared.tsx web-portal/src/lib/assigned-messaging.ts web-portal/src/app/messages/page.tsx web-portal/src/lib/urgent-reports.ts docs/design/letterpress/deferred.md web-portal/tests/workspace.test.ts
git commit -m "portal: split the patient workspace into URL-addressed tabs with a 200px nav rail" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Photos tab — Compare by default, Send & mark reviewed, care rail [judgment]

Reviewer after this task: `care-access-reviewer` (photo originals still fetched per photo through the scoped API; message send and review use the existing endpoints; no new data exposure).

**Files:**
- Create: `web-portal/src/lib/photo-feedback.ts`
- Modify (full rewrite): `web-portal/src/lib/photo-review.ts`, `web-portal/src/components/patients/PatientPhotoHistory.tsx`
- Modify: `web-portal/src/lib/photo-history.ts` (delete `PhotoOriginalState`, `photoDetailState`), `web-portal/src/lib/workspace.ts` (append), `web-portal/src/lib/care-support.ts` (append `answerText`), `web-portal/src/app/patients/[id]/page.tsx` (photos panel + import), `docs/design/letterpress/deferred.md`
- Create: `web-portal/src/components/patients/workspace/PhotoCompareView.tsx`, `PhotoStrip.tsx`, `PhotoReplyView.tsx`, `CareRailView.tsx`, `CareRail.tsx`
- Test: create `web-portal/tests/photo-feedback.test.ts`, `web-portal/tests/workspace-photos.test.ts`; modify `web-portal/tests/photo-review.test.ts` (append), `web-portal/tests/photo-history.test.ts` (drop dialog test); delete `web-portal/tests/photo-focus.test.ts`

**Interfaces:**
- Consumes: Task 2 `firstName`, `openTab`, `useRoutineCare` state, `.photo-mat`, `.eyebrow`, `.meta-mono`; PR 4 `day`, `stamp`; existing `apiService.sendAssignedMessage`, `markPhotoReviewed`, `getPhotoOriginal`, `getPhotoThumbnail`, `getPatientPhotoSummaries`, `getPatientResponses`; `CareDecisionDialog`.
- Produces:
  - `PhotoReviewController.load(ids: string[], preselect?: string[])` (keeps at most two preselected ids that are on the page); `toggle` now closes a running comparison before changing the selection; `compare()` runs with one or two selected photos. Other members unchanged.
  - `@/lib/photo-feedback`: `type FeedbackStatus = 'draft'|'sending'|'marking'|'sent'|'send-failed'|'mark-failed'`, `interface FeedbackState { text; photoId: string|null; status; reviewed: boolean }`, `class PhotoFeedbackController(send, markReviewed, uuid?)` with `snapshot`, `subscribe`, `frozen`, `target(photoId)`, `edit(text)`, `submit(alreadyReviewed)`, `newDraft()`, `leaveUnreviewed()`, `cancel()`.
  - `@/lib/workspace`: `defaultPair(photos): string[]`, `comparePanes(photos, selected): PhotoSummary[]`, `replyTarget(photos, selected): PhotoSummary | null`, `reviewWords(review?: PhotoReview): string`.
  - `@/lib/care-support`: `answerText(question: Question, response: CheckInResponse): string` (`'Not answered'` when empty).
  - Views: `PhotoCompareView({ panes: ComparePane[]; zoom; onZoom; onRetry })` with `interface ComparePane { photo; original?: { url?; error? }; review? }`; `PhotoStrip({ photos, previews, selected, reviews, reviewStatus, total, page, totalPages, onToggle, onPage })`; `PhotoReplyView({ patientFirstName, target, feedback, frozen, reviewed, reviewPending, reviewError, onEdit, onSubmit, onNewDraft, onLeaveUnreviewed, onMarkOnly, onCareDecision })`; `CareRailView({ routine: RoutineCareState; latest: CheckInResponse | null; checkInStatus; onRetry; onOpen(tab: 'routine' | 'check-ins') })`; `CareRail` (default) `{ patientId; routine: RoutineCareState; onOpen }`.
  - `PatientPhotoHistory` props `{ patientId: string; patientName: string; onCareDecision?: () => void; rail?: ReactNode }`. `restorePhotoFocus` is removed.

- [ ] **Step 1: Write the failing controller tests**

`web-portal/tests/photo-feedback.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoFeedbackController } from '../src/lib/photo-feedback';
import type { MessageBody, MessageRecord } from '../src/lib/assigned-messaging';

const record = (id: string, body: MessageBody): MessageRecord => ({
  id, patientId: 'p', clinicianId: 'c', senderId: 'c', senderType: 'dermatologist', recipientId: 'p', recipientType: 'patient',
  content: body.content, sentAt: '2026-09-16T08:00:00.000Z', unreadForMe: false,
  reference: body.reference ? { ...body.reference, available: true, label: 'Photo', occurredAt: null } : null, origin: 'native',
});
const ids = () => { let n = 0; return () => `message-${++n}`; };

test('send and mark reviewed are two calls in order; the reply links the photo and clears when both succeed', async () => {
  const calls: string[] = [];
  const controller = new PhotoFeedbackController(
    async (id, body) => { calls.push(`send:${id}:${body.reference?.type}:${body.reference?.id}:${body.content}`); return record(id, body); },
    async photoId => { calls.push(`mark:${photoId}`); },
    ids(),
  );
  controller.target('photo-1');
  controller.edit('  Keep the adapalene to three nights.  ');
  await controller.submit(false);
  assert.deepEqual(calls, ['send:message-1:photo:photo-1:Keep the adapalene to three nights.', 'mark:photo-1']);
  const state = controller.snapshot();
  assert.deepEqual([state.status, state.text, state.reviewed, controller.frozen], ['sent', '', true, false]);
});

test('a lost send keeps the frozen message, retries the same id and body, and never marks first', async () => {
  const sends: string[] = []; let fail = true; let marks = 0;
  const controller = new PhotoFeedbackController(
    async (id, body) => { sends.push(`${id}:${body.content}`); if (fail) throw new Error('offline'); return record(id, body); },
    async () => { marks++; },
    ids(),
  );
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  assert.deepEqual([controller.snapshot().status, marks, controller.frozen], ['send-failed', 0, true]);
  controller.edit('Changed'); controller.target('photo-2');
  assert.deepEqual([controller.snapshot().text, controller.snapshot().photoId], ['Reply', 'photo-1']);
  fail = false; await controller.submit(false);
  assert.deepEqual(sends, ['message-1:Reply', 'message-1:Reply']);
  assert.deepEqual([marks, controller.snapshot().status], [1, 'sent']);
});

test('a failed review after a confirmed send retries only the review', async () => {
  let sends = 0; let fail = true; const marks: string[] = [];
  const controller = new PhotoFeedbackController(
    async (id, body) => { sends++; return record(id, body); },
    async photoId => { marks.push(photoId); if (fail) throw new Error('offline'); },
    ids(),
  );
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  assert.deepEqual([controller.snapshot().status, controller.snapshot().text, controller.frozen], ['mark-failed', '', true]);
  fail = false; await controller.submit(false);
  assert.deepEqual([sends, marks, controller.snapshot().status], [1, ['photo-1', 'photo-1'], 'sent']);
});

test('leaving a photo unreviewed after a failed review releases the reply without resending', async () => {
  let sends = 0;
  const controller = new PhotoFeedbackController(async (id, body) => { sends++; return record(id, body); }, async () => { throw new Error('offline'); }, ids());
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  controller.leaveUnreviewed();
  assert.deepEqual([controller.snapshot().status, controller.frozen, sends], ['draft', false, 1]);
});

test('an already reviewed photo sends without a review call; empty replies and missing photos do nothing', async () => {
  let sends = 0; let marks = 0;
  const controller = new PhotoFeedbackController(async (id, body) => { sends++; return record(id, body); }, async () => { marks++; }, ids());
  controller.edit('No photo yet'); await controller.submit(false);
  controller.target('photo-1'); controller.edit('   '); await controller.submit(false);
  assert.equal(sends, 0);
  controller.edit('Reply'); await controller.submit(true);
  assert.deepEqual([sends, marks, controller.snapshot().status, controller.snapshot().reviewed], [1, 0, 'sent', false]);
});

test('a send result for another message is not accepted', async () => {
  const controller = new PhotoFeedbackController(async (_id, body) => record('other', body), async () => {}, ids());
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  assert.equal(controller.snapshot().status, 'send-failed');
});

test('editing as a new message after a failed send issues a fresh id', async () => {
  const sent: string[] = []; let fail = true;
  const controller = new PhotoFeedbackController(async (id, body) => { sent.push(id); if (fail) throw new Error('offline'); return record(id, body); }, async () => {}, ids());
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  controller.newDraft(); controller.edit('Reply, edited'); fail = false; await controller.submit(false);
  assert.deepEqual(sent, ['message-1', 'message-2']);
});

test('cancel discards a late result', async () => {
  let finish!: () => void; let marks = 0;
  const controller = new PhotoFeedbackController(
    (id, body) => new Promise<MessageRecord>(resolve => { finish = () => resolve(record(id, body)); }),
    async () => { marks++; },
    ids(),
  );
  controller.target('photo-1'); controller.edit('Reply');
  const pending = controller.submit(false);
  controller.cancel(); finish(); await pending;
  assert.deepEqual([controller.snapshot().status, marks, controller.frozen], ['draft', 0, false]);
});
```

Append to `web-portal/tests/photo-review.test.ts`:

```ts
test('a page load preselects only ids on that page, compares one or two photos, and a toggle while comparing starts over', async () => {
 const fetched: string[] = [];
 const controller = new PhotoReviewController(async () => ({reviews:[]}), async () => ({review}), async id => { fetched.push(id); return {photoUrl:`private-${id}`}; });
 await controller.load(['a','b','c'], ['b','c','foreign']);
 assert.deepEqual(controller.snapshot().selected, ['b','c']);
 await controller.compare();
 assert.deepEqual(controller.snapshot().originals, { b: { url: 'private-b' }, c: { url: 'private-c' } });
 controller.toggle('c');
 assert.deepEqual([controller.snapshot().selected, controller.snapshot().comparing, controller.snapshot().originals], [['b'], false, {}]);
 await controller.compare();
 assert.deepEqual(controller.snapshot().originals, { b: { url: 'private-b' } });
 controller.toggle('b');
 await controller.compare();
 assert.deepEqual(fetched, ['b','c','b']);
 controller.toggle('a'); controller.toggle('b'); controller.toggle('c');
 assert.deepEqual(controller.snapshot().selected, ['a','b']);
});
```

- [ ] **Step 2: Write the failing view tests** — `web-portal/tests/workspace-photos.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparePanes, defaultPair, replyTarget, reviewWords } from '../src/lib/workspace';
import { PhotoCompareView } from '../src/components/patients/workspace/PhotoCompareView';
import { PhotoStrip } from '../src/components/patients/workspace/PhotoStrip';
import { PhotoReplyView } from '../src/components/patients/workspace/PhotoReplyView';
import { CareRailView } from '../src/components/patients/workspace/CareRailView';
import type { PhotoSummary } from '../src/types/api';
import type { FeedbackState } from '../src/lib/photo-feedback';
import type { RoutineCareState } from '../src/lib/routine-care';
import type { CheckInResponse } from '../src/lib/care-support';
import { read } from './letterpress-rules';

const photo = (id: string, captureDate: string, notes?: string): PhotoSummary => ({ id, userId: 'p', skinScore: 0, captureDate, createdAt: captureDate, updatedAt: captureDate, notes });
const photos = [photo('late', '2026-09-15T07:12:00'), photo('early', '2026-09-02T07:04:00'), photo('middle', '2026-09-09T07:00:00', 'Chin is drier than last week.')];
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;
const noop = () => {};
const reviewed = { photoId: 'late', reviewerName: 'Synthetic Clinician', reviewedAt: '2026-09-16T08:00:00' };

test('compare defaults to the newest photo and the one before it, older on the left; the reply targets the newer', () => {
  assert.deepEqual(defaultPair(photos), ['middle', 'late']);
  assert.deepEqual(defaultPair([photos[1]]), ['early']);
  assert.deepEqual(comparePanes(photos, ['late', 'early']).map(p => p.id), ['early', 'late']);
  assert.equal(replyTarget(photos, ['late', 'early'])?.id, 'late');
  assert.equal(replyTarget(photos, []), null);
  assert.equal(reviewWords(undefined), 'Not reviewed');
  assert.equal(reviewWords(reviewed), 'Reviewed · Synthetic Clinician · 16 SEP');
});

test('compare view: uncropped originals on the photo mat with mono stamps, review words and no filled button', () => {
  const html = renderToStaticMarkup(h(PhotoCompareView, { panes: [
    { photo: photos[1], original: { url: 'https://synthetic.invalid/early' } },
    { photo: photos[0], original: {}, review: reviewed },
  ], zoom: 150, onZoom: noop, onRetry: noop }));
  assert.equal((html.match(/photo-mat/g) ?? []).length, 2);
  assert.match(html, /object-contain/);
  assert.match(html, /referrerpolicy="no-referrer"|referrerPolicy="no-referrer"/);
  assert.match(html, /02 SEP · 07:04/); assert.match(html, /15 SEP · 07:12/);
  assert.match(html, /Reviewed · Synthetic Clinician · 16 SEP/); assert.match(html, /Not reviewed/);
  assert.match(html, />Loading original</); assert.match(html, /150%/);
  assert.match(html, /Lighting and capture conditions may differ between photos\./);
  assert.equal(filled(html), 0);
  assert.match(renderToStaticMarkup(h(PhotoCompareView, { panes: [], zoom: 100, onZoom: noop, onRetry: noop })), /Choose photos to compare/);
});

test('photo strip: selected tiles use the inset ink outline, a third choice is disabled with a reason, states in words', () => {
  const html = renderToStaticMarkup(h(PhotoStrip, {
    photos, previews: { late: { status: 'error' } }, selected: ['middle', 'late'],
    reviews: { early: { photoId: 'early', reviewerName: 'C', reviewedAt: '2026-09-03T00:00:00' } }, reviewStatus: 'ready',
    total: 18, page: 1, totalPages: 2, onToggle: noop, onPage: noop,
  }));
  assert.match(html, /All photos · 18/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.match(html, /aria-pressed:selected-outline/);
  assert.match(html, /aria-pressed="false"[^>]*disabled=""/);
  assert.match(html, /Two photos selected\. Deselect one to compare another\./);
  assert.match(html, /2 selected · 2 not reviewed on this page/);
  assert.match(html, /Preview unavailable/);
  assert.match(html, /Page 1 of 2/);
  assert.equal(filled(html), 0);
});

const feedback = (over: Partial<FeedbackState> = {}): FeedbackState => ({ text: 'Keep going', photoId: 'late', status: 'draft', reviewed: false, ...over });
const reply = (over: Partial<FeedbackState> = {}, isReviewed = false, target: PhotoSummary | null = photos[0]) => renderToStaticMarkup(h(PhotoReplyView, {
  patientFirstName: 'Ada', target, feedback: feedback(over),
  frozen: ['sending', 'marking', 'send-failed', 'mark-failed'].includes(over.status ?? 'draft'),
  reviewed: isReviewed, reviewPending: false, reviewError: false,
  onEdit: noop, onSubmit: noop, onNewDraft: noop, onLeaveUnreviewed: noop, onMarkOnly: noop, onCareDecision: noop,
}));

test('reply: one filled action that sends and marks reviewed, with honest partial-failure copy', () => {
  let html = reply();
  assert.equal(filled(html), 1);
  assert.match(html, />Send &amp; mark reviewed</);
  assert.match(html, /Links photo 15 SEP/);
  assert.match(html, />Mark reviewed without reply</);
  assert.match(html, /placeholder="Write to Ada…"/);
  assert.match(reply({ status: 'sending' }), />Sending…</);
  assert.match(reply({ status: 'marking', text: '' }), />Marking reviewed…</);
  html = reply({ status: 'send-failed' });
  assert.match(html, /Message could not be confirmed\. The photo is not marked reviewed\. Retry sends the same message\./);
  assert.match(html, />Retry same message</); assert.match(html, />Edit as a new message</);
  html = reply({ status: 'mark-failed', text: '' });
  assert.match(html, /Message sent\. The photo is not marked reviewed yet\./);
  assert.match(html, />Retry marking reviewed</); assert.match(html, />Leave photo unreviewed</);
  assert.equal(filled(html), 1);
  assert.match(reply({ status: 'sent', text: '', reviewed: true }), /Sent\. Photo marked reviewed\./);
  html = reply({}, true);
  assert.match(html, />Send reply</); assert.doesNotMatch(html, /Mark reviewed without reply/);
  assert.match(reply({ text: '' }), /Write a reply to send it with this photo linked\./);
  assert.match(reply({}, false, photos[2]), /Patient note on 09 SEP[\s\S]*Chin is drier than last week\./);
  assert.match(reply({ text: '' }, false, null), /Select a photo to reply about it\./);
});

const routineState = (): RoutineCareState => ({
  loadStatus: 'ready', loadError: '',
  history: { entries: [], page: 1, total: 0, totalPages: 1, status: 'ready', error: '' },
  slots: {
    morning: { routine: { id: 'r', userId: 'p', timeOfDay: 'morning', version: 4, createdBy: 'c', createdAt: '2026-09-02T00:00:00', name: 'Morning', isActive: true, steps: [{ title: 'Gentle cleanser', instructions: '' }, { title: 'Adapalene 0.1%', instructions: '' }] }, draft: { name: 'Morning', isActive: true, steps: [] }, expectedRevisionId: 'r', status: 'ready', error: '', dirty: false, hasPendingSave: false },
    evening: { routine: null, draft: { name: '', isActive: true, steps: [] }, expectedRevisionId: null, status: 'ready', error: '', dirty: false, hasPendingSave: false },
  },
});
const checkIn: CheckInResponse = {
  id: 'x', userId: 'p', formId: 'f', submittedAt: '2026-09-14T20:11:00', receivedAt: '2026-09-14T20:11:00', answers: [{ questionId: 'q1', optionId: 'o2' }],
  form: { id: 'f', userId: 'p', version: 2, createdBy: 'c', createdAt: '2026-09-01T00:00:00', title: 'Weekly check-in', isActive: true, questions: [
    { id: 'q1', prompt: 'Dryness this week', type: 'choice', required: true, options: [{ id: 'o1', label: 'Worse than last week' }, { id: 'o2', label: 'Better than last week' }] },
    { id: 'q2', prompt: 'Missed doses', type: 'text', required: false, options: [] },
  ] },
};

test('care rail keeps the current routine and the latest check-in in view', () => {
  const html = renderToStaticMarkup(h(CareRailView, { routine: routineState(), latest: checkIn, checkInStatus: 'ready', onRetry: noop, onOpen: noop }));
  assert.match(html, /Morning routine/); assert.match(html, />V4</); assert.match(html, /Gentle cleanser/);
  assert.match(html, /Evening routine[\s\S]*Not assigned\./);
  assert.match(html, /Latest check-in · 14 SEP/); assert.match(html, /Better than last week/);
  assert.match(html, /Missed doses[\s\S]*Not answered/);
  assert.equal(filled(html), 0);
  assert.match(renderToStaticMarkup(h(CareRailView, { routine: routineState(), latest: null, checkInStatus: 'ready', onRetry: noop, onOpen: noop })), /No check-ins submitted yet\./);
});

test('the photos tab has no viewing dialogs; compare is the default and replies go through the feedback controller', () => {
  const source = read('src/components/patients/PatientPhotoHistory.tsx');
  assert.doesNotMatch(source, /<Dialog|restorePhotoFocus|Compare photos/);
  assert.match(source, /reviews\.load\(ids, previous\.length \? previous : defaultPair\(state\.photos\)\)/);
  assert.match(source, /new PhotoFeedbackController\(/);
  assert.match(source, /api\.sendAssignedMessage\(patientId, clinicianId, id, body\)/);
  assert.match(source, /await reviews\.mark\(photoId\)/);
  assert.match(read('src/app/patients/[id]/page.tsx'), /rail=\{<CareRail /);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web-portal && node --import tsx --test tests/photo-feedback.test.ts tests/workspace-photos.test.ts tests/photo-review.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/photo-feedback'`, missing view modules, and the new photo-review test fails (`selected` is `[]`).

- [ ] **Step 4: Create `web-portal/src/lib/photo-feedback.ts`**

```ts
import type { MessageBody, MessageRecord } from './assigned-messaging';

export type FeedbackStatus = 'draft' | 'sending' | 'marking' | 'sent' | 'send-failed' | 'mark-failed';
export interface FeedbackState {
  text: string;
  photoId: string | null;
  status: FeedbackStatus;
  /** Whether the last completed reply also marked its photo reviewed. */
  reviewed: boolean;
}
type Attempt = { id: string; photoId: string; body: MessageBody; mark: boolean };

/**
 * "Send & mark reviewed" as two existing idempotent calls in order. The reply keeps one client id and a frozen body until
 * the server confirms it; a failed review after a confirmed send retries only the review.
 */
export class PhotoFeedbackController {
  private state: FeedbackState = { text: '', photoId: null, status: 'draft', reviewed: false };
  private attempt: Attempt | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(
    private send: (id: string, body: MessageBody) => Promise<MessageRecord>,
    private markReviewed: (photoId: string) => Promise<void>,
    private uuid: () => string = () => crypto.randomUUID(),
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<FeedbackState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach(listener => listener());
  }
  get frozen() { return this.attempt !== null; }
  target(photoId: string | null) {
    if (this.attempt || photoId === this.state.photoId) return;
    this.publish({ photoId, status: 'draft' });
  }
  edit(text: string) {
    if (this.attempt) return;
    this.publish({ text: text.slice(0, 4000), status: 'draft' });
  }
  newDraft() {
    if (this.state.status !== 'send-failed') return;
    this.attempt = null;
    this.publish({ status: 'draft' });
  }
  leaveUnreviewed() {
    if (this.state.status !== 'mark-failed') return;
    this.attempt = null;
    this.publish({ status: 'draft', reviewed: false });
  }
  cancel() {
    this.generation++;
    this.attempt = null;
    this.publish({ text: '', status: 'draft' });
  }
  async submit(alreadyReviewed: boolean) {
    if (this.state.status === 'sending' || this.state.status === 'marking') return;
    if (!this.attempt) {
      const content = this.state.text.trim();
      const photoId = this.state.photoId;
      if (!content || !photoId) return;
      this.attempt = { id: this.uuid(), photoId, body: { content, reference: { type: 'photo', id: photoId } }, mark: !alreadyReviewed };
    }
    const attempt = this.attempt;
    const generation = this.generation;
    if (this.state.status !== 'mark-failed') {
      this.publish({ status: 'sending' });
      try {
        const message = await this.send(attempt.id, attempt.body);
        if (generation !== this.generation) return;
        if (message.id !== attempt.id || message.content !== attempt.body.content) throw new Error('Invalid send result');
      } catch {
        if (generation === this.generation) this.publish({ status: 'send-failed' });
        return;
      }
      if (!attempt.mark) {
        this.attempt = null;
        this.publish({ text: '', status: 'sent', reviewed: false });
        return;
      }
    }
    this.publish({ text: '', status: 'marking' });
    try {
      await this.markReviewed(attempt.photoId);
      if (generation !== this.generation) return;
      this.attempt = null;
      this.publish({ status: 'sent', reviewed: true });
    } catch {
      if (generation === this.generation) this.publish({ status: 'mark-failed' });
    }
  }
}
```

- [ ] **Step 5: Rewrite `web-portal/src/lib/photo-review.ts`**

```ts
export type PhotoReview = { photoId: string; reviewerName: string; reviewedAt: string };
export type ReviewQueueItem = { patientId: string; name: string; unreviewedCount: number; oldestUploadAt: string; latestUploadAt: string };
type State = { ids: string[]; selected: string[]; comparing: boolean; originals: Record<string, {url?:string; error?:boolean}>; reviews: Record<string, PhotoReview>; status: 'loading'|'ready'|'error'; pending: Record<string,boolean>; errors: Record<string,boolean> };
const initial = (): State => ({ ids:[], selected:[], comparing:false, originals:{}, reviews:{}, status:'loading', pending:{}, errors:{} });
export class PhotoReviewController {
 private state = initial();
 private generation = 0;
 private comparison = 0;
 private abort?: AbortController;
 private listeners = new Set<()=>void>();
 constructor(private fetchStatus:(ids:string[])=>Promise<{reviews:PhotoReview[]}>, private writeReview:(id:string)=>Promise<{review:PhotoReview}>, private fetchOriginal:(id:string,signal:AbortSignal)=>Promise<{photoUrl:string}>) {}
 snapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 private publish(change:Partial<State>) { this.state={...this.state,...change};this.listeners.forEach(listener=>listener()); }
 reset() { this.generation++; this.comparison++; this.abort?.abort(); this.state=initial(); this.listeners.forEach(listener=>listener()); }
 /** Loads review status for one page. `preselect` seeds the comparison with at most two ids that are on this page. */
 async load(ids:string[], preselect:string[]=[]) { this.reset(); const generation=this.generation; this.publish({ids,selected:preselect.filter(id=>ids.includes(id)).slice(0,2)}); if(!ids.length){this.publish({status:'ready'});return;}
 try { const result=await this.fetchStatus(ids); if(generation===this.generation) this.publish({status:'ready',reviews:Object.fromEntries(result.reviews.map(review=>[review.photoId,review]))}); }
 catch {if(generation===this.generation)this.publish({status:'error'});}
 }
 /** At most two photos. Changing the selection ends the running comparison so the view reloads originals. */
 toggle(id:string) { if(!this.state.ids.includes(id))return; const selected=this.state.selected.includes(id)?this.state.selected.filter(value=>value!==id):this.state.selected.length<2?[...this.state.selected,id]:this.state.selected; if(selected===this.state.selected)return; if(this.state.comparing)this.close(); this.publish({selected}); }
 close() {this.comparison++;this.abort?.abort();this.publish({comparing:false, originals:{}});}
 /** Loads signed originals for the one or two selected photos. */
 async compare() { if(!this.state.selected.length)return; this.abort?.abort();const abort=new AbortController();this.abort=abort;const request=++this.comparison;const generation=this.generation;this.publish({comparing:true,originals:{}});
 await Promise.all(this.state.selected.map(async id=>{try {const result=await this.fetchOriginal(id,abort.signal);if(request===this.comparison&&generation===this.generation)this.publish({originals:{...this.state.originals,[id]:{url:result.photoUrl}}});}catch {if(request===this.comparison&&generation===this.generation)this.publish({originals:{...this.state.originals,[id]:{error:true}}});}}));
 }
 async mark(id:string) {if(this.state.status!=='ready'||!this.state.ids.includes(id)||this.state.pending[id]||this.state.reviews[id])return;const generation=this.generation;const errors={...this.state.errors};delete errors[id];this.publish({pending:{...this.state.pending,[id]:true},errors});
 try {const {review}=await this.writeReview(id);if(generation===this.generation)this.publish({reviews:{...this.state.reviews,[id]:review}});}catch {if(generation===this.generation)this.publish({errors:{...this.state.errors,[id]:true}});}finally {if(generation===this.generation)this.publish({pending:{...this.state.pending,[id]:false}});}
 }
}
```

- [ ] **Step 6: Remove dialog-only state**

In `web-portal/src/lib/photo-history.ts` delete everything after the closing `}` of `class PhotoHistoryController` (the `PhotoOriginalState` type, `PhotoDetailState` type and `photoDetailState` function). In `web-portal/tests/photo-history.test.ts` change line 3 to `import { PhotoHistoryController } from '../src/lib/photo-history';` and delete the test `'successful original with failed or missing refreshed summary reaches a terminal dialog state'` (the last test in the file). Delete the file:

```bash
git rm -q web-portal/tests/photo-focus.test.ts
```

- [ ] **Step 7: Append compare helpers to `web-portal/src/lib/workspace.ts`**

Add at the top of the file, below `import { day } from './worklist';`:

```ts
import type { PhotoSummary } from '../types/api';
import type { PhotoReview } from './photo-review';
```

Append:

```ts
const byCapture = (a: PhotoSummary, b: PhotoSummary) => Date.parse(a.captureDate) - Date.parse(b.captureDate) || a.id.localeCompare(b.id);

/** Default comparison: the newest photo on the page and the one before it. */
export function defaultPair(photos: PhotoSummary[]) {
  return [...photos].sort(byCapture).slice(-2).map(photo => photo.id);
}

/** Selected photos in capture order, older on the left. */
export function comparePanes(photos: PhotoSummary[], selected: string[]) {
  return photos.filter(photo => selected.includes(photo.id)).sort(byCapture);
}

/** A reply is about the newer photo in the comparison. */
export function replyTarget(photos: PhotoSummary[], selected: string[]): PhotoSummary | null {
  const panes = comparePanes(photos, selected);
  return panes[panes.length - 1] ?? null;
}

export function reviewWords(review?: PhotoReview) {
  return review ? `Reviewed · ${review.reviewerName} · ${day(review.reviewedAt)}` : 'Not reviewed';
}
```

- [ ] **Step 8: Append `answerText` to `web-portal/src/lib/care-support.ts`**

```ts
/** An answer as the patient gave it: their text, the chosen option's label, or "Not answered". */
export function answerText(question: Question, response: CheckInResponse): string {
  const answer = response.answers.find((a) => a.questionId === question.id);
  if (question.type === "text") return answer?.text?.trim() ? answer.text : "Not answered";
  return question.options.find((o) => o.id === answer?.optionId)?.label ?? "Not answered";
}
```

- [ ] **Step 9: Create `web-portal/src/components/patients/workspace/PhotoCompareView.tsx`**

```tsx
/* eslint-disable @next/next/no-img-element -- Signed originals expire in minutes and must not enter the image optimizer cache. */
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PhotoReview } from '@/lib/photo-review';
import { reviewWords } from '@/lib/workspace';
import { stamp } from '@/lib/worklist';
import type { PhotoSummary } from '@/types/api';

export interface ComparePane { photo: PhotoSummary; original?: { url?: string; error?: boolean }; review?: PhotoReview }

function Original({ pane, zoom }: { pane: ComparePane; zoom: number }) {
  const [failed, setFailed] = useState(false);
  const when = stamp(pane.photo.captureDate);
  if (pane.original?.url && !failed) return <div style={{ width: `${zoom}%`, height: `${zoom}%` }}>
    <img src={pane.original.url} referrerPolicy="no-referrer" alt={`Photo captured ${when}`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
  </div>;
  const error = failed || pane.original?.error;
  return <p role={error ? 'alert' : 'status'} className="p-4 text-sm">{error ? 'Original unavailable. Use Retry originals.' : 'Loading original'}</p>;
}

// Compare is the default Photos view (spec §6 portal #2): originals, untinted and uncropped, on a near-black mat.
export function PhotoCompareView({ panes, zoom, onZoom, onRetry }: { panes: ComparePane[]; zoom: number; onZoom: (zoom: number) => void; onRetry: () => void }) {
  if (!panes.length) return <div className="space-y-2 border-y border-rule py-8">
    <h3 className="editorial-title text-2xl">Choose photos to compare</h3>
    <p className="text-sm text-ink-secondary">Select one or two photos from All photos to view the originals here.</p>
  </div>;
  return <section aria-label="Photo comparison" className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <p className="eyebrow">{panes.length === 2 ? 'Comparing' : 'Viewing'}</p>
      <label htmlFor="comparison-zoom" className="eyebrow ml-auto">Zoom</label>
      <input id="comparison-zoom" type="range" min={100} max={300} step={25} value={zoom} onChange={event => onZoom(Number(event.target.value))} className="w-32" />
      <span className="font-data text-xs font-medium tabular-nums">{zoom}%</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => onZoom(100)}>Reset zoom</Button>
    </div>
    <div className={panes.length === 2 ? 'grid gap-2 sm:grid-cols-2' : 'grid'}>
      {panes.map(pane => <figure key={pane.photo.id} className="min-w-0">
        <div tabIndex={0} role="region" aria-label={`Scrollable photo from ${stamp(pane.photo.captureDate)}`} className="photo-mat aspect-[4/5] overflow-auto">
          <Original key={pane.original?.url ?? pane.photo.id} pane={pane} zoom={zoom} />
        </div>
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
          <span className="font-data text-xs font-medium tabular-nums">{stamp(pane.photo.captureDate)}</span>
          <span className="text-xs text-ink-secondary">{reviewWords(pane.review)}</span>
        </figcaption>
      </figure>)}
    </div>
    <p className="max-w-prose text-sm text-ink-secondary">Lighting and capture conditions may differ between photos. Originals at full resolution, no filtering applied.</p>
    {panes.some(pane => pane.original?.error) && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry originals</Button>}
  </section>;
}
```

- [ ] **Step 10: Create `web-portal/src/components/patients/workspace/PhotoStrip.tsx`**

```tsx
/* eslint-disable @next/next/no-img-element -- Thumbnails are private object URLs revoked when the page changes. */
'use client';
import { Button } from '@/components/ui/button';
import type { PhotoReview } from '@/lib/photo-review';
import type { ThumbnailState } from '@/lib/private-thumbnail';
import { day, stamp } from '@/lib/worklist';
import type { PhotoSummary } from '@/types/api';

export function PhotoStrip({ photos, previews, selected, reviews, reviewStatus, total, page, totalPages, onToggle, onPage }: {
  photos: PhotoSummary[]; previews: Record<string, ThumbnailState>; selected: string[]; reviews: Record<string, PhotoReview>;
  reviewStatus: 'loading' | 'ready' | 'error'; total: number; page: number; totalPages: number;
  onToggle: (id: string) => void; onPage: (page: number) => void;
}) {
  const words = (id: string) => reviewStatus === 'ready' ? (reviews[id] ? 'Reviewed' : 'Not reviewed') : reviewStatus === 'error' ? 'Review status unavailable' : 'Checking review';
  const unreviewed = reviewStatus === 'ready' ? photos.filter(photo => !reviews[photo.id]).length : null;
  return <section aria-label="All photos" className="space-y-3">
    <p className="eyebrow">All photos · {total}</p>
    <ul className="grid grid-cols-2 gap-2">{photos.map(photo => {
      const pressed = selected.includes(photo.id);
      const preview = previews[photo.id];
      return <li key={photo.id}>
        <button type="button" aria-pressed={pressed} aria-label={`${pressed ? 'Remove from comparison' : 'Add to comparison'}: photo from ${stamp(photo.captureDate)}, ${words(photo.id)}`} disabled={!pressed && selected.length >= 2} onClick={() => onToggle(photo.id)} className="block w-full text-left disabled:cursor-not-allowed aria-pressed:selected-outline aria-pressed:focus-visible:outline-offset-2">
          <span className="photo-mat flex aspect-[4/5] items-center justify-center overflow-hidden">
            {preview?.status === 'ready' && preview.url
              ? <img src={preview.url} alt="" className="h-full w-full object-contain" />
              : <span className="p-2 text-center text-[11px]">{preview?.status === 'error' ? 'Preview unavailable' : 'Loading'}</span>}
          </span>
          <span className="mt-1 block font-data text-[11px] font-medium tabular-nums">{day(photo.captureDate)}</span>
          <span className="block text-[11px] text-ink-secondary">{words(photo.id)}</span>
        </button>
      </li>;
    })}</ul>
    <p className="meta-mono">{selected.length} selected{unreviewed === null ? '' : ` · ${unreviewed} not reviewed on this page`}</p>
    {selected.length >= 2 && <p className="text-xs text-ink-secondary">Two photos selected. Deselect one to compare another.</p>}
    <nav aria-label="Photo pages" className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="meta-mono">Page {page} of {totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  </section>;
}
```

- [ ] **Step 11: Create `web-portal/src/components/patients/workspace/PhotoReplyView.tsx`**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FeedbackState } from '@/lib/photo-feedback';
import { day } from '@/lib/worklist';
import type { PhotoSummary } from '@/types/api';

const submitLabel = (status: FeedbackState['status'], reviewed: boolean) =>
  status === 'sending' ? 'Sending…'
    : status === 'marking' ? 'Marking reviewed…'
      : status === 'send-failed' ? 'Retry same message'
        : status === 'mark-failed' ? 'Retry marking reviewed'
          : reviewed ? 'Send reply' : 'Send & mark reviewed';

export function PhotoReplyView({ patientFirstName, target, feedback, frozen, reviewed, reviewPending, reviewError, onEdit, onSubmit, onNewDraft, onLeaveUnreviewed, onMarkOnly, onCareDecision }: {
  patientFirstName: string; target: PhotoSummary | null; feedback: FeedbackState; frozen: boolean; reviewed: boolean;
  reviewPending: boolean; reviewError: boolean; onEdit: (text: string) => void; onSubmit: () => void; onNewDraft: () => void;
  onLeaveUnreviewed: () => void; onMarkOnly: () => void; onCareDecision: () => void;
}) {
  const { status, text } = feedback;
  const busy = status === 'sending' || status === 'marking';
  const retrying = status === 'send-failed' || status === 'mark-failed';
  const canSubmit = !busy && (retrying || (target !== null && text.trim().length > 0));
  return <section aria-label="Reply about this photo" className="space-y-3 border-t border-rule pt-5">
    {target?.notes && <div className="space-y-1">
      <p className="eyebrow">Patient note on {day(target.captureDate)}</p>
      <p className="max-w-prose whitespace-pre-wrap break-words font-display text-lg font-light">“{target.notes}”</p>
    </div>}
    <Label htmlFor="photo-reply" className="block">Reply about this photo</Label>
    <Textarea id="photo-reply" className="min-h-28" maxLength={4000} value={text} disabled={frozen || !target} placeholder={`Write to ${patientFirstName || 'the patient'}…`} onChange={event => onEdit(event.target.value)} />
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={!canSubmit} onClick={onSubmit}>{submitLabel(status, reviewed)}</Button>
      {target && !reviewed && <Button type="button" variant="outline" disabled={reviewPending || frozen} onClick={onMarkOnly}>{reviewPending ? 'Saving review…' : 'Mark reviewed without reply'}</Button>}
      <Button type="button" variant="outline" disabled={!target} onClick={onCareDecision}>Refer out or in-person…</Button>
      {target && <span className="meta-mono">Links photo {day(target.captureDate)}</span>}
    </div>
    {!target && <p className="text-xs text-ink-secondary">Select a photo to reply about it.</p>}
    {target && status === 'draft' && !text.trim() && <p className="text-xs text-ink-secondary">Write a reply to send it with this photo linked.</p>}
    {status === 'send-failed' && <div role="alert" className="space-y-2">
      <p className="text-sm text-error">Message could not be confirmed. The photo is not marked reviewed. Retry sends the same message.</p>
      <p className="text-xs text-ink-secondary">A previous attempt may already have been sent. Check the Messages tab before writing another.</p>
      <Button type="button" variant="outline" size="sm" onClick={onNewDraft}>Edit as a new message</Button>
    </div>}
    {status === 'mark-failed' && <div role="alert" className="space-y-2">
      <p className="text-sm text-error">Message sent. The photo is not marked reviewed yet.</p>
      <Button type="button" variant="outline" size="sm" onClick={onLeaveUnreviewed}>Leave photo unreviewed</Button>
    </div>}
    {status === 'sent' && <p role="status" className="text-sm">{feedback.reviewed ? 'Sent. Photo marked reviewed.' : 'Sent.'}</p>}
    {reviewError && <p role="alert" className="text-sm text-error">Review could not be saved. Try again.</p>}
  </section>;
}
```

- [ ] **Step 12: Create the care rail** — `web-portal/src/components/patients/workspace/CareRailView.tsx`

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { answerText, type CheckInResponse } from '@/lib/care-support';
import type { RoutineCareState } from '@/lib/routine-care';
import { day } from '@/lib/worklist';

// Keeps the current routine and latest check-in visible while writing feedback (spec §6 portal #2).
export function CareRailView({ routine, latest, checkInStatus, onRetry, onOpen }: {
  routine: RoutineCareState; latest: CheckInResponse | null; checkInStatus: 'loading' | 'ready' | 'error';
  onRetry: () => void; onOpen: (tab: 'routine' | 'check-ins') => void;
}) {
  return <div className="space-y-8">
    <section aria-label="Current routine" className="space-y-3 border-t border-rule pt-5">
      <p className="eyebrow">Current routine</p>
      {routine.loadStatus === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading routine</p>}
      {routine.loadStatus === 'error' && <p role="alert" className="text-sm">{routine.loadError}</p>}
      {routine.loadStatus === 'ready' && (['morning', 'evening'] as const).map(slot => {
        const saved = routine.slots[slot].routine;
        return <div key={slot} className="space-y-1.5">
          <p className="flex items-baseline gap-2 text-[15px] font-medium">{slot === 'morning' ? 'Morning routine' : 'Evening routine'}{saved && <span className="meta-mono">V{saved.version}</span>}{saved && !saved.isActive && <span className="text-xs font-normal text-ink-secondary">archived</span>}</p>
          {!saved ? <p className="text-sm text-ink-secondary">Not assigned.</p>
            : <ol className="space-y-1 text-sm">{saved.steps.map((step, index) => <li key={index}><span className="font-data text-xs tabular-nums text-ink-tertiary">{index + 1}</span> · {step.title}</li>)}</ol>}
        </div>;
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen('routine')}>Edit routine</Button>
    </section>
    <section aria-label="Latest check-in" className="space-y-3 border-t border-rule pt-5">
      <p className="eyebrow">{latest ? `Latest check-in · ${day(latest.submittedAt)}` : 'Latest check-in'}</p>
      {checkInStatus === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading check-ins</p>}
      {checkInStatus === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">Check-ins could not be loaded.</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>}
      {checkInStatus === 'ready' && !latest && <p className="text-sm text-ink-secondary">No check-ins submitted yet.</p>}
      {latest && <dl className="space-y-2 text-sm">{latest.form.questions.slice(0, 4).map(question => <div key={question.id}>
        <dt className="text-ink-secondary">{question.prompt}</dt>
        <dd className="font-medium">{answerText(question, latest)}</dd>
      </div>)}</dl>}
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen('check-ins')}>All check-ins</Button>
    </section>
  </div>;
}
```

`web-portal/src/components/patients/workspace/CareRail.tsx`:

```tsx
'use client';
import { useCallback } from 'react';
import { useRead } from '@/components/care-support/shared';
import { useClinicalAPI } from '@/lib/auth';
import type { RoutineCareState } from '@/lib/routine-care';
import { CareRailView } from './CareRailView';

export default function CareRail({ patientId, routine, onOpen }: { patientId: string; routine: RoutineCareState; onOpen: (tab: 'routine' | 'check-ins') => void }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => api.getPatientResponses(patientId, 1), [api, patientId]);
  const responses = useRead(fetch);
  return <CareRailView routine={routine} latest={responses.data?.data[0] ?? null} checkInStatus={responses.status} onRetry={responses.retry} onOpen={onOpen} />;
}
```

- [ ] **Step 13: Rewrite `web-portal/src/components/patients/PatientPhotoHistory.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth, useClinicalAPI } from '@/lib/auth';
import { sessionBoundary } from '@/lib/api';
import { PhotoFeedbackController } from '@/lib/photo-feedback';
import { PhotoHistoryController } from '@/lib/photo-history';
import { PhotoReviewController } from '@/lib/photo-review';
import { PrivateThumbnailController } from '@/lib/private-thumbnail';
import { comparePanes, defaultPair, firstName, replyTarget } from '@/lib/workspace';
import CareDecisionDialog from './CareDecisionDialog';
import { PhotoCompareView } from './workspace/PhotoCompareView';
import { PhotoReplyView } from './workspace/PhotoReplyView';
import { PhotoStrip } from './workspace/PhotoStrip';

export default function PatientPhotoHistory({ patientId, patientName, onCareDecision, rail }: { patientId: string; patientName: string; onCareDecision?: () => void; rail?: ReactNode }) {
  const api = useClinicalAPI();
  const { user } = useAuth();
  const clinicianId = user?.id ?? '';
  const history = useMemo(() => new PhotoHistoryController(page => api.getPatientPhotoSummaries(patientId, page, 12)), [api, patientId]);
  const thumbnails = useMemo(() => new PrivateThumbnailController((id, signal) => api.getPhotoThumbnail(id, signal)), [api]);
  const reviews = useMemo(() => new PhotoReviewController(ids => api.getPhotoReviewStatus(ids), id => api.markPhotoReviewed(id), (id, signal) => api.getPhotoOriginal(id, signal)), [api]);
  // "Send & mark reviewed": the reply with its photo reference, then the existing per-photo review, owned by `reviews`.
  const feedback = useMemo(() => new PhotoFeedbackController(
    (id, body) => api.sendAssignedMessage(patientId, clinicianId, id, body),
    async photoId => {
      await reviews.mark(photoId);
      if (!reviews.snapshot().reviews[photoId]) throw new Error('Review not confirmed');
    },
  ), [api, patientId, clinicianId, reviews]);
  const state = useSyncExternalStore(history.subscribe, history.snapshot, history.snapshot);
  const previews = useSyncExternalStore(thumbnails.subscribe, thumbnails.snapshot, thumbnails.snapshot);
  const reviewState = useSyncExternalStore(reviews.subscribe, reviews.snapshot, reviews.snapshot);
  const reply = useSyncExternalStore(feedback.subscribe, feedback.snapshot, feedback.snapshot);
  const [zoom, setZoom] = useState(100);
  const [decisionPhotoId, setDecisionPhotoId] = useState<string | null>(null);
  const lastSelection = useRef<string[]>([]);

  useEffect(() => {
    void history.load(1);
    return () => history.cancel();
  }, [history]);
  useEffect(() => {
    thumbnails.load(state.photos.map(photo => photo.id));
    const unsubscribe = sessionBoundary.subscribe(() => thumbnails.dispose());
    return () => { unsubscribe(); thumbnails.dispose(); };
  }, [thumbnails, state.photos]);
  useEffect(() => {
    if (reviewState.selected.length) lastSelection.current = reviewState.selected;
  }, [reviewState.selected]);
  useEffect(() => {
    const ids = state.photos.map(photo => photo.id);
    // Refresh keeps the photos being compared when they are still on the page; a new page starts from the newest pair.
    const previous = lastSelection.current.filter(id => ids.includes(id));
    void reviews.load(ids, previous.length ? previous : defaultPair(state.photos));
    const unsubscribe = sessionBoundary.subscribe(() => { reviews.reset(); feedback.cancel(); });
    return () => { unsubscribe(); reviews.reset(); };
  }, [reviews, feedback, state.photos]);
  useEffect(() => () => feedback.cancel(), [feedback]);
  const selectedKey = reviewState.selected.join(',');
  const comparing = reviewState.comparing;
  useEffect(() => {
    if (selectedKey && !comparing) void reviews.compare();
  }, [reviews, selectedKey, comparing]);
  const targetId = replyTarget(state.photos, reviewState.selected)?.id ?? null;
  useEffect(() => { feedback.target(targetId); }, [feedback, targetId]);

  const ids = state.photos.map(photo => photo.id);
  const panes = comparePanes(state.photos, reviewState.selected);
  const replyPhoto = state.photos.find(photo => photo.id === reply.photoId) ?? null;
  const reviewed = replyPhoto ? Boolean(reviewState.reviews[replyPhoto.id]) : false;
  const name = firstName(patientName);
  const refresh = () => { void history.load(state.page); };

  return <section aria-label="Patient photos" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-secondary">Capture times are shown in your local timezone.</p>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={state.status === 'loading'}>Refresh images</Button>
      </div>
      {state.status === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading photos</p>}
      {state.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">{state.error}</p><Button type="button" variant="outline" size="sm" onClick={refresh}>Retry photos</Button></div>}
      {reviewState.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">Review status is unavailable. Photos can still be compared.</p><Button type="button" variant="outline" size="sm" onClick={() => void reviews.load(ids, reviewState.selected)}>Retry review status</Button></div>}
      {state.status === 'ready' && state.photos.length === 0 && <div className="space-y-2 py-6">
        <h3 className="editorial-title text-2xl">No shared photos yet</h3>
        <p className="text-sm text-ink-secondary">Photos appear here after {name || 'the patient'} shares them from the app.</p>
      </div>}
      {state.status === 'ready' && state.photos.length > 0 && <>
        <PhotoCompareView
          panes={panes.map(photo => ({ photo, original: reviewState.originals[photo.id], review: reviewState.reviews[photo.id] }))}
          zoom={zoom}
          onZoom={setZoom}
          onRetry={() => reviews.close()}
        />
        <PhotoReplyView
          patientFirstName={name}
          target={replyPhoto}
          feedback={reply}
          frozen={feedback.frozen}
          reviewed={reviewed}
          reviewPending={replyPhoto ? Boolean(reviewState.pending[replyPhoto.id]) : false}
          reviewError={replyPhoto ? Boolean(reviewState.errors[replyPhoto.id]) : false}
          onEdit={text => feedback.edit(text)}
          onSubmit={() => void feedback.submit(reviewed)}
          onNewDraft={() => feedback.newDraft()}
          onLeaveUnreviewed={() => feedback.leaveUnreviewed()}
          onMarkOnly={() => { if (replyPhoto) void reviews.mark(replyPhoto.id); }}
          onCareDecision={() => { if (replyPhoto) setDecisionPhotoId(replyPhoto.id); }}
        />
      </>}
    </div>
    <aside aria-label="Photos and care summary" className="min-w-0 space-y-8">
      {state.status === 'ready' && state.photos.length > 0 && <PhotoStrip
        photos={state.photos}
        previews={previews}
        selected={reviewState.selected}
        reviews={reviewState.reviews}
        reviewStatus={reviewState.status}
        total={state.total}
        page={state.page}
        totalPages={state.totalPages}
        onToggle={id => reviews.toggle(id)}
        onPage={page => { void history.load(page); }}
      />}
      {rail}
    </aside>
    <CareDecisionDialog
      patientId={patientId}
      photoId={decisionPhotoId}
      defaultDecision="refer_out"
      open={decisionPhotoId !== null}
      onOpenChange={open => { if (!open) setDecisionPhotoId(null); }}
      onSaved={() => { setDecisionPhotoId(null); onCareDecision?.(); }}
      onSettledAfterClose={() => onCareDecision?.()}
    />
  </section>;
}
```

- [ ] **Step 14: Wire the page** — `web-portal/src/app/patients/[id]/page.tsx`

Add `import CareRail from '@/components/patients/workspace/CareRail';` below the `WorkspaceHeader` import, and replace the photos panel line with:

```tsx
          {panel('photos', <PatientPhotoHistory key={'photos-' + id} patientId={id} patientName={patient.name} onCareDecision={() => setCareRefresh(value => value + 1)} rail={<CareRail patientId={id} routine={routine.state} onOpen={openTab} />} />)}
```

- [ ] **Step 15: Record omissions** — append to `docs/design/letterpress/deferred.md`

```markdown
| Portal Workspace · Photos | Overlay and Grid compare modes | Not built; side-by-side comparison with zoom ships first |
| Portal Workspace · Photos | "Mark 3 reviewed" header action | Reviews are recorded one photo at a time; a bulk action would be a new flow |
| Portal Workspace · Photos | "Save draft" for a photo reply | Replies are not stored until sent |
```

- [ ] **Step 16: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/photo-feedback.test.ts tests/workspace-photos.test.ts tests/photo-review.test.ts tests/photo-history.test.ts tests/workspace.test.ts`
Expected: PASS.
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 17: Commit**

```bash
git add web-portal/src/lib/photo-feedback.ts web-portal/src/lib/photo-review.ts web-portal/src/lib/photo-history.ts web-portal/src/lib/workspace.ts web-portal/src/lib/care-support.ts web-portal/src/components/patients/PatientPhotoHistory.tsx web-portal/src/components/patients/workspace "web-portal/src/app/patients/[id]/page.tsx" docs/design/letterpress/deferred.md web-portal/tests/photo-feedback.test.ts web-portal/tests/workspace-photos.test.ts web-portal/tests/photo-review.test.ts web-portal/tests/photo-history.test.ts web-portal/tests/photo-focus.test.ts
git commit -m "portal: make Compare the default photo view with Send & mark reviewed and a care rail" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Routine tab — two panes, visible draft, version history beside [judgment]

**Files:**
- Modify: `web-portal/src/lib/routine-care.ts` (add `discard` method; append `StepChange`, `DraftChanges`, `draftChanges`, `slotBadges`, `draftNotice`)
- Modify (full rewrite): `web-portal/src/components/patients/PatientRoutineCare.tsx`, `web-portal/src/components/care-support/TemplatePicker.tsx`
- Create: `web-portal/src/components/patients/workspace/RoutineSlotEditor.tsx`, `RoutineVersionList.tsx`, `RoutineVersionHistory.tsx`; `web-portal/src/components/care-support/TemplateList.tsx`
- Modify: `web-portal/src/app/patients/[id]/page.tsx` (routine panel), `docs/design/letterpress/deferred.md`
- Test: create `web-portal/tests/routine-editor.test.ts`

**Interfaces:**
- Consumes: Task 1 `apiService.getPatientRoutineRevisions`, `loadRevisionHistory`, `RevisionHistory`; Task 2 `firstName`, page `openTab`; PR 4 `plural`, `day`; existing `RoutineCareController` (`setName`, `setActive`, `addStep`, `removeStep`, `setStepTitle`, `setStepInstructions`, `moveStep`, `save`, `retry`, `canReloadConflict`, `reloadConflict`, `copyTemplate`, `load`).
- Produces:
  - `RoutineCareController.discard(slot: RoutineTimeOfDay): void`.
  - `type StepChange = { kind: 'same' } | { kind: 'new' } | { kind: 'edited'; was: string }`; `interface DraftChanges { name: string | null; active: boolean | null; steps: StepChange[]; removed: number; count: number }`; `draftChanges(routine: RoutineRevision | null, draft: RoutineDraft): DraftChanges`; `slotBadges(editor): { label: string; variant: 'outline' | 'secondary' }[]`; `draftNotice(patientFirstName: string, editor): string`.
  - `RoutineSlotEditor({ slot, editor, controller, primary: boolean, patientFirstName, onReloadConflict, onFeedback(revisionId) })`; `RoutineVersionList({ slot, state: VersionListState, page, onPage, onRetry })` with `type VersionListState = { status: 'loading' } | { status: 'error' } | RevisionHistory`; `RoutineVersionHistory` (default) `{ patientId; slot }`; `TemplateList({ templates, disabled: Record<RoutineTimeOfDay, boolean>, onCopy(slot, template) })`; `TemplatePicker` (default) `{ disabled: Record<RoutineTimeOfDay, boolean>; onCopy(slot, template) }`.
  - `PatientRoutineCare` props `{ patientId; patientName; controller; state; onFeedback(revisionId) }`.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/routine-editor.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoutineCareController, draftChanges, draftNotice, slotBadges, type RoutineEditorState } from '../src/lib/routine-care';
import { RoutineSlotEditor } from '../src/components/patients/workspace/RoutineSlotEditor';
import { RoutineVersionList } from '../src/components/patients/workspace/RoutineVersionList';
import { TemplateList } from '../src/components/care-support/TemplateList';
import type { RoutineRevision } from '../src/types/api';
import { read } from './letterpress-rules';

const saved: RoutineRevision = { id: 'rev-4', userId: 'p', timeOfDay: 'morning', version: 4, createdBy: 'c', createdAt: '2026-09-02T09:00:00', name: 'Morning routine', isActive: true, steps: [
  { title: 'Gentle cleanser', instructions: 'Lukewarm water' },
  { title: 'Adapalene 0.1%', instructions: 'Every night' },
  { title: 'SPF 30', instructions: '' },
] };
const editor = (over: Partial<RoutineEditorState> = {}): RoutineEditorState => ({
  routine: saved, draft: { name: saved.name, isActive: true, steps: saved.steps.map(step => ({ ...step })) },
  expectedRevisionId: saved.id, status: 'ready', error: '', dirty: false, hasPendingSave: false, ...over,
});
const controller = () => new RoutineCareController({
  fetchSnapshot: async () => ({ routines: [saved], completions: [] }),
  saveRevision: async () => { throw new Error('offline'); },
  fetchHistory: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
});
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;
const noop = () => {};

test('draft changes spell out what each edited step was', () => {
  const draft = { name: 'Morning routine, reduced', isActive: false, steps: [
    { title: 'Gentle cleanser', instructions: 'Lukewarm water' },
    { title: 'Adapalene 0.1%', instructions: 'Three nights a week' },
    { title: 'Moisturizer', instructions: '' },
    { title: 'Reapply SPF', instructions: '' },
  ] };
  const changes = draftChanges(saved, draft);
  assert.deepEqual(changes.steps, [{ kind: 'same' }, { kind: 'edited', was: 'Every night' }, { kind: 'edited', was: 'SPF 30' }, { kind: 'new' }]);
  assert.deepEqual([changes.name, changes.active, changes.removed, changes.count], ['Morning routine', true, 0, 5]);
  assert.equal(draftChanges(saved, { ...draft, steps: draft.steps.slice(0, 1) }).removed, 2);
  assert.deepEqual(draftChanges(saved, { name: saved.name, isActive: true, steps: [saved.steps[0], saved.steps[1], { title: 'SPF 30', instructions: 'Reapply midday' }] }).steps[2], { kind: 'edited', was: 'no instructions' });
  assert.equal(draftChanges(saved, { name: saved.name, isActive: true, steps: [{ title: 'x'.repeat(60), instructions: '' }] }).steps[0].kind, 'edited');
  assert.equal((draftChanges({ ...saved, steps: [{ title: 'y'.repeat(60), instructions: '' }] }, { name: saved.name, isActive: true, steps: [{ title: 'z', instructions: '' }] }).steps[0] as { was: string }).was.length, 48);
});

test('badges and notice state the active version, the draft, and that the patient stays on it until save', () => {
  assert.deepEqual(slotBadges(editor()).map(b => b.label), ['V4 active']);
  assert.deepEqual(slotBadges(editor({ dirty: true })).map(b => b.label), ['V4 active', 'Draft v5']);
  assert.deepEqual(slotBadges(editor({ routine: null, dirty: true })).map(b => b.label), ['Not assigned', 'Draft v1']);
  assert.equal(draftNotice('Ada', editor({ dirty: true })), 'Ada keeps following v4 until v5 is saved.');
  assert.equal(draftNotice('Ada', editor({ routine: null })), 'Nothing is assigned to Ada until v1 is saved.');
  assert.equal(draftNotice('', editor({ routine: { ...saved, isActive: false } })), 'The patient has no active routine in this slot until v5 is saved.');
});

test('discard restores the saved version and is refused while a save is unresolved', async () => {
  const routines = controller();
  await routines.load();
  routines.setStepInstructions('morning', 1, 'Three nights a week');
  routines.discard('morning');
  assert.deepEqual([routines.snapshot().slots.morning.dirty, routines.snapshot().slots.morning.draft.steps[1].instructions], [false, 'Every night']);
  routines.setStepInstructions('morning', 1, 'Three nights a week');
  await routines.save('morning');
  assert.equal(routines.snapshot().slots.morning.hasPendingSave, true);
  routines.discard('morning');
  assert.equal(routines.snapshot().slots.morning.draft.steps[1].instructions, 'Three nights a week');
});

test('slot editor: edited step tinted with its previous value, V4 active and Draft v5, Save as v5 as the one filled action', () => {
  const draftEditor = editor({ dirty: true, draft: { name: saved.name, isActive: true, steps: [saved.steps[0], { title: 'Adapalene 0.1%', instructions: 'Three nights a week' }, saved.steps[2]] } });
  const html = renderToStaticMarkup(h(RoutineSlotEditor, { slot: 'morning', editor: draftEditor, controller: controller(), primary: true, patientFirstName: 'Ada', onReloadConflict: noop, onFeedback: noop }));
  assert.equal((html.match(/data-edited="true"/g) ?? []).length, 1);
  assert.match(html, /data-edited="true" class="[^"]*bg-attention-wash/);
  assert.match(html, /Edited · was “Every night”/);
  assert.match(html, />V4 active</); assert.match(html, />Draft v5</);
  assert.match(html, />Save as v5</); assert.equal(filled(html), 1);
  assert.match(html, /Ada keeps following v4 until v5 is saved\./);
  assert.match(html, />1 unsaved change</);
  assert.match(html, />01</); assert.match(html, />03</);
  assert.match(html, />Send feedback about v4</);
  const empty = renderToStaticMarkup(h(RoutineSlotEditor, { slot: 'evening', editor: editor({ routine: null, draft: { name: '', isActive: true, steps: [] } }), controller: controller(), primary: false, patientFirstName: 'Ada', onReloadConflict: noop, onFeedback: noop }));
  assert.equal(filled(empty), 0);
  assert.match(empty, />Not assigned</);
  assert.match(empty, /No steps yet\. Add at least one step before activating, or start from a template\./);
});

test('version history lists saved versions newest first, and says so plainly when the server is older', () => {
  const ready = renderToStaticMarkup(h(RoutineVersionList, { slot: 'morning', page: 1, onPage: noop, onRetry: noop, state: { status: 'ready', page: { data: [saved, { ...saved, id: 'rev-3', version: 3, isActive: false, createdAt: '2026-08-12T09:00:00' }], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } } } }));
  assert.match(ready, /Version history · morning/); assert.match(ready, />V4</); assert.match(ready, />V3</);
  assert.match(ready, /02 SEP/); assert.match(ready, /Morning routine · archived/); assert.match(ready, /1 · Gentle cleanser/);
  assert.match(renderToStaticMarkup(h(RoutineVersionList, { slot: 'evening', page: 1, onPage: noop, onRetry: noop, state: { status: 'unsupported' } })), /Earlier versions are not available from this server yet\./);
  assert.match(renderToStaticMarkup(h(RoutineVersionList, { slot: 'evening', page: 1, onPage: noop, onRetry: noop, state: { status: 'ready', page: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } } })), /No saved versions yet\./);
});

test('templates beside the editor copy into a chosen slot and are blocked for a slot with an unresolved save', () => {
  const html = renderToStaticMarkup(h(TemplateList, { templates: [{ id: 't', revisionId: 'tr', version: 5, name: 'Tretinoin ramp', steps: [saved.steps[0], saved.steps[1]], isActive: true, updatedAt: '2026-08-28T00:00:00' }], disabled: { morning: true, evening: false }, onCopy: noop }));
  assert.match(html, /Tretinoin ramp/); assert.match(html, /V5 · 2 steps/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Use in morning<\/button>/);
  assert.match(html, /<button(?![^>]*disabled="")[^>]*>Use in evening<\/button>/);
  assert.match(renderToStaticMarkup(h(TemplateList, { templates: [], disabled: { morning: false, evening: false }, onCopy: noop })), /No active templates on this page\./);
});

test('the routine tab places templates and version history beside the two panes and links feedback to the Messages tab', () => {
  const source = read('src/components/patients/PatientRoutineCare.tsx');
  assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_16rem\]/);
  assert.match(source, /<TemplatePicker /); assert.match(source, /<RoutineVersionHistory /);
  assert.match(read('src/components/patients/workspace/RoutineVersionHistory.tsx'), /loadRevisionHistory\(\(\) => api\.getPatientRoutineRevisions\(patientId, slot, page\)\)/);
  assert.match(read('src/app/patients/[id]/page.tsx'), /openTab\('messages', \{ referenceType: 'routineRevision', referenceId: revisionId \}\)/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/routine-editor.test.ts`
Expected: FAIL — `draftChanges` is not exported; `RoutineSlotEditor` module not found.

- [ ] **Step 3: Extend `web-portal/src/lib/routine-care.ts`**

Inside `class RoutineCareController`, after `moveStep(…) { … }`, add:

```ts
  /** Restores the saved revision into the draft. Refused while a save for this slot is unresolved. */
  discard(slot: RoutineTimeOfDay) {
    if (this.assignmentLoads > 0 || this.pending[slot] || this.saves[slot]) return;
    this.updateSlot(slot, current => current.routine
      ? { ...current, draft: draftFrom(current.routine), dirty: false, status: 'ready', error: '' }
      : emptyEditor());
  }
```

Append at the end of the file:

```ts
export type StepChange = { kind: 'same' } | { kind: 'new' } | { kind: 'edited'; was: string };
export interface DraftChanges {
  /** The saved name when the draft renamed the routine. */
  name: string | null;
  /** The saved active state when the draft changed it. */
  active: boolean | null;
  steps: StepChange[];
  removed: number;
  count: number;
}
const clip = (text: string) => {
  const value = text.trim();
  return value.length > 48 ? `${value.slice(0, 47)}…` : value;
};

/** Positional diff against the saved revision, so each edited step can say what it was. */
export function draftChanges(routine: RoutineRevision | null, draft: RoutineDraft): DraftChanges {
  const saved = routine?.steps ?? [];
  const steps: StepChange[] = draft.steps.map((step, index) => {
    const before = saved[index];
    if (!routine || !before) return { kind: 'new' };
    if (before.title !== step.title) return { kind: 'edited', was: clip(before.title) };
    if (before.instructions !== step.instructions) return { kind: 'edited', was: before.instructions.trim() ? clip(before.instructions) : 'no instructions' };
    return { kind: 'same' };
  });
  const name = routine && routine.name !== draft.name ? routine.name : null;
  const active = routine && routine.isActive !== draft.isActive ? routine.isActive : null;
  const removed = Math.max(0, saved.length - draft.steps.length);
  const count = (name === null ? 0 : 1) + (active === null ? 0 : 1) + steps.filter(step => step.kind !== 'same').length + removed;
  return { name, active, steps, removed, count };
}

export function slotBadges(editor: RoutineEditorState): { label: string; variant: 'outline' | 'secondary' }[] {
  const routine = editor.routine;
  const badges: { label: string; variant: 'outline' | 'secondary' }[] = [
    routine ? { label: `V${routine.version} ${routine.isActive ? 'active' : 'archived'}`, variant: 'outline' } : { label: 'Not assigned', variant: 'secondary' },
  ];
  if (editor.dirty || editor.hasPendingSave) badges.push({ label: `Draft v${(routine?.version ?? 0) + 1}`, variant: 'secondary' });
  return badges;
}

/** Says plainly that saving is what changes the patient's routine. */
export function draftNotice(patientFirstName: string, editor: RoutineEditorState): string {
  const routine = editor.routine;
  const next = (routine?.version ?? 0) + 1;
  if (!routine) return `Nothing is assigned to ${patientFirstName || 'the patient'} until v1 is saved.`;
  const who = patientFirstName || 'The patient';
  if (!routine.isActive) return `${who} has no active routine in this slot until v${next} is saved.`;
  return `${who} keeps following v${routine.version} until v${next} is saved.`;
}
```

- [ ] **Step 4: Create `web-portal/src/components/patients/workspace/RoutineSlotEditor.tsx`**

```tsx
'use client';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { draftChanges, draftNotice, slotBadges, type RoutineCareController, type RoutineEditorState } from '@/lib/routine-care';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/worklist';
import type { RoutineTimeOfDay } from '@/types/api';

export function RoutineSlotEditor({ slot, editor, controller, primary, patientFirstName, onReloadConflict, onFeedback }: {
  slot: RoutineTimeOfDay; editor: RoutineEditorState; controller: RoutineCareController; primary: boolean;
  patientFirstName: string; onReloadConflict: () => void; onFeedback: (revisionId: string) => void;
}) {
  const label = slot === 'morning' ? 'Morning' : 'Evening';
  const lower = label.toLowerCase();
  const locked = editor.hasPendingSave;
  const saving = editor.status === 'saving';
  const tracked = editor.routine !== null;
  const changes = draftChanges(editor.routine, editor.draft);
  const next = (editor.routine?.version ?? 0) + 1;
  const dirtyText = !editor.dirty ? 'No unsaved changes'
    : !tracked ? 'Unsaved draft'
      : changes.count === 0 ? `Draft matches v${editor.routine?.version}` : plural(changes.count, 'unsaved change');

  return <section aria-label={`${label} routine editor`} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2">
      <h3 className="text-[17px] font-medium">{label} routine</h3>
      <div className="flex flex-wrap gap-1.5">{slotBadges(editor).map(badge => <Badge key={badge.label} variant={badge.variant}>{badge.label}</Badge>)}</div>
    </div>

    <div className="space-y-1.5">
      <Label htmlFor={`${slot}-routine-name`}>Routine name</Label>
      <Input id={`${slot}-routine-name`} aria-label={`${label} routine name`} value={editor.draft.name} maxLength={120} disabled={locked} placeholder={`${label} routine`} onChange={event => controller.setName(slot, event.target.value)} />
      {tracked && changes.name !== null && <p className="meta-mono">Edited · was “{changes.name}”</p>}
    </div>

    <div className="flex items-center justify-between gap-4 border-y border-rule py-3">
      <div className="space-y-0.5">
        <label htmlFor={`${slot}-active`} className="text-sm font-medium">Active assignment</label>
        <p className="text-xs text-ink-secondary">Turn off and save to archive this routine.</p>
        {tracked && changes.active !== null && <p className="meta-mono">Edited · was {changes.active ? 'active' : 'archived'}</p>}
      </div>
      <Switch id={`${slot}-active`} aria-label={`${label} routine active`} checked={editor.draft.isActive} disabled={locked} onCheckedChange={checked => controller.setActive(slot, checked)} />
    </div>

    <div className="flex items-center justify-between gap-2">
      <p className="eyebrow">Ordered steps · {editor.draft.steps.length}</p>
      <Button type="button" variant="outline" size="sm" disabled={locked || editor.draft.steps.length >= 20} onClick={() => controller.addStep(slot)}><Plus aria-hidden />Add step</Button>
    </div>
    {editor.draft.steps.length === 0
      ? <p className="text-sm text-ink-secondary">No steps yet. Add at least one step before activating, or start from a template.</p>
      : <ol className="divide-y divide-rule border-y border-rule">{editor.draft.steps.map((step, index) => {
        const change = changes.steps[index];
        const marked = tracked && change.kind !== 'same';
        // Inside the attention wash, secondary ink replaces ink.tertiary (4.28:1 there in dark mode).
        const quiet = marked ? 'text-ink-secondary' : undefined;
        return <li key={index} data-edited={marked || undefined} className={cn('grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 px-2 py-3', marked && 'bg-attention-wash')}>
          <span className="pt-6 font-data text-xs font-medium tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${slot}-step-${index}-title`} className={quiet}>Step title</Label>
            <Input id={`${slot}-step-${index}-title`} aria-label={`${label} step ${index + 1} title`} value={step.title} maxLength={120} disabled={locked} className={cn(marked && 'placeholder:text-ink-secondary')} onChange={event => controller.setStepTitle(slot, index, event.target.value)} />
            <Label htmlFor={`${slot}-step-${index}-instructions`} className={cn('block pt-2', quiet)}>Instructions</Label>
            <Textarea id={`${slot}-step-${index}-instructions`} aria-label={`${label} step ${index + 1} instructions`} value={step.instructions} maxLength={2000} disabled={locked} className="min-h-16" onChange={event => controller.setStepInstructions(slot, index, event.target.value)} />
            {marked && <p className={cn('meta-mono', quiet)}>{change.kind === 'edited' ? `Edited · was “${change.was}”` : 'New step'}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${lower} step ${index + 1} up`} disabled={locked || index === 0} onClick={() => controller.moveStep(slot, index, index - 1)}><ArrowUp aria-hidden /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${lower} step ${index + 1} down`} disabled={locked || index === editor.draft.steps.length - 1} onClick={() => controller.moveStep(slot, index, index + 1)}><ArrowDown aria-hidden /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${lower} step ${index + 1}`} disabled={locked} onClick={() => controller.removeStep(slot, index)}><X aria-hidden /></Button>
          </div>
        </li>;
      })}</ol>}
    {tracked && changes.removed > 0 && <p className="meta-mono">{plural(changes.removed, 'step')} removed</p>}

    {editor.error && <div role="alert" className="space-y-2 border-l-2 border-error pl-3">
      <p className="text-sm text-error">{editor.error}</p>
      {editor.status === 'conflict'
        ? <Button type="button" variant="outline" size="sm" disabled={!controller.canReloadConflict(slot)} onClick={onReloadConflict}>Reload assignments</Button>
        : editor.hasPendingSave ? <Button type="button" variant="outline" size="sm" onClick={() => void controller.retry(slot)}>Retry the same save</Button> : null}
    </div>}

    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={primary ? 'default' : 'outline'} disabled={saving || locked || !editor.dirty} onClick={() => void controller.save(slot)}>{saving ? `Saving v${next}…` : `Save as v${next}`}</Button>
      <Button type="button" variant="outline" disabled={locked || !editor.dirty} onClick={() => controller.discard(slot)}>Discard draft</Button>
      <p role="status" className="text-sm text-ink-secondary">{dirtyText}</p>
    </div>
    <p className="max-w-prose text-sm text-ink-secondary">{draftNotice(patientFirstName, editor)}</p>
    {editor.routine && <Button type="button" variant="link" size="sm" className="px-0" onClick={() => onFeedback(editor.routine!.id)}>Send feedback about v{editor.routine.version}</Button>}
  </section>;
}
```

- [ ] **Step 5: Create the version history** — `web-portal/src/components/patients/workspace/RoutineVersionList.tsx`

```tsx
'use client';
import { Button } from '@/components/ui/button';
import type { RevisionHistory } from '@/lib/routine-care';
import { day } from '@/lib/worklist';
import type { RoutineTimeOfDay } from '@/types/api';

export type VersionListState = { status: 'loading' } | { status: 'error' } | RevisionHistory;

export function RoutineVersionList({ slot, state, page, onPage, onRetry }: { slot: RoutineTimeOfDay; state: VersionListState; page: number; onPage: (page: number) => void; onRetry: () => void }) {
  const label = slot === 'morning' ? 'Morning' : 'Evening';
  return <section aria-label={`${label} version history`} className="space-y-2">
    <p className="eyebrow">Version history · {slot}</p>
    {state.status === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading versions</p>}
    {state.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">Versions could not be loaded.</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>}
    {state.status === 'unsupported' && <p className="text-sm text-ink-secondary">Earlier versions are not available from this server yet.</p>}
    {state.status === 'ready' && (state.page.data.length === 0
      ? <p className="text-sm text-ink-secondary">No saved versions yet.</p>
      : <ol className="divide-y divide-rule border-y border-rule">{state.page.data.map(revision => <li key={revision.id} className="py-2">
        <details>
          <summary className="grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-sm">
            <span className="font-data text-xs font-medium tabular-nums">V{revision.version}</span>
            <span className="min-w-0 truncate">{revision.name}{revision.isActive ? '' : ' · archived'}</span>
            <span className="meta-mono">{day(revision.createdAt)}</span>
          </summary>
          <ol className="mt-2 space-y-1 pl-10 text-sm text-ink-secondary">{revision.steps.length
            ? revision.steps.map((step, index) => <li key={index}>{index + 1} · {step.title}</li>)
            : <li>No steps</li>}</ol>
        </details>
      </li>)}</ol>)}
    {state.status === 'ready' && state.page.pagination.totalPages > 1 && <nav aria-label={`${label} version pages`} className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Newer</Button>
      <span className="meta-mono">Page {page} of {state.page.pagination.totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= state.page.pagination.totalPages} onClick={() => onPage(page + 1)}>Older</Button>
    </nav>}
  </section>;
}
```

`web-portal/src/components/patients/workspace/RoutineVersionHistory.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { loadRevisionHistory } from '@/lib/routine-care';
import type { RoutineTimeOfDay } from '@/types/api';
import { RoutineVersionList, type VersionListState } from './RoutineVersionList';

export default function RoutineVersionHistory({ patientId, slot }: { patientId: string; slot: RoutineTimeOfDay }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<VersionListState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    loadRevisionHistory(() => api.getPatientRoutineRevisions(patientId, slot, page))
      .then(value => { if (active) setState(value); }, () => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, [api, patientId, slot, page, attempt]);
  return <RoutineVersionList slot={slot} state={state} page={page} onPage={setPage} onRetry={() => setAttempt(value => value + 1)} />;
}
```

- [ ] **Step 6: Templates beside the editor** — create `web-portal/src/components/care-support/TemplateList.tsx`

```tsx
"use client";
import { Button } from "@/components/ui/button";
import type { Template } from "@/lib/care-support";
import { plural } from "@/lib/worklist";
import type { RoutineTimeOfDay } from "@/types/api";

export function TemplateList({
  templates,
  disabled,
  onCopy,
}: {
  templates: Template[];
  disabled: Record<RoutineTimeOfDay, boolean>;
  onCopy: (slot: RoutineTimeOfDay, template: Template) => void;
}) {
  if (!templates.length) return <p className="text-sm text-ink-secondary">No active templates on this page.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {templates.map((template) => (
        <li key={template.id} className="space-y-1 py-2">
          <p className="text-sm font-medium">{template.name}</p>
          <p className="meta-mono">V{template.version} · {plural(template.steps.length, "step")}</p>
          <div className="flex gap-4">
            {(["morning", "evening"] as const).map((slot) => (
              <Button
                key={slot}
                type="button"
                variant="link"
                size="sm"
                className="min-h-0 px-0 py-0"
                disabled={disabled[slot]}
                aria-label={`Use ${template.name} in the ${slot} draft`}
                onClick={() => onCopy(slot, template)}
              >
                Use in {slot}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

Rewrite `web-portal/src/components/care-support/TemplatePicker.tsx`:

```tsx
"use client";
import { useCallback, useState } from "react";
import { useClinicalAPI } from "@/lib/auth";
import type { Template } from "@/lib/care-support";
import type { RoutineTimeOfDay } from "@/types/api";
import { LoadState, Pages, useRead } from "./shared";
import { TemplateList } from "./TemplateList";

export default function TemplatePicker({
  disabled,
  onCopy,
}: {
  disabled: Record<RoutineTimeOfDay, boolean>;
  onCopy: (slot: RoutineTimeOfDay, template: Template) => void;
}) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getTemplates(page), [api, page]);
  const result = useRead(fetch);
  return (
    <section aria-label="Your templates" className="space-y-2">
      <p className="eyebrow">Your templates</p>
      <LoadState {...result} loading="Loading templates" />
      {result.data && (
        <TemplateList templates={result.data.data.filter((t) => t.isActive)} disabled={disabled} onCopy={onCopy} />
      )}
      {result.data && result.data.pagination.totalPages > 1 && (
        <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />
      )}
      <p className="text-xs text-ink-secondary">Using a template replaces that draft. Review it, then save the routine.</p>
    </section>
  );
}
```

- [ ] **Step 7: Rewrite `web-portal/src/components/patients/PatientRoutineCare.tsx`**

```tsx
'use client';
import { RefreshCw } from 'lucide-react';
import TemplatePicker from '@/components/care-support/TemplatePicker';
import { Button } from '@/components/ui/button';
import type { RoutineCareController, RoutineCareState } from '@/lib/routine-care';
import { firstName } from '@/lib/workspace';
import RoutineVersionHistory from './workspace/RoutineVersionHistory';
import { RoutineSlotEditor } from './workspace/RoutineSlotEditor';

const SLOTS = ['morning', 'evening'] as const;

export default function PatientRoutineCare({ patientId, patientName, controller, state, onFeedback }: {
  patientId: string; patientName: string; controller: RoutineCareController; state: RoutineCareState; onFeedback: (revisionId: string) => void;
}) {
  const saving = SLOTS.some(slot => state.slots[slot].status === 'saving');
  const drafting = SLOTS.some(slot => state.slots[slot].dirty || state.slots[slot].hasPendingSave);
  // One filled action on the tab: the first slot with a draft.
  const primarySlot = SLOTS.find(slot => state.slots[slot].dirty) ?? null;
  return <section aria-label="Patient routine care" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <p className="eyebrow">Routine</p>
        <h2 className="editorial-title text-[32px]">Assigned routines</h2>
        <p className="max-w-prose text-sm text-ink-secondary">Saving creates a new version. Earlier versions and the completions recorded against them keep their own record.</p>
      </div>
      <div className="space-y-1 text-right">
        <Button type="button" variant="outline" size="sm" disabled={saving || drafting || state.loadStatus === 'loading'} onClick={() => void controller.load()}><RefreshCw aria-hidden />Refresh assignments</Button>
        {drafting && state.loadStatus === 'ready' && <p className="text-xs text-ink-secondary">Save or discard open drafts to refresh.</p>}
      </div>
    </div>
    {state.loadStatus === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading routine assignments</p>}
    {state.loadStatus === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">{state.loadError}</p><Button type="button" variant="outline" size="sm" onClick={() => void controller.load()}>Retry assignments</Button></div>}
    {state.loadStatus === 'ready' && <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem]">
      {SLOTS.map(slot => <RoutineSlotEditor key={slot} slot={slot} editor={state.slots[slot]} controller={controller} primary={primarySlot === slot} patientFirstName={firstName(patientName)} onReloadConflict={() => void controller.reloadConflict(slot)} onFeedback={onFeedback} />)}
      <aside aria-label="Templates and version history" className="space-y-8">
        <TemplatePicker disabled={{ morning: state.slots.morning.hasPendingSave, evening: state.slots.evening.hasPendingSave }} onCopy={(slot, template) => controller.copyTemplate(slot, template)} />
        {SLOTS.map(slot => <RoutineVersionHistory key={`${slot}-${state.slots[slot].routine?.id ?? 'none'}`} patientId={patientId} slot={slot} />)}
      </aside>
    </div>}
  </section>;
}
```

- [ ] **Step 8: Wire the page** — in `web-portal/src/app/patients/[id]/page.tsx` replace the routine panel line with:

```tsx
          {panel('routine', <PatientRoutineCare patientId={id} patientName={patient.name} controller={routine.controller} state={routine.state} onFeedback={revisionId => openTab('messages', { referenceType: 'routineRevision', referenceId: revisionId })} />)}
```

- [ ] **Step 9: Record the omission** — append to `docs/design/letterpress/deferred.md`

```markdown
| Portal Workspace · Routine | One-line change summary per version ("Adapalene reduced to 3 nights") | Revisions store no change note |
```

- [ ] **Step 10: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/routine-editor.test.ts tests/routine-care.test.ts tests/template-copy.test.ts`
Expected: PASS.
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add web-portal/src/lib/routine-care.ts web-portal/src/components/patients/PatientRoutineCare.tsx web-portal/src/components/patients/workspace/RoutineSlotEditor.tsx web-portal/src/components/patients/workspace/RoutineVersionList.tsx web-portal/src/components/patients/workspace/RoutineVersionHistory.tsx web-portal/src/components/care-support/TemplateList.tsx web-portal/src/components/care-support/TemplatePicker.tsx "web-portal/src/app/patients/[id]/page.tsx" docs/design/letterpress/deferred.md web-portal/tests/routine-editor.test.ts
git commit -m "portal: show the routine draft against its saved version with history and templates beside" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Check-ins tab — question by question, answers plotted as given [judgment]

**Files:**
- Modify: `web-portal/src/lib/care-support.ts` (import `plural`; append `choiceQuestions`, `AnswerPoint`, `answerSeries`, `formSummary`)
- Create: `web-portal/src/components/care-support/CheckInViews.tsx`
- Modify (full rewrite): `web-portal/src/components/care-support/PatientCheckIns.tsx`
- Modify: `web-portal/src/components/care-support/FormEditor.tsx` (`onSaved`, borderless editor, `Save as v{n}`), `web-portal/src/app/patients/[id]/page.tsx` (check-ins panel), `docs/design/letterpress/deferred.md`
- Test: create `web-portal/tests/check-ins.test.ts`

**Interfaces:**
- Consumes: Task 3 `answerText`; Task 2 `firstName`, page `openTab`, `LoadState loading`; PR 4 `plural`, `day`, `stamp`; existing `getPatientForm`, `getPatientResponses`, `FormEditor`, `Pages`, `useRead`.
- Produces:
  - `choiceQuestions(form: Form): Question[]`; `interface AnswerPoint { responseId: string; submittedAt: string; formVersion: number; options: string[]; index: number | null; label: string }`; `answerSeries(responses: CheckInResponse[], questionId: string): AnswerPoint[]` (oldest first; only responses whose form has that question as a choice); `formSummary(form: Form): string` (`"4 questions · 2 required"`).
  - Views: `CheckInResponseView({ response, patientFirstName, onReply })`, `SubmissionTable({ responses, openId, onOpen })`, `AnswerPlot({ question, questions, series, onQuestion })`, `AssignedFormSummary({ status, form, editing, onEdit, onRetry })`.
  - `PatientCheckIns` props `{ patientId: string; patientName: string; onReply: () => void }`; `FormEditor` gains optional `onSaved?: () => void`.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/check-ins.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { answerSeries, answerText, choiceQuestions, formSummary, type CheckInResponse, type Form } from '../src/lib/care-support';
import { AnswerPlot, AssignedFormSummary, CheckInResponseView, SubmissionTable } from '../src/components/care-support/CheckInViews';
import { read } from './letterpress-rules';

const form = (version: number, options = ['Worse than last week', 'About the same', 'Better than last week']): Form => ({
  id: `form-${version}`, userId: 'p', version, createdBy: 'c', createdAt: '2026-08-01T00:00:00', title: 'Weekly check-in', isActive: true,
  questions: [
    { id: 'dryness', prompt: 'How is the dryness this week?', type: 'choice', required: true, options: options.map((label, i) => ({ id: `v${version}-o${i}`, label })) },
    { id: 'notes', prompt: 'Anything to add?', type: 'text', required: false, options: [] },
  ],
});
const response = (id: string, submittedAt: string, f: Form, optionIndex: number | null, text?: string): CheckInResponse => ({
  id, userId: 'p', formId: f.id, submittedAt, receivedAt: submittedAt, form: f,
  answers: [
    ...(optionIndex === null ? [] : [{ questionId: 'dryness', optionId: f.questions[0].options[optionIndex].id }]),
    ...(text ? [{ questionId: 'notes', text }] : []),
  ],
});
const rows = [
  response('r4', '2026-09-14T20:11:00', form(2), 2, 'Chin still flaky in the mornings.'),
  response('r3', '2026-09-07T20:00:00', form(2), 1),
  response('r2', '2026-08-31T20:00:00', form(1, ['Worse', 'Better']), 0),
  response('r1', '2026-08-24T20:00:00', form(1, ['Worse', 'Better']), null),
];
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;
const noop = () => {};

test('answers read as given; ordered-choice answers are plotted oldest first against their own version options', () => {
  assert.equal(answerText(rows[0].form.questions[0], rows[0]), 'Better than last week');
  assert.equal(answerText(rows[0].form.questions[1], rows[0]), 'Chin still flaky in the mornings.');
  assert.equal(answerText(rows[1].form.questions[1], rows[1]), 'Not answered');
  assert.deepEqual(answerSeries(rows, 'dryness').map(p => [p.responseId, p.index, p.label, p.options.length, p.formVersion]), [
    ['r1', null, 'Not answered', 2, 1], ['r2', 0, 'Worse', 2, 1], ['r3', 1, 'About the same', 3, 2], ['r4', 2, 'Better than last week', 3, 2],
  ]);
  assert.deepEqual(answerSeries(rows, 'notes'), []);
  assert.deepEqual(choiceQuestions(form(2)).map(q => q.id), ['dryness']);
  assert.equal(formSummary(form(2)), '2 questions · 1 required');
});

test('response view: question by question with required flags, form version in mono and one filled Reply action', () => {
  const html = renderToStaticMarkup(h(CheckInResponseView, { response: rows[1], patientFirstName: 'Ada', onReply: noop }));
  assert.match(html, /Form v2 · submitted 07 SEP · 20:00/);
  assert.match(html, /How is the dryness this week\?[\s\S]*\(required\)/);
  assert.match(html, /About the same/);
  assert.match(html, /Anything to add\?[\s\S]*Not answered/);
  assert.match(html, />Reply to Ada</);
  assert.equal(filled(html), 1);
  assert.match(renderToStaticMarkup(h(CheckInResponseView, { response: rows[0], patientFirstName: 'Ada', onReply: noop })), /“Chin still flaky in the mornings\.”/);
});

test('submissions on the page are a ruled table with the shown response selected', () => {
  const html = renderToStaticMarkup(h(SubmissionTable, { responses: rows, openId: 'r3', onOpen: noop }));
  assert.match(html, /data-state="selected"[\s\S]*07 SEP · 20:00/);
  assert.match(html, /Weekly check-in · v1/);
  assert.match(html, />Showing</);
  assert.equal((html.match(/>Open</g) ?? []).length, 3);
});

test('answer plot marks each answer as given with the same answers in words, and never a score', () => {
  const html = renderToStaticMarkup(h(AnswerPlot, { question: rows[0].form.questions[0], questions: [rows[0].form.questions[0]], series: answerSeries(rows, 'dryness'), onQuestion: noop }));
  assert.equal((html.match(/rounded-full bg-ink/g) ?? []).length, 3);
  for (const text of ['24 AUG', 'Not answered', 'Worse', 'About the same', 'Better than last week', 'Not a computed score']) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /average|mean|trend|improv|score of/i);
});

test('assigned form summary shows version and required count only; no schedule or response rate anywhere', () => {
  const html = renderToStaticMarkup(h(AssignedFormSummary, { status: 'ready', form: form(2), editing: false, onEdit: noop, onRetry: noop }));
  assert.match(html, /Weekly check-in/); assert.match(html, />V2</); assert.match(html, /2 questions · 1 required/); assert.match(html, />Edit form</);
  assert.equal(filled(html), 0);
  assert.match(renderToStaticMarkup(h(AssignedFormSummary, { status: 'ready', form: null, editing: false, onEdit: noop, onRetry: noop })), /No check-in form assigned\./);
  for (const file of ['src/components/care-support/PatientCheckIns.tsx', 'src/components/care-support/CheckInViews.tsx']) assert.doesNotMatch(read(file), /response rate|schedule|sent sundays/i, file);
  assert.match(read('src/components/care-support/FormEditor.tsx'), /label=\{`Save as v\$\{\(state\.savedVersion \?\? form\?\.version \?\? 0\) \+ 1\}`\}/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/check-ins.test.ts`
Expected: FAIL — `answerSeries` is not exported; `CheckInViews` module not found.

- [ ] **Step 3: Extend `web-portal/src/lib/care-support.ts`**

Change the first line to:

```ts
import type { RoutineStep } from "../types/api";
import { plural } from "./worklist";
```

Append:

```ts
export const choiceQuestions = (form: Form) => form.questions.filter((q) => q.type === "choice");

export interface AnswerPoint {
  responseId: string;
  submittedAt: string;
  formVersion: number;
  /** Option labels of this response's own form version, in the order the clinician wrote them. */
  options: string[];
  index: number | null;
  label: string;
}

/** Ordered-choice answers exactly as given, oldest first. Never averaged or scored. */
export function answerSeries(responses: CheckInResponse[], questionId: string): AnswerPoint[] {
  return responses
    .flatMap((response) => {
      const question = response.form.questions.find((q) => q.id === questionId && q.type === "choice");
      if (!question) return [];
      const answer = response.answers.find((a) => a.questionId === questionId);
      const index = question.options.findIndex((o) => o.id === answer?.optionId);
      return [{
        responseId: response.id,
        submittedAt: response.submittedAt,
        formVersion: response.form.version,
        options: question.options.map((o) => o.label),
        index: index < 0 ? null : index,
        label: index < 0 ? "Not answered" : question.options[index].label,
      }];
    })
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}

export function formSummary(form: Form) {
  return `${plural(form.questions.length, "question")} · ${form.questions.filter((q) => q.required).length} required`;
}
```

- [ ] **Step 4: Create `web-portal/src/components/care-support/CheckInViews.tsx`**

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { answerText, formSummary, type AnswerPoint, type CheckInResponse, type Form, type Question } from "@/lib/care-support";
import { cn } from "@/lib/utils";
import { day, stamp } from "@/lib/worklist";

export function CheckInResponseView({ response, patientFirstName, onReply }: { response: CheckInResponse; patientFirstName: string; onReply: () => void }) {
  return (
    <article aria-label="Check-in response" className="space-y-4">
      <header className="space-y-1 border-b-2 border-ink pb-2">
        <h3 className="text-[17px] font-medium">{response.form.title}</h3>
        <p className="meta-mono">Form v{response.form.version} · submitted {stamp(response.submittedAt)}</p>
      </header>
      <dl className="divide-y divide-rule">
        {response.form.questions.map((question, index) => {
          const text = answerText(question, response);
          const given = text !== "Not answered";
          return (
            <div key={question.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm text-ink-secondary">
                <span className="font-data text-xs tabular-nums text-ink-tertiary">{String(index + 1).padStart(2, "0")}</span> {question.prompt}
                {question.required && <span className="text-ink-tertiary"> (required)</span>}
              </dt>
              <dd className={cn("whitespace-pre-wrap break-words text-sm", given ? "font-medium" : "text-ink-secondary")}>
                {given && question.type === "text" ? `“${text}”` : text}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onReply}>Reply to {patientFirstName || "the patient"}</Button>
        <span className="meta-mono">Received {stamp(response.receivedAt)}</span>
      </div>
    </article>
  );
}

export function SubmissionTable({ responses, openId, onOpen }: { responses: CheckInResponse[]; openId: string | null; onOpen: (id: string) => void }) {
  return (
    <section aria-label="Submissions on this page" className="space-y-2">
      <p className="eyebrow">Submissions on this page</p>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Submitted</TableHead><TableHead>Form</TableHead><TableHead>First answer</TableHead><TableHead className="text-right">Response</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {responses.map((response) => {
            const shown = response.id === openId;
            const first: Question | undefined = response.form.questions[0];
            return (
              <TableRow key={response.id} data-state={shown ? "selected" : undefined}>
                <TableCell numeric>{stamp(response.submittedAt)}</TableCell>
                <TableCell>{response.form.title} · v{response.form.version}</TableCell>
                <TableCell className="max-w-[16rem] truncate text-ink-secondary">{first ? answerText(first, response) : "No questions"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="link" size="sm" aria-pressed={shown} disabled={shown} onClick={() => onOpen(response.id)}>{shown ? "Showing" : "Open"}</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

const shortDay = (iso: string) => {
  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

export function AnswerPlot({ question, questions, series, onQuestion }: { question: Question; questions: Question[]; series: AnswerPoint[]; onQuestion: (id: string) => void }) {
  return (
    <section aria-label="Answers over time" className="space-y-3 border-t border-rule pt-5">
      <p className="eyebrow">Answers over time</p>
      {questions.length > 1 ? (
        <select aria-label="Question to plot" value={question.id} onChange={(event) => onQuestion(event.target.value)} className="w-full rounded-none border-0 border-b-[1.5px] border-ink bg-transparent py-1 text-sm">
          {questions.map((q) => <option key={q.id} value={q.id}>{q.prompt}</option>)}
        </select>
      ) : (
        <p className="text-sm font-medium">{question.prompt}</p>
      )}
      {series.length === 0 ? (
        <p className="text-sm text-ink-secondary">No answers to this question on this page.</p>
      ) : (
        <>
          <div aria-hidden className="flex items-end gap-2 overflow-x-auto pb-1">
            {series.map((point) => (
              <div key={point.responseId} className="flex w-8 flex-none flex-col items-center gap-1">
                <div className="flex h-24 w-full flex-col-reverse border-b border-ink">
                  {point.options.map((option, index) => (
                    <div key={option + index} className="flex flex-1 items-center justify-center">
                      {point.index === index && <span className="block h-2.5 w-2.5 rounded-full bg-ink" />}
                    </div>
                  ))}
                </div>
                <span className="font-data text-[11px] tabular-nums text-ink-tertiary">{shortDay(point.submittedAt)}</span>
              </div>
            ))}
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Answers as given, oldest first</caption>
            <tbody>
              {series.map((point) => (
                <tr key={point.responseId} className="border-b border-rule last:border-0">
                  <td className="py-1 pr-2 font-data text-xs tabular-nums">{day(point.submittedAt)}</td>
                  <td className="py-1">{point.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-secondary">Each answer is plotted as given, oldest first, with the first option at the bottom. Not a computed score.</p>
        </>
      )}
    </section>
  );
}

export function AssignedFormSummary({ status, form, editing, onEdit, onRetry }: { status: "loading" | "ready" | "error"; form: Form | null; editing: boolean; onEdit: () => void; onRetry: () => void }) {
  return (
    <section aria-label="Assigned form" className="space-y-2 border-t border-rule pt-5">
      <p className="eyebrow">Assigned form</p>
      {status === "loading" && <p role="status" className="text-sm text-ink-secondary">Loading the assigned form</p>}
      {status === "error" && (
        <div role="alert" className="space-y-2">
          <p className="text-sm">The assigned form could not be loaded.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      )}
      {status === "ready" && (form ? (
        <>
          <p className="flex items-baseline gap-2 text-[15px] font-medium">{form.title}<span className="meta-mono">V{form.version}</span>{!form.isActive && <span className="text-xs font-normal text-ink-secondary">archived</span>}</p>
          <p className="text-sm text-ink-secondary">{formSummary(form)}</p>
        </>
      ) : (
        <p className="text-sm text-ink-secondary">No check-in form assigned.</p>
      ))}
      {status === "ready" && !editing && <Button type="button" variant="outline" size="sm" onClick={onEdit}>{form ? "Edit form" : "Write a form"}</Button>}
    </section>
  );
}
```

- [ ] **Step 5: Rewrite `web-portal/src/components/care-support/PatientCheckIns.tsx`**

```tsx
"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useClinicalAPI } from "@/lib/auth";
import { answerSeries, choiceQuestions } from "@/lib/care-support";
import { firstName } from "@/lib/workspace";
import { AnswerPlot, AssignedFormSummary, CheckInResponseView, SubmissionTable } from "./CheckInViews";
import FormEditor from "./FormEditor";
import { LoadState, Pages, useRead } from "./shared";

export default function PatientCheckIns({ patientId, patientName, onReply }: { patientId: string; patientName: string; onReply: () => void }) {
  const api = useClinicalAPI();
  const formFetch = useCallback(() => api.getPatientForm(patientId), [api, patientId]);
  const form = useRead(formFetch);
  const [page, setPage] = useState(1);
  const responsesFetch = useCallback(() => api.getPatientResponses(patientId, page), [api, patientId, page]);
  const responses = useRead(responsesFetch);
  const [openId, setOpenId] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const rows = responses.data?.data ?? [];
  const shown = rows.find((row) => row.id === openId) ?? rows[0] ?? null;
  const questions = shown ? choiceQuestions(shown.form) : [];
  const plotted = questions.find((question) => question.id === questionId) ?? questions[0] ?? null;
  const name = firstName(patientName);
  return (
    <section aria-label="Patient check-ins" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-6">
        {/* The editor stays mounted while hidden so a draft survives switching back to responses. */}
        <div hidden={!editing} className="space-y-3">
          <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setEditing(false)}>Back to responses</Button>
          <LoadState {...form} loading="Loading the assigned form" />
          {form.data && <FormEditor patientId={patientId} form={form.data.form} onSaved={form.retry} />}
        </div>
        <div hidden={editing} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Submitted responses</p>
            <Button type="button" variant="outline" size="sm" onClick={responses.retry}>Refresh</Button>
          </div>
          <LoadState {...responses} loading="Loading check-ins" />
          {responses.data && rows.length === 0 && (
            <div className="space-y-2 py-4">
              <h3 className="editorial-title text-2xl">No check-ins yet</h3>
              <p className="text-sm text-ink-secondary">Responses appear here after {name || "the patient"} submits the assigned form.</p>
            </div>
          )}
          {shown && <CheckInResponseView response={shown} patientFirstName={name} onReply={onReply} />}
          {rows.length > 1 && <SubmissionTable responses={rows} openId={shown?.id ?? null} onOpen={setOpenId} />}
          {responses.data && responses.data.pagination.totalPages > 1 && (
            <Pages page={page} totalPages={responses.data.pagination.totalPages} onPage={(next) => { setOpenId(null); setPage(next); }} />
          )}
        </div>
      </div>
      <aside aria-label="Check-in summary" className="space-y-8">
        {plotted && <AnswerPlot question={plotted} questions={questions} series={answerSeries(rows, plotted.id)} onQuestion={setQuestionId} />}
        <AssignedFormSummary status={form.status} form={form.data?.form ?? null} editing={editing} onEdit={() => setEditing(true)} onRetry={form.retry} />
      </aside>
    </section>
  );
}
```

- [ ] **Step 6: Edit `web-portal/src/components/care-support/FormEditor.tsx`**

1. Line 2 becomes `import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";`
2. Replace the signature block

```tsx
export default function FormEditor({
  patientId,
  form,
}: {
  patientId: string;
  form: Form | null;
}) {
```

with

```tsx
export default function FormEditor({
  patientId,
  form,
  onSaved,
}: {
  patientId: string;
  form: Form | null;
  onSaved?: () => void;
}) {
```

3. Directly after `useUnsaved(state.dirty || state.pending);` insert:

```tsx
  // The summary beside the editor reloads once a new version is saved.
  const saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  });
  useEffect(() => {
    if (state.savedVersion !== null) saved.current?.();
  }, [state.savedVersion]);
```

4. Replace `className="space-y-4 rounded-none border bg-surface p-5"` with `className="space-y-4 border-t-2 border-ink pt-4"`.
5. Replace

```tsx
      <SaveState
        editor={editor}
        rebase={async () => {
```

with

```tsx
      <SaveState
        editor={editor}
        label={`Save as v${(state.savedVersion ?? form?.version ?? 0) + 1}`}
        rebase={async () => {
```

- [ ] **Step 7: Wire the page** — in `web-portal/src/app/patients/[id]/page.tsx` replace the check-ins panel line with:

```tsx
          {panel('check-ins', <PatientCheckIns key={'check-ins-' + id} patientId={id} patientName={patient.name} onReply={() => openTab('messages')} />)}
```

- [ ] **Step 8: Record omissions** — append to `docs/design/letterpress/deferred.md`

```markdown
| Portal Workspace · Check-ins | Form schedule ("sent Sundays 18:00") and "Send now" | Forms have no schedule or send action |
| Portal Workspace · Check-ins | Response rate ("6 / 8") | Without a schedule there is no expected-response count to divide by |
```

- [ ] **Step 9: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/check-ins.test.ts tests/care-support.test.ts tests/workspace-photos.test.ts`
Expected: PASS.
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add web-portal/src/lib/care-support.ts web-portal/src/components/care-support/CheckInViews.tsx web-portal/src/components/care-support/PatientCheckIns.tsx web-portal/src/components/care-support/FormEditor.tsx "web-portal/src/app/patients/[id]/page.tsx" docs/design/letterpress/deferred.md web-portal/tests/check-ins.test.ts
git commit -m "portal: read check-ins question by question and plot choice answers as given" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Messages — thread list, serif clinician turns, attach photo reference [judgment]

Reviewer after this task: `care-access-reviewer` (the picker lists the patient's photos through the existing clinician-scoped summaries and thumbnails; references are validated by the server on send; no content logged).

**Files:**
- Modify: `web-portal/src/lib/assigned-messaging.ts` (append `turnEyebrow`, `threadTime`, `inboxUnread`, `referenceLabel`, `linkedLabel`)
- Create: `web-portal/src/components/messages/MessageTurn.tsx`, `ThreadList.tsx`, `PhotoReferenceList.tsx`, `PhotoReferencePicker.tsx`
- Modify (full rewrite): `web-portal/src/components/messages/ConversationView.tsx`, `web-portal/src/app/messages/page.tsx`
- Modify: `docs/design/letterpress/deferred.md`
- Test: create `web-portal/tests/messages-view.test.ts`

**Interfaces:**
- Consumes: Task 2 `messageReference`, `firstName`, `.photo-mat`, `.eyebrow`, `.meta-mono`; PR 4 `clock`, `day`, `stamp`; existing `ConversationController` (unchanged), `PrivateThumbnailController`, `getPatientPhotoSummaries`, `getPhotoThumbnail`, `getPhotoOriginal`, `getMessageReference`.
- Produces:
  - `turnEyebrow(message: MessageRecord, patientFirstName: string): string` (`14 SEP · 16:12 · You`); `threadTime(iso: string, now: Date): string` (`08:03` today, else `12 SEP`); `inboxUnread(conversations: Conversation[]): number`; `referenceLabel(reference: ReferenceView): string`; `linkedLabel(reference: MessageReference, linkedCaptureDate: string | null): string`.
  - `MessageTurn({ message, patientFirstName, onReference })`, `ThreadList({ conversations, selectedId, now })`, `PhotoReferenceList({ photos, previews, onChoose })`, `PhotoReferencePicker` (default) `{ patientId, onChoose(photo), onClose }`.
  - `ConversationView` props gain optional `recordHref?: string`.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/messages-view.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inboxUnread, linkedLabel, referenceLabel, threadTime, turnEyebrow, type Conversation, type MessageRecord } from '../src/lib/assigned-messaging';
import { MessageTurn } from '../src/components/messages/MessageTurn';
import { ThreadList } from '../src/components/messages/ThreadList';
import { PhotoReferenceList } from '../src/components/messages/PhotoReferenceList';
import { read } from './letterpress-rules';

const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  id: 'm', patientId: 'p1', clinicianId: 'c', senderId: 'c', senderType: 'dermatologist', recipientId: 'p1', recipientType: 'patient',
  content: 'Keep the adapalene to three nights a week.', sentAt: '2026-09-14T16:12:00', unreadForMe: false, reference: null, origin: 'native', ...over,
});
const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  patientId: 'p1', clinicianId: 'c', patientName: 'Synthetic Ada', clinicianName: 'Synthetic Clinician',
  lastMessage: message({ sentAt: '2026-09-14T08:03:00', content: 'Bring the tube to your appointment.' }), unreadCount: 0, ...over,
});
const noop = () => {};

test('turn eyebrows are mono stamps with You or the patient first name; thread times are a clock today and a day otherwise', () => {
  assert.equal(turnEyebrow(message(), 'Ada'), '14 SEP · 16:12 · You');
  assert.equal(turnEyebrow(message({ senderType: 'patient' }), 'Ada'), '14 SEP · 16:12 · Ada');
  assert.equal(turnEyebrow(message({ senderType: 'patient' }), ''), '14 SEP · 16:12 · Patient');
  const now = new Date(2026, 8, 14, 18, 0);
  assert.equal(threadTime('2026-09-14T08:03:00', now), '08:03');
  assert.equal(threadTime('2026-09-12T08:03:00', now), '12 SEP');
  assert.equal(inboxUnread([conversation({ unreadCount: 3 }), conversation({ unreadCount: 2 })]), 5);
  assert.equal(referenceLabel({ type: 'photo', id: 'x', available: true, label: 'Photo · 12 Sep', occurredAt: null }), 'Photo · 12 Sep');
  assert.equal(referenceLabel({ type: 'photo', id: 'x', available: false, label: null, occurredAt: null }), 'Photo unavailable');
  assert.equal(referenceLabel({ type: 'routineRevision', id: 'x', available: true, label: null, occurredAt: null }), 'Routine revision');
  assert.equal(linkedLabel({ type: 'photo', id: 'x' }, '2026-09-12T07:00:00'), 'Links photo 12 SEP');
  assert.equal(linkedLabel({ type: 'photo', id: 'x' }, null), 'Links the selected photo');
  assert.equal(linkedLabel({ type: 'routineRevision', id: 'x' }, null), 'Links the selected routine version');
});

test('clinician turns are serif behind a 2px ink rule; patient replies sit in sunk blocks; unread says so', () => {
  const clinician = renderToStaticMarkup(h(MessageTurn, { message: message({ reference: { type: 'photo', id: 'x', available: true, label: 'Photo · 12 Sep', occurredAt: null } }), patientFirstName: 'Ada', onReference: noop }));
  assert.match(clinician, /border-l-2 border-ink/); assert.match(clinician, /font-display/); assert.doesNotMatch(clinician, /bg-sunk/);
  assert.match(clinician, /14 SEP · 16:12 · You/);
  assert.match(clinician, /Photo · 12 Sep/); assert.match(clinician, /Attached reference/);
  const unread = renderToStaticMarkup(h(MessageTurn, { message: message({ senderType: 'patient', unreadForMe: true }), patientFirstName: 'Ada', onReference: noop }));
  assert.match(unread, /bg-sunk/); assert.doesNotMatch(unread, /font-display/);
  assert.match(unread, /14 SEP · 16:12 · Ada · Unread/);
  assert.match(unread, /text-attention-text/); assert.match(unread, /rgb\(var\(--attention-mark\)\)/);
  assert.doesNotMatch(renderToStaticMarkup(h(MessageTurn, { message: message({ senderType: 'patient' }), patientFirstName: 'Ada', onReference: noop })), /attention/);
});

test('thread list: the open thread carries the ink rule; unread threads say how many in words', () => {
  const html = renderToStaticMarkup(h(ThreadList, {
    conversations: [conversation(), conversation({ patientId: 'p2', patientName: 'Synthetic Ben', unreadCount: 2, lastMessage: null })],
    selectedId: 'p1', now: new Date(2026, 8, 14, 18, 0),
  }));
  assert.match(html, /aria-current="true" class="[^"]*selected-rule/);
  assert.match(html, />08:03</); assert.match(html, /Bring the tube to your appointment\./);
  assert.match(html, />2 unread</); assert.match(html, /No messages yet/);
});

test('photo reference picker lists shared photos by date on the photo mat', () => {
  const photo = { id: 'x', userId: 'p', skinScore: 0, captureDate: '2026-09-12T07:00:00', createdAt: '2026-09-12T07:00:00', updatedAt: '2026-09-12T07:00:00' };
  const html = renderToStaticMarkup(h(PhotoReferenceList, { photos: [photo], previews: {}, onChoose: noop }));
  assert.match(html, /aria-label="Attach photo from 12 SEP · 07:00"/); assert.match(html, /photo-mat/); assert.match(html, />12 SEP</);
  assert.match(renderToStaticMarkup(h(PhotoReferenceList, { photos: [], previews: {}, onChoose: noop })), /No shared photos to attach\./);
});

test('messages page: thread list plus thread; the composer has one filled Send, Attach photo reference and a mono counter', () => {
  const page = read('src/app/messages/page.tsx');
  assert.match(page, /<ThreadList /); assert.match(page, /messageReference\(referenceType, referenceId\)/);
  assert.match(page, /recordHref=\{"\/patients\/" \+ encodeURIComponent\(patientId\)\}/);
  const view = read('src/components/messages/ConversationView.tsx');
  assert.match(view, />Attach photo reference</);
  assert.match(view, /\{state\.text\.length\} \/ 4000/);
  assert.match(view, /controller\.link\(\{ type: "photo", id: photo\.id \}\)/);
  assert.doesNotMatch(view, /ml-auto bg-surface|mr-auto bg-sunk/);
  assert.equal((view.match(/<Button\s+type="submit"/g) ?? []).length, 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/messages-view.test.ts`
Expected: FAIL — `turnEyebrow` is not exported; `MessageTurn` module not found.

- [ ] **Step 3: Append helpers to `web-portal/src/lib/assigned-messaging.ts`**

Below the first import add `import { clock, day, stamp } from "./worklist";`, then append:

```ts
/** `14 SEP · 16:12 · You` or `· Ada`; set in mono uppercase by `.meta-mono`. */
export function turnEyebrow(message: MessageRecord, patientFirstName: string) {
  return `${stamp(message.sentAt)} · ${message.senderType === "dermatologist" ? "You" : patientFirstName || "Patient"}`;
}

export function threadTime(iso: string, now: Date) {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString() ? clock(date) : day(iso);
}

export const inboxUnread = (conversations: Conversation[]) =>
  conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

export function referenceLabel(reference: ReferenceView) {
  if (!reference.available) return reference.type === "photo" ? "Photo unavailable" : "Routine revision unavailable";
  return reference.label || (reference.type === "photo" ? "Photo" : "Routine revision");
}

export function linkedLabel(reference: MessageReference, linkedCaptureDate: string | null) {
  if (reference.type === "routineRevision") return "Links the selected routine version";
  return linkedCaptureDate ? `Links photo ${day(linkedCaptureDate)}` : "Links the selected photo";
}
```

- [ ] **Step 4: Create `web-portal/src/components/messages/MessageTurn.tsx`**

```tsx
"use client";
import { ClipboardList, Image as ImageIcon } from "lucide-react";
import { referenceLabel, turnEyebrow, type MessageRecord } from "@/lib/assigned-messaging";
import { cn } from "@/lib/utils";

// Spec §4.7: clinician words in the display serif behind a 2px ink rule; patient replies in a sunk block. No bubbles.
// Unread (received and not yet seen) is the one ochre signal: a 4px mark and the word "Unread".
export function MessageTurn({ message, patientFirstName, onReference }: { message: MessageRecord; patientFirstName: string; onReference: (message: MessageRecord) => void }) {
  const clinician = message.senderType === "dermatologist";
  const unread = message.unreadForMe;
  return (
    <article className={cn("max-w-2xl space-y-2", clinician ? "border-l-2 border-ink pl-4" : "bg-sunk px-4 py-3", unread && "shadow-[inset_4px_0_0_rgb(var(--attention-mark))]")}>
      <p className={cn("meta-mono", unread && "text-attention-text")}>
        {turnEyebrow(message, patientFirstName)}
        {unread ? " · Unread" : ""}
      </p>
      <p className={clinician ? "whitespace-pre-wrap break-words font-display text-lg font-light leading-relaxed" : "whitespace-pre-wrap break-words text-sm"}>
        {message.content}
      </p>
      {message.reference && (
        <button type="button" onClick={() => onReference(message)} className="flex w-full max-w-sm items-center gap-3 border border-rule-field bg-surface p-2 text-left hover:bg-rail">
          <span aria-hidden className="photo-mat flex h-10 w-8 flex-none items-center justify-center">
            {message.reference.type === "photo" ? <ImageIcon className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{referenceLabel(message.reference)}</span>
            <span className="eyebrow block">Attached reference</span>
          </span>
        </button>
      )}
    </article>
  );
}
```

- [ ] **Step 5: Create `web-portal/src/components/messages/ThreadList.tsx`**

```tsx
import { threadTime, type Conversation } from "@/lib/assigned-messaging";
import { cn } from "@/lib/utils";

export function ThreadList({ conversations, selectedId, now }: { conversations: Conversation[]; selectedId: string | null; now: Date }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {conversations.map((conversation) => {
        const selected = conversation.patientId === selectedId;
        const unread = conversation.unreadCount > 0;
        return (
          <li key={conversation.patientId}>
            <a
              href={"/messages?patient=" + encodeURIComponent(conversation.patientId)}
              aria-current={selected ? "true" : undefined}
              className={cn("block space-y-1 px-3 py-3 hover:bg-sunk", selected && "selected-rule", !selected && unread && "shadow-[inset_4px_0_0_rgb(var(--attention-mark))]")}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-sm", unread ? "font-medium" : "font-[450]")}>{conversation.patientName || "Unnamed patient"}</span>
                {conversation.lastMessage && <span className="meta-mono flex-none">{threadTime(conversation.lastMessage.sentAt, now)}</span>}
              </span>
              <span className="line-clamp-2 block break-words text-xs text-ink-secondary">{conversation.lastMessage?.content || "No messages yet"}</span>
              {unread && <span className="eyebrow block text-attention-text">{conversation.unreadCount} unread</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 6: Create the photo reference picker**

`web-portal/src/components/messages/PhotoReferenceList.tsx`:

```tsx
/* eslint-disable @next/next/no-img-element -- Thumbnails are private object URLs revoked when the dialog closes. */
"use client";
import type { ThumbnailState } from "@/lib/private-thumbnail";
import { day, stamp } from "@/lib/worklist";
import type { PhotoSummary } from "@/types/api";

export function PhotoReferenceList({ photos, previews, onChoose }: { photos: PhotoSummary[]; previews: Record<string, ThumbnailState>; onChoose: (photo: PhotoSummary) => void }) {
  if (!photos.length) return <p className="text-sm text-ink-secondary">No shared photos to attach.</p>;
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {photos.map((photo) => {
        const preview = previews[photo.id];
        return (
          <li key={photo.id}>
            <button type="button" aria-label={`Attach photo from ${stamp(photo.captureDate)}`} onClick={() => onChoose(photo)} className="block w-full text-left">
              <span className="photo-mat flex aspect-[4/5] items-center justify-center overflow-hidden">
                {preview?.status === "ready" && preview.url
                  ? <img src={preview.url} alt="" className="h-full w-full object-contain" />
                  : <span className="p-2 text-center text-[11px]">{preview?.status === "error" ? "Preview unavailable" : "Loading"}</span>}
              </span>
              <span className="mt-1 block font-data text-[11px] font-medium tabular-nums">{day(photo.captureDate)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

`web-portal/src/components/messages/PhotoReferencePicker.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LoadState, Pages, useRead } from "@/components/care-support/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { sessionBoundary } from "@/lib/api";
import { useClinicalAPI } from "@/lib/auth";
import { PrivateThumbnailController } from "@/lib/private-thumbnail";
import type { PhotoSummary } from "@/types/api";
import { PhotoReferenceList } from "./PhotoReferenceList";

export default function PhotoReferencePicker({ patientId, onChoose, onClose }: { patientId: string; onChoose: (photo: PhotoSummary) => void; onClose: () => void }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getPatientPhotoSummaries(patientId, page, 12), [api, patientId, page]);
  const result = useRead(fetch);
  const thumbnails = useMemo(() => new PrivateThumbnailController((id, signal) => api.getPhotoThumbnail(id, signal)), [api]);
  const previews = useSyncExternalStore(thumbnails.subscribe, thumbnails.snapshot, thumbnails.snapshot);
  const photos = result.data?.data;
  useEffect(() => {
    if (!photos) return;
    thumbnails.load(photos.map((photo) => photo.id));
    const unsubscribe = sessionBoundary.subscribe(() => thumbnails.dispose());
    return () => { unsubscribe(); thumbnails.dispose(); };
  }, [thumbnails, photos]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Attach photo reference</DialogTitle>
        <DialogDescription>The message links this photo. It is checked against your current patient assignment when opened.</DialogDescription>
        <LoadState {...result} loading="Loading photos" />
        {photos && <PhotoReferenceList photos={photos} previews={previews} onChoose={onChoose} />}
        {result.data && result.data.pagination.totalPages > 1 && <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Rewrite `web-portal/src/components/messages/ConversationView.tsx`**

```tsx
/* eslint-disable @next/next/no-img-element -- Authorized ephemeral photo URLs bypass optimizer caches. */
"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useClinicalAPI } from "@/lib/auth";
import {
  ConversationController,
  linkedLabel,
  type Conversation,
  type MessageRecord,
  type MessageReference,
  type ReferenceResult,
} from "@/lib/assigned-messaging";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUnsaved } from "@/components/care-support/shared";
import { firstName } from "@/lib/workspace";
import { stamp } from "@/lib/worklist";
import type { PhotoSummary } from "@/types/api";
import { MessageTurn } from "./MessageTurn";
import PhotoReferencePicker from "./PhotoReferencePicker";

function VisibleTurn({
  message,
  patientFirstName,
  onVisible,
  onReference,
  refresh,
}: {
  message: MessageRecord;
  patientFirstName: string;
  onVisible: (id: string) => void;
  onReference: (message: MessageRecord) => void;
  refresh: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message.unreadForMe || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && document.visibilityState === "visible") {
          onVisible(message.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [message.id, message.unreadForMe, onVisible, refresh]);
  return (
    <div ref={element}>
      <MessageTurn message={message} patientFirstName={patientFirstName} onReference={onReference} />
    </div>
  );
}

function ReferenceDetail({
  message,
  patientId,
  clinicianId,
  onClose,
}: {
  message: MessageRecord;
  patientId: string;
  clinicianId: string;
  onClose: () => void;
}) {
  const api = useClinicalAPI();
  const [result, setResult] = useState<ReferenceResult | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .getMessageReference(patientId, clinicianId, message.id)
      .then(async (value) => {
        if (!active) return;
        setResult(value);
        if (value.reference.available && value.reference.type === "photo") {
          const original = await api.getPhotoOriginal(value.reference.id);
          if (active) setImage(original.photoUrl);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, patientId, clinicianId, message.id]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Linked record</DialogTitle>
        <DialogDescription>The original record is checked against your current patient assignment.</DialogDescription>
        {failed ? (
          <p role="alert" className="text-sm text-error">This record could not be opened.</p>
        ) : !result ? (
          <p role="status" className="text-sm text-ink-secondary">Opening record</p>
        ) : !result.reference.available ? (
          <p className="text-sm">This record is unavailable.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-[15px] font-medium">{result.reference.label}</h3>
              {result.reference.occurredAt && <p className="meta-mono">{stamp(result.reference.occurredAt)}</p>}
            </div>
            {image && (
              <div className="photo-mat">
                {/* Authorized ephemeral URL must not enter the image optimizer cache. */}
                <img src={image} alt="Linked patient photo" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[55vh] w-full object-contain" />
              </div>
            )}
            {result.routine && (
              <>
                <p className="meta-mono">{result.routine.timeOfDay === "morning" ? "Morning" : "Evening"} routine · v{result.routine.version}</p>
                <ol className="divide-y divide-rule border-y border-rule">
                  {result.routine.steps.map((step, i) => (
                    <li key={i} className="py-2">
                      <p className="text-sm font-medium">{i + 1} · {step.title}</p>
                      {step.instructions && <p className="whitespace-pre-wrap text-sm text-ink-secondary">{step.instructions}</p>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ConversationView({
  patientId,
  clinicianId,
  initialReference,
  onConversationChange,
  recordHref,
}: {
  patientId: string;
  clinicianId: string;
  initialReference: MessageReference | null;
  onConversationChange: (conversation: Conversation) => void;
  recordHref?: string;
}) {
  const api = useClinicalAPI();
  const source = useMemo(() => ({ api, controller: new ConversationController(patientId, clinicianId) }), [api, patientId, clinicianId]);
  const controller = source.controller;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [selected, setSelected] = useState<MessageRecord | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [picking, setPicking] = useState(false);
  const [linked, setLinked] = useState<PhotoSummary | null>(null);
  const composer = useId();
  useUnsaved(Boolean(state.text) || controller.frozen);
  useEffect(() => {
    if (state.conversation) onConversationChange(state.conversation);
  }, [state.conversation, onConversationChange]);
  const load = useCallback(
    (older = false) => {
      const cursor = older ? controller.snapshot().nextCursor : undefined;
      void controller.load(() => api.getAssignedMessages(patientId, clinicianId, cursor || undefined), older);
      if (!older) setRefresh((n) => n + 1);
    },
    [api, controller, patientId, clinicianId],
  );
  useEffect(() => {
    controller.link(initialReference);
    void controller.load(() => api.getAssignedMessages(patientId, clinicianId));
    return () => controller.cancel();
  }, [api, controller, patientId, clinicianId, initialReference]);
  const visible = useCallback(
    (id: string) => {
      void controller.markVisible([id], (ids) => api.acknowledgeMessages(patientId, clinicianId, ids));
    },
    [api, controller, patientId, clinicianId],
  );
  const first = firstName(state.conversation?.patientName);
  return (
    <section className="min-w-0 space-y-5" aria-label="Patient conversation">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div className="space-y-1">
          <h2 className="text-[17px] font-medium">{state.conversation?.patientName || "Patient conversation"}</h2>
          <p className="meta-mono">{state.conversation ? `${state.conversation.unreadCount} unread · ` : ""}Refresh to check for new messages</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {recordHref && (
            <Button variant="outline" size="sm" asChild>
              <a href={recordHref}>Open record</a>
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={state.status === "loading"} onClick={() => load()}>
            Refresh messages
          </Button>
        </div>
      </header>
      {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
      {state.readError && <p role="status" className="text-sm text-ink-secondary">{state.readError}</p>}
      {state.status === "loading" && <p role="status" className="text-sm text-ink-secondary">Loading messages</p>}
      {state.nextCursor && (
        <Button variant="outline" size="sm" disabled={state.status === "loading"} onClick={() => load(true)}>
          Load older messages
        </Button>
      )}
      <div className="space-y-5" aria-label="Message history">
        {state.status === "ready" && !state.messages.length && (
          <div className="space-y-1 py-4">
            <h3 className="editorial-title text-2xl">No messages yet</h3>
            <p className="text-sm text-ink-secondary">Start the conversation below.</p>
          </div>
        )}
        {state.messages.map((message) => (
          <VisibleTurn key={message.id} message={message} patientFirstName={first} onVisible={visible} onReference={setSelected} refresh={refresh} />
        ))}
      </div>
      <form
        className="space-y-3 border-t-2 border-ink pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.send((id, body) => api.sendAssignedMessage(patientId, clinicianId, id, body));
        }}
      >
        {state.reference && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="meta-mono">{linkedLabel(state.reference, linked?.id === state.reference.id ? linked.captureDate : null)}</p>
            <Button type="button" variant="link" size="sm" className="px-0" disabled={controller.frozen} onClick={() => { controller.link(null); setLinked(null); }}>
              Remove link
            </Button>
          </div>
        )}
        <Label htmlFor={composer} className="block">Message</Label>
        <Textarea
          id={composer}
          className="min-h-28"
          maxLength={4000}
          value={state.text}
          disabled={controller.frozen}
          placeholder={`Write to ${first || "the patient"}…`}
          onChange={(event) => controller.edit(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={state.sendStatus === "sending" || (!state.text.trim() && !controller.frozen) || state.status === "error"}
          >
            {state.sendStatus === "sending" ? "Sending…" : state.sendStatus === "failed" ? "Retry same message" : "Send"}
          </Button>
          <Button type="button" variant="outline" disabled={controller.frozen} onClick={() => setPicking(true)}>Attach photo reference</Button>
          <span className="meta-mono ml-auto">{state.text.length} / 4000</span>
        </div>
        <p className="text-xs text-ink-secondary">Text only. A sent message has been accepted by ClearAF.</p>
        {state.sendStatus === "sent" && <p role="status" className="text-sm">Sent</p>}
        {state.sendStatus === "failed" && (
          <div className="space-y-2">
            <p className="text-sm text-ink-secondary">A previous attempt may already have been sent. Refresh before composing another message.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => controller.newDraft()}>Edit as a new message</Button>
          </div>
        )}
      </form>
      {selected && <ReferenceDetail message={selected} patientId={patientId} clinicianId={clinicianId} onClose={() => setSelected(null)} />}
      {picking && (
        <PhotoReferencePicker
          patientId={patientId}
          onClose={() => setPicking(false)}
          onChoose={(photo) => {
            controller.link({ type: "photo", id: photo.id });
            setLinked(photo);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 8: Rewrite `web-portal/src/app/messages/page.tsx`**

```tsx
"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { LoadState, useRead } from "@/components/care-support/shared";
import ConversationView from "@/components/messages/ConversationView";
import { ThreadList } from "@/components/messages/ThreadList";
import { Button } from "@/components/ui/button";
import { useAuth, useClinicalAPI } from "@/lib/auth";
import { inboxUnread, messageReference, type Conversation } from "@/lib/assigned-messaging";

function Messages() {
  const api = useClinicalAPI();
  const { user } = useAuth();
  const params = useSearchParams();
  const [cursor, setCursor] = useState<string | undefined>();
  const fetch = useCallback(() => api.getMessageInbox(cursor), [api, cursor]);
  const result = useRead(fetch);
  const patientId = params.get("patient");
  const [observed, setObserved] = useState<Conversation | null>(null);
  useEffect(() => setObserved(null), [api]);
  const receive = useCallback((conversation: Conversation) => setObserved(conversation), []);
  const referenceType = params.get("referenceType"),
    referenceId = params.get("referenceId");
  const reference = useMemo(() => messageReference(referenceType, referenceId), [referenceType, referenceId]);
  // The open thread's live counts replace its inbox row until the inbox is refreshed.
  const conversations = (result.data?.conversations ?? []).map((row) =>
    observed?.patientId === row.patientId && observed.clinicianId === user?.id ? observed : row,
  );
  return (
    <DashboardLayout title="Messages">
      <div className="portal-page">
        <header className="space-y-1">
          <p className="eyebrow">{result.data ? `${inboxUnread(conversations)} unread on this page` : "Assigned patients"}</p>
          <h1 className="editorial-title text-[32px]">Messages</h1>
          <p className="text-sm text-ink-secondary">Private conversations with your assigned patients.</p>
        </header>
        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-3" aria-label="Assigned conversations">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Threads</p>
              <Button variant="ghost" size="sm" onClick={() => { setObserved(null); result.retry(); }}>Refresh inbox</Button>
            </div>
            <LoadState {...result} loading="Loading conversations" />
            {result.data && (conversations.length
              ? <ThreadList conversations={conversations} selectedId={patientId} now={new Date()} />
              : <p className="text-sm text-ink-secondary">No assigned patients on this page.</p>)}
            <div className="flex flex-wrap gap-2">
              {cursor && <Button variant="outline" size="sm" onClick={() => setCursor(undefined)}>First page</Button>}
              {result.data?.nextCursor && <Button variant="outline" size="sm" onClick={() => setCursor(result.data!.nextCursor!)}>Next patients</Button>}
            </div>
          </aside>
          {patientId && user ? (
            <ConversationView
              key={patientId + "-" + user.id}
              patientId={patientId}
              clinicianId={user.id}
              initialReference={reference}
              onConversationChange={receive}
              recordHref={"/patients/" + encodeURIComponent(patientId)}
            />
          ) : (
            <div className="space-y-2 py-6">
              <h2 className="editorial-title text-2xl">Choose a conversation</h2>
              <p className="text-sm text-ink-secondary">Select an assigned patient to open their messages.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Opening messages</p>}>
      <Messages />
    </Suspense>
  );
}
```

- [ ] **Step 9: Record the omission** — append to `docs/design/letterpress/deferred.md`

```markdown
| Portal Messages | Search patients | The inbox API has no search |
```

- [ ] **Step 10: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/messages-view.test.ts tests/assigned-messaging.test.ts tests/assigned-messaging-api.test.ts tests/workspace.test.ts`
Expected: PASS.
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add web-portal/src/lib/assigned-messaging.ts web-portal/src/components/messages web-portal/src/app/messages/page.tsx docs/design/letterpress/deferred.md web-portal/tests/messages-view.test.ts
git commit -m "portal: rebuild messages as thread list and ruled thread with photo references" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: Templates — ruled table, inline editor, Save as v{n} and Archive [mechanical]

**Files:**
- Modify: `web-portal/src/lib/care-support.ts` (append `templateSummary`, `templateVersionNote`)
- Create: `web-portal/src/components/care-support/TemplateTable.tsx`
- Modify (full rewrite): `web-portal/src/components/care-support/TemplateEditor.tsx`, `web-portal/src/app/templates/page.tsx`
- Modify: `docs/design/letterpress/deferred.md`
- Test: create `web-portal/tests/templates-view.test.ts`

**Interfaces:**
- Consumes: existing `RevisionEditor`, `SaveState` (`label` prop), `LoadState` (`loading`), `Pages`, `useRead`, `apiService.getTemplates`/`saveTemplate`; PR 4 `day`; PR 2 `Table*` (`TableRow data-state`, `TableCell numeric`).
- Produces: `templateSummary(template: Pick<Template, 'steps'>): string`; `templateVersionNote(version: number | null, isActive: boolean): string`; `TemplateTable({ templates, page, selectedId })`.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/templates-view.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { templateSummary, templateVersionNote, type Template } from '../src/lib/care-support';
import { TemplateTable } from '../src/components/care-support/TemplateTable';
import { read } from './letterpress-rules';

const template = (over: Partial<Template> = {}): Template => ({
  id: 't1', revisionId: 'r1', version: 3, name: 'Acne · maintenance AM', isActive: true, updatedAt: '2026-09-02T10:00:00',
  steps: [{ title: 'Cleanser', instructions: '' }, { title: 'Adapalene', instructions: '' }, { title: 'SPF 30', instructions: '' }], ...over,
});

test('template helpers: step titles as the summary; the version note says what saving creates', () => {
  assert.equal(templateSummary(template()), 'Cleanser · Adapalene · SPF 30');
  assert.equal(templateSummary(template({ steps: [] })), 'No steps');
  assert.equal(templateSummary(template({ steps: Array.from({ length: 12 }, (_, i) => ({ title: `Step number ${i}`, instructions: '' })) })).length, 60);
  assert.equal(templateVersionNote(3, true), 'V3 · editing creates v4');
  assert.equal(templateVersionNote(1, false), 'V1 · archived · editing creates v2');
  assert.equal(templateVersionNote(null, true), 'New · saving creates v1');
});

test('templates table: name, version and updated columns only; the open template row is selected; archived in words', () => {
  const html = renderToStaticMarkup(h(TemplateTable, { templates: [template(), template({ id: 't2', name: 'Rosacea · gentle AM', version: 1, isActive: false, updatedAt: '2026-08-11T09:00:00' })], page: 2, selectedId: 't1' }));
  assert.deepEqual([...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1]), ['Name', 'Version', 'Updated']);
  assert.doesNotMatch(html, /In use/);
  assert.match(html, /<tr[^>]*data-state="selected"[^>]*>[\s\S]*Acne · maintenance AM/);
  assert.match(html, /href="\/templates\?page=2&amp;id=t1" aria-current="true"/);
  assert.match(html, /Cleanser · Adapalene · SPF 30/);
  assert.match(html, /Archived 11 AUG/);
  assert.match(html, />V3</); assert.match(html, />02 SEP</);
});

test('template editor saves as the next version and archives by saving; no active checkbox; one filled action on the page', () => {
  const editor = read('src/components/care-support/TemplateEditor.tsx');
  assert.match(editor, /label=\{`Save as v\$\{\(version \?\? 0\) \+ 1\}`\}/);
  assert.match(editor, />Archive</); assert.match(editor, />Restore</); assert.match(editor, /saveAs\(false\)/); assert.match(editor, /saveAs\(true\)/);
  assert.doesNotMatch(editor, /type="checkbox"/);
  const page = read('src/app/templates/page.tsx');
  assert.match(page, /variant=\{editorOpen \? "outline" : "default"\}/);
  assert.match(page, /<TemplateTable /);
  assert.doesNotMatch(page, /In use/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/templates-view.test.ts`
Expected: FAIL — `templateSummary` is not exported; `TemplateTable` module not found.

- [ ] **Step 3: Append helpers to `web-portal/src/lib/care-support.ts`**

```ts
export function templateSummary(template: Pick<Template, "steps">) {
  if (!template.steps.length) return "No steps";
  const text = template.steps.map((step) => step.title).join(" · ");
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

export function templateVersionNote(version: number | null, isActive: boolean) {
  if (version === null) return "New · saving creates v1";
  return `V${version}${isActive ? "" : " · archived"} · editing creates v${version + 1}`;
}
```

- [ ] **Step 4: Create `web-portal/src/components/care-support/TemplateTable.tsx`**

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { templateSummary, type Template } from "@/lib/care-support";
import { day } from "@/lib/worklist";

export function TemplateTable({ templates, page, selectedId }: { templates: Template[]; page: number; selectedId: string | null }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Name</TableHead><TableHead>Version</TableHead><TableHead>Updated</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => {
          const selected = template.id === selectedId;
          return (
            <TableRow key={template.id} data-state={selected ? "selected" : undefined}>
              <TableCell>
                <a className="font-medium underline underline-offset-[3px]" href={`/templates?page=${page}&id=${encodeURIComponent(template.id)}`} aria-current={selected ? "true" : undefined}>
                  {template.name}
                </a>
                <span className="block text-xs text-ink-secondary">{template.isActive ? templateSummary(template) : `Archived ${day(template.updatedAt)}`}</span>
              </TableCell>
              <TableCell numeric>V{template.version}</TableCell>
              <TableCell numeric>{day(template.updatedAt)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 5: Rewrite `web-portal/src/components/care-support/TemplateEditor.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useClinicalAPI } from "@/lib/auth";
import { RevisionEditor, templateVersionNote, type Template, type TemplateDraft } from "@/lib/care-support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SaveState, useUnsaved } from "./shared";

const problem = (draft: TemplateDraft) =>
  !draft.name.trim() || (draft.isActive && !draft.steps.length) || draft.steps.some((step) => !step.title.trim())
    ? "Enter a name and a title for every step. Active templates need at least one step."
    : "";

export default function TemplateEditor({ template }: { template: Template | null }) {
  const api = useClinicalAPI();
  const [id] = useState(() => template?.id ?? crypto.randomUUID());
  const [reloadError, setReloadError] = useState("");
  const editor = useMemo(
    () =>
      new RevisionEditor<TemplateDraft>(
        template ? { name: template.name, steps: template.steps, isActive: template.isActive } : { name: "", steps: [], isActive: true },
        (revision, body) => api.saveTemplate(id, revision, body),
        undefined,
        template?.revisionId ?? null,
      ),
    [api, id, template],
  );
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot, editor.snapshot);
  useEffect(() => () => editor.cancel(), [editor]);
  useUnsaved(state.dirty || state.pending);
  const draft = state.draft;
  const version = state.savedVersion ?? template?.version ?? null;
  const exists = Boolean(template || state.savedVersion);
  const blocked = state.pending || state.status === "saving" || state.status === "conflict";
  const edit = (change: Partial<TemplateDraft>) => editor.edit({ ...draft, ...change });
  const move = (from: number, to: number) => {
    const steps = [...draft.steps];
    [steps[from], steps[to]] = [steps[to], steps[from]];
    edit({ steps });
  };
  const rebase = async () => {
    setReloadError("");
    try {
      let page = 1;
      let found: Template | undefined;
      while (true) {
        const result = await api.getTemplates(page);
        found = result.data.find((item) => item.id === id);
        if (found || page >= result.pagination.totalPages) break;
        page++;
      }
      editor.rebase(found?.revisionId ?? null);
    } catch {
      setReloadError("Latest version could not be loaded. Draft retained.");
    }
  };
  // Archive and Restore are saves: the next version carries isActive false or true, with any edits.
  const saveAs = (isActive: boolean) => {
    const next = { ...draft, isActive };
    const message = problem(next);
    setReloadError(message);
    if (message) return;
    editor.edit(next);
    void editor.save();
  };
  return (
    <form
      aria-label="Template editor"
      className="space-y-5 border-t-2 border-ink pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        const message = problem(draft);
        setReloadError(message);
        if (!message) void editor.save();
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-medium">{draft.name.trim() || template?.name || "New template"}</h2>
        <p className="meta-mono">{templateVersionNote(version, draft.isActive)}</p>
      </div>
      <p className="max-w-prose text-sm text-ink-secondary">Saving creates a new version. Patient routines already copied from this template keep their own versions.</p>
      <fieldset disabled={state.pending} className="space-y-4">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor={`${id}-name`}>Template name</Label>
          <Input id={`${id}-name`} required maxLength={120} value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
        </div>
        <p className="eyebrow">Steps · {draft.steps.length}</p>
        {draft.steps.length === 0 ? (
          <p className="text-sm text-ink-secondary">No steps yet. Add a step before saving an active template.</p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {draft.steps.map((step, index) => (
              <li key={index} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 py-3">
                <span className="pt-6 font-data text-xs font-medium tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-step-${index}-title`}>Step title</Label>
                  <Input id={`${id}-step-${index}-title`} required maxLength={120} value={step.title} onChange={(e) => edit({ steps: draft.steps.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)) })} />
                  <Label htmlFor={`${id}-step-${index}-instructions`} className="block pt-2">Instructions</Label>
                  <Textarea id={`${id}-step-${index}-instructions`} className="min-h-16" maxLength={2000} value={step.instructions} onChange={(e) => edit({ steps: draft.steps.map((s, i) => (i === index ? { ...s, instructions: e.target.value } : s)) })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${index + 1} up`} disabled={!index} onClick={() => move(index, index - 1)}><ArrowUp aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${index + 1} down`} disabled={index === draft.steps.length - 1} onClick={() => move(index, index + 1)}><ArrowDown aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={() => edit({ steps: draft.steps.filter((_, i) => i !== index) })}><X aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </fieldset>
      {reloadError && <p role="alert" className="text-sm text-error">{reloadError}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <SaveState editor={editor} rebase={rebase} label={`Save as v${(version ?? 0) + 1}`} />
        <Button type="button" variant="outline" disabled={state.pending || draft.steps.length >= 20} onClick={() => edit({ steps: [...draft.steps, { title: "", instructions: "" }] })}><Plus aria-hidden />Add step</Button>
        {exists && (draft.isActive
          ? <Button type="button" variant="outline" disabled={blocked} onClick={() => saveAs(false)}>Archive</Button>
          : <Button type="button" variant="outline" disabled={blocked} onClick={() => saveAs(true)}>Restore</Button>)}
      </div>
      {exists && (
        <p className="text-xs text-ink-secondary">
          {draft.isActive
            ? `Archive saves v${(version ?? 0) + 1}, including any edits, as archived. Archived templates are not offered when copying into a patient routine.`
            : `Archived. Restore saves v${(version ?? 0) + 1} as active.`}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 6: Rewrite `web-portal/src/app/templates/page.tsx`**

```tsx
"use client";
import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { LoadState, Pages, useRead } from "@/components/care-support/shared";
import TemplateEditor from "@/components/care-support/TemplateEditor";
import { TemplateTable } from "@/components/care-support/TemplateTable";
import { Button } from "@/components/ui/button";
import { useClinicalAPI } from "@/lib/auth";

function Templates() {
  const api = useClinicalAPI();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const fetch = useCallback(() => api.getTemplates(page), [api, page]);
  const result = useRead(fetch);
  const selected = params.get("id");
  const creating = params.has("new");
  const template = result.data?.data.find((t) => t.id === selected);
  // One filled action: New template, unless an editor with its own Save is open.
  const editorOpen = creating || Boolean(template);
  return (
    <DashboardLayout title="Templates">
      <div className="portal-page">
        <header className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-1">
            <p className="eyebrow">{result.data ? `Reusable routines · ${result.data.pagination.total}` : "Reusable routines"}</p>
            <h1 className="editorial-title text-[32px]">Templates</h1>
            <p className="max-w-prose text-sm text-ink-secondary">Copy a template into a patient draft, then review and save the assignment.</p>
          </div>
          <Button variant="ghost" size="sm" asChild><a href={"/templates?page=" + page}>Refresh</a></Button>
          <Button variant={editorOpen ? "outline" : "default"} asChild><a href="/templates?new=1">New template</a></Button>
        </header>
        <LoadState {...result} loading="Loading templates" />
        {result.data && (
          <>
            {result.data.data.length === 0 && !creating ? (
              <div className="space-y-2 py-6">
                <h2 className="editorial-title text-2xl">No templates yet</h2>
                <p className="text-sm text-ink-secondary">Write a reusable routine once, then copy it into patient drafts.</p>
              </div>
            ) : result.data.data.length > 0 ? (
              <TemplateTable templates={result.data.data} page={page} selectedId={template?.id ?? null} />
            ) : null}
            {result.data.pagination.totalPages > 1 && (
              <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={(next) => { window.location.href = "/templates?page=" + next; }} />
            )}
            {creating ? (
              <TemplateEditor key="new" template={null} />
            ) : template ? (
              <TemplateEditor key={template.revisionId} template={template} />
            ) : selected ? (
              <p className="text-sm text-ink-secondary">This template is not on this page. Use the page controls to find it.</p>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Opening templates</p>}>
      <Templates />
    </Suspense>
  );
}
```

- [ ] **Step 7: Record the omission** — append to `docs/design/letterpress/deferred.md`

```markdown
| Portal Templates | "In use" column ("9 patients") | No link from a patient routine to the template it was copied from |
```

- [ ] **Step 8: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/templates-view.test.ts tests/care-support.test.ts`
Expected: PASS.
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add web-portal/src/lib/care-support.ts web-portal/src/components/care-support/TemplateTable.tsx web-portal/src/components/care-support/TemplateEditor.tsx web-portal/src/app/templates/page.tsx docs/design/letterpress/deferred.md web-portal/tests/templates-view.test.ts
git commit -m "portal: list templates in a ruled table with an inline versioned editor and archive" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Sign in, auth pages, Account, care status and decisions [mechanical]

**Files:**
- Create: `web-portal/src/components/layout/AuthShell.tsx`
- Modify (full rewrite): `web-portal/src/app/login/page.tsx`, `web-portal/src/app/register/page.tsx`, `web-portal/src/app/forgot-password/page.tsx`, `web-portal/src/app/reset-password/page.tsx`, `web-portal/src/app/account/page.tsx`, `web-portal/src/components/patients/CareStatusCard.tsx`
- Modify: `web-portal/src/components/patients/CareDecisionDialog.tsx` (icon, legend, error), `docs/design/letterpress/deferred.md`
- Test: create `web-portal/tests/auth-pages.test.ts`

**Interfaces:**
- Consumes: `useAuth` (`login`, `isAuthenticated`, `user`, `logout`), `supabase.auth.resetPasswordForEmail`, `consumeRecoveryCallback`/`updateRecoveredPassword`/`cancelRecovery` (all unchanged); PR 2 `Button`, `Input`, `Label`, `Badge`; PR 4 `stamp`; `.eyebrow`, `.meta-mono`.
- Produces: `AuthShell` (default) `{ eyebrow: string; title: string; children: ReactNode }` with the wordmark text placeholder marked `data-placeholder="wordmark"` for PR 8.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/auth-pages.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthShell from '../src/components/layout/AuthShell';
import { read } from './letterpress-rules';

test('auth shell: wordmark placeholder, serif title, ink quote panel and the real session behaviour in mono', () => {
  const html = renderToStaticMarkup(h(AuthShell, { eyebrow: 'Clinician portal', title: 'Sign in' }, h('p', null, 'Form')));
  assert.match(html, /data-placeholder="wordmark"/);
  assert.match(html, /<h1 class="[^"]*editorial-title[^"]*">Sign in<\/h1>/);
  assert.match(html, /class="meta-mono">Signed-in sessions stay in this browser until you sign out</);
  assert.match(html, /class="[^"]*bg-ink[^"]*text-canvas/);
  assert.doesNotMatch(html, /HIPAA|30 min|idle/i);
});

test('sign in, register and password pages share the split shell; sign in has one 44px filled action and no card or glyph', () => {
  const login = read('src/app/login/page.tsx');
  assert.match(login, /<AuthShell eyebrow="Clinician portal" title="Sign in">/);
  assert.match(login, /<Button type="submit" size="lg" className="w-full"/);
  assert.match(login, /'Signing in…' : 'Sign in'/);
  assert.match(login, /<Label htmlFor="email">Work email<\/Label>/);
  assert.doesNotMatch(login, /Card|Stethoscope|Sign In|Welcome back|Alert/);
  for (const page of ['register', 'forgot-password', 'reset-password']) assert.match(read(`src/app/${page}/page.tsx`), /<AuthShell /, page);
});

test('account is a read-only profile; practice, notifications, session timeout and audit export are not shown', () => {
  const account = read('src/app/account/page.tsx');
  for (const label of ['Display name', 'Work email', 'Change password', 'Sign out']) assert.ok(account.includes(label), label);
  assert.doesNotMatch(account, /practice|notification|session timeout|audit|save profile|<Card/i);
});

test('care status and decisions are said in words: no warning glyphs or destructive badges', () => {
  for (const file of ['src/components/patients/CareStatusCard.tsx', 'src/components/patients/CareDecisionDialog.tsx']) {
    assert.doesNotMatch(read(file), /AlertTriangle|'destructive'|attention-/, file);
  }
  assert.match(read('src/components/patients/CareStatusCard.tsx'), /stamp\(decision\.createdAt\)/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/auth-pages.test.ts`
Expected: FAIL — `Cannot find module '../src/components/layout/AuthShell'`.

- [ ] **Step 3: Create `web-portal/src/components/layout/AuthShell.tsx`**

```tsx
import type { ReactNode } from 'react';

// Split sign-in layout (portal mockup "Portal login"): paper form column and an ink quote panel.
// The wordmark is plain text until PR 8 ships the mark; `data-placeholder` marks it for replacement.
export default function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <main className="flex min-h-screen bg-canvas text-ink">
    <div className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-1/2 lg:px-16">
      <p data-placeholder="wordmark" className="font-display text-[22px] font-light tracking-[0.18em]">clear<span className="italic">af</span></p>
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="editorial-title text-[34px]">{title}</h1>
          </div>
          {children}
        </div>
      </div>
      <p className="meta-mono">Signed-in sessions stay in this browser until you sign out</p>
    </div>
    <aside aria-label="About the clinician portal" className="hidden flex-col justify-end bg-ink p-12 text-canvas lg:flex lg:w-1/2">
      <blockquote className="max-w-md font-display text-[30px] font-light leading-snug">“Photos, routines and check-ins, in the order they happened.”</blockquote>
      <p className="eyebrow mt-6 text-canvas">What the record tells you before the appointment does</p>
    </aside>
  </main>;
}
```

- [ ] **Step 4: Rewrite `web-portal/src/app/login/page.tsx`**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('password') === 'updated') setNotice('Password updated. Sign in with your new password.');
    if (params.get('logout') === 'revocation-failed') {
      setError('You are signed out on this browser. The server could not confirm session revocation; sign in again when your connection is available.');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.push('/patients');
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
      router.push('/patients');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed. Check your details and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = email.trim() !== '' && password.length >= 6;

  return (
    <AuthShell eyebrow="Clinician portal" title="Sign in">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@practice.example" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-14" required />
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-secondary underline underline-offset-[3px] hover:text-ink"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && <p role="alert" className="border-l-2 border-error pl-3 text-sm text-error">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!isFormValid || isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
        {!isFormValid && !isLoading && <p className="text-xs text-ink-secondary">Enter your work email and password to continue.</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a className="underline underline-offset-[3px]" href="/forgot-password">Forgot password</a>
          <a className="underline underline-offset-[3px]" href="/register">Request practice access</a>
        </div>
      </form>
    </AuthShell>
  );
}
```

- [ ] **Step 5: Rewrite the other auth pages**

`web-portal/src/app/register/page.tsx`:

```tsx
import AuthShell from '@/components/layout/AuthShell';

export default function RegisterPage() {
  return <AuthShell eyebrow="Clinician portal" title="Practice-provisioned accounts">
    <div className="space-y-4 text-sm">
      <p>Clinician access is provided by your practice administrator after your professional account is verified. Contact your practice to request an account or resolve an access issue.</p>
      <p className="text-ink-secondary">Creating a patient account does not grant access to this portal.</p>
      <a className="underline underline-offset-[3px]" href="/login">Return to sign in</a>
    </div>
  </AuthShell>;
}
```

`web-portal/src/app/forgot-password/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import AuthShell from '@/components/layout/AuthShell';
import { supabase } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  return <AuthShell eyebrow="Password recovery" title="Reset your password">
    <form className="space-y-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage('');
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMessage('If an account matches this email, you will receive a password reset link. Open it in this browser.');
      } catch { setMessage('Unable to send the reset request. Check your connection and try again.'); }
      finally { setBusy(false); }
    }}>
      <div className="space-y-1.5"><Label htmlFor="email">Account email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
      <a href="/login" className="text-sm underline underline-offset-[3px]">Return to sign in</a>
    </form>
  </AuthShell>;
}
```

`web-portal/src/app/reset-password/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import AuthShell from '@/components/layout/AuthShell';
import { consumeRecoveryCallback, updateRecoveredPassword, cancelRecovery } from '@/lib/recovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const [generation, setGeneration] = useState<number | null>(null), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const attempt = consumeRecoveryCallback(window.location.href);
    window.history.replaceState(null, '', '/reset-password');
    void attempt.then(value => { if (active) setGeneration(value); }, cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  const leave = async (path: string) => {
    setBusy(true);
    try { await cancelRecovery(); window.location.replace(path); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to clear recovery.'); setBusy(false); }
  };
  return <AuthShell eyebrow="Password recovery" title="Choose a new password">
    <div className="space-y-6">
      {error && <p role="alert" className="border-l-2 border-error pl-3 text-sm text-error">{error}</p>}
      {generation === null ? <p role="status" className="text-sm text-ink-secondary">{error ? 'Request a new reset link to continue.' : 'Checking your reset link'}</p> : <form className="space-y-6" onSubmit={async event => {
        event.preventDefault(); setError('');
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        setBusy(true);
        try { const revocationFailed = await updateRecoveredPassword(password, generation); window.location.replace(`/login?password=updated${revocationFailed ? '&logout=revocation-failed' : ''}`); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your password. Request a new link and try again.'); }
        finally { setBusy(false); }
      }}>
        <div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /><p className="text-xs text-ink-secondary">At least 8 characters.</p></div>
        <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} /></div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
      </form>}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <button type="button" disabled={busy} onClick={() => void leave('/forgot-password')} className="underline underline-offset-[3px] disabled:text-ink-tertiary">Request a new reset link</button>
        <button type="button" disabled={busy} onClick={() => void leave('/login')} className="underline underline-offset-[3px] disabled:text-ink-tertiary">Cancel and return to sign in</button>
      </div>
    </div>
  </AuthShell>;
}
```

- [ ] **Step 6: Rewrite `web-portal/src/app/account/page.tsx`**

```tsx
'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

// Profile only (owner decision 1): the other Account controls in the mockup have no backing capability yet.
export default function AccountPage() {
  const { user, logout } = useAuth();
  const rows = [
    { label: 'Display name', value: user?.name },
    { label: 'Specialization', value: user?.specialization },
    { label: 'Work email', value: user?.email },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  return <DashboardLayout title="Account"><div className="portal-page max-w-2xl">
    <header className="space-y-1">
      {user?.email && <p className="eyebrow break-all">Signed in as {user.email}</p>}
      <h1 className="editorial-title text-[32px]">Account</h1>
    </header>
    <section aria-label="Profile" className="space-y-3">
      <p className="eyebrow">Profile</p>
      <dl className="divide-y divide-rule border-y-2 border-ink">
        {rows.map(row => <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <dt className="eyebrow pt-1">{row.label}</dt>
          <dd className="break-words text-[15px] font-medium">{row.value}</dd>
        </div>)}
      </dl>
      <p className="text-sm text-ink-secondary">These details come from your verified clinician profile.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild><a href="/forgot-password">Change password</a></Button>
        <Button variant="outline" onClick={() => void logout()}>Sign out</Button>
      </div>
    </section>
  </div></DashboardLayout>;
}
```

- [ ] **Step 7: Rewrite `web-portal/src/components/patients/CareStatusCard.tsx`**

```tsx
'use client';
import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClinicalAPI } from '@/lib/auth';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { canMarkRefund, careStatusView, decisionLabel, refundLabel } from '@/lib/care-decisions';
import type { CareDecision, DecisionKind } from '@/lib/care-decisions';
import { stamp } from '@/lib/worklist';
import CareDecisionDialog from './CareDecisionDialog';

// Decisions and refunds are said in words; nothing here uses a warning glyph, error hue or ochre.
function DecisionMeta({ decision }: { decision: CareDecision }) {
  const refund = refundLabel(decision.refundStatus);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={decision.decision === 'async_care' ? 'secondary' : 'default'}>{decisionLabel(decision.decision)}</Badge>
        {refund && <Badge variant="outline">{refund}</Badge>}
      </div>
      <p className="meta-mono">{decision.clinicianName} · {stamp(decision.createdAt)}</p>
      {decision.patientMessage && <p className="max-w-prose whitespace-pre-wrap break-words text-sm">{decision.patientMessage}</p>}
    </div>
  );
}

export default function CareStatusCard({ patientId, refresh }: { patientId: string; refresh: number }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const [dialogDecision, setDialogDecision] = useState<DecisionKind | null>(null);
  // A refund can be pending on any decision, so the action and its error are tracked per decision id.
  const [refundPendingId, setRefundPendingId] = useState<string | null>(null);
  const [refundErrorId, setRefundErrorId] = useState<string | null>(null);

  // The current decision is always the newest one (page 1, first row), independent of the history page. `refresh`
  // bumps when a decision is recorded elsewhere (e.g. from a photo); referencing it forces these reads to reload.
  const currentFetch = useCallback(() => {
    void refresh;
    return api.getCareDecisions(patientId, 1);
  }, [api, patientId, refresh]);
  const currentResult = useRead(currentFetch);
  const historyFetch = useCallback(() => {
    void refresh;
    return api.getCareDecisions(patientId, page);
  }, [api, patientId, page, refresh]);
  const historyResult = useRead(historyFetch);

  const { current, currentKind, historyRows, canOfferRefund } = careStatusView(currentResult.data, historyResult.data, page);
  const refreshAll = () => {
    currentResult.retry();
    historyResult.retry();
  };
  const markRefund = async (decisionId: string) => {
    setRefundPendingId(decisionId);
    setRefundErrorId(null);
    try {
      await api.markRefundIssued(patientId, decisionId);
      refreshAll();
    } catch {
      setRefundErrorId(decisionId);
    } finally {
      setRefundPendingId(null);
    }
  };
  const refundButton = (decision: CareDecision, label?: string) => (
    <Button size="sm" variant="outline" disabled={refundPendingId !== null} aria-label={refundPendingId === decision.id ? undefined : label} onClick={() => void markRefund(decision.id)}>
      {refundPendingId === decision.id ? 'Marking refund issued…' : 'Mark refund issued'}
    </Button>
  );
  const refundError = (decision: CareDecision) =>
    refundErrorId === decision.id && <p role="alert" className="text-sm text-error">Refund could not be saved. Try again.</p>;

  return (
    <section aria-label="Care status" className="space-y-4">
      <div className="space-y-1">
        <p className="eyebrow">Care status</p>
        <h2 className="editorial-title text-2xl">Current care decision</h2>
      </div>
      <div className="space-y-3 border-y-2 border-ink py-4">
        <LoadState {...currentResult} loading="Loading care status" />
        {currentResult.data && (current ? (
          <DecisionMeta decision={current} />
        ) : (
          <p className="text-sm text-ink-secondary">No care decision recorded. Online care is the current default.</p>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialogDecision('refer_out')}>Refer out</Button>
          <Button size="sm" variant="outline" onClick={() => setDialogDecision('needs_in_person')}>Needs in-person</Button>
          {currentKind !== 'async_care' && (
            <Button size="sm" variant="outline" onClick={() => setDialogDecision('async_care')}>Resume online care</Button>
          )}
          {current && canOfferRefund && refundButton(current)}
        </div>
        {current && refundError(current)}
      </div>
      <LoadState {...historyResult} loading="Loading earlier decisions" />
      {historyResult.data && (
        <>
          {historyRows.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Earlier decisions</p>
              <ul className="divide-y divide-rule border-b border-rule">
                {historyRows.map((decision) => (
                  <li key={decision.id} className="space-y-2 py-3">
                    <DecisionMeta decision={decision} />
                    {canMarkRefund(decision) &&
                      refundButton(decision, `Mark refund issued for ${decisionLabel(decision.decision)} recorded ${stamp(decision.createdAt)}`)}
                    {refundError(decision)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Pages page={page} totalPages={historyResult.data.pagination.totalPages} onPage={setPage} />
        </>
      )}
      <CareDecisionDialog
        patientId={patientId}
        photoId={null}
        defaultDecision={dialogDecision ?? 'refer_out'}
        open={dialogDecision !== null}
        onOpenChange={(next) => { if (!next) setDialogDecision(null); }}
        onSaved={() => { setDialogDecision(null); refreshAll(); }}
        onSettledAfterClose={refreshAll}
      />
    </section>
  );
}
```

- [ ] **Step 8: Edit `web-portal/src/components/patients/CareDecisionDialog.tsx`**

1. Delete line 3, `import { AlertTriangle } from 'lucide-react';`.
2. Replace `<legend className="text-sm font-medium">Care decision</legend>` with `<legend className="eyebrow pb-1">Care decision</legend>`.
3. Replace

```tsx
          {state.status === 'error' && (
            <p role="alert" className="flex items-center gap-1 text-sm">
              <AlertTriangle aria-hidden className="h-4 w-4 text-error" />
              {state.error}
            </p>
          )}
```

with

```tsx
          {state.status === 'error' && <p role="alert" className="text-sm text-error">{state.error}</p>}
```

- [ ] **Step 9: Record omissions** — append to `docs/design/letterpress/deferred.md`

```markdown
| Portal Sign in | "HIPAA-aligned handling · sessions expire after 30 min idle" | No verified compliance claim and no idle timeout; the page states the real session behaviour instead |
| Portal Account | Save profile (display name, credentials shown to patients) | The portal has never edited clinician profiles; adding a write flow is outside the redesign |
```

- [ ] **Step 10: Run the tests, then the portal gate**

Run: `cd web-portal && node --import tsx --test tests/auth-pages.test.ts tests/care-decisions.test.ts tests/privacy.test.mjs tests/recovery.test.ts tests/auth.test.ts`
Expected: PASS.
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add web-portal/src/components/layout/AuthShell.tsx web-portal/src/app/login/page.tsx web-portal/src/app/register/page.tsx web-portal/src/app/forgot-password/page.tsx web-portal/src/app/reset-password/page.tsx web-portal/src/app/account/page.tsx web-portal/src/components/patients/CareStatusCard.tsx web-portal/src/components/patients/CareDecisionDialog.tsx docs/design/letterpress/deferred.md web-portal/tests/auth-pages.test.ts
git commit -m "portal: split sign-in shell, read-only account and care status in words" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: PR 5 verification [mechanical]

**Files:** none, unless a check fails (fix, then rerun only that check).

**Acceptance (defined up front):** backend and portal gates green; `care-access-reviewer`, `api-contract-checker` and `/code-review` clean; the workspace renders five URL-addressed tabs with one filled button per visible tab, light and dark, at 1280px and 390px; Send & mark reviewed succeeds and its partial failure is honest; a routine draft survives a tab switch; the revisions 404 fallback reads plainly; Messages, Templates, Sign in and Account match their rows; keyboard focus is visible.

- [ ] **Step 1: Gates**

Run: `cd backend && npm test && npm run build`
Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green (including PR 2's `letterpress-sweep`, `class-definitions`, PR 4's `worklist-page` and `privacy`).

- [ ] **Step 2: Review**

Run `care-access-reviewer` on the branch diff (`backend/src/services/routineCare.ts`, `backend/src/routes/routines.ts`, `web-portal/src/lib/api.ts`, `photo-feedback.ts`, `PatientPhotoHistory.tsx`, `ConversationView.tsx`, `PhotoReferencePicker.tsx`) and `api-contract-checker` (new `GET /routines/patients/:id/revisions`; `RoutineRevision` reused; no iOS change). Then `/code-review`. Fix findings; rerun only the affected check.

- [ ] **Step 3: Bounded visual pass (Playwright, one pass)**

Stop main-checkout dev servers on 3000/3001 first and restore them at the end. Start the worktree API on 3001 (`cd backend && npm run dev`) and portal on 3000 (`cd web-portal && npm run dev`). Create the PR 4 UI fixture with a throwaway password the controller generates for this run: `cd backend && SECURITY_API_URL=http://127.0.0.1:3001/api WORKLIST_UI_PASSWORD=<generated, 20+ chars> node scripts/worklist-live.cjs --keep-for-ui` (prints the synthetic clinician email; if the controller prefers not to handle the password, hand sign-in to the user). The fixture's photo rows have no Storage objects, so previews and originals show "Preview unavailable" / "Original unavailable"; that exercises the error states. With the Playwright tools on `http://localhost:3000`, record pass/fail per bullet:
- **Sign in** (signed out, 1280px): wordmark text, "Sign in" serif, Work email/Password baseline fields, Show/Hide text control, one 44px filled "Sign in", ink quote panel, mono session line. At 390px the ink panel is hidden and nothing scrolls horizontally.
- **Workspace, patient A** from the worklist: 200px rail with Worklist current; "Back to worklist"; serif name with `SINCE …`; eligibility line; urgent reports "No urgent reports for this patient."; underline tabs with Photos selected; URL has no `tab`.
- **Photos:** two compare panes on the dark mat with mono stamps and review words; strip shows two selected tiles with the inset outline and the third disabled with its sentence; care rail shows the morning/evening routine and the latest check-in. Type a reply → "Send & mark reviewed" (the only filled button) → "Sent. Photo marked reviewed."; the pane caption now reads "Reviewed · …".
- **Partial failure:** `browser_run_code_unsafe` with `await page.route('**/api/photo-reviews/photos/**', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"synthetic"}' }))`; select the other unreviewed photo, send a reply → "Message sent. The photo is not marked reviewed yet." with "Retry marking reviewed"; `page.unroute('**/api/photo-reviews/photos/**')`; retry → "Sent. Photo marked reviewed."; the Messages tab shows exactly one new message.
- **Tabs are URL state:** click Routine → URL gains `tab=routine`; reload stays on Routine; browser Back returns to Photos. Arrow keys move focus between tab triggers without switching until Enter.
- **Routine:** change a step's instructions → the row tints, shows `EDITED · WAS "…"`, badges `V1 ACTIVE` + `DRAFT V2`, filled "Save as v2", "keeps following v1 until v2 is saved"; switch to Check-ins and back → the draft is still there; Discard draft restores it. Version history lists V1. Then `page.route('**/api/routines/patients/*/revisions**', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Route not found"}' }))`, reload → "Earlier versions are not available from this server yet."; unroute.
- **Check-ins:** the latest response question by question with "(required)"; filled "Reply to …" opens the Messages tab; rail shows "Answers over time" words table and "Assigned form" with version and required count, no response rate or schedule.
- **Messages tab and /messages:** serif clinician turns behind the ink rule; patient replies in sunk blocks; an unread patient message shows the ochre mark and "Unread"; "Attach photo reference" opens the picker, choosing a photo shows `LINKS PHOTO …`; thread list marks the open thread with the ink rule and unread threads say "N unread"; "Open record" goes to the workspace.
- **History:** care status in words (no warning glyphs), completion calendar, recent completions table with mono stamps.
- **Flagged link:** worklist Flagged → "Open report" for patient B lands on `#urgent` with the open report in view, labelled in words, above the tabs.
- **Templates:** "New template" filled until the editor opens, then "Save as v1" is the only filled button; save, then Archive → table shows `Archived …` and `V2`; the template disappears from the Routine tab's "Your templates".
- **Account:** ruled profile (display name, work email), Change password and Sign out outlined; no practice, notification, timeout or audit controls.
- **Dark mode** (`page.emulateMedia({ colorScheme: 'dark' })`) on Photos, Routine with a draft (tinted row text legible) and Sign in; **390px** on the workspace: the rail stacks under the main column, tabs scroll inside their row, no page-level horizontal scroll.
- **Keyboard:** Tab through rail, tabs, strip tiles, reply field and buttons; each shows the 2px ink outline (pressed strip tiles keep an outward focus ring).
- Then `cd backend && node scripts/worklist-live.cjs --cleanup-ui` and confirm the cleanup PASS line.

- [ ] **Step 4: API deploy note (controller)**

Deploy the API before merging, because the portal auto-deploys from `main`: `/ship-release` (record the rollback target with `vercel inspect`, `vercel --prod` from `backend`, check `/health` and `/ready`, and confirm with `vercel inspect` that the production deployment is this branch's commit). An unauthenticated probe cannot tell an old API from a new one here (`authenticateToken` answers 401 before routing), so route existence is proven by Step 3 against the same build. Production deploy needs explicit user approval. No hosted migration is involved. If the portal ever reaches an older API, the Routine tab shows "Earlier versions are not available from this server yet." and everything else works.

---

## Self-review (run while planning)

- **Spec coverage:** §6 portal #2 → Tasks 2–3 (tabs, Compare default, rail, Send & mark reviewed); #3 → Task 4 (two panes, tint + `EDITED · WAS`, `V{n} ACTIVE`/`DRAFT V{n+1}`, stays-on copy, history and templates beside); #4 → Task 5 (question by question, required flags, plotted as given, form version; response rate/schedule omitted and recorded); #5 → Task 6; #6 → Task 7 (In use omitted and recorded; archive supported); #7 → Task 8 (split, baseline fields, ink panel, mono session line, wordmark placeholder); #8 → Task 8 (profile only). Unspecced pages: register/forgot/reset (Task 8); dashboard/appointments/prescriptions/profile/settings are redirects (Decision 14); CareDecisionDialog, CareStatusCard (Task 8); EnrollmentStatus, PatientUrgentReports (Task 2). Sidebar rail (Task 2). §5 states: loading copy named everywhere, empty states with serif titles, disabled reasons, saving labels, success vs partial failure, errors keep work.
- **Placeholders:** none; every code step carries complete code or exact replacement text.
- **Type consistency:** `PatientPhotoHistory({ patientId, patientName, onCareDecision, rail })`, `PatientRoutineCare({ patientId, patientName, controller, state, onFeedback })`, `PatientCheckIns({ patientId, patientName, onReply })`, `ConversationView({ …, recordHref? })`, `workspaceHref(id, listQuery, tab, extra?)`, `messageReference(type, id)`, `loadRevisionHistory` / `RevisionHistory` / `VersionListState`, `FeedbackState.reviewed`, `LoadState loading` are used with the same names in every task.

---

## Controller notes (added at execution)

- PR 4 is merged (#20). Where this plan's assumptions about PR 4 names differ from `main`, trust the merged code: `@/lib/worklist` helpers, `patientListQuery` signature, table `data-attention` selector fix, `class-definitions` guard now scanning `src/lib`.
- The API deploys before merge (owner authorized): the controller runs it for the new revisions endpoint.
