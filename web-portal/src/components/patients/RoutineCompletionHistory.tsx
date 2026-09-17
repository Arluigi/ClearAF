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
