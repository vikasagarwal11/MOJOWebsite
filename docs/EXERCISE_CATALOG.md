Exercise Catalog — Architecture and Workflow

Overview
- Canonical exercise library in Firestore with stable IDs and rich metadata
- Pre-recorded media in Cloud Storage (poster, short loop, full video with captions)
- Plans reference exercise IDs for stability and easy updates
- Substitution rules based on environment/equipment/difficulty

Firestore
- Collection: exercises/{slug}
  - canonicalName, slug, synonyms[], translations{lang}
  - movementFamily, primaryMuscles[], secondaryMuscles[]
  - modality, difficulty, metricType, unilateral
  - environments[], requiredEquipment[], optionalEquipment[]
  - instructions[], coachingCues[], commonMistakes[], safetyNotes
  - media { posterUrl, loopUrl, hlsUrl, captionsUrl, aspect, loopDuration }
  - regressions[], progressions[], alternatives[]
  - status ('draft'|'published'), lastReviewedAt, version
- Subcollection: exercises/{slug}/variants/{id}
  - equipment[], difficulty, instructions[], media, status

Storage layout
- exercise-media/uploads/{slug}/{filename}
- exercise-media/processed/{slug}/poster.webp
- exercise-media/processed/{slug}/loop.mp4
- exercise-media/processed/{slug}/index.m3u8 (HLS) + segments

Pipeline (v1)
- Upload raw via admin UI to uploads/
- Cloud Function detects upload and enqueues processing (transcode + poster + loop)
- Process writes URLs into exercises/{slug}.media

Client integration
- Service methods in src/services/exerciseService.ts to list/fetch and find alternatives
- Component src/components/exercise/ExercisePreviewCard.tsx for UI preview

Notes
- Keep the canonical ID stable across locales
- Always include captions for accessibility
- Short loops should be <= 1.5MB and ~3–5s
