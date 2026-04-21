import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import NotificationModel from '../models/Notification.js';
import logger from '../utils/logger.js';

const transporter = nodemailer.createTransport({
  host: config.EMAIL_HOST,
  port: config.EMAIL_PORT,
  secure: config.EMAIL_PORT === 465,
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASS,
  },
});

const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  if (!config.EMAIL_USER || !config.EMAIL_PASS) {
    logger.warn('Email credentials not configured, skipping email send');
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Creative Pottery Studio" <${config.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error });
  }
};

export const createNotification = async (
  userId: string,
  type: 'ORDER' | 'PAYMENT' | 'REFUND' | 'SYSTEM',
  title: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> => {
  await NotificationModel.create({ user: userId, type, title, message, data });
};

export const sendOrderConfirmationEmail = async (
  email: string,
  name: string,
  orderId: string,
  total: number
): Promise<void> => {
  const subject = `Order Confirmed - #${orderId}`;
  const html = `
    <h2>Thank you for your order, ${name}!</h2>
    <p>Your order <strong>#${orderId}</strong> has been confirmed.</p>
    <p>Order Total: <strong>₹${total.toFixed(2)}</strong></p>
    <p>We will notify you when your order is shipped.</p>
    <br/>
    <p>Creative Pottery Studio Team</p>
  `;
  await sendEmail(email, subject, html);
};

export const sendShippingUpdateEmail = async (
  email: string,
  name: string,
  orderId: string,
  trackingNumber: string
): Promise<void> => {
  const subject = `Your order #${orderId} has been shipped`;
  const html = `
    <h2>Great news, ${name}!</h2>
    <p>Your order <strong>#${orderId}</strong> has been shipped.</p>
    <p>Tracking Number: <strong>${trackingNumber}</strong></p>
    <br/>
    <p>Creative Pottery Studio Team</p>
  `;
  await sendEmail(email, subject, html);
};

export const sendRefundUpdateEmail = async (
  email: string,
  name: string,
  orderId: string,
  amount: number,
  status: string
): Promise<void> => {
  const subject = `Refund Update - Order #${orderId}`;
  const html = `
    <h2>Hi ${name},</h2>
    <p>Your refund for order <strong>#${orderId}</strong> has been ${status}.</p>
    <p>Refund Amount: <strong>₹${amount.toFixed(2)}</strong></p>
    <br/>
    <p>Creative Pottery Studio Team</p>
  `;
  await sendEmail(email, subject, html);
};

export const sendPasswordResetOtpEmail = async (
  email: string,
  name: string,
  otp: string,
  expiresInMinutes: number
): Promise<void> => {
  const subject = 'Password Reset OTP';
  const html = `
    <h2>Hello ${name},</h2>
    <p>Use the following one-time password to reset your account password:</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
    <p>This OTP will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
    <p>If you did not request a password reset, you can ignore this email.</p>
    <br/>
    <p>Creative Pottery Studio Team</p>
  `;
  await sendEmail(email, subject, html);
};
