import { Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

interface StripeCustomerProfile {
  email: string;
  name: string;
}

/**
 * Ensure a Stripe Customer exists for the payment and has a visible name.
 * Stripe Dashboard uses the customer object for the Customer field, so we
 * create or refresh it with the user's name and email before creating the PI.
 */
export async function ensureStripeCustomer(
  db: Firestore,
  stripe: Stripe,
  profile: StripeCustomerProfile,
  customerId?: string,
  cacheUserId?: string
): Promise<Stripe.Customer> {
  const email = profile.email.trim().toLowerCase();
  const name = profile.name.trim() || 'Member';

  if (customerId) {
    try {
      return await stripe.customers.update(customerId, {
        email,
        name,
      });
    } catch (error) {
      console.warn('⚠️ Failed to update existing Stripe customer, recreating it:', error);
    }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      source: 'mfm-payment',
    },
  });

  // Best-effort cache for authenticated users so later payments reuse the same Stripe customer.
  if (customer.id && cacheUserId) {
    try {
      await db.collection('users').doc(cacheUserId).set(
        { stripeCustomerId: customer.id },
        { merge: true }
      );
    } catch (error) {
      console.warn('⚠️ Unable to cache Stripe customer id:', error);
    }
  }

  return customer;
}
