const nodemailer = require('nodemailer');

let waClient = null;

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT, 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function setWhatsAppClient(client) {
  waClient = client;
}

function formatListing(listing) {
  return [
    `${listing.title}`,
    `Prijs:    €${listing.price}`,
    `Kamers:   ${listing.rooms}`,
    `Opp.:     ${listing.surface} m²`,
    `Locatie:  ${listing.location}`,
    `URL:      ${listing.url}`,
  ].join('\n');
}

async function sendWhatsApp(text) {
  if (waClient && process.env.WHATSAPP_TO) {
    try {
      const chatId = process.env.WHATSAPP_TO.replace('+', '') + '@c.us';
      await waClient.sendMessage(chatId, text);
    } catch (err) {
      console.error('[notifier] WhatsApp failed:', err.message);
    }
  }
}

async function notify(listing) {
  const subject = `[immoscrape] ${listing.vendor} — ${listing.title}`;
  const body = formatListing(listing);

  // Email
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to:      process.env.EMAIL_TO,
      subject,
      text:    body,
    });
    console.log(`[notifier] Email sent for ${listing.vendor}/${listing.id}`);
  } catch (err) {
    console.error(`[notifier] Email failed for ${listing.vendor}/${listing.id}:`, err.message);
  }

  // WhatsApp
  await sendWhatsApp(`${subject}\n\n${body}`);
  if (waClient && process.env.WHATSAPP_TO) {
    console.log(`[notifier] WhatsApp sent for ${listing.vendor}/${listing.id}`);
  }
}

module.exports = { setWhatsAppClient, sendWhatsApp, notify };
