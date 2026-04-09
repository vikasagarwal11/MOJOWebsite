# Mobile RSVP Architecture (Web-Parity Blueprint)

## Goal
Convert the current website RSVP page/card architecture into Flutter mobile with the same business logic, while optimizing for touch UX and mobile readability.

## Web -> Mobile Parity Map

### 1) Event Card Architecture
Web source patterns: `src/components/events/EventCardNew.tsx`

Mobile equivalent:
- `mojo_mobile/lib/features/events/screens/events_screen.dart` -> `_EventCard`

Parity decisions:
- Keep card-first browsing with image, date/time, venue, attendee count, visibility, and pricing summary.
- Keep clear RSVP CTA for upcoming events.
- Keep past-event visual state.
- Keep quick comprehension of free vs paid event states.

### 2) RSVP Page Architecture
Web source patterns: `src/pages/RSVPPage.tsx`

Mobile equivalent:
- `Event detail`: `mojo_mobile/lib/features/events/screens/event_detail_screen.dart`
- `RSVP entry`: `mojo_mobile/lib/features/events/widgets/rsvp_bottom_sheet.dart`
- `Manage state`: `mojo_mobile/lib/features/events/widgets/manage_rsvp_bottom_sheet.dart`
- `My RSVPs feed`: `mojo_mobile/lib/features/events/screens/events_screen.dart` -> `_RsvpTab`

Parity decisions:
- Keep RSVP lifecycle states (`going`, `not-going`, `waitlisted`).
- Keep payment states (`paid`, `unpaid/pending`) visible in the RSVP card.
- Keep management action flow from card -> manage sheet.
- Keep payment retry action for unpaid paid-events.

## Mobile UI Structure

### Events Screen Tabs
- `Upcoming`: discover cards + RSVP CTA.
- `Past`: historical cards, read-only.
- `I'm Going`: personal RSVP dashboard cards.

### My RSVP Card Sections
- Header: title + event date/time.
- Identity row: attendee name.
- Status chips: RSVP + payment.
- Action row:
  - `Manage RSVP`
  - `Pay now` (when required)
  - `Open event`

## State & Data Flow

### Source of truth
- Firestore remains source of truth.
- Existing providers remain unchanged:
  - `upcomingEventsProvider`
  - `pastEventsProvider`
  - `myRsvpsProvider`

### Update path
- RSVP create/update remains through existing bottom sheets/services.
- Payment retry uses existing `StripePaymentService`.

## Clean Architecture Direction
Current app still uses Riverpod for orchestration. The RSVP UI layer follows clean boundaries:
- Data/model layer unchanged (`MojoEvent`, attendee docs).
- Domain behavior represented via provider/service abstractions.
- Presentation layer improved into deterministic card states and action mapping.

## UI/UX Principles Applied
- Clear hierarchy: title > time > status > action.
- Touch-friendly controls (large targets, concise labels).
- Visual state coding with chips and color semantics.
- Empty/auth/loading/error states explicitly handled.
- Reduced cognitive load through grouped information.

## Validation Checklist
- Upcoming/Past/I'm Going render correctly.
- Manage RSVP opens from card.
- Pay now appears only for eligible unpaid rows.
- Event navigation works from RSVP cards.
- No regression in existing providers/services.

## Next Iteration (Optional)
- Add explicit capacity chips (`X/Y spots`, waitlist badges) once full event capacity fields are exposed in mobile model.
- Add a dedicated RSVP details page route with sticky action footer (full parity with web page-level flow).
- Migrate RSVP presentation into dedicated BLoC feature module for events.

