/**
 * Backfill payment_transactions.metadata.eventTitle from events collection.
 *
 * Usage:
 *   node scripts/backfill-payment-transaction-event-titles.js --project-id=momsfitnessmojo-65d00 --dry-run
 *   node scripts/backfill-payment-transaction-event-titles.js --project-id=momsfitnessmojo-65d00 --apply
 */

const admin = require('firebase-admin');

const PROJECT_ID =
  process.argv.find((arg) => arg.startsWith('--project-id='))?.split('=')[1] ||
  process.env.FIREBASE_PROJECT_ID ||
  'momsfitnessmojo-65d00';
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const looksLikeEventId = (value) => /^[A-Za-z0-9_-]{16,}$/.test(String(value || ''));
const normalizeTitle = (value) => String(value || '').trim();
const isMeaningfulTitle = (value) => {
  const cleaned = normalizeTitle(value);
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  if (lower === 'event' || lower === 'untitled' || lower === 'untitled event') return false;
  return !looksLikeEventId(cleaned);
};

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const db = admin.firestore();

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  const [eventsSnap, txSnap] = await Promise.all([
    db.collection('events').get(),
    db.collection('payment_transactions').get(),
  ]);

  const eventTitleById = new Map();
  eventsSnap.forEach((doc) => {
    const title = normalizeTitle(doc.data()?.title);
    if (isMeaningfulTitle(title)) {
      eventTitleById.set(doc.id, title);
    }
  });

  let reviewed = 0;
  let eligible = 0;
  let updated = 0;
  let missingEvent = 0;
  const batchSize = 400;
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of txSnap.docs) {
    reviewed += 1;
    const data = doc.data() || {};
    const eventId = String(data.eventId || '').trim();
    const txTitle = normalizeTitle(data?.metadata?.eventTitle);
    const canonicalTitle = eventTitleById.get(eventId);

    if (!eventId || !canonicalTitle) {
      if (!canonicalTitle) missingEvent += 1;
      continue;
    }

    if (isMeaningfulTitle(txTitle) && txTitle === canonicalTitle) {
      continue;
    }

    if (isMeaningfulTitle(txTitle) && txTitle !== canonicalTitle) {
      continue;
    }

    eligible += 1;
    if (!DRY_RUN) {
      const metadata = { ...(data.metadata || {}), eventTitle: canonicalTitle };
      batch.update(doc.ref, {
        metadata,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchOps += 1;
      if (batchOps >= batchSize) {
        await batch.commit();
        updated += batchOps;
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (!DRY_RUN && batchOps > 0) {
    await batch.commit();
    updated += batchOps;
  }

  console.log(`Reviewed transactions: ${reviewed}`);
  console.log(`Eligible for backfill: ${eligible}`);
  console.log(`Missing canonical event title: ${missingEvent}`);
  console.log(`Updated transactions: ${DRY_RUN ? 0 : updated}`);
  if (DRY_RUN) {
    console.log('No writes performed. Run with --apply to execute updates.');
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err?.message || err);
  process.exit(1);
});

