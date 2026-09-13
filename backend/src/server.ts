import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { createDatabaseProbe, createDependencyProbes, createReadiness, installHealthRoutes } from './services/readiness';

// Import routes
import authRoutes from './routes/auth-supabase';
import userRoutes from './routes/users';
import appointmentRoutes from './routes/appointments';
import messageRoutes from './routes/messages';
import prescriptionRoutes from './routes/prescriptions';
import productRoutes from './routes/products';
import photoRoutes from './routes/photos';
import photoReviewRoutes from './routes/photo-reviews';
import routineRoutes from './routes/routines';
import careSupportRoutes from './routes/care-support';
import dashboardRoutes from './routes/dashboard';

// Import middleware
import { authenticateToken } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket
const server = createServer(app);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL?.split(',').map(origin => origin.trim()) || false,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Note: Photo serving now handled by S3 - no local static files needed

// Liveness is dependency-free; readiness performs bounded, metadata-only probes.
installHealthRoutes(app, createReadiness(createDependencyProbes({
  database: createDatabaseProbe(process.env.DATABASE_URL!),
  url: process.env.SUPABASE_URL!,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
})));

// API Routes
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/appointments', authenticateToken, appointmentRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/prescriptions', authenticateToken, prescriptionRoutes);
app.use('/api/products', authenticateToken, productRoutes);
app.use('/api/photos', authenticateToken, photoRoutes);
app.use('/api/photo-reviews', authenticateToken, photoReviewRoutes);
app.use('/api/routines', authenticateToken, routineRoutes);
app.use('/api/care-support', authenticateToken, careSupportRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);

// This MVP has no realtime socket service; reject upgrades explicitly.
server.on('upgrade', (_req, socket) => {
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Vercel imports the application; local/Render execution starts a listener.
if (require.main === module) {
  server.listen(PORT, () => console.log(`ClearAF API listening on port ${PORT}`));
}

export default app;
