'use client';
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CompletionCalendar from '@/components/care-support/CompletionCalendar';
import PatientCheckIns from '@/components/care-support/PatientCheckIns';
import ConversationView from '@/components/messages/ConversationView';
import CareStatusCard from '@/components/patients/CareStatusCard';
import EnrollmentStatus from '@/components/patients/EnrollmentStatus';
import PatientPhotoHistory from '@/components/patients/PatientPhotoHistory';
import PatientRoutineCare from '@/components/patients/PatientRoutineCare';
import PatientUrgentReports from '@/components/patients/PatientUrgentReports';
import RoutineCompletionHistory from '@/components/patients/RoutineCompletionHistory';
import { useRoutineCare } from '@/components/patients/useRoutineCare';
import CareRail from '@/components/patients/workspace/CareRail';
import WorkspaceHeader from '@/components/patients/workspace/WorkspaceHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, useClinicalAPI } from '@/lib/auth';
import { messageReference } from '@/lib/assigned-messaging';
import { patientListContext, patientListQuery } from '@/lib/patient-navigation';
import { TAB_LABEL, WORKSPACE_TABS, sinceLabel, workspaceHref, workspaceTab, type WorkspaceTab } from '@/lib/workspace';
import type { User } from '@/types/api';

const ignoreConversation = () => {};

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const context = patientListContext(params);
  const listQuery = patientListQuery(context.page, context.search, context.filter);
  const tab = workspaceTab(params);
  const referenceType = params.get('referenceType'), referenceId = params.get('referenceId');
  const reference = useMemo(() => messageReference(referenceType, referenceId), [referenceType, referenceId]);
  const api = useClinicalAPI();
  const { user } = useAuth();
  const routine = useRoutineCare(id);
  const [patient, setPatient] = useState<User | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [careRefresh, setCareRefresh] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<WorkspaceTab>>(() => new Set([tab]));
  useEffect(() => { setVisited(current => (current.has(tab) ? current : new Set([...current, tab]))); }, [tab]);
  useEffect(() => {
    let current = true; setPatient(null); setFailed(false);
    void api.getPatient(id).then(value => { if (current) setPatient(value); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [api, id, attempt]);
  const dirty = Object.values(routine.state.slots).some(editor => editor.dirty || editor.hasPendingSave);
  useEffect(() => {
    if (!dirty) return;
    // Leaving the page warns. Switching tabs does not: visited tabs stay mounted, so drafts survive.
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  // Tabs are URL state: reload keeps the tab and Back steps through tabs.
  const openTab = useCallback((next: WorkspaceTab, extra?: Record<string, string>) => {
    window.history.pushState(null, '', workspaceHref(id, listQuery, next, extra));
  }, [id, listQuery]);
  const panel = (value: WorkspaceTab, content: ReactNode) => <TabsContent key={value} value={value} forceMount className="mt-6 data-[state=inactive]:hidden">{visited.has(value) && content}</TabsContent>;
  const name = patient?.name || 'Unnamed patient';

  return <DashboardLayout title={patient ? `Patient · ${name}` : 'Patient workspace'}><div className="portal-page">
    <Button variant="link" size="sm" className="px-0" asChild><a href={'/patients?' + patientListQuery(context.page, context.search, context.filter)}><ArrowLeft aria-hidden />Back to worklist</a></Button>
    {failed ? <div role="alert" className="space-y-3"><h1 className="editorial-title text-[32px]">Patient unavailable</h1><p className="max-w-prose text-ink-secondary">This patient could not be opened. Check your connection and current assignment.</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : !patient ? <p role="status" className="text-sm text-ink-secondary">Opening patient</p>
      : <>
        <WorkspaceHeader name={patient.name} since={sinceLabel(patient.joinDate ?? patient.createdAt)} onMessage={() => openTab('messages')}><EnrollmentStatus patientId={id} /></WorkspaceHeader>
        <PatientUrgentReports key={'urgent-' + id} patientId={id} />
        <Tabs value={tab} onValueChange={value => openTab(value as WorkspaceTab)} activationMode="manual">
          <TabsList variant="underline" aria-label="Patient record">{WORKSPACE_TABS.map(value => <TabsTrigger key={value} value={value}>{TAB_LABEL[value]}</TabsTrigger>)}</TabsList>
          {panel('photos', <PatientPhotoHistory key={'photos-' + id} patientId={id} patientName={patient.name} onCareDecision={() => setCareRefresh(value => value + 1)} rail={<CareRail patientId={id} routine={routine.state} onOpen={openTab} />} />)}
          {panel('routine', <PatientRoutineCare patientId={id} patientName={patient.name} controller={routine.controller} state={routine.state} onFeedback={revisionId => openTab('messages', { referenceType: 'routineRevision', referenceId: revisionId })} />)}
          {panel('check-ins', <PatientCheckIns key={'check-ins-' + id} patientId={id} patientName={patient.name} onReply={() => openTab('messages')} />)}
          {panel('messages', user ? <ConversationView key={'messages-' + id + '-' + user.id} patientId={id} clinicianId={user.id} initialReference={reference} onConversationChange={ignoreConversation} /> : null)}
          {panel('history', <div className="space-y-12">
            <CareStatusCard key={'care-' + id} patientId={id} refresh={careRefresh} />
            <CompletionCalendar key={'calendar-' + id} patientId={id} />
            <RoutineCompletionHistory controller={routine.controller} state={routine.state} />
          </div>)}
        </Tabs>
      </>}
  </div></DashboardLayout>;
}
export default function PatientWorkspacePage() {
  return <Suspense fallback={<p className="p-8" role="status">Opening patient</p>}><Workspace /></Suspense>;
}
