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
export interface LoginResponse {
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

// Summary grids never receive an original Storage URL.
export type PhotoSummary = Omit<Photo, 'photoUrl'>;
