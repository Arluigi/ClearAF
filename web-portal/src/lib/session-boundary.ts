export class SessionBoundary {
  private identity: string | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  snapshot = () => this.generation;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  accept(identity: string | null) {
    if (identity === this.identity) return;
    this.identity = identity;
    this.invalidate();
  }
  invalidate() { this.generation++; this.listeners.forEach(listener => listener()); }
  assert(generation: number) {
    if (generation !== this.generation) throw new Error('Your account changed. Please retry from the current account.');
  }
}
export function recoveryCallback(url: string): { kind: 'invalid' } | { kind: 'code'; code: string } {
  const parsed = new URL(url);
  if (parsed.hash || parsed.searchParams.has('error')) return { kind: 'invalid' };
  const code = parsed.searchParams.get('code');
  return code ? { kind: 'code', code } : { kind: 'invalid' };
}
