'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    severe: 0,
    resolved: 0,
  });
  
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [timeFilter, setTimeFilter] = useState('This Week');
  const [isLoading, setIsLoading] = useState(true);

  // FETCH DATA FROM SUPABASE
  useEffect(() => {
    let isMounted = true; 

    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        
        const { data, error } = await supabase
          .from('FileUpload')
          .select('*')
          .order('id', { ascending: false });

        if (error) {
          throw error; 
        } 
        
        if (data && isMounted) {
          const total = data.length;
          
          const pending = data.filter(r => 
            ['Pending', 'In Review', 'Needs Action'].includes(r.state)
          ).length;
          
          const severe = data.filter(r => 
            r.severity?.toLowerCase() === 'high'
          ).length;
          
          const resolved = data.filter(r => 
            ['Resolved', 'resolved', 'done'].includes(r.state?.toLowerCase() || '')
          ).length;

          setStats({ total, pending, severe, resolved });

          const latestFour = data.slice(0, 4).map((report) => {
            let formattedDate = 'Unknown Date';
            if (report.uploadtime) {
              formattedDate = new Date(report.uploadtime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }

            return {
              id: report.id?.toString() || 'ERR',
              type: report.damage_type || 'Unknown',
              severity: report.severity || 'Unknown',
              date: formattedDate,
              state: report.state || 'Needs Action'
            };
          });

          setRecentReports(latestFour);
        }

      } catch (err) {
        console.error('CRITICAL ERROR fetching dashboard data:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#525252]"> 
      
      {/* ==========================================
          CURVED BLACK HEADER SECTION
      ========================================== */}
      <div className="bg-black text-white rounded-b-[50px] px-10 pt-32 pb-24 shadow-2xl relative z-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-black mb-2 tracking-tight">Admin Console</h1>
              <p className="text-blue-500 text-sm font-bold uppercase tracking-widest">Analytics Overview</p>
            </div>
            
            <div className="flex gap-3">
              <button className="bg-white text-black px-6 py-2.5 rounded-full font-bold text-xs hover:bg-gray-200 transition-all active:scale-95">
                Export Data
              </button>
              <Link 
                href="/admin/users" 
                className="bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold text-xs hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-500/30 text-center flex items-center"
              >
                Manage Users
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          WIDGETS GRID SECTION
      ========================================== */}
      <div className="max-w-6xl mx-auto px-4 md:px-10 -mt-10 relative z-10 pb-20">
        
        {/* Top Row: 3 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-blue-600 rounded-[30px] p-6 h-48 shadow-xl text-white flex flex-col hover:-translate-y-1 transition-transform">
            <span className="font-bold text-sm text-blue-100">Total Reports Submitted</span>
            <div className="mt-auto text-6xl font-black">
              {isLoading ? '...' : stats.total}
            </div> 
          </div>
          
          <div className="bg-zinc-900 rounded-[30px] p-6 h-48 shadow-xl text-white flex flex-col hover:-translate-y-1 transition-transform border border-white/10">
            <span className="font-bold text-sm text-gray-400">Reports Pending Review</span>
            <div className="mt-auto flex items-baseline gap-3">
              <span className="text-6xl font-black">{isLoading ? '...' : stats.pending}</span>
            </div>
          </div>
          
          <div className="bg-zinc-900 rounded-[30px] p-6 h-48 shadow-xl text-white flex flex-col hover:-translate-y-1 transition-transform border border-white/10">
            <span className="font-bold text-sm text-gray-400">High Severity Cases</span>
            <div className={`mt-auto text-6xl font-black text-red-500 ${stats.severe > 0 ? 'animate-pulse' : ''}`}>
              {isLoading ? '...' : stats.severe}
            </div>
          </div>
        </div>

        {/* Middle Row: Visual Charts Placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-zinc-900 rounded-[30px] p-8 shadow-xl text-white border border-white/10 flex flex-col">
            <span className="font-bold text-sm text-gray-400 mb-6">Resolution Status</span>
            
            {/* DYNAMIC Progress Bar */}
            <div className="mt-auto">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-green-400">Resolved ({stats.resolved})</span>
                <span className="text-yellow-500">Unresolved ({stats.pending})</span>
              </div>
              <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden flex">
                <div 
                  className="bg-green-500 h-full transition-all duration-1000" 
                  style={{ width: stats.total === 0 ? '0%' : `${(stats.resolved / stats.total) * 100}%` }}
                ></div>
                <div 
                  className="bg-yellow-500 h-full transition-all duration-1000" 
                  style={{ width: stats.total === 0 ? '0%' : `${(stats.pending / stats.total) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="bg-zinc-900 rounded-[30px] p-8 shadow-xl text-white border border-white/10 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-sm text-gray-400">Damage Trend (Over Time)</span>
              
              <select 
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="bg-blue-500/10 text-blue-500 text-xs font-bold px-3 py-1.5 rounded-md border border-blue-500/20 outline-none cursor-pointer hover:bg-blue-500/20 transition-colors focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="Today" className="bg-zinc-800 text-white">Today</option>
                <option value="This Week" className="bg-zinc-800 text-white">This Week</option>
                <option value="This Month" className="bg-zinc-800 text-white">This Month</option>
                <option value="This Year" className="bg-zinc-800 text-white">This Year</option>
              </select>
            </div>
            
            {/* SVG Line Graph Placeholder */}
            <div className="mt-auto relative w-full h-32 flex flex-col justify-end pb-4">
              <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="lineGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,35 L20,20 L40,28 L60,10 L80,18 L100,5 L100,40 L0,40 Z" fill="url(#lineGradient)" />
                <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points="0,35 20,20 40,28 60,10 80,18 100,5" />
                <circle cx="0" cy="35" r="2" fill="#18181b" stroke="#3b82f6" strokeWidth="1.5"/>
                <circle cx="20" cy="20" r="2" fill="#18181b" stroke="#3b82f6" strokeWidth="1.5"/>
                <circle cx="40" cy="28" r="2" fill="#18181b" stroke="#3b82f6" strokeWidth="1.5"/>
                <circle cx="60" cy="10" r="2" fill="#18181b" stroke="#3b82f6" strokeWidth="1.5"/>
                <circle cx="80" cy="18" r="2" fill="#18181b" stroke="#3b82f6" strokeWidth="1.5"/>
                <circle cx="100" cy="5" r="2" fill="#fff" stroke="#3b82f6" strokeWidth="1.5" className="animate-pulse"/>
              </svg>
              <div className="absolute -bottom-2 left-0 w-full flex justify-between text-[10px] text-gray-500 font-bold">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span className="text-blue-400">Sat</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==========================================
            RECENT REPORTS TABLE
        ========================================== */}
        <div className="bg-zinc-900 rounded-[30px] p-8 shadow-xl text-white border border-white/10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black tracking-wide">Recent Submissions</h2>
            <Link href="/admin/reports" className="text-sm text-blue-500 hover:text-blue-400 font-bold transition-colors">
              View All Reports &rarr;
            </Link>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 border-b border-white/10">
                <tr>
                  <th className="pb-3 font-bold">ID</th>
                  <th className="pb-3 font-bold">Damage Type</th>
                  <th className="pb-3 font-bold">Severity</th>
                  <th className="pb-3 font-bold">Date</th>
                  <th className="pb-3 font-bold">State</th>
                  <th className="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500 animate-pulse font-bold">
                      Loading latest reports...
                    </td>
                  </tr>
                ) : recentReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500 font-bold">
                      No reports found in the database.
                    </td>
                  </tr>
                ) : (
                  recentReports.map((report, index) => {
                    const sev = report.severity?.toLowerCase() || '';
                    
                    return (
                    <tr key={index} className="hover:bg-white/5 transition-colors group">
                      <td className="py-4 font-mono text-gray-300">RPT-{report.id}</td>
                      <td className="py-4 font-bold">{report.type}</td>
                      <td className="py-4">
                        {/* Strictly DPWH standard colors */}
                        <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize
                          ${sev === 'high' ? 'bg-red-500/20 text-red-500' : ''}
                          ${sev === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                          ${sev === 'low' ? 'bg-green-500/20 text-green-400' : ''}
                        `}>
                          {report.severity}
                        </span>
                      </td>
                      <td className="py-4 text-gray-400">{report.date}</td>
                      <td className="py-4">
                         <span className={`flex items-center gap-2
                          ${report.state === 'Resolved' ? 'text-green-500' : 'text-gray-300'}
                         `}>
                            {report.state === 'Resolved' && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
                            {report.state === 'Needs Action' && <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>}
                            {(report.state === 'Pending' || report.state === 'In Review') && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                            {report.state}
                         </span>
                      </td>
                      <td className="py-4 text-right">
                        <button className="text-blue-500 hover:text-white text-xs font-bold transition-colors opacity-0 group-hover:opacity-100">
                          Review &rarr;
                        </button>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}