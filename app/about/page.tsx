export default function AboutUs() {
  return (
    <div className="pt-32 px-10 min-h-screen max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
      {/* Left Text Card */}
      <div className="flex-1 bg-[#262626] rounded-[40px] p-12 border border-white/5 flex flex-col justify-between min-h-[500px]">
        <div>
          <p className="text-blue-500 font-bold mb-4 uppercase tracking-widest">Why are we here?</p>
          <h1 className="text-7xl font-black text-white leading-tight">About<br/>Us</h1>
        </div>
        <p className="text-gray-400 text-lg leading-relaxed max-w-sm">
          We are a team of developers dedicated to improving road safety through AI-powered pavement damage detection and rule-based severity assessment.
        </p>
      </div>

      {/* Right Blue Cards */}
      <div className="flex-1 flex flex-col gap-8">
        <div className="bg-blue-500 rounded-[40px] p-10 text-white shadow-xl transform hover:scale-[1.02] transition-transform">
          <h2 className="text-4xl font-black mb-6 uppercase">Our Mission</h2>
          <p className="text-lg leading-snug opacity-90">
            This system was developed to assist in automated road crack classification and severity evaluation using computer vision and rule-based analysis.
          </p>
        </div>

        <div className="bg-blue-500 rounded-[40px] p-10 text-white shadow-xl transform hover:scale-[1.02] transition-transform">
          <h2 className="text-4xl font-black mb-6 uppercase">Our Vision</h2>
          <p className="text-lg leading-snug opacity-90">
            To create a future where infrastructure maintenance is proactive, data-driven, and accessible to every community, ensuring safer journeys for everyone.
          </p>
        </div>
      </div>
    </div>
  );
}