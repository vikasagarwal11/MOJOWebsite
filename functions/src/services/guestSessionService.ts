import { Firestore, Timestamp } from 'firebase-admin/firestore';
import {
    GuestContactInfo,
    GuestSession,
    SessionCreationResult,
    SessionValidationResult
} from '../types/guestSession';
import { generateSecureToken, hash } from '../utils/encryption';

/**
 * Guest Session Service
 * Manages temporary authenticated sessions for guest users
 * Sessions expire after 15 minutes and are invalidated after payment
 */
export class GuestSessionService {
    private db: Firestore;
    private readonly SESSION_DURATION_MINUTES = 15;

    constructor(db: Firestore) {
        this.db = db;
    }

    /**
     * Create guest session after OTP verification
     * @param contactInfo - Guest contact information
     * @param phone - Verified phone number
     * @returns Session token and expiry
     */
    async createSession(
        contactInfo: GuestContactInfo,
        phone: string
    ): Promise<SessionCreationResult> {
        try {
            // Generate cryptographically secure session token
            const sessionToken = generateSecureToken(32);
            console.log('🔐 [SESSION] Generated session token (first 10 chars):', sessionToken.substring(0, 10) + '...');

            // Calculate expiration (15 minutes from now)
            const now = Timestamp.now();
            const expiresAt = Timestamp.fromMillis(
                Date.now() + this.SESSION_DURATION_MINUTES * 60 * 1000
            );

            // Hash session token for storage (deterministic, secure lookup)
            const hashedToken = hash(sessionToken);
            console.log('🔐 [SESSION] Hashed token (first 10 chars):', hashedToken.substring(0, 10) + '...');

            // Create session document
            const session: GuestSession = {
                sessionToken: hashedToken, // Store hashed token
                phone,
                contactInfo,
                verified: true,
                createdAt: now,
                expiresAt,
                lastActivity: now,
                invalidated: false
            };

            console.log('💾 [SESSION] Writing session to Firestore...');
            console.log('💾 [SESSION] Session data:', {
                hashedToken: hashedToken.substring(0, 10) + '...',
                phone,
                contactInfo,
                expiresAt: expiresAt.toDate().toISOString()
            });

            // Store in Firestore
            const docRef = await this.db.collection('guest_sessions').add(session);
            console.log('✅ [SESSION] Session written to Firestore with ID:', docRef.id);

            // Verify the write by reading it back
            const verifyDoc = await docRef.get();
            if (verifyDoc.exists) {
                console.log('✅ [SESSION] Verified session exists in Firestore');
                const verifyData = verifyDoc.data();
                console.log('✅ [SESSION] Stored hashed token (first 10 chars):', verifyData?.sessionToken?.substring(0, 10) + '...');
            } else {
                console.error('❌ [SESSION] CRITICAL: Session document not found after write!');
            }

            return {
                sessionToken, // Return unencrypted token to client
                expiresAt: expiresAt.toDate()
            };
        } catch (error) {
            console.error('❌ [SESSION] Error creating guest session:', error);
            throw new Error('Failed to create guest session');
        }
    }

    /**
     * Validate session token
     * @param sessionToken - Token to validate
     * @returns Session data if valid, null otherwise
     */
    async validateSession(sessionToken: string): Promise<SessionValidationResult> {
        try {
            console.log('🔍 [VALIDATE] Validating session token (first 10 chars):', sessionToken.substring(0, 10) + '...');

            // Hash token for database lookup (deterministic)
            const hashedToken = hash(sessionToken);
            console.log('🔍 [VALIDATE] Looking for hashed token (first 10 chars):', hashedToken.substring(0, 10) + '...');

            // Query session by hashed token
            console.log('🔍 [VALIDATE] Querying guest_sessions collection...');
            const sessionQuery = await this.db
                .collection('guest_sessions')
                .where('sessionToken', '==', hashedToken)
                .limit(1)
                .get();

            console.log('🔍 [VALIDATE] Query returned', sessionQuery.size, 'documents');

            if (sessionQuery.empty) {
                console.error('❌ [VALIDATE] Session not found in database');

                // Debug: List all sessions to see what's in the database
                const allSessions = await this.db.collection('guest_sessions').limit(5).get();
                console.log('🔍 [VALIDATE] Total sessions in database:', allSessions.size);
                allSessions.docs.forEach((doc, index) => {
                    const data = doc.data();
                    console.log(`🔍 [VALIDATE] Session ${index + 1}:`, {
                        id: doc.id,
                        hashedToken: data.sessionToken?.substring(0, 10) + '...',
                        phone: data.phone,
                        expiresAt: data.expiresAt?.toDate?.()?.toISOString()
                    });
                });

                return {
                    valid: false,
                    error: 'not_found'
                };
            }

            const sessionDoc = sessionQuery.docs[0];
            const session = sessionDoc.data() as GuestSession;
            const now = new Date();

            console.log('✅ [VALIDATE] Session found:', {
                id: sessionDoc.id,
                phone: session.phone,
                expiresAt: session.expiresAt.toDate().toISOString(),
                invalidated: session.invalidated
            });

            // Check expiration
            if (session.expiresAt.toDate() < now) {
                console.error('❌ [VALIDATE] Session expired');
                return {
                    valid: false,
                    error: 'expired'
                };
            }

            // Check invalidation
            if (session.invalidated) {
                console.error('❌ [VALIDATE] Session invalidated');
                return {
                    valid: false,
                    error: 'invalidated'
                };
            }

            // Update last activity
            await sessionDoc.ref.update({
                lastActivity: Timestamp.now()
            });

            console.log('✅ [VALIDATE] Session is valid');
            return {
                valid: true,
                session
            };
        } catch (error) {
            console.error('❌ [VALIDATE] Error validating session:', error);
            return {
                valid: false,
                error: 'invalid_token'
            };
        }
    }

