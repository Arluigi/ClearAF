# Clear AF Backend API

**Professional dermatology platform backend** supporting the Clear AF iOS app with plans for web portal integration.

## 🏗️ Architecture

- **Framework**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with role-based access (patients/dermatologists)
- **Real-time**: WebSocket for messaging
- **File Storage**: Cloudflare R2 (free tier)
- **Hosting**: Railway.app (free tier)

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your database URL and JWT secret
```

### 3. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed with demo data
npm run db:seed
```

### 4. Start Development Server
```bash
npm run dev
```

API will be available at `http://localhost:3000`

## 📊 Database Schema

### Core Entities
- **Users** (Patients): Profile, skin score, streak tracking
- **Dermatologists**: Medical professionals, availability status
- **Appointments**: Scheduling, video calls, visit notes
- **Messages**: Real-time patient-doctor communication
- **SkinPhotos**: Progress tracking with scoring
- **Prescriptions**: Medication management
- **Products**: Skincare product catalog
- **Routines**: Daily skincare routine tracking

### Key Relationships
- Patients assigned to dermatologists (1:many)
- Appointments link patients & dermatologists
- Photos can be associated with appointments
- Messages enable real-time communication

## 🔐 Authentication

### Endpoints
- `POST /api/auth/register` - Register patient/dermatologist
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/me` - Get current user info

### JWT Token Format
```json
{
  "userId": "uuid",
  "userType": "patient|dermatologist", 
  "email": "user@example.com"
}
```

### Headers
```
Authorization: Bearer <jwt_token>
```

## 📡 API Endpoints

### Users
- `GET /api/users/profile` - Get user profile
- `PATCH /api/users/profile` - Update profile
- `POST /api/users/skin-score` - Update skin score (patients)
- `GET /api/users/stats` - Get user statistics

### Appointments
- `POST /api/appointments` - Book appointment (patients)
- `GET /api/appointments` - List appointments
- `GET /api/appointments/:id` - Get appointment details
- `PATCH /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Cancel appointment

### Messages
- `POST /api/messages/send` - Send message (patients)
- `POST /api/messages/reply` - Reply to patient (dermatologists)
- `GET /api/messages/conversation/:dermatologistId` - Get conversation
- `GET /api/messages/conversations` - List conversations (dermatologists)

### Photos
- `POST /api/photos` - Upload photo record
- `GET /api/photos` - List user photos
- `GET /api/photos/:id` - Get photo details
- `PATCH /api/photos/:id` - Update photo
- `GET /api/photos/timeline/progress` - Progress timeline

### Prescriptions
- `POST /api/prescriptions` - Create prescription (dermatologists)
- `GET /api/prescriptions` - List prescriptions
- `PATCH /api/prescriptions/:id` - Update prescription

### Products
- `GET /api/products` - List products (with filtering)
- `GET /api/products/:id` - Get product details

### Routines
- `POST /api/routines` - Create routine
- `GET /api/routines` - List user routines
- `PATCH /api/routines/:id` - Update routine
- `POST /api/routines/:id/steps/:stepId/complete` - Mark step complete

## 🔄 Real-time Features

### WebSocket Connection
```javascript
const ws = new WebSocket('ws://localhost:3000');

// Send message
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello doctor!',
  recipientId: 'dermatologist-uuid'
}));
```

### Message Broadcasting
Messages are broadcast to all connected clients. In production, implement room-based filtering for privacy.

## 🚀 Deployment (Railway)

### 1. Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Deploy from `backend` folder

### 2. Add Environment Variables
```bash
DATABASE_URL=<railway-postgres-url>
JWT_SECRET=<your-secret-key>
NODE_ENV=production
```

### 3. Database Setup
Railway will automatically run migrations. To seed:
```bash
railway run npm run db:seed
```

### 4. Custom Domain (Optional)
Railway provides free subdomain: `yourapp.railway.app`

## 💾 Free Hosting Limits

### Railway Free Tier
- 512MB RAM
- $5 credit per month (≈550 hours)
- PostgreSQL database included
- Custom domains supported

### Cloudflare R2 Free Tier  
- 10GB storage forever
- 1M Class A operations/month
- 10M Class B operations/month

## 🧪 Demo Data

Use these credentials after seeding:

**Patient Account:**
- Email: `demo@clearaf.com`
- Password: `demo123456`

**Dermatologist Account:**
- Email: `amit.om@clearaf.com` 
- Password: `demo123456`

## 🔧 Development

### Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production  
- `npm start` - Start production server
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed demo data

### Database Management
```bash
# View database in browser
npx prisma studio

# Reset database (dev only)
npx prisma migrate reset

# Deploy migrations (production)
npx prisma migrate deploy
```

## 🔗 iOS Integration

The iOS app will replace Core Data calls with API requests to this backend. Key integration points:

1. **Authentication**: Login/register flows
2. **Photo Upload**: Cloudflare R2 direct upload
3. **Real-time Messaging**: WebSocket connection
4. **Offline Support**: Cache API responses locally
5. **Sync Strategy**: Periodic background sync

## 🔮 Future Enhancements

- **Web Portal**: Next.js admin panel for dermatologists
- **Push Notifications**: FCM/APNs integration  
- **Video Calls**: WebRTC implementation
- **Analytics**: Usage tracking and insights
- **Multi-tenant**: Support multiple clinics
- **HIPAA Compliance**: Enhanced security measures

---

**Built for Clear AF Dermatology Platform** 🏥✨