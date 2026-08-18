'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase'; 
import LoginModal from './LoginModal'; 

export interface Distress {
  label: string; 
  type?: string; 
  confidence: number;
  measurement_type: string;
  metric_value: number;
  unit: string;
  width_mm: number;
  severity: 'Low' | 'Medium' | 'High';
}

export interface AnalysisData {
  filename: string;
  fileUrl: string; 
  overall_severity: 'Low' | 'Medium' | 'High';
  gemini_bulletin: string; 
  distresses: Distress[];
}

interface UploadResultUiProps {
  backLinkHref: string;
  analysisData?: AnalysisData;
}

export default function UploadResultUi({ backLinkHref, analysisData }: UploadResultUiProps) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [location, setLocation] = useState<{ lat: number | null, lng: number | null }>({ lat: null, lng: null });
  const [address, setAddress] = useState<string>("Loading...");

  const [data, setData] = useState<AnalysisData | null>(analysisData || null);

  useEffect(() => {
    // 1. Get Address and Location coordinates from the URL safely
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlAddress = params.get('address');
      const urlLat = params.get('lat');
      const urlLng = params.get('lng');
      
      if (urlAddress) {
        setAddress(urlAddress);
      } else {
        setAddress("Location not provided (Quick Scan)");
      }

      if (urlLat && urlLng) {
        setLocation({ lat: parseFloat(urlLat), lng: parseFloat(urlLng) });
      }
    }

    // 2. Check Supabase Auth
    const checkAuth = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    setIsSignedIn(!!session);
  } catch (err) {
    console.error("Supabase Auth Error:", err);
    setIsSignedIn(false); // Default to logged out if it fails
  } finally {
    setIsLoading(false); // THIS guarantees the button will stop spinning!
  }
};
checkAuth();

    // 3. Fetch AI Data from Python
    const fetchAiData = async () => {
      if (analysisData) return;

      const base64Image = localStorage.getItem("upload_image_base64");
      // Grab the actual filename we just saved, or fallback if it's missing
      const savedFilename = localStorage.getItem("upload_image_filename") || "analyzed_image.jpg";

      if (!base64Image) {
        console.error("No image found in localStorage to analyze.");
        return; 
      }

      try {
        const response = await fetch("http://127.0.0.1:8000/analyze-road", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: base64Image })
        });

        if (!response.ok) throw new Error("Failed to process image with AI");

        const result = await response.json();
        
        setData({
          filename: savedFilename, // Inject the real filename here!
          fileUrl: result.fileUrl,
          overall_severity: result.overall_severity,
          gemini_bulletin: result.gemini_bulletin,
          distresses: result.distresses
        });

      } catch (error) {
        console.error("API Fetch Error:", error);
      }
    };

    fetchAiData();

    // 4. Listen for Auth Changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [analysisData]);

  // Submit Handler connected to Supabase
  const handleSubmitReport = async () => {
    if (!isSignedIn || !data) return;
    setIsSubmitting(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error("User not authenticated. Please log in again.");
      }

      // Prepare data for database
      const insertData = {
        user_id: userData.user.id,
        latitude: location.lat, 
        longitude: location.lng, 
        severity: data.overall_severity,
        gemini_bulletin: data.gemini_bulletin,
        image_url: data.fileUrl, 
        status: 'pending'
      };

      console.log("Sending to Supabase:", insertData);

      const { error: insertError } = await supabase
        .from('damage_reports')
        .insert([insertData])
        .select();

      if (insertError) {
        console.error("Supabase Error:", JSON.stringify(insertError, null, 2));
        alert(`Supabase Error: ${insertError.message}\n(Check your console for full details)`);
        setIsSubmitting(false);
        return;
      }

      alert("Report submitted successfully!");
      
    } catch (error: any) {
      console.error('Error submitting report:', error);
      alert(`Failed to submit: ${error.message || "Unknown error occurred"}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!data) {
    return (
      <div className="pt-32 px-10 min-h-screen bg-[#1E1E1E] flex items-center justify-center">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-bold text-white mb-2">Analyzing Road Damage</h2>
          <p className="text-gray-400">Please wait while our AI processes the image...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-32 px-10 min-h-screen bg-[#1E1E1E] text-white">
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      
      <div className="bg-[#1E1E1E] rounded-3xl p-12 relative max-w-7xl mx-auto">
        
        {/* Header & Back Button */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <p className="text-blue-500 font-bold text-sm uppercase tracking-wider mb-1">Analyze Results</p>
            <h1 className="text-5xl font-extrabold text-white">Road Damage Report</h1>
          </div>
          <Link href={backLinkHref} className="text-white hover:text-gray-300 transition">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Column 1: Image, Address, and Detected Cracks */}
          <div className="bg-[#D9D9D9] rounded-2xl p-6 text-black flex flex-col h-[650px]">
            
            {/* NEW: Filename Display Above Image */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-sm">📄</span>
              <p className="text-sm font-bold text-zinc-600 truncate" title={data.filename}>
                {data.filename}
              </p>
            </div>

            {/* Image Section */}
            <div className="bg-zinc-800 rounded-xl w-full h-44 flex-shrink-0 mb-4 flex items-center justify-center overflow-hidden relative border border-gray-400">
               <img src={data.fileUrl} alt="Analyzed Road" className="w-full h-full object-contain absolute inset-0" />
            </div>
            
            {/* Location Section */}
            <div className="mb-4 flex-shrink-0">
              <h2 className="text-lg font-black uppercase mb-2">Location</h2>
              <div className="flex gap-2 items-start bg-white/60 p-3 rounded-xl border border-white/40 shadow-inner">
                <span className="mt-0.5 text-lg">📍</span>
                <p className="text-sm font-bold leading-tight line-clamp-2 text-zinc-800">
                  {address}
                </p>
              </div>
            </div>

            {/* Detected Distresses List Section */}
            <div className="flex-grow flex flex-col min-h-0">
              <h2 className="text-lg font-black uppercase mb-2 flex items-center gap-2">
                Detected Damage <span className="text-xs bg-zinc-800 text-white px-2 py-0.5 rounded-full">{data.distresses.length}</span>
              </h2>
              
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex flex-col gap-2">
                  {data.distresses.map((distress, index) => (
                    <div key={index} className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-white/40 shadow-sm hover:shadow-md transition">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-zinc-900">{distress.label}</span>
                        <span className="text-xs font-semibold text-zinc-500">Severity: <span className={`${distress.severity === 'High' ? 'text-red-600' : distress.severity === 'Medium' ? 'text-yellow-600' : 'text-green-600'}`}>{distress.severity}</span></span>
                      </div>
                      <div className="bg-zinc-800 text-white text-xs font-black px-3 py-1.5 rounded-lg border-2 border-zinc-600">
                        {(distress.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                  
                  {data.distresses.length === 0 && (
                    <div className="text-center p-4 text-zinc-500 font-bold italic">
                      No damage detected.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Detection Details (Gemini) */}
          <div className="bg-[#D9D9D9] rounded-2xl p-6 text-black flex flex-col h-[650px]">
            <h2 className="text-2xl font-black mb-4">DETECTION DETAILS</h2>
            <div className="bg-white/50 p-6 rounded-xl flex-grow overflow-y-auto whitespace-pre-wrap text-sm font-medium shadow-inner border border-white/20">
              {data.gemini_bulletin}
            </div>
          </div>

          {/* Column 3: Severity & Submission */}
          <div className="flex flex-col gap-6 h-[650px]">
            <div className="bg-[#D9D9D9] rounded-2xl p-6 text-black flex flex-col items-center justify-between flex-grow">
              <h2 className="text-xl font-black w-full text-left">Severity Level</h2>
              
              <div className="flex flex-col items-center flex-grow justify-center w-full">
                <div className="bg-zinc-800 p-4 rounded-3xl border-[6px] border-gray-400 shadow-[inset_0_4px_10px_rgba(0,0,0,0.6)] flex flex-col gap-3 w-40">
                  <div className={`h-16 rounded-xl flex items-center justify-center font-black text-sm tracking-wider transition-all duration-300 ${data.overall_severity === 'High' ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.8)] border-2 border-white scale-105' : 'bg-red-900/40 text-red-900'}`}>
                    HIGH
                  </div>
                  <div className={`h-16 rounded-xl flex items-center justify-center font-black text-sm tracking-wider transition-all duration-300 ${data.overall_severity === 'Medium' ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.8)] border-2 border-white scale-105' : 'bg-yellow-900/40 text-yellow-900'}`}>
                    MEDIUM
                  </div>
                  <div className={`h-16 rounded-xl flex items-center justify-center font-black text-sm tracking-wider transition-all duration-300 ${data.overall_severity === 'Low' ? 'bg-[#00FF00] text-black shadow-[0_0_15px_rgba(0,255,0,0.8)] border-2 border-white scale-105' : 'bg-green-900/40 text-green-900'}`}>
                    LOW
                  </div>
                </div>
                <p className="mt-6 font-black text-center text-sm">
                  Status: {data.overall_severity === 'High' ? 'Immediate Action Required' : 'Action Required'}
                </p>
              </div>

              {isLoading ? (
                <div className="w-full bg-zinc-800 text-zinc-500 font-black rounded-full px-8 py-4 uppercase tracking-widest text-center animate-pulse">Checking Auth...</div>
              ) : isSignedIn ? (
                <button 
                  onClick={handleSubmitReport} disabled={isSubmitting}
                  className="w-full bg-[#3b82f6] text-white font-black rounded-full px-8 py-4 uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Report'}
                </button>
              ) : (
                <button onClick={() => setShowLogin(true)} className="w-full bg-zinc-800 text-white font-black rounded-full px-8 py-4 uppercase tracking-widest hover:bg-black transition-all shadow-lg flex justify-center text-center border border-white/10">
                  Sign in to Submit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}