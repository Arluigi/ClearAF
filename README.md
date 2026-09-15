# ClearAF

A patient iOS app and a clinician web portal sharing one Express API over Supabase (Auth, Postgres, private Storage).

**Status: synthetic demo only. It is not approved for clinical use.** Pilot policy and App Store/TestFlight distribution are on hold.

## What's here

- **Patient iOS app** (`ClearAF/`, SwiftUI, iOS 17+): Today, Photos, Routines and Messages tabs, plus Profile. Photos are dated and shared with the care team; routines and check-ins are assigned by a clinician, not authored on-device.
- **Clinician web portal** (`web-portal/`, Next.js 15, React 19, Tailwind, shadcn/ui): patient list, routine and check-in assignment, photo review, and assigned messaging.
- **API** (`backend/`, Express + TypeScript): the only path either client uses to reach the database or Storage. Prisma is a query client only; access control and validation live in the API.
- **Database** (`supabase/migrations/`): the single active migration chain, with Row Level Security on every table.

## Getting started

Setup, local Supabase, environment files, migrations, and the backup/recovery drill are documented in [docs/baseline/README.md](docs/baseline/README.md). Current project state, prior releases and known limitations are documented in [docs/handoff/README.md](docs/handoff/README.md).

In short:

```sh
node scripts/local.cjs start          # local Supabase (Colima/Docker)
cd backend && npm run dev             # API on :3001
cd web-portal && npm run dev          # portal on :3000
```

Then open `ClearAF.xcodeproj` in Xcode, select the ClearAF scheme and a Debug configuration, and run against an iOS 17+ Simulator with an available Apple development team for ad-hoc signing.

## Tests

```sh
cd backend && npm test && npm run build
cd web-portal && npm test && npm run lint && npm run typecheck && npm run build
```

iOS unit and UI tests run through Xcode or `xcodebuild`; see [docs/baseline/README.md](docs/baseline/README.md) for the exact invocation.

## Contact

**Developer**: Aryan Sachdev
**LinkedIn**: [linkedin.com/in/aryansachdev](https://linkedin.com/in/aryansachdev)
