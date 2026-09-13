'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PatientCheckIns from '@/components/care-support/PatientCheckIns';
import PatientRoutineCare from '@/components/patients/PatientRoutineCare';
import PatientPhotoHistory from '@/components/patients/PatientPhotoHistory';
import { Button } from '@/components/ui/button';
import { useClinicalAPI } from '@/lib/auth';
import { patientListContext, patientListQuery } from '@/lib/patient-navigation';
import type { User } from '@/types/api';
function Workspace() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const context = patientListContext(params);
  const api = useClinicalAPI();
  const [patient, setPatient] = useState<User | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let current = true; setPatient(null); setFailed(false); setDirty(false);
    void api.getPatient(id).then(value => { if (current) setPatient(value); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [api, id, attempt]);
  useEffect(() => {
    if (!dirty) return;
    // Workspace links use document navigation so Back also invokes this guard.
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  return <DashboardLayout title={patient ? `Patient · ${patient.name || 'Unnamed patient'}` : 'Patient workspace'}><div className="portal-page">
    <Button variant="link" className="px-0" asChild><a href={'/patients?' + patientListQuery(context.page, context.search)}><ArrowLeft aria-hidden />Back to patients</a></Button>
    {failed ? <div role="alert" className="space-y-4"><h1 className="text-2xl font-semibold">Patient unavailable</h1><p>This patient could not be opened. Check your connection and current assignment.</p><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div> : !patient ? <p role="status">Opening patient…</p> : <>
      <header className="space-y-3 border-b pb-6"><h1 className="editorial-title break-words text-4xl">{patient.name || 'Unnamed patient'}</h1><p className="text-muted-foreground">Shared care record</p></header>
      <PatientPhotoHistory key={'photos-' + id} patientId={id} />
      <PatientCheckIns key={'check-ins-' + id} patientId={id} />
      <PatientRoutineCare key={'routines-' + id} patientId={id} onDirtyChange={setDirty} />
    </>}
  </div></DashboardLayout>;
}
export default function PatientWorkspacePage() {
  return <Suspense fallback={<p className="p-8" role="status">Opening patient…</p>}><Workspace /></Suspense>;
}
