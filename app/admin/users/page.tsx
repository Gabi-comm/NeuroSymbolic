'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import Link from 'next/link';

type UserProfile = {
  userloginuuid: string;
  username: string;
  email: string;
  role: string;
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null); // Track the logged-in admin

  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isMounted) {
          setCurrentAdminId(user.id);
        }

        const { data, error } = await supabase
          .from('UserDetail')
          .select('*')
          .order('username', { ascending: true });

        if (error) throw error;
        
        if (data && isMounted) {
          setUsers(data);
        }
      } catch (err: any) {
        console.error('CRITICAL ERROR:', err.message || err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    // EXTRA SAFETY: Hard block if they try to bypass the UI and toggle themselves
    if (userId === currentAdminId) {
      alert("Safety Block: You cannot change your own admin status.");
      return;
    }

    const safeCurrentRole = currentRole || 'user'; 
    const newRole = safeCurrentRole === 'admin' ? 'user' : 'admin';
    
    if (!confirm(`Change this account to ${newRole.toUpperCase()}?`)) return;

    const { error } = await supabase
      .from('UserDetail')
      .update({ role: newRole })
      .eq('userloginuuid', userId);

    if (error) {
      alert('Failed to update role!');
      console.error(error);
    } else {
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.userloginuuid === userId ? { ...user, role: newRole } : user
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#525252] p-10">
      <div className="max-w-4xl mx-auto bg-zinc-900 rounded-[30px] p-8 shadow-xl text-white border border-white/10">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black">User Management</h1>
            <p className="text-gray-400 text-sm mt-1">View and manage system access levels.</p>
          </div>
          <Link href="/admin/dashboard" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full font-bold text-sm transition-colors">
            &larr; Back to Dashboard
          </Link>
        </div>

        {isLoading ? (
          <p className="text-center text-gray-500 font-bold animate-pulse py-10">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-center text-gray-400 font-bold py-10">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 border-b border-white/10">
                <tr>
                  <th className="pb-3 font-bold">Username</th>
                  <th className="pb-3 font-bold">Email</th>
                  <th className="pb-3 font-bold">Current Role</th>
                  <th className="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr key={user.userloginuuid} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 font-bold">
                      {user.username || 'N/A'} {user.userloginuuid === currentAdminId && <span className="text-blue-400 ml-2">(You)</span>}
                    </td>
                    <td className="py-4 text-gray-400">{user.email || 'N/A'}</td>
                    <td className="py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        user.role === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {(user.role || 'user').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      {/* Only show the button if this is NOT the current logged-in user */}
                      {user.userloginuuid !== currentAdminId ? (
                        <button 
                          onClick={() => toggleRole(user.userloginuuid, user.role)}
                          className="text-xs font-bold text-white bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg transition-colors"
                        >
                          Make {user.role === 'admin' ? 'User' : 'Admin'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600 italic px-4">Protected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}