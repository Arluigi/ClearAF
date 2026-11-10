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

// Clinician worklist (GET /worklist). Read-only; every figure covers currently assigned patients only.
export type WorklistFilter = 'needs-review' | 'all' | 'flagged';
/** Routines completed that day (clamped to 2); null = the day does not count. */
export type WorklistDayState = 0 | 1 | 2 | null;

export interface WorklistAdherence {
  percent: number | null;
  completedDays: number;
  countedDays: number;
  days: { localDate: string; routines: WorklistDayState }[];
}

export interface WorklistRow {
  patientId: string;
  name: string | null;
  joinedAt: string;
  photos: { unreviewedCount: number; oldestUploadAt: string | null };
  unreadMessages: number;
  latestCheckInAt: string | null;
  urgent: { open: number; acknowledged: number; oldestAt: string | null };
  adherence: WorklistAdherence | null;
}

export interface WorklistSummary {
  assignedPatients: number;
  photosToReview: { count: number; oldestUploadAt: string | null };
  unreadMessages: { count: number; patients: number };
  checkInsSubmitted: { count: number; since: string; days: number };
  adherenceUnderThreshold: { count: number; threshold: number; windowDays: number };
}

export interface WorklistResponse extends PaginatedResponse<WorklistRow> {
  filter: WorklistFilter;
  localDate: string;
  summary: WorklistSummary;
}

export interface WorklistQuery {
  filter: WorklistFilter;
  page: number;
  search: string;
  localDate: string;
}

// UNZIT contract, with orchestrator amendments. Legacy DTOs remain unchanged.
export type LaunchUUID = string;
export type LaunchInstant = string;
export type LaunchDateOnly = string;
export type LaunchPlanId = 'care' | 'all_in';
export type LaunchConsentKey = 'telehealth' | 'medication' | 'privacy_notice' | 'subscription_terms';
export type LaunchPhotoSlot = 'front' | 'left' | 'right' | 'chest' | 'back' | 'close_up';
export type LaunchCaseStatus = 'consents' | 'identity' | 'eligibility' | 'payment' | 'medical_history'
  | 'photos' | 'destination' | 'submitted' | 'needs_changes' | 'approved' | 'rejected' | 'ineligible';
export type LaunchPage<T> = {data:T[];pagination:{page:number;limit:number;total:number;totalPages:number}};
export type LaunchPlan = {id:LaunchPlanId;name:string;amountCents:number;currency:'usd';interval:'month';
  includesPartnerRx:boolean;cadence:{weeklyWeeks:number;then:'monthly'}};
export type LaunchConsent = {key:LaunchConsentKey;version:number;versionLabel:string;title:string;body:string;
  sha256:string;effectiveAt:LaunchInstant;acceptedAt:LaunchInstant|null};
export type LaunchCatalog = {contractVersion:1;settingsVersion:number;plans:LaunchPlan[];consents:LaunchConsent[];
  reviewCopy:'Review within 1 to 2 business days.';questionnaireVersion:string;
  eligibilityQuestions:LaunchQuestion[];medicalQuestions:LaunchQuestion[]};
export type LaunchQuestion = {id:string;prompt:string;kind:'choice'|'multi_choice'|'text'|'repeat'|'attestation';
  required:boolean;options:{id:string;label:string}[];fields:LaunchQuestion[];
  showWhen:{questionId:string;operator:'in'|'not_in';values:string[]}[]};
export type LaunchSignedImage = {url:string;expiresAt:LaunchInstant};
export type LaunchIdentity = {id:LaunchUUID;status:'uploaded'|'approved'|'needs_changes'|'rejected';
  fullName:string;dateOfBirth:LaunchDateOnly;attestedInNC:boolean;attestedAt:LaunchInstant;
  reviewedAt:LaunchInstant|null;reviewedBy:LaunchUUID|null;patientMessage:string|null};
export type LaunchPharmacy = {name:string;addressLine1:string;addressLine2:string|null;city:string;
  state:string;postalCode:string;phone:string};
export type LaunchAddress = {recipient:string;line1:string;line2:string|null;city:string;state:'NC';postalCode:string};
export type LaunchDestination = {planId:'care';pharmacy:LaunchPharmacy} |
  {planId:'all_in';pharmacy:'vida';shippingAddress:LaunchAddress};
export type LaunchEligibility = {E1:'acne'|'dark_marks'|'something_else';E2:'yes'|'no';
  E3:'pregnant'|'breastfeeding'|'neither'|'not_applicable';E4:'yes'|'no'};
