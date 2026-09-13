import type { RoutineStep } from "../types/api";
export interface Template {
  id: string;
  revisionId: string;
  version: number;
  name: string;
  steps: RoutineStep[];
  isActive: boolean;
  updatedAt: string;
}
export interface Question {
  id: string;
  prompt: string;
  type: "text" | "choice";
  required: boolean;
  options: { id: string; label: string }[];
}
export interface Form {
  id: string;
  userId: string;
  version: number;
  createdBy: string;
  createdAt: string;
  title: string;
  isActive: boolean;
  questions: Question[];
}
export type FormDraft = Pick<Form, "title" | "isActive" | "questions">;
export type TemplateDraft = Pick<Template, "name" | "steps" | "isActive">;
export interface CheckInResponse {
  id: string;
  userId: string;
  formId: string;
  submittedAt: string;
  receivedAt: string;
  answers: { questionId: string; text?: string; optionId?: string }[];
  form: Form;
}
export interface Month {
  month: string;
  days: { localDate: string; morning: number; evening: number }[];
}
class Observable<S> {
  constructor(protected state: S) {}
  private listeners = new Set<() => void>();
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  protected publish(state: S) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
}
export class LatestRead<T> extends Observable<{
  data: T | null;
  status: "loading" | "ready" | "error";
  error: string;
}> {
  private generation = 0;
  constructor() {
    super({ data: null, status: "loading", error: "" });
  }
  cancel() {
    this.generation++;
  }
  async load(fetch: () => Promise<T>) {
    const generation = ++this.generation;
    this.publish({ data: null, status: "loading", error: "" });
    try {
      const data = await fetch();
      if (generation === this.generation)
        this.publish({ data, status: "ready", error: "" });
    } catch {
      if (generation === this.generation)
        this.publish({
          data: null,
          status: "error",
          error: "Could not load this record. Check your connection and retry.",
        });
    }
  }
}
export class RevisionEditor<D extends object> extends Observable<{
  draft: D;
  dirty: boolean;
  savedVersion: number | null;
  status: "ready" | "saving" | "error" | "conflict";
  pending: boolean;
  error: string;
}> {
  private generation = 0;
  private expected: string | null = null;
  private attempt: {
    id: string;
    body: D & { expectedRevisionId: string | null };
  } | null = null;
  constructor(
    draft: D,
    private write: (
      id: string,
      body: D & { expectedRevisionId: string | null },
    ) => Promise<{ id: string; revisionId?: string; version?: number }>,
    private uuid = () => crypto.randomUUID(),
    expected: string | null = null,
  ) {
    super({
      draft: structuredClone(draft),
      dirty: false,
      savedVersion: null,
      status: "ready",
      pending: false,
      error: "",
    });
    this.expected = expected;
  }
  cancel() {
    this.generation++;
  }
  edit(draft: D) {
    if (this.attempt) return;
    this.publish({
      ...this.state,
      draft: structuredClone(draft),
      dirty: true,
      error: "",
    });
  }
  rebase(id: string | null) {
    if (this.state.status !== "conflict") return;
    this.expected = id;
    this.attempt = null;
    this.publish({
      ...this.state,
      status: "ready",
      pending: false,
      error:
        "Latest version loaded; your draft is retained. Review before saving.",
    });
  }
  async save() {
    if (
      this.state.status === "saving" ||
      this.state.status === "conflict" ||
      !this.state.dirty
    )
      return;
    const generation = this.generation;
    this.attempt ??= {
      id: this.uuid(),
      body: {
        ...structuredClone(this.state.draft),
        expectedRevisionId: this.expected,
      },
    };
    const attempt = this.attempt;
    this.publish({ ...this.state, status: "saving", pending: true, error: "" });
    try {
      const result = await this.write(attempt.id, attempt.body);
      if (generation !== this.generation) return;
      this.expected = result.revisionId ?? result.id;
      this.attempt = null;
      this.publish({
        ...this.state,
        dirty: false,
        savedVersion: result.version ?? null,
        pending: false,
        status: "ready",
        error: "",
      });
    } catch (error) {
      if (generation !== this.generation) return;
      const rejected =
        !!error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 400;
      if (rejected) this.attempt = null;
      const conflict =
        !!error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 409;
      this.publish({
        ...this.state,
        pending: !rejected,
        status: conflict ? "conflict" : "error",
        error: rejected
          ? "The server rejected these fields. Review your draft and save again."
          : conflict
            ? "This record changed. Load the latest version to review your retained draft."
            : "Save failed. Retry sends the same revision and contents.",
      });
    }
  }
}
