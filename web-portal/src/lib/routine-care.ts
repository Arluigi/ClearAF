import type {
  PaginatedResponse,
  RoutineRevision,
  RoutineSnapshot,
  RoutineStep,
  RoutineTimeOfDay,
  RoutineCompletionRecord,
  SaveRoutineRevisionInput,
} from '../types/api';
import { APIError } from '../types/api';

export interface RoutineDraft {
  name: string;
  isActive: boolean;
  steps: RoutineStep[];
}

export interface RoutineEditorState {
  routine: RoutineRevision | null;
  draft: RoutineDraft;
  expectedRevisionId: string | null;
  status: 'ready' | 'saving' | 'error' | 'conflict';
  error: string;
  dirty: boolean;
  hasPendingSave: boolean;
}

export interface RoutineCareState {
  loadStatus: 'loading' | 'ready' | 'error';
  loadError: string;
  slots: Record<RoutineTimeOfDay, RoutineEditorState>;
  history: {
    entries: RoutineCompletionRecord[];
    page: number;
    total: number;
    totalPages: number;
    status: 'loading' | 'ready' | 'error';
    error: string;
  };
}

interface PendingSave {
  revisionId: string;
  body: SaveRoutineRevisionInput;
}

interface RoutineCareDependencies {
  fetchSnapshot: () => Promise<RoutineSnapshot>;
  saveRevision: (
    slot: RoutineTimeOfDay,
    revisionId: string,
    body: SaveRoutineRevisionInput,
  ) => Promise<RoutineRevision>;
  fetchHistory: (page: number) => Promise<PaginatedResponse<RoutineCompletionRecord>>;
  createRevisionId?: () => string;
}

const emptyDraft = (): RoutineDraft => ({ name: '', isActive: true, steps: [] });
const emptyEditor = (): RoutineEditorState => ({
  routine: null,
  draft: emptyDraft(),
  expectedRevisionId: null,
  status: 'ready',
  error: '',
  dirty: false,
  hasPendingSave: false,
});
const cloneSteps = (steps: RoutineStep[]) => steps.map(step => ({ ...step }));
const draftFrom = (routine: RoutineRevision): RoutineDraft => ({
  name: routine.name,
  isActive: routine.isActive,
  steps: cloneSteps(routine.steps),
});

/** Owns the editable routine and history state for one mounted patient. */
export class RoutineCareController {
  private state: RoutineCareState = {
    loadStatus: 'loading',
    loadError: '',
    slots: { morning: emptyEditor(), evening: emptyEditor() },
    history: { entries: [], page: 1, total: 0, totalPages: 1, status: 'loading', error: '' },
  };
  private pending: Partial<Record<RoutineTimeOfDay, PendingSave>> = {};
  private saves: Partial<Record<RoutineTimeOfDay, Promise<void>>> = {};
  private listeners = new Set<() => void>();
  private lifecycle = 0;
  private historyRequest = 0;
  private snapshotRequest = 0;
  private assignmentLoads = 0;

  constructor(private dependencies: RoutineCareDependencies) {}

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  cancel() {
    this.lifecycle += 1;
    this.historyRequest += 1;
    this.snapshotRequest += 1;
  }

