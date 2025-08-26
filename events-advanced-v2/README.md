# Advanced Events Module (React + Firestore + Stripe-ready)

This module gives you a production-grade event system:

- Calendar (react-big-calendar) + list view
- Create / Edit / Delete (single-day, multi-day, all-day)
- Tags & advanced filters
- Visibility (public, members, private)
- RSVP drawer with capacity + waitlist + adults/kids
- Paid & Free events (Stripe checkout session stub + webhook)
- Recurrence (RRULE) with exceptions (client-expansion)
- Role-based permissions (admin or organizer owns the event)
- ICS & JSON feed Cloud Functions (stubs included)
- All-day **row hidden** in time views

## Install

```bash
npm i react-big-calendar date-fns rrule
# For payments (server side):
# cd functions && npm i firebase-admin firebase-functions stripe ical rrule
```

## Wire Up

- Ensure you export your Firestore `db` at `@/config/firebase`.
- Add a route to `EventsPage` (e.g., `/events`).

## Firestore structure

```
events/{eventId}
  title, description, location
  startAt (Timestamp), endAt (Timestamp), allDay (bool)
  visibility: "public" | "members" | "private"
  tags: string[]
  isPaid: boolean, priceCents?: number, currency?: string
  capacity?: number
  organizerUid: string
  recurrence?: { rrule: string, timezone: string, exdates?: string[] }
  status: "scheduled" | "canceled"
  imageUrl?: string | null
  createdAt, updatedAt

events/{eventId}/rsvps/{rsvpId}
  userId, displayName, email
  status: "going" | "maybe" | "not_going" | "waitlisted"
  adults: number, kids: number
  requiresPayment?: boolean
  paymentStatus?: "unpaid" | "paid" | "refunded"
  createdAt, updatedAt
```

### Security Rules (sketch)

- Organizers (event.organizerUid) can edit their events.
- Admins can edit all.
- Members read members+public, guests read public.
- RSVP writes by authenticated users only, and capacity logic best enforced with Cloud Functions.

## Stripe

- Fill `functions/src/stripe.ts` with your `STRIPE_SECRET_KEY`.
- Cloud Function `createCheckoutSession` creates a session for paid events.
- Webhook marks RSVP as `paid` on successful checkout.

## Recurrence

- Store an RRULE string (RFC 5545), expand on the client with `expandRecurrence()` between visible range.
- Store exceptions `exdates` (ISO date strings).

--
See inline TODOs for integration details.


updated:
Here’s an updated README.md you can drop into your repo. It reflects the refactor decisions (visibility + legacy public), your Firestore rules, teasers, RSVP semantics, recurrence, capacity/waitlist, payments-ready notes, feeds, indices, and troubleshooting—including why we strip undefined before writes.

# Events Platform (React + Firestore) — Architecture & Guide

This doc describes the event system used in the app: data model, client behavior, security rules alignment, calendar specifics, recurrence/RSVP/capacity, teasers, feeds, payments-readiness, indices, and troubleshooting.

---

