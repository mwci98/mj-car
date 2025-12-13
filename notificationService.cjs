// notificationService.cjs - UPDATED WITH FAST2SMS
const nodemailer = require('nodemailer');
const axios = require('axios');

console.log('📧📱 Notification Service (CJS) Loading...');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'test@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'test'
  }
});

// Company details
const COMPANY_NAME = process.env.COMPANY_NAME || 'MJ Car Rentals';
const COMPANY_PHONE = process.env.COMPANY_PHONE || '1234567890';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

console.log('📧 Email configured for:', process.env.EMAIL_USER || 'Not configured');
console.log('📱 SMS configured:', process.env.FAST2SMS_API_KEY ? 'Yes (Fast2SMS)' : 'No');

class NotificationService {
  constructor() {
    console.log('📧📱 NotificationService instance created');
  }

  /**
   * Send SMS via Fast2SMS
   */
  async sendFast2SMS(phoneNumber, message) {
    try {
      const apiKey = process.env.FAST2SMS_API_KEY;
      if (!apiKey) {
        console.log('⚠️ Fast2SMS API key not configured');
        return { success: false, error: 'Fast2SMS API key not configured' };
      }

      // Format phone number
      let phone = phoneNumber.toString().trim();
      
      // Remove any non-digit characters
      phone = phone.replace(/\D/g, '');
      
      // Remove leading 0 if present
      if (phone.startsWith('0')) {
        phone = phone.substring(1);
      }
      
      // Ensure it's 10 digits
      if (phone.length !== 10) {
        console.log('⚠️ Invalid phone number length:', phone);
        return { success: false, error: 'Invalid phone number length. Must be 10 digits.' };
      }
      
      // Fast2SMS requires 10-digit Indian numbers
      // Format: 91XXXXXXXXXX (12 digits)
      const formattedPhone = `91${phone}`;
      
      console.log('📱 Sending SMS via Fast2SMS to:', phone);
      console.log('Message:', message.substring(0, 50) + '...');
      
      const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
        sender_id: process.env.FAST2SMS_SENDER_ID || 'FSTSMS',
        message: message,
        language: "english",
        route: "q", // q for promotional, t for transactional
        numbers: formattedPhone
      }, {
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Fast2SMS response:', response.data);
      
      if (response.data.return === true) {
        return {
          success: true,
          service: 'fast2sms',
          requestId: response.data.request_id,
          messageId: response.data.message_id || response.data.request_id
        };
      } else {
        return {
          success: false,
          service: 'fast2sms',
          error: response.data.message || 'Unknown error'
        };
      }
      
    } catch (error) {
      console.error('❌ Fast2SMS Error:', error.response?.data || error.message);
      return {
        success: false,
        service: 'fast2sms',
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Send SMS to customer
   */
  async sendSMSToCustomer(customerPhone, bookingDetails) {
    try {
      if (!customerPhone) {
        console.log('⚠️ Customer phone not provided');
        return { success: false, error: 'Customer phone not provided' };
      }

      // Format dates
      const pickupDate = new Date(bookingDetails.pickupDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      
      const returnDate = new Date(bookingDetails.returnDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      const message = `
🎉 Booking Confirmed!
Booking ID: ${bookingDetails.bookingId}
Vehicle: ${bookingDetails.vehicleName}
Dates: ${pickupDate} to ${returnDate}
Amount: ₹${bookingDetails.totalAmount}
Booking Fee: ₹${bookingDetails.bookingFee || 200} paid
Balance: ₹${bookingDetails.totalAmount - (bookingDetails.bookingFee || 200)} at pickup

Thank you for choosing ${COMPANY_NAME}! Call ${COMPANY_PHONE} for queries.
      `.trim();

      return await this.sendFast2SMS(customerPhone, message);
      
    } catch (error) {
      console.error('❌ SMS to customer failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS to admin
   */
  async sendSMSToAdmin(bookingDetails) {
    try {
      if (!ADMIN_PHONE) {
        console.log('⚠️ ADMIN_PHONE not configured');
        return { success: false, error: 'ADMIN_PHONE not configured' };
      }

      const message = `
🚨 NEW BOOKING!
ID: ${bookingDetails.bookingId}
Customer: ${bookingDetails.customerName}
Phone: ${bookingDetails.customerPhone}
Vehicle: ${bookingDetails.vehicleName}
Amount: ₹${bookingDetails.totalAmount}
Pickup: ${new Date(bookingDetails.pickupDate).toLocaleDateString('en-IN')}
      `.trim();

      return await this.sendFast2SMS(ADMIN_PHONE, message);
      
    } catch (error) {
      console.error('❌ SMS to admin failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email to customer
   */
  async sendBookingEmailToCustomer(customerEmail, bookingDetails) {
    try {
      console.log('📧 Sending email to customer:', customerEmail);
      
      if (!customerEmail || !customerEmail.includes('@')) {
        console.log('⚠️ Invalid customer email:', customerEmail);
        return { success: false, error: 'Invalid email address' };
      }

      const mailOptions = {
        from: `"${COMPANY_NAME}" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `🎉 Booking Confirmation - ${bookingDetails.vehicleName}`,
        html: this.generateCustomerEmail(bookingDetails),
        text: this.generateCustomerEmailText(bookingDetails)
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent to customer:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email to customer failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email to admin
   */
  async sendBookingEmailToAdmin(bookingDetails) {
    try {
      if (!ADMIN_EMAIL) {
        console.log('⚠️ Admin email not configured');
        return { success: false, error: 'Admin email not configured' };
      }

      console.log('📧 Sending email to admin:', ADMIN_EMAIL);
      
      const mailOptions = {
        from: `"${COMPANY_NAME}" <${process.env.EMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `📋 NEW BOOKING - ${bookingDetails.bookingId}`,
        html: this.generateAdminEmail(bookingDetails),
        text: this.generateAdminEmailText(bookingDetails)
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent to admin:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email to admin failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate customer email HTML
   */
  generateCustomerEmail(bookingDetails) {
    const pickupDate = new Date(bookingDetails.pickupDate).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const returnDate = new Date(bookingDetails.returnDate).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation - ${COMPANY_NAME}</title>
</head>
<body>
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1>🎉 Booking Confirmed!</h1>
      <p>Dear ${bookingDetails.customerName},</p>
    </div>
    
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Your booking has been successfully confirmed! Here are your booking details:</p>
      
      <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2>📋 Booking Summary</h2>
        <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
        <p><strong>Vehicle:</strong> ${bookingDetails.vehicleName}</p>
        <p><strong>Pickup Date:</strong> ${pickupDate}</p>
        <p><strong>Return Date:</strong> ${returnDate}</p>
        <p><strong>Duration:</strong> ${bookingDetails.totalDays || '1'} day(s)</p>
        
        <h3>💰 Payment Summary</h3>
        <p><strong>Total Rental Amount:</strong> ₹${bookingDetails.totalAmount}</p>
        <p><strong>Booking Fee Paid:</strong> ₹${bookingDetails.bookingFee || 200}</p>
        <p><strong>Balance to Pay at Pickup:</strong> ₹${bookingDetails.totalAmount - (bookingDetails.bookingFee || 200)}</p>
      </div>
      
      <p><strong>📱 Important Notes:</strong></p>
      <ul>
        <li>Please bring your original driving license and ID proof (Aadhar/Passport)</li>
        <li>Pay the remaining balance at vehicle pickup</li>
        <li>For any changes, contact us at least 24 hours before pickup</li>
      </ul>
      
      <p><strong>📞 Contact Information:</strong></p>
      <p>${COMPANY_NAME}<br>
      Phone: ${COMPANY_PHONE}<br>
      Email: ${process.env.EMAIL_USER}</p>
      
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
        <p>Thank you for choosing ${COMPANY_NAME}!</p>
        <p>Safe travels! 🚗💨</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate customer email text version
   */
  generateCustomerEmailText(bookingDetails) {
    return `
Booking Confirmation - ${COMPANY_NAME}

Dear ${bookingDetails.customerName},

Your booking has been successfully confirmed!

📋 Booking Details:
Booking ID: ${bookingDetails.bookingId}
Vehicle: ${bookingDetails.vehicleName}
Pickup Date: ${new Date(bookingDetails.pickupDate).toLocaleDateString('en-IN')}
Return Date: ${new Date(bookingDetails.returnDate).toLocaleDateString('en-IN')}
Duration: ${bookingDetails.totalDays || '1'} day(s)

💰 Payment Summary:
Total Rental Amount: ₹${bookingDetails.totalAmount}
Booking Fee Paid: ₹${bookingDetails.bookingFee || 200}
Balance to Pay at Pickup: ₹${bookingDetails.totalAmount - (bookingDetails.bookingFee || 200)}

📱 Important Notes:
• Please bring your original driving license and ID proof (Aadhar/Passport)
• Pay the remaining balance at vehicle pickup
• For any changes, contact us at least 24 hours before pickup

📞 Contact Information:
${COMPANY_NAME}
Phone: ${COMPANY_PHONE}
Email: ${process.env.EMAIL_USER}

Thank you for choosing ${COMPANY_NAME}!
Safe travels! 🚗💨
    `;
  }

  /**
   * Generate admin email HTML
   */
  generateAdminEmail(bookingDetails) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NEW BOOKING - ${COMPANY_NAME}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h1>🚨 NEW BOOKING ALERT</h1>
  
  <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h2>IMMEDIATE ACTION REQUIRED</h2>
    <p>A new booking has been received and requires processing!</p>
  </div>
  
  <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 10px 0;">
    <strong>⚠️ ACTION ITEMS:</strong>
    <ol>
      <li>Contact customer to confirm pickup time</li>
      <li>Prepare vehicle for handover</li>
      <li>Update booking status in system</li>
    </ol>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h2>📋 Booking Details</h2>
    <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
    <p><strong>Customer Name:</strong> ${bookingDetails.customerName}</p>
    <p><strong>Customer Phone:</strong> ${bookingDetails.customerPhone}</p>
    <p><strong>Customer Email:</strong> ${bookingDetails.customerEmail}</p>
    <p><strong>Vehicle:</strong> ${bookingDetails.vehicleName}</p>
    <p><strong>Total Amount:</strong> ₹${bookingDetails.totalAmount}</p>
    <p><strong>Booking Fee Paid:</strong> ₹${bookingDetails.bookingFee || 200}</p>
    <p><strong>Pickup Date:</strong> ${new Date(bookingDetails.pickupDate).toLocaleDateString('en-IN')}</p>
    <p><strong>Return Date:</strong> ${new Date(bookingDetails.returnDate).toLocaleDateString('en-IN')}</p>
    <p><strong>Booked at:</strong> ${new Date(bookingDetails.createdAt).toLocaleString('en-IN')}</p>
  </div>
  
  <p><strong>Quick Actions:</strong></p>
  <ul>
    <li><a href="tel:${bookingDetails.customerPhone}">📞 Call Customer</a></li>
    <li><a href="mailto:${bookingDetails.customerEmail}">✉️ Email Customer</a></li>
  </ul>
</body>
</html>
    `;
  }

  /**
   * Generate admin email text version
   */
  generateAdminEmailText(bookingDetails) {
    return `
NEW BOOKING ALERT - ${COMPANY_NAME}

🚨 IMMEDIATE ACTION REQUIRED
A new booking has been received and requires processing!

⚠️ ACTION ITEMS:
1. Contact customer to confirm pickup time
2. Prepare vehicle for handover
3. Update booking status in system

📋 Booking Details:
Booking ID: ${bookingDetails.bookingId}
Customer: ${bookingDetails.customerName}
Phone: ${bookingDetails.customerPhone}
Email: ${bookingDetails.customerEmail}
Vehicle: ${bookingDetails.vehicleName}
Amount: ₹${bookingDetails.totalAmount}
Booking Fee: ₹${bookingDetails.bookingFee || 200}
Pickup: ${new Date(bookingDetails.pickupDate).toLocaleDateString('en-IN')}
Return: ${new Date(bookingDetails.returnDate).toLocaleDateString('en-IN')}
Booked at: ${new Date(bookingDetails.createdAt).toLocaleString('en-IN')}

Quick Actions:
• Call customer: ${bookingDetails.customerPhone}
• Email customer: ${bookingDetails.customerEmail}
    `;
  }

  /**
   * Send all notifications (Email + SMS to customer and admin)
   */
  async sendAllNotifications(bookingDetails) {
    console.log('📧📱 sendAllNotifications called for:', bookingDetails.bookingId);
    
    const results = {
      customerEmail: { success: false },
      customerSMS: { success: false },
      adminEmail: { success: false },
      adminSMS: { success: false }
    };

    try {
      // 1. Send email to customer
      if (bookingDetails.customerEmail) {
        results.customerEmail = await this.sendBookingEmailToCustomer(
          bookingDetails.customerEmail, 
          bookingDetails
        );
      } else {
        results.customerEmail.error = 'No customer email provided';
      }

      // 2. Send SMS to customer
      if (bookingDetails.customerPhone) {
        results.customerSMS = await this.sendSMSToCustomer(
          bookingDetails.customerPhone,
          bookingDetails
        );
      } else {
        results.customerSMS.error = 'No customer phone provided';
      }

      // 3. Send email to admin
      if (ADMIN_EMAIL) {
        results.adminEmail = await this.sendBookingEmailToAdmin(bookingDetails);
      } else {
        results.adminEmail.error = 'ADMIN_EMAIL not configured';
      }

      // 4. Send SMS to admin
      if (ADMIN_PHONE) {
        results.adminSMS = await this.sendSMSToAdmin(bookingDetails);
      } else {
        results.adminSMS.error = 'ADMIN_PHONE not configured';
      }

      // Count successes
      const successful = Object.values(results).filter(r => r.success).length;
      const totalAttempted = Object.keys(results).length;
      
      console.log(`📊 Notification Summary: ${successful}/${totalAttempted} successful`);
      console.log('Results:', JSON.stringify(results, null, 2));

      return {
        success: successful > 0,
        results: results,
        summary: {
          totalAttempted: totalAttempted,
          successful: successful,
          failed: totalAttempted - successful
        }
      };

    } catch (error) {
      console.error('🔥 Error in sendAllNotifications:', error);
      return {
        success: false,
        error: error.message,
        results: results
      };
    }
  }

  /**
   * Test SMS service
   */
  async testSMS(phoneNumber, message = 'Test SMS from MJ Car Rentals') {
    console.log('🧪 Testing SMS service...');
    return await this.sendFast2SMS(phoneNumber, message);
  }
}

// Export instance
module.exports = new NotificationService();
