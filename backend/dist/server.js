"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const ws_1 = require("ws");
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const appointments_1 = __importDefault(require("./routes/appointments"));
const messages_1 = __importDefault(require("./routes/messages"));
const prescriptions_1 = __importDefault(require("./routes/prescriptions"));
const products_1 = __importDefault(require("./routes/products"));
const photos_1 = __importDefault(require("./routes/photos"));
const routines_1 = __importDefault(require("./routes/routines"));
const auth_2 = require("./middleware/auth");
const errorHandler_1 = require("./middleware/errorHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});
app.use('/api/auth', auth_1.default);
app.use('/api/users', auth_2.authenticateToken, users_1.default);
app.use('/api/appointments', auth_2.authenticateToken, appointments_1.default);
app.use('/api/messages', auth_2.authenticateToken, messages_1.default);
app.use('/api/prescriptions', auth_2.authenticateToken, prescriptions_1.default);
app.use('/api/products', auth_2.authenticateToken, products_1.default);
app.use('/api/photos', auth_2.authenticateToken, photos_1.default);
app.use('/api/routines', auth_2.authenticateToken, routines_1.default);
wss.on('connection', (ws, request) => {
    console.log('New WebSocket connection established');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === ws.OPEN) {
                    client.send(JSON.stringify({
                        type: 'message',
                        data: data
                    }));
                }
            });
        }
        catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});
app.use(errorHandler_1.errorHandler);
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});
server.listen(PORT, () => {
    console.log(`🚀 Clear AF API server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for real-time messaging`);
    console.log(`🏥 Dermatology platform backend initialized`);
});
exports.default = app;
//# sourceMappingURL=server.js.map