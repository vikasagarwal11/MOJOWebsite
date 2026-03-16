import * as crypto from 'crypto';

/**
 * Encryption utilities for session tokens
 * Uses AES-256-CBC encryption with random IVs
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size

/**
 * Get encryption key from environment variable
 * Key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
    const key = process.env.SESSION_ENCRYPTION_KEY;

    if (!key) {
        throw new Error('SESSION_ENCRYPTION_KEY environment variable is not set');
    }

    if (key.length !== 64) {
        throw new Error('SESSION_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }

    return Buffer.from(key, 'hex');
}

/**
 * Encrypt text using AES-256-CBC
 * @param text - Plain text to encrypt
 * @returns Encrypted text in format: iv:encryptedData (both hex encoded)
 */
export function encrypt(text: string): string {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Return IV and encrypted data separated by colon
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt text using AES-256-CBC
 * @param encryptedText - Encrypted text in format: iv:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
    try {
        const key = getEncryptionKey();
        const parts = encryptedText.split(':');

        if (parts.length !== 2) {
            throw new Error('Invalid encrypted text format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Generate a cryptographically secure random token
 * @param bytes - Number of random bytes (default: 32)
 * @returns Base64URL encoded token
 */
export function generateSecureToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Hash a value using SHA-256
 * Useful for creating deterministic identifiers
 * @param value - Value to hash
 * @returns Hex encoded hash
 */
export function hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}
