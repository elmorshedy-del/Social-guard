import React from 'react';
import { LayoutDashboard, MessageSquareText, Settings, Users, ShieldCheck, Megaphone } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'campaigns', label: 'Active Ads', icon: <Megaphone size={20} /> },
    { id: 'replies', label: 'Reply Manager', icon: <MessageSquareText size={20} /> },
    { id: 'audience', label: 'Audience Insights', icon: <Users size={20} /> },
    { id: 'settings', label: 'Global Settings', icon: <Settings size={20} /> },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col z-10 transition-all duration-300">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="bg-indigo-500 p-2 rounded-lg">
           <ShieldCheck size={24} className="text-white" />
        </div>
        <span className="font-bold text-xl tracking-tight">SocialGuard</span>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === item.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-lg p-3">
           <p className="text-xs text-slate-400 mb-1">Model Status</p>
           <div className="flex items-center gap-2">
             <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
             <span className="text-xs font-semibold text-emerald-400">Gemini 3 Pro Active</span>
           </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
