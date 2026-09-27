import { AdCampaign, SocialComment, CommentStatus, Platform, Sentiment } from "../types";

// --- CONFIGURATION ---
// ⚠️ SECURITY WARNING: Never commit this file with real tokens to GitHub/public repos.
const HARDCODED_ID = ""; 
const HARDCODED_ACCESS_TOKEN = ""; 

let META_ID = (localStorage.getItem('socialguard_page_id') || HARDCODED_ID).trim();
let META_ACCESS_TOKEN = (localStorage.getItem('socialguard_access_token') || HARDCODED_ACCESS_TOKEN).trim();
const GRAPH_VERSION = 'v19.0';

export const setApiCredentials = (id: string, token: string) => {
  META_ID = id.trim();
  META_ACCESS_TOKEN = token.trim();
  localStorage.setItem('socialguard_page_id', META_ID);
  localStorage.setItem('socialguard_access_token', META_ACCESS_TOKEN);
};

// --- CONNECTION TEST ---
export interface ConnectionTestResult {
  success: boolean;
  accountType: 'ad_account' | 'page' | 'unknown';
  accountName: string | null;
  permissions: string[];
  error: string | null;
}

export const testConnection = async (testId: string, testToken: string): Promise<ConnectionTestResult> => {
  const id = testId.trim();
  const token = testToken.trim();

  if (!id || !token) {
    return { success: false, accountType: 'unknown', accountName: null, permissions: [], error: 'Missing Account ID or Access Token' };
  }

  try {
    // 1. Validate token
    const meRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?access_token=${token}`);
    const meData = await meRes.json();
    if (meData.error) {
      return { success: false, accountType: 'unknown', accountName: null, permissions: [], error: `Token Error: ${meData.error.message}` };
    }

    // 2. Get permissions
    const debugRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${token}&access_token=${token}`);
    const debugData = await debugRes.json();
    const permissions: string[] = debugData.data?.scopes || [];

    // 3. Validate account based on type
    if (id.startsWith('act_')) {
      // AD ACCOUNT
      const accRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}?fields=name,account_id,account_status&access_token=${token}`);
      const accData = await accRes.json();
      
      if (accData.error) {
        if (accData.error.code === 100) return { success: false, accountType: 'ad_account', accountName: null, permissions, error: `Ad Account not found or no access to ${id}` };
        if (accData.error.code === 190) return { success: false, accountType: 'ad_account', accountName: null, permissions, error: 'Token expired. Generate a new one.' };
        return { success: false, accountType: 'ad_account', accountName: null, permissions, error: accData.error.message };
      }

      if (!permissions.includes('ads_read')) {
        return { success: false, accountType: 'ad_account', accountName: accData.name, permissions, error: 'Missing "ads_read" permission. Re-generate token with this scope.' };
      }

      return { success: true, accountType: 'ad_account', accountName: accData.name, permissions, error: null };

    } else {
      // PAGE
      const pageRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}?fields=name,id&access_token=${token}`);
      const pageData = await pageRes.json();

      if (pageData.error) {
        if (pageData.error.message?.includes('Unsupported get request')) {
          return { success: false, accountType: 'unknown', accountName: null, permissions, error: `Invalid ID "${id}". If Ad Account, add "act_" prefix (e.g., act_${id})` };
        }
        return { success: false, accountType: 'page', accountName: null, permissions, error: pageData.error.message };
      }

      const hasPagePerm = permissions.includes('pages_read_engagement') || permissions.includes('pages_manage_engagement');
      if (!hasPagePerm) {
        return { success: false, accountType: 'page', accountName: pageData.name, permissions, error: 'Missing "pages_read_engagement" permission.' };
      }

      return { success: true, accountType: 'page', accountName: pageData.name, permissions, error: null };
    }

  } catch (err: any) {
    return { success: false, accountType: 'unknown', accountName: null, permissions: [], error: `Network Error: ${err.message}` };
  }
};

