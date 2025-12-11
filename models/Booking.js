const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true,
    uppercase: true,
  },
  customer: {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    aadharNumber: String,
    drivingLicense: String,
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
  },
  dates: {
    pickup: {
      type: Date,
      required: true,
    },
    dropoff: {
      type: Date,
      required: true,
    },
  },
  totalDays: {
    type: Number,
    min: 1,
  },
  location: {
    pickup: {
      address: String,
      city: String,
      landmark: String,
    },
    dropoff: {
      address: String,
      city: String,
      landmark: String,
    },
    sameLocation: {
      type: Boolean,
      default: true,
    },
  },
  pricing: {
    vehicleRate: Number,
    driverRate: Number,
    discount: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    totalAmount: Number,
    advancePaid: {
      type: Number,
      default: 0,
    },
    balanceAmount: Number,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
    default: 'pending',
    index: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'refunded'],
    default: 'pending',
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer'],
  },
  specialRequests: String,
  driverRequired: {
    type: Boolean,
    default: false,
  },
  driverDetails: {
    name: String,
    license: String,
    phone: String,
  },
  notes: String,
  cancellationReason: String,
  cancellationDate: Date,
  completedAt: Date,
}, {
  timestamps: true,
});

// Generate booking ID before saving
bookingSchema.pre('save', async function(next) {
  if (!this.bookingId) {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments();
    this.bookingId = `KCR${year}${month}${(count + 1).toString().padStart(4, '0')}`;
  }
  
  // Calculate total days
  if (this.dates.pickup && this.dates.dropoff) {
    const diffTime = Math.abs(this.dates.dropoff - this.dates.pickup);
    this.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  next();
});

// Indexes for better query performance
bookingSchema.index({ 'customer.email': 1 });
bookingSchema.index({ 'customer.phone': 1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ 'dates.pickup': 1, 'dates.dropoff': 1 });
bookingSchema.index({ bookingId: 1 });

// Virtual for booking status color
bookingSchema.virtual('statusColor').get(function() {
  const colors = {
    pending: 'warning',
    confirmed: 'success',
    cancelled: 'danger',
    completed: 'info',
    'no-show': 'secondary',
  };
  return colors[this.status] || 'secondary';
});

module.exports = mongoose.model('Booking', bookingSchema);