## Table of Contents
- [Core Concepts](#core-concepts)
- [Data Model](#data-model)
  - [Event Document](#event-document)
  - [RSVP Subdocument](#rsvp-subdocument)
  - [Event Teaser Document](#event-teaser-document)
- [Security Rules Alignment](#security-rules-alignment)
- [Visibility & Legacy `public`](#visibility--legacy-public)
- [Client Write Pattern: strip `undefined`](#client-write-pattern-strip-undefined)
- [Recurrence (RRULE) & Exceptions](#recurrence-rrule--exceptions)
- [RSVPs, Capacity & Waitlist](#rsvps-capacity--waitlist)
- [Calendar & UI Notes](#calendar--ui-notes)
- [Feeds (ICS/JSON)](#feeds-icsjson)
- [Payments (Optional, Stripe-ready)](#payments-optional-stripe-ready)
- [Audit Trail](#audit-trail)
- [Role-Based Actions](#role-based-actions)
- [Indexes](#indexes)
- [Migrations](#migrations)
- [Troubleshooting](#troubleshooting)
- [Developer Checklist](#developer-checklist)

---

## Core Concepts

- **Events**: single- or multi-day, timed or all-day; public, members-only, or private (invite-only).
- **RSVPs**: stored per user under `/events/{eventId}/rsvps/{userId}` with enforced status history.
- **Teasers**: for upcoming non-public events, a lightweight “peek” doc in `/event_teasers` (used to entice guests).
- **Calendar**: `react-big-calendar` with month/week/day views; all-day row hidden in time views.
- **Rules**: Firestore rules enforce roles/visibility and the exact RSVP write semantics.
- **Functions**: counters, teasers sync, notifications; optional payments hooks.

---

## Data Model

### Event Document

`/events/{eventId}`

```ts
type EventVisibility = 'public' | 'members' | 'private';

interface EventDoc {
  // Identity
  title: string;
  titleLower?: string;               // used for prefix search/typeahead
  description: string;

  // Timing
  startAt: FirebaseFirestore.Timestamp;
  endAt?: FirebaseFirestore.Timestamp; // must be > startAt if present
  allDay?: boolean;                    // all-day semantics if true
  timezone?: string;                   // e.g., 'America/New_York' (recommended if using RRULE)

  // Location / Media
  location?: string;
  imageUrl?: string;

  // Visibility & Invitations
  visibility: EventVisibility;        // 'public' | 'members' | 'private'
  public?: boolean;                   // legacy compatibility (see below)
  invitedUsers?: string[];            // allowed user ids for private events

  // Tagging
  tags?: string[];                    // up to ~10 tags

  // Attendance / Capacity
  maxAttendees?: number;              // > 0; if omitted => unlimited
  attendingCount?: number;            // maintained by CF on RSVP writes
  isWaitlistEnabled?: boolean;        // optional

  // Recurrence (optional)
  recurrence?: {
    rrule: string;                    // RFC 5545 RRULE, in event timezone
    exdates?: FirebaseFirestore.Timestamp[]; // exceptions (cancellations)
  };
  overrides?: {
    // Optional “modified instances” by occurrence id/date key (advanced)
    [occurrenceId: string]: Partial<Omit<EventDoc, 'recurrence'|'public'|'visibility'>>;
  };

  // Payments (optional)
  isPaid?: boolean;                   // free vs paid
  priceCents?: number;                // integer cents
  currency?: string;                  // 'USD', etc.
  externalProductId?: string;         // Stripe product/price id if used
  refundPolicy?: string;

  // Status / Audit
  canceled?: boolean;
  cancelReason?: string;
  createdBy: string;                  // uid
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}


Notes

endAt is optional; if omitted, the client defaults to +1 hour for timed events or +1 day for all-day events.

Multi-day timed: endAt may be next day(s). Client guards ensure endAt > startAt.

RSVP Subdocument

/events/{eventId}/rsvps/{userId}

Rules require exact semantics for statusHistory: first create has exactly one entry, updates append one entry, and statuses are constrained.

type RsvpStatus = 'going' | 'maybe' | 'not-going';
type PaymentStatus = 'required' | 'pending' | 'paid' | 'refunded' | 'failed';

interface RsvpDoc {
  status: RsvpStatus;                // required
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;

  // REQUIRED by rules (append-only semantics!)
  statusHistory: Array<{
    status: RsvpStatus;
    changedAt: FirebaseFirestore.Timestamp;
    changedBy: string;               // must equal request.auth.uid for self-updates
  }>;

  // Optional details used by UI & capacity logic
  partySize?: number;                // total adults (incl. self)
  kids?: number;                     // optional kids count
  notes?: string;                    // dietary, accessibility, etc.

  // Payments (optional)
  requiresPayment?: boolean;         // copied from event.isPaid at time of RSVP
  paymentStatus?: PaymentStatus;
  paymentIntentId?: string;          // Stripe intent/session id
}

Event Teaser Document

/event_teasers/{eventId}

interface EventTeaserDoc {
  title: string;
  startAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}


Created/updated by Cloud Function for future, non-public events; removed when event becomes public or past.

Security Rules Alignment

The UI adheres to your rules:

Read:

Past events are always readable.

visibility==='public' (or legacy public===true) are readable by anyone.

visibility==='members' readable by signed-in members/admins.

visibility==='private' readable by creator, invited users, admins.

Create/Update/Delete events:

Signed-in members/admins can create; updates allowed for admins or creator; all must pass validEventData.

RSVPs:

Create/update only by the user or admins, with strict statusHistory rules.

Admins may delete any RSVP.

Blocking:

blockedFromRsvp enforced per user; user-to-user blocks respected via helper functions.

Visibility & Legacy public

We support both for compatibility. Treat an event as public if:

const isPublic = (event.visibility === 'public') || !!event.public;


In the Cloud Function onEventTeaserSync, use the same logic:

const isPublic = (data.visibility === 'public') || !!data.public;


Teasers are written only when not public and future.

Migration plan below explains how to phase out public once all docs set visibility.

Client Write Pattern: strip undefined

Firestore does not store undefined. Writing undefined can cause validation issues or surprising diffs in rules. We strip them before writes:

export function stripUndefined<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}


Always build event/RSVP payloads via stripUndefined() prior to addDoc/updateDoc.

Recurrence (RRULE) & Exceptions

Store recurrence.rrule (RFC 5545) and an optional recurrence.exdates[] (cancellations).

Store a timezone at the event level; generate occurrences in that zone.

Expand only for the visible range in the UI (month/week/day).

For per-instance modifications (e.g., time or location changes), optionally use overrides[occurrenceId].

When editing a single occurrence:

If modifying fields (not canceling), write into overrides[occurrenceId].

If canceling, add its start to recurrence.exdates.

RSVPs, Capacity & Waitlist

Capacity enforcement is handled transactionally or by Cloud Functions:

On RSVP status transitions to 'going', check capacity (maxAttendees) against attendingCount (+ party sizes if enabled).

If full and waitlist enabled, mark RSVP as maybe + notes="waitlist" or store a waitlisted=true.

Cloud Function onRsvpWrite increments attendingCount for 'going' transitions.

Notifications (notifyRsvp) are sent to the event creator when someone becomes 'going'.

Admin overrides are permitted by rules.

Calendar & UI Notes

Library: react-big-calendar

Views: ['month','week','day']

Time grid: step=30, timeslots=2, min/max set to 00:00–23:59

Hide all-day row:

Prefer prop (if available in your version):

<Calendar showAllDay={false} ... />


Fallback CSS (week/day):

.rbc-allday-cell, .rbc-allday-events { display: none !important; height: 0 !important; }
.rbc-time-header .rbc-row:first-child { display: none !important; } /* header all-day row */


Prevent layout overflow: Keep calendar containers overflow: visible and tooltips in a Portal.

Event end-times:

If an event is timed and has no endAt, client uses +60 minutes.

If endAt <= startAt (from malformed data), client corrects to +60 minutes and logs a warning.

Feeds (ICS/JSON)

ICS feed:

Public endpoint that emits public events only in ICS format.

Include recurrence & exdates where possible.

For members-only/private, require an authenticated/secret feed URL per user (optional).

JSON feed:

Public JSON with public events for integrations (apps, widgets).

Optional authenticated JSON feed for members/private (respecting visibility & invitations).

Keep feed generation stateless and cache with ETag/If-Modified-Since. Always filter by isPublic logic above.

Payments (Optional, Stripe-ready)

Admin chooses free or paid:

isPaid:boolean, priceCents:number, currency:string.

On RSVP for paid events:

Create a Payment Intent/Checkout Session (server).

Mark RSVP requiresPayment=true, paymentStatus='pending'.

On webhook success, set paymentStatus='paid'.

If refund processed, set paymentStatus='refunded'.

Server-side:

Cloud Function endpoint: createCheckoutSession(eventId, userId, partySize, ... )

Webhooks: handle payment_intent.succeeded, charge.refunded, etc.

Always re-check event capacity before accepting payment (to avoid overbook).

Payments are optional. If you don’t enable Stripe, leave isPaid=false and omit payment fields.

Audit Trail

Events:

createdBy, createdAt, updatedAt always set.

Optionally add updatedBy on each edit (not enforced by rules but recommended).

For cancelations: set canceled=true, cancelReason.

RSVPs:

statusHistory enforced by rules; client must append on each change.

Role-Based Actions

Admin: full control — create/update/delete any event; modify any RSVP.

Member: create events, edit/delete their own events; create/update/delete own RSVP.

Guest: read public events & teasers only (no RSVP).

Indexes

Add or confirm these Firestore indices (via Console or firebase indexes):

Events

visibility ASC, startAt ASC (for public upcoming)

startAt ASC with startAt >= now (for upcoming for members)

startAt DESC with startAt < now (past)

Optional: titleLower ASC (typeahead)

Event Teasers

startAt ASC with startAt >= now

Media

eventId equality filter (for event media gallery)

If you query by tags or createdBy, add indices accordingly (e.g., tags array-contains + startAt ASC).

Migrations

Backfill visibility from legacy public:

visibility = 'public' if public===true, else 'members' (unless you know it’s 'private').

onEventTeaserSync already respects both visibility and public; no breakage.

(Optional) Remove legacy public after all docs updated and clients deployed.

Troubleshooting

“Event renders outside the time grid”

Ensure endAt > startAt. The client already guards/falls back to +60 minutes for bad data; fix the source document.

“All-day row appears in week/day view”

Use showAllDay={false} if your react-big-calendar version supports it.

Otherwise include the CSS override above.

“RSVP denied by rules”

Ensure payload exactly matches rules:

On create: statusHistory has exactly one entry with status and changedBy=request.auth.uid.

On update: statusHistory.length === previous + 1 and last entry’s changedBy equals the author of the update (or admin).

Status is one of: going | maybe | not-going.

“What does undefined mean here, and is it a problem?”

Firestore doesn’t store undefined. Writing undefined can trip your rule diffs. We strip undefined client-side before writes to keep docs clean and rule comparisons stable.

“Teaser didn’t appear / disappear”

Teasers are only for non-public, future events. When event becomes public or past, CF removes teaser.

Developer Checklist

 Use stripUndefined() on all Firestore writes.

 When saving events, always set titleLower, createdBy, updatedAt, and visibility.

 For private events, supply invitedUsers[].

 Validate endAt > startAt (client) and rely on rules validEventData.

 On RSVP create/update, append to statusHistory (never mutate prior entries).

 Keep onEventTeaserSync using:

const isPublic = (data.visibility === 'public') || !!data.public;


 Verify indexes for your queries (Console will prompt if missing).

 Calendar: set min, max, step, timeslots; hide all-day row in time views.

 If enabling payments: set up Stripe keys, createCheckoutSession, and webhooks; update RSVP paymentStatus on webhook.

 Add audit (updatedBy) if you need full traceability.

Appendix: Example Client Builders

Compute “is public”

export const eventIsPublic = (e: any) =>
  (e?.visibility === 'public') || !!e?.public;


Build event payload (create/edit)

const payload = stripUndefined({
  title: data.title.trim(),
  titleLower: data.title.trim().toLowerCase(),
  description: data.description.trim(),
  startAt,
  endAt,
  allDay: data.isAllDay || undefined,
  timezone: data.timezone || undefined,
  location: data.location?.trim() || undefined,
  imageUrl: imageUrl || data.imageUrl?.trim() || undefined,
  maxAttendees: maxAttendees || undefined,
  tags: tags.length ? tags : undefined,
  visibility,
  invitedUsers: visibility === 'private' ? invitedUsers : undefined,
  isPaid: isPaid || undefined,
  priceCents: isPaid ? priceCents : undefined,
  currency: isPaid ? currency : undefined,
  attendingCount: existing?.attendingCount ?? 0,
  createdBy: user.uid,
  createdAt: existing?.createdAt ?? serverTimestamp(),
  updatedAt: serverTimestamp(),
});


RSVP create

const now = serverTimestamp(); // use client Timestamp for local-only, or CF serverTimestamp after write
await setDoc(doc(db, `events/${eventId}/rsvps/${uid}`), {
  status,
  createdAt: now,
  updatedAt: now,
  statusHistory: [{ status, changedAt: now, changedBy: uid }],
  partySize,
  kids,
  notes,
  requiresPayment: event.isPaid || false,
  paymentStatus: event.isPaid ? 'pending' : undefined,
});


RSVP update (append-only statusHistory)

await updateDoc(doc(db, `events/${eventId}/rsvps/${uid}`), {
  status,
  updatedAt: now,
  statusHistory: arrayUnion({ status, changedAt: now, changedBy: actorUid }),
});
