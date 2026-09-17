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
