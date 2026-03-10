import re

with open(r'd:\MOJOWebsite\functions\src\index.ts', 'r', encoding='utf-8-sig') as f:
    content = f.read()

old = """    const primaryName = `${firstName} ${lastName}`.trim();
    const attendees = [
      { name: primaryName, relationship: 'self' },
      ...additionalAttendees,
    ];

    const now = FieldValue.serverTimestamp();
    const payload = {
      eventId,
      eventTitle: String(eventData.title || 'Event'),
      source: 'truly_public_guest',
      status: 'submitted',
      primaryFirstName: firstName,
      primaryLastName: lastName,
      primaryName,
      primaryEmail: email,
      primaryPhoneE164: phoneE164,
      attendees,
      totalAttendees: attendees.length,
      paymentRequired: !!eventData?.pricing?.requiresPayment,
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const writeRef = db.collection('event_guest_rsvps').doc(deterministicGuestId);
    const eventScopedRef = db.collection('events').doc(eventId).collection('guest_rsvps').doc(writeRef.id);
    const batch = db.batch();
    batch.set(writeRef, payload);
    batch.set(eventScopedRef, payload);
    await batch.commit();

    return {
      success: true,
      rsvpId: writeRef.id,
      message: 'Guest RSVP submitted successfully'
    };"""

new = """    const primaryName = `${firstName} ${lastName}`.trim();
    const guestUserId = `guest_${deterministicGuestId}`;
    const attendeesList = [
      { name: primaryName, relationship: 'self', attendeeType: 'primary' },
      ...additionalAttendees.map((a: any) => ({ ...a, attendeeType: 'family_member' })),
    ];

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    const attendeeIds: string[] = [];
    for (const a of attendeesList) {
      const aRef = db.collection('events').doc(eventId).collection('attendees').doc();
      attendeeIds.push(aRef.id);
      batch.set(aRef, {
        eventId,
        userId: guestUserId,
        attendeeType: a.attendeeType,
        relationship: a.relationship,
        name: a.name,
        ageGroup: 'adult',
        rsvpStatus: 'going',
        paymentStatus: eventData?.pricing?.requiresPayment ? 'unpaid' : 'not_required',
        isGuest: true,
        guestEmail: email,
        guestPhone: phoneE164,
        createdAt: now,
        updatedAt: now,
      });
    }

    const payload = {
      eventId,
      eventTitle: String(eventData.title || 'Event'),
      source: 'truly_public_guest',
      status: 'submitted',
      primaryFirstName: firstName,
      primaryLastName: lastName,
      primaryName,
      primaryEmail: email,
      primaryPhoneE164: phoneE164,
      attendees: attendeesList,
      attendeeIds,
      guestUserId,
      totalAttendees: attendeesList.length,
      paymentRequired: !!eventData?.pricing?.requiresPayment,
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const writeRef = db.collection('event_guest_rsvps').doc(deterministicGuestId);
    const eventScopedRef = db.collection('events').doc(eventId).collection('guest_rsvps').doc(writeRef.id);
    batch.set(writeRef, payload);
    batch.set(eventScopedRef, payload);
    await batch.commit();

    return {
      success: true,
      rsvpId: writeRef.id,
      attendeeIds,
      guestUserId,
      message: 'Guest RSVP submitted successfully'
    };"""

if old in content:
    content = content.replace(old, new, 1)
    with open(r'd:\MOJOWebsite\functions\src\index.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: replacement done')
else:
    # Try with \r\n
    old_crlf = old.replace('\n', '\r\n')
    if old_crlf in content:
        new_crlf = new.replace('\n', '\r\n')
        content = content.replace(old_crlf, new_crlf, 1)
        with open(r'd:\MOJOWebsite\functions\src\index.ts', 'w', encoding='utf-8') as f:
            f.write(content)
        print('SUCCESS: replacement done (CRLF)')
    else:
        print('FAILED: old text not found')
        # Print surrounding context
        idx = content.find('Guest RSVP submitted successfully')
        if idx >= 0:
            print('Context around target:')
            print(repr(content[idx-200:idx+100]))