// --- MOCK DATABASE (Fallback) ---
const MOCK_ADS: AdCampaign[] = [
  {
    id: 'ad_101',
    name: 'Summer Sale Video',
    platform: Platform.FACEBOOK,
    status: 'Ad (Dark Post)',
    thumbnailUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    description: 'A 30-second video showing the backpack being dunked in a river. Focus is on 100% waterproof guarantee and the 20% off summer discount code "SUMMER20".'
  },
  {
    id: 'ad_102',
    name: 'Urban Commuter Static',
    platform: Platform.INSTAGRAM,
    status: 'Organic',
    thumbnailUrl: 'https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    description: 'A photo of a professional wearing the black backpack in a subway. Focus on laptop safety, sleek design, and anti-theft zippers. Price $120.'
  }
];

let MOCK_COMMENTS: SocialComment[] = [
  {
    id: '1',
    adId: 'ad_101',
    author: 'Sarah Jenkins',
    content: 'Is this actually waterproof? I bought a similar one last year and it leaked.',
    platform: Platform.FACEBOOK,
    timestamp: '10m ago',
    status: CommentStatus.PENDING,
  },
  {
    id: '2',
    adId: 'ad_101',
    author: 'Mike Ross',
    content: 'Is the discount code still working?',
    platform: Platform.FACEBOOK,
    timestamp: '25m ago',
    status: CommentStatus.PENDING,
  }
];

