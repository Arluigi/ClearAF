'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
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
  Plus,
  Eye,
  Edit,
  FileText,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Pill,
  Users,
  Activity
} from 'lucide-react';
import { Prescription, User } from '@/types/api';
import { useAuth } from '@/lib/auth';
import { useClinicalAPI } from '@/lib/auth';

// Common dermatology medications for quick selection
const commonMedications = [
  { name: 'Tretinoin 0.025% cream', category: 'Retinoid' },
  { name: 'Tretinoin 0.05% cream', category: 'Retinoid' },
  { name: 'Adapalene 0.1% gel', category: 'Retinoid' },
  { name: 'Benzoyl peroxide 2.5% gel', category: 'Antibacterial' },
  { name: 'Benzoyl peroxide 5% gel', category: 'Antibacterial' },
  { name: 'Salicylic acid 2% cleanser', category: 'Exfoliant' },
  { name: 'Niacinamide 5% serum', category: 'Anti-inflammatory' },
  { name: 'Hydrocortisone 1% cream', category: 'Corticosteroid' },
  { name: 'Clindamycin 1% gel', category: 'Antibiotic' },
  { name: 'Azelaic acid 20% cream', category: 'Anti-inflammatory' }
];

export default function PrescriptionsPage() {
  const apiService = useClinicalAPI();
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewPrescriptionDialog, setShowNewPrescriptionDialog] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);

  // Fetch prescriptions and patients
  const fetchData = async () => {
    try {

      setLoading(true);
      setError('');

      const [prescriptionsResponse, patientsResponse] = await Promise.all([
        apiService.getPrescriptions(1, 50),
        apiService.getPatients(1, 50)
      ]);



      setPrescriptions(prescriptionsResponse.data || []);
      setPatients(patientsResponse.data || []);

    } catch (error) {

      setError('Failed to load prescriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const getPrescriptionStatus = (prescription: Prescription) => {
    if (!prescription.isActive) return 'expired';

    const prescribedDate = new Date(prescription.prescribedDate);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - prescribedDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check if expired
    if (prescription.expiryDate && new Date(prescription.expiryDate) < now) {
      return 'expired';
    }

    if (daysDiff < 7) return 'new';
    if (daysDiff < 30) return 'active';
    return 'completed';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-clearaf-blue text-white';
      case 'active':
        return 'bg-clearaf-green text-white';
      case 'completed':
        return 'bg-clearaf-purple text-white';
      case 'expired':
        return 'bg-clearaf-red text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'new':
        return 'New';
      case 'active':
        return 'Active';
      case 'completed':
        return 'Completed';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  const filteredPrescriptions = (prescriptions || []).filter(prescription => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
                         prescription.patient?.name?.toLowerCase().includes(searchLower) ||
                         prescription.medicationName?.toLowerCase().includes(searchLower) ||
                         prescription.instructions?.toLowerCase().includes(searchLower);
    const prescriptionStatus = getPrescriptionStatus(prescription);
    const matchesStatus = statusFilter === 'all' || prescriptionStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: prescriptions?.length || 0,
    new: (prescriptions || []).filter(p => getPrescriptionStatus(p) === 'new').length,
    active: (prescriptions || []).filter(p => getPrescriptionStatus(p) === 'active').length,
    completed: (prescriptions || []).filter(p => getPrescriptionStatus(p) === 'completed').length,
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <DashboardLayout title="Prescriptions">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Prescription Management</h1>
            <p className="text-muted-foreground">
              Manage patient prescriptions and treatment plans
            </p>
          </div>
          <Dialog open={showNewPrescriptionDialog} onOpenChange={setShowNewPrescriptionDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Prescription
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <NewPrescriptionDialog
                onClose={() => setShowNewPrescriptionDialog(false)}
                patients={patients}
                onPrescriptionCreated={fetchData}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-clearaf-purple/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Prescriptions</CardTitle>
              <Pill className="h-4 w-4 text-clearaf-purple" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">All time prescriptions</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-blue/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Prescriptions</CardTitle>
              <FileText className="h-4 w-4 text-clearaf-blue" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.new}</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-green/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Treatments</CardTitle>
              <Activity className="h-4 w-4 text-clearaf-green" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
              <p className="text-xs text-muted-foreground">Currently ongoing</p>
            </CardContent>
          </Card>

          <Card className="border-clearaf-teal/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-clearaf-teal" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">Finished treatments</p>
            </CardContent>
          </Card>
        </div>

        {/* Prescriptions List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Prescription History</CardTitle>
                <CardDescription>
                  Track and manage all patient prescriptions
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search prescriptions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading prescriptions...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : filteredPrescriptions.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Pill className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No prescriptions found</p>
                </div>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Medication</TableHead>
                      <TableHead>Dosage</TableHead>
                      <TableHead>Refills</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prescribed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPrescriptions.map((prescription) => {
                      const status = getPrescriptionStatus(prescription);
                      return (
                        <TableRow key={prescription.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">

                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {prescription.patient?.name?.split(' ').map(n => n[0]).join('') || 'P'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{prescription.patient?.name || 'Unknown Patient'}</p>
                                <p className="text-xs text-muted-foreground">{prescription.patient?.skinType} skin</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs">
                              <p className="text-sm truncate font-medium">
                                {prescription.medicationName}
                              </p>
                              {prescription.relatedProduct && (
                                <p className="text-xs text-muted-foreground">
                                  {prescription.relatedProduct.brand}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {prescription.dosage}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Pill className="h-3 w-3 text-muted-foreground" />
                              {prescription.refillsRemaining} left
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getStatusColor(status)}`}>
                              {getStatusText(status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(prescription.prescribedDate)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => setSelectedPrescription(prescription)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  {selectedPrescription && (
                                    <PrescriptionDetailDialog prescription={selectedPrescription} />
                                  )}
                                </DialogContent>
                              </Dialog>
                              <Button variant="ghost" size="sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// New Prescription Dialog Component
function NewPrescriptionDialog({
  onClose,
  patients,
  onPrescriptionCreated
}: {
  onClose: () => void;
  patients: User[];
  onPrescriptionCreated: () => void;
}) {
  const apiService = useClinicalAPI();
  const [formData, setFormData] = useState({
    patientId: '',
    medicationName: '',
    dosage: '',
    instructions: '',
    expiryDate: '',
    refillsRemaining: 0,
    pharmacy: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.patientId || !formData.medicationName || !formData.dosage || !formData.instructions) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError('');



      const prescriptionData: Parameters<typeof apiService.createPrescription>[0] = {
        patientId: formData.patientId,
        medicationName: formData.medicationName,
        dosage: formData.dosage,
        instructions: formData.instructions,
        refillsRemaining: formData.refillsRemaining
      };

      // Only include optional fields if they have values
      if (formData.expiryDate) {
        prescriptionData.expiryDate = new Date(formData.expiryDate).toISOString();
      }
      if (formData.pharmacy) {
        prescriptionData.pharmacy = formData.pharmacy;
      }

      await apiService.createPrescription(prescriptionData);


      // Refresh the data and close dialog
      await onPrescriptionCreated();
      onClose();
    } catch (error) {

      setError(error instanceof Error ? error.message : 'Failed to create prescription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New Prescription</DialogTitle>
        <DialogDescription>
          Create a detailed prescription for your patient
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6 mt-4">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="patient">Patient *</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map(patient => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name} ({patient.skinType} skin)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refills">Refills Remaining</Label>
            <Input
              type="number"
              min="0"
              value={formData.refillsRemaining}
              onChange={(e) => setFormData(prev => ({ ...prev, refillsRemaining: parseInt(e.target.value) || 0 }))}
              placeholder="Number of refills"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="medicationName">Medication Name *</Label>
            <Input
              value={formData.medicationName}
              onChange={(e) => setFormData(prev => ({ ...prev, medicationName: e.target.value }))}
              placeholder="e.g., Tretinoin 0.025% cream"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dosage">Dosage *</Label>
            <Input
              value={formData.dosage}
              onChange={(e) => setFormData(prev => ({ ...prev, dosage: e.target.value }))}
              placeholder="e.g., Apply once daily"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expiryDate">Expiry Date</Label>
            <Input
              type="date"
              value={formData.expiryDate}
              onChange={(e) => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pharmacy">Pharmacy</Label>
            <Input
              value={formData.pharmacy}
              onChange={(e) => setFormData(prev => ({ ...prev, pharmacy: e.target.value }))}
              placeholder="e.g., CVS Pharmacy"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructions">Usage Instructions *</Label>
          <Textarea
            placeholder="Detailed instructions for the patient..."
            value={formData.instructions}
            onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
            className="min-h-24"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1" disabled={loading}>
            <Pill className="h-4 w-4 mr-2" />
            {loading ? 'Creating...' : 'Create Prescription'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}

// Prescription Detail Dialog Component
function PrescriptionDetailDialog({ prescription }: { prescription: Prescription }) {
  const getPrescriptionStatus = (prescription: Prescription) => {
    if (!prescription.isActive) return 'expired';

    const prescribedDate = new Date(prescription.prescribedDate);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - prescribedDate.getTime()) / (1000 * 60 * 60 * 24));

    if (prescription.expiryDate && new Date(prescription.expiryDate) < now) {
      return 'expired';
    }

    if (daysDiff < 7) return 'new';
    if (daysDiff < 30) return 'active';
    return 'completed';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-clearaf-blue text-white';
      case 'active': return 'bg-clearaf-green text-white';
      case 'completed': return 'bg-clearaf-purple text-white';
      case 'expired': return 'bg-clearaf-red text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const status = getPrescriptionStatus(prescription);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <Pill className="h-6 w-6 text-primary" />
          Prescription Details
        </DialogTitle>
        <DialogDescription>
          Complete prescription information for {prescription.patient?.name}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 mt-6">
        {/* Patient Info */}
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
          <Avatar className="h-12 w-12">

            <AvatarFallback className="bg-primary/10 text-primary">
              {prescription.patient?.name?.split(' ').map(n => n[0]).join('') || 'P'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold">{prescription.patient?.name || 'Unknown Patient'}</h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{prescription.patient?.skinType} skin</span>
              <span>•</span>
              <span>Score: {prescription.patient?.currentSkinScore || 'N/A'}</span>
              <Badge className={`ml-auto ${getStatusColor(status)}`}>
                {status === 'new' ? 'New' : status === 'active' ? 'Active' : 'Completed'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Prescription Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Pill className="h-4 w-4" />
                Medication & Dosage
              </h4>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium">{prescription.medicationName}</p>
                <p className="text-sm text-muted-foreground mt-1">{prescription.dosage}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Refills & Pharmacy
              </h4>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm">{prescription.refillsRemaining} refills remaining</p>
                {prescription.pharmacy && (
                  <p className="text-sm text-muted-foreground mt-1">Pharmacy: {prescription.pharmacy}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Usage Instructions
              </h4>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{prescription.instructions}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Prescription Info
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prescribed:</span>
                  <span>{new Date(prescription.prescribedDate).toLocaleDateString()}</span>
                </div>
                {prescription.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires:</span>
                    <span>{new Date(prescription.expiryDate).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{prescription.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span>{new Date(prescription.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1">
            <Edit className="h-4 w-4 mr-2" />
            Edit Prescription
          </Button>
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Print/Export
          </Button>
        </div>
      </div>
    </>
  );
}
