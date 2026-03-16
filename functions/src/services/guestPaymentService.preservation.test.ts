/**
 * Preservation Property Tests for Guest Payment Service
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * IMPORTANT: These tests run on UNFIXED code to observe baseline behavior
 * 
 * These tests capture behaviors that MUST be preserved after the fix:
 * - Guest Zelle payments use NET amounts without Stripe fees
 * - Payment calculation logging shows detailed breakdowns
 * - Unpaid attendee filtering works correctly
 * - Event support amounts are added per unpaid attendee
 * 
 * EXPECTED OUTCOME: Tests PASS on unfixed code (confirms baseline to preserve)
 */

// Mock Firebase Admin BEFORE any imports
jest.mock('firebase-admin', () => {
    const mockFirestore = {
        collection: jest.fn(),
        doc: jest.fn()
    };

    return {
        initializeApp: jest.fn(),
        firestore: jest.fn(() => mockFirestore),
        credential: {
            applicationDefault: jest.fn()
        },
        Timestamp: {
            now: jest.fn(() => ({ toDate: () => new Date() })),
            fromDate: jest.fn((date: Date) => ({ toDate: () => date }))
        }
    };
});

// Mock Stripe module
jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        paymentIntents: {
            create: jest.fn()
        }
    }));
});

// Import after mocks
import Stripe from 'stripe';
import { calculateAttendeePrice } from '../stripe';
import { GuestPaymentService } from './guestPaymentService';
import { GuestSessionService } from './guestSessionService';

