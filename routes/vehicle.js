const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');

// Get all vehicles with filters
router.get('/', async (req, res) => {
  try {
    const { type, capacity, transmission, minPrice, maxPrice, search } = req.query;
    
    const filter = { isAvailable: true };
    
    if (type) filter.type = type;
    if (capacity) filter.capacity = { $gte: parseInt(capacity) };
    if (transmission) filter.transmission = transmission;
    if (minPrice || maxPrice) {
      filter.dailyRate = {};
      if (minPrice) filter.dailyRate.$gte = parseInt(minPrice);
      if (maxPrice) filter.dailyRate.$lte = parseInt(maxPrice);
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
      ];
    }

    const vehicles = await Vehicle.find(filter).sort({ dailyRate: 1 });
    
    res.json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available vehicles for dates
router.post('/available', async (req, res) => {
  try {
    const { pickupDate, dropoffDate, type, capacity } = req.body;
    
    if (!pickupDate || !dropoffDate) {
      return res.status(400).json({ error: 'Pickup and dropoff dates are required' });
    }

    // Get all bookings for the date range
    const bookedVehicles = await Booking.find({
      'dates.pickup': { $lte: new Date(dropoffDate) },
      'dates.dropoff': { $gte: new Date(pickupDate) },
      status: { $in: ['confirmed', 'pending'] },
    }).distinct('vehicle');

    // Find available vehicles
    const filter = { 
      _id: { $nin: bookedVehicles },
      isAvailable: true,
    };
    
    if (type) filter.type = type;
    if (capacity) filter.capacity = { $gte: parseInt(capacity) };

    const availableVehicles = await Vehicle.find(filter);

    res.json({
      success: true,
      count: availableVehicles.length,
      data: availableVehicles,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get vehicle by ID or slug
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      $or: [
        { _id: req.params.id },
        { slug: req.params.id },
      ],
    });

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create vehicle (admin only)
router.post('/', async (req, res) => {
  try {
    const vehicle = new Vehicle(req.body);
    await vehicle.save();
    
    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update vehicle
router.put('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete vehicle
router.delete('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { isAvailable: false },
      { new: true }
    );

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({
      success: true,
      message: 'Vehicle marked as unavailable',
      data: vehicle,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;