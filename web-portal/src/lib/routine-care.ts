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
