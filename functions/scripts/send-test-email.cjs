const admin = require('firebase-admin');

async function main() {
  const projectId = process.env.FIREBASE_PROJECT || 'momsfitnessmojo-dev';
  const toEmail = process.argv[2];

  if (!toEmail) {
    console.error('Usage: node scripts/send-test-email.cjs <to-email>');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  const db = admin.firestore();

  const doc = await db.collection('mail').add({
    to: toEmail,
    message: {
      subject: 'Test Email from Moms Fitness Mojo',
      text: 'This is a test email from the Trigger Email extension.',
      html: '<p>This is a <strong>test email</strong> from the Trigger Email extension.</p>',
    },
  });

  console.log('Queued test email. Mail doc id:', doc.id);
}

main().catch((err) => {
  console.error('Failed to queue test email:', err);
  process.exit(1);
});
