// server.cjs - COMPLETE CODE WITH ADMIN ENDPOINTS

// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000','https://mj.neospec.co.in', 'http://localhost:5173', 'http://localhost:8000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Import notification service
let notificationService;
try {
  notificationService = require('./notificationService.cjs');
} catch (error) {
  console.log('⚠️ Notification service not available:', error.message);
  notificationService = {
    sendAllNotifications: async () => ({
      success: false,
      error: 'Notification service not configured'
    })
  };
}

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Razorpay Configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ==================== SCHEMAS ====================

// Vehicle Schema
const vehicleSchema = new mongoose.Schema({
  name: String,
  type: String,
  capacity: Number,
  transmission: String,
  dailyRate: Number,
  quantity: { type: Number, default: 1 },
  isAvailable: { type: Boolean, default: true },
  features: [String],
  image: String
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// Admin User Schema
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password_hash: {
    type: String,
    required: true
  },
  full_name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'manager', 'viewer'],
    default: 'admin'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  phone: String,
  permissions: [String],
  last_login: Date,
  login_attempts: {
    type: Number,
    default: 0
  },
  locked_until: Date,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware
adminSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

const Admin = mongoose.model('admin_users', adminSchema);

// Booking Schema with ALL admin fields
const bookingSchema = new mongoose.Schema({
  // Basic booking info
  bookingId: { type: String, unique: true },
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  vehicleId: mongoose.Schema.Types.ObjectId,
  vehicleName: String,
  
  // Dates
  pickupDate: Date,
  dropoffDate: Date,
  pickupTime: { type: String, default: '09:00' },
  dropoffTime: { type: String, default: '18:00' },
  totalDays: Number,
  
  // Pricing
  rentalAmount: Number,
  bookingFee: { type: Number, default: 10 },
  totalAmount: Number,
  
  // Payment info
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  paymentStatus: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'paid', 'failed', 'refunded'] 
  },
  paymentAmount: Number,
  paymentTimestamp: Date,
  paymentMethod: { type: String, default: 'online' },
  
  // Booking status
  status: { 
    type: String, 
    default: 'pending', 
    enum: [ 'confirmed', 'handed_over', 'in_use', 'returned', 'completed', 'cancelled', 'overdue','pending'] 
  },
  
  // Notification tracking
  notificationsSent: { type: Boolean, default: false },
  notificationsTimestamp: Date,
  notificationsStatus: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'sent', 'partial', 'failed'] 
  },
  
  // Admin tracking
  manualBooking: { type: Boolean, default: false },
  createdBy: String,
  notes: String,
  
  // Cancellation
  cancellationReason: String,
  refundAmount: { type: Number, default: 0 },
  cancelledAt: Date,
  cancelledBy: String,
  
  // Handover
  handoverData: {
    odometerReading: { type: Number, default: 0 },
    fuelLevel: { type: String, default: 'full' },
    conditionNotes: String,
    handedOverBy: String,
    customerSignature: String,
    handedOverAt: Date
  },
  
  // Return
  returnData: {
    odometerReading: { type: Number, default: 0 },
    fuelLevel: { type: String, default: 'full' },
    conditionNotes: String,
    returnStatus: { type: String, default: 'good' },
    additionalCharges: [{
      type: { type: String },
      amount: Number,
      description: String
    }],
    totalAdditionalCharges: { type: Number, default: 0 },
    notes: String,
    returnedBy: String,
    returnedAt: Date
  },
  
  // Completion
  completedAt: Date,
  completedBy: String,
  finalNotes: String,
  
  // Status history
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    actionBy: String,
    notes: String,
    additionalCharges: Number
  }]
}, { 
  timestamps: true,
  strict: false 
});

const Booking = mongoose.model('Booking', bookingSchema);

// Vehicle Payment Schema
const vehiclePaymentSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  amount: Number,
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  registrationFee: { type: Boolean, default: false },
  processedAt: Date
}, { timestamps: true });

const VehiclePayment = mongoose.model('VehiclePayment', vehiclePaymentSchema);

// ==================== AUTHENTICATION MIDDLEWARE ====================

const authenticateAdmin = (requiredRole = null) => {
  return async (req, res, next) => {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. No token provided.'
        });
      }
      
      const token = authHeader.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
      
      // Find admin
      const admin = await Admin.findById(decoded.id);
      
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      if (!admin.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }
      
      // Check role if required
      if (requiredRole && admin.role !== requiredRole) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }
      
      // Add admin to request
      req.admin = admin;
      next();
      
    } catch (error) {
      console.error('Authentication error:', error);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }
  };
};

// ==================== HELPER FUNCTIONS ====================

