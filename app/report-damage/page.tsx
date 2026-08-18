'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Position } from './Map';

const MapComponent = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-300">Loading Map...</div>
});

export default function ReportDamagePage() {
  const [position, setPosition] = useState<Position>({ lat: 14.6566, lng: 120.9796 });
  const [address, setAddress] = useState<string>("105 Samson Road 1400 Caloocan City Metro Manila");
  const [isFetchingAddress, setIsFetchingAddress] = useState<boolean>(false);
  
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  
  const [hasPinned, setHasPinned] = useState<boolean>(false);

  const fetchAddress = async (lat: number, lng: number) => {
    setIsFetchingAddress(true);
    setHasPinned(true); 

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      
      if (data && data.display_name) {
        setAddress(data.display_name);
      } else {
        setAddress("Address not found for this location.");
      }
    } catch (error) {
      console.error("Error fetching address:", error);
      setAddress("Error retrieving address.");
    } finally {
      setIsFetchingAddress(false);
    }
  };

  // 👇 --- THE UPDATED FUNCTION IS RIGHT HERE --- 👇
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log(`File selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      const previewUrl = URL.createObjectURL(file);
      setMediaPreview(previewUrl);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        
        try {
          localStorage.setItem("upload_image_base64", base64String);
          // 👇 NEW: Save the actual file name! 👇
          localStorage.setItem("upload_image_filename", file.name); 
          console.log("✅ SUCCESS: Image and filename saved to localStorage!");
        } catch (error) {
          console.error("❌ ERROR: Could not save to localStorage. The image is likely too large!", error);
          alert("This image is too large for the browser to process. Please try a smaller image (under 3MB).");
        }
      };
      reader.readAsDataURL(file);
    }
  };
  // 👆 ------------------------------------------ 👆

  // Condition to check if both requirements are met
  const isReadyToSubmit = hasPinned && mediaPreview !== null;

  return (
    <div className="pt-32 px-10 min-h-screen bg-dark-bg">
      {/* Container with rounded corners from Figma */}
      <div className="bg-card-bg rounded-oasys p-12 border border-white/5 shadow-2xl">
        
        {/* Header Section */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <p className="text-blue-500 font-bold text-sm uppercase tracking-wider mb-1">
              Pin Area Here
            </p>
            <h1 className="text-5xl font-extrabold text-white">
              Report Road <br /> Damage
            </h1>
          </div>
          
          {/* Conditionally render a Disabled Button OR Active Button  */}
          {isReadyToSubmit ? (
            <Link 
              href={{
                pathname: '/report-damage/result',
                query: { 
                  lat: position.lat, 
                  lng: position.lng, 
                  address: address 
                }
              }} 
              className="btn-blue bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition"
            >
              Submit Report
            </Link>
          ) : (
            <button 
              disabled 
              className="bg-gray-600 text-gray-400 px-6 py-3 rounded-lg font-bold cursor-not-allowed border border-gray-500"
              title="Please drop a pin on the map and upload an image first."
            >
              Submit Report
            </button>
          )}
        </div>

        {/* Location Display */}
        <div className="mb-6 flex items-center gap-4">
          <span className="text-blue-500 font-bold text-xl">Location:</span>
          <div className="bg-[#D9D9D9] text-black px-6 py-2 rounded-md font-medium flex-grow truncate">
            {isFetchingAddress ? "Updating location..." : address}
          </div>
        </div>

        {/* Map and Pin Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Map View */}
          <div className="lg:col-span-2 bg-gray-300 rounded-2xl h-[450px] relative overflow-hidden">
             <MapComponent 
                position={position} 
                setPosition={setPosition} 
                fetchAddress={fetchAddress} 
             />
          </div>

          {/* Upload Area Card */}
          <div className="bg-[#D9D9D9] rounded-2xl p-6 text-black flex flex-col">
            <h3 className="text-2xl font-black mb-4">Upload Image</h3>
            
            <label className="bg-zinc-500 hover:bg-zinc-600 transition cursor-pointer rounded-xl aspect-video mb-6 overflow-hidden relative flex items-center justify-center border-2 border-dashed border-gray-400 shadow-inner">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
              
              {/*Image Area, Uploaded Fits Whatever size */}
              {mediaPreview ? (
                <img 
                  src={mediaPreview} 
                  alt="Damage preview" 
                  className="w-full h-full object-contain absolute inset-0 bg-zinc-800/50" 
                />
              ) : (
                <div className="text-white font-medium text-center px-4">
                  <span className="text-3xl mb-2 block">📸</span>
                  Click to upload<br />Image
                </div>
              )}
            </label>

            <div>
              <p className="font-bold text-lg mb-1">Address</p>
              <div className="flex gap-2 items-start">
                <span className="mt-1">📍</span>
                <p className="text-sm leading-tight pr-2">
                  {isFetchingAddress ? "Updating..." : address}
                </p>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}