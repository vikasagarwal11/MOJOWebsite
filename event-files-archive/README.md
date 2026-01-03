# Event & RSVP System - Code Documentation

This archive contains all files related to the Events and RSVP functionality in the MOJO Website application. This documentation provides an overview of each file's purpose and functionality.

## 📁 Directory Structure

```
event-files-archive/
├── README.md (this file)
├── pages/
│   ├── Events.tsx
│   ├── EventDetailsPage.tsx
│   └── RSVPPage.tsx
├── components/
│   ├── events/
│   │   ├── EventCardNew.tsx
│   │   ├── EventList.tsx
│   │   ├── EventImage.tsx
│   │   ├── EventTeaserModal.tsx
│   │   ├── PastEventModal.tsx
│   │   ├── CreateEventModal.tsx
│   │   ├── AttendeeList.tsx
│   │   ├── PaymentSection.tsx
│   │   ├── QRCodeTab.tsx
│   │   └── RSVPModalNew.tsx
│   └── RSVPModalNew/
│       ├── components/
│       │   ├── EventDetails.tsx
│       │   ├── Header.tsx
│       │   ├── AttendeeInputRow.tsx
│       │   └── WhosGoingTab.tsx
│       ├── hooks/
│       │   ├── useEventDates.ts
│       │   ├── useCapacityState.ts
│       │   └── useModalA11y.ts
│       ├── rsvpUi.ts (UI configuration)
│       └── utils.ts (Utility functions)
├── hooks/
│   ├── useEvents.ts
│   ├── useAttendees.ts
│   └── useWaitlistPositions.ts
└── types/
    └── attendee.ts
```

---

## 📄 File Descriptions

### 🏠 Main Pages

#### `pages/Events.tsx`
**Purpose:** Main events listing page that displays all events in grid or calendar view.

**Key Features:**
- Displays upcoming and past events in separate tabs
- Supports grid and calendar view modes
- Advanced filtering (search, tags, location, date range, capacity)
- Real-time event updates via Firestore listeners
- Admin controls for creating/editing/deleting events
- Responsive design with mobile filters
- Integration with RSVP modal/page based on configuration

**Main State:**
- `activeTab`: 'upcoming' | 'past'
- `viewMode`: 'grid' | 'calendar'
- Filter states (search, tags, location, date range, capacity)
- Modal states for RSVP, teaser, and past event modals

**Key Functions:**
- `handleEditEvent()`: Opens edit modal for an event
- `handleDeleteEvent()`: Deletes an event (admin only)
- `onSelectCalEvent()`: Handles calendar event clicks

---

#### `pages/EventDetailsPage.tsx`
**Purpose:** Full-page view of a single event with comprehensive details.

**Key Features:**
- Real-time event updates via Firestore onSnapshot
- Two-column layout (image + details)
- Event status badges (Open, Sold Out, Waitlisted, Closed)
- User RSVP status display with payment information
- SEO optimization with EventSeo component
- Clickable location for Google Maps directions
- RSVP button that navigates to RSVP page

**Main State:**
- `event`: Current event data
- `userAttendee`: Current user's attendee record
- `loading`, `error`: Loading and error states

**Key Functions:**
- `getEventStatus()`: Determines event status based on capacity and waitlist
- `formatEventDate()`: Formats event date for display
- `formatEventTime()`: Formats event time for display
- `getEventDuration()`: Calculates event duration in hours

---

#### `pages/RSVPPage.tsx`
**Purpose:** Standalone RSVP page that replaces modal-based RSVP flow.

