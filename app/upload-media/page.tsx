'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function UploadMediaPage() {
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert("Please upload a valid image file (JPG or PNG).");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setMediaPreview(base64String);
      };
      reader.readAsDataURL(file);
    }
  };
  const handleAnalyze = () => {
    if (!mediaPreview) return;
    setIsProcessing(true);
    
    // Save the image temporarily so the Result page can grab it
    localStorage.setItem('pendingRoadScan', mediaPreview);
    
    // In a real app, you would send the file to your Python API here, 
    // wait for the JSON response, and save THAT to localStorage too.
    
    // Navigate to results
    router.push('/upload-media/result');
  };

  return (
    <div className="pt-32 px-10 min-h-screen">
      <div className="bg-[#1e1e1e] p-12 shadow-2xl min-h-[600px] flex flex-col justify-between rounded-[40px]">
        
        <div className="flex justify-between items-start">
          <div className="max-w-xl">
            <p className="text-blue-500 font-bold mb-1">Upload Media Here</p>
            <h1 className="text-7xl font-black text-white leading-tight">
              Upload Road Image
            </h1>
          </div>

          <div className="text-right flex flex-col items-end">
            <Link
              href="/"
              className="mb-4 p-2 rounded-full hover:bg-white/10 transition-all text-white group"
              title="Back to Home"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform">
                <path d="M19 12H5" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </Link>

            <p className="text-blue-500 font-bold text-sm mb-1 uppercase tracking-wider">
              Supported formats: JPG, PNG.
            </p>
            <p className="text-gray-400 text-sm mb-4 max-w-xs">
              Our AI will detect crack type and severity level automatically.
            </p>

            <div className="flex items-center justify-end gap-4">
              <span className="text-gray-400 italic text-sm">
                Together we can build a better future
              </span>
              
              {mediaPreview ? (
                <button 
                  onClick={handleAnalyze}
                  disabled={isProcessing}
                  className="bg-blue-600 text-white font-bold rounded-full px-10 py-3 hover:bg-blue-500 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {isProcessing ? 'Processing...' : 'Analyze'}
                </button>
              ) : (
                <button disabled className="bg-blue-600 text-white font-bold rounded-full px-10 py-3 opacity-50 cursor-not-allowed">
                  Analyze
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grow flex items-center justify-center mt-10">
          <label className="w-full h-full min-h-[450px] bg-[#D9D9D9] border-4 border-dashed border-blue-500/40 rounded-[40px] flex flex-col items-center justify-center text-black group hover:border-blue-500 transition-all cursor-pointer relative overflow-hidden">
            <input 
              type="file" 
              accept="image/png, image/jpeg, image/jpg" 
              className="hidden" 
              onChange={handleFileUpload} 
            />
            
            {mediaPreview ? (
              <img src={mediaPreview} alt="Uploaded preview" className="w-full h-full object-contain absolute inset-0 bg-zinc-800/50" />
            ) : (
              <>
                <div className="w-24 h-24 bg-blue-600 rounded-full mb-8 flex items-center justify-center text-white text-5xl font-light shadow-lg group-hover:scale-110 transition-transform">
                  +
                </div>
                <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">
                  Drag or Upload Image Here
                </h2>
                <p className="text-gray-600 font-bold text-lg">
                  Supports JPG and PNG formats
                </p>
              </>
            )}
          </label>
        </div>

      </div>
    </div>
  );
}