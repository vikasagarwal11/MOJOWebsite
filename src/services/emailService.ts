import { ContactMessageFormData } from '../types/contact';

export class EmailService {
  // Send email notification to admin when new contact message is received
  static async notifyAdminOfNewMessage(messageData: ContactMessageFormData): Promise<void> {
    try {
      // For now, we'll just log the email content
      // In production, you would integrate with an email service like:
      // - SendGrid
      // - AWS SES
      // - Nodemailer with SMTP
      // - Firebase Cloud Functions with email service
      
      const emailContent = {
        to: 'momsfitnessmojo@gmail.com',
        subject: `New Contact Message: ${messageData.inquiryType.toUpperCase()} - ${messageData.name}`,
        html: `
          <h2>New Contact Message Received</h2>
          <p><strong>Name:</strong> ${messageData.name}</p>
          <p><strong>Email:</strong> ${messageData.email}</p>
          <p><strong>Phone:</strong> ${messageData.phone || 'Not provided'}</p>
          <p><strong>Inquiry Type:</strong> ${messageData.inquiryType}</p>
          <p><strong>Message:</strong></p>
          <p>${messageData.message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><em>This message was sent via the Moms Fitness Mojo contact form.</em></p>
        `,
        text: `
New Contact Message Received

Name: ${messageData.name}
Email: ${messageData.email}
Phone: ${messageData.phone || 'Not provided'}
Inquiry Type: ${messageData.inquiryType}

Message:
${messageData.message}

---
This message was sent via the Moms Fitness Mojo contact form.
        `
      };
      
      console.log('📧 Email notification would be sent:', emailContent);
      
      // TODO: Implement actual email sending
      // Example with SendGrid:
      // await sgMail.send(emailContent);
      
      // Example with AWS SES:
      // await ses.sendEmail({
      //   Destination: { ToAddresses: [emailContent.to] },
      //   Message: {
      //     Body: { Html: { Data: emailContent.html } },
      //     Subject: { Data: emailContent.subject }
      //   },
      //   Source: 'noreply@momsfitnessmojo.com'
      // }).promise();
      
    } catch (error) {
      console.error('Failed to send email notification:', error);
      // Don't throw error - email failure shouldn't break the contact form
    }
  }
}
