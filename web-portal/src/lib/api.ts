import type { Conversation, MessagePage, MessageBody, MessageRecord, ReferenceResult } from './assigned-messaging';
import type { Template, TemplateDraft, Form, FormDraft, CheckInResponse, Month } from './care-support';
import type { PhotoReview, ReviewQueueItem } from './photo-review';
// API Service for Clear AF Web Portal
// Connects to the configured ClearAF API.

import { createClient } from '@supabase/supabase-js';
import { createAuthStorage } from './auth-storage';
import { SessionBoundary } from './session-boundary';
import {
  User,
  Dermatologist,
  Appointment,
  Message,
  Prescription,
  Photo,
  PhotoSummary,
  LoginResponse,
  DashboardStats,
  PaginatedResponse,
  APIError,
  RoutineCompletionRecord,
  RoutineRevision,
  RoutineSnapshot,
  RoutineTimeOfDay,
  SaveRoutineRevisionInput,
} from '@/types/api';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase public URL and anonymous key must be configured.');
}

export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
export const authStorage = createAuthStorage(authStorageKey, () => typeof window === 'undefined' ? null : window.localStorage);
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: authStorageKey, storage: authStorage, flowType: 'pkce', detectSessionInUrl: false },
});

export const sessionBoundary = new SessionBoundary();

class APIService {
  private baseURL: string;
  private token: string | null = null;
  private signingOut = false;

  constructor() {
    // Hosting URL is provided at build time.
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  }

  acceptSession(session: { access_token: string; user?: { id: string } } | null) {
    const permitted = !this.signingOut && !authStorage.isLoggedOut() ? session : null;
    this.token = permitted?.access_token ?? null;
    sessionBoundary.accept(permitted?.user?.id ?? null);
  }

  async initializeAuth() {
    if (this.signingOut || authStorage.isLoggedOut()) { this.acceptSession(null); return; }
    const generation = sessionBoundary.snapshot();
    const { data: { session }, error } = await supabase.auth.getSession();
    sessionBoundary.assert(generation);
    if (error) throw error;
    this.acceptSession(session);
  }

