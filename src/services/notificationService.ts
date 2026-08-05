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

const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<void> => {
  if (!config.EMAIL_USER || !config.EMAIL_PASS) {
    logger.warn('Email credentials not configured, skipping email send');
    return;
  }
  try {
    await transporter.sendMail({
      from: `"${config.STORE_NAME}" <${config.EMAIL_USER}>`,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
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
  total: number,
  items?: Array<{ name: string; quantity: number; price: number }>,
  address?: string
): Promise<void> => {
  const subject = `✅ Order Confirmed — #${orderId.slice(-8).toUpperCase()}`;

  const inr = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(v);

  const itemRows = (items ?? [])
    .map(
      (it) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #f0ede8;font-size:13px;color:#1c1917;">${it.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f0ede8;text-align:center;font-size:13px;color:#1c1917;">${it.quantity}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f0ede8;text-align:right;font-size:13px;color:#1c1917;">${inr(it.price)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f0ede8;text-align:right;font-size:13px;font-weight:600;color:#1c1917;">${inr(it.price * it.quantity)}</td>
      </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f2ea;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ea;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#b45309;padding:28px 32px;">
            <p style="margin:0;font-size:12px;color:#fde68a;letter-spacing:0.12em;text-transform:uppercase;">Order Confirmation</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;">${config.STORE_NAME}</h1>
          </td>
        </tr>

        <!-- Success banner -->
        <tr>
          <td style="background:#ecfdf5;padding:18px 32px;border-bottom:1px solid #d1fae5;">
            <p style="margin:0;font-size:16px;font-weight:700;color:#065f46;">
              🎉 Thank you for your order, ${name}!
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:#047857;">
              Your order <strong>#${orderId.slice(-8).toUpperCase()}</strong> has been confirmed and is being prepared.
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">

            ${items && items.length > 0 ? `
            <!-- Order items -->
            <h2 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">Items Ordered</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#f5f5f4;">
                  <th style="padding:10px 14px;text-align:left;font-size:12px;color:#78716c;font-weight:600;">Product</th>
                  <th style="padding:10px 14px;text-align:center;font-size:12px;color:#78716c;font-weight:600;">Qty</th>
                  <th style="padding:10px 14px;text-align:right;font-size:12px;color:#78716c;font-weight:600;">Price</th>
                  <th style="padding:10px 14px;text-align:right;font-size:12px;color:#78716c;font-weight:600;">Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
              <tfoot>
                <tr style="background:#fef3c7;">
                  <td colspan="3" style="padding:12px 14px;text-align:right;font-size:14px;font-weight:700;color:#92400e;">Total Paid</td>
                  <td style="padding:12px 14px;text-align:right;font-size:14px;font-weight:700;color:#92400e;">${inr(total)}</td>
                </tr>
              </tfoot>
            </table>
            ` : `
            <!-- Fallback total only -->
            <div style="background:#fef3c7;border-radius:8px;padding:16px 20px;margin-bottom:24px;display:flex;justify-content:space-between;">
              <span style="font-size:15px;font-weight:700;color:#92400e;">Total Paid</span>
              <span style="font-size:15px;font-weight:700;color:#92400e;">${inr(total)}</span>
            </div>
            `}

            ${address ? `
            <!-- Delivery address -->
            <h2 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">Delivery Address</h2>
            <div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:14px 16px;margin-bottom:24px;font-size:13px;color:#1c1917;line-height:1.6;">
              ${address.replace(/,\s*/g, '<br/>')}
            </div>
            ` : ''}

            <!-- What's next -->
            <h2 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">What happens next?</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="padding:8px 0;vertical-align:top;width:36px;font-size:20px;">📦</td>
                <td style="padding:8px 0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#1c1917;">Your order is being packed</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#78716c;">Our team will carefully pack your pottery items for safe delivery.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;width:36px;font-size:20px;">🚚</td>
                <td style="padding:8px 0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#1c1917;">Shipping update on the way</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#78716c;">You'll receive a tracking notification once your order ships.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;width:36px;font-size:20px;">❤️</td>
                <td style="padding:8px 0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#1c1917;">Thank you for supporting us</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#78716c;">Each piece is handcrafted with care. We hope you love it.</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <div style="text-align:center;">
              <a href="${config.FRONTEND_URL}/orders"
                 style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;">
                View My Orders
              </a>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f4;padding:18px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a8a29e;">
              Questions? Reply to this email or contact us at
              <a href="mailto:${config.STORE_EMAIL}" style="color:#b45309;">${config.STORE_EMAIL}</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#d6d3d1;">${config.STORE_NAME} · Handcrafted with ❤️</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(email, subject, html);
};

/**
 * Unified order-status email — sends a branded update for every status transition.
 * Called by the admin controller whenever an order status changes.
 */
export const sendOrderStatusEmail = async (params: {
  email: string;
  name: string;
  orderId: string;
  status: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  trackingNumber?: string;
  customMessage?: string;
  total?: number;
}): Promise<void> => {
  const { email, name, orderId, status, trackingNumber, customMessage, total } = params;
  const shortId = orderId.slice(-8).toUpperCase();

  const inr = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(v);

  type StatusMeta = {
    emoji: string;
    subject: string;
    bannerBg: string;
    bannerBorder: string;
    bannerTextColor: string;
    headline: string;
    subline: string;
    steps: Array<{ icon: string; title: string; body: string }>;
    ctaLabel: string;
    ctaHref: string;
  };

  const META: Record<string, StatusMeta> = {
    CONFIRMED: {
      emoji: '✅',
      subject: `Order Confirmed — #${shortId}`,
      bannerBg: '#ecfdf5',
      bannerBorder: '#d1fae5',
      bannerTextColor: '#065f46',
      headline: `Your order is confirmed, ${name}!`,
      subline: `We've received your order <strong>#${shortId}</strong> and it's now confirmed.`,
      steps: [
        { icon: '📦', title: 'Getting ready', body: 'Our team will start packing your items shortly.' },
        { icon: '🚚', title: 'Shipping soon', body: "You'll get a shipping update once it's dispatched." },
        { icon: '🏠', title: 'Doorstep delivery', body: 'Sit back — your pottery is on its way to you.' },
      ],
      ctaLabel: 'View Order',
      ctaHref: `${config.FRONTEND_URL}/orders`,
    },
    PROCESSING: {
      emoji: '🔧',
      subject: `Your Order Is Being Prepared — #${shortId}`,
      bannerBg: '#eff6ff',
      bannerBorder: '#bfdbfe',
      bannerTextColor: '#1e40af',
      headline: `We're packing your order, ${name}!`,
      subline: `Order <strong>#${shortId}</strong> is being carefully packed and prepared for dispatch.`,
      steps: [
        { icon: '🧑‍🎨', title: 'Handcrafted with care', body: 'Each piece is inspected before packing.' },
        { icon: '📦', title: 'Packaging in progress', body: 'Your items are being wrapped securely.' },
        { icon: '🚚', title: 'Dispatch coming up', body: "We'll email you again when it ships." },
      ],
      ctaLabel: 'View Order',
      ctaHref: `${config.FRONTEND_URL}/orders`,
    },
    SHIPPED: {
      emoji: '🚚',
      subject: `Your Order Has Shipped — #${shortId}`,
      bannerBg: '#fefce8',
      bannerBorder: '#fde68a',
      bannerTextColor: '#854d0e',
      headline: `Your order is on its way, ${name}!`,
      subline: `Order <strong>#${shortId}</strong> has been dispatched and is headed to your doorstep.`,
      steps: [
        { icon: '📬', title: 'Package dispatched', body: 'Your parcel has left our studio.' },
        { icon: '🗺️', title: 'In transit', body: trackingNumber ? `Track your package with ID: <strong>${trackingNumber}</strong>` : 'Your package is currently in transit.' },
        { icon: '🏠', title: 'Estimated delivery', body: 'Typically 3-7 business days depending on your location.' },
      ],
      ctaLabel: 'Track Order',
      ctaHref: `${config.FRONTEND_URL}/orders`,
    },
    DELIVERED: {
      emoji: '🎉',
      subject: `Your Order Has Been Delivered — #${shortId}`,
      bannerBg: '#ecfdf5',
      bannerBorder: '#d1fae5',
      bannerTextColor: '#065f46',
      headline: `Your order arrived, ${name}! 🎉`,
      subline: `Order <strong>#${shortId}</strong> has been marked as delivered. We hope you love it!`,
      steps: [
        { icon: '❤️', title: 'Thank you!', body: 'We hope your pottery brings joy to your space.' },
        { icon: '⭐', title: 'Share your experience', body: 'Leave a review and help other customers discover our work.' },
        { icon: '🛍️', title: 'Shop again', body: 'Browse our latest collection for more handcrafted pieces.' },
      ],
      ctaLabel: 'Write a Review',
      ctaHref: `${config.FRONTEND_URL}/orders`,
    },
    CANCELLED: {
      emoji: '❌',
      subject: `Order Cancelled — #${shortId}`,
      bannerBg: '#fef2f2',
      bannerBorder: '#fecaca',
      bannerTextColor: '#991b1b',
      headline: `Your order has been cancelled, ${name}`,
      subline: `Order <strong>#${shortId}</strong> has been cancelled.${total ? ` If payment was made, a refund of <strong>${inr(total)}</strong> will be processed shortly.` : ''}`,
      steps: [
        { icon: '💳', title: 'Refund', body: 'If payment was collected, refund will be credited within 5-7 business days.' },
        { icon: '📞', title: 'Need help?', body: `Reply to this email or contact us at <a href="mailto:${config.STORE_EMAIL}" style="color:#b45309;">${config.STORE_EMAIL}</a>` },
        { icon: '🛍️', title: 'Shop again', body: 'We\'d love to serve you again. Browse our latest collection anytime.' },
      ],
      ctaLabel: 'Continue Shopping',
      ctaHref: `${config.FRONTEND_URL}/categories`,
    },
  };

  const m = META[status];
  if (!m) return;

  const stepRows = m.steps.map((s) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:40px;font-size:22px;">${s.icon}</td>
      <td style="padding:10px 0;vertical-align:top;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#1c1917;">${s.title}</p>
        <p style="margin:3px 0 0;font-size:12px;color:#78716c;line-height:1.5;">${s.body}</p>
      </td>
    </tr>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f2ea;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ea;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#b45309;padding:24px 32px;">
            <p style="margin:0;font-size:12px;color:#fde68a;letter-spacing:0.12em;text-transform:uppercase;">Order Update</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;">${config.STORE_NAME}</h1>
          </td>
        </tr>

        <!-- Status banner -->
        <tr>
          <td style="background:${m.bannerBg};padding:18px 32px;border-bottom:2px solid ${m.bannerBorder};">
            <p style="margin:0;font-size:18px;font-weight:700;color:${m.bannerTextColor};">
              ${m.emoji} ${m.headline}
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:${m.bannerTextColor};opacity:0.85;">${m.subline}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">

            <!-- Order ID chip -->
            <div style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 14px;margin-bottom:24px;">
              <span style="font-size:12px;color:#78716c;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Order</span>
              <span style="font-size:13px;color:#92400e;font-weight:700;margin-left:8px;font-family:monospace;">#${shortId}</span>
            </div>

            ${customMessage ? `
            <!-- Custom admin message -->
            <div style="background:#fafaf9;border-left:4px solid #b45309;padding:12px 16px;margin-bottom:24px;border-radius:0 8px 8px 0;">
              <p style="margin:0;font-size:13px;color:#1c1917;line-height:1.6;">${customMessage}</p>
            </div>
            ` : ''}

            <!-- Steps -->
            <h2 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">What this means</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              ${stepRows}
            </table>

            <!-- CTA -->
            <div style="text-align:center;margin-top:4px;">
              <a href="${m.ctaHref}"
                 style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;">
                ${m.ctaLabel}
              </a>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f4;padding:18px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a8a29e;">
              Questions? Reply to this email or reach us at
              <a href="mailto:${config.STORE_EMAIL}" style="color:#b45309;">${config.STORE_EMAIL}</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#d6d3d1;">${config.STORE_NAME} · Handcrafted with ❤️</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(email, m.subject, html);
};

/**
 * @deprecated Use sendOrderStatusEmail instead.
 * Kept for backward compatibility — wraps the new unified function.
 */
export const sendShippingUpdateEmail = async (
  email: string,
  name: string,
  orderId: string,
  trackingNumber: string
): Promise<void> => {
  await sendOrderStatusEmail({ email, name, orderId, status: 'SHIPPED', trackingNumber });
};

export const sendRefundUpdateEmail = async (
  email: string,
  name: string,
  orderId: string,
  amount: number,
  status: string
): Promise<void> => {
  const shortId = orderId.slice(-8).toUpperCase();
  const inr = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(v);

  const isApproved = status.toUpperCase() === 'APPROVED' || status.toUpperCase() === 'REFUNDED';
  const subject = `💰 Refund ${isApproved ? 'Approved' : 'Update'} — Order #${shortId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f2ea;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ea;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#b45309;padding:24px 32px;">
            <p style="margin:0;font-size:12px;color:#fde68a;letter-spacing:0.12em;text-transform:uppercase;">Refund Update</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;">${config.STORE_NAME}</h1>
          </td>
        </tr>

        <!-- Banner -->
        <tr>
          <td style="background:${isApproved ? '#ecfdf5' : '#fef2f2'};padding:18px 32px;border-bottom:2px solid ${isApproved ? '#d1fae5' : '#fecaca'};">
            <p style="margin:0;font-size:18px;font-weight:700;color:${isApproved ? '#065f46' : '#991b1b'};">
              ${isApproved ? '✅' : 'ℹ️'} Refund ${status} for Order #${shortId}
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:${isApproved ? '#047857' : '#b91c1c'};">
              Hi ${name}, your refund of <strong>${inr(amount)}</strong> has been ${status.toLowerCase()}.
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;color:#78716c;font-size:13px;width:120px;">Order</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;font-size:13px;font-weight:600;color:#1c1917;font-family:monospace;">#${shortId}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;color:#78716c;font-size:13px;">Refund Amount</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;font-size:14px;font-weight:700;color:#b45309;">${inr(amount)}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#78716c;font-size:13px;">Status</td>
                <td style="padding:12px 16px;font-size:13px;font-weight:600;color:${isApproved ? '#065f46' : '#1c1917'};">${status}</td>
              </tr>
            </table>

            ${isApproved ? `
            <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;margin-bottom:24px;border-radius:0 8px 8px 0;">
              <p style="margin:0;font-size:13px;color:#15803d;line-height:1.6;">
                💳 The refund will appear in your original payment method within <strong>5–7 business days</strong> depending on your bank.
              </p>
            </div>` : ''}

            <div style="text-align:center;">
              <a href="${config.FRONTEND_URL}/orders"
                 style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;">
                View My Orders
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f4;padding:18px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a8a29e;">
              Questions? Reply to this email or reach us at
              <a href="mailto:${config.STORE_EMAIL}" style="color:#b45309;">${config.STORE_EMAIL}</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#d6d3d1;">${config.STORE_NAME} · Handcrafted with ❤️</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
    <p>${config.STORE_NAME} Team</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Sends a new-order notification email to the store admin inbox.
 * Recipient is controlled by STORE_ADMIN_EMAIL env var.
 */
export const sendNewOrderAdminEmail = async (params: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  total: number;
  items: Array<{ name: string; quantity: number; price: number }>;
  address?: string;
}): Promise<void> => {
  if (!config.STORE_ADMIN_EMAIL) {
    logger.warn('STORE_ADMIN_EMAIL not configured, skipping admin order notification');
    return;
  }

  const { orderId, customerName, customerEmail, customerPhone, total, items, address } = params;
  const inr = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(v);

  const itemRows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;">${it.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center;">${it.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;">${inr(it.price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;">${inr(it.price * it.quantity)}</td>
      </tr>`
    )
    .join('');

  const subject = `🛒 New Order #${orderId} — ${inr(total)} from ${customerName}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f2ea;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ea;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#b45309;padding:24px 32px;">
            <p style="margin:0;font-size:13px;color:#fde68a;letter-spacing:0.1em;text-transform:uppercase;">New Order Received</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;">${config.STORE_NAME}</h1>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#fef3c7;padding:14px 32px;border-bottom:1px solid #fde68a;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#92400e;">
              🛒 New order <strong>#${orderId}</strong> just came in!
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">

            <!-- Customer info -->
            <h2 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">Customer Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;width:120px;color:#78716c;font-size:13px;">Name</td>
                <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:13px;font-weight:600;color:#1c1917;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;color:#78716c;font-size:13px;">Email</td>
                <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:13px;color:#1c1917;">
                  <a href="mailto:${customerEmail}" style="color:#b45309;">${customerEmail}</a>
                </td>
              </tr>
              ${customerPhone ? `
              <tr>
                <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;color:#78716c;font-size:13px;">Phone</td>
                <td style="padding:10px 16px;border-bottom:1px solid #e7e5e4;font-size:13px;color:#1c1917;">${customerPhone}</td>
              </tr>` : ''}
              ${address ? `
              <tr>
                <td style="padding:10px 16px;color:#78716c;font-size:13px;vertical-align:top;">Ship to</td>
                <td style="padding:10px 16px;font-size:13px;color:#1c1917;">${address}</td>
              </tr>` : ''}
            </table>

            <!-- Items -->
            <h2 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">Order Items</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#f5f5f4;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#78716c;">Product</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;color:#78716c;">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#78716c;">Unit Price</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#78716c;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
              <tfoot>
                <tr style="background:#fef3c7;">
                  <td colspan="3" style="padding:12px 12px;text-align:right;font-size:14px;font-weight:700;color:#92400e;">Total</td>
                  <td style="padding:12px 12px;text-align:right;font-size:14px;font-weight:700;color:#92400e;">${inr(total)}</td>
                </tr>
              </tfoot>
            </table>

            <!-- CTA -->
            <div style="text-align:center;margin-top:8px;">
              <a href="${config.FRONTEND_URL}/admin/orders"
                 style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;">
                View Order in Admin
              </a>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f4;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a8a29e;">
              This is an automated notification from ${config.STORE_NAME}.<br/>
              Reply to this email to contact the customer directly.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Reply-To set to customer email so admin can reply directly to them
  await sendEmail(config.STORE_ADMIN_EMAIL, subject, html, customerEmail);
};
