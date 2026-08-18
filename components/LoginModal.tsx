"use client";
import { useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function LoginModal({ onClose }: { onClose: () => void }) {
  // UI State
  const [isLogin, setIsLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form Data State
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ======================
  //  DATABASE CONNECTION 
  // ======================

  const handleSignUp = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setErrorMsg("");

      try {
        // STEP 1: Create the user in Supabase Authentication
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        // STEP 2: Insert their details into your custom UserDetail database table
        if (data.user) {
          const { error: dbError } = await supabase
            .from('UserDetail')
            .insert({
              userloginuuid: data.user.id,
              username: username,
              email: email,
              role: 'user'
            });

          if (dbError) {
            console.error("Database Insert Error:", dbError);
            throw new Error("Auth succeeded, but failed to save profile to database.");
          }
        }
        
        // STEP 3: Destroy the auto-login session
        // We add a tiny 500ms delay to let Supabase finish writing the session 
        // to the browser before we immediately delete it.
        await new Promise(resolve => setTimeout(resolve, 500));
        await supabase.auth.signOut();
        
        alert("Account created! Please log in.");
        toggleMode(true); // Switch to the login panel
        
      } catch (error: any) {
        setErrorMsg(error.message || "Failed to create account.");
      } finally {
        setIsLoading(false);
      }
    };

  const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        try {
                const { data, error } = await supabase.auth.signInWithPassword({
                  email,
                  password,
                });

                if (error) throw error;
                onClose();
          
        } catch (error: any) {
          setErrorMsg("Invalid email or password.");
        } finally {
          setIsLoading(false);
        }
      };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMsg("Please enter your email address first.");
      return;
    }
    
    setIsLoading(true);
    setErrorMsg("");
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      
      alert(`Password reset link sent to ${email}!`);
      
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to send reset link.");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to switch panels and clear forms
  const toggleMode = (toLogin: boolean) => {
    setIsLogin(toLogin);
    setErrorMsg("");
    setEmail("");
    setUsername("");
    setPassword("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      
      {/* Main Modal Container */}
      <div 
        className="relative w-full max-w-[800px] h-[500px] bg-white rounded-2xl shadow-2xl overflow-hidden flex"
        onClick={(e) => e.stopPropagation()} 
      >
        
        {/* ==========================================
            LEFT SIDE: SIGN UP FORM
        ========================================== */}
        <div className="absolute top-0 left-0 w-1/2 h-full p-12 flex flex-col justify-center bg-white z-0">
          {/* CHANGED TEXT COLOR TO #262626 HERE */}
          <h2 className="text-4xl font-black mb-6 text-center text-[#262626]">Sign Up</h2>
          
          {errorMsg && !isLogin && <p className="text-red-500 text-xs font-bold text-center mb-2">{errorMsg}</p>}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 px-1 mb-1">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-100 text-black px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-[#3b82f6] transition-all" 
                placeholder="Enter your email"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 px-1 mb-1">Username</label>
              <input 
                type="text" 
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-100 text-black px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-[#3b82f6] transition-all" 
                placeholder="Choose a username"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 px-1 mb-1">Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-100 text-black px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-[#3b82f6] transition-all" 
                placeholder="Create a password"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="mt-8 w-full bg-[#262626] hover:bg-blue-600 text-white font-bold py-3 rounded-full transition-all shadow-lg hover:shadow-blue-500/50 disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Create Account"}
            </button>
          </form>
        </div>


        {/* ==========================================
            RIGHT SIDE: LOG IN FORM
        ========================================== */}
        <div className="absolute top-0 right-0 w-1/2 h-full p-12 flex flex-col justify-center bg-white z-0">
          {/* CHANGED TEXT COLOR TO #262626 HERE */}
          <h2 className="text-4xl font-black mb-6 text-center text-[#262626]">Log In</h2>
          
          {errorMsg && isLogin && <p className="text-red-500 text-xs font-bold text-center mb-2">{errorMsg}</p>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 px-1 mb-1">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-100 text-black px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-[#3b82f6] transition-all" 
                placeholder="Enter your email"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 px-1 mb-1">Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-100 text-black px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-[#3b82f6] transition-all" 
                placeholder="Enter your password"
              />
            </div>

            <div className="text-right mt-2">
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-gray-500 hover:text-[#3b82f6] font-bold transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="mt-6 w-full bg-[#262626] hover:bg-blue-600 text-white font-bold py-3 rounded-full transition-all shadow-lg hover:shadow-blue-500/50 disabled:opacity-50"
            >
              {isLoading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </div>


        {/* ==========================================
            THE MAGIC SLIDING BLUE COVER
        ========================================== */}
        <div 
          className={`absolute top-0 left-0 w-1/2 h-full bg-[#262626] text-white z-10 transition-transform duration-700 ease-in-out shadow-2xl flex items-center justify-center
            ${!isLogin ? 'translate-x-full rounded-l-[40px]' : 'translate-x-0 rounded-r-[40px]'}
          `}
        >
          <div className="relative w-full h-full flex items-center justify-center text-center px-10">
            
            {/* Prompt to Sign Up */}
            <div className={`absolute transition-all duration-700 ease-in-out flex flex-col items-center ${isLogin ? 'opacity-100 translate-x-0 delay-200' : 'opacity-0 -translate-x-12 pointer-events-none'}`}>
              <h2 className="text-4xl font-black mb-4">New Here?</h2>
              <p className="mb-8 font-medium text-white-100">Sign up and discover a great amount of new opportunities!</p>
              <span className="text-sm mb-3 text-oasys-blue font-bold">{"Don't have an account?"} </span>
              <button 
                onClick={() => toggleMode(false)}
                className="border-2 border-white rounded-full px-12 py-3 font-bold hover:bg-white hover:text-[#262626] transition-all active:scale-95"
              >
                Sign Up
              </button>
            </div>

            {/* Prompt to Log In */}
            <div className={`absolute transition-all duration-700 ease-in-out flex flex-col items-center ${!isLogin ? 'opacity-100 translate-x-0 delay-200' : 'opacity-0 translate-x-12 pointer-events-none'}`}>
              <h2 className="text-4xl font-black mb-4">Welcome Back!</h2>
              <p className="mb-8 font-medium text-white-100">To keep connected with us please login with your personal info.</p>
              <span className="text-sm mb-3 text-oasys-blue font-bold">Already have an account?</span>
              <button 
                onClick={() => toggleMode(true)}
                className="border-2 border-white rounded-full px-12 py-3 font-bold hover:bg-white hover:text-[#262626] transition-all active:scale-95"
              >
                Log In
              </button>
            </div>

          </div>
        </div>

        <button 
          onClick={onClose}
          className={`absolute top-4 z-20 w-8 h-8 flex items-center justify-center rounded-full transition-colors font-bold
            ${!isLogin ? 'right-4 text-white hover:bg-white/20' : 'right-4 text-gray-400 hover:bg-gray-100'}
          `}
        >
          ✕
        </button>

      </div>
    </div>
  );
}