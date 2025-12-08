/**
 * Content Moderation Service
 * Handles content filtering, approval workflows, and negative content detection
 * Uses AI-based sentiment analysis via Cloud Functions
 */

import { moderateContentWithAI } from './contentModerationAIService';

// Negative keywords/phrases that should trigger moderation (fallback)
const NEGATIVE_KEYWORDS = [
  // Platform/Admin criticism
  'admin is', 'admins are', 'admin sucks', 'admin terrible', 'admin bad',
  'platform is bad', 'platform sucks', 'platform terrible', 'worst platform',
  'mojo is bad', 'mojo sucks', 'mojo terrible', 'hate mojo', 'mojo worst',
  
  // Community criticism
  'community is bad', 'community sucks', 'community terrible', 'hate community',
  'worst community', 'community worst', 'bad community',
  
  // Negative sentiment patterns
  'hate this', 'hate that', 'terrible experience', 'worst experience',
  'awful', 'horrible', 'disgusting', 'ridiculous', 'stupid',
  
  // Complaints about moderation
  'moderation is', 'moderators are', 'censorship', 'unfair',
];

// Context-aware negative patterns (more specific)
const NEGATIVE_PATTERNS = [
  /(admin|platform|mojo|community)\s+(is|are|was|were)\s+(bad|terrible|awful|horrible|worst|sucks)/i,
  /(hate|dislike|despise)\s+(admin|platform|mojo|community|this|that)/i,
  /(worst|terrible|awful|horrible)\s+(admin|platform|mojo|community|experience)/i,
];

export interface ModerationResult {
  requiresApproval: boolean;
  isBlocked: boolean;
  reason?: string;
  detectedIssues: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface ModerationSettings {
  // Per-user settings
  requireApprovalForUser?: boolean;
  autoModerateUser?: boolean;
  
  // Per-content settings
  requireApproval?: boolean;
  
  // Global settings
  enableAutoModeration?: boolean;
  enableKeywordFiltering?: boolean;
}

export class ContentModerationService {
  /**
   * Check if content contains negative keywords or patterns
   */
  static checkNegativeContent(text: string): ModerationResult {
    const detectedIssues: string[] = [];
    let confidence: 'low' | 'medium' | 'high' = 'low';
    
    const lowerText = text.toLowerCase();
    
    // Check for negative keywords
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        detectedIssues.push(`Contains negative keyword: "${keyword}"`);
        confidence = confidence === 'low' ? 'medium' : 'high';
      }
    }
    
    // Check for negative patterns
    for (const pattern of NEGATIVE_PATTERNS) {
      if (pattern.test(text)) {
        detectedIssues.push('Matches negative content pattern');
        confidence = 'high';
      }
    }
    
    // Determine if content should be blocked
    const isBlocked = confidence === 'high' || detectedIssues.length >= 3;
    
    // Always require approval if any issues detected
    const requiresApproval = detectedIssues.length > 0 || isBlocked;
    
    return {
      requiresApproval,
      isBlocked,
      reason: isBlocked 
        ? 'Content contains inappropriate language or negative comments about the platform, admin, or community.'
        : detectedIssues.length > 0
        ? 'Content may require review before publication.'
        : undefined,
      detectedIssues,
      confidence,
    };
  }
  
  /**
   * Moderate content based on settings and AI-based content analysis
   * Uses Gemini AI for sentiment analysis and negative content detection
   */
  static async moderateContent(
    content: string,
    contentType: 'post' | 'media' | 'comment' | 'testimonial' = 'post',
    userId?: string,
    settings: ModerationSettings = {}
  ): Promise<ModerationResult> {
    // Check user's moderation settings from Firestore if userId provided
    let userRequiresApproval = settings.requireApprovalForUser;
    if (userId && !userRequiresApproval) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../config/firebase');
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          userRequiresApproval = userData.moderationSettings?.requireApproval || false;
        }
      } catch (error) {
        console.warn('Failed to check user moderation settings:', error);
      }
    }
    
    // If user requires approval, always require it
    if (userRequiresApproval) {
      return {
        requiresApproval: true,
        isBlocked: false,
        reason: 'This user requires approval for all content.',
        detectedIssues: [],
        confidence: 'low',
      };
    }
    
    // If content explicitly requires approval
    if (settings.requireApproval) {
      return {
        requiresApproval: true,
        isBlocked: false,
        reason: 'Content marked as requiring approval.',
        detectedIssues: [],
        confidence: 'low',
      };
    }
    
    // Use AI-based moderation if enabled (default: true)
    if (settings.enableAutoModeration !== false) {
      try {
        const aiResult = await moderateContentWithAI({
          content,
          contentType,
          userId,
        });
        
        // Convert AI response to ModerationResult format
        return {
          requiresApproval: aiResult.requiresApproval,
          isBlocked: aiResult.isBlocked,
          reason: aiResult.reason,
          detectedIssues: aiResult.detectedIssues,
          confidence: aiResult.confidence > 0.7 ? 'high' : aiResult.confidence > 0.4 ? 'medium' : 'low',
        };
      } catch (error) {
        console.error('❌ [ContentModeration] AI moderation failed, falling back to keywords:', error);
        // Fall through to keyword-based moderation
      }
    }
    
    // Fallback to keyword filtering if AI is disabled or fails
    if (settings.enableKeywordFiltering !== false) {
      const keywordCheck = this.checkNegativeContent(content);
      
      // If blocked, return immediately
      if (keywordCheck.isBlocked) {
        return keywordCheck;
      }
      
      // If issues detected, require approval
      if (keywordCheck.detectedIssues.length > 0) {
        return keywordCheck;
      }
    }
    
    // No issues found
    return {
      requiresApproval: false,
      isBlocked: false,
      detectedIssues: [],
      confidence: 'low',
    };
  }
  
  /**
   * Get moderation status for display
   */
  static getModerationStatus(
    moderationStatus?: 'pending' | 'approved' | 'rejected',
    requiresApproval?: boolean
  ): {
    status: 'pending' | 'approved' | 'rejected' | 'published';
    label: string;
    color: string;
  } {
    if (moderationStatus === 'rejected') {
      return { status: 'rejected', label: 'Rejected', color: 'red' };
    }
    
    if (moderationStatus === 'approved' || (!requiresApproval && !moderationStatus)) {
      return { status: 'published', label: 'Published', color: 'green' };
    }
    
    return { status: 'pending', label: 'Pending Approval', color: 'amber' };
  }
}

