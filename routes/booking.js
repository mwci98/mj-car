const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');

// Validation middleware
const validateBooking = (req, res, next) => {
  const { customer, vehicleId, dates } = req.body;
  
  if (!customer?.name || !customer?.email || !customer?.phone) {
    return res.status(400).json({ error: 'Missing customer information' });
  }
  
  if (!vehicleId) {
    return res.status(400).json({ error: 'Vehicle ID is required' });
  }
  
  if (!dates?.pickup || !dates?.dropoff) {
    return res.status(400).json({ error: 'Pickup and dropoff dates are required' });
  }
  
  const pickupDate = new Date(dates.pickup);
  const dropoffDate = new Date(dates.dropoff);
  
  if (pickupDate >= dropoffDate) {
    return res.status(400).json({ error: 'Dropoff date must be after pickup date' });
  }
  
  if (pickupDate < new Date()) {
    return res.status(400).json({ error: 'Pickup date cannot be in the past' });
  }
  
  next();
};

// Create booking
router.post('/', validateBooking, async (req, res) => {
  try {
    const { customer, vehicleId, dates, location, driverRequired, specialRequests } = req.body;

    // Get vehicle
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Check availability
    const availability = await checkVehicleAvailability(vehicleId, dates.pickup, dates.dropoff);
    if (!availability.isAvailable) {
      return res.status(400).json({ 
        error: 'Vehicle not available for selected dates',
        conflictingDates: availability.conflictingDates,
      });
    }

    // Calculate pricing
    const pickupDate = new Date(dates.pickup);
    const dropoffDate = new Date(dates.dropoff);
    const totalDays = Math.ceil((dropoffDate - pickupDate) / (1000 * 60 * 60 * 24));
    
    const vehicleRate = vehicle.dailyRate * totalDays;
    const driverRate = driverRequired ? vehicle.driverCostPerDay * totalDays : 0;
    const subtotal = vehicleRate + driverRate;
    const tax = subtotal * 0.18; // 18% GST
    const totalAmount = subtotal + tax;

    // Create booking
    const booking = new Booking({
      customer,
      vehicle: vehicleId,
      dates: {
        pickup: pickupDate,
        dropoff: dropoffDate,
      },
      totalDays,
      location,
      driverRequired,
      driverDetails: driverRequired ? req.body.driverDetails : undefined,
      pricing: {
        vehicleRate,
        driverRate,
        tax,
        totalAmount,
        balanceAmount: totalAmount,
      },
      specialRequests,
    });

    await booking.save();
    await booking.populate('vehicle');

    // Send confirmation (in production, you'd use email/WhatsApp)
    // await sendBookingConfirmation(booking);

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      bookingId: booking.bookingId,
      data: booking,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate booking ID' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get bookings with filters
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      startDate, 
      endDate, 
      vehicleType,
      page = 1,
      limit = 10,
      sort = '-createdAt'
    } = req.query;

    const filter = {};
    
    if (status) filter.status = status;
    if (vehicleType) filter['vehicle.type'] = vehicleType;
    
    if (startDate || endDate) {
      filter['dates.pickup'] = {};
      if (startDate) filter['dates.pickup'].$gte = new Date(startDate);
      if (endDate) filter['dates.pickup'].$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(filter)
      .populate('vehicle')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get booking by ID or bookingId
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.findOne({
      $or: [
        { _id: req.params.id },
        { bookingId: req.params.id.toUpperCase() },
      ],
    }).populate('vehicle');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update booking status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, cancellationReason } = req.body;
    
    const update = { status };
    if (status === 'cancelled' && cancellationReason) {
      update.cancellationReason = cancellationReason;
      update.cancellationDate = new Date();
    }
    if (status === 'completed') {
      update.completedAt = new Date();
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('vehicle');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      message: `Booking ${status}`,
      data: booking,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update payment status
router.patch('/:id/payment', async (req, res) => {
  try {
    const { paymentStatus, paymentMethod, advancePaid } = req.body;
    
    const update = {};
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (paymentMethod) update.paymentMethod = paymentMethod;
    if (advancePaid !== undefined) {
      update['pricing.advancePaid'] = advancePaid;
      update['pricing.balanceAmount'] = update.pricing?.totalAmount - advancePaid;
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('vehicle');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      message: 'Payment updated',
      data: booking,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard statistics
router.get('/stats/dashboard', async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      monthlyRevenue,
      yearlyRevenue,
      popularVehicles,
    ] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.aggregate([
        { $match: { 
          status: { $in: ['confirmed', 'completed'] },
          createdAt: { $gte: startOfMonth }
        }},
        { $group: { _id: null, total: { $sum: '$pricing.totalAmount' }}},
      ]),
      Booking.aggregate([
        { $match: { 
          status: { $in: ['confirmed', 'completed'] },
          createdAt: { $gte: startOfYear }
        }},
        { $group: { _id: null, total: { $sum: '$pricing.totalAmount' }}},
      ]),
      Booking.aggregate([
        { $match: { status: { $in: ['confirmed', 'completed'] }}},
        { $group: { _id: '$vehicle', count: { $sum: 1 }}},
        { $sort: { count: -1 }},
        { $limit: 5 },
        { $lookup: {
          from: 'vehicles',
          localField: '_id',
          foreignField: '_id',
          as: 'vehicle',
        }},
        { $unwind: '$vehicle' },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalBookings,
        confirmedBookings,
        pendingBookings,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        yearlyRevenue: yearlyRevenue[0]?.total || 0,
        popularVehicles,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check availability
router.post('/check-availability', async (req, res) => {
  try {
    const { vehicleId, pickupDate, dropoffDate } = req.body;

    const availability = await checkVehicleAvailability(vehicleId, pickupDate, dropoffDate);
    
    res.json({
      success: true,
      ...availability,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function for availability check
async function checkVehicleAvailability(vehicleId, pickupDate, dropoffDate) {
  const overlappingBookings = await Booking.find({
    vehicle: vehicleId,
    $or: [
      {
        'dates.pickup': { $lte: new Date(dropoffDate) },
        'dates.dropoff': { $gte: new Date(pickupDate) },
      },
    ],
    status: { $in: ['confirmed', 'pending'] },
  }).select('dates pickup dropoff');

  return {
    isAvailable: overlappingBookings.length === 0,
    conflictingDates: overlappingBookings.map(b => ({
      pickup: b.dates.pickup,
      dropoff: b.dates.dropoff,
    })),
  };
}

module.exports = router;        