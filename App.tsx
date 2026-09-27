import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import { 
  MessageCircle, 
  Activity, 
  Filter, 
  Send, 
  RefreshCcw, 
  CheckCircle2, 
  XCircle,
  Wand2,
  ShieldCheck,
  Users,
  Megaphone,
  PlayCircle,
  Sparkles,
  Check,
  Loader2,
  Key,
  HelpCircle,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutGrid,
  AlertTriangle
} from 'lucide-react';
import { SocialComment, CommentStatus, AdContext, AdCampaign } from './types';
import { analyzeAndReply } from './services/geminiService';
import { socialApi, setApiCredentials, testConnection, ConnectionTestResult, setFetchOptions, getFetchOptions } from './services/socialApi';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const App: React.FC = () => {
  // Default to Settings if no credentials are configured so the user sees where to input them
  const [activeTab, setActiveTab] = useState(() => {
    const hasToken = localStorage.getItem('socialguard_access_token');
    return hasToken ? 'replies' : 'settings';
  });
  
  // Data State
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // UI State
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [isSyncingAds, setIsSyncingAds] = useState(false);

  // Settings State
  const [metaId, setMetaId] = useState(localStorage.getItem('socialguard_page_id') || '');
  const [metaToken, setMetaToken] = useState(localStorage.getItem('socialguard_access_token') || '');
  const [isTesting, setIsTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  
  // Filter State
  const [dateFrom, setDateFrom] = useState(localStorage.getItem('socialguard_date_from') || '');
  const [dateTo, setDateTo] = useState(localStorage.getItem('socialguard_date_to') || '');
  const [activeOnly, setActiveOnly] = useState(localStorage.getItem('socialguard_active_only') !== 'false');
  const [withCommentsOnly, setWithCommentsOnly] = useState(localStorage.getItem('socialguard_comments_only') !== 'false');
  
  // Global Brand Settings
  const [globalContext, setGlobalContext] = useState<Omit<AdContext, 'description'>>({
    productName: "HydroPack Pro",
    tone: 'Casual',
    forbiddenKeywords: ["cheap", "guarantee (legal sense)", "refund immediately"]
  });

  // Derived state
  const selectedComment = comments.find(c => c.id === selectedCommentId);
  const selectedCommentAd = selectedComment ? ads.find(a => a.id === selectedComment.adId) : null;
  
  const pendingCount = comments.filter(c => c.status === CommentStatus.PENDING).length;
  const draftCount = comments.filter(c => c.status === CommentStatus.DRAFTED).length;
  const postedCount = comments.filter(c => c.status === CommentStatus.POSTED).length;

  // --- INITIALIZATION ---
  useEffect(() => {
    // If credentials exist in local storage, set them immediately
    if (metaId && metaToken) {
        setApiCredentials(metaId, metaToken);
    }
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoadingData(true);
    setConnectionError(null);
    
    // Apply current filter settings
    setFetchOptions({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      activeOnly,
      withCommentsOnly
    });
    
    try {
      // 1. Fetch Ads / Campaigns (Supports Ad Account or Page)
      const fetchedAds = await socialApi.getCampaigns();
      setAds(fetchedAds);

      // 1.5 Sync ID if auto-corrected
      // The API might have auto-added 'act_' prefix if the user forgot it.
      // We check localStorage to see if it changed, and update UI state.
      const currentStoredId = localStorage.getItem('socialguard_page_id');
      if (currentStoredId && currentStoredId !== metaId) {
          setMetaId(currentStoredId);
      }

      // 2. Fetch Comments for the specific ads found
      // We pass the IDs explicitly to avoid re-fetching the list in the service
      const adIds = fetchedAds.map(ad => ad.id);
      
      // Only fetch comments if we found ads, otherwise we might be in a failed state
      if (adIds.length > 0 || !metaToken) {
          const fetchedComments = await socialApi.getComments(adIds, fetchedAds);
          setComments(fetchedComments);
      } else {
          // If we have a token but no ads found, it might be a permissions issue or empty account
          setComments([]); 
      }
    } catch (error: any) {
      console.error("Failed to load data", error);
      setConnectionError(error.message || "Unknown Connection Error");
      // Don't clear data, let user see it failed while keeping context if any
      setActiveTab('settings'); // Redirect to settings to fix it
    } finally {
      setIsLoadingData(false);
    }
  };

  const saveCredentials = async () => {
      setIsTesting(true);
      setConnectionResult(null);
      setConnectionError(null);
      
      try {
        const result = await testConnection(metaId, metaToken);
        setConnectionResult(result);
        
        if (result.success) {
          setApiCredentials(metaId, metaToken);
          await loadData();
        } else {
          setConnectionError(result.error || 'Connection failed');
        }
      } catch (e: any) {
        setConnectionError(e.message);
      } finally {
        setIsTesting(false);
      }
  };

  // --- ACTIONS ---

  const handleSyncAds = async () => {
    setIsSyncingAds(true);
    setConnectionError(null);
    try {
        // If in real mode, we just reload the whole list
        if (metaToken) {
            await loadData(); // Reload everything
        } else {
            const newAd = await socialApi.syncAdsFromMeta();
            setAds(prev => [...prev, newAd]);
        }
    } catch (e: any) {
        setConnectionError(e.message);
    } finally {
      setIsSyncingAds(false);
    }
  };

  const handleGenerateReply = async (comment: SocialComment) => {
    setIsGenerating(true);
    try {
      // Find the specific ad context for this comment
      const relatedAd = ads.find(a => a.id === comment.adId);
      const specificContext: AdContext = {
        ...globalContext,
        description: relatedAd ? relatedAd.description : "General brand inquiry."
      };

      const result = await analyzeAndReply(comment.content, comment.platform, specificContext);
      
      setComments(prev => prev.map(c => {
        if (c.id === comment.id) {
          return {
            ...c,
            suggestedReply: result.reply,
            sentiment: result.sentiment,
            humanScore: result.humanScore,
            status: CommentStatus.DRAFTED // Important: Moves to Draft, not Posted
          };
        }
        return c;
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkGenerate = async () => {
    setIsBulkGenerating(true);
    const pendingComments = comments.filter(c => c.status === CommentStatus.PENDING);
    
    // Process sequentially to avoid rate limits
    for (const comment of pendingComments) {
       const relatedAd = ads.find(a => a.id === comment.adId);
       const specificContext: AdContext = {
        ...globalContext,
        description: relatedAd ? relatedAd.description : "General brand inquiry."
      };
      
      try {
        const result = await analyzeAndReply(comment.content, comment.platform, specificContext);
        setComments(prev => prev.map(c => 
          c.id === comment.id ? {
            ...c,
            suggestedReply: result.reply,
            sentiment: result.sentiment,
            humanScore: result.humanScore,
            status: CommentStatus.DRAFTED
          } : c
        ));
      } catch (e) {
        console.error("Failed to generate for", comment.id);
      }
    }
    setIsBulkGenerating(false);
  };

  const handlePostReply = async (id: string, replyText?: string) => {
    // Call API First
    const success = await socialApi.postReply(id, replyText || "");
    
    if (success) {
        // Optimistic UI update only if success
        setComments(prev => prev.map(c => 
            c.id === id ? { ...c, status: CommentStatus.POSTED } : c
        ));
        if (selectedCommentId === id) setSelectedCommentId(null);
    }
  };

  const handleBulkPostDrafts = async () => {
    const drafts = comments.filter(c => c.status === CommentStatus.DRAFTED);
    
    // API calls
    for (const draft of drafts) {
        if (draft.suggestedReply) {
            const success = await socialApi.postReply(draft.id, draft.suggestedReply);
            if (success) {
                setComments(prev => prev.map(c => 
                   c.id === draft.id ? { ...c, status: CommentStatus.POSTED } : c
                ));
            }
        }
    }
  };

  const handleIgnoreComment = async (id: string) => {
    setComments(prev => prev.map(c => 
      c.id === id ? { ...c, status: CommentStatus.HIDDEN } : c
    ));
    if (selectedCommentId === id) setSelectedCommentId(null);
    await socialApi.updateCommentStatus(id, CommentStatus.HIDDEN);
  };

  // --- RENDER VIEWS ---

  if (isLoadingData) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="text-center text-slate-500">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-indigo-600" />
                  <p>Connecting to Meta Graph API...</p>
              </div>
          </div>
      );
  }

  const renderDashboard = () => {
    const sentimentData = [
      { name: 'Positive', value: 65, color: '#10b981' },
      { name: 'Neutral', value: 20, color: '#64748b' },
      { name: 'Negative', value: 15, color: '#ef4444' },
    ];
    const activityData = [
        { name: 'Mon', comments: 24, replies: 22 },
        { name: 'Tue', comments: 13, replies: 10 },
        { name: 'Wed', comments: 45, replies: 40 },
        { name: 'Thu', comments: 32, replies: 32 },
        { name: 'Fri', comments: 50, replies: 48 },
    ];

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Pending Review" value={pendingCount} icon={<MessageCircle size={24} />} color="orange" trend="+12%" />
          <StatCard title="Drafted Replies" value={draftCount} icon={<Wand2 size={24} />} color="blue" />
          <StatCard title="Posted Today" value={postedCount + 12} icon={<CheckCircle2 size={24} />} color="green" trend="+5%" />
          <StatCard title="Active Ads" value={ads.length} icon={<Megaphone size={24} />} color="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Engagement Activity</h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityData}>
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip />
                        <Bar dataKey="comments" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="replies" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Sentiment Analysis</h3>
            <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                         <Pie data={sentimentData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {sentimentData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAdsManager = () => (
    <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-500">
        <div className="bg-indigo-900 text-white p-6 rounded-xl flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold">Active Ad Campaigns</h2>
                <p className="text-indigo-200 text-sm mt-1">
                    Manage the AI context for each ad. The AI uses this description to answer specific questions accurately.
                </p>
            </div>
            <button 
                onClick={handleSyncAds}
                disabled={isSyncingAds}
                className="px-4 py-2 bg-white text-indigo-900 rounded-lg font-semibold text-sm hover:bg-indigo-50 flex items-center gap-2"
            >
                {isSyncingAds ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                {isSyncingAds ? 'Syncing...' : 'Sync Ads from Meta'}
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ads.map(ad => (
                <div key={ad.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                    <div className="relative h-48 bg-slate-200">
                        <img src={ad.thumbnailUrl} alt={ad.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group cursor-pointer">
                             <PlayCircle size={48} className="text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded-md backdrop-blur-sm">
                            ID: {ad.id}
                        </div>
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-md font-bold">
                            {ad.platform}
                        </div>
                        {ad.status.includes('Dark Post') ? (
                           <div className="absolute bottom-2 right-2 px-2 py-1 bg-purple-600 text-white text-xs rounded-md font-bold flex items-center gap-1">
                              <EyeOff size={10} /> Ad (Hidden)
                           </div>
                        ) : (
                           <div className="absolute bottom-2 right-2 px-2 py-1 bg-emerald-600 text-white text-xs rounded-md font-bold flex items-center gap-1">
                              <Eye size={10} /> Public Post
                           </div>
                        )}
                    </div>
                    <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-lg text-slate-800">{ad.name}</h3>
                            <span className={`px-2 py-1 text-xs rounded-full font-medium flex items-center gap-1 ${
                                ad.status.includes('Dark') ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                    ad.status.includes('Dark') ? 'bg-purple-500' : 'bg-emerald-500'
                                }`}></div> {ad.status}
                            </span>
                        </div>
                        
                        <div className="mb-4 flex-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                AI Context / Description
                            </label>
                            <textarea 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                                rows={4}
                                value={ad.description}
                                onChange={(e) => {
                                    setAds(prev => prev.map(a => a.id === ad.id ? {...a, description: e.target.value} : a));
                                }}
                            />
                        </div>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500">
                            <span className="flex items-center gap-2">
                                <MessageCircle size={14} />
                                {ad.commentCount ? (
                                    <span className="font-semibold text-indigo-600">{ad.commentCount} comments</span>
                                ) : (
                                    <span>Pending: {comments.filter(c => c.adId === ad.id && c.status === CommentStatus.PENDING).length}</span>
                                )}
                            </span>
                            <button 
                                onClick={() => {
                                    setActiveTab('replies');
                                    // Auto-select first comment from this ad if available
                                    const firstComment = comments.find(c => c.adId === ad.id);
                                    if (firstComment) setSelectedCommentId(firstComment.id);
                                }}
                                className="text-indigo-600 font-medium hover:underline"
                            >
                                View Comments →
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );

  const renderReplyManager = () => {
    // Show Pending and Drafted, exclude Posted/Hidden
    const workingComments = comments.filter(c => c.status === CommentStatus.PENDING || c.status === CommentStatus.DRAFTED);

    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] gap-4 animate-in slide-in-from-bottom-4 duration-500">
        
        {/* Bulk Actions Toolbar */}
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-slate-600">Bulk Actions:</span>
                <button 
                    onClick={handleBulkGenerate}
                    disabled={isBulkGenerating || pendingCount === 0}
                    className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                    {isBulkGenerating ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <Sparkles size={16} />}
                    Auto-Draft ({pendingCount})
                </button>
                <button 
                    onClick={handleBulkPostDrafts}
                    disabled={draftCount === 0}
                    className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                    <Check size={16} />
                    Approve & Post Drafts ({draftCount})
                </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
                <Filter size={16} />
                <span>Filter: All Ads</span>
            </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
            {/* Inbox */}
            <div className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-700">Inbox</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {workingComments.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                        <p>No pending comments.</p>
                    </div>
                ) : workingComments.map(comment => {
                    const ad = ads.find(a => a.id === comment.adId);
                    return (
                        <div 
                            key={comment.id}
                            onClick={() => setSelectedCommentId(comment.id)}
                            className={`p-4 rounded-lg cursor-pointer border transition-all duration-200 relative ${
                            selectedCommentId === comment.id 
                                ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                                : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                            }`}
                        >
                            {comment.status === CommentStatus.DRAFTED && (
                                <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-400 rounded-full" title="Draft Ready"></div>
                            )}
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                    ad?.status.includes('Dark') ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {ad?.name || 'Unknown Ad'}
                                </span>
                            </div>
                            <div className="flex justify-between items-start mb-1">
                                <p className="text-sm font-semibold text-slate-800">{comment.author}</p>
                                <span className="text-xs text-slate-400">{comment.timestamp}</span>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-2">{comment.content}</p>
                        </div>
                    );
                })}
              </div>
            </div>

            {/* Editor Workspace */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
              {selectedComment ? (
                <>
                  <div className="p-6 border-b border-slate-100">
                     {selectedCommentAd && (
                         <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                             <img src={selectedCommentAd.thumbnailUrl} className="w-12 h-12 rounded object-cover" alt="Ad thumb" />
                             <div>
                                 <p className="text-xs text-slate-400 font-bold uppercase">Comment on Ad:</p>
                                 <p className="text-sm font-medium text-slate-800">{selectedCommentAd.name}</p>
                             </div>
                         </div>
                     )}
                     <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 mb-1">{selectedComment.author} says...</h2>
                            <p className="text-slate-600 text-lg">"{selectedComment.content}"</p>
                        </div>
                        <button onClick={() => handleIgnoreComment(selectedComment.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Hide/Ignore">
                            <XCircle size={20} />
                        </button>
                     </div>
                  </div>

                  <div className="flex-1 p-6 bg-slate-50/50 flex flex-col justify-center">
                    {!selectedComment.suggestedReply ? (
                        <div className="text-center">
                            <div className="inline-flex p-4 bg-indigo-100 text-indigo-600 rounded-full mb-4">
                                <Sparkles size={32} />
                            </div>
                            <h3 className="text-xl font-semibold text-slate-800 mb-2">Ready to Draft</h3>
                            <p className="text-slate-500 mb-6 max-w-md mx-auto">
                                The AI will use the context from <strong>{selectedCommentAd?.name}</strong> to generate a reply.
                            </p>
                            <button 
                                onClick={() => handleGenerateReply(selectedComment)}
                                disabled={isGenerating}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-medium transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 mx-auto"
                            >
                                {isGenerating ? "Thinking..." : "Generate Draft"}
                            </button>
                        </div>
                    ) : (
                        <div className="w-full max-w-2xl mx-auto">
                            <div className="flex justify-between items-center mb-4">
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full uppercase">Draft Mode</span>
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <ShieldCheck size={16} className={selectedComment.humanScore && selectedComment.humanScore > 80 ? "text-emerald-500" : "text-amber-500"} />
                                    <span>Human Score: <span className="font-bold">{selectedComment.humanScore || 0}%</span></span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden mb-6">
                                <div className="p-4">
                                    <textarea 
                                        className="w-full text-slate-700 text-lg resize-none outline-none bg-transparent placeholder-slate-300"
                                        rows={4}
                                        value={selectedComment.suggestedReply}
                                        onChange={(e) => {
                                            const newText = e.target.value;
                                            setComments(prev => prev.map(c => c.id === selectedComment.id ? {...c, suggestedReply: newText} : c));
                                        }}
                                    />
                                </div>
                                <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 flex justify-between items-center">
                                    <div className="text-xs text-slate-400 italic">Edit as needed before approving</div>
                                    <button 
                                        onClick={() => handleGenerateReply(selectedComment)}
                                        className="text-xs font-medium text-indigo-600 flex items-center gap-1 hover:text-indigo-700"
                                    >
                                        <RefreshCcw size={12} /> Redraft
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button 
                                    onClick={() => handlePostReply(selectedComment.id, selectedComment.suggestedReply)}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                                >
                                    <CheckCircle2 size={18} />
                                    Approve & Post
                                </button>
                            </div>
                        </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                    <MessageCircle size={48} className="mb-4 opacity-20" />
                    <h3 className="text-lg font-semibold text-slate-600">Select a comment</h3>
                    <p>Review drafts or generate new replies.</p>
                </div>
              )}
            </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        {/* Error Banner */}
        {connectionError && (
             <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="text-red-500 mt-1" size={24} />
                <div>
                    <h3 className="text-red-800 font-bold">Connection Failed</h3>
                    <p className="text-red-600 text-sm mt-1">{connectionError}</p>
                    <div className="text-xs text-red-500 mt-2 bg-red-100 p-2 rounded">
                        <strong>Troubleshooting:</strong>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li>Ensure your Token has <code>ads_read</code> permission.</li>
                            <li>If using an Ad Account ID (<code>act_...</code>), ensure the user owns the account.</li>
                            <li>Check for extra spaces in your ID or Token.</li>
                        </ul>
                    </div>
                </div>
             </div>
        )}

        {/* Success Banner */}
        {connectionResult?.success && (
             <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="text-green-500 mt-1" size={24} />
                <div>
                    <h3 className="text-green-800 font-bold">Connected Successfully!</h3>
                    <p className="text-green-600 text-sm mt-1">
                        <strong>Account:</strong> {connectionResult.accountName || 'N/A'} &nbsp;•&nbsp; 
                        <strong>Type:</strong> {connectionResult.accountType === 'ad_account' ? 'Ad Account' : 'Page'}
                    </p>
                </div>
             </div>
        )}

        {/* Meta Configuration Card */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-indigo-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                    <LayoutGrid size={24} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Meta API Configuration</h2>
                    <p className="text-sm text-slate-500">Connect an Ad Account or a Page to fetch comments.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-slate-700">Account ID or Page ID</label>
                        <a 
                            href="https://business.facebook.com/settings/ad-accounts/" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                            title="Go to Business Settings"
                        >
                            Find Account ID <ExternalLink size={10} />
                        </a>
                    </div>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={metaId}
                            onChange={(e) => setMetaId(e.target.value)}
                            placeholder="act_123456... or 102938..."
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm pl-9"
                        />
                        <HelpCircle size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Use <code>act_</code> prefix for Ad Accounts (Recommended for Dark Posts).</p>
                </div>
                <div>
                     <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-slate-700">Access Token</label>
                        <a 
                            href="https://developers.facebook.com/tools/explorer/" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                            title="Open Graph API Explorer"
                        >
                            Get Token <ExternalLink size={10} />
                        </a>
                    </div>
                    <div className="relative">
                        <input 
                            type="password" 
                            value={metaToken}
                            onChange={(e) => setMetaToken(e.target.value)}
                            placeholder="EAA..."
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm pl-9"
                        />
                        <Key size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Requires <code>ads_read</code> (for Ad Accounts) and <code>pages_read_engagement</code>.
                    </p>
                </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> Tokens are saved in your browser's local storage. Do not use on public computers. 
                    Leave blank to use Demo Mode.
                </p>
            </div>

            <div className="flex justify-end">
                <button 
                    onClick={saveCredentials}
                    disabled={isTesting}
                    className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {isTesting ? <><Loader2 size={16} className="animate-spin" /> Testing...</> : 'Test & Connect'}
                </button>
            </div>
        </div>

        {/* Ads Filter Card */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                    <Filter size={24} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Ads Filter</h2>
                    <p className="text-sm text-slate-500">Filter which ads to fetch from your account</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date From</label>
                    <input 
                        type="date" 
                        value={dateFrom}
                        onChange={(e) => {
                            setDateFrom(e.target.value);
                            localStorage.setItem('socialguard_date_from', e.target.value);
                        }}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date To</label>
                    <input 
                        type="date" 
                        value={dateTo}
                        onChange={(e) => {
                            setDateTo(e.target.value);
                            localStorage.setItem('socialguard_date_to', e.target.value);
                        }}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-4 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={activeOnly}
                        onChange={(e) => {
                            setActiveOnly(e.target.checked);
                            localStorage.setItem('socialguard_active_only', String(e.target.checked));
                        }}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">Active ads only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={withCommentsOnly}
                        onChange={(e) => {
                            setWithCommentsOnly(e.target.checked);
                            localStorage.setItem('socialguard_comments_only', String(e.target.checked));
                        }}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">Only ads with comments</span>
                </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                    <strong>Tip:</strong> Filtering by "with comments only" checks each ad's post for comments. 
                    This may take longer for large accounts but ensures you only see ads that need attention.
                </p>
            </div>

            <div className="flex justify-end">
                <button 
                    onClick={() => {
                        setFetchOptions({
                            dateFrom: dateFrom || undefined,
                            dateTo: dateTo || undefined,
                            activeOnly,
                            withCommentsOnly
                        });
                        loadData();
                    }}
                    disabled={isLoadingData}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {isLoadingData ? <><Loader2 size={16} className="animate-spin" /> Fetching...</> : <><RefreshCcw size={16} /> Apply & Refresh</>}
                </button>
            </div>
        </div>

        {/* Brand Persona Card */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Global Brand Persona</h2>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Product / Brand Name</label>
                    <input 
                        type="text" 
                        value={globalContext.productName}
                        onChange={(e) => setGlobalContext({...globalContext, productName: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tone of Voice</label>
                    <div className="grid grid-cols-2 gap-3">
                        {['Professional', 'Casual', 'Witty', 'Empathetic'].map((t) => (
                            <button
                                key={t}
                                onClick={() => setGlobalContext({...globalContext, tone: t as any})}
                                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                                    globalContext.tone === t 
                                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Forbidden Keywords</label>
                    <input 
                        type="text" 
                        value={globalContext.forbiddenKeywords.join(', ')}
                        onChange={(e) => setGlobalContext({...globalContext, forbiddenKeywords: e.target.value.split(',').map(s => s.trim())})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">
                    {activeTab === 'dashboard' ? 'Overview' : 
                     activeTab === 'campaigns' ? 'Ad Campaigns' :
                     activeTab === 'replies' ? 'Reply Manager' : 
                     activeTab === 'settings' ? 'Global Settings' : 'Audience'}
                </h1>
                <p className="text-slate-500">Human-in-the-Loop Engagement</p>
            </div>
            <div className="flex gap-4">
                 <button 
                  onClick={() => {
                    // Quick demo reset handled via reload or mock api reset
                    window.location.reload();
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                    <RefreshCcw size={16} /> Reset
                </button>
                        </div>
        </header>

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'campaigns' && renderAdsManager()}
        {activeTab === 'replies' && renderReplyManager()}
        {activeTab === 'settings' && renderSettings()}
      </main>
    </div>
  );
};

export default App;