// Helper function to check vehicle availability
async function checkVehicleAvailability(vehicleId, startDate, endDate, excludeBookingId = null) {
  try {
    console.log('=== AVAILABILITY CHECK START ===');
    console.log('Vehicle ID:', vehicleId);
    console.log('Start Date:', startDate.toISOString());
    console.log('End Date:', endDate.toISOString());
    
    // Find vehicle with explicit field selection
    const vehicle = await Vehicle.findById(vehicleId).select('name quantity');
    
    if (!vehicle) {
      console.log('❌ Vehicle not found');
      return { available: false, availableQuantity: 0, vehicleQuantity: 0 };
    }
    
    // Make sure quantity is a number
    const quantity = Number(vehicle.quantity) || 1;
    
    // Build query for overlapping bookings - EXCLUDE PENDING BOOKINGS
    const query = {
      vehicleId: vehicleId,
      // ✅ ONLY count confirmed and active bookings
      status: { $in: ['confirmed', 'handed_over', 'in_use', 'overdue'] }
    };
    
    // Date overlap condition
    query.$or = [
      {
        pickupDate: { $lte: endDate },
        dropoffDate: { $gte: startDate }
      }
    ];
    
    if (excludeBookingId) {
      query._id = { $ne: excludeBookingId };
    }
    
    const overlappingBookings = await Booking.find(query);
    console.log(`Found ${overlappingBookings.length} overlapping ACTIVE bookings`);
    
    // If no overlapping bookings, all vehicles are available
    if (overlappingBookings.length === 0) {
      console.log(`✅ No overlapping ACTIVE bookings. All ${quantity} vehicles available.`);
      console.log('=== AVAILABILITY CHECK END ===');
      return {
        available: true,
        availableQuantity: quantity,
        vehicleQuantity: quantity,
        bookedQuantity: 0
      };
    }
    
    // Calculate day-by-day bookings (ACTIVE BOOKINGS ONLY)
    const dateBookings = {};
    
    // Initialize all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dateBookings[dateStr] = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Count ACTIVE bookings for each day
    overlappingBookings.forEach((booking) => {
      const bookingStart = new Date(booking.pickupDate);
      const bookingEnd = new Date(booking.dropoffDate);
      
      // Reset hours to avoid timezone issues
      bookingStart.setHours(0, 0, 0, 0);
      bookingEnd.setHours(0, 0, 0, 0);
      
      let current = new Date(bookingStart);
      while (current <= bookingEnd) {
        const dateStr = current.toISOString().split('T')[0];
        if (dateBookings[dateStr] !== undefined) {
          dateBookings[dateStr]++;
        }
        current.setDate(current.getDate() + 1);
      }
    });
    
    // Find maximum concurrent ACTIVE bookings on any day
    const bookingCounts = Object.values(dateBookings);
    const maxConcurrentBookings = bookingCounts.length > 0 ? Math.max(...bookingCounts) : 0;
    const availableQuantity = quantity - maxConcurrentBookings;
    
    console.log(`\nSummary (PENDING BOOKINGS EXCLUDED):`);
    console.log(`- Vehicle quantity: ${quantity}`);
    console.log(`- Max concurrent ACTIVE bookings: ${maxConcurrentBookings}`);
    console.log(`- Available quantity: ${availableQuantity}`);
    console.log(`- Is available: ${availableQuantity > 0}`);
    
    console.log('=== AVAILABILITY CHECK END ===');
    
    return {
      available: availableQuantity > 0,
      availableQuantity: Math.max(0, availableQuantity),
      vehicleQuantity: quantity,
      bookedQuantity: maxConcurrentBookings,
      dateBookings: dateBookings
    };
    
  } catch (error) {
    console.error('❌ Error in checkVehicleAvailability:', error);
    throw error;
  }
}

// Helper function to find booking by either bookingId or _id
const findBooking = async (identifier) => {
  // First try to find by bookingId
  let booking = await Booking.findOne({ bookingId: identifier });
  
  // If not found, try by MongoDB _id
  if (!booking) {
    booking = await Booking.findById(identifier);
  }
  
  return booking;
};

// Helper function for fuel charges
function calculateFuelCharge(startLevel, endLevel) {
  const fuelPrices = {
    'empty': 3000, // Full tank price
    'quarter': 2250,
    'half': 1500,
    'three_quarter': 750,
    'full': 0
  };
  
  const startPrice = fuelPrices[startLevel] || 0;
  const endPrice = fuelPrices[endLevel] || 0;
  
  return Math.max(0, startPrice - endPrice);
}

// ==================== ADMIN AUTH ROUTES ====================

