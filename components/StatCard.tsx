import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, color = "blue" }) => {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        {trend && <p className={`text-xs mt-2 ${trend.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>{trend} from last week</p>}
      </div>
      <div className={`p-3 rounded-lg ${colorClasses[color] || colorClasses.blue}`}>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;
