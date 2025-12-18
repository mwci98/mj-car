// notificationService.cjs - FIXED VERSION
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Twilio configuration (SMS)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

// Email Templates
const emailTemplates = {
  customerConfirmation: (booking) => `
    <h2>🎉 Booking Confirmed! 🚗</h2>
    <p>Dear ${booking.customerName},</p>
    
    <p>Your booking with <strong>MJ Car Rentals</strong> has been confirmed!</p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
      <h3>📋 Booking Details:</h3>
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      <p><strong>Vehicle:</strong> ${booking.vehicleName}</p>
      <p><strong>Pickup Date:</strong> ${new Date(booking.pickupDate).toLocaleDateString()}</p>
      <p><strong>Return Date:</strong> ${new Date(booking.returnDate).toLocaleDateString()}</p>
      <p><strong>Total Amount:</strong> ₹${booking.totalAmount}</p>
      <p><strong>Duration:</strong> ${booking.totalDays} days</p>
    </div>
    
    <p><strong>📍 Pickup Location:</strong> Kohima Car Rental Station</p>
    <p><strong>🕒 Pickup Time:</strong> 9:00 AM</p>
    
    <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h4>📝 Important Notes:</h4>
      <ul>
        <li>Please bring your original driver's license and ID proof</li>
        <li>Arrive 30 minutes before pickup time for documentation</li>
        <li>Balance payment of ₹${booking.totalAmount - 200} to be paid at pickup</li>
        <li>Vehicle inspection will be done at pickup time</li>
      </ul>
    </div>
    
    <p>Need help? Call us at +91 70053 01679</p>
    <p>Thank you for choosing MJ Car Rentals! 🚗</p>
  `,

  adminNotification: (booking) => `
    <h3>📋 New Booking Alert!</h3>
    
    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      <p><strong>Customer:</strong> ${booking.customerName}</p>
      <p><strong>Phone:</strong> ${booking.customerPhone}</p>
      <p><strong>Email:</strong> ${booking.customerEmail}</p>
      <p><strong>Vehicle:</strong> ${booking.vehicleName}</p>
      <p><strong>Dates:</strong> ${new Date(booking.pickupDate).toLocaleDateString()} to ${new Date(booking.returnDate).toLocaleDateString()}</p>
      <p><strong>Amount:</strong> ₹${booking.totalAmount}</p>
      <p><strong>Booking Time:</strong> ${new Date(booking.createdAt).toLocaleString()}</p>
    </div>
    
    <p style="color: #666; font-size: 12px;">This is an automated notification from MJ Car Rental System</p>
  `
};

// SMS Templates
const smsTemplates = {
  customerConfirmation: (booking) => 
    `🎉 Booking Confirmed! Booking ID: ${booking.bookingId}. Vehicle: ${booking.vehicleName}. Pickup: ${new Date(booking.pickupDate).toLocaleDateString()}. Balance: ₹${booking.totalAmount - 200} to pay at pickup. MJ Car Rentals - +917005301679`,

  adminSMS: (booking) =>
    `📋 New Booking: ${booking.bookingId}. ${booking.customerName} - ${booking.vehicleName}. Dates: ${new Date(booking.pickupDate).toLocaleDateString()}. Check admin panel for details.`
};

// Main notification function
async function sendAllNotifications(bookingDetails) {
  const results = {
    email: { success: false, error: null },
    sms: { success: false, error: null },
    adminEmail: { success: false, error: null },
    adminSMS: { success: false, error: null }
  };

  try {
    console.log('🔔 Starting notifications for booking:', bookingDetails.bookingId);

    // 1. Send email to customer
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        const customerMailOptions = {
          from: `"MJ Car Rentals" <${process.env.EMAIL_USER}>`,
          to: bookingDetails.customerEmail,
          subject: `Booking Confirmed - ${bookingDetails.bookingId}`,
          html: emailTemplates.customerConfirmation(bookingDetails)
        };

        await transporter.sendMail(customerMailOptions);
        results.email.success = true;
        console.log('✅ Customer email sent to:', bookingDetails.customerEmail);
      } catch (emailError) {
        results.email.error = emailError.message;
        console.error('❌ Customer email failed:', emailError.message);
      }
    }

    // 2. Send SMS to customer
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        await twilioClient.messages.create({
          body: smsTemplates.customerConfirmation(bookingDetails),
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+91${bookingDetails.customerPhone.replace(/\D/g, '')}`
        });
        results.sms.success = true;
        console.log('✅ Customer SMS sent to:', bookingDetails.customerPhone);
      } catch (smsError) {
        results.sms.error = smsError.message;
        console.error('❌ Customer SMS failed:', smsError.message);
      }
    }

    // 3. Send email to admin
    if (process.env.ADMIN_EMAIL && process.env.EMAIL_USER) {
      try {
        const adminMailOptions = {
          from: `"MJ Car Rentals System" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: `New Booking Alert - ${bookingDetails.bookingId}`,
          html: emailTemplates.adminNotification(bookingDetails)
        };

        await transporter.sendMail(adminMailOptions);
        results.adminEmail.success = true;
        console.log('✅ Admin email sent to:', process.env.ADMIN_EMAIL);
      } catch (adminEmailError) {
        results.adminEmail.error = adminEmailError.message;
        console.error('❌ Admin email failed:', adminEmailError.message);
      }
    }

    // 4. Send SMS to admin
    if (twilioClient && process.env.ADMIN_PHONE) {
      try {
        await twilioClient.messages.create({
          body: smsTemplates.adminSMS(bookingDetails),
          from: process.env.TWILIO_PHONE_NUMBER,
          to: process.env.ADMIN_PHONE
        });
        results.adminSMS.success = true;
        console.log('✅ Admin SMS sent to:', process.env.ADMIN_PHONE);
      } catch (adminSMSError) {
        results.adminSMS.error = adminSMSError.message;
        console.error('❌ Admin SMS failed:', adminSMSError.message);
      }
    }

    // Determine overall success
    const overallSuccess = 
      results.email.success || 
      results.sms.success || 
      results.adminEmail.success || 
      results.adminSMS.success;

    return {
      success: overallSuccess,
      results,
      bookingId: bookingDetails.bookingId,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('🔥 Error in sendAllNotifications:', error);
    return {
      success: false,
      error: error.message,
      bookingId: bookingDetails.bookingId
    };
  }
}

// Test function
async function testNotifications() {
  const testBooking = {
    bookingId: 'TEST' + Date.now(),
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '9876543210',
    vehicleName: 'Test Vehicle',
    pickupDate: new Date(),
    returnDate: new Date(Date.now() + 86400000),
    totalDays: 1,
    totalAmount: 2010,
    rentalAmount: 2000,
    bookingFee: 10,
    createdAt: new Date()
  };

  console.log('🧪 Testing notification system...');
  const result = await sendAllNotifications(testBooking);
  console.log('Test result:', result);
  return result;
}

// Export functions
module.exports = {
  sendAllNotifications,
  testNotifications,
  emailTemplates,
  smsTemplates
};