**Key Features:**
- Full-page RSVP interface with better mobile UX
- Real-time event and attendee updates
- Tab navigation (Attendees, QR Code, Who's Going)
- Add attendees from family profile or manual entry
- Payment section for paid events
- Capacity and waitlist management
- Auto-promotion from waitlist (admin)
- Responsive design with mobile-optimized header

**Main State:**
- `event`: Current event data
- `attendees`: List of attendees
- `activeTab`: Current tab ('attendees' | 'qr' | 'whosGoing')
- `isAddSectionCollapsed`: Controls add attendees section visibility
- `showFamilyMembers`: Controls family members section visibility

**Key Functions:**
- `handleBulkAddFamilyMembers()`: Adds multiple family members
- `handleAddFamilyMember()`: Adds a single family member
- `handleBulkAddFromProfile()`: Adds all available family members

---

### 🎴 Event Components

#### `components/events/EventCardNew.tsx`
**Purpose:** Individual event card displayed in the events grid.

**Key Features:**
- Displays event image, title, description, date, location
- Quick RSVP buttons (Going/Not Going)
- Real-time attendee count updates
- Capacity state indicators (OK, Near Full, Full, Waitlist)
- RSVP status badges for current user
- Payment status display for paid events
- "SOLD OUT" watermark overlay
- Share and admin options (edit/delete)
- Navigation to event details page

**Main State:**
- `realTimeAttendingCount`: Real-time attending count from Firestore
- `rsvpStatus`: Current user's RSVP status
- `userPaymentStatus`: Payment status for paid events
- Modal states (RSVP, teaser, past event, payment instructions)

**Key Functions:**
- `handleQuickRSVP()`: Handles quick RSVP actions
- `handleRSVPModalOpen()`: Opens RSVP modal or navigates to RSVP page
- `handleViewEventDetails()`: Navigates to event details page
- `processRSVP()`: Core RSVP logic with capacity checking

---

#### `components/events/EventList.tsx`
**Purpose:** Virtualized list component for rendering event cards efficiently.

**Key Features:**
- Virtual scrolling for performance with many events
- Responsive grid layout (1-4 columns based on screen size)
- Intersection Observer for lazy loading
- Loading skeletons with shimmer effect
- Empty state handling
- Edit/delete callbacks for admin actions

**Key Features:**
- Uses `react-window` for virtualization
- Calculates grid columns based on viewport width
- Lazy loads event cards as they enter viewport

---

#### `components/events/EventImage.tsx`
**Purpose:** Handles event image display with error handling and loading states.

**Key Features:**
- Image loading with fallbacks
- Error handling for missing images
- Lazy loading support
- Responsive sizing options

---

#### `components/events/EventTeaserModal.tsx`
**Purpose:** Modal shown to non-authenticated users when they try to RSVP.

**Key Features:**
- Displays event teaser information
- Prompts user to sign in/register
- Read-only event details

---

#### `components/events/PastEventModal.tsx`
**Purpose:** Modal shown when users try to interact with past events.

**Key Features:**
- Displays past event information
- Read-only view (no RSVP allowed)
- Historical event details

---

#### `components/events/CreateEventModal.tsx`
**Purpose:** Modal/form for creating and editing events (admin only).

**Key Features:**
- Event creation and editing
- Image upload
- Pricing configuration
- Capacity and waitlist settings
- Location/venue management

---

### 🎫 RSVP Components

#### `components/events/RSVPModalNew.tsx`
**Purpose:** Main RSVP modal component (can be replaced by RSVPPage).

**Key Features:**
- Full RSVP management interface
- Tab navigation (Attendees, QR Code, Who's Going)
- Add attendees (manual or from family profile)
- Payment section integration
- Capacity and waitlist management
- Real-time updates
- Mobile-responsive with compact header
- Accessibility features (ARIA labels, keyboard navigation)

**Main State:**
- `isOpen`: Modal visibility
- `activeTab`: Current tab
- `bulkFormData`: Form data for adding attendees
- `isAddSectionCollapsed`: Add section visibility
- `showFamilyMembers`: Family members section visibility

**Key Functions:**
- `handleBulkAddFamilyMembers()`: Processes bulk add from form
- `handleAddFamilyMember()`: Adds single family member
- `handleBulkAddFromProfile()`: Adds from family profile

**Note:** This component is the modal version of the RSVP functionality. The standalone `RSVPPage.tsx` provides a better mobile experience.

---

#### `components/events/RSVPModalNew/components/Header.tsx`
**Purpose:** Header component for RSVP modal with event title and key details.

**Key Features:**
- Compact mobile header and full desktop header
- Event title, date, time, location
- Capacity status indicator
- Clickable location (opens Google Maps)
- Close button with accessibility

**Props:**
- `event`: Event data
- `onClose`: Close callback
- `isCompact`: Mobile vs desktop layout
- `capacityState`: Capacity state object
- `attendingCount`: Current attending count

---

#### `components/events/RSVPModalNew/components/EventDetails.tsx`
**Purpose:** Collapsible event details section for mobile RSVP modal.

**Key Features:**
- Mobile-only component (hidden on desktop)
- Collapsible details section
- Shows date, venue, address, description
- Smooth animations with Framer Motion

**Props:**
- `event`: Event data
- `isMobile`: Whether to show (mobile only)

---

#### `components/events/RSVPModalNew/components/AttendeeInputRow.tsx`
**Purpose:** Form row for manually adding attendees in bulk.

**Key Features:**
- Input fields for name, age group, relationship
- Add/remove row buttons
- Memoized for performance
- Form validation

**Props:**
- `member`: Form data for this row
- `onUpdate`: Update callback
- `onRemove`: Remove row callback
- `onAdd`: Add new row callback

---

#### `components/events/RSVPModalNew/components/WhosGoingTab.tsx`
**Purpose:** Tab showing who is attending the event (with filters and export).

**Key Features:**
- Displays all attendees grouped by user
- Search and filter by status
- Admin-only contact information (email, phone)
- CSV export for admins
- Pagination for large lists
- Waitlist position display
- Summary statistics

**Key Functions:**
- `exportToCSV()`: Generates CSV report with summary statistics
- Groups attendees by primary user and counts family members

---

### 🎣 Custom Hooks

#### `hooks/useEvents.ts`
**Purpose:** Hook for fetching and managing events with real-time updates.

**Key Features:**
- Separates upcoming and past events
- Real-time Firestore listeners
- Visibility filtering (public, members, private)
- Guest teaser support
- Multiple query optimization

**Returns:**
- `upcomingEvents`: Array of upcoming events
- `pastEvents`: Array of past events
- `upcomingTeasers`: Array of guest teasers
- `loading`: Loading state
- `error`: Error state

**Key Functions:**
- `buildUpcomingQueries()`: Builds Firestore queries based on user permissions
- `buildPastQueries()`: Builds queries for past events

---

#### `hooks/useAttendees.ts`
**Purpose:** Hook for managing attendees for an event.

**Key Features:**
- Real-time attendee updates
- Admin vs regular user filtering
- Attendee counts calculation
- CRUD operations (add, update, remove, bulk add)
- Optimistic updates

**Returns:**
- `attendees`: Array of attendees
- `counts`: AttendeeCounts object
- `loading`, `error`: State
- `addAttendee()`, `updateAttendee()`, `removeAttendee()`: CRUD functions
- `setAttendeeStatus()`: Update RSVP status
- `bulkAddAttendees()`: Add multiple attendees
- `refreshAttendees()`: Refresh data

---

#### `hooks/useWaitlistPositions.ts`
**Purpose:** Hook for calculating waitlist positions for users.

**Key Features:**
- Real-time waitlist position updates
- Only active when waitlist is enabled
- Calculates position based on RSVP timestamp

**Returns:**
- `positions`: Map of userId to position
- `myPosition`: Current user's position
- `waitlistCount`: Total waitlist count

---

#### `components/events/RSVPModalNew/hooks/useEventDates.ts`
**Purpose:** Hook for handling event date formatting and calculations.

**Key Features:**
- Handles multiple date formats (Firestore Timestamp, Date, string, number)
- Formats dates and times consistently
- Calculates event duration
- Checks if event is past

**Returns:**
- `dateLabel`: Formatted date string
- `timeLabel`: Formatted time string
- `timeWithDuration`: Combined time with duration
- `isEventPast`: Boolean
- `durationHours`: Duration in hours
- Helper functions for date formatting

---

#### `components/events/RSVPModalNew/hooks/useCapacityState.ts`
**Purpose:** Hook for managing event capacity state and warnings.

**Key Features:**
- Calculates capacity percentage
- Determines state (ok, near, full, waitlist)
- Generates warning messages
- Checks if more attendees can be added
- Checks if waitlist is available

**Returns:**
- `state`: 'ok' | 'near' | 'full' | 'waitlist'
- `remaining`: Remaining slots
- `isAtCapacity`: Boolean
- `isNearlyFull`: Boolean
- `canAddMore`: Can add to main capacity
- `canWaitlist`: Can add to waitlist
- `warningMessage`: Warning text
- `slotsRemainingText`: Detailed remaining text

---

#### `components/events/RSVPModalNew/hooks/useModalA11y.ts`
**Purpose:** Hook for accessibility features in modals.

**Key Features:**
- ARIA attributes for screen readers
- Focus management
- Keyboard navigation support
- Escape key handling
- Scroll lock management

---

#### `components/events/RSVPModalNew/rsvpUi.ts`
**Purpose:** UI configuration and constants for RSVP modal.

**Key Features:**
- Age group options
- Relationship options
- RSVP status options
- Capacity thresholds
- Animation configuration
- CSS class helpers (getCapacityBadgeClasses)

---

#### `components/events/RSVPModalNew/utils.ts`
**Purpose:** Pure utility functions for RSVP modal.

**Key Functions:**
- `makeId()`: Generates unique IDs with crypto fallback
- `cn()`: Joins class names (lightweight clsx alternative)
- `truncateAddress()`: Truncates addresses for mobile
- `formatAttendeeCount()`: Formats count with pluralization
- `formatCapacityPercentage()`: Formats capacity as percentage

---

### 🧩 Supporting Components

#### `components/events/AttendeeList.tsx`
**Purpose:** Component for displaying and managing a list of attendees.

**Key Features:**
- Displays attendees with status badges
- Edit/remove actions
- Status updates
- Waitlist position display
- Admin controls

---

#### `components/events/PaymentSection.tsx`
**Purpose:** Component for displaying payment information and breakdown.

**Key Features:**
- Collapsible payment section
- Payment breakdown by attendee
- Total amount calculation
- Payment status display
- Integration with PaymentService

**Key Functions:**
- Calculates payment summary based on attendees and event pricing
- Shows breakdown for each attendee with age-based pricing

---

#### `components/events/QRCodeTab.tsx`
**Purpose:** Tab component for QR code generation and scanning (event attendance).

**Key Features:**
- QR code generation for events
- QR code scanning for check-in
- Attendance tracking
- Admin controls for enabling/disabling QR attendance

---

### 📋 Types

#### `types/attendee.ts`
**Purpose:** TypeScript type definitions for attendee-related data.

**Key Types:**
- `Attendee`: Main attendee object
- `AttendeeStatus`: 'going' | 'not-going' | 'waitlisted'
- `AgeGroup`: '0-2' | '3-5' | '6-10' | '11+' | 'adult'
- `Relationship`: 'self' | 'spouse' | 'child' | 'guest'
- `CreateAttendeeData`: Data for creating an attendee
- `UpdateAttendeeData`: Data for updating an attendee
- `AttendeeCounts`: Aggregated counts by status and age group

---

## 🔄 Data Flow

### Event Display Flow
1. `Events.tsx` uses `useEvents()` hook
2. `useEvents()` sets up Firestore listeners for upcoming/past events
3. Events are normalized and filtered by visibility
4. `EventList.tsx` renders `EventCardNew.tsx` components
5. `EventCardNew.tsx` displays event info and handles interactions

### RSVP Flow
1. User clicks RSVP button on `EventCardNew.tsx` or `EventDetailsPage.tsx`
2. Navigates to `/events/{eventId}/rsvp` (RSVPPage) OR opens RSVPModalNew
3. `RSVPPage.tsx` loads event via Firestore onSnapshot
4. Uses `useAttendees()` to fetch current user's attendees
5. User adds/updates attendees via form or family profile
6. Changes are saved via `attendeeService.ts`
7. Real-time updates propagate to all components via Firestore listeners

### Capacity Management Flow
1. Event has `maxAttendees` and `waitlistEnabled` flags
2. `useCapacityState()` hook calculates capacity state
3. When user tries to RSVP, capacity is checked
4. If full and waitlist enabled, user is added to waitlist
5. Admin can promote from waitlist using `AutoPromotionManager`

---

## 🎨 Design Patterns

### State Management
- Uses React hooks (useState, useEffect, useMemo)
- Real-time updates via Firestore onSnapshot listeners
- Optimistic updates for better UX
- Error boundaries and loading states

### Component Architecture
- Container/Presentational pattern
- Custom hooks for business logic
- Memoized components for performance
- Composition over inheritance

### Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Conditional rendering based on screen size
- Touch-optimized interactions

---

## 🔧 Key Technologies

- **React 18** with TypeScript
- **Firebase Firestore** for real-time data
- **Framer Motion** for animations
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Lucide React** for icons

---

## 📝 Notes for Code Review

### Areas to Review for Design Improvements:

1. **Component Size**: Some components (especially `RSVPModalNew.tsx` and `RSVPPage.tsx`) are quite large. Consider splitting into smaller components.

2. **State Management**: Multiple components manage similar state (capacity, attendees, etc.). Could benefit from a state management solution (Context API or Redux).

3. **Date Handling**: Date formatting logic is duplicated across multiple files. Could be centralized.

4. **Error Handling**: Some components have basic error handling. Could be improved with error boundaries and better user feedback.

5. **Performance**: Large lists could benefit from virtualization (already done in `EventList.tsx`). Consider for attendee lists.

6. **Accessibility**: Some components have ARIA labels, but could be more comprehensive. Focus management could be improved.

7. **Testing**: No test files included. Consider adding unit tests for hooks and integration tests for components.

8. **Type Safety**: Good TypeScript usage, but some `any` types still present. Could be improved.

9. **Code Duplication**: Some logic is duplicated between `RSVPModalNew.tsx` and `RSVPPage.tsx`. Consider extracting shared logic.

10. **Mobile UX**: Currently supports both modal and page-based RSVP. Consider standardizing on one approach.

---

## 🚀 Suggested Improvements

1. **Extract shared logic**: Create a shared hook or utility for RSVP functionality used by both modal and page.

2. **Component composition**: Break down large components into smaller, reusable pieces.

3. **Centralized date handling**: Create a date utility library with consistent formatting.

4. **State management**: Consider using Context API or a state management library for shared state.

5. **Error boundaries**: Add React error boundaries to catch and handle errors gracefully.

6. **Performance optimization**: Add React.memo where appropriate, implement virtual scrolling for attendee lists.

7. **Accessibility audit**: Conduct full accessibility audit and implement improvements.

8. **Unit tests**: Add comprehensive test coverage for hooks and utility functions.

9. **Integration tests**: Add tests for key user flows (RSVP, adding attendees, etc.).

10. **Documentation**: Add JSDoc comments to all exported functions and components.

---

## 📞 Support

For questions or issues, please refer to the main project documentation or contact the development team.

---

**Last Updated:** 2025-01-27
**Version:** 1.0

---

## 📦 Archive Contents Summary

This archive contains **27 files** (26 source files + README.md):

- **3** main page components (Events, EventDetails, RSVP)
- **11** event-related components
- **4** RSVP modal sub-components
- **6** custom hooks
- **2** utility/config files
- **1** type definition file
- **1** comprehensive documentation (README.md)

All files are organized in a clear directory structure matching the source codebase for easy navigation and review.

