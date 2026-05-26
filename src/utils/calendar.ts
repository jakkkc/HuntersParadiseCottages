/**
 * Utility functions for syncing follow-ups, bookings, and conferences
 * to Google Calendar via the Google Calendar v3 REST API.
 */

export interface GoogleCalendarEvent {
  summary: string;
  description: string;
  startDate: string; // ISO date string or YYYY-MM-DD
  endDate?: string;   // ISO date string or YYYY-MM-DD
  allDay?: boolean;
}

/**
 * Creates an event in the user's Primary Google Calendar using their OAuth Access Token.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: GoogleCalendarEvent
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const isAllDay = event.allDay || !event.startDate.includes('T');
    
    // Construct start and end representations based on allDay setting
    const startObj = isAllDay 
      ? { date: event.startDate.substring(0, 10) } 
      : { dateTime: event.startDate, timeZone: 'Africa/Nairobi' };
      
    const endObj = isAllDay
      ? { date: (event.endDate || event.startDate).substring(0, 10) }
      : { dateTime: event.endDate || new Date(new Date(event.startDate).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'Africa/Nairobi' };

    const body = {
      summary: event.summary,
      description: event.description,
      start: startObj,
      end: endObj,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 1440 }, // 1 day reminder
        ],
      },
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errData = await response.json();
      console.error('Google Calendar Error details:', errData);
      return { 
        success: false, 
        error: errData.error?.message || `Google API returned status ${response.status}` 
      };
    }

    const data = await response.json();
    return { success: true, eventId: data.id };
  } catch (err: any) {
    console.error('Failed to sync to Google Calendar:', err);
    return { success: false, error: err.message || 'Network error syncing to Google Calendar' };
  }
}

/**
 * Convenience helper to format follow-up reminder events
 */
export function formatFollowUpEvent(clientName: string, notes: string, dateStr: string): GoogleCalendarEvent {
  return {
    summary: `Follow up: ${clientName} - HPC CRM`,
    description: `CRM Follow-up task reminders:\n${notes}\n\nGenerated automatically via Hunters Paradise CRM.`,
    startDate: dateStr, // e.g. "2026-05-26T15:00:00"
    allDay: !dateStr.includes('T'),
  };
}

/**
 * Convenience helper to format booking occupancy check-in/check-out events
 */
export function formatBookingEvent(
  type: 'Check-in' | 'Check-out',
  clientName: string,
  branch: string,
  roomOrEvent: string,
  dateStr: string
): GoogleCalendarEvent {
  return {
    summary: `HPC [${branch}] ${type}: ${clientName}`,
    description: `Hospitality Booking: ${roomOrEvent} booked for ${clientName}.\nBranch Location: ${branch} branch.\n\nGenerated automatically via Hunters Paradise CRM.`,
    startDate: dateStr, // YYYY-MM-DD
    endDate: dateStr,
    allDay: true,
  };
}

/**
 * Convenience helper to format conferences & events packages
 */
export function formatConferenceEvent(
  clientName: string,
  branch: string,
  eventPax: number,
  dateStr: string
): GoogleCalendarEvent {
  return {
    summary: `HPC [${branch}] Conference: ${clientName} (${eventPax} Pax)`,
    description: `Corporate Conference booked for ${clientName} representing ${eventPax} attendees.\nInclusions include: catering, refreshments, boardroom materials, high speed wifi and facilitators.\n\nGenerated automatically via Hunters Paradise CRM.`,
    startDate: dateStr,
    allDay: true,
  };
}
