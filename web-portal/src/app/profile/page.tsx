'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import {
  User,
  Edit,
  Upload,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Award,
  BookOpen,
  Clock,
  Star,
  Camera,
  Save,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function ProfilePage() {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [profile, setProfile] = useState({
    name: user?.name || 'Dr. John Smith',
    email: user?.email || 'john.smith@clearafdermatology.com',
    phone: '(555) 123-4567',
    specialty: 'General Dermatology',
    licenseNumber: 'MD123456',
    deaNumber: 'AXXXXXXX',
    npiNumber: '1234567890',
    yearsOfExperience: 15,

    // Practice Info
    practiceName: 'Clear AF Dermatology',
    practiceAddress: '123 Medical Center Dr, Suite 100',
    practiceCity: 'San Francisco, CA 94101',

    // Professional Bio
    bio: 'Board-certified dermatologist with over 15 years of experience in treating acne, psoriasis, and skin cancer. Specialized in cosmetic dermatology and dermatologic surgery.',
    education: 'MD from Stanford University School of Medicine\nResidency at UCSF Dermatology Program\nBoard Certified by American Board of Dermatology',
    certifications: 'American Board of Dermatology\nAmerican Academy of Dermatology\nMohs Surgery Fellowship',

    // Avatar
    avatar: null as string | null,
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const handleProfileChange = <K extends keyof typeof profile>(field: K, value: (typeof profile)[K]) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveProfile = () => {

    setIsEditing(false);
    // TODO: Save to backend
  };

  const handleChangePassword = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    setShowChangePassword(false);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    // TODO: Change password via API
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfile(prev => ({ ...prev, avatar: e.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const stats = {
    totalPatients: 247,
    appointmentsThisWeek: 32,
    averageRating: 4.8,
    yearsActive: 15
  };

  return (
    <DashboardLayout title="Profile">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
            <p className="text-muted-foreground">
              Manage your professional profile and account settings
            </p>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveProfile}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Overview */}
          <Card className="lg:col-span-1">
            <CardHeader className="text-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile.avatar || undefined} referrerPolicy="no-referrer" />
                    <AvatarFallback className="bg-primary/10 text-primary border border-primary/20 text-xl">
                      {profile.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <label className="absolute bottom-0 right-0 p-1 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90">
                      <Camera className="h-4 w-4" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold">{profile.name}</h3>
                  <p className="text-muted-foreground">{profile.specialty}</p>
                  <Badge variant="outline" className="mt-2">
                    {profile.yearsOfExperience} years experience
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-clearaf-purple">{stats.totalPatients}</p>
                  <p className="text-xs text-muted-foreground">Total Patients</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-clearaf-teal">{stats.appointmentsThisWeek}</p>
                  <p className="text-xs text-muted-foreground">This Week</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-clearaf-green">{stats.averageRating}</p>
                  <p className="text-xs text-muted-foreground">Avg Rating</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-clearaf-blue">{stats.yearsActive}</p>
                  <p className="text-xs text-muted-foreground">Years Active</p>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{profile.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{profile.practiceCity}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Basic Information
                </CardTitle>
                <CardDescription>
                  Your personal and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    {isEditing ? (
                      <Input
                        id="name"
                        value={profile.name}
                        onChange={(e) => handleProfileChange('name', e.target.value)}
                      />
                    ) : (
                      <p className="p-2 text-sm">{profile.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    {isEditing ? (
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => handleProfileChange('email', e.target.value)}
                      />
                    ) : (
                      <p className="p-2 text-sm">{profile.email}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    {isEditing ? (
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => handleProfileChange('phone', e.target.value)}
                      />
                    ) : (
                      <p className="p-2 text-sm">{profile.phone}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Specialty</Label>
                    {isEditing ? (
                      <Select value={profile.specialty} onValueChange={(value) => handleProfileChange('specialty', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="General Dermatology">General Dermatology</SelectItem>
                          <SelectItem value="Dermatopathology">Dermatopathology</SelectItem>
                          <SelectItem value="Pediatric Dermatology">Pediatric Dermatology</SelectItem>
                          <SelectItem value="Cosmetic Dermatology">Cosmetic Dermatology</SelectItem>
                          <SelectItem value="Dermatologic Surgery">Dermatologic Surgery</SelectItem>
                          <SelectItem value="Mohs Surgery">Mohs Surgery</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="p-2 text-sm">{profile.specialty}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Professional Bio</Label>
                  {isEditing ? (
                    <Textarea
                      id="bio"
                      value={profile.bio}
                      onChange={(e) => handleProfileChange('bio', e.target.value)}
                      className="min-h-20"
                    />
                  ) : (
                    <p className="p-2 text-sm leading-relaxed">{profile.bio}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Professional Credentials */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Professional Credentials
                </CardTitle>
                <CardDescription>
                  Your licenses, certifications, and qualifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">Medical License</Label>
                    {isEditing ? (
                      <Input
                        id="licenseNumber"
                        value={profile.licenseNumber}
                        onChange={(e) => handleProfileChange('licenseNumber', e.target.value)}
                      />
                    ) : (
                      <p className="p-2 text-sm font-mono">{profile.licenseNumber}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npiNumber">NPI Number</Label>
                    {isEditing ? (
                      <Input
                        id="npiNumber"
                        value={profile.npiNumber}
                        onChange={(e) => handleProfileChange('npiNumber', e.target.value)}
                      />
                    ) : (
                      <p className="p-2 text-sm font-mono">{profile.npiNumber}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deaNumber">DEA Number</Label>
                    {isEditing ? (
                      <Input
                        id="deaNumber"
                        value={profile.deaNumber}
                        onChange={(e) => handleProfileChange('deaNumber', e.target.value)}
                      />
                    ) : (
                      <p className="p-2 text-sm font-mono">{profile.deaNumber}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="education">Education</Label>
                  {isEditing ? (
                    <Textarea
                      id="education"
                      value={profile.education}
                      onChange={(e) => handleProfileChange('education', e.target.value)}
                      className="min-h-20"
                    />
                  ) : (
                    <div className="p-2">
                      {profile.education.split('\n').map((line, index) => (
                        <p key={index} className="text-sm">{line}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="certifications">Certifications</Label>
                  {isEditing ? (
                    <Textarea
                      id="certifications"
                      value={profile.certifications}
                      onChange={(e) => handleProfileChange('certifications', e.target.value)}
                      className="min-h-20"
                    />
                  ) : (
                    <div className="p-2">
                      {profile.certifications.split('\n').map((line, index) => (
                        <p key={index} className="text-sm">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Practice Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Practice Information
                </CardTitle>
                <CardDescription>
                  Your practice details and location
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="practiceName">Practice Name</Label>
                  {isEditing ? (
                    <Input
                      id="practiceName"
                      value={profile.practiceName}
                      onChange={(e) => handleProfileChange('practiceName', e.target.value)}
                    />
                  ) : (
                    <p className="p-2 text-sm">{profile.practiceName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="practiceAddress">Address</Label>
                  {isEditing ? (
                    <Input
                      id="practiceAddress"
                      value={profile.practiceAddress}
                      onChange={(e) => handleProfileChange('practiceAddress', e.target.value)}
                    />
                  ) : (
                    <p className="p-2 text-sm">{profile.practiceAddress}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="practiceCity">City, State, ZIP</Label>
                  {isEditing ? (
                    <Input
                      id="practiceCity"
                      value={profile.practiceCity}
                      onChange={(e) => handleProfileChange('practiceCity', e.target.value)}
                    />
                  ) : (
                    <p className="p-2 text-sm">{profile.practiceCity}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Security
                </CardTitle>
                <CardDescription>
                  Manage your account security settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-muted-foreground">Last changed 30 days ago</p>
                    </div>
                    <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
                      <DialogTrigger asChild>
                        <Button variant="outline">Change Password</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Change Password</DialogTitle>
                          <DialogDescription>
                            Enter your current password and choose a new one
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="currentPassword">Current Password</Label>
                            <div className="relative">
                              <Input
                                id="currentPassword"
                                type={showPasswords.current ? 'text' : 'password'}
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                              >
                                {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="newPassword">New Password</Label>
                            <div className="relative">
                              <Input
                                id="newPassword"
                                type={showPasswords.new ? 'text' : 'password'}
                                value={passwordData.newPassword}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                              >
                                {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm New Password</Label>
                            <div className="relative">
                              <Input
                                id="confirmPassword"
                                type={showPasswords.confirm ? 'text' : 'password'}
                                value={passwordData.confirmPassword}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                              >
                                {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleChangePassword} className="flex-1">
                              Update Password
                            </Button>
                            <Button variant="outline" onClick={() => setShowChangePassword(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">Add extra security to your account</p>
                    </div>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
