# Clear AF - Dermatology Platform Development

## Current Session Status
- **Status**: Phase 1 Complete ✅ | Starting Phase 2A - Backend Integration
- **Repository**: https://github.com/Arluigi/ClearAF
- **Last Updated**: All Phase 1 views complete (AppointmentDetailView, MessagingView, MedicalProfileView)

## Quick Commands
- **Build**: `xcodebuild -scheme ClearAF -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build`
- **Run**: Cmd+R in Xcode
- **Clean**: Cmd+Shift+K in Xcode

## Latest Session Completed ✅
**Phase 1 Final Views**: Created AppointmentDetailView (video calls, visit notes, photos), MessagingView (chat interface, photo sharing, Dr. Amit Om integration), and MedicalProfileView (allergies, medications, emergency contact). All navigation connected and dermatologist identity unified.

---

## Development Plan Overview
🎯 **Transform skincare tracker into comprehensive dermatology platform**
- **Phase 1**: Patient App Enhancement (iOS) ✅ **COMPLETE**
- **Phase 2A**: Backend Integration & API Layer ⏳ **NEXT**
- **Phase 2B**: Dermatologist Web Portal (Next.js + PostgreSQL)
- **Phase 3**: Enhanced Features (video calls, prescriptions, real-time messaging)

---

## Phase 1: Patient App Enhancement (COMPLETED ✅)

### Core Features Implemented ✅
- **5-tab navigation**: Home, Progress, Routines, Care, Shop
- **AppointmentBookingView**: Multi-step booking flow
- **AppointmentDetailView**: Visit management with video call integration
- **MessagingView**: Doctor-patient chat with photo sharing
- **MedicalProfileView**: Medical history and emergency contact management
- **Unified photo system**: Camera + library with consistent feedback
- **Dr. Amit Om**: Consistent dermatologist identity across all features

### Core Data Entities ✅
- User, Dermatologist, Appointment, Prescription, Message, Product, Subscription
- Complete medical workflow data models ready for API migration

---

## Phase 2A: Backend Integration (STARTING)

### **Objective**: Replace Core Data with cloud backend while designing API for future web portal

### API Design Principles:
- **REST endpoints** compatible with both iOS and future web portal
- **Consistent data models** between mobile and web interfaces
- **Role-based access** (patients vs dermatologists)
- **Real-time capabilities** for messaging and notifications

### Implementation Plan:
1. **Authentication system** (JWT, user registration/login)
2. **API service layer** replacing Core Data operations
3. **Real-time messaging** via WebSocket/SSE
4. **Photo upload service** with cloud storage
5. **Database schema** matching existing Core Data entities
6. **Environment setup** (dev/staging/prod)

### Backend Stack:
- **Database**: PostgreSQL (web portal compatible)
- **API**: Node.js/Express or Next.js API routes
- **Authentication**: JWT with refresh tokens
- **File Storage**: AWS S3 or Cloudflare R2
- **Real-time**: WebSocket or Server-Sent Events
- **Deployment**: Vercel/Railway for easy web portal integration

## Architecture Evolution

### Current (Phase 1) ✅
- **Frontend**: SwiftUI + Core Data (local storage)
- **Features**: Complete patient app with local data
- **Identity**: Dr. Amit Om integrated across all views

### Target (Phase 2A) ⏳
- **Frontend**: SwiftUI + NetworkManager (API integration)
- **Backend**: Node.js/Express + PostgreSQL + S3
- **API Design**: RESTful endpoints designed for dual consumption (iOS + Web)
- **Authentication**: JWT-based with role separation (patient/doctor)

### Future (Phase 2B)
- **Web Portal**: Next.js + TypeScript + Tailwind CSS
- **Shared Backend**: Same API serving both iOS and web
- **Database**: Single PostgreSQL instance with unified schema
- **Real-time**: WebSocket connections for both platforms

---

## Technical Requirements
- **iOS 17.0+** minimum requirement
- **iPhone 16 Pro** optimized with dark theme
- **API Compatibility**: Design endpoints for both mobile and web consumption
- **Data Consistency**: Ensure Core Data → PostgreSQL migration maintains data integrity
- **Security**: HIPAA-compliant data handling and storage

---

*This file is for internal development notes and is excluded from git commits.*