  scoped() {
    const generation = sessionBoundary.snapshot();
    return new Proxy(this, { get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        sessionBoundary.assert(generation);
        return value.apply(target, args);
      };
    } });
  }

  // Helper method to make HTTP requests
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    bodyType: 'json' | 'blob' = 'json',
  ): Promise<T> {
    if (authStorage.recoveryAccount()) throw new Error('Finish or cancel password recovery before accessing clinical data.');
    options.signal?.throwIfAborted();
    const generation = sessionBoundary.snapshot();
    const url = `${this.baseURL}${endpoint}`;

    if (this.signingOut || authStorage.isLoggedOut()) throw new Error('Please sign in again.');
    // Get current Supabase session token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    sessionBoundary.assert(generation);
    if (sessionError) throw sessionError;
    this.acceptSession(session);
    sessionBoundary.assert(generation);
    if (this.signingOut || authStorage.isLoggedOut()) throw new Error('Please sign in again.');
    options.signal?.throwIfAborted();
    const token = session?.access_token;

    const config: RequestInit = {
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...options,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    };

    // Add auth token if available
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    try {
      const response = await fetch(url, config);
      sessionBoundary.assert(generation);

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        // Parsing an error body is asynchronous too; never publish it across an account boundary.
        sessionBoundary.assert(generation);
        const payload = typeof errorData === 'object' && errorData !== null ? errorData as { error?: unknown; code?: unknown } : {};
        const message = typeof payload.error === 'string'
          ? payload.error
          : `Request failed with status ${response.status}`;
        throw new APIError(response.status, message, typeof payload.code === 'string' ? payload.code : undefined);
      }

      options.signal?.throwIfAborted();
      const body = bodyType === 'blob' ? await response.blob() : await response.json();
      sessionBoundary.assert(generation);
      options.signal?.throwIfAborted();
      return body;
    } catch (error) {

      throw error;
    }
  }

  // Authentication Methods
  async login(email: string, password: string): Promise<LoginResponse> {
    authStorage.beginLogin();
    this.signingOut = false;
    if (authStorage.recoveryAccount()) throw new Error('Finish or cancel password recovery before signing in.');
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
    this.acceptSession(data.session);

    try {
      const user = await this.getCurrentUser();
      if (user.userType !== 'dermatologist') {
        await this.logout().catch(() => {});
        throw new Error('A verified dermatologist account is required.');
      }
      return { message: 'Login successful', token: data.session.access_token, userType: user.userType, user };
    } catch (error) {
      // Keep a valid session on profile/network failure so the retry gate can recover.
      throw error;
    }
  }

  async logout(): Promise<void> {
    const token = this.token;
    this.signingOut = true;
    this.token = null;
    sessionBoundary.accept(null);
    sessionBoundary.invalidate();
    // Persist the barrier before any network await. A killed offline tab cannot restore it.
    authStorage.clearSession();
    // Revoke the captured session JWT directly: ordinary signOut would now see empty storage.
    // This is the same public-session endpoint used by Supabase's own signOut implementation.
    const remote = token ? supabase.auth.admin.signOut(token, 'local') : Promise.resolve({ error: null });
    const local = supabase.auth.signOut({ scope: 'local' });
    const results = await Promise.allSettled([remote, local]);
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      if (result.value.error) throw result.value.error;
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !this.signingOut && !authStorage.isLoggedOut() && !authStorage.recoveryAccount() && !!this.token;
  }

  // Get current dermatologist profile
  async getCurrentUser(): Promise<Dermatologist> {
    const response = await this.request<{user: Dermatologist}>('/users/profile');
    if (response.user.userType !== 'dermatologist') {
      await this.logout().catch(() => {});
      throw new Error('A verified dermatologist account is required.');
    }
    return response.user;
  }

  // Patient Management
  async getPatients(
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<PaginatedResponse<User>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search?.trim()) params.set('search', search.trim());
    return this.request<PaginatedResponse<User>>(`/users/?${params}`);
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

  async getPatientRoutines(patientId: string, localDate: string): Promise<RoutineSnapshot> {
    const params = new URLSearchParams({ localDate });
    return this.request<RoutineSnapshot>(`/routines/patients/${encodeURIComponent(patientId)}?${params}`);
  }

  async savePatientRoutine(
    patientId: string,
    timeOfDay: RoutineTimeOfDay,
    revisionId: string,
    data: SaveRoutineRevisionInput,
  ): Promise<RoutineRevision> {
    const response = await this.request<{ routine: RoutineRevision }>(
      `/routines/patients/${encodeURIComponent(patientId)}/${timeOfDay}/revisions/${encodeURIComponent(revisionId)}`,
      { method: 'PUT', body: JSON.stringify(data) },
    );
    return response.routine;
  }

  async getPatientRoutineCompletions(
    patientId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponse<RoutineCompletionRecord>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return this.request<PaginatedResponse<RoutineCompletionRecord>>(
      `/routines/patients/${encodeURIComponent(patientId)}/completions?${params}`,
    );
  }

  async getTemplates(page=1):Promise<PaginatedResponse<Template>> { return this.request(`/care-support/templates?page=${page}&limit=20`); }
  async saveTemplate(templateId:string, revisionId:string, body:TemplateDraft&{expectedRevisionId:string|null}):Promise<Template> { const result=await this.request<{template:Template}>(`/care-support/templates/${encodeURIComponent(templateId)}/revisions/${encodeURIComponent(revisionId)}`,{method:'PUT',body:JSON.stringify(body)});return result.template; }
  async getPatientCalendar(patientId:string,month:string):Promise<Month>{return this.request(`/care-support/patients/${encodeURIComponent(patientId)}/calendar?${new URLSearchParams({month})}`);}
  async getPatientCalendarEvents(patientId:string,localDate:string,page=1):Promise<PaginatedResponse<RoutineCompletionRecord>>{return this.request(`/care-support/patients/${encodeURIComponent(patientId)}/calendar/events?${new URLSearchParams({localDate,page:String(page),limit:'20'})}`);}
  async getPatientForm(patientId:string):Promise<{form:Form|null}>{return this.request(`/care-support/patients/${encodeURIComponent(patientId)}/form`);}
  async savePatientForm(patientId:string,revisionId:string,body:FormDraft&{expectedRevisionId:string|null}):Promise<Form>{const result=await this.request<{form:Form}>(`/care-support/patients/${encodeURIComponent(patientId)}/forms/${encodeURIComponent(revisionId)}`,{method:'PUT',body:JSON.stringify(body)});return result.form;}
  async getPatientResponses(patientId:string,page=1):Promise<PaginatedResponse<CheckInResponse>>{return this.request(`/care-support/patients/${encodeURIComponent(patientId)}/responses?page=${page}&limit=20`);}

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

    if (status && status !== 'all') params.append('status', status);
    if (date) params.append('date', date);

    const response = await this.request<{ appointments: Appointment[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/appointments?${params}`);
    return { data: response.appointments, pagination: { ...response.pagination, totalPages: response.pagination.pages } };
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

    const response = await this.request<{ prescriptions: Prescription[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/prescriptions?${params}`);
    return { data: response.prescriptions, pagination: { ...response.pagination, totalPages: response.pagination.pages } };
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

  async getPhotoThumbnail(id: string, signal?: AbortSignal): Promise<Blob> {
    return this.request<Blob>(`/photos/${encodeURIComponent(id)}/thumbnail`, { signal }, 'blob');
  }

  async getPhotoReviewStatus(photoIds: string[]): Promise<{ reviews: PhotoReview[] }> {
    return this.request(`/photo-reviews/status?${new URLSearchParams({ photoIds: photoIds.join(',') })}`);
  }

  async markPhotoReviewed(id: string): Promise<{ review: PhotoReview }> {
    return this.request(`/photo-reviews/photos/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({}) });
  }

  async getPhotoReviewQueue(page = 1): Promise<PaginatedResponse<ReviewQueueItem>> {
    return this.request(`/photo-reviews/queue?${new URLSearchParams({ page: String(page), limit: '20' })}`);
  }

  async getPhotoOriginal(id: string, signal?: AbortSignal): Promise<{ photoUrl: string }> {
    return this.request(`/photos/${encodeURIComponent(id)}/original`, { signal });
  }

  async getPatientPhotoSummaries(patientId: string, page = 1, limit = 12): Promise<PaginatedResponse<PhotoSummary>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), view: 'summary' });
    return this.request(`/photos/patient/${encodeURIComponent(patientId)}?${params}`);
  }

  async getMessageInbox(cursor?:string):Promise<{conversations:Conversation[];nextCursor:string|null}> { return this.request('/assigned-messages/inbox?'+new URLSearchParams({limit:'20',...(cursor?{cursor}:{})})); }
  async getAssignedMessages(patientId:string,clinicianId:string,before?:string):Promise<MessagePage> { return this.request(`/assigned-messages/patients/${encodeURIComponent(patientId)}/clinicians/${encodeURIComponent(clinicianId)}?`+new URLSearchParams({limit:'30',...(before?{before}:{})})); }
  async sendAssignedMessage(patientId:string,clinicianId:string,id:string,body:MessageBody):Promise<MessageRecord> { const result=await this.request<{message:MessageRecord}>(`/assigned-messages/patients/${encodeURIComponent(patientId)}/clinicians/${encodeURIComponent(clinicianId)}/messages/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(body)});return result.message; }
  async acknowledgeMessages(patientId:string,clinicianId:string,messageIds:string[]):Promise<{acknowledgedIds:string[];unreadCount:number}> { return this.request(`/assigned-messages/patients/${encodeURIComponent(patientId)}/clinicians/${encodeURIComponent(clinicianId)}/read`,{method:'POST',body:JSON.stringify({messageIds})}); }
  async getMessageReference(patientId:string,clinicianId:string,messageId:string):Promise<ReferenceResult> { return this.request(`/assigned-messages/patients/${encodeURIComponent(patientId)}/clinicians/${encodeURIComponent(clinicianId)}/messages/${encodeURIComponent(messageId)}/reference`); }

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
    return this.request('/upload', { method: 'POST', body: formData, headers: {} });
  }
}

// Create singleton instance
export const apiService = new APIService();
export default apiService;

// Synchronous identity invalidation precedes any React profile restoration.
supabase.auth.onAuthStateChange((_event, session) => { apiService.acceptSession(session); });
