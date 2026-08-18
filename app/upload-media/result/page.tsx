'use client';

import { useEffect, useState } from 'react';
import UploadResultUi from '@/components/UploadResultUi';

export default function ScanMediaResult() {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const savedImage = localStorage.getItem('pendingRoadScan');
        
        if (!savedImage) {
          throw new Error("No image found to analyze.");
        }

        // --- CRITICAL FIX: Point directly to the FastAPI server ---
        // Make sure your Python server is running on port 8000!
        const response = await fetch('http://localhost:8000/analyze-road', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: savedImage })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to analyze the image on the server.");
        }

        const data = await response.json();
        setAnalysisData(data);

      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
        // Clear the storage so we don't scan an old image next time
        localStorage.removeItem('pendingRoadScan'); 
      }
    };

    fetchAnalysis();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold tracking-widest uppercase">AI is analyzing road telemetry...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-red-500 font-bold space-y-4">
        <p>Error: {error}</p>
        <button 
          onClick={() => window.location.href = '/upload-media'} 
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  return <UploadResultUi backLinkHref="/upload-media" analysisData={analysisData} />;
}