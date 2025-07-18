import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import appointmentRoutes from './routes/appointments';
import messageRoutes from './routes/messages';
import prescriptionRoutes from './routes/prescriptions';
import productRoutes from './routes/products';
import photoRoutes from './routes/photos';
import routineRoutes from './routes/routines';

// Import middleware
import { authenticateToken } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket
const server = createServer(app);

// WebSocket server for real-time messaging
const wss = new WebSocketServer({ server });

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/appointments', authenticateToken, appointmentRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/prescriptions', authenticateToken, prescriptionRoutes);
app.use('/api/products', authenticateToken, productRoutes);
app.use('/api/photos', authenticateToken, photoRoutes);
app.use('/api/routines', authenticateToken, routineRoutes);

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  console.log('New WebSocket connection established');
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Broadcast message to all connected clients
      // In production, you'd want to filter by user/room
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify({
            type: 'message',
            data: data
          }));
        }
      });
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
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

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Clear AF API server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for real-time messaging`);
  console.log(`🏥 Dermatology platform backend initialized`);
});

export default app;