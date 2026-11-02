import nodemailer, { type Transporter } from "nodemailer";
import { newId, run } from "./db";

let transport: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Sends (or, with no SMTP configured, logs) an email and keeps a copy in the outbox. */
export async function sendEmail(to: string, subject: string, body: string, eventId: string | null = null) {
  const id = newId();
  run("INSERT INTO email_outbox (id, event_id, to_email, subject, body) VALUES (?,?,?,?,?)", id, eventId, to, subject, body);
  const t = getTransport();
  if (!t) {
    console.log(`[email] to=${to} subject=${subject}`);
    run("UPDATE email_outbox SET status='logged' WHERE id=?", id);
    return;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM, to, subject, text: body });
    run("UPDATE email_outbox SET status='sent' WHERE id=?", id);
  } catch (e) {
    console.error("[email] failed", e);
    run("UPDATE email_outbox SET status='failed' WHERE id=?", id);
  }
}

export const appName = () => process.env.APP_NAME || "Racekit";
export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
