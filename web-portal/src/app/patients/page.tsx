'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import PhotoReviewQueue from '@/components/patients/PhotoReviewQueue';
import { Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClinicalAPI } from '@/lib/auth';
import { PatientListController } from '@/lib/patient-list';
import { patientListContext, patientListQuery } from '@/lib/patient-navigation';
import type { User } from '@/types/api';
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }
function joined(patient: User) { const value = patient.joinDate || patient.createdAt; if (!value) return 'Not available'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not available'; }
export default function PatientsPage() {
  const api = useClinicalAPI();
  const controller = useMemo(() => new PatientListController((page, search) => api.getPatients(page, 20, search)), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => {
    const restore = () => { const context = patientListContext(new URLSearchParams(window.location.search)); void controller.restore(context.page, context.search); };
    restore();
    window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('popstate', restore); controller.cancelPending(); };
  }, [controller]);
  useEffect(() => {
    if (state.status === 'ready') window.history.replaceState(null, '', '/patients?' + patientListQuery(state.page, state.search));
  }, [state.status, state.page, state.search]);
  return <DashboardLayout><div className="portal-page">
    <div className="space-y-2"><h1 className="text-2xl font-semibold">Assigned patients</h1><p className="max-w-prose text-muted-foreground">Review shared photos, assign routines, and follow patient-reported completions.</p></div>
    <PhotoReviewQueue context={patientListQuery(state.page, state.search)} />
    <section aria-label="Patient list" className="space-y-5">
      <div className="max-w-xl space-y-2"><Label htmlFor="patient-search">Search patients</Label><div className="relative"><Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="patient-search" aria-label="Search assigned patients by name" placeholder="Patient name" value={state.search} onChange={event => void controller.search(event.target.value)} className="bg-card pl-9" /></div></div>
      {state.status === 'loading' && <p role="status">Loading assigned patients…</p>}
      {state.status === 'error' && <div role="alert" className="space-y-3"><p>{state.error}</p><Button onClick={() => void controller.retry()}>Retry patient list</Button></div>}
      {state.status === 'ready' && <><p className="text-sm text-muted-foreground">{state.total} assigned {state.total === 1 ? 'patient' : 'patients'}{state.search ? ' matching this name' : ''}</p>
        {state.patients.length === 0 ? <p>{state.search ? 'No assigned patients match this name.' : 'Patients assigned to you will appear here.'}</p> : <div className="overflow-x-auto rounded-xl bg-card"><Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader><TableBody>{state.patients.map(patient => <TableRow key={patient.id}><TableCell><div className="flex items-center gap-3"><Avatar><AvatarFallback>{initials(patient.name || '')}</AvatarFallback></Avatar><span className="font-medium">{patient.name || 'Unnamed patient'}</span></div></TableCell><TableCell className="tabular-nums">{joined(patient)}</TableCell><TableCell className="text-right"><Button variant="outline" asChild><a href={`/patients/${encodeURIComponent(patient.id)}?${patientListQuery(state.page, state.search)}`} aria-label={`Open ${patient.name || 'patient'} review`}>Open patient</a></Button></TableCell></TableRow>)}</TableBody></Table></div>}
        <nav aria-label="Patient pages" className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={state.page <= 1} onClick={() => void controller.goToPage(state.page - 1)}>Previous patients</Button><p role="status" className="text-sm tabular-nums">Page {state.page} of {state.totalPages}</p><Button variant="outline" disabled={state.page >= state.totalPages} onClick={() => void controller.goToPage(state.page + 1)}>Next patients</Button></nav>
      </>}
    </section>
  </div></DashboardLayout>;
}
