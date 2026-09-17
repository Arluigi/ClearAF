'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Worklist from '@/components/patients/worklist/Worklist';

export default function PatientsPage() {
  return <DashboardLayout><Worklist /></DashboardLayout>;
}
