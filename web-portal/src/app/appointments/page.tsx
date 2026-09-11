'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Filter,
  Video,
  Phone,
  MessageCircle,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Users,
  Activity
} from 'lucide-react';
import { Appointment } from '@/types/api';
import { useClinicalAPI } from '@/lib/auth';

export default function AppointmentsPage() {
  const apiService = useClinicalAPI();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [showNewAppointmentDialog, setShowNewAppointmentDialog] = useState(false);

  // Fetch appointments from API
  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await apiService.getAppointments(1, 50, statusFilter, selectedDate.toISOString().split('T')[0]);
      setAppointments(response.data);
    } catch (error) {

      setError('Failed to load appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate, statusFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-clearaf-blue text-white';
      case 'in-progress':
        return 'bg-clearaf-orange text-white';
      case 'completed':
        return 'bg-clearaf-green text-white';
      case 'cancelled':
        return 'bg-clearaf-red text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled';
      case 'in-progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'consultation':
        return <Users className="h-4 w-4" />;
      case 'follow-up':
        return <Activity className="h-4 w-4" />;
      case 'emergency':
        return <Phone className="h-4 w-4" />;
      default:
        return <CalendarIcon className="h-4 w-4" />;
    }
  };

  const filteredAppointments = (appointments || []).filter(appointment => {
    const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
    const matchesType = typeFilter === 'all' || appointment.type === typeFilter;
    return matchesStatus && matchesType;
  });

  const todaysAppointments = (appointments || []).filter(appointment => {
    const appointmentDate = new Date(appointment.scheduledDate);
    const today = new Date();
    return appointmentDate.toDateString() === today.toDateString();
  });

  const stats = {
    today: todaysAppointments.length,
    scheduled: (appointments || []).filter(a => a.status === 'scheduled').length,
    completed: (appointments || []).filter(a => a.status === 'completed').length,
    inProgress: (appointments || []).filter(a => a.status === 'in-progress').length,
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <DashboardLayout title="Appointments">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Appointment Calendar</h1>
            <p className="text-muted-foreground">
              Manage your patient appointments and consultations
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}>
              {viewMode === 'calendar' ? 'List View' : 'Calendar View'}
            </Button>
            <Dialog open={showNewAppointmentDialog} onOpenChange={setShowNewAppointmentDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Appointment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <NewAppointmentDialog onClose={() => setShowNewAppointmentDialog(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-clearaf-teal/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Appointments</CardTitle>
              <CalendarIcon className="h-4 w-4 text-clearaf-teal" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-xs text-muted-foreground">Next: {todaysAppointments[0] ? formatTime(todaysAppointments[0].scheduledDate) : 'None'}</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-blue/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-clearaf-blue" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scheduled}</div>
              <p className="text-xs text-muted-foreground">Upcoming appointments</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-orange/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Activity className="h-4 w-4 text-clearaf-orange" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
              <p className="text-xs text-muted-foreground">Active sessions</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-green/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-clearaf-green" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">Finished appointments</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar/List View */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {viewMode === 'calendar' ? 'Calendar View' : 'Appointments List'}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === 'calendar'
                      ? 'Select a date to view appointments'
                      : 'All scheduled appointments'
                    }
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === 'calendar' ? (
                <div className="space-y-4">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    className="rounded-md border"
                  />
                  <div className="space-y-2">
                    <h4 className="font-medium">
                      Appointments for {selectedDate.toLocaleDateString()}
                    </h4>
                    {filteredAppointments
                      .filter(apt => new Date(apt.scheduledDate).toDateString() === selectedDate.toDateString())
                      .map(appointment => (
                        <AppointmentCard key={appointment.id} appointment={appointment} />
                      ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAppointments.map(appointment => (
                    <AppointmentCard key={appointment.id} appointment={appointment} showDate />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Schedule</CardTitle>
              <CardDescription>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {todaysAppointments.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No appointments scheduled for today
                </p>
              ) : (
                todaysAppointments.map(appointment => (
                  <div key={appointment.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">

                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {appointment.patient?.name?.split(' ').map(n => n[0]).join('') || 'P'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{appointment.patient?.name}</p>
                        <p className="text-xs text-muted-foreground">{appointment.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-primary">{formatTime(appointment.scheduledDate)}</p>
                      <Badge className={`text-xs ${getStatusColor(appointment.status)}`}>
                        {getStatusText(appointment.status)}
                      </Badge>
                    </div>
                  </div>
                ))
              )}

              {todaysAppointments.length > 0 && (
                <div className="pt-4 border-t">
                  <Button variant="outline" className="w-full">
                    <Video className="h-4 w-4 mr-2" />
                    Start Video Call
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Appointment Card Component
function AppointmentCard({ appointment, showDate = false }: { appointment: Appointment, showDate?: boolean }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-clearaf-blue text-white';
      case 'in-progress': return 'bg-clearaf-orange text-white';
      case 'completed': return 'bg-clearaf-green text-white';
      case 'cancelled': return 'bg-clearaf-red text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Scheduled';
      case 'in-progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'consultation': return <Users className="h-4 w-4" />;
      case 'follow-up': return <Activity className="h-4 w-4" />;
      case 'emergency': return <Phone className="h-4 w-4" />;
      default: return <CalendarIcon className="h-4 w-4" />;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-border transition-colors">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">

          <AvatarFallback className="bg-primary/10 text-primary">
            {appointment.patient?.name?.split(' ').map(n => n[0]).join('') || 'P'}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{appointment.patient?.name || 'Unknown Patient'}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {getTypeIcon(appointment.type)}
            <span className="capitalize">{appointment.type}</span>
            <span>•</span>
            <span>{appointment.duration} min</span>
            {showDate && (
              <>
                <span>•</span>
                <span>{formatDate(appointment.scheduledDate)}</span>
              </>
            )}
          </div>
          {appointment.notes && (
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs">
              {appointment.notes}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium">{formatTime(appointment.scheduledDate)}</p>
          <Badge className={`text-xs ${getStatusColor(appointment.status)}`}>
            {getStatusText(appointment.status)}
          </Badge>
        </div>

        <div className="flex gap-1">
          <Button variant="ghost" size="sm">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <MessageCircle className="h-4 w-4" />
          </Button>
          {appointment.status === 'scheduled' && (
            <Button variant="ghost" size="sm">
              <Video className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// New Appointment Dialog Component
function NewAppointmentDialog({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    patientId: '',
    date: '',
    time: '',
    duration: '30',
    type: 'consultation',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Create appointment logic

    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Schedule New Appointment</DialogTitle>
        <DialogDescription>
          Create a new appointment with a patient
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="patient">Patient</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select patient" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Sarah Johnson</SelectItem>
                <SelectItem value="2">Michael Brown</SelectItem>
                <SelectItem value="3">Emma Davis</SelectItem>
                <SelectItem value="4">James Wilson</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Appointment Type</Label>
            <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consultation">Consultation</SelectItem>
                <SelectItem value="follow-up">Follow-up</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Select value={formData.duration} onValueChange={(value) => setFormData(prev => ({ ...prev, duration: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            placeholder="Additional notes for this appointment..."
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">
            <CalendarIcon className="h-4 w-4 mr-2" />
            Schedule Appointment
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
