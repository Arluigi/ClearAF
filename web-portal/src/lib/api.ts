import type { Conversation, MessagePage, MessageBody, MessageRecord, ReferenceResult } from './assigned-messaging';
import type { Template, TemplateDraft, Form, FormDraft, CheckInResponse, Month } from './care-support';
import type { PhotoReview, ReviewQueueItem } from './photo-review';
import type { EnrollmentSummary } from './enrollment';
import type { CareDecision, DecisionBody } from './care-decisions';
import type { UrgentReport, UrgentQueue } from './urgent-reports';
// API Service for Clear AF Web Portal
// Connects to the configured ClearAF API.

import { createClient } from '@supabase/supabase-js';
import { createAuthStorage } from './auth-storage';
import { SessionBoundary } from './session-boundary';
import {
  User,
  Dermatologist,
  PhotoSummary,
  LoginResponse,
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

  async getEnrollmentSummary(patientId:string):Promise<EnrollmentSummary> { return this.request(`/enrollment/patients/${encodeURIComponent(patientId)}`); }
  async getCareDecisions(patientId:string,page=1):Promise<PaginatedResponse<CareDecision>> { return this.request(`/care-decisions/patients/${encodeURIComponent(patientId)}?${new URLSearchParams({page:String(page),limit:'20'})}`); }
  async recordCareDecision(patientId:string,id:string,body:DecisionBody):Promise<CareDecision> { const result=await this.request<{decision:CareDecision}>(`/care-decisions/patients/${encodeURIComponent(patientId)}/decisions/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(body)});return result.decision; }
  async markRefundIssued(patientId:string,id:string):Promise<CareDecision> { const result=await this.request<{decision:CareDecision}>(`/care-decisions/patients/${encodeURIComponent(patientId)}/decisions/${encodeURIComponent(id)}/refund`,{method:'PUT',body:JSON.stringify({refundStatus:'issued'})});return result.decision; }
  async getUrgentQueue(page=1):Promise<UrgentQueue> { return this.request(`/urgent-reports/queue?${new URLSearchParams({page:String(page),limit:'20'})}`); }
  async getPatientUrgentReports(patientId:string,page=1):Promise<PaginatedResponse<UrgentReport>> { return this.request(`/urgent-reports/patients/${encodeURIComponent(patientId)}?${new URLSearchParams({page:String(page),limit:'20'})}`); }
  async acknowledgeUrgentReport(id:string):Promise<UrgentReport> { const result=await this.request<{report:UrgentReport}>(`/urgent-reports/${encodeURIComponent(id)}/acknowledge`,{method:'POST',body:JSON.stringify({})});return result.report; }
  async resolveUrgentReport(id:string,resolutionNote:string|null):Promise<UrgentReport> { const result=await this.request<{report:UrgentReport}>(`/urgent-reports/${encodeURIComponent(id)}/resolve`,{method:'POST',body:JSON.stringify({resolutionNote})});return result.report; }

}

// Create singleton instance
export const apiService = new APIService();
export default apiService;

// Synchronous identity invalidation precedes any React profile restoration.
supabase.auth.onAuthStateChange((_event, session) => { apiService.acceptSession(session); });
