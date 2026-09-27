export enum Platform {
  FACEBOOK = 'Facebook',
  INSTAGRAM = 'Instagram'
}

export enum Sentiment {
  POSITIVE = 'Positive',
  NEUTRAL = 'Neutral',
  NEGATIVE = 'Negative',
  SPAM = 'Spam'
}

export enum CommentStatus {
  PENDING = 'Pending',
  DRAFTED = 'Drafted',
  POSTED = 'Posted',
  HIDDEN = 'Hidden'
}

export interface AdCampaign {
  id: string;
  name: string;
  platform: Platform;
  thumbnailUrl: string;
  description: string;
  status: string;
  commentCount?: number;
  createdTime?: string;
  igPermalink?: string | null;
  videoId?: string | null;
  objectType?: string | null;
}

export interface SocialComment {
  id: string;
  adId: string; // Link to the specific Ad
  author: string;
  content: string;
  platform: Platform;
  timestamp: string;
  status: CommentStatus;
  sentiment?: Sentiment;
  suggestedReply?: string;
  humanScore?: number;
}

export interface AdContext {
  productName: string;
  description: string;
  tone: 'Professional' | 'Casual' | 'Witty' | 'Empathetic';
  forbiddenKeywords: string[];
}

export interface ReplyGenerationResult {
  reply: string;
  reasoning: string;
  sentiment: Sentiment;
  humanScore: number;
}