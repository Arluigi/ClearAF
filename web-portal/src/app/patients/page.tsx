'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Search,
  Filter,
  Plus,
  Eye,
  MessageCircle,
  Calendar,
  Loader2,
  Users,
  TrendingUp,
  Activity,
  Camera,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { User, Photo } from '@/types/api';
import { apiService } from '@/lib/api';

export default function PatientsPage() {
  const [patients, setPatients] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [skinTypeFilter, setSkinTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPatient, setSelectedPatient] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await apiService.getPatients(page, 20, searchQuery);
      setPatients(response.data);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch patients:', error);
      setError('Failed to load patients. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [page, searchQuery]);

  const getPatientStatus = (patient: User) => {
    if (!patient.currentSkinScore) return 'new';
    if (patient.currentSkinScore >= 85) return 'excellent';
    if (patient.currentSkinScore >= 70) return 'good';
    if (patient.currentSkinScore >= 50) return 'fair';
    return 'needs_attention';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'bg-clearaf-green text-white';
      case 'good':
        return 'bg-clearaf-blue text-white';
      case 'fair':
        return 'bg-clearaf-orange text-white';
      case 'needs_attention':
        return 'bg-clearaf-red text-white';
      case 'new':
        return 'bg-clearaf-purple text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good Progress';
      case 'fair':
        return 'Stable';
      case 'needs_attention':
        return 'Needs Attention';
      case 'new':
        return 'New Patient';
      default:
        return 'Unknown';
    }
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         patient.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSkinType = skinTypeFilter === 'all' || patient.skinType === skinTypeFilter;
    const patientStatus = getPatientStatus(patient);
    const matchesStatus = statusFilter === 'all' || patientStatus === statusFilter;
    
    return matchesSearch && matchesSkinType && matchesStatus;
  });

  const stats = {
    total: patients.length,
    new: patients.filter(p => getPatientStatus(p) === 'new').length,
    excellent: patients.filter(p => getPatientStatus(p) === 'excellent').length,
    needsAttention: patients.filter(p => getPatientStatus(p) === 'needs_attention').length,
  };

  return (
    <DashboardLayout title="Patient Management">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Patient Management</h1>
            <p className="text-muted-foreground">
              Manage your patients registered through the Clear AF mobile app
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add New Patient
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-clearaf-purple/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-clearaf-purple" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Registered via mobile app</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-teal/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Patients</CardTitle>
              <Activity className="h-4 w-4 text-clearaf-teal" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.new}</div>
              <p className="text-xs text-muted-foreground">Need initial assessment</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-green/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Excellent Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-clearaf-green" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.excellent}</div>
              <p className="text-xs text-muted-foreground">Score 85+</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-red/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
              <Activity className="h-4 w-4 text-clearaf-red" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.needsAttention}</div>
              <p className="text-xs text-muted-foreground">Requires follow-up</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Directory</CardTitle>
            <CardDescription>
              Search and filter patients from your Clear AF mobile app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search patients by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={skinTypeFilter} onValueChange={setSkinTypeFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Skin Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Skin Types</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Dry">Dry</SelectItem>
                    <SelectItem value="Oily">Oily</SelectItem>
                    <SelectItem value="Combination">Combination</SelectItem>
                    <SelectItem value="Sensitive">Sensitive</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New Patients</SelectItem>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good Progress</SelectItem>
                    <SelectItem value="fair">Stable</SelectItem>
                    <SelectItem value="needs_attention">Needs Attention</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Patient Table */}
            <div className="rounded-md border">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading patients...</span>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-12 text-destructive">
                  <span>{error}</span>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <span>No patients found matching your criteria</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Skin Type</TableHead>
                      <TableHead>Current Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.map((patient) => {
                      const status = getPatientStatus(patient);
                      return (
                        <TableRow key={patient.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage 
                                  src={patient.name ? `https://api.dicebear.com/7.x/initials/svg?seed=${patient.name}` : undefined} 
                                />
                                <AvatarFallback className="bg-primary/10 text-primary border border-primary/20">
                                  {patient.name ? patient.name.split(' ').map(n => n[0]).join('').toUpperCase() : patient.email[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{patient.name || 'Unnamed User'}</p>
                                <p className="text-sm text-muted-foreground">{patient.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{patient.skinType || 'Not specified'}</Badge>
                          </TableCell>
                          <TableCell>
                            {patient.currentSkinScore ? (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{patient.currentSkinScore}</span>
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-clearaf-green rounded-full transition-all" 
                                    style={{ width: `${patient.currentSkinScore}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">No data</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getStatusColor(status)}`}>
                              {getStatusText(status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(patient.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(patient)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-muted-foreground/50">
                                  <PatientDetailDialog patient={patient} />
                                </DialogContent>
                              </Dialog>
                              
                              <Button variant="ghost" size="sm">
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              
                              <Button variant="ghost" size="sm">
                                <Calendar className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, patients.length)} of {patients.length} patients
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// Patient Detail Dialog Component
function PatientDetailDialog({ patient }: { patient: User }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [photoTimeline, setPhotoTimeline] = useState<any>(null);

  const status = patient.currentSkinScore ? 
    (patient.currentSkinScore >= 85 ? 'excellent' : 
     patient.currentSkinScore >= 70 ? 'good' : 
     patient.currentSkinScore >= 50 ? 'fair' : 'needs_attention') : 'new';

  const fetchPatientPhotos = async () => {
    if (photos.length > 0) return; // Already loaded
    
    try {
      setPhotosLoading(true);
      const [photosResponse, timelineResponse] = await Promise.all([
        apiService.getPatientPhotos(patient.id, 1, 10),
        apiService.getPhotoTimeline(patient.id, 30)
      ]);
      
      setPhotos(photosResponse.data);
      setPhotoTimeline(timelineResponse.timeline);
    } catch (error) {
      console.error('Failed to fetch patient photos:', error);
    } finally {
      setPhotosLoading(false);
    }
  };

  const handleTogglePhotos = () => {
    setShowPhotos(!showPhotos);
    if (!showPhotos && photos.length === 0) {
      fetchPatientPhotos();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'bg-clearaf-green text-white';
      case 'good': return 'bg-clearaf-blue text-white';
      case 'fair': return 'bg-clearaf-orange text-white';
      case 'needs_attention': return 'bg-clearaf-red text-white';
      case 'new': return 'bg-clearaf-purple text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage 
              src={patient.name ? `https://api.dicebear.com/7.x/initials/svg?seed=${patient.name}` : undefined} 
            />
            <AvatarFallback className="bg-primary/10 text-primary border border-primary/20">
              {patient.name ? patient.name.split(' ').map(n => n[0]).join('').toUpperCase() : patient.email[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-xl font-semibold">{patient.name || 'Unnamed User'}</h3>
            <p className="text-sm text-muted-foreground font-normal">{patient.email}</p>
          </div>
        </DialogTitle>
        <DialogDescription>
          Patient details and medical information from Clear AF mobile app
        </DialogDescription>
      </DialogHeader>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Basic Information</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skin Type:</span>
                <Badge variant="outline">{patient.skinType || 'Not specified'}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Score:</span>
                <span className="font-medium">{patient.currentSkinScore || 'No data'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Streak Count:</span>
                <span className="font-medium">{patient.streakCount || 0} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge className={getStatusColor(status)}>
                  {status === 'excellent' ? 'Excellent' : 
                   status === 'good' ? 'Good Progress' :
                   status === 'fair' ? 'Stable' :
                   status === 'needs_attention' ? 'Needs Attention' : 'New Patient'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Medical Information</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Allergies:</span>
                <p className="mt-1">{patient.allergies || 'None reported'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Current Medications:</span>
                <p className="mt-1">{patient.currentMedications || 'None reported'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Skin Concerns:</span>
                <p className="mt-1">{patient.skinConcerns || 'None specified'}</p>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Account Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Registered:</span>
                <span>{new Date(patient.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Onboarding:</span>
                <Badge variant={patient.onboardingCompleted ? "default" : "secondary"}>
                  {patient.onboardingCompleted ? 'Completed' : 'Pending'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Progress Section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Photo Progress
          </h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePhotos}
            className="flex items-center gap-2"
          >
            {showPhotos ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide Photos
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                View Photos
              </>
            )}
          </Button>
        </div>

        {showPhotos && (
          <div className="space-y-4">
            {photosLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading photos...</span>
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No photos uploaded yet</p>
                <p className="text-sm">Patient hasn't taken any progress photos</p>
              </div>
            ) : (
              <>
                {/* Photo Timeline Stats */}
                {photoTimeline && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-clearaf-blue">{photoTimeline.stats.totalPhotos}</div>
                      <div className="text-xs text-muted-foreground">Total Photos</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-clearaf-green">{photoTimeline.stats.averageScore}</div>
                      <div className="text-xs text-muted-foreground">Avg Score</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className={`text-2xl font-bold ${
                        photoTimeline.stats.trend === 'improving' ? 'text-clearaf-green' :
                        photoTimeline.stats.trend === 'declining' ? 'text-clearaf-red' : 
                        'text-clearaf-orange'
                      }`}>
                        {photoTimeline.stats.trend === 'improving' ? '↗' :
                         photoTimeline.stats.trend === 'declining' ? '↘' : '→'}
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{photoTimeline.stats.trend}</div>
                    </div>
                  </div>
                )}

                {/* Photo Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {photos.slice(0, 6).map((photo) => (
                    <div key={photo.id} className="relative group">
                      <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                        <img
                          src={photo.photoUrl}
                          alt={`Progress photo from ${new Date(photo.captureDate).toLocaleDateString()}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback for broken images
                            e.currentTarget.src = `https://api.dicebear.com/7.x/shapes/svg?seed=${photo.id}`;
                          }}
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <div className="text-white text-center">
                          <div className="text-lg font-bold">Score: {photo.skinScore}</div>
                          <div className="text-sm">{new Date(photo.captureDate).toLocaleDateString()}</div>
                          {photo.notes && (
                            <div className="text-xs mt-1 opacity-80">{photo.notes}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {photos.length > 6 && (
                  <div className="text-center">
                    <Button variant="outline" size="sm">
                      View All {photos.length} Photos
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="flex gap-2 mt-6">
        <Button className="flex-1">
          <MessageCircle className="h-4 w-4 mr-2" />
          Send Message
        </Button>
        <Button variant="outline" className="flex-1">
          <Calendar className="h-4 w-4 mr-2" />
          Schedule Appointment
        </Button>
      </div>
    </>
  );
}