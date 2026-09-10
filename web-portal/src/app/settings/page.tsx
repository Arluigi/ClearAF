'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Calendar,
  Clock,
  Globe,
  Palette,
  Database,
  Mail,
  Phone,
  MapPin,
  Save,
  AlertTriangle
} from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    // General Settings
    practiceName: 'Clear AF Dermatology',
    practiceAddress: '123 Medical Center Dr, Suite 100',
    practiceCity: 'San Francisco, CA 94101',
    practicePhone: '(555) 123-4567',
    practiceEmail: 'contact@clearafdermatology.com',
    timezone: 'America/Los_Angeles',

    // Appointment Settings
    defaultAppointmentDuration: '30',
    appointmentBuffer: '15',
    maxBookingAdvance: '90',
    allowWeekendBookings: false,
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:00',

    // Notification Settings
    emailNotifications: true,
    smsNotifications: false,
    appointmentReminders: true,
    newPatientAlerts: true,
    prescriptionAlerts: true,
    reminderTiming: '24', // hours before

    // Privacy & Security
    twoFactorAuth: false,
    sessionTimeout: '30', // minutes
    dataRetention: '7', // years
    shareAnonymousData: false,

    // Communication Settings
    autoReplyEnabled: true,
    autoReplyMessage: 'Thank you for your message. I will respond within 24 hours during business days.',
    messageEncryption: true,
    allowPatientPhotos: true,

    // Interface Settings
    theme: 'dark',
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12',

    // Billing & Practice
    taxId: 'XX-XXXXXXX',
    licenseNumber: 'MD123456',
    deaNumber: 'AXXXXXXX',
    npiNumber: '1234567890',
  });

  const handleSettingChange = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {

    // TODO: Save settings to backend
  };

  return (
    <DashboardLayout title="Settings">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Configure your practice preferences and system settings
            </p>
          </div>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="communication">Communication</TabsTrigger>
            <TabsTrigger value="interface">Interface</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Practice Information
                </CardTitle>
                <CardDescription>
                  Basic information about your dermatology practice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="practiceName">Practice Name</Label>
                    <Input
                      id="practiceName"
                      value={settings.practiceName}
                      onChange={(e) => handleSettingChange('practiceName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practicePhone">Phone Number</Label>
                    <Input
                      id="practicePhone"
                      value={settings.practicePhone}
                      onChange={(e) => handleSettingChange('practicePhone', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="practiceAddress">Address</Label>
                  <Input
                    id="practiceAddress"
                    value={settings.practiceAddress}
                    onChange={(e) => handleSettingChange('practiceAddress', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="practiceCity">City, State, ZIP</Label>
                    <Input
                      id="practiceCity"
                      value={settings.practiceCity}
                      onChange={(e) => handleSettingChange('practiceCity', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practiceEmail">Email</Label>
                    <Input
                      id="practiceEmail"
                      type="email"
                      value={settings.practiceEmail}
                      onChange={(e) => handleSettingChange('practiceEmail', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={settings.timezone} onValueChange={(value) => handleSettingChange('timezone', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Professional Credentials
                </CardTitle>
                <CardDescription>
                  Your medical licenses and certifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">Medical License Number</Label>
                    <Input
                      id="licenseNumber"
                      value={settings.licenseNumber}
                      onChange={(e) => handleSettingChange('licenseNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npiNumber">NPI Number</Label>
                    <Input
                      id="npiNumber"
                      value={settings.npiNumber}
                      onChange={(e) => handleSettingChange('npiNumber', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="deaNumber">DEA Number</Label>
                    <Input
                      id="deaNumber"
                      value={settings.deaNumber}
                      onChange={(e) => handleSettingChange('deaNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Tax ID</Label>
                    <Input
                      id="taxId"
                      value={settings.taxId}
                      onChange={(e) => handleSettingChange('taxId', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appointment Settings */}
          <TabsContent value="appointments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Appointment Configuration
                </CardTitle>
                <CardDescription>
                  Set your appointment scheduling preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultDuration">Default Duration (minutes)</Label>
                    <Select value={settings.defaultAppointmentDuration} onValueChange={(value) => handleSettingChange('defaultAppointmentDuration', value)}>
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

                  <div className="space-y-2">
                    <Label htmlFor="buffer">Buffer Time (minutes)</Label>
                    <Select value={settings.appointmentBuffer} onValueChange={(value) => handleSettingChange('appointmentBuffer', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No buffer</SelectItem>
                        <SelectItem value="10">10 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="advance">Max Booking Advance (days)</Label>
                    <Input
                      id="advance"
                      type="number"
                      value={settings.maxBookingAdvance}
                      onChange={(e) => handleSettingChange('maxBookingAdvance', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Weekend Bookings</Label>
                      <p className="text-sm text-muted-foreground">Allow patients to book weekend appointments</p>
                    </div>
                    <Switch
                      checked={settings.allowWeekendBookings}
                      onCheckedChange={(checked) => handleSettingChange('allowWeekendBookings', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Working Hours
                </CardTitle>
                <CardDescription>
                  Set your available consultation hours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workStart">Working Hours Start</Label>
                    <Input
                      id="workStart"
                      type="time"
                      value={settings.workingHoursStart}
                      onChange={(e) => handleSettingChange('workingHoursStart', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workEnd">Working Hours End</Label>
                    <Input
                      id="workEnd"
                      type="time"
                      value={settings.workingHoursEnd}
                      onChange={(e) => handleSettingChange('workingHoursEnd', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lunchStart">Lunch Break Start</Label>
                    <Input
                      id="lunchStart"
                      type="time"
                      value={settings.lunchBreakStart}
                      onChange={(e) => handleSettingChange('lunchBreakStart', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lunchEnd">Lunch Break End</Label>
                    <Input
                      id="lunchEnd"
                      type="time"
                      value={settings.lunchBreakEnd}
                      onChange={(e) => handleSettingChange('lunchBreakEnd', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Configure how and when you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={settings.emailNotifications}
                      onCheckedChange={(checked) => handleSettingChange('emailNotifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>SMS Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via text message</p>
                    </div>
                    <Switch
                      checked={settings.smsNotifications}
                      onCheckedChange={(checked) => handleSettingChange('smsNotifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Appointment Reminders</Label>
                      <p className="text-sm text-muted-foreground">Get reminded about upcoming appointments</p>
                    </div>
                    <Switch
                      checked={settings.appointmentReminders}
                      onCheckedChange={(checked) => handleSettingChange('appointmentReminders', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>New Patient Alerts</Label>
                      <p className="text-sm text-muted-foreground">Notify when new patients register</p>
                    </div>
                    <Switch
                      checked={settings.newPatientAlerts}
                      onCheckedChange={(checked) => handleSettingChange('newPatientAlerts', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Prescription Alerts</Label>
                      <p className="text-sm text-muted-foreground">Notify about prescription renewals</p>
                    </div>
                    <Switch
                      checked={settings.prescriptionAlerts}
                      onCheckedChange={(checked) => handleSettingChange('prescriptionAlerts', checked)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reminderTiming">Reminder Timing</Label>
                  <Select value={settings.reminderTiming} onValueChange={(value) => handleSettingChange('reminderTiming', value)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour before</SelectItem>
                      <SelectItem value="2">2 hours before</SelectItem>
                      <SelectItem value="6">6 hours before</SelectItem>
                      <SelectItem value="24">24 hours before</SelectItem>
                      <SelectItem value="48">48 hours before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security & Privacy
                </CardTitle>
                <CardDescription>
                  Protect your account and patient data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">Add extra security to your account</p>
                    </div>
                    <Switch
                      checked={settings.twoFactorAuth}
                      onCheckedChange={(checked) => handleSettingChange('twoFactorAuth', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Share Anonymous Usage Data</Label>
                      <p className="text-sm text-muted-foreground">Help improve Clear AF with anonymous analytics</p>
                    </div>
                    <Switch
                      checked={settings.shareAnonymousData}
                      onCheckedChange={(checked) => handleSettingChange('shareAnonymousData', checked)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                    <Select value={settings.sessionTimeout} onValueChange={(value) => handleSettingChange('sessionTimeout', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataRetention">Data Retention (years)</Label>
                    <Select value={settings.dataRetention} onValueChange={(value) => handleSettingChange('dataRetention', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 years</SelectItem>
                        <SelectItem value="7">7 years</SelectItem>
                        <SelectItem value="10">10 years</SelectItem>
                        <SelectItem value="indefinite">Indefinite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Communication Settings */}
          <TabsContent value="communication" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Patient Communication
                </CardTitle>
                <CardDescription>
                  Configure how you communicate with patients
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Auto-Reply Messages</Label>
                      <p className="text-sm text-muted-foreground">Send automatic replies to patient messages</p>
                    </div>
                    <Switch
                      checked={settings.autoReplyEnabled}
                      onCheckedChange={(checked) => handleSettingChange('autoReplyEnabled', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Message Encryption</Label>
                      <p className="text-sm text-muted-foreground">Encrypt all patient communications</p>
                    </div>
                    <Switch
                      checked={settings.messageEncryption}
                      onCheckedChange={(checked) => handleSettingChange('messageEncryption', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Allow Patient Photos</Label>
                      <p className="text-sm text-muted-foreground">Let patients send photos in messages</p>
                    </div>
                    <Switch
                      checked={settings.allowPatientPhotos}
                      onCheckedChange={(checked) => handleSettingChange('allowPatientPhotos', checked)}
                    />
                  </div>
                </div>

                {settings.autoReplyEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="autoReplyMessage">Auto-Reply Message</Label>
                    <Textarea
                      id="autoReplyMessage"
                      value={settings.autoReplyMessage}
                      onChange={(e) => handleSettingChange('autoReplyMessage', e.target.value)}
                      placeholder="Enter your automatic reply message..."
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Interface Settings */}
          <TabsContent value="interface" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Interface Preferences
                </CardTitle>
                <CardDescription>
                  Customize your Clear AF experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="theme">Theme</Label>
                    <Select value={settings.theme} onValueChange={(value) => handleSettingChange('theme', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Select value={settings.language} onValueChange={(value) => handleSettingChange('language', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateFormat">Date Format</Label>
                    <Select value={settings.dateFormat} onValueChange={(value) => handleSettingChange('dateFormat', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeFormat">Time Format</Label>
                    <Select value={settings.timeFormat} onValueChange={(value) => handleSettingChange('timeFormat', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12-hour (AM/PM)</SelectItem>
                        <SelectItem value="24">24-hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