describe('Preservation Properties: Non-Stripe Guest Payment Behavior', () => {
    let guestPaymentService: GuestPaymentService;
    let mockDb: any;
    let mockSessionService: any;
    let mockStripeInstance: any;
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup console spy to capture logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        // Setup mock Firestore
        mockDb = {
            collection: jest.fn().mockReturnThis(),
            doc: jest.fn().mockReturnThis(),
            get: jest.fn(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            set: jest.fn().mockResolvedValue(undefined)
        };

        // Setup mock session service
        mockSessionService = {
            validateSession: jest.fn()
        } as unknown as GuestSessionService;

        // Setup mock Stripe instance
        mockStripeInstance = {
            paymentIntents: {
                create: jest.fn()
            }
        };

        // Mock Stripe constructor to return our mock instance
        (Stripe as unknown as jest.Mock).mockImplementation(() => mockStripeInstance);

        // Create service instance with mocks
        guestPaymentService = new GuestPaymentService(
            mockDb,
            'sk_test_mock_key',
            mockSessionService
        );
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    /**
     * Property 2.1: Preservation - Guest Zelle Payments Use NET Amounts
     * 
     * **Validates: Requirement 3.2**
     * 
     * For any guest payment where paymentMethod is 'zelle', the system SHALL
     * use the NET amount without Stripe fees.
     */
    describe('Property 2.1: Guest Zelle Payments Use NET Amounts', () => {
        it('should use NET amount for Zelle payment (no Stripe fees)', async () => {
            // Arrange: 2 adult attendees with $15.00 NET each + $3.00 event support each
            const eventId = 'test-event-zelle';
            const sessionToken = 'test-session-token';
            const phoneDigits = '1234567890';
            const phone = '+11234567890';

            const eventPricing = {
                requiresPayment: true,
                adultPrice: 1500, // $15.00 NET
                eventSupportAmount: 300, // $3.00 NET per attendee
                currency: 'usd',
                ageGroupPricing: [
                    { ageGroup: 'adult', price: 1500 }
                ]
            };

            const unpaidAttendees = [
                {
                    id: 'attendee-1',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'John Doe',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                },
                {
                    id: 'attendee-2',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'Jane Doe',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                }
            ];

            // Mock session validation
            mockSessionService.validateSession.mockResolvedValue({
                valid: true,
                session: {
                    phone,
                    contactInfo: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
                    createdAt: new Date()
                }
            });

            // Mock event fetch
            mockDb.collection.mockReturnValue({
                doc: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            title: 'Test Event',
                            pricing: eventPricing,
                            startAt: { toDate: () => new Date() }
                        })
                    }),
                    collection: jest.fn().mockReturnValue({
                        where: jest.fn().mockReturnThis(),
                        get: jest.fn().mockResolvedValue({
                            empty: false,
                            size: 2,
                            docs: unpaidAttendees
                        })
                    })
                })
            });

            // Mock transaction creation
            const mockTransactionDoc = {
                id: 'transaction-zelle',
                set: jest.fn().mockResolvedValue(undefined)
            };
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'payment_transactions') {
                    return {
                        doc: jest.fn().mockReturnValue(mockTransactionDoc)
                    };
                }
                return {
                    doc: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                title: 'Test Event',
                                pricing: eventPricing,
                                startAt: { toDate: () => new Date() }
                            })
                        }),
                        collection: jest.fn().mockReturnValue({
                            where: jest.fn().mockReturnThis(),
                            get: jest.fn().mockResolvedValue({
                                empty: false,
                                size: 2,
                                docs: unpaidAttendees
                            })
                        })
                    })
                };
            });

            // Set environment variables for Zelle
            process.env.ZELLE_RECIPIENT_EMAIL = 'admin@example.com';
            process.env.ZELLE_RECIPIENT_PHONE = '+11234567890';

            // Act: Create Zelle payment
            const result = await guestPaymentService.createGuestPaymentIntent(
                sessionToken,
                eventId,
                'zelle'
            );

            // Assert: Calculate expected NET amount (no Stripe fees)
            const attendeePrice = calculateAttendeePrice('adult', eventPricing); // $15.00 NET
            const eventSupportPerAttendee = eventPricing.eventSupportAmount; // $3.00 NET
            const expectedNetAmount = (attendeePrice + eventSupportPerAttendee) * 2; // $36.00 NET

            console.log('🔍 [TEST] Expected NET amount for Zelle:', expectedNetAmount / 100);
            console.log('🔍 [TEST] Actual amount:', result.amount / 100);

            // Verify Zelle uses NET amount (no Stripe fees applied)
            expect(result.amount).toBe(expectedNetAmount);
            expect(result.instructions).toBeDefined();
            expect(result.instructions?.amount).toBe(expectedNetAmount);

            // Verify transaction was saved with NET amount
            expect(mockTransactionDoc.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: expectedNetAmount,
                    method: 'zelle',
                    status: 'pending'
                })
            );
        });
    });

    /**
     * Property 2.2: Preservation - Payment Calculation Logging
     * 
     * **Validates: Requirement 3.3**
     * 
     * The system SHALL continue to show detailed breakdown of attendee prices,
     * event support, and fees in the logs.
     */
    describe('Property 2.2: Payment Calculation Logging', () => {
        it('should log detailed payment calculation breakdown', async () => {
            // Arrange
            const eventId = 'test-event-logging';
            const sessionToken = 'test-session-token';
            const phoneDigits = '1234567890';
            const phone = '+11234567890';

            const eventPricing = {
                requiresPayment: true,
                adultPrice: 2000, // $20.00 NET
                eventSupportAmount: 500, // $5.00 NET per attendee
                currency: 'usd',
                ageGroupPricing: [
                    { ageGroup: 'adult', price: 2000 }
                ]
            };

            const unpaidAttendees = [
                {
                    id: 'attendee-1',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'Test User',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                }
            ];

            // Mock session validation
            mockSessionService.validateSession.mockResolvedValue({
                valid: true,
                session: {
                    phone,
                    contactInfo: { firstName: 'Test', lastName: 'User', email: 'test@example.com' },
                    createdAt: new Date()
                }
            });

            // Mock event fetch
            mockDb.collection.mockReturnValue({
                doc: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            title: 'Test Event',
                            pricing: eventPricing,
                            startAt: { toDate: () => new Date() }
                        })
                    }),
                    collection: jest.fn().mockReturnValue({
                        where: jest.fn().mockReturnThis(),
                        get: jest.fn().mockResolvedValue({
                            empty: false,
                            size: 1,
                            docs: unpaidAttendees
                        })
                    })
                })
            });

            // Mock transaction creation
            const mockTransactionDoc = {
                id: 'transaction-logging',
                set: jest.fn().mockResolvedValue(undefined)
            };
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'payment_transactions') {
                    return {
                        doc: jest.fn().mockReturnValue(mockTransactionDoc)
                    };
                }
                return {
                    doc: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                title: 'Test Event',
                                pricing: eventPricing,
                                startAt: { toDate: () => new Date() }
                            })
                        }),
                        collection: jest.fn().mockReturnValue({
                            where: jest.fn().mockReturnThis(),
                            get: jest.fn().mockResolvedValue({
                                empty: false,
                                size: 1,
                                docs: unpaidAttendees
                            })
                        })
                    })
                };
            });

            // Set environment variables for Zelle
            process.env.ZELLE_RECIPIENT_EMAIL = 'admin@example.com';
            process.env.ZELLE_RECIPIENT_PHONE = '+11234567890';

            // Act: Create payment
            await guestPaymentService.createGuestPaymentIntent(
                sessionToken,
                eventId,
                'zelle'
            );

            // Assert: Verify detailed logging occurred
            const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));

            // Check for calculation start log
            expect(logCalls.some(log => log.includes('[CALCULATION START]'))).toBe(true);

            // Check for attendee price logging
            expect(logCalls.some(log => log.includes('[CALCULATION] Attendee'))).toBe(true);

            // Check for event support logging
            expect(logCalls.some(log => log.includes('Event support'))).toBe(true);

            // Check for NET total logging
            expect(logCalls.some(log => log.includes('FINAL NET TOTAL'))).toBe(true);

            // Check for final amount logging
            expect(logCalls.some(log => log.includes('[CALCULATION END]'))).toBe(true);

            console.log('✅ [TEST] Verified detailed calculation logging is preserved');
        });
    });

    /**
     * Property 2.3: Preservation - Unpaid Attendee Filtering
     * 
     * **Validates: Requirement 3.4**
     * 
     * The system SHALL continue to only include unpaid attendees in the
     * payment calculation.
     */
    describe('Property 2.3: Unpaid Attendee Filtering', () => {
        it('should only charge for unpaid attendees, excluding already paid ones', async () => {
            // Arrange: 3 attendees, but 1 is already paid
            const eventId = 'test-event-filtering';
            const sessionToken = 'test-session-token';
            const phoneDigits = '1234567890';
            const phone = '+11234567890';

            const eventPricing = {
                requiresPayment: true,
                adultPrice: 1000, // $10.00 NET
                eventSupportAmount: 200, // $2.00 NET per attendee
                currency: 'usd',
                ageGroupPricing: [
                    { ageGroup: 'adult', price: 1000 }
                ]
            };

            const allAttendees = [
                {
                    id: 'attendee-1',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'Unpaid User 1',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                },
                {
                    id: 'attendee-2',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'Already Paid User',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'paid', // Already paid
                        guestPhone: phone
                    })
                },
                {
                    id: 'attendee-3',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'Unpaid User 2',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                }
            ];

            // Mock session validation
            mockSessionService.validateSession.mockResolvedValue({
                valid: true,
                session: {
                    phone,
                    contactInfo: { firstName: 'Test', lastName: 'User', email: 'test@example.com' },
                    createdAt: new Date()
                }
            });

            // Mock event fetch
            mockDb.collection.mockReturnValue({
                doc: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            title: 'Test Event',
                            pricing: eventPricing,
                            startAt: { toDate: () => new Date() }
                        })
                    }),
                    collection: jest.fn().mockReturnValue({
                        where: jest.fn().mockReturnThis(),
                        get: jest.fn().mockResolvedValue({
                            empty: false,
                            size: 3,
                            docs: allAttendees
                        })
                    })
                })
            });

            // Mock transaction creation
            const mockTransactionDoc = {
                id: 'transaction-filtering',
                set: jest.fn().mockResolvedValue(undefined)
            };
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'payment_transactions') {
                    return {
                        doc: jest.fn().mockReturnValue(mockTransactionDoc)
                    };
                }
                return {
                    doc: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                title: 'Test Event',
                                pricing: eventPricing,
                                startAt: { toDate: () => new Date() }
                            })
                        }),
                        collection: jest.fn().mockReturnValue({
                            where: jest.fn().mockReturnThis(),
                            get: jest.fn().mockResolvedValue({
                                empty: false,
                                size: 3,
                                docs: allAttendees
                            })
                        })
                    })
                };
            });

            // Set environment variables for Zelle
            process.env.ZELLE_RECIPIENT_EMAIL = 'admin@example.com';
            process.env.ZELLE_RECIPIENT_PHONE = '+11234567890';

            // Act: Create payment
            const result = await guestPaymentService.createGuestPaymentIntent(
                sessionToken,
                eventId,
                'zelle'
            );

            // Assert: Should only charge for 2 unpaid attendees (not the paid one)
            const attendeePrice = calculateAttendeePrice('adult', eventPricing); // $10.00 NET
            const eventSupportPerAttendee = eventPricing.eventSupportAmount; // $2.00 NET
            const expectedNetAmount = (attendeePrice + eventSupportPerAttendee) * 2; // Only 2 unpaid attendees

            console.log('🔍 [TEST] Expected amount for 2 unpaid attendees:', expectedNetAmount / 100);
            console.log('🔍 [TEST] Actual amount:', result.amount / 100);

            // Verify only unpaid attendees are charged
            expect(result.amount).toBe(expectedNetAmount);

            // Verify transaction metadata shows correct attendee count
            const savedTransaction = mockTransactionDoc.set.mock.calls[0][0];
            expect(savedTransaction.metadata.totalAttendees).toBe(2); // Only unpaid attendees
            expect(savedTransaction.metadata.paidAttendees).toHaveLength(2); // Only unpaid attendees

            console.log('✅ [TEST] Verified unpaid attendee filtering is preserved');
        });
    });

    /**
     * Property 2.4: Preservation - Event Support Per Attendee
     * 
     * **Validates: Requirement 3.5**
     * 
     * The system SHALL continue to add event support per unpaid attendee to the total.
     */
    describe('Property 2.4: Event Support Per Attendee', () => {
        it('should add event support amount per unpaid attendee', async () => {
            // Arrange: 3 attendees with event support
            const eventId = 'test-event-support';
            const sessionToken = 'test-session-token';
            const phoneDigits = '1234567890';
            const phone = '+11234567890';

            const eventPricing = {
                requiresPayment: true,
                adultPrice: 1500, // $15.00 NET
                eventSupportAmount: 500, // $5.00 NET per attendee
                currency: 'usd',
                ageGroupPricing: [
                    { ageGroup: 'adult', price: 1500 }
                ]
            };

            const unpaidAttendees = [
                {
                    id: 'attendee-1',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'User 1',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                },
                {
                    id: 'attendee-2',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'User 2',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                },
                {
                    id: 'attendee-3',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'User 3',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                }
            ];

            // Mock session validation
            mockSessionService.validateSession.mockResolvedValue({
                valid: true,
                session: {
                    phone,
                    contactInfo: { firstName: 'Test', lastName: 'User', email: 'test@example.com' },
                    createdAt: new Date()
                }
            });

            // Mock event fetch
            mockDb.collection.mockReturnValue({
                doc: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            title: 'Test Event',
                            pricing: eventPricing,
                            startAt: { toDate: () => new Date() }
                        })
                    }),
                    collection: jest.fn().mockReturnValue({
                        where: jest.fn().mockReturnThis(),
                        get: jest.fn().mockResolvedValue({
                            empty: false,
                            size: 3,
                            docs: unpaidAttendees
                        })
                    })
                })
            });

            // Mock transaction creation
            const mockTransactionDoc = {
                id: 'transaction-support',
                set: jest.fn().mockResolvedValue(undefined)
            };
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'payment_transactions') {
                    return {
                        doc: jest.fn().mockReturnValue(mockTransactionDoc)
                    };
                }
                return {
                    doc: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                title: 'Test Event',
                                pricing: eventPricing,
                                startAt: { toDate: () => new Date() }
                            })
                        }),
                        collection: jest.fn().mockReturnValue({
                            where: jest.fn().mockReturnThis(),
                            get: jest.fn().mockResolvedValue({
                                empty: false,
                                size: 3,
                                docs: unpaidAttendees
                            })
                        })
                    })
                };
            });

            // Set environment variables for Zelle
            process.env.ZELLE_RECIPIENT_EMAIL = 'admin@example.com';
            process.env.ZELLE_RECIPIENT_PHONE = '+11234567890';

            // Act: Create payment
            const result = await guestPaymentService.createGuestPaymentIntent(
                sessionToken,
                eventId,
                'zelle'
            );

            // Assert: Verify event support is added per attendee
            const attendeePrice = calculateAttendeePrice('adult', eventPricing); // $15.00 NET
            const eventSupportPerAttendee = eventPricing.eventSupportAmount; // $5.00 NET
            const expectedNetAmount = (attendeePrice + eventSupportPerAttendee) * 3; // 3 attendees

            console.log('🔍 [TEST] Attendee price:', attendeePrice / 100);
            console.log('🔍 [TEST] Event support per attendee:', eventSupportPerAttendee / 100);
            console.log('🔍 [TEST] Expected total (3 attendees):', expectedNetAmount / 100);
            console.log('🔍 [TEST] Actual amount:', result.amount / 100);

            // Verify event support is included
            expect(result.amount).toBe(expectedNetAmount);

            // Verify logs show event support calculation
            const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
            expect(logCalls.some(log => log.includes('Event support'))).toBe(true);

            console.log('✅ [TEST] Verified event support per attendee is preserved');
        });

        it('should work correctly when event support is zero', async () => {
            // Arrange: Event with no event support
            const eventId = 'test-event-no-support';
            const sessionToken = 'test-session-token';
            const phoneDigits = '1234567890';
            const phone = '+11234567890';

            const eventPricing = {
                requiresPayment: true,
                adultPrice: 2000, // $20.00 NET
                eventSupportAmount: 0, // No event support
                currency: 'usd',
                ageGroupPricing: [
                    { ageGroup: 'adult', price: 2000 }
                ]
            };

            const unpaidAttendees = [
                {
                    id: 'attendee-1',
                    data: () => ({
                        userId: `guest_${eventId}_${phoneDigits}`,
                        name: 'User 1',
                        ageGroup: 'adult',
                        rsvpStatus: 'going',
                        paymentStatus: 'unpaid',
                        guestPhone: phone
                    })
                }
            ];

            // Mock session validation
            mockSessionService.validateSession.mockResolvedValue({
                valid: true,
                session: {
                    phone,
                    contactInfo: { firstName: 'Test', lastName: 'User', email: 'test@example.com' },
                    createdAt: new Date()
                }
            });

            // Mock event fetch
            mockDb.collection.mockReturnValue({
                doc: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            title: 'Test Event',
                            pricing: eventPricing,
                            startAt: { toDate: () => new Date() }
                        })
                    }),
                    collection: jest.fn().mockReturnValue({
                        where: jest.fn().mockReturnThis(),
                        get: jest.fn().mockResolvedValue({
                            empty: false,
                            size: 1,
                            docs: unpaidAttendees
                        })
                    })
                })
            });

            // Mock transaction creation
            const mockTransactionDoc = {
                id: 'transaction-no-support',
                set: jest.fn().mockResolvedValue(undefined)
            };
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'payment_transactions') {
                    return {
                        doc: jest.fn().mockReturnValue(mockTransactionDoc)
                    };
                }
                return {
                    doc: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                title: 'Test Event',
                                pricing: eventPricing,
                                startAt: { toDate: () => new Date() }
                            })
                        }),
                        collection: jest.fn().mockReturnValue({
                            where: jest.fn().mockReturnThis(),
                            get: jest.fn().mockResolvedValue({
                                empty: false,
                                size: 1,
                                docs: unpaidAttendees
                            })
                        })
                    })
                };
            });

            // Set environment variables for Zelle
            process.env.ZELLE_RECIPIENT_EMAIL = 'admin@example.com';
            process.env.ZELLE_RECIPIENT_PHONE = '+11234567890';

            // Act: Create payment
            const result = await guestPaymentService.createGuestPaymentIntent(
                sessionToken,
                eventId,
                'zelle'
            );

            // Assert: Should only charge attendee price (no event support)
            const attendeePrice = calculateAttendeePrice('adult', eventPricing); // $20.00 NET
            const expectedNetAmount = attendeePrice; // No event support

            console.log('🔍 [TEST] Expected amount (no event support):', expectedNetAmount / 100);
            console.log('🔍 [TEST] Actual amount:', result.amount / 100);

            expect(result.amount).toBe(expectedNetAmount);

            console.log('✅ [TEST] Verified zero event support works correctly');
        });
    });
});
