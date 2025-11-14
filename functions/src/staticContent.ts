import { getFirestore } from 'firebase-admin/firestore';
import { manualUpsertKnowledgeSource, type KnowledgeVisibilityLevel } from './knowledgeBase';

type StaticKnowledgeEntry = {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  url: string;
  visibility: KnowledgeVisibilityLevel;
};

const STATIC_ENTRIES: StaticKnowledgeEntry[] = [
  {
    id: 'home_highlights',
    title: 'What Makes Moms Fitness Mojo Special',
    summary: 'Our home page showcases the mix of movement, connection, inspiration, and expansion that defines the community.',
    body: [
      'Fun Fitness That Fits Your Life — From hikes, tennis, and dance sessions to weekly challenges, every activity is designed to feel fun, motivating, and doable for busy moms.',
      'Social Vibes, Not Just Sweat — Brunches, dinners, cocktail nights, and glamorous galas help moms build friendships beyond the studio.',
      'Accountability & Inspiration — A circle of women who cheer each other on, share progress, and celebrate every milestone—big or small.',
      'Not In Your Area Yet? — We are rooted in Short Hills, Millburn, Livingston, Summit, Maplewood, and Springfield, with plans to expand to more towns. Reach out and let’s bring Moms Fitness Mojo to you!',
    ].join('\n\n'),
    tags: ['home', 'overview', 'community'],
    visibility: 'public',
    url: '/#about',
  },
  {
    id: 'about_mission',
    title: 'Our Mission at Moms Fitness Mojo',
    summary: 'Empowering mothers to prioritize whole-self wellness through community, accountability, and joy.',
    body: [
      "We're more than a fitness community—we're a movement dedicated to helping mothers prioritize their health, build lasting friendships, and create a life they love, one workout at a time.",
      'Our mission is to provide a supportive, inclusive space where moms can focus on physical and mental well-being without sacrificing family responsibilities. When moms care for themselves, families and communities thrive.',
      '"A healthy mom is a happy mom, and a happy mom makes a happy family." — Aina Rai, Founder',
    ].join('\n\n'),
    tags: ['mission', 'about', 'wellness'],
    visibility: 'public',
    url: '/about',
  },
  {
    id: 'about_values',
    title: 'Values That Guide Moms Fitness Mojo',
    summary: 'Four guiding principles shape every event, challenge, and conversation in the community.',
    body: [
      'Empowerment — Every mom deserves to prioritize her health and wellness without guilt or judgment.',
      'Community — We build strong connections and support networks that last beyond the gym walls.',
      'Goals — We help moms set and achieve realistic, sustainable fitness and wellness goals.',
      'Excellence — We deliver high-quality programs, events, and resources for our members.',
    ].join('\n\n'),
    tags: ['values', 'about', 'principles'],
    visibility: 'public',
    url: '/about',
  },
  {
    id: 'about_story',
    title: 'How Moms Fitness Mojo Began',
    summary: 'Aina Rai created the space she longed for: a supportive circle where moms could focus on themselves.',
    body: [
      'Moms Fitness Mojo was born from the realization that too many mothers put themselves last. Founder Aina Rai saw moms pouring their energy into families and careers while craving space to focus on their own wellness.',
      'What started as friends meeting for morning walks has grown into a vibrant community of hundreds of mothers supporting each other’s fitness journeys, celebrating victories, and lifting one another during challenges.',
      'Today we combine accessible fitness, social connection, and gentle accountability so moms can feel strong, seen, and celebrated.',
    ].join('\n\n'),
    tags: ['story', 'origin', 'community'],
    visibility: 'public',
    url: '/about',
  },
  {
    id: 'founder_story',
    title: 'Meet Aina Rai, Founder of Moms Fitness Mojo',
    summary: 'Aina transformed her own search for connection and accountability into a thriving community for moms.',
    body: [
      "I'm Aina Rai, the heart behind Moms Fitness Mojo. When I became a parent and moved to the suburbs, every conversation centered on kids. I love my children deeply, but I kept wondering where the space was to talk about my goals, health, and identity beyond motherhood.",
      'During pregnancy I gained weight and had to sneak in workouts late at night to reclaim my health. I longed for people who understood that effort and could celebrate those wins with me.',
      'I created the community I couldn’t find: a place where moms talk about goals beyond nap times, share fitness wins, brunch, dance, laugh, and feel like themselves again.',
      'What started as a small idea has grown into a circle of moms who truly inspire one another. This group is more than workouts—it’s about friendship, accountability, and rediscovering yourself. Together we are Fit, Fierce & Fabulous.',
    ].join('\n\n'),
    tags: ['founder', 'story', 'aina rai'],
    visibility: 'public',
    url: '/founder',
  },
];

export async function syncStaticKnowledgeEntries() {
  const db = getFirestore();
  const desiredKeys = new Set(STATIC_ENTRIES.map(entry => `static_${entry.id}`));

  const existingSnapshot = await db.collection('kb_sources').where('sourceType', '==', 'static').get();
  let removed = 0;

  if (!existingSnapshot.empty) {
    const batch = db.batch();
    existingSnapshot.docs.forEach(doc => {
      if (!desiredKeys.has(doc.id)) {
        batch.delete(doc.ref);
        removed += 1;
      }
    });
    if (removed > 0) {
      await batch.commit();
    }
  }

  for (const entry of STATIC_ENTRIES) {
    await manualUpsertKnowledgeSource(`static_${entry.id}`, {
      sourceId: entry.id,
      sourceType: 'static',
      title: entry.title,
      summary: entry.summary,
      body: entry.body,
      tags: entry.tags,
      visibility: entry.visibility,
      url: entry.url,
      metadata: {
        source: 'static-site',
        lastSyncedAt: new Date().toISOString(),
      },
    });
  }

  return {
    synced: STATIC_ENTRIES.length,
    removed,
  };
}

