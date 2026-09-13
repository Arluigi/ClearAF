'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PatientPhotoHistory from '@/components/patients/PatientPhotoHistory';
import PatientRoutineCare from '@/components/patients/PatientRoutineCare';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClinicalAPI } from '@/lib/auth';
import { PatientListController } from '@/lib/patient-list';
import type { User } from '@/types/api';
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }
function joined(patient: User) { const value = patient.joinDate || patient.createdAt; if (!value) return 'Not available'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not available'; }
function PatientDetail({ patient }: { patient: User }) { return <><DialogHeader><DialogTitle>{patient.name || 'Unnamed patient'}</DialogTitle><DialogDescription>Review this assigned patient&apos;s routines and shared photos. Joined {joined(patient)}.</DialogDescription></DialogHeader><div className="space-y-8"><PatientRoutineCare patientId={patient.id} /><PatientPhotoHistory patientId={patient.id} /></div></>; }
export default function PatientsPage() {
  const api = useClinicalAPI();
  const controller = useMemo(() => new PatientListController((page, search) => api.getPatients(page, 20, search)), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => { void controller.load(1); return () => controller.dispose(); }, [controller]);
  return <DashboardLayout title="Assigned patients"><div className="space-y-6 p-4 sm:p-6"><div><h2 className="text-3xl font-bold tracking-tight">Assigned patients</h2><p className="text-muted-foreground">Review routines and photos shared by patients assigned to you.</p></div>
    <Card><CardHeader><CardTitle>Patient list</CardTitle><CardDescription>{state.total} assigned {state.total === 1 ? 'patient' : 'patients'}</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search assigned patients by name" placeholder="Search by patient name" value={state.search} onChange={event => void controller.search(event.target.value)} className="pl-9" /></div>
      {state.status === 'loading' && <p role="status">Loading assigned patients…</p>}
      {state.status === 'error' && <div role="alert" className="space-y-3"><p>{state.error}</p><Button onClick={() => void controller.retry()}>Retry patient list</Button></div>}
      {state.status === 'ready' && state.patients.length === 0 && <p>No assigned patients match this name.</p>}
      {state.status === 'ready' && state.patients.length > 0 && <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{state.patients.map(patient => <TableRow key={patient.id}><TableCell><div className="flex items-center gap-3"><Avatar><AvatarFallback>{initials(patient.name || '')}</AvatarFallback></Avatar><span className="font-medium">{patient.name || 'Unnamed patient'}</span></div></TableCell><TableCell>{joined(patient)}</TableCell><TableCell className="text-right"><Dialog><DialogTrigger asChild><Button variant="outline" aria-label={`Open ${patient.name || 'patient'} review`}>Open</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><PatientDetail patient={patient} /></DialogContent></Dialog></TableCell></TableRow>)}</TableBody></Table></div>}
      {state.status === 'ready' && <nav aria-label="Patient pages" className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={state.page <= 1} onClick={() => void controller.goToPage(state.page - 1)}>Previous patients</Button><p role="status">Page {state.page} of {state.totalPages}</p><Button variant="outline" disabled={state.page >= state.totalPages} onClick={() => void controller.goToPage(state.page + 1)}>Next patients</Button></nav>}
    </CardContent></Card></div></DashboardLayout>;
}
