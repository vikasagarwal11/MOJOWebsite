// Simple API endpoint to serve RSVP data
// This would normally be a proper backend API, but for demo purposes we'll use a static file

const express = require('express');
const app = express();

// Mock RSVP data for testing
const mockRSVPData = {
  'test123': {
    'demo-user': {
      eventTitle: 'Demo Event - Moms Fitness',
      attendees: [
        { id: '1', name: 'Sarah Johnson', role: 'Primary Member', ageGroup: 'adult', isPrimary: true },
        { id: '2', name: 'Mike Johnson', role: 'Spouse', ageGroup: 'adult', isPrimary: false },
        { id: '3', name: 'Emma Johnson', role: 'Child (8 years)', ageGroup: '6-10', isPrimary: false },
        { id: '4', name: 'Liam Johnson', role: 'Child (5 years)', ageGroup: '3-5', isPrimary: false }
      ]
    }
  }
};

app.get('/api/rsvp/:eventId/:userId', (req, res) => {
  const { eventId, userId } = req.params;
  
  console.log(`RSVP API called: eventId=${eventId}, userId=${userId}`);
  
  // Check if we have data for this event and user
  if (mockRSVPData[eventId] && mockRSVPData[eventId][userId]) {
    res.json(mockRSVPData[eventId][userId]);
  } else {
    res.status(404).json({ error: 'RSVP data not found' });
  }
});

// For static file serving, we'll create a simple JSON file instead
const fs = require('fs');
const path = require('path');

// Create the API directory if it doesn't exist
const apiDir = path.join(__dirname, 'api');
if (!fs.existsSync(apiDir)) {
  fs.mkdirSync(apiDir, { recursive: true });
}

// Write the mock data as a JSON file
fs.writeFileSync(
  path.join(apiDir, 'rsvp-data.json'),
  JSON.stringify(mockRSVPData, null, 2)
);

console.log('RSVP API data written to public/api/rsvp-data.json');