export type LaunchEligibilityResult = {answers:LaunchEligibility;eligible:boolean;reasons:string[];flags:string[];rulesVersion:string};
export type LaunchMedicalHistory = {
  M1:'female'|'male'|'intersex'|'prefer_not_to_say';
  M2:'yes'|'no'|'not_sure'|null; M3:'yes'|'no'|'not_sure'|null;
  M4:{method:'pill_patch_ring'|'iud'|'implant'|'shot'|'condoms'|'none'|'other';details:string|null}|null;
  M5:'under_6_months'|'6_to_12_months'|'1_to_5_years'|'over_5_years';
  M6:('forehead'|'cheeks'|'nose'|'jaw_chin'|'neck'|'chest'|'back'|'other')[];
  M7:('comedones'|'red_bumps'|'pus_bumps'|'deep_painful_lumps'|'dark_marks'|'scars')[];
  M8:'yes'|'no'|'not_sure'|'not_applicable'|null;
  M9:{signs:('irregular_periods'|'new_hair_growth'|'scalp_thinning'|'voice_change')[];none:boolean;details:string|null};
  M10:'burns_rarely_tans'|'burns_then_tans'|'rarely_burns_tans_easily'|'very_rarely_burns_deeply_pigmented';
  M11:{none:boolean;treatments:{name:string;duration:string;helped:string;sideEffects:string}[]};
  M12:'never'|'past'|'now';
  M13:('ace_arb'|'water_pills'|'potassium'|'trimethoprim'|'lithium'|'digoxin'|'warfarin'|'minerals_antacids'|'seizure_medicine'|'none')[];
  M14:{none:boolean;details:string|null};
  M15:{picks:('tetracyclines'|'sulfites'|'clindamycin'|'benzoyl_peroxide'|'other'|'none')[];reaction:string|null};
  M16:('kidney'|'liver'|'high_potassium'|'heart'|'fainting_low_bp'|'adrenal'|'lupus_sun_sensitivity'|'raised_brain_pressure'|'swallowing_esophagus'|'breast_cancer'|'ibd'|'none')[];
  M17:'not_sensitive'|'somewhat'|'very'|'eczema_rosacea'; M18:string;
  M19:'yes'|'sometimes'|'no'; M20:{pcpName:string|null;pcpPhone:string|null;shareSummary:boolean};
  M21:string; M22:true; medicationPreference:'topical'|'oral'|'no_preference';
};
export type LaunchMedicalDraft = Partial<LaunchMedicalHistory>;
export type LaunchPhotoSet = {id:LaunchUUID;purpose:'enrollment'|'check_in';status:'draft'|'submitted'|'needs_changes'|'reviewed';
  requiredSlots:LaunchPhotoSlot[];items:{slot:LaunchPhotoSlot;photoId:LaunchUUID;captureId:LaunchUUID}[]};
export type LaunchCapture = {id:LaunchUUID;captureId:LaunchUUID;captureDate:LaunchInstant;uploadedAt:LaunchInstant};
export type LaunchCase = {id:LaunchUUID;revision:number;status:LaunchCaseStatus;identity:LaunchIdentity|null;
  eligibility:LaunchEligibilityResult|null;medicalHistory:LaunchMedicalDraft;questionnaireVersion:string;
  photoSet:LaunchPhotoSet|null;destination:LaunchDestination|null;planId:LaunchPlanId|null;flags:string[];
  submittedAt:LaunchInstant|null;approvedAt:LaunchInstant|null;patientMessage:string|null};
export type LaunchMembership = {id:LaunchUUID;planId:LaunchPlanId;status:'awaiting_payment'|'paid_pending_review'|'active'|'past_due'|'ended'|'rejected';
  amountCents:number;currency:'usd';activatedAt:LaunchInstant|null;currentPeriodEnd:LaunchInstant|null;
  paidThrough:LaunchInstant|null;cancelAtPeriodEnd:boolean;cadenceAnchor:LaunchInstant|null;destinationRequired?:boolean;
  refundStatus:'not_applicable'|'pending'|'issued'|'failed';access:'enrollment'|'care'|'read_only'};
export type LaunchEnrollmentResponse = {case:LaunchCase;membership:LaunchMembership|null;consents:LaunchConsent[]};
export type LaunchFollowUp = {tolerability:'good'|'some_irritation'|'not_tolerating';
  sideEffects:{none:boolean;details:string|null};
  pregnancyStatus:'pregnant'|'breastfeeding'|'trying'|'not_sure'|'neither'|'not_applicable';
  newMedicines:{none:boolean;details:string|null};physicallyInNC:boolean};
export type LaunchCheckIn = {id:LaunchUUID;dueAt:LaunchInstant;cadenceAnchor:LaunchInstant;kind:'weekly'|'monthly';
  status:'due'|'draft'|'submitted'|'needs_changes'|'reviewed'|'superseded';
  formId:LaunchUUID;form:LaunchCheckInForm;responseId:LaunchUUID|null;photoSet:LaunchPhotoSet|null;answers:LaunchFollowUp|null;
  submittedAt:LaunchInstant|null;reviewedAt:LaunchInstant|null;patientMessage:string|null};
export type LaunchCheckInForm = {id:LaunchUUID;userId:LaunchUUID;version:number;createdBy:LaunchUUID;createdAt:LaunchInstant;
  title:string;isActive:boolean;questions:{id:LaunchUUID;prompt:string;type:'text'|'choice';
    required:boolean;options:{id:LaunchUUID;label:string}[]}[]};
export type LaunchReview = {id:LaunchUUID;targetType:'identity'|'case'|'check_in';targetId:LaunchUUID;
  outcome:'approve'|'needs_changes'|'reject';patientMessage:string|null;createdAt:LaunchInstant;clinicianId:LaunchUUID};
export type LaunchQueueItem = {id:LaunchUUID;patientId:LaunchUUID;patientName:string|null;
  kind:'identity'|'enrollment'|'check_in';targetId:LaunchUUID;receivedAt:LaunchInstant;flags:string[]};
export type LaunchChart = {careModel:'launch';enrollment:LaunchEnrollmentResponse;checkIns:LaunchPage<LaunchCheckIn>;reviews:LaunchPage<LaunchReview>;
  prescriptions:LaunchPage<LaunchPrescriptionSent>};
export type LaunchPrescriptionSent = {id:LaunchUUID;patientId:LaunchUUID;clinicianId:LaunchUUID;drug:string;strength:string;
  sig:string;pharmacy:LaunchPharmacy;sentAt:LaunchInstant;recordedAt:LaunchInstant;source:'treatrx_external'};

export type LaunchChartResponse = LaunchChart | {careModel:'legacy'};
