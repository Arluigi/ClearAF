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
