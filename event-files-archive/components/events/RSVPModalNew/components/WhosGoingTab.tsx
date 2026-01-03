import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Filter, Download, Users } from 'lucide-react';
import { EventDoc } from '../../../../hooks/useEvents';
import { Attendee } from '../../../../types/attendee';
import { User } from '../../../../types';
import { listAllAttendees } from '../../../../services/attendeeService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import { safeStringConversion } from '../../../../utils/dataSanitizer';
import { safeISODate } from '../../../../utils/dateUtils';
import { EllipsisScroller } from '../../../common/EllipsisScroller';

interface WhosGoingTabProps {
  event: EventDoc;
  attendees: Attendee[];
  isAdmin: boolean;
  waitlistPositions?: Map<string, number>;
}

interface GroupedAttendee {
  userId: string;
  name: string;
  status: 'going' | 'not-going' | 'waitlisted';
  familyCount: number;
  displayName: string;
  email?: string;
  phone?: string;
  rsvpDate?: string;
  waitlistPosition?: number;
}

type StatusFilter = 'all' | 'going' | 'not-going' | 'waitlisted';

export const WhosGoingTab: React.FC<WhosGoingTabProps> = ({
  event,
  attendees,
  isAdmin,
  waitlistPositions = new Map()
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('going');
  const [allAttendees, setAllAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [userContacts, setUserContacts] = useState<{ [userId: string]: { email: string; phone: string } }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage] = useState(10);

  // Fetch user contact information for admins
  const fetchUserContacts = useCallback(async (attendeeUserIds: string[]) => {
    if (!isAdmin) return;
    
    const contacts: { [userId: string]: { email: string; phone: string } } = {};
    
    for (const userId of attendeeUserIds) {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          contacts[userId] = {
            email: userData.email || userData.displayEmail || 'Not Available',
            phone: userData.phoneNumber || userData.phone || 'Not Available'
          };
        }
      } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
        contacts[userId] = {
          email: 'Not Available',
          phone: 'Not Available'
        };
      }
    }
    
    setUserContacts(contacts);
  }, [isAdmin]);

  // Fetch all attendees for the "Who's Going" tab (everyone should see everyone's status)
  useEffect(() => {
    const fetchAllAttendees = async () => {
      try {
        setLoading(true);
        const allEventAttendees = await listAllAttendees(event.id);
        setAllAttendees(allEventAttendees);
        
        // Fetch contact information for admins
        if (isAdmin) {
          const uniqueUserIds = [...new Set(Array.isArray(allEventAttendees) ? allEventAttendees.map(a => a.userId) : [])];
          await fetchUserContacts(uniqueUserIds);
        }
      } catch (error) {
        console.error('Error fetching all attendees:', error);
        // Fallback to the attendees prop if fetching fails
        setAllAttendees(attendees);
      } finally {
        setLoading(false);
      }
    };

    fetchAllAttendees();
  }, [event.id, attendees, isAdmin, fetchUserContacts]);

  // Group attendees by primary user and count family members
  const groupedAttendees = useMemo(() => {
    console.log('🔍 WhosGoingTab - groupedAttendees useMemo called with allAttendees:', {
      allAttendeesType: typeof allAttendees,
      allAttendeesIsArray: Array.isArray(allAttendees),
      allAttendeesLength: Array.isArray(allAttendees) ? allAttendees.length : 'N/A',
      allAttendeesConstructor: allAttendees?.constructor?.name,
      allAttendeesSample: Array.isArray(allAttendees) ? allAttendees.slice(0, 2) : allAttendees
    });
    
    if (!Array.isArray(allAttendees)) {
      console.warn('🚨 WhosGoingTab - allAttendees is not an array in groupedAttendees:', {
        allAttendees,
        type: typeof allAttendees,
        constructor: allAttendees?.constructor?.name,
        stack: new Error().stack
      });
      return [];
    }
    const grouped: { [userId: string]: GroupedAttendee } = {};

    allAttendees.forEach(attendee => {
      if (attendee.attendeeType === 'primary') {
        // Find family members for this user
        const familyMembers = allAttendees.filter(f => 
          f.userId === attendee.userId && f.attendeeType === 'family_member'
        );
        
        // Only count family members with "going" status
        const goingFamilyMembers = familyMembers.filter(f => f.rsvpStatus === 'going');

        grouped[attendee.userId] = {
          userId: attendee.userId,
          name: attendee.name,
          status: attendee.rsvpStatus,
          // Only count family members who are "going" - if primary is not going, show 0
          familyCount: attendee.rsvpStatus === 'not-going' ? 0 : goingFamilyMembers.length,
          displayName: attendee.name,
          email: userContacts[attendee.userId]?.email || 'Not Available',
          phone: userContacts[attendee.userId]?.phone || 'Not Available',
          waitlistPosition: waitlistPositions.get(attendee.userId) || undefined,
          rsvpDate: (() => {
            if (!attendee.createdAt) return 'Not Available';
            
            try {
              // Handle Firestore Timestamp with seconds property
              if (attendee.createdAt.seconds && typeof attendee.createdAt.seconds === 'number') {
                return new Date(attendee.createdAt.seconds * 1000).toLocaleDateString();
              }
              // Handle Firestore Timestamp with toDate method
              if (attendee.createdAt.toDate && typeof attendee.createdAt.toDate === 'function') {
                return attendee.createdAt.toDate().toLocaleDateString();
              }
              // Handle JavaScript Date
              if (attendee.createdAt instanceof Date) {
                return attendee.createdAt.toLocaleDateString();
              }
              // Handle timestamp number (milliseconds)
              if (typeof attendee.createdAt === 'number') {
                return new Date(attendee.createdAt).toLocaleDateString();
              }
              // Handle timestamp string
              if (typeof attendee.createdAt === 'string') {
                const date = new Date(attendee.createdAt);
                if (isNaN(date.getTime())) {
                  console.warn('Invalid date string for attendee:', attendee.name, attendee.createdAt);
                  return 'Invalid Date';
                }
                return date.toLocaleDateString();
              }
              
              console.warn('Unknown date format for attendee:', attendee.name, attendee.createdAt);
              return 'Invalid Date';
            } catch (error) {
              console.error('Error parsing date for attendee:', attendee.name, attendee.createdAt, error);
              return 'Invalid Date';
            }
          })()
        };
      }
    });

    return Object.values(grouped);
  }, [allAttendees, userContacts, waitlistPositions]);

  // Filter attendees based on search and status
  const filteredAttendees = useMemo(() => {
    let filtered = groupedAttendees;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(attendee => attendee.status === statusFilter);
    }

    // Apply search filter with role-based privacy
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(attendee => {
        // Always search by name
        const nameMatch = attendee.name.toLowerCase().includes(searchLower);
        
        // Only search by email if user is admin AND email is available
        const emailMatch = isAdmin && attendee.email ? 
          attendee.email.toLowerCase().includes(searchLower) : false;
        
        return nameMatch || emailMatch;
      });
    }

    return filtered;
  }, [groupedAttendees, searchTerm, statusFilter, isAdmin]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAttendees.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginatedAttendees = filteredAttendees.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Count attendees by status
  const statusCounts = useMemo(() => {
    return groupedAttendees.reduce((counts, attendee) => {
      counts[attendee.status] = (counts[attendee.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }, [groupedAttendees]);


  // CSV escaping function to prevent injection attacks
  const csvEscape = (v: any) => {
    const s = safeStringConversion(v);
    const needsQuote = /[",\n]/.test(s) || /^[=+\-@]/.test(s); // avoid CSV formula injection
    const safe = s.replace(/"/g, '""');
    return needsQuote ? `"${safe}"` : safe;
  };

  const exportToCSV = () => {
    if (!isAdmin) return;

    // Calculate summary statistics
    const totalAttendees = groupedAttendees.length;
    const goingCount = groupedAttendees.filter(attendee => attendee.status === 'going').length;
    const notGoingCount = groupedAttendees.filter(attendee => attendee.status === 'not-going').length;
    const waitlistedCount = groupedAttendees.filter(attendee => attendee.status === 'waitlisted').length;
    
    // Calculate total people (including family members)
    const totalPeopleGoing = groupedAttendees
      .filter(attendee => attendee.status === 'going')
      .reduce((sum, attendee) => sum + attendee.familyCount + 1, 0); // +1 for primary member
    
    const totalPeopleNotGoing = groupedAttendees
      .filter(attendee => attendee.status === 'not-going')
      .reduce((sum, _) => sum + 1, 0); // Only primary members for not-going
    const totalPeopleWaitlisted = groupedAttendees
      .filter(attendee => attendee.status === 'waitlisted')
      .reduce((sum, attendee) => sum + attendee.familyCount + 1, 0);

    // Create CSV content with summary report
    const csvContent = [
      // Summary Report Section
      ['EVENT ATTENDEE REPORT'],
      ['Event Title', event.title],
      ['Event Date', (() => {
        if (!event.startAt) return 'TBD';
        try {
          if (event.startAt.seconds && typeof event.startAt.seconds === 'number') {
            return new Date(event.startAt.seconds * 1000).toLocaleDateString();
          }
          if (event.startAt.toDate && typeof event.startAt.toDate === 'function') {
            return event.startAt.toDate().toLocaleDateString();
          }
          if (event.startAt instanceof Date) {
            return event.startAt.toLocaleDateString();
          }
          return 'TBD';
        } catch (error) {
          console.error('Error parsing event start date:', error);
          return 'TBD';
        }
      })()],
      ['Event Time', (() => {
        if (!event.startAt || !event.endAt) return 'TBD';
        try {
          const startTime = event.startAt.seconds ? new Date(event.startAt.seconds * 1000).toLocaleTimeString() : 
                           event.startAt.toDate && typeof event.startAt.toDate === 'function' ? event.startAt.toDate().toLocaleTimeString() :
                           event.startAt instanceof Date ? event.startAt.toLocaleTimeString() : 'TBD';
          
          const endTime = event.endAt.seconds ? new Date(event.endAt.seconds * 1000).toLocaleTimeString() : 
                         event.endAt.toDate && typeof event.endAt.toDate === 'function' ? event.endAt.toDate().toLocaleTimeString() :
                         event.endAt instanceof Date ? event.endAt.toLocaleTimeString() : 'TBD';
          
          return `${startTime} - ${endTime}`;
        } catch (error) {
          console.error('Error parsing event time:', error);
          return 'TBD';
        }
      })()],
      ['Event Location', event.venueAddress || event.venueName || 'TBD'],
      ['Report Generated', new Date().toLocaleString()],
      [''],
      ['SUMMARY STATISTICS'],
      ['Total RSVPs', totalAttendees],
      ['Going (RSVPs)', goingCount],
      ['Not Going (RSVPs)', notGoingCount],
      ['Waitlisted (RSVPs)', waitlistedCount],
      [''],
      ['TOTAL PEOPLE COUNT'],
      ['Total People Going', totalPeopleGoing],
      ['Total People Not Going', totalPeopleNotGoing],
      ['Total People Waitlisted', totalPeopleWaitlisted],
      ['Grand Total People', totalPeopleGoing + totalPeopleNotGoing + totalPeopleWaitlisted],
      [''],
      ['CAPACITY ANALYSIS'],
      ['Event Capacity', event.maxAttendees || 'Unlimited'],
      ['Capacity Utilization', event.maxAttendees ? `${Math.round((totalPeopleGoing / event.maxAttendees) * 100)}%` : 'N/A'],
      ['Spots Remaining', event.maxAttendees ? Math.max(0, event.maxAttendees - totalPeopleGoing) : 'N/A'],
      [''],
      ['DETAILED ATTENDEE LIST'],
      ['Name', 'Status', 'Additional Family', 'Total People', 'Email', 'Phone', 'RSVP Date', 'User ID'],
      // Attendee data
      ...(Array.isArray(filteredAttendees) ? filteredAttendees.map((attendee) => [
        attendee.name,
        attendee.status,
        attendee.familyCount, // Only additional family members
        attendee.familyCount + 1, // Total people (primary + family)
        attendee.email,
        attendee.phone,
        attendee.rsvpDate,
        attendee.userId
      ]) : [])
    ].map(row => row.map(csvEscape).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_attendee_report_${safeISODate(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F25129] mx-auto mb-4"></div>
        <p className="text-gray-600">Loading attendees...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Who's Going</h3>
          <p className="text-sm text-gray-600">
            {statusCounts['going'] || 0} Going, {statusCounts['not-going'] || 0} Not Going 
            {statusCounts['waitlisted'] ? `, ${statusCounts['waitlisted']} Waitlisted` : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text"
            placeholder={isAdmin ? "Search by name or email..." : "Search by name..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#F25129] focus:border-transparent"
          />
        </div>
        <div className="relative sm:w-40 flex-shrink-0">
          <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full pl-7 pr-6 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#F25129] focus:border-transparent appearance-none bg-white"
          >
            <option value="all">All Status</option>
            <option value="going">Going</option>
            <option value="not-going">Not Going</option>
            <option value="waitlisted">Waitlisted</option>
          </select>
        </div>
      </div>

      {/* Attendee List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {paginatedAttendees.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-2">No attendees found</p>
            <p className="text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search terms' : 'No one has RSVPed yet'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop/Tablet: Table Layout */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full table-fixed border-separate border-spacing-0">
                    <colgroup>
                      <col className="w-[35%]" /> {/* Name */}
                      <col className="w-[25%]" /> {/* Status */}
                      {isAdmin && (
                        <>
                          <col className="w-[25%]" /> {/* Email */}
                          <col className="w-[15%]" /> {/* Phone */}
                        </>
                      )}
                    </colgroup>

                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                      <tr className="text-xs font-medium text-gray-600">
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Status</th>
                        {isAdmin && (
                          <>
                            <th className="text-left px-3 py-2">Email</th>
                            <th className="text-left px-3 py-2">Phone</th>
                          </>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                  {Array.isArray(paginatedAttendees) ? paginatedAttendees.map((attendee, index) => (
                    <tr key={attendee.userId} className={`hover:bg-gray-50 transition-colors ${index % 2 ? "bg-gray-50" : "bg-white"}`}>
                      {/* NAME */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-6 h-6 bg-[#F25129] rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0">
                            {attendee.displayName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <EllipsisScroller 
                            text={`${attendee.displayName}${attendee.familyCount > 0 ? ` (+${attendee.familyCount})` : ''}`} 
                            className="text-sm font-medium text-gray-900 flex-1" 
                          />
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span
                            className={[
                              "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                              attendee.status === "going" ? "bg-green-100 text-green-800" :
                              attendee.status === "not-going" ? "bg-red-100 text-red-800" :
                              
                              "bg-gray-100 text-gray-800"
                            ].join(" ")}
                          >
                            <span className="capitalize">{attendee.status}</span>
                          </span>
                          {attendee.status === "waitlisted" && attendee.waitlistPosition && (
                            <span className="text-xs text-purple-600 font-medium">
                              Position #{attendee.waitlistPosition}
                            </span>
                          )}
                        </div>
                      </td>


                      {/* EMAIL (admin only) */}
                      {isAdmin && (
                        <td className="px-3 py-2">
                          {attendee.email && attendee.email !== "Not Available"
                            ? <EllipsisScroller text={attendee.email} asLink="mailto" />
                            : <span className="text-xs text-gray-400">-</span>}
                        </td>
                      )}

                      {/* PHONE (admin only) */}
                      {isAdmin && (
                        <td className="px-3 py-2">
                          {attendee.phone && attendee.phone !== "Not Available"
                            ? <EllipsisScroller text={attendee.phone} asLink="tel" />
                            : <span className="text-xs text-gray-400">-</span>}
                        </td>
                      )}
                    </tr>
                    )) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Mobile: Card Layout */}
            <div className="md:hidden divide-y divide-gray-100">
              {Array.isArray(paginatedAttendees) ? paginatedAttendees.map((attendee) => (
                <div key={attendee.userId} className="px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <EllipsisScroller 
                        text={`${attendee.displayName}${attendee.familyCount > 0 ? ` (+${attendee.familyCount})` : ''}`} 
                        className="text-sm font-medium text-gray-900 flex-1" 
                      />
                      <span
                        className={[
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium shrink-0",
                          attendee.status === "going" ? "bg-green-100 text-green-800" :
                          attendee.status === "not-going" ? "bg-red-100 text-red-800" :
                          
                          "bg-gray-100 text-gray-800"
                        ].join(" ")}
                      >
                        <span className="capitalize">{attendee.status}</span>
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="mt-1 space-y-0.5">
                        {attendee.email && attendee.email !== "Not Available" && (
                          <EllipsisScroller text={attendee.email} asLink="mailto" />
                        )}
                        {attendee.phone && attendee.phone !== "Not Available" && (
                          <EllipsisScroller text={attendee.phone} asLink="tel" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )) : null}
            </div>
          </>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredAttendees.length)} of {filteredAttendees.length} attendees
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      {filteredAttendees.length > 0 && totalPages <= 1 && (
        <div className="text-center text-sm text-gray-500 mt-4">
          Showing {filteredAttendees.length} of {groupedAttendees.length} attendees
        </div>
      )}
    </div>
  );
};