// Admin setup endpoint (create admin if doesn't exist)
app.post('/api/admin/setup', async (req, res) => {
  try {
    console.log('🔧 Setting up admin user...');
    
    // Check if admin already exists
    let admin = await Admin.findOne({ username: 'admin' });
    
    if (admin) {
      console.log('ℹ️ Admin already exists:', admin.username);
      return res.json({
        success: true,
        message: 'Admin already exists',
        admin: {
          username: admin.username,
          email: admin.email,
          role: admin.role
        }
      });
    }
    
    // Create new admin user
    const password = 'Admin@123';
    const hash = await bcrypt.hash(password, 10);
    
    admin = new Admin({
      username: 'admin',
      email: 'admin@mjcarrental.com',
      password_hash: hash,
      full_name: 'Administrator',
      role: 'super_admin',
      is_active: true,
      phone: '+919876543210',
      permissions: [
        'view_dashboard',
        'view_bookings',
        'create_bookings',
        'edit_bookings',
        'manage_vehicles',
        'manage_customers',
        'view_reports',
        'manage_admins'
      ],
      created_at: new Date(),
      updated_at: new Date()
    });
    
    await admin.save();
    
    console.log('✅ Admin created successfully!');
    
    res.json({
      success: true,
      message: 'Admin user created successfully',
      credentials: {
        username: 'admin',
        password: 'Admin@123',
        email: 'admin@mjcarrental.com'
      },
      note: 'Use these credentials to login'
    });
    
  } catch (error) {
    console.error('❌ Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check admin endpoint
app.get('/api/admin/check', async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: 'admin' });
    
    if (!admin) {
      return res.json({
        success: false,
        message: 'Admin user not found'
      });
    }
    
    res.json({
      success: true,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        is_active: admin.is_active,
        password_hash: admin.password_hash.substring(0, 30) + '...'
      }
    });
  } catch (error) {
    console.error('Check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin Login Route - SIMPLIFIED FIXED VERSION
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔐 Login attempt for:', username);
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    // Find admin user
    const admin = await Admin.findOne({ 
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() }
      ]
    });
    
    if (!admin) {
      console.log('❌ Admin not found for:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid username or email'
      });
    }
    
    console.log('✅ Admin found:', {
      id: admin._id,
      username: admin.username,
      email: admin.email,
      is_active: admin.is_active,
      role: admin.role
    });
    
    // Check if account is active
    if (!admin.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    // Compare password using bcrypt
    console.log('🔄 Comparing password...');
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    console.log('🔐 Password valid?', isValidPassword);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Update last login
    admin.last_login = new Date();
    admin.login_attempts = 0;
    await admin.save();
    
    // Create JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
    console.log('📝 Creating JWT with secret length:', JWT_SECRET ? JWT_SECRET.length : 0);
    
    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username,
        role: admin.role,
        permissions: admin.permissions || []
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    console.log('✅ Login successful for:', username);
    console.log('📱 Token created (first 50 chars):', token.substring(0, 50) + '...');
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        permissions: admin.permissions || [],
        phone: admin.phone
      }
    });
    
  } catch (error) {
    console.error('🔥 Login error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Admin Logout Route
app.post('/api/admin/auth/logout', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

// Verify Admin Token
app.get('/api/admin/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        valid: false, 
        message: 'No token provided' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
    
    const admin = await Admin.findById(decoded.id).select('-password_hash');
    
    if (!admin) {
      return res.status(401).json({ 
        valid: false, 
        message: 'Admin not found' 
      });
    }
    
    if (!admin.is_active) {
      return res.status(401).json({ 
        valid: false, 
        message: 'Account is deactivated' 
      });
    }
    
    res.json({ 
      valid: true, 
      admin,
      token: token 
    });
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        valid: false, 
        message: 'Token expired' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        valid: false, 
        message: 'Invalid token' 
      });
    }
    
    console.error('Token verification error:', error);
    res.status(500).json({ 
      valid: false, 
      message: 'Server error' 
    });
  }
});

// Get Current Admin Profile
app.get('/api/admin/auth/profile', async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select('-password_hash');
    
    res.json({
      success: true,
      admin
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ==================== BASIC ROUTES ====================

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: '🚗 Kohima Car Rentals API',
    status: 'running',
    endpoints: {
      adminLogin: 'POST /api/admin/auth/login',
      adminLogout: 'POST /api/admin/auth/logout',
      adminVerify: 'GET /api/admin/auth/verify',
      adminProfile: 'GET /api/admin/auth/profile',
      adminSetup: 'POST /api/admin/setup',
      adminCheck: 'GET /api/admin/check',
      vehicles: 'GET /api/vehicles',
      availableVehicles: 'GET /api/vehicles/available',
      checkAvailability: 'POST /api/vehicles/availability',
      vehicleAvailability: 'POST /api/vehicles/:id/availability',
      unavailableDates: 'GET /api/vehicles/:id/unavailable-dates',
      createBooking: 'POST /api/bookings',
      createOrder: 'POST /api/create-razorpay-order',
      verifyPayment: 'POST /api/verify-payment',
      bookings: 'GET /api/bookings',
      health: 'GET /api/health',
      sendNotifications: 'POST /api/bookings/:id/notify',
      testNotifications: 'POST /api/bookings/:id/test-notify',
      notificationStatus: 'GET /api/bookings/:id/notification-status',
      notificationConfig: 'GET /api/notifications/config',
      adminBookings: 'GET /api/admin/bookings',
      adminStats: 'GET /api/admin/stats',
      adminPipeline: 'GET /api/admin/bookings/pipeline'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    notifications: {
      email: process.env.EMAIL_USER ? 'configured' : 'not configured',
      sms: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'not configured'
    }
  });
});

