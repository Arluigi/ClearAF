'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Calendar,
  MessageCircle,
  TrendingUp,
  Clock,
  Activity,
  ArrowUpRight,
  Plus
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useClinicalAPI } from '@/lib/auth';
import { User, Appointment, DashboardStats } from '@/types/api';

export default function DashboardPage() {
  const apiService = useClinicalAPI();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPatients, setRecentPatients] = useState<User[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load dashboard data from API
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load dashboard stats
        const statsData = await apiService.getDashboardStats();
        setStats(statsData);
        setRecentPatients(statsData.recentPatients);
        setUpcomingAppointments(statsData.upcomingAppointments);
      } catch (err) {

        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'bg-clearaf-green text-white';
      case 'improving':
        return 'bg-clearaf-blue text-white';
      case 'stable':
        return 'bg-clearaf-teal text-white';
      case 'needs_attention':
        return 'bg-clearaf-orange text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'Excellent';
      case 'improving':
        return 'Improving';
      case 'stable':
        return 'Stable';
      case 'needs_attention':
        return 'Needs Attention';
      default:
        return 'Unknown';
    }
  };

  const getPatientStatus = (skinScore?: number) => {
    if (!skinScore) return 'unknown';
    if (skinScore >= 90) return 'excellent';
    if (skinScore >= 80) return 'improving';
    if (skinScore >= 70) return 'stable';
    return 'needs_attention';
  };

  const formatAppointmentTime = (scheduledAt: string) => {
    return new Date(scheduledAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDuration = (duration: number) => {
    return `${duration} min`;
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-destructive">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Dashboard">
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {user?.name ? user.name.split(' ')[0] : 'Doctor'}!
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your practice today, {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-clearaf-purple/20 hover:border-clearaf-purple/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-clearaf-purple" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalPatients || 0}</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                Active patients
              </p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-teal/20 hover:border-clearaf-teal/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Appointments Today</CardTitle>
              <Calendar className="h-4 w-4 text-clearaf-teal" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.appointmentsToday || 0}</div>
              <p className="text-xs text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-1" />
                Scheduled today
              </p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-blue/20 hover:border-clearaf-blue/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unread Messages</CardTitle>
              <MessageCircle className="h-4 w-4 text-clearaf-blue" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.unreadMessages || 0}</div>
              <p className="text-xs text-muted-foreground">
                <Activity className="inline h-3 w-3 mr-1" />
                Require response
              </p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-green/20 hover:border-clearaf-green/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Improvement</CardTitle>
              <TrendingUp className="h-4 w-4 text-clearaf-green" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.avgImprovement || 0}%</div>
              <p className="text-xs text-muted-foreground">
                <ArrowUpRight className="inline h-3 w-3 mr-1" />
                Patient improvement
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Patients */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Patients</CardTitle>
                  <CardDescription>
                    Latest patient activity and skin scores
                  </CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Patient
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Skin Type</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Visit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPatients.map((patient) => (
                    <TableRow key={patient.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">

                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {patient.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{patient.name}</p>
                            <p className="text-xs text-muted-foreground">{patient.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{patient.skinType || 'Not specified'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{patient.currentSkinScore || 'N/A'}</span>
                          {patient.currentSkinScore && (
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-clearaf-green rounded-full transition-all"
                                style={{ width: `${patient.currentSkinScore}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getStatusColor(getPatientStatus(patient.currentSkinScore))}`}>
                          {getStatusText(getPatientStatus(patient.currentSkinScore))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {patient.updatedAt ? new Date(patient.updatedAt).toLocaleDateString() : 'Not available'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Today's Appointments */}
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Appointments</CardTitle>
              <CardDescription>
                Your scheduled consultations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingAppointments.length > 0 ? upcomingAppointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{appointment.patient?.name || 'Unknown Patient'}</p>
                    <p className="text-xs text-muted-foreground">{appointment.type}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-medium text-primary">{formatAppointmentTime(appointment.scheduledDate)}</p>
                    <p className="text-xs text-muted-foreground">{formatDuration(appointment.duration)}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No appointments scheduled for today</p>
                </div>
              )}
              <Button variant="outline" className="w-full">
                <Calendar className="h-4 w-4 mr-2" />
                View All Appointments
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
