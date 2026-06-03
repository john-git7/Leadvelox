export function DemoVideo() {
  return (
    <div className="relative max-w-4xl mx-auto bg-[#111111] border border-[#262626] rounded-xl overflow-hidden shadow-2xl mb-8">
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }} className="w-full h-full bg-[#0A0A0A]">
        <iframe 
          src="https://www.loom.com/embed/d14d6a2806504f44a8a1f86eb7326940?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true" 
          frameBorder="0" 
          allowFullScreen 
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        ></iframe>
      </div>
    </div>
  );
}
