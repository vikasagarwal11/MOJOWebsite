
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { RRule } from 'rrule';
import * as ics from 'ical';

admin.initializeApp();
const db = admin.firestore();

// Set STRIPE_SECRET in your environment (firebase functions:config:set stripe.secret="sk_..." )
const stripe = new Stripe(functions.config().stripe?.secret || '', { apiVersion: '2024-04-10' });

/** Create a checkout session for an event RSVP */
export const createCheckoutSession = functions.https.onCall(async (data, context) => {
  const { eventId, userId, adults = 1, kids = 0 } = data;
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');

  const evSnap = await db.collection('events').doc(eventId).get();
  if (!evSnap.exists) throw new functions.https.HttpsError('not-found', 'Event not found');
  const ev = evSnap.data()!;

  if (!ev.isPaid || !ev.priceCents) throw new functions.https.HttpsError('failed-precondition', 'Event is free');

  // In production you would create a Price in Stripe dashboard and reference it here.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: adults + kids,
      price_data: {
        currency: ev.currency || 'usd',
        product_data: { name: ev.title },
        unit_amount: ev.priceCents,
      }
    }],
    success_url: data.successUrl,
    cancel_url: data.cancelUrl,
    metadata: { eventId, userId },
  });

  return { id: session.id, url: session.url };
});

/** Stripe webhook: mark RSVP as paid */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = functions.config().stripe?.webhook_secret;
  let evt: Stripe.Event;
  try {
    evt = stripe.webhooks.constructEvent(req.rawBody, sig as string, secret);
  } catch (err: any) {
    console.error(err);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (evt.type === 'checkout.session.completed') {
    const session = evt.data.object as Stripe.Checkout.Session;
    const eventId = session.metadata?.eventId;
    const userId = session.metadata?.userId;
    if (eventId && userId) {
      const rsvpRef = db.collection('events').doc(eventId).collection('rsvps').doc(userId);
      await rsvpRef.set({ paymentStatus: 'paid', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  res.json({ received: true });
});

/** ICS feed of public events */
export const publicEventsIcs = functions.https.onRequest(async (_req, res) => {
  const snap = await db.collection('events').where('visibility', '==', 'public').get();
  const cal = ics({ name: 'Public Events' });
  snap.forEach(doc => {
    const ev = doc.data();
    cal.createEvent({
      start: dateTuple(ev.startAt.toDate()),
      end: dateTuple(ev.endAt.toDate()),
      summary: ev.title,
      description: ev.description,
      location: ev.location,
      url: ev.url || undefined,
    });
  });
  res.set('Content-Type', 'text/calendar');
  res.send(cal.toString());
});

function dateTuple(d: Date) {
  return [d.getFullYear(), d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes()];
}