  private publish(state: RoutineCareState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  private updateSlot(slot: RoutineTimeOfDay, update: (state: RoutineEditorState) => RoutineEditorState) {
    this.publish({ ...this.state, slots: { ...this.state.slots, [slot]: update(this.state.slots[slot]) } });
  }

  private hasSaveBarrier(allowResolvedConflicts = false) {
    return (['morning', 'evening'] as const).some(slot => {
      const resolvedConflict = allowResolvedConflicts && this.state.slots[slot].status === 'conflict';
      if (this.saves[slot] && !resolvedConflict) return true;
      if (!this.pending[slot]) return false;
      return !resolvedConflict;
    });
  }

  async load() {
    if (this.hasSaveBarrier()) return;
    const lifecycle = this.lifecycle;
    const request = ++this.snapshotRequest;
    this.assignmentLoads += 1;
    this.publish({ ...this.state, loadStatus: 'loading', loadError: '' });
    try {
      const snapshot = await this.dependencies.fetchSnapshot();
      if (lifecycle !== this.lifecycle || request !== this.snapshotRequest) return;
      const editor = (slot: RoutineTimeOfDay) => {
        const routine = snapshot.routines.find(item => item.timeOfDay === slot) ?? null;
        return routine ? {
          routine,
          draft: draftFrom(routine),
          expectedRevisionId: routine.id,
          status: 'ready' as const,
          error: '',
          dirty: false,
          hasPendingSave: false,
        } : emptyEditor();
      };
      this.pending = {};
      this.publish({
        ...this.state,
        loadStatus: 'ready',
        loadError: '',
        slots: { morning: editor('morning'), evening: editor('evening') },
      });
    } catch {
      if (lifecycle !== this.lifecycle || request !== this.snapshotRequest) return;
      this.publish({
        ...this.state,
        loadStatus: 'error',
        loadError: 'Routine assignments could not be loaded. Check your connection and try again.',
      });
    } finally {
      this.assignmentLoads -= 1;
      if (lifecycle === this.lifecycle) this.publish({ ...this.state });
    }
  }

  copyTemplate(slot: RoutineTimeOfDay, template: {name:string;steps:RoutineStep[];isActive:boolean}) {
    if (!template.isActive) return;
    this.editDraft(slot, () => ({ name: template.name, steps: cloneSteps(template.steps), isActive: true }));
  }

  setName(slot: RoutineTimeOfDay, name: string) {
    this.editDraft(slot, draft => ({ ...draft, name }));
  }

  setActive(slot: RoutineTimeOfDay, isActive: boolean) {
    this.editDraft(slot, draft => ({ ...draft, isActive }));
  }

  private editDraft(slot: RoutineTimeOfDay, edit: (draft: RoutineDraft) => RoutineDraft) {
    if (this.assignmentLoads > 0 || this.pending[slot]) return;
    this.updateSlot(slot, current => ({ ...current, draft: edit(current.draft), dirty: true, error: '' }));
  }

  addStep(slot: RoutineTimeOfDay) {
    this.editDraft(slot, draft => draft.steps.length >= 20 ? draft : ({
      ...draft,
      steps: [...draft.steps, { title: '', instructions: '' }],
    }));
  }

  removeStep(slot: RoutineTimeOfDay, index: number) {
    this.editDraft(slot, draft => ({
      ...draft,
      steps: draft.steps.filter((_step, stepIndex) => stepIndex !== index),
    }));
  }

  setStepTitle(slot: RoutineTimeOfDay, index: number, title: string) {
    this.editDraft(slot, draft => ({
      ...draft,
      steps: draft.steps.map((step, stepIndex) => stepIndex === index ? { ...step, title } : step),
    }));
  }

  setStepInstructions(slot: RoutineTimeOfDay, index: number, instructions: string) {
    this.editDraft(slot, draft => ({
      ...draft,
      steps: draft.steps.map((step, stepIndex) => stepIndex === index ? { ...step, instructions } : step),
    }));
  }

  moveStep(slot: RoutineTimeOfDay, from: number, to: number) {
    this.editDraft(slot, draft => {
      if (from < 0 || from >= draft.steps.length || to < 0 || to >= draft.steps.length || from === to) return draft;
      const steps = cloneSteps(draft.steps);
      const [step] = steps.splice(from, 1);
      steps.splice(to, 0, step);
      return { ...draft, steps };
    });
  }

  /** Restores the saved revision into the draft. Refused while a save for this slot is unresolved. */
  discard(slot: RoutineTimeOfDay) {
    if (this.assignmentLoads > 0 || this.pending[slot] || this.saves[slot]) return;
    this.updateSlot(slot, current => current.routine
      ? { ...current, draft: draftFrom(current.routine), dirty: false, status: 'ready', error: '' }
      : emptyEditor());
  }

  save(slot: RoutineTimeOfDay): Promise<void> {
    if (this.assignmentLoads > 0) return Promise.resolve();
    if (this.saves[slot]) return this.saves[slot]!;
    if (!this.pending[slot]) {
      const current = this.state.slots[slot];
      if (!current.dirty) return Promise.resolve();
      const validationError = validateDraft(current.draft);
      if (validationError) {
        this.updateSlot(slot, editor => ({ ...editor, status: 'error', error: validationError, hasPendingSave: false }));
        return Promise.resolve();
      }
      this.pending[slot] = {
        revisionId: this.dependencies.createRevisionId?.() ?? crypto.randomUUID(),
        body: {
          expectedRevisionId: current.expectedRevisionId,
          name: current.draft.name,
          isActive: current.draft.isActive,
          steps: cloneSteps(current.draft.steps),
        },
      };
    }
    const lifecycle = this.lifecycle;
    const work = this.performSave(slot).finally(() => {
      delete this.saves[slot];
      // Barrier changes affect Reload eligibility even when editor data is unchanged.
      if (lifecycle === this.lifecycle) this.publish({ ...this.state });
    });
    this.saves[slot] = work;
    return work;
  }

  retry(slot: RoutineTimeOfDay): Promise<void> {
    return this.save(slot);
  }

  canReloadConflict(slot: RoutineTimeOfDay) {
    return this.assignmentLoads === 0
      && this.state.slots[slot].status === 'conflict'
      && !!this.pending[slot]
      && !this.hasSaveBarrier(true);
  }

  async reloadConflict(slot: RoutineTimeOfDay) {
    if (!this.canReloadConflict(slot)) return;
    const lifecycle = this.lifecycle;
    const request = ++this.snapshotRequest;
    this.assignmentLoads += 1;
    this.publish({ ...this.state, loadStatus: 'loading', loadError: '' });
    try {
      const snapshot = await this.dependencies.fetchSnapshot();
      if (lifecycle !== this.lifecycle || request !== this.snapshotRequest) return;
      const routine = snapshot.routines.find(item => item.timeOfDay === slot) ?? null;
      delete this.pending[slot];
      this.publish({
        ...this.state,
        loadStatus: 'ready',
        loadError: '',
        slots: {
          ...this.state.slots,
          [slot]: routine ? {
            routine,
            draft: draftFrom(routine),
            expectedRevisionId: routine.id,
            status: 'ready',
            error: '',
            dirty: false,
            hasPendingSave: false,
          } : emptyEditor(),
        },
      });
    } catch {
      if (lifecycle !== this.lifecycle || request !== this.snapshotRequest) return;
      this.publish({
        ...this.state,
        loadStatus: 'ready',
        slots: {
          ...this.state.slots,
          [slot]: {
            ...this.state.slots[slot],
            error: 'The latest routine could not be loaded. Check your connection and try Reload again.',
          },
        },
      });
    } finally {
      this.assignmentLoads -= 1;
      if (lifecycle === this.lifecycle) this.publish({ ...this.state });
    }
  }

  async loadHistory(page: number) {
    const lifecycle = this.lifecycle;
    const request = ++this.historyRequest;
    this.publish({
      ...this.state,
      history: { ...this.state.history, entries: [], page, status: 'loading', error: '' },
    });
    try {
      const result = await this.dependencies.fetchHistory(page);
      if (lifecycle !== this.lifecycle || request !== this.historyRequest) return;
      this.publish({
        ...this.state,
        history: {
          entries: result.data,
          page: result.pagination.page,
          total: result.pagination.total,
          totalPages: Math.max(1, result.pagination.totalPages),
          status: 'ready',
          error: '',
        },
      });
    } catch {
      if (lifecycle !== this.lifecycle || request !== this.historyRequest) return;
      this.publish({
        ...this.state,
        history: {
          ...this.state.history,
          entries: [],
          status: 'error',
          error: 'Completion history could not be loaded. Check your connection and try again.',
        },
      });
    }
  }

  private async performSave(slot: RoutineTimeOfDay) {
    const lifecycle = this.lifecycle;
    const pending = this.pending[slot]!;
    this.updateSlot(slot, current => ({ ...current, status: 'saving', error: '', hasPendingSave: true }));
    try {
      const routine = await this.dependencies.saveRevision(slot, pending.revisionId, pending.body);
      if (lifecycle !== this.lifecycle) return;
      delete this.pending[slot];
      this.updateSlot(slot, () => ({
        routine,
        draft: draftFrom(routine),
        expectedRevisionId: routine.id,
        status: 'ready',
        error: '',
        dirty: false,
        hasPendingSave: false,
      }));
    } catch (cause) {
      if (lifecycle !== this.lifecycle) return;
      const conflict = typeof cause === 'object' && cause !== null && 'status' in cause
        && cause.status === 409;
      this.updateSlot(slot, current => ({
        ...current,
        status: conflict ? 'conflict' : 'error',
        error: conflict
          ? 'This routine changed after you loaded it. Reload the assignments before editing again.'
          : 'The routine could not be saved. Retry to safely send the same revision.',
        hasPendingSave: true,
      }));
    }
  }
}

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

/**
 * The single version number a quick reply can honestly say "v{n}" about. Morning and evening are versioned
 * independently, so this only resolves when every currently-active slot agrees on one version — one assigned
 * slot, or two assigned slots at the same version. Anything else (nothing assigned, or slots at different
 * versions) is genuinely ambiguous and returns null so the caller omits the chip rather than guessing.
 */
export function activeRoutineVersion(state: RoutineCareState): number | null {
  const versions = (['morning', 'evening'] as const)
    .map(slot => state.slots[slot].routine)
    .filter((routine): routine is RoutineRevision => routine !== null && routine.isActive)
    .map(routine => routine.version);
  const unique = [...new Set(versions)];
  return unique.length === 1 ? unique[0] : null;
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

function validateDraft(draft: RoutineDraft): string {
  const name = draft.name.trim();
  if (!name) return 'Enter a routine name before saving.';
  if (name.length > 120) return 'Routine names must be 120 characters or fewer.';
  if (draft.steps.length > 20) return 'A routine can contain at most 20 steps.';
  if (draft.isActive && draft.steps.length === 0) return 'An active routine requires at least one step.';
  for (const step of draft.steps) {
    if (!step.title.trim()) return 'Each routine step needs a title.';
    if (step.title.trim().length > 120) return 'Step titles must be 120 characters or fewer.';
    if (step.instructions.length > 2000) return 'Step instructions must be 2,000 characters or fewer.';
  }
  return '';
}