    /**
     * Extend session expiry (activity-based extension)
     * @param sessionToken - Token to extend
     * @returns New expiry time
     */
    async extendSession(sessionToken: string): Promise<Date> {
        try {
            const hashedToken = hash(sessionToken);

            const sessionQuery = await this.db
                .collection('guest_sessions')
                .where('sessionToken', '==', hashedToken)
                .limit(1)
                .get();

            if (sessionQuery.empty) {
                throw new Error('Session not found');
            }

            const sessionDoc = sessionQuery.docs[0];
            const newExpiresAt = Timestamp.fromMillis(
                Date.now() + this.SESSION_DURATION_MINUTES * 60 * 1000
            );

            await sessionDoc.ref.update({
                expiresAt: newExpiresAt,
                lastActivity: Timestamp.now()
            });

            return newExpiresAt.toDate();
        } catch (error) {
            console.error('Error extending session:', error);
            throw new Error('Failed to extend session');
        }
    }

    /**
     * Invalidate session (e.g., after payment completion)
     * @param sessionToken - Token to invalidate
     * @param reason - Reason for invalidation
     */
    async invalidateSession(
        sessionToken: string,
        reason: 'payment_complete' | 'expired' | 'manual' = 'manual'
    ): Promise<void> {
        try {
            const hashedToken = hash(sessionToken);

            const sessionQuery = await this.db
                .collection('guest_sessions')
                .where('sessionToken', '==', hashedToken)
                .limit(1)
                .get();

            if (sessionQuery.empty) {
                console.warn('Session not found for invalidation');
                return;
            }

            const sessionDoc = sessionQuery.docs[0];
            await sessionDoc.ref.update({
                invalidated: true,
                invalidatedAt: Timestamp.now(),
                invalidationReason: reason
            });
        } catch (error) {
            console.error('Error invalidating session:', error);
            throw new Error('Failed to invalidate session');
        }
    }

    /**
     * Get session by token (without validation)
     * Used for retrieving contact info after validation
     * @param sessionToken - Session token
     * @returns Session data or null
     */
    async getSession(sessionToken: string): Promise<GuestSession | null> {
        try {
            const hashedToken = hash(sessionToken);

            const sessionQuery = await this.db
                .collection('guest_sessions')
                .where('sessionToken', '==', hashedToken)
                .limit(1)
                .get();

            if (sessionQuery.empty) {
                return null;
            }

            return sessionQuery.docs[0].data() as GuestSession;
        } catch (error) {
            console.error('Error getting session:', error);
            return null;
        }
    }

    /**
     * Clean up expired sessions
     * Called by scheduled function
     * @returns Number of sessions deleted
     */
    async cleanupExpiredSessions(): Promise<number> {
        const now = Timestamp.now();

        // Query expired sessions
        const expiredQuery = await this.db
            .collection('guest_sessions')
            .where('expiresAt', '<', now)
            .limit(500)
            .get();

        // Delete in batch
        const batch = this.db.batch();
        expiredQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return expiredQuery.size;
    }

    /**
     * Clean up invalidated sessions older than 24 hours
     * @returns Number of sessions deleted
     */
    async cleanupInvalidatedSessions(): Promise<number> {
        const cutoff = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

        const invalidatedQuery = await this.db
            .collection('guest_sessions')
            .where('invalidated', '==', true)
            .where('invalidatedAt', '<', cutoff)
            .limit(500)
            .get();

        const batch = this.db.batch();
        invalidatedQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return invalidatedQuery.size;
    }
}
