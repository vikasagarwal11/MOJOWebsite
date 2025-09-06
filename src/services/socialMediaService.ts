// Social Media Integration Service
// This service handles auto-posting to various social media platforms

export interface SocialMediaPost {
  text: string;
  mediaUrl?: string;
  mediaType: 'image' | 'video';
  platforms: ('facebook' | 'instagram' | 'twitter')[];
}

export interface SocialMediaConfig {
  facebook: {
    appId: string;
    accessToken: string;
  };
  instagram: {
    accessToken: string;
    businessAccountId: string;
  };
  twitter: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
}

class SocialMediaService {
  private config: Partial<SocialMediaConfig> = {};

  // Initialize with API credentials
  initialize(config: Partial<SocialMediaConfig>) {
    this.config = config;
  }

  // Post to Facebook
  async postToFacebook(post: SocialMediaPost): Promise<boolean> {
    if (!this.config.facebook?.appId || !this.config.facebook?.accessToken) {
      console.warn('Facebook credentials not configured');
      return false;
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/me/photos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: this.config.facebook.accessToken,
            message: post.text,
            url: post.mediaUrl,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Facebook API error: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Facebook post successful:', result);
      return true;
    } catch (error) {
      console.error('Facebook posting failed:', error);
      return false;
    }
  }

  // Post to Instagram (requires Facebook Business Account)
  async postToInstagram(post: SocialMediaPost): Promise<boolean> {
    if (!this.config.instagram?.accessToken || !this.config.instagram?.businessAccountId) {
      console.warn('Instagram credentials not configured');
      return false;
    }

    try {
      // Step 1: Create media container
      const containerResponse = await fetch(
        `https://graph.facebook.com/v18.0/${this.config.instagram.businessAccountId}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: this.config.instagram.accessToken,
            image_url: post.mediaUrl,
            caption: post.text,
          }),
        }
      );

      if (!containerResponse.ok) {
        throw new Error(`Instagram container creation failed: ${containerResponse.statusText}`);
      }

      const container = await containerResponse.json();
      
      // Step 2: Publish the media
      const publishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${this.config.instagram.businessAccountId}/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: this.config.instagram.accessToken,
            creation_id: container.id,
          }),
        }
      );

      if (!publishResponse.ok) {
        throw new Error(`Instagram publishing failed: ${publishResponse.statusText}`);
      }

      const result = await publishResponse.json();
      console.log('Instagram post successful:', result);
      return true;
    } catch (error) {
      console.error('Instagram posting failed:', error);
      return false;
    }
  }

  // Post to Twitter
  async postToTwitter(post: SocialMediaPost): Promise<boolean> {
    if (!this.config.twitter?.apiKey || !this.config.twitter?.accessToken) {
      console.warn('Twitter credentials not configured');
      return false;
    }

    try {
      // For Twitter, we'll use a simplified approach
      // In production, you'd use the Twitter API v2 with proper OAuth
      const tweetText = `${post.text}\n\n${post.mediaUrl}`;
      
      // Open Twitter compose in new window
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, '_blank');
      
      return true;
    } catch (error) {
      console.error('Twitter posting failed:', error);
      return false;
    }
  }

  // Post to multiple platforms
  async postToMultiplePlatforms(post: SocialMediaPost): Promise<{
    facebook: boolean;
    instagram: boolean;
    twitter: boolean;
  }> {
    const results = {
      facebook: false,
      instagram: false,
      twitter: false,
    };

    // Post to Facebook
    if (post.platforms.includes('facebook')) {
      results.facebook = await this.postToFacebook(post);
    }

    // Post to Instagram
    if (post.platforms.includes('instagram')) {
      results.instagram = await this.postToInstagram(post);
    }

    // Post to Twitter
    if (post.platforms.includes('twitter')) {
      results.twitter = await this.postToTwitter(post);
    }

    return results;
  }

  // Get sharing URLs for manual sharing
  getSharingUrls(post: SocialMediaPost): {
    facebook: string;
    instagram: string;
    twitter: string;
  } {
    const encodedText = encodeURIComponent(post.text);
    const encodedUrl = encodeURIComponent(post.mediaUrl || '');

    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      instagram: `https://www.instagram.com/create/`, // Instagram doesn't support direct URL sharing
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    };
  }
}

// Export singleton instance
export const socialMediaService = new SocialMediaService();

// Environment configuration
export const configureSocialMedia = () => {
  const config: Partial<SocialMediaConfig> = {
    facebook: {
      appId: import.meta.env.VITE_FACEBOOK_APP_ID || '',
      accessToken: import.meta.env.VITE_FACEBOOK_ACCESS_TOKEN || '',
    },
    instagram: {
      accessToken: import.meta.env.VITE_INSTAGRAM_ACCESS_TOKEN || '',
      businessAccountId: import.meta.env.VITE_INSTAGRAM_BUSINESS_ACCOUNT_ID || '',
    },
    twitter: {
      apiKey: import.meta.env.VITE_TWITTER_API_KEY || '',
      apiSecret: import.meta.env.VITE_TWITTER_API_SECRET || '',
      accessToken: import.meta.env.VITE_TWITTER_ACCESS_TOKEN || '',
      accessTokenSecret: import.meta.env.VITE_TWITTER_ACCESS_TOKEN_SECRET || '',
    },
  };

  socialMediaService.initialize(config);
};
