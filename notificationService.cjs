const nodemailer = require('nodemailer');

console.log('📧 Notification Service (CJS) Loading...');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'test@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'test'
  }
});

console.log('📧 Email configured for:', process.env.EMAIL_USER);

class NotificationService {
  constructor() {
    console.log('📧 NotificationService instance created');
  }

  /**
   * Send email to customer
   */
  async sendBookingEmailToCustomer(customerEmail, bookingDetails) {
    try {
      console.log('📧 Sending email to customer:', customerEmail);
      
      const mailOptions = {
        from: `"Mj car Rentals" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `🎉 Booking Confirmation - ${bookingDetails.vehicleName}`,
        html: this.generateCustomerEmail(bookingDetails),
        text: `Booking ID: ${bookingDetails.bookingId}\nVehicle: ${bookingDetails.vehicleName}\nAmount: ₹${bookingDetails.totalAmount}`
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
  async sendBookingEmailToAdmin(adminEmail, bookingDetails) {
    try {
      console.log('📧 Sending email to admin:', adminEmail);
      
      const mailOptions = {
        from: `"Mj car Rentals" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: `📋 NEW BOOKING - ${bookingDetails.bookingId}`,
        html: this.generateAdminEmail(bookingDetails),
        text: `New Booking: ${bookingDetails.bookingId}\nCustomer: ${bookingDetails.customerName}\nPhone: ${bookingDetails.customerPhone}`
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
    return `
      <h1>🎉 Booking Confirmed!</h1>
      <p>Dear ${bookingDetails.customerName},</p>
      <p>Your booking has been successfully confirmed!</p>
      <div style="background: #f0f8ff; padding: 20px; border-radius: 10px;">
        <h3>Booking Details:</h3>
        <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
        <p><strong>Vehicle:</strong> ${bookingDetails.vehicleName}</p>
        <p><strong>Total Amount:</strong> ₹${bookingDetails.totalAmount}</p>
        <p><strong>Booking Fee Paid:</strong> ₹10</p>
        <p><strong>Remaining Amount:</strong> ₹${bookingDetails.totalAmount - 10}</p>
      </div>
      <p>Thank you for choosing MJ Car Rentals!</p>
    `;
  }

  /**
   * Generate admin email HTML
   */
  generateAdminEmail(bookingDetails) {
    return `
      <h1>📋 NEW BOOKING ALERT</h1>
      <div style="background: #fff3cd; padding: 20px; border-radius: 10px;">
        <h3>IMMEDIATE ACTION REQUIRED</h3>
        <p>A new booking has been received!</p>
      </div>
      <h3>Booking Details:</h3>
      <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
      <p><strong>Customer:</strong> ${bookingDetails.customerName}</p>
      <p><strong>Phone:</strong> ${bookingDetails.customerPhone}</p>
      <p><strong>Email:</strong> ${bookingDetails.customerEmail}</p>
      <p><strong>Vehicle:</strong> ${bookingDetails.vehicleName}</p>
      <p><strong>Amount:</strong> ₹${bookingDetails.totalAmount}</p>
      <p><strong>Booked at:</strong> ${new Date(bookingDetails.createdAt).toLocaleString()}</p>
    `;
  }

  /**
   * Send all notifications
   */
  async sendAllNotifications(bookingDetails) {
    console.log('📧 sendAllNotifications called for:', bookingDetails.bookingId);
    
    const results = {
      customerEmail: { success: false },
      adminEmail: { success: false }
    };

    try {
      // Check if email is configured
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.error('❌ Email not configured in .env');
        return {
          success: false,
          error: 'Email credentials not configured in .env file'
        };
      }

      // 1. Send email to customer
      if (bookingDetails.customerEmail) {
        results.customerEmail = await this.sendBookingEmailToCustomer(
          bookingDetails.customerEmail, 
          bookingDetails
        );
      }

      // 2. Send email to admin
      if (process.env.ADMIN_EMAIL) {
        results.adminEmail = await this.sendBookingEmailToAdmin(
          process.env.ADMIN_EMAIL,
          bookingDetails
        );
      }

      // Count successes
      const successful = Object.values(results).filter(r => r.success).length;
      
      console.log(`📊 Notification Summary: ${successful}/2 successful`);

      return {
        success: successful > 0,
        results: results,
        summary: {
          totalAttempted: 2,
          successful: successful,
          failed: 2 - successful
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
}

// Export instance
module.exports = new NotificationService();
