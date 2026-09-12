// API Types for Clear AF Web Portal
// Matching the existing backend schema

export interface User {
  id: string;
  name: string;
  email?: string;
  userType?: 'patient' | 'dermatologist';
  skinType?: string;
  currentSkinScore?: number;
  streakCount?: number;
  onboardingCompleted?: boolean;
  allergies?: string;
  currentMedications?: string;
  skinConcerns?: string;
  createdAt?: string;
  updatedAt?: string;
  joinDate?: string;
  dermatologistId?: string;
  skinPhotos?: Photo[];
  appointments?: Appointment[];
  prescriptions?: Prescription[];
}

export interface Dermatologist {
  id: string;
  name: string;
  email: string;
  userType: 'dermatologist';
  specialization?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  dermatologistId: string;
  scheduledDate: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'in-progress';
  type: 'consultation' | 'follow-up' | 'emergency';
  notes?: string;
  prescription?: string;
  createdAt: string;
  updatedAt: string;
  patient?: User;
  dermatologist?: Dermatologist;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  recipientId?: string;
  appointmentId?: string;
  content: string;
  messageType: 'text' | 'image' | 'file';
  isRead: boolean;
  createdAt: string;
  sentDate?: string;
  sender?: User;
  receiver?: User;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  category: string;
  price: number;
  productDescription?: string;
  ingredients?: string;
  imageUrl?: string;
  isAvailable: boolean;
  isPrescriptionRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  dermatologistId: string;
  medicationName: string;
  dosage: string;
  instructions: string;
  prescribedDate: string;
  expiryDate?: string;
  refillsRemaining: number;
  isActive: boolean;
  pharmacy?: string;
  productId?: string;
  createdAt: string;
  updatedAt: string;
  patient?: User;
  prescribedBy?: Dermatologist;
  relatedProduct?: Product;
}

export interface Photo {
  id: string;
  userId: string;
  photoUrl: string;
  skinScore: number;
  notes?: string;
  captureDate: string;
  appointmentId?: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
  relatedAppointment?: Appointment;
}

export type RoutineTimeOfDay = 'morning' | 'evening';

export interface RoutineStep {
  title: string;
  instructions: string;
}

export interface RoutineRevision {
  id: string;
  userId: string;
  timeOfDay: RoutineTimeOfDay;
  version: number;
  createdBy: string;
  createdAt: string;
  name: string;
  isActive: boolean;
  steps: RoutineStep[];
}

export interface RoutineCompletion {
  id: string;
  userId: string;
  revisionId: string;
  completedAt: string;
  localDate: string;
  timeZone: string;
  receivedAt: string;
}

export interface RoutineSnapshot {
  routines: RoutineRevision[];
  completions: RoutineCompletion[];
}

export interface RoutineCompletionRecord extends RoutineCompletion {
  routine: RoutineRevision;
}

export interface SaveRoutineRevisionInput {
  expectedRevisionId: string | null;
  name: string;
  isActive: boolean;
  steps: RoutineStep[];
}

// API Request/Response Types
export interface LoginRequest {
  email: string;
  password: string;
  userType: 'dermatologist';
}

export interface LoginResponse {
  message: string;
  user: Dermatologist;
  token: string;
  userType: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  userType: 'dermatologist';
  specialization?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
}

export interface RegisterResponse {
  message: string;
  user: Dermatologist;
  token: string;
  userType: string;
}

export interface APIErrorPayload {
  error: string;
  code?: string;
  details?: ValidationError[];
}

export class APIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export interface ValidationError {
  field: string;
  message: string;
}

// Dashboard Stats
export interface DashboardStats {
  totalPatients: number;
  appointmentsToday: number;
  unreadMessages: number;
  avgImprovement: number;
  recentPatients: User[];
  upcomingAppointments: Appointment[];
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Response wrapper
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIErrorPayload;
  message?: string;
}
