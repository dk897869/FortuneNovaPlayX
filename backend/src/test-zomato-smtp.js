const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testMail() {
  console.log('Testing FortuneNovaPlayX-style SMTP connection for:', process.env.SMTP_USER);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // secure: false for port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    console.log('Verifying transporter connection...');
    await transporter.verify();
    console.log('Transporter verification SUCCESSFUL!');

    console.log('Attempting to send test mail to:', process.env.SMTP_USER);
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@fortuneplayx.local',
      to: process.env.SMTP_USER,
      subject: 'FortunePlayX Zomato SMTP Test Mail',
      text: 'This is a Zomato-style test mail from your FortunePlayX backend connection test!',
      html: '<b>This is a Zomato-style test mail from your FortunePlayX backend connection test!</b>'
    });
    console.log('Email sent successfully! MessageId:', info.messageId);
  } catch (error) {
    console.error('SMTP Connection/Send FAILED:', error);
  }
}

testMail();
