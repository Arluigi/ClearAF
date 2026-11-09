'use client';
import { useCallback } from 'react';
import { useRead } from '@/components/care-support/shared';
import { useClinicalAPI } from '@/lib/auth';
import type { RoutineCareState } from '@/lib/routine-care';
import { Button } from '@/components/ui/button';
import { CareRailView } from './CareRailView';

export default function CareRail({ patientId, routine, onOpen }: { patientId: string; routine: RoutineCareState; onOpen: (tab: 'routine' | 'check-ins') => void }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => api.getPatientResponses(patientId, 1), [api, patientId]);
  const responses = useRead(fetch);
  return <div className="space-y-4"><CareRailView routine={routine} latest={responses.data?.data[0] ?? null} checkInStatus={responses.status} onRetry={responses.retry} onOpen={onOpen} /><Button variant="outline" size="sm" onClick={()=>onOpen('routine')}>Prescription sent records</Button></div>;
}