// Helper to simulate network latency for mocks
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Internal helper to try and upgrade a User Token to a Page Token (Only needed for Page flows)
const ensurePageAccessToken = async (): Promise<string> => {
    // If we are in Ad Account mode (act_), we don't need a page token to read ads.
    if (META_ID.startsWith('act_')) return META_ACCESS_TOKEN;

    try {
        console.log("Attempting to fetch Page Access Token from User Token...");
        const response = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?limit=100&access_token=${META_ACCESS_TOKEN}`
        );
        const data = await response.json();
        
        if (data.data) {
            const pageData = data.data.find((p: any) => p.id === META_ID);
            if (pageData && pageData.access_token) {
                console.log("Successfully upgraded to Page Access Token.");
                META_ACCESS_TOKEN = pageData.access_token; // Update in memory
                return pageData.access_token;
            }
        }
    } catch (e) {
        console.warn("Failed to auto-upgrade token:", e);
    }
    return META_ACCESS_TOKEN;
};

// --- API FETCH HELPERS ---

// --- FETCH OPTIONS ---
export interface FetchAdsOptions {
  dateFrom?: string;  // YYYY-MM-DD
  dateTo?: string;    // YYYY-MM-DD
  activeOnly?: boolean;
  withCommentsOnly?: boolean;
}

let currentFetchOptions: FetchAdsOptions = {
  activeOnly: true,
  withCommentsOnly: true
};

export const setFetchOptions = (options: FetchAdsOptions) => {
  currentFetchOptions = { ...currentFetchOptions, ...options };
};

export const getFetchOptions = () => currentFetchOptions;

const fetchAdAccountAds = async (id: string, token: string): Promise<AdCampaign[]> => {
    const allAds: any[] = [];
    let nextUrl: string | null = null;
    
    // Build time filter
    let timeFilter = '';
    if (currentFetchOptions.dateFrom || currentFetchOptions.dateTo) {
      const since = currentFetchOptions.dateFrom ? Math.floor(new Date(currentFetchOptions.dateFrom).getTime() / 1000) : '';
      const until = currentFetchOptions.dateTo ? Math.floor(new Date(currentFetchOptions.dateTo + 'T23:59:59').getTime() / 1000) : '';
      if (since) timeFilter += `&filtering=[{"field":"created_time","operator":"GREATER_THAN","value":${since}}]`;
    }
    
    // Status filter - ACTIVE only or all
    const statusFilter = currentFetchOptions.activeOnly 
      ? '&effective_status=["ACTIVE"]' 
      : '';

    // Initial endpoint with pagination - include video_id for video posts
    let endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${id}/ads?fields=name,status,effective_status,created_time,creative{effective_object_story_id,effective_instagram_media_id,video_id,thumbnail_url,image_url,body,instagram_permalink_url,object_type}&limit=100${statusFilter}&access_token=${token}`;
    
    console.log('Fetching ads with options:', currentFetchOptions);

    // Paginate through ALL ads
    let pageCount = 0;
    const maxPages = 20; // Safety limit (2000 ads max)
    
    while (endpoint && pageCount < maxPages) {
      const response = await fetch(endpoint);
      const data = await response.json();

      if (data.error) throw new Error(data.error.message);

      const ads = data.data || [];
      allAds.push(...ads);
      
      console.log(`Fetched page ${pageCount + 1}: ${ads.length} ads (total: ${allAds.length})`);

      // Check for next page
      endpoint = data.paging?.next || null;
      pageCount++;
    }

    console.log(`Total ads fetched: ${allAds.length}`);

    // Filter ads with linked post ID (FB or IG)
    const validAds = allAds.filter((ad: any) => {
      if (!ad.creative) return false;
      return ad.creative.effective_object_story_id || ad.creative.effective_instagram_media_id;
    });

    console.log(`Ads with post IDs: ${validAds.length}`);

    // Date filter (if API filtering didn't work, do client-side)
    let filteredAds = validAds;
    if (currentFetchOptions.dateFrom) {
      const fromDate = new Date(currentFetchOptions.dateFrom);
      filteredAds = filteredAds.filter((ad: any) => new Date(ad.created_time) >= fromDate);
    }
    if (currentFetchOptions.dateTo) {
      const toDate = new Date(currentFetchOptions.dateTo + 'T23:59:59');
      filteredAds = filteredAds.filter((ad: any) => new Date(ad.created_time) <= toDate);
    }

    // Deduplicate by post ID and detect platform
    const uniqueMap = new Map<string, AdCampaign>();
    
    for (const ad of filteredAds) {
      const fbPostId = ad.creative.effective_object_story_id;
      const igMediaId = ad.creative.effective_instagram_media_id;
      const videoId = ad.creative.video_id;
      const objectType = ad.creative.object_type; // VIDEO, PHOTO, SHARE, etc.
      const postId = fbPostId || igMediaId;
      const isInstagram = !!igMediaId && !fbPostId;
      
      console.log(`Ad: ${ad.name} | postId: ${postId} | videoId: ${videoId} | type: ${objectType}`);
      
      if (!uniqueMap.has(postId)) {
        uniqueMap.set(postId, {
          id: postId,
          name: ad.name || 'Untitled Ad',
          platform: isInstagram ? Platform.INSTAGRAM : Platform.FACEBOOK,
          status: ad.effective_status || 'ACTIVE',
          thumbnailUrl: ad.creative.image_url || ad.creative.thumbnail_url || '',
          description: ad.creative.body || '',
          createdTime: ad.created_time,
          igPermalink: ad.creative.instagram_permalink_url || null,
          videoId: videoId || null,
          objectType: objectType || null,
          commentCount: 0 // Will be filled below
        });
      }
    }

    console.log(`Unique posts: ${uniqueMap.size}`);

    // If withCommentsOnly, fetch comment counts and filter
    if (currentFetchOptions.withCommentsOnly) {
      const postsWithComments: AdCampaign[] = [];
      const entries = Array.from(uniqueMap.entries());
      
      // Batch check comments (process in chunks to avoid rate limits)
      const chunkSize = 10;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        
        const results = await Promise.all(
          chunk.map(async ([postId, adData]) => {
            try {
              const isInstagram = adData.platform === Platform.INSTAGRAM;
              let count = 0;
              
              if (isInstagram) {
                // Instagram: Use media endpoint with comments_count field
                console.log(`[${postId}] (IG) Fetching comment count...`);
                const igUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}?fields=comments_count&access_token=${token}`;
                const igRes = await fetch(igUrl);
                const igData = await igRes.json();
                
                if (igData.error) {
                  console.log(`[${postId}] (IG) Error:`, igData.error.message);
                  // Fallback: try to fetch comments directly and count
                  const fallbackUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}/comments?limit=50&access_token=${token}`;
                  const fallbackRes = await fetch(fallbackUrl);
                  const fallbackData = await fallbackRes.json();
                  count = fallbackData.data?.length || 0;
                  console.log(`[${postId}] (IG) Fallback count: ${count}`);
                } else {
                  count = igData.comments_count || 0;
                  console.log(`[${postId}] (IG) Comments count: ${count}`);
                }
              } else {
                // Facebook: Use standard post comments with summary
                let commentsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}/comments?summary=true&limit=0&access_token=${token}`;
                let res = await fetch(commentsUrl);
                let data = await res.json();
                
                console.log(`[${postId}] (FB) Comments response:`, data.error ? data.error.message : `count=${data.summary?.total_count || 0}`);
                
                count = data.summary?.total_count || 0;
                
                // If error or 0 comments, try alternate approaches for videos
                if (data.error || count === 0) {
                  // First, try direct videoId if we have it from creative
                  if (adData.videoId) {
                    console.log(`[${postId}] Trying direct videoId: ${adData.videoId}`);
                    const videoUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${adData.videoId}/comments?summary=true&limit=0&access_token=${token}`;
                    const videoRes = await fetch(videoUrl);
                    const videoData = await videoRes.json();
                    
                    console.log(`[${postId}] Direct video comments:`, videoData.error ? videoData.error.message : `count=${videoData.summary?.total_count || 0}`);
                    
                    if (!videoData.error && videoData.summary?.total_count > 0) {
                      count = videoData.summary.total_count;
                    }
                  }
                  
                  // If still 0 and postId has underscore, try extracting ID
                  if (count === 0 && postId.includes('_')) {
                    const extractedId = postId.split('_')[1];
                    if (extractedId !== adData.videoId) { // Don't retry same ID
                      console.log(`[${postId}] Trying extracted ID: ${extractedId}`);
                      const extractedUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${extractedId}/comments?summary=true&limit=0&access_token=${token}`;
                      const extractedRes = await fetch(extractedUrl);
                      const extractedData = await extractedRes.json();
                      
                      console.log(`[${postId}] Extracted ID comments:`, extractedData.error ? extractedData.error.message : `count=${extractedData.summary?.total_count || 0}`);
                      
                      if (!extractedData.error && extractedData.summary?.total_count > 0) {
                        count = extractedData.summary.total_count;
                      }
                    }
                  }
                }
              }
              
              return { postId, adData, count };
            } catch (e) {
              console.error(`[${postId}] Comment fetch error:`, e);
              return { postId, adData, count: 0 };
            }
          })
        );
        
        for (const { postId, adData, count } of results) {
          if (count > 0) {
            postsWithComments.push({ ...adData, commentCount: count });
          }
        }
        
        console.log(`Checked comments ${i + chunk.length}/${entries.length}, found ${postsWithComments.length} with comments`);
      }
      
      console.log(`Final: ${postsWithComments.length} ads with comments`);
      return postsWithComments.sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
    }

    return Array.from(uniqueMap.values());
};

const fetchPagePosts = async (id: string, token: string): Promise<AdCampaign[]> => {
    const fetchEndpoint = async (url: string) => {
         let response = await fetch(url);
         let data = await response.json();
         
         // AUTO-FIX: If permission error, try to upgrade token and retry ONCE
         if (data.error && (data.error.code === 190 || data.error.code === 10 || data.error.message.includes('permission') || data.error.message.includes('Unsupported get request'))) {
             await ensurePageAccessToken();
             // Update endpoint with new token
             const newUrl = new URL(url);
             newUrl.searchParams.set('access_token', META_ACCESS_TOKEN || '');
             response = await fetch(newUrl.toString());
             data = await response.json();
         }
         if (data.error) throw new Error(data.error.message);
         return data.data || [];
    };

    let promotableError: string | null = null;
    let feedError: string | null = null;

    // 1. Fetch Promotable Posts
    const promotableUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${id}/promotable_posts?fields=id,message,full_picture,created_time,status_type,is_published,privacy&limit=25&access_token=${token}`;
    const promotablePosts = await fetchEndpoint(promotableUrl).catch(e => {
        promotableError = e.message;
        return [];
    });

    // 2. Fetch Feed
    const feedUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${id}/feed?fields=id,message,full_picture,created_time,status_type,is_published&limit=25&access_token=${token}`;
    const feedPosts = await fetchEndpoint(feedUrl).catch(e => {
        feedError = e.message;
        return [];
    });

    // 3. Merge
    const allPosts = [...promotablePosts, ...feedPosts];
    
    if (allPosts.length === 0) {
        if (promotableError && feedError) {
             if (feedError.includes('InvalidID') || feedError.includes('nonexisting field')) {
                throw new Error(`Invalid Page ID '${id}'. If this is an Ad Account, please add 'act_' prefix (e.g. act_${id}).`);
            }
            throw new Error(`Failed to fetch data: ${promotableError} / ${feedError}`);
        }
        if (promotableError) throw new Error(`Ads Error: ${promotableError}`);
        // If feed error but promotable worked (or returned empty), we might be okay, but generally we expect something.
        // Returning empty array is valid for a new page.
        return [];
    }

    const uniquePosts = Array.from(new Map(allPosts.map(item => [item.id, item])).values());

    return uniquePosts.map((post: any) => ({
      id: post.id,
      name: post.message ? post.message.substring(0, 40) + '...' : `Untitled Post (${post.id})`,
      platform: Platform.FACEBOOK,
      status: post.is_published === false ? 'Ad (Dark Post)' : 'Organic',
      thumbnailUrl: post.full_picture || 'https://placehold.co/150x150?text=No+Image',
      description: post.message || 'No description available.'
    }));
};

export const socialApi = {
  // GET: Fetch all active ad campaigns (Or Page Feed Posts)
  getCampaigns: async (): Promise<AdCampaign[]> => {
    // REAL API MODE
    if (META_ACCESS_TOKEN && META_ID) {
      try {
        // CASE 1: Explicit Ad Account
        if (META_ID.startsWith('act_')) {
            return await fetchAdAccountAds(META_ID, META_ACCESS_TOKEN);
        }

        // CASE 2: Page Mode (Default)
        try {
             return await fetchPagePosts(META_ID, META_ACCESS_TOKEN);
        } catch (pageError: any) {
             // AUTO-FIX: Smart Retry Logic
             // If Page fetch fails, and ID looks like a raw number (common user error for Ad Accounts),
             // try prepending 'act_' and fetching as Ad Account.
             if (/^\d+$/.test(META_ID)) {
                 console.log("Page fetch failed. Attempting auto-correction to Ad Account ID...");
                 try {
                     const correctedId = `act_${META_ID}`;
                     const ads = await fetchAdAccountAds(correctedId, META_ACCESS_TOKEN);
                     
                     // If successful, permanently update credentials
                     console.log("Auto-correction successful. Updating ID.");
                     setApiCredentials(correctedId, META_ACCESS_TOKEN);
                     
                     return ads;
                 } catch (adError) {
                     // If auto-fix also fails, throw the original Page error as it contains the helpful hint
                     throw pageError;
                 }
             }
             throw pageError;
        }

      } catch (e: any) {
        console.error("Critical Graph API Error:", e);
        throw new Error(e.message || "Unknown Meta API Error");
      }
    }

    // MOCK MODE
    await delay(800);
    return [...MOCK_ADS];
  },

  // POST: Sync new ads
  syncAdsFromMeta: async (): Promise<AdCampaign> => {
    if (META_ACCESS_TOKEN) {
       // Just return a dummy to satisfy the interface, the app should reload the list
       return MOCK_ADS[0];
    }
    await delay(2000);
    const newAd: AdCampaign = {
      id: `ad_${Math.floor(Math.random() * 1000)}`,
      name: 'New Viral Campaign (Synced)',
      platform: Platform.INSTAGRAM,
      status: 'Ad (Dark Post)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1548690312-e3b507d8c110?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
      description: 'New video ad featuring hikers in the rain. Emphasizes durability and comfort.'
    };
    MOCK_ADS.push(newAd);
    return newAd;
  },

  // GET: Fetch comments
  getComments: async (campaignIds?: string[], adsData?: AdCampaign[]): Promise<SocialComment[]> => {
    // REAL API MODE
    if (META_ACCESS_TOKEN && META_ID) {
      try {
        let postIdsToFetch = campaignIds || [];

        console.log('=== getComments START ===');
        console.log('Posts to fetch:', postIdsToFetch);
        console.log('Ads data passed:', adsData?.map(a => ({ id: a.id, videoId: a.videoId, platform: a.platform })));

        // If no IDs provided, and we are in Page mode, fetch promotable posts to find IDs
        if (postIdsToFetch.length === 0 && !META_ID.startsWith('act_')) {
             const response = await fetch(
                `https://graph.facebook.com/${GRAPH_VERSION}/${META_ID}/promotable_posts?limit=10&access_token=${META_ACCESS_TOKEN}`
            ).catch(e => null);
            
            if (response) {
                 const data = await response.json();
                 if (!data.error) {
                    postIdsToFetch = (data.data || []).map((p:any) => p.id);
                 }
            }
        }

        let allComments: SocialComment[] = [];
        
        console.log(`Fetching comments for ${postIdsToFetch.length} posts...`);

        for (const postId of postIdsToFetch) {
           try {
               // Determine if this is an Instagram post (check adsData or ID format)
               const adInfo = adsData?.find(a => a.id === postId);
               console.log(`[${postId}] adInfo found:`, adInfo ? { videoId: adInfo.videoId, platform: adInfo.platform, objectType: adInfo.objectType } : 'NOT FOUND');
               
               const isInstagram = adInfo?.platform === Platform.INSTAGRAM || 
                                   (adInfo?.igPermalink && !postId.includes('_'));
               
               // For videos, try videoId first if available
               if (!isInstagram && adInfo?.videoId) {
                 console.log(`[${postId}] Trying videoId FIRST: ${adInfo.videoId}`);
                 const videoUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${adInfo.videoId}/comments?fields=id,message,from,created_time&limit=50&access_token=${META_ACCESS_TOKEN}`;
                 const videoResponse = await fetch(videoUrl);
                 const videoData = await videoResponse.json();
                 
                 if (!videoData.error && videoData.data?.length > 0) {
                   const mappedComments = videoData.data.map((c: any) => ({
                     id: c.id,
                     adId: postId,
                     author: c.from?.name || 'Unknown User',
                     content: c.message || '',
                     platform: Platform.FACEBOOK,
                     timestamp: c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown',
                     status: CommentStatus.PENDING,
                   }));
                   allComments = [...allComments, ...mappedComments];
                   console.log(`[${postId}] ✓ Got ${mappedComments.length} comments via videoId`);
                   continue; // Skip other attempts
                 } else {
                   console.log(`[${postId}] videoId attempt failed:`, videoData.error?.message || 'empty data');
                 }
               }
               
               let commentsUrl: string;
               if (isInstagram) {
                 // Instagram media comments endpoint
                 commentsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}/comments?fields=id,text,username,timestamp&limit=50&access_token=${META_ACCESS_TOKEN}`;
               } else {
                 // Facebook post comments endpoint
                 commentsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}/comments?fields=id,message,from,created_time,can_reply_privately&summary=true&order=reverse_chronological&limit=50&access_token=${META_ACCESS_TOKEN}`;
               }
               
               console.log(`[${postId}] Fetching via ${isInstagram ? 'IG' : 'FB'} endpoint...`);
               
               const commentsResponse = await fetch(commentsUrl);
               const commentsData = await commentsResponse.json();
               
               if (commentsData.error) {
                   console.warn(`[${postId}] Error:`, commentsData.error.message);
                   
                   // Try alternate endpoint if first fails
                   if (!isInstagram) {
                     // First try with simplified fields
                     console.log(`Retrying ${postId} with alternate endpoint...`);
                     const altUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}/comments?fields=id,message,from,created_time&limit=50&access_token=${META_ACCESS_TOKEN}`;
                     const altResponse = await fetch(altUrl);
                     const altData = await altResponse.json();
                     if (!altData.error && altData.data?.length > 0) {
                       const mappedComments = altData.data.map((c: any) => ({
                         id: c.id,
                         adId: postId,
                         author: c.from?.name || 'Unknown User',
                         content: c.message || '',
                         platform: Platform.FACEBOOK,
                         timestamp: c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown',
                         status: CommentStatus.PENDING,
                       }));
                       allComments = [...allComments, ...mappedComments];
                       console.log(`Got ${mappedComments.length} comments from alternate endpoint`);
                       continue;
                     }
                     
                     // Try direct videoId if we have it from ad data
                     if (adInfo?.videoId) {
                       console.log(`Trying direct videoId ${adInfo.videoId} for ${postId}...`);
                       const videoUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${adInfo.videoId}/comments?fields=id,message,from,created_time&limit=50&access_token=${META_ACCESS_TOKEN}`;
                       const videoResponse = await fetch(videoUrl);
                       const videoData = await videoResponse.json();
                       if (!videoData.error && videoData.data?.length > 0) {
                         const mappedComments = videoData.data.map((c: any) => ({
                           id: c.id,
                           adId: postId,
                           author: c.from?.name || 'Unknown User',
                           content: c.message || '',
                           platform: Platform.FACEBOOK,
                           timestamp: c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown',
                           status: CommentStatus.PENDING,
                         }));
                         allComments = [...allComments, ...mappedComments];
                         console.log(`Got ${mappedComments.length} comments from direct videoId`);
                         continue;
                       }
                     }
                     
                     // If still no luck and ID has underscore, try extracted ID (for Reels/Videos)
                     if (postId.includes('_')) {
                       const videoId = postId.split('_')[1];
                       console.log(`Trying video ID ${videoId} for Reels...`);
                       const videoUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${videoId}/comments?fields=id,message,from,created_time&limit=50&access_token=${META_ACCESS_TOKEN}`;
                       const videoResponse = await fetch(videoUrl);
                       const videoData = await videoResponse.json();
                       if (!videoData.error && videoData.data?.length > 0) {
                         const mappedComments = videoData.data.map((c: any) => ({
                           id: c.id,
                           adId: postId, // Keep original postId for reference
                           author: c.from?.name || 'Unknown User',
                           content: c.message || '',
                           platform: Platform.FACEBOOK,
                           timestamp: c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown',
                           status: CommentStatus.PENDING,
                         }));
                         allComments = [...allComments, ...mappedComments];
                         console.log(`Got ${mappedComments.length} comments from video endpoint`);
                       }
                     }
                   }
                   continue;
               }
               
               const comments = commentsData.data || [];
               console.log(`Got ${comments.length} comments for ${postId}`);
               
               // If empty and not Instagram, try video endpoints
               if (comments.length === 0 && !isInstagram) {
                 // First try direct videoId if available
                 if (adInfo?.videoId) {
                   console.log(`Empty response, trying direct videoId ${adInfo.videoId}...`);
                   const videoUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${adInfo.videoId}/comments?fields=id,message,from,created_time&limit=50&access_token=${META_ACCESS_TOKEN}`;
                   const videoResponse = await fetch(videoUrl);
                   const videoData = await videoResponse.json();
                   if (!videoData.error && videoData.data?.length > 0) {
                     const mappedComments = videoData.data.map((c: any) => ({
                       id: c.id,
                       adId: postId,
                       author: c.from?.name || 'Unknown User',
                       content: c.message || '',
                       platform: Platform.FACEBOOK,
                       timestamp: c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown',
                       status: CommentStatus.PENDING,
                     }));
                     allComments = [...allComments, ...mappedComments];
                     console.log(`Got ${mappedComments.length} comments from direct videoId (empty fallback)`);
                     continue;
                   }
                 }
                 
                 // Try extracted ID from postId
                 if (postId.includes('_')) {
                   const extractedId = postId.split('_')[1];
                   if (extractedId !== adInfo?.videoId) { // Don't retry same ID
                     console.log(`Empty response, trying extracted ID ${extractedId}...`);
                     const extractedUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${extractedId}/comments?fields=id,message,from,created_time&limit=50&access_token=${META_ACCESS_TOKEN}`;
                     const extractedResponse = await fetch(extractedUrl);
                     const extractedData = await extractedResponse.json();
                     if (!extractedData.error && extractedData.data?.length > 0) {
                       const mappedComments = extractedData.data.map((c: any) => ({
                         id: c.id,
                         adId: postId,
                         author: c.from?.name || 'Unknown User',
                         content: c.message || '',
                         platform: Platform.FACEBOOK,
                         timestamp: c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown',
                         status: CommentStatus.PENDING,
                       }));
                       allComments = [...allComments, ...mappedComments];
                       console.log(`Got ${mappedComments.length} comments from extracted ID (empty fallback)`);
                       continue;
                     }
                   }
                 }
               }
               
               const mappedComments = comments.map((c: any) => ({
                 id: c.id,
                 adId: postId,
                 author: isInstagram ? (c.username || 'Instagram User') : (c.from?.name || 'Unknown User'),
                 content: isInstagram ? (c.text || '') : (c.message || ''),
                 platform: isInstagram ? Platform.INSTAGRAM : Platform.FACEBOOK,
                 timestamp: isInstagram 
                   ? (c.timestamp ? new Date(c.timestamp).toLocaleString() : 'Unknown')
                   : (c.created_time ? new Date(c.created_time).toLocaleString() : 'Unknown'),
                 status: CommentStatus.PENDING, 
               }));
               allComments = [...allComments, ...mappedComments];
               console.log(`[${postId}] ✓ Got ${mappedComments.length} comments via standard endpoint`);
           } catch (err) {
               console.warn(`[${postId}] ✗ Failed to fetch comments:`, err);
           }
        }
        
        console.log('=== getComments END ===');
        console.log(`Total comments fetched: ${allComments.length}`);

        return allComments;

      } catch (e: any) {
        console.error("Graph API Error (Comments):", e);
        throw new Error(e.message || "Failed to fetch comments");
      }
    }

    // MOCK MODE
    await delay(600);
    return [...MOCK_COMMENTS];
  },

  // POST: Send reply
  postReply: async (commentId: string, replyText: string): Promise<boolean> => {
    if (META_ACCESS_TOKEN) {
      try {
        const response = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${commentId}/replies?access_token=${META_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: replyText })
            }
        );
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return true;
      } catch (e) {
        console.error("Graph API Error (Reply):", e);
        alert(`Failed to post to Facebook: ${e instanceof Error ? e.message : 'Unknown error'}`);
        return false;
      }
    }
    await delay(1000);
    MOCK_COMMENTS = MOCK_COMMENTS.map(c => 
      c.id === commentId ? { ...c, status: CommentStatus.POSTED, suggestedReply: replyText } : c
    );
    return true;
  },

  // PUT: Update comment status
  updateCommentStatus: async (commentId: string, status: CommentStatus): Promise<boolean> => {
    if (META_ACCESS_TOKEN && status === CommentStatus.HIDDEN) {
        try {
            await fetch(
                `https://graph.facebook.com/${GRAPH_VERSION}/${commentId}?access_token=${META_ACCESS_TOKEN}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_hidden: true })
                }
            );
        } catch(e) {
            console.error("Failed to hide comment on FB", e);
        }
    }
    await delay(300);
    MOCK_COMMENTS = MOCK_COMMENTS.map(c => 
      c.id === commentId ? { ...c, status } : c
    );
    return true;
  }
};