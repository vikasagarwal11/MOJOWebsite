/**
 * Bug Condition Exploration Test for Guest Payment Stripe Amount Mismatch
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * This test encodes the EXPECTED behavior:
 * - Calculate total NET amount (sum of attendee NET prices + event support per attendee)
 * - Apply Stripe fees ONCE using calculateChargeAmount()
 * - Send exactly that calculated CHARGE amount to Stripe
 * 
 * The test will validate the fix when it passes after implementation.
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

import Stripe from 'stripe';
import { calculateAttendeePrice, calculateChargeAmount } from '../stripe';
import { GuestPaymentService } from './guestPaymentService';
import { GuestSessionService } from './guestSessionService';

describe('Bug Condition Exploration: Guest Stripe Payment Amount Accuracy', () => {
    let guestPaymentService: GuestPaymentService;
    let mockDb: any;
    let mockSessionService: any;
    let mockStripeInstance: any;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock Firestore
        mockDb = {
            collection: jest.fn().mockReturnThis(),
            doc: jest.fn().mockReturnThis(),
            get: jest.fn(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis()
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

    /**
     * Property 1: Bug Condition - Guest Stripe Payment Amount Accuracy
     * 
     * For any guest payment where paymentMethod is 'stripe' and unpaid attendees exist,
     * the createGuestPaymentIntent function SHALL calculate the total NET amount
     * (sum of attendee NET prices + event support per attendee), apply Stripe fees ONCE
     * using calculateChargeAmount(), and send exactly that calculated CHARGE amount to Stripe.
     */
    describe('Property 1: Bug Condition - Guest Stripe Payment Amount Accuracy', () => {
        /**
         * Test Case 2: Multiple Attendees - 2 adults with event support
         * Expected: calculateChargeAmount($36.00) = $36.35 sent to Stripe
         * Actual (buggy): $93.00 sent to Stripe
         * This test will FAIL on unfixed code, confirming the bug exists
         */
        it('should send correct amount to Stripe for 2 adult attendees with event support', async () => {
            // Arrange: 2 adult attendees with $15.00 NET each + $3.00 event support each = $36.00 NET total
            const eventId = 'test-event-2';
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
                    contactInfo: { firstName: 'John', lastName: 'Doe' },
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
                id: 'transaction-2',
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

            // Mock Stripe payment intent creation
            const mockPaymentIntent = {
                id: 'pi_test_456',
                client_secret: 'pi_test_456_secret_789',
                amount: 0,
                currency: 'usd'
            };
            mockStripeInstance.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

            // Act: Create payment intent
            await guestPaymentService.createGuestPaymentIntent(sessionToken, eventId, 'stripe');

            // Assert: Calculate expected amount
            const attendeePrice = calculateAttendeePrice('adult', eventPricing); // $15.00 NET
            const eventSupportPerAttendee = eventPricing.eventSupportAmount; // $3.00 NET
            const netTotal = (attendeePrice + eventSupportPerAttendee) * 2; // ($15.00 + $3.00) * 2 = $36.00 NET
            const expectedChargeAmount = calculateChargeAmount(netTotal); // Apply Stripe fees ONCE

            console.log('🔍 [TEST] Attendee price (NET):', attendeePrice / 100);
            console.log('🔍 [TEST] Event support per attendee (NET):', eventSupportPerAttendee / 100);
            console.log('🔍 [TEST] Net total for 2 attendees:', netTotal / 100);
            console.log('🔍 [TEST] Expected charge amount:', expectedChargeAmount / 100);

            // Verify Stripe was called with the correct amount
            expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: expectedChargeAmount,
                    currency: 'usd'
                })
            );

            const actualAmount = mockStripeInstance.paymentIntents.create.mock.calls[0][0].amount;
            console.log('🔍 [TEST] Actual amount sent to Stripe:', actualAmount / 100);
            console.log('🚨 [TEST] BUG DETECTED: Expected $' + (expectedChargeAmount / 100).toFixed(2) + ' but got $' + (actualAmount / 100).toFixed(2));

            // CRITICAL: This assertion will FAIL on unfixed code
            // Expected: $36.35 (3635 cents)
            // Actual (buggy): $93.00 (9300 cents)
            expect(actualAmount).toBe(expectedChargeAmount);
        });
    });
});
