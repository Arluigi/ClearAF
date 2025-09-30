// API Service for Clear AF Web Portal
// Connects to the existing backend at https://clearaf.onrender.com

import { createClient } from '@supabase/supabase-js';
import {
  User,
  Dermatologist,
  Appointment,
  Message,
  Prescription,
  Photo,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  APIError,
  DashboardStats,
  PaginatedResponse,
  APIResponse
} from '@/types/api';

const supabaseUrl = 'https://glrfxjydebnilsptlksg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscmZ4anlkZWJuaWxzcHRsa3NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MzUyNTksImV4cCI6MjA3MTExMTI1OX0.CqVuJxORUU6PgL-o7ElT_0j9M2wmX65FOuvp8wP7K6E';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

class APIService {
  private baseURL: string;
  private token: string | null = null;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'https://clearaf.onrender.com/api';
    // Load token from Supabase session
    this.initializeAuth();
  }

  private async initializeAuth() {
    if (typeof window !== 'undefined') {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.token = session.access_token;
      }
    }
  }

  // Helper method to make HTTP requests
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Add auth token if available
    if (this.token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${this.token}`,
      };
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Auth token management
  private setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  private clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  // Authentication Methods
  async login(email: string, password: string): Promise<LoginResponse> {
    // Use Supabase Auth for login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session) {
      throw new Error('No session returned from login');
    }

    // Set token for API requests
    this.token = data.session.access_token;

    // Return in the expected format
    return {
      message: 'Login successful',
      token: data.session.access_token,
      userType: 'dermatologist',
      user: {
        id: data.user.id,
        name: data.user.user_metadata?.name || '',
        email: data.user.email || '',
        userType: 'dermatologist'
      }
    };
  }

  async register(data: Omit<RegisterRequest, 'userType'>): Promise<RegisterResponse> {
    const response = await this.request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        userType: 'dermatologist'
      }),
    });

    this.setToken(response.token);
    return response;
  }

  async logout(): Promise<void> {
    this.clearToken();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.token;
  }

  // Get current dermatologist profile
  async getCurrentUser(): Promise<Dermatologist> {
    const response = await this.request<{user: Dermatologist}>('/users/profile');
    return response.user;
  }

  // Patient Management
  async getPatients(
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<PaginatedResponse<User>> {
    // Use the new dedicated patients endpoint for dermatologists
    const response = await this.request<{patients: User[], total: number}>('/users/patients');

    // Filter by search if provided
    let filteredPatients = response.patients;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPatients = response.patients.filter(p =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.skinType?.toLowerCase().includes(searchLower)
      );
    }

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPatients = filteredPatients.slice(startIndex, endIndex);

    return {
      data: paginatedPatients,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(filteredPatients.length / limit),
        totalItems: filteredPatients.length,
        itemsPerPage: limit
      }
    };
  }

  async getPatient(id: string): Promise<User> {
    return this.request<User>(`/users/${id}`);
  }

  async updatePatient(id: string, data: Partial<User>): Promise<User> {
    return this.request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async assignPatientToDermatologist(patientId: string, dermatologistId: string): Promise<void> {
    return this.request<void>('/users/assign-dermatologist', {
      method: 'POST',
      body: JSON.stringify({ patientId, dermatologistId }),
    });
  }

  // Appointment Management
  async getAppointments(
    page: number = 1,
    limit: number = 10,
    status?: string,
    date?: string
  ): Promise<PaginatedResponse<Appointment>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (status) params.append('status', status);
    if (date) params.append('date', date);

    return this.request<PaginatedResponse<Appointment>>(`/appointments?${params}`);
  }

  async createAppointment(data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment> {
    return this.request<Appointment>('/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment> {
    return this.request<Appointment>(`/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAppointment(id: string): Promise<void> {
    return this.request<void>(`/appointments/${id}`, {
      method: 'DELETE',
    });
  }

  // Messaging
  async getMessages(
    page: number = 1,
    limit: number = 20,
    receiverId?: string
  ): Promise<PaginatedResponse<Message>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (receiverId) params.append('receiverId', receiverId);

    return this.request<PaginatedResponse<Message>>(`/messages?${params}`);
  }

  async sendMessage(data: {
    receiverId: string;
    content: string;
    messageType?: 'text' | 'image' | 'file';
    appointmentId?: string;
  }): Promise<Message> {
    return this.request<Message>('/messages/reply', {
      method: 'POST',
      body: JSON.stringify({
        patientId: data.receiverId,
        content: data.content,
        messageType: data.messageType || 'text'
      }),
    });
  }

  async markMessageAsRead(id: string): Promise<void> {
    return this.request<void>(`/messages/${id}/read`, {
      method: 'PATCH',
    });
  }

  // Prescriptions
  async getPrescriptions(
    page: number = 1,
    limit: number = 10,
    patientId?: string
  ): Promise<PaginatedResponse<Prescription>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (patientId) params.append('patientId', patientId);

    return this.request<PaginatedResponse<Prescription>>(`/prescriptions?${params}`);
  }

  async createPrescription(data: {
    patientId: string;
    medicationName: string;
    dosage: string;
    instructions: string;
    expiryDate?: string;
    refillsRemaining?: number;
    pharmacy?: string;
    productId?: string;
  }): Promise<Prescription> {
    const response = await this.request<{message: string; prescription: Prescription}>('/prescriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.prescription;
  }

  async updatePrescription(id: string, data: Partial<Prescription>): Promise<Prescription> {
    const response = await this.request<{message: string; prescription: Prescription}>(`/prescriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return response.prescription;
  }

  // Dashboard Statistics
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/dashboard/stats');
  }

  // Photo Management
  async getPatientPhotos(
    patientId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<Photo>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    return this.request<PaginatedResponse<Photo>>(`/photos/patient/${patientId}?${params}`);
  }

  async getPhotoTimeline(patientId: string, days: number = 30): Promise<{
    timeline: {
      photos: Photo[];
      stats: {
        totalPhotos: number;
        averageScore: number;
        trend: 'improving' | 'declining' | 'stable';
        trendValue: number;
      };
    };
  }> {
    const params = new URLSearchParams({
      days: days.toString()
    });

    return this.request(`/photos/patient/${patientId}/timeline?${params}`);
  }

  // File Upload (for future use)
  async uploadFile(file: File, type: 'avatar' | 'document' | 'image'): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const config: RequestInit = {
      method: 'POST',
      body: formData,
      headers: {}
    };

    // Add auth token but don't set Content-Type (let browser set it for FormData)
    if (this.token) {
      config.headers = {
        Authorization: `Bearer ${this.token}`,
      };
    }

    const url = `${this.baseURL}/upload`;
    const response = await fetch(url, config);

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    return await response.json();
  }
}

// Create singleton instance
export const apiService = new APIService();
export default apiService;