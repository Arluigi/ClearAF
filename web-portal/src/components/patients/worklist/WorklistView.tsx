import * as React from 'react';
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
  // The link context follows the query that produced `current`, not the (possibly still-debouncing)
  // typed filter/search/page — the rows on screen and the links on them must always agree.
  const loadedQuery = current && state.query ? state.query : { filter: state.filter, page: state.page, search: state.search, localDate: '' };
  const context = patientListQuery(loadedQuery.page, loadedQuery.search, loadedQuery.filter);
  const empty = emptyCopy(state.filter, state.search);
  const totalPages = Math.max(1, current?.pagination.totalPages ?? 1);
  return (
    <div className="portal-page">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1 space-y-1">
          <p className="font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary">{longDate(now)}</p>
          <h1 className="editorial-title text-[34px] text-ink">Needs you today</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onRetry} disabled={busy}>Refresh</Button>
          {busy && <p className="text-xs text-ink-tertiary">Loading…</p>}
        </div>
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
            {current && current.data.length > 0 && <WorklistTable result={current} context={context} now={now} />}
            {current && current.data.length === 0 && (
              <div className="space-y-2 border-t border-rule py-8">
                <h2 className="editorial-title text-2xl text-ink">{empty.title}</h2>
                <p className="text-sm text-ink-secondary">{empty.body}</p>
                {empty.action === 'clear-search' && <Button variant="outline" size="sm" onClick={() => onSearch('')}>Clear search</Button>}
                {empty.action === 'show-all' && <Button variant="outline" size="sm" onClick={() => onFilter('all')}>Show all patients</Button>}
              </div>
            )}
            {/* A page past the end (e.g. reviewed away since it loaded) still needs its "Previous page"
                button even with zero rows on screen — the controller self-heals the page number, but
                this keeps the pager available in the meantime rather than trapping the clinician. */}
            {current && (current.data.length > 0 || state.page > 1) && (
              <nav aria-label="Worklist pages" className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" disabled={busy || state.page <= 1} onClick={() => onPage(state.page - 1)}>Previous page</Button>
                <p className="font-data text-[11px] tabular-nums text-ink-tertiary">{`PAGE ${current.pagination.page} / ${totalPages}`}</p>
                <Button variant="outline" size="sm" disabled={busy || state.page >= totalPages} onClick={() => onPage(state.page + 1)}>Next page</Button>
                <p className="ml-auto text-xs text-ink-tertiary">{SORT_NOTE[filter]}</p>
              </nav>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
