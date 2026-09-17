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
