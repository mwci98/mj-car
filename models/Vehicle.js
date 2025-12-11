// models/Vehicle.js
const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Hatchback', 'Sedan', 'SUV', 'MUV', 'Luxury']
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  rcNumber: {
    type: String,
    trim: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  transmission: {
    type: String,
    required: true,
    enum: ['Manual', 'Automatic']
  },
  dailyRate: {
    type: Number,
    required: true,
    min: 0
  },
  lateFees: {
    type: Number,
    default: 0
  },
  perKmRate: {
    type: Number,
    default: 0
  },
  minDailyKm: {
    type: Number,
    default: 0
  },
  extraKmRate: {
    type: Number,
    default: 0
  },
  allowedDistricts: [{
    type: String
  }],
  isAvailable: {
    type: Boolean,
    default: true
  },
  features: [{
    type: String
  }],
  image: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Vehicle', vehicleSchema);