// ==================== VEHICLE ROUTES ====================

// Get all vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ isAvailable: true });
    res.json({ success: true, data: vehicles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available vehicles
app.get('/api/vehicles/available', async (req, res) => {
  try {
    const { pickupDate, dropoffDate } = req.query;
    
    let availableVehicles = await Vehicle.find({ isAvailable: true });
    
    // If dates provided, filter by availability
    if (pickupDate && dropoffDate) {
      const startDate = new Date(pickupDate);
      const endDate = new Date(dropoffDate);
      
      // Validate dates
      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          error: 'Dropoff date must be after pickup date'
        });
      }
      
      // Get ACTIVE bookings that overlap with requested dates
      const overlappingBookings = await Booking.find({
        $or: [
          {
            pickupDate: { $lte: endDate },
            dropoffDate: { $gte: startDate },
            status: { $in: ['confirmed', 'handed_over', 'in_use'] }
          }
        ]
      });
      
      // Get booked vehicle IDs
      const bookedVehicleIds = overlappingBookings.map(booking => 
        booking.vehicleId.toString()
      );
      
      // Filter out booked vehicles
      availableVehicles = availableVehicles.filter(vehicle => 
        !bookedVehicleIds.includes(vehicle._id.toString())
      );
    }
    
    res.json({ 
      success: true, 
      data: availableVehicles,
      message: pickupDate && dropoffDate ? 
        `Found ${availableVehicles.length} vehicles available for selected dates` :
        `Found ${availableVehicles.length} available vehicles`
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check availability for all vehicles in a date range
app.post('/api/vehicles/availability', async (req, res) => {
  try {
    const { pickupDate, dropoffDate } = req.body;
    
    if (!pickupDate || !dropoffDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Pickup and dropoff dates are required' 
      });
    }
    
    const startDate = new Date(pickupDate);
    const endDate = new Date(dropoffDate);
    
    // Validate dates
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'Dropoff date must be after pickup date'
      });
    }
    
    if (startDate < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Pickup date cannot be in the past'
      });
    }
    
    // Get all available vehicles
    const allVehicles = await Vehicle.find({ isAvailable: true });
    
    // Get bookings that overlap with requested dates
    const overlappingBookings = await Booking.find({
      $or: [
        {
          pickupDate: { $lte: endDate },
          dropoffDate: { $gte: startDate },
          status: { $in: ['confirmed', 'handed_over', 'in_use'] }
        }
      ]
    });
    
    // Get booked vehicle IDs
    const bookedVehicleIds = overlappingBookings.map(booking => 
      booking.vehicleId.toString()
    );
    
    // Filter available vehicles
    const availableVehicles = allVehicles.filter(vehicle => 
      !bookedVehicleIds.includes(vehicle._id.toString())
    );
    
    res.json({
      success: true,
      pickupDate,
      dropoffDate,
      totalVehicles: allVehicles.length,
      availableCount: availableVehicles.length,
      bookedCount: bookedVehicleIds.length,
      availableVehicleIds: availableVehicles.map(v => v._id.toString()),
      bookedVehicleIds,
      vehicles: availableVehicles
    });
    
  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check availability for specific vehicle
app.get('/api/vehicles/:vehicleId/availability', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { pickupDate, dropoffDate } = req.query;
    
    if (!pickupDate || !dropoffDate) {
      return res.status(400).json({
        success: false,
        error: 'pickupDate and dropoffDate are required'
      });
    }
    
    const startDate = new Date(pickupDate);
    const endDate = new Date(dropoffDate);
    
    const availability = await checkVehicleAvailability(vehicleId, startDate, endDate);
    
    res.json({
      success: true,
      available: availability.available,
      availableQuantity: availability.availableQuantity,
      vehicleQuantity: availability.vehicleQuantity,
      bookedQuantity: availability.bookedQuantity,
      message: availability.available ? 
        `✅ ${availability.availableQuantity} of ${availability.vehicleQuantity} vehicles available` : 
        `❌ All ${availability.vehicleQuantity} vehicles are booked`
    });
    
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unavailable dates for a vehicle
app.get('/api/vehicles/:vehicleId/unavailable-dates', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }
    
    // Get ONLY confirmed and active bookings (EXCLUDE pending)
    const bookings = await Booking.find({
      vehicleId: vehicleId,
      status: { $in: ['confirmed', 'handed_over', 'in_use'] }
    }).sort({ pickupDate: 1 });
    
    // Generate array of all booked dates (ACTIVE ONLY)
    const unavailableDates = [];
    
    bookings.forEach(booking => {
      const current = new Date(booking.pickupDate);
      const end = new Date(booking.dropoffDate);
      
      while (current <= end) {
        unavailableDates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    });
    
    // Remove duplicates and sort
    const uniqueDates = [...new Set(unavailableDates)].sort();
    
    res.json({
      success: true,
      vehicleId,
      vehicleName: vehicle.name,
      totalActiveBookings: bookings.length,
      unavailableDates: uniqueDates,
      nextAvailableDate: uniqueDates.length > 0 ? 
        new Date(new Date(uniqueDates[uniqueDates.length - 1]).getTime() + 86400000).toISOString().split('T')[0] : 
        new Date().toISOString().split('T')[0]
    });
    
  } catch (error) {
    console.error('Unavailable dates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== BOOKING ROUTES ====================

// Create booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { vehicleId, pickupDate, dropoffDate, ...bookingData } = req.body;
    
    // Check vehicle exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    
    // Parse dates
    const startDate = new Date(pickupDate);
    const endDate = new Date(dropoffDate);
    
    // Validate dates
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'Dropoff date must be after pickup date'
      });
    }
    
    // Check if vehicle is available
    const availabilityCheck = await checkVehicleAvailability(
      vehicleId,
      startDate,
      endDate
    );
    
    if (!availabilityCheck.available) {
      return res.status(400).json({
        success: false,
        error: `Vehicle is not available for the selected dates. Only ${availabilityCheck.availableQuantity} of ${vehicle.quantity} vehicles available.`,
        availableQuantity: availabilityCheck.availableQuantity,
        vehicleQuantity: vehicle.quantity
      });
    }
    
    // Calculate total amount
    const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const totalAmount = vehicle.dailyRate * durationDays;
    
    // Create booking
    const booking = new Booking({
      ...bookingData,
      vehicleId,
      vehicleName: vehicle.name,
      pickupDate: startDate,
      dropoffDate: endDate,
      bookingId: `BOOK${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      totalAmount: totalAmount,
      durationDays: durationDays,
      vehicleDetails: {
        name: vehicle.name,
        type: vehicle.type,
        dailyRate: vehicle.dailyRate,
        capacity: vehicle.capacity,
        transmission: vehicle.transmission
      }
    });
    
    await booking.save();
    
    console.log(`Booking created: ${booking.bookingId} for vehicle ${vehicle.name}`);
    
    res.json({
      success: true,
      message: 'Booking created successfully',
      bookingId: booking.bookingId,
      booking: booking
    });
    
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get booking by ID
app.get('/api/bookings/:id', async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    res.json({ success: true, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all bookings
app.get('/api/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PAYMENT ROUTES ====================

// CREATE RAZORPAY ORDER ENDPOINT
app.post('/api/create-razorpay-order', async (req, res) => {
  try {
    console.log('💳 Creating Razorpay order...');
    
    const { bookingId, amount = 10 } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID is required' 
      });
    }
    
    // Find booking
    const booking = await Booking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    console.log('✅ Found booking:', bookingId);
    
    // Create REAL Razorpay order
    const options = {
      amount: amount,
      currency: 'INR',
      receipt: `receipt_${bookingId}`,
      notes: {
        bookingId: bookingId,
        customerName: booking.customerName,
        vehicleName: booking.vehicleName
      },
      payment_capture: 1
    };

    console.log('Calling Razorpay API with options:', options);
    
    try {
      // Make actual API call to Razorpay
      const order = await razorpay.orders.create(options);
      
      console.log('✅ Razorpay order created:', order.id);
      
      // Update booking with real order ID
      booking.razorpayOrderId = order.id;
      await booking.save();
      
      // Return the order data
      res.json({
        success: true,
        order: {
          id: order.id,
          entity: order.entity,
          amount: order.amount,
          amount_paid: order.amount_paid,
          amount_due: order.amount_due,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          attempts: order.attempts,
          created_at: order.created_at
        },
        key: razorpay.key_id,
        bookingId: bookingId,
        amount: amount,
        message: 'Razorpay order created successfully'
      });
      
    } catch (razorpayError) {
      console.error('❌ Razorpay API Error:', razorpayError);
      
      if (razorpayError.error) {
        return res.status(400).json({
          success: false,
          error: `Razorpay Error: ${razorpayError.error.description || 'Unknown error'}`,
          code: razorpayError.error.code,
          field: razorpayError.error.field
        });
      }
      
      throw razorpayError;
    }
    
  } catch (error) {
    console.error('🔥 Server error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create payment order',
      details: error.message 
    });
  }
});

// Verify payment with notifications
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'All payment details are required' 
      });
    }
    
    // Find booking
    const booking = await Booking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', razorpay.key_secret)
      .update(body.toString())
      .digest('hex');
    
    const isValid = expectedSignature === razorpay_signature;
    
    if (isValid) {
      // Update booking
      booking.razorpayPaymentId = razorpay_payment_id;
      booking.razorpaySignature = razorpay_signature;
      booking.paymentStatus = 'paid';
      booking.status = 'confirmed';
      booking.paymentTimestamp = new Date();
      
      // Add to status history
      booking.statusHistory.push({
        status: 'confirmed',
        timestamp: new Date(),
        actionBy: 'system',
        notes: 'Payment verified and booking confirmed'
      });
      
      await booking.save();
      
      console.log('✅ Payment verified for booking:', bookingId);
      
      // Prepare booking details for notifications
      const bookingDetails = {
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        vehicleId: booking.vehicleId,
        vehicleName: booking.vehicleName,
        pickupDate: booking.pickupDate,
        returnDate: booking.dropoffDate,
        totalDays: booking.totalDays,
        rentalAmount: booking.rentalAmount,
        bookingFee: booking.bookingFee,
        totalAmount: booking.totalAmount,
        createdAt: booking.createdAt
      };
      
      // Send notifications ASYNC (don't wait for response)
      notificationService.sendAllNotifications(bookingDetails)
        .then(result => {
          console.log('📧 Notifications sent for booking:', bookingId, 
            result.success ? 'Success' : 'Partial success');
          
          // Update booking with notification status
          booking.notificationsSent = true;
          booking.notificationsTimestamp = new Date();
          booking.notificationsStatus = result.success ? 'sent' : 'partial';
          booking.save();
        })
        .catch(err => {
          console.error('⚠️ Notifications failed for booking:', bookingId, err.message);
          
          // Still mark as partial
          booking.notificationsSent = false;
          booking.notificationsStatus = 'failed';
          booking.save();
        });
      
      res.json({
        success: true,
        message: 'Payment successful! Booking confirmed. Check your email and phone for confirmation.',
        paymentId: razorpay_payment_id,
        bookingId: bookingId,
        notifications: 'Notifications are being sent...',
        booking: {
          id: booking._id,
          bookingId: booking.bookingId,
          customerName: booking.customerName,
          vehicleName: booking.vehicleName,
          status: booking.status,
          paymentStatus: booking.paymentStatus
        }
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Payment verification failed' 
      });
    }
    
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NOTIFICATION ROUTES ====================

// Send notifications for a booking
app.post('/api/bookings/:id/notify', async (req, res) => {
  try {
    const bookingId = req.params.id;
    console.log('🔔 Sending notifications for booking:', bookingId);
    
    // Find booking
    const booking = await Booking.findOne({ bookingId: bookingId });
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }

    console.log('📋 Found booking:', booking.customerName, booking.vehicleName);
    
    // Prepare booking details for notifications
    const bookingDetails = {
      bookingId: booking.bookingId,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      vehicleId: booking.vehicleId,
      vehicleName: booking.vehicleName,
      pickupDate: booking.pickupDate,
      returnDate: booking.dropoffDate,
      totalDays: booking.totalDays,
      rentalAmount: booking.rentalAmount,
      bookingFee: booking.bookingFee,
      totalAmount: booking.totalAmount,
      createdAt: booking.createdAt
    };

    // Send notifications
    const notificationResult = await notificationService.sendAllNotifications(bookingDetails);
    
    // Update booking with notification status
    booking.notificationsSent = true;
    booking.notificationsTimestamp = new Date();
    booking.notificationsStatus = notificationResult.success ? 'sent' : 'failed';
    await booking.save();

    console.log('✅ Notifications processed for booking:', bookingId);
    
    res.json({
      success: true,
      message: 'Notifications processed successfully',
      bookingId: bookingId,
      notificationResult: notificationResult
    });
    
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: error.message
    });
  }
});

// ==================== ADMIN MANAGEMENT ROUTES ====================

// Get all bookings for admin (with filtering)
app.get('/api/admin/bookings',  async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    
    // Build filter
    const filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { bookingId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
        { vehicleName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get total count for pagination
    const total = await Booking.countDocuments(filter);
    
    // Get paginated bookings
    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: bookings
    });
    
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin dashboard stats
app.get('/api/admin/stats',  async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);
    
    // Get counts by status
    const statusCounts = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get today's pickups
    const todaysPickups = await Booking.countDocuments({
      pickupDate: { $gte: today, $lt: tomorrow },
      status: { $in: ['confirmed', 'handed_over'] }
    });
    
    // Get today's dropoffs
    const todaysDropoffs = await Booking.countDocuments({
      dropoffDate: { $gte: today, $lt: tomorrow },
      status: { $in: ['handed_over', 'in_use'] }
    });

    const pendingBookingsCount = await Booking.countDocuments({
      status: { $in: ['pending'] }
    });
    
    // Get revenue stats
    const revenueStats = await Booking.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          createdAt: { $gte: monthAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          avgRevenue: { $avg: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get recent bookings
    const recentBookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Convert status counts to object
    const statusMap = {};
    statusCounts.forEach(item => {
      statusMap[item._id] = item.count;
    });
    
    res.json({
      success: true,
      stats: {
        totalBookings: await Booking.countDocuments(),
        statusCounts: statusMap,
        todaysPickups,
        todaysDropoffs,
        pendingBookingsCount,
        totalRevenue: revenueStats[0]?.totalRevenue || 0,
        avgBookingValue: revenueStats[0]?.avgRevenue || 0,
        recentBookings: recentBookings.map(b => ({
          bookingId: b.bookingId,
          customerName: b.customerName,
          vehicleName: b.vehicleName,
          status: b.status,
          totalAmount: b.totalAmount,
          createdAt: b.createdAt
        }))
      }
    });
    
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get booking pipeline (for kanban view)
app.get('/api/admin/bookings/pipeline',  async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    // Group by status
    const pipeline = {
      pending: bookings.filter(b => b.status === 'pending'),
      confirmed: bookings.filter(b => b.status === 'confirmed'),
      handed_over: bookings.filter(b => b.status === 'handed_over'),
      in_use: bookings.filter(b => b.status === 'in_use'),
      returned: bookings.filter(b => b.status === 'returned'),
      completed: bookings.filter(b => b.status === 'completed'),
      cancelled: bookings.filter(b => b.status === 'cancelled'),
      overdue: bookings.filter(b => b.status === 'overdue')
    };
    
    res.json({
      success: true,
      pipeline,
      counts: {
        pending: pipeline.pending.length,
        confirmed: pipeline.confirmed.length,
        handed_over: pipeline.handed_over.length,
        in_use: pipeline.in_use.length,
        returned: pipeline.returned.length,
        completed: pipeline.completed.length,
        cancelled: pipeline.cancelled.length,
        overdue: pipeline.overdue.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching pipeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin payment processing endpoint
app.post('/api/admin/bookings/:identifier/payment', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { 
      paymentMethod = 'cash', 
      paymentAmount, 
      paymentStatus = 'paid',
      transactionId,
      paymentNotes,
      processedBy = 'admin'
    } = req.body;
    
    // Find booking by bookingId or _id
    const booking = await findBooking(identifier);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Validate payment amount
    if (paymentAmount && (paymentAmount > booking.totalAmount || paymentAmount <= 0)) {
      return res.status(400).json({
        success: false,
        error: `Invalid payment amount. Must be between 0 and ${booking.totalAmount}`
      });
    }
    
    // Update payment details
    booking.paymentMethod = paymentMethod;
    booking.paymentAmount = paymentAmount || booking.totalAmount;
    booking.paymentStatus = paymentStatus;
    booking.paymentTimestamp = new Date();
    
    // Add transaction ID if provided
    if (transactionId) {
      booking.razorpayPaymentId = transactionId;
    }
    
    // If payment is completed, update booking status
    if (paymentStatus === 'paid') {
      booking.status = 'confirmed';
      
      // Add to status history
      if (!booking.statusHistory) {
        booking.statusHistory = [];
      }
      
      booking.statusHistory.push({
        status: 'confirmed',
        timestamp: new Date(),
        actionBy: processedBy,
        notes: paymentNotes || `Payment processed via ${paymentMethod}`
      });
      
      console.log(`✅ Payment processed for booking: ${booking.bookingId} - ${paymentMethod}: ₹${booking.paymentAmount}`);
    }
    
    await booking.save();
    
    res.json({
      success: true,
      message: `Payment ${paymentStatus} successfully`,
      booking: {
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        vehicleName: booking.vehicleName,
        totalAmount: booking.totalAmount,
        paymentAmount: booking.paymentAmount,
        paymentMethod: booking.paymentMethod,
        paymentStatus: booking.paymentStatus,
        status: booking.status
      }
    });
    
  } catch (error) {
    console.error('❌ Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create manual booking (for admin panel)
app.post('/api/admin/bookings/manual',  async (req, res) => {
  try {
    console.log('📝 Creating manual booking:', req.body);
    
    const {
      customerName,
      customerPhone,
      customerEmail,
      driverLicense,
      vehicleId,
      vehicleName,
      vehicleType,
      dailyRate,
      pickupDate,
      dropoffDate,
      pickupTime = '09:00',
      dropoffTime = '18:00',
      totalAmount,
      advanceAmount = 0,
      paymentMethod = 'cash',
      paymentStatus = 'pending',
      notes,
      createdBy = 'admin',
      manualBooking = true
    } = req.body;
    
    // Validate required fields
    if (!customerName || !customerPhone || !vehicleId || !vehicleName || !pickupDate || !dropoffDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerName, customerPhone, vehicleName, pickupDate, dropoffDate'
      });
    }
    
    // Check if vehicle exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }
    
    // Parse dates
    const startDate = new Date(pickupDate);
    const endDate = new Date(dropoffDate);
    
    // Validate dates
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'Drop-off date must be after pick-up date'
      });
    }
    
    // Check if vehicle is available for the dates
    const availabilityCheck = await checkVehicleAvailability(vehicleId, startDate, endDate);
    
    if (!availabilityCheck.available) {
      return res.status(400).json({
        success: false,
        error: `Vehicle is not available for the selected dates. Only ${availabilityCheck.availableQuantity} of ${vehicle.quantity} available.`,
        availableQuantity: availabilityCheck.availableQuantity,
        vehicleQuantity: vehicle.quantity
      });
    }
    
    // Calculate total days
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Calculate total amount if not provided
    let calculatedTotalAmount = totalAmount;
    if (!calculatedTotalAmount && dailyRate) {
      calculatedTotalAmount = dailyRate * totalDays;
    } else if (!calculatedTotalAmount) {
      calculatedTotalAmount = vehicle.dailyRate * totalDays;
    }
    
    // Generate booking ID
    const bookingId = `MB${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    // Create manual booking
    const booking = new Booking({
      bookingId,
      customerName,
      customerPhone,
      customerEmail,
      driverLicense,
      vehicleId,
      vehicleName,
      vehicleType: vehicleType || vehicle.type,
      dailyRate: dailyRate || vehicle.dailyRate,
      pickupDate: startDate,
      dropoffDate: endDate,
      pickupTime,
      dropoffTime,
      totalDays,
      rentalAmount: calculatedTotalAmount,
      totalAmount: calculatedTotalAmount,
      advanceAmount,
      paymentMethod,
      paymentStatus,
      notes,
      manualBooking: true,
      createdBy,
      status: paymentStatus === 'paid' ? 'confirmed' : 'pending',
      notificationsSent: false,
      notificationsStatus: 'pending',
      statusHistory: [{
        status: paymentStatus === 'paid' ? 'confirmed' : 'pending',
        timestamp: new Date(),
        actionBy: createdBy,
        notes: 'Manual booking created'
      }]
    });
    
    await booking.save();
    
    console.log(`✅ Manual booking created: ${bookingId} for ${customerName}`);
    
    res.json({
      success: true,
      message: 'Manual booking created successfully',
      bookingId: booking.bookingId,
      booking: {
        _id: booking._id,
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        vehicleName: booking.vehicleName,
        pickupDate: booking.pickupDate,
        dropoffDate: booking.dropoffDate,
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        status: booking.status,
        createdBy: booking.createdBy,
        createdAt: booking.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating manual booking:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update booking status (admin actions)
app.put('/api/admin/bookings/:identifier/status',  async (req, res) => {
  try {
    const { identifier } = req.params;
    const { status, notes, actionBy } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    const booking = await findBooking(identifier);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Validate status transition
    const validTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['handed_over', 'cancelled'],
      'handed_over': ['in_use', 'returned', 'cancelled'],
      'in_use': ['returned', 'overdue'],
      'returned': ['completed'],
      'overdue': ['returned', 'completed'],
      'cancelled': []
    };
    
    if (!validTransitions[booking.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status transition from ${booking.status} to ${status}`
      });
    }
    
    // Update booking
    const oldStatus = booking.status;
    booking.status = status;
    booking.updatedAt = new Date();
    
    // Add status history
    if (!booking.statusHistory) {
      booking.statusHistory = [];
    }
    
    booking.statusHistory.push({
      status,
      timestamp: new Date(),
      actionBy: actionBy || 'admin',
      notes: notes || `Status changed from ${oldStatus} to ${status}`
    });
    
    await booking.save();
    
    res.json({
      success: true,
      message: `Booking ${status.replace('_', ' ')} successfully`,
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        customerName: booking.customerName,
        vehicleName: booking.vehicleName,
        pickupDate: booking.pickupDate,
        dropoffDate: booking.dropoffDate
      }
    });
    
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Global error handler:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
    🚀 Server running on port ${PORT}
    🌐 http://localhost:${PORT}
    📅 ${new Date().toLocaleString()}
    
    🔐 Admin Setup: POST /api/admin/setup
    🔐 Admin Login: POST /api/admin/auth/login
    📊 Admin Stats: GET /api/admin/stats
    
    💰 Razorpay Order: POST /api/create-razorpay-order
    🔐 Payment Verify: POST /api/verify-payment
    
    🚗 Vehicles: GET /api/vehicles
    📅 Availability: GET /api/vehicles/available
    
    📊 Health Check: GET /api/health
  `);
});



