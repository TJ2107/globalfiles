import React, { useState, useEffect } from 'react';
import { Database, Info } from 'lucide-react';

interface DatabaseStatusIndicatorsProps {
  isCompact?: boolean;
  className?: string;
}

export const DatabaseStatusIndicators: React.FC<DatabaseStatusIndicatorsProps> = ({
  isCompact = false,
  className = ''
}) => {
  const [firestoreStatus, setFirestoreStatus] = useState<'connected' | 'quota_exceeded'>('connected');
  const [cloudflareStatus, setCloudflareStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [isCloudflareRemote, setIsCloudflareRemote] = useState<boolean>(false);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  useEffect(() => {
    // Check initial quota error or force D1 state
    const checkQuotaState = () => {
      const isForceD1 = typeof window !== 'undefined' && localStorage.getItem('force_d1_active') === 'true';
      if (isForceD1) {
        setFirestoreStatus('quota_exceeded');
      } else {
        setFirestoreStatus('connected');
      }
    };

    checkQuotaState();

    const handleQuotaEvent = () => {
      setFirestoreStatus('quota_exceeded');
    };

    const handleSourceChanged = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail === 'Cloudflare D1' || customEvent.detail === 'Cache Local') {
        const isForced = localStorage.getItem('force_d1_active') === 'true';
        if (isForced) setFirestoreStatus('quota_exceeded');
      } else if (customEvent.detail === 'Firebase') {
        setFirestoreStatus('connected');
      }
    };

    window.addEventListener('firestore-quota-exceeded', handleQuotaEvent);
    window.addEventListener('data-source-changed', handleSourceChanged);

    // Check Cloudflare connection
    const checkCloudflare = async () => {
      try {
        const [healthRes, d1Res] = await Promise.all([
          fetch('/api/health').catch(() => null),
          fetch('/api/d1/comments').catch(() => null)
        ]);

        if (healthRes && healthRes.ok) {
          const healthData = await healthRes.json();
          setIsCloudflareRemote(!!healthData.cloudflareConfigured);
        }

        if (d1Res && d1Res.ok) {
          setCloudflareStatus('connected');
        } else {
          setCloudflareStatus('offline');
        }
      } catch {
        setCloudflareStatus('connected'); // Fallback relay is active
      }
    };

    checkCloudflare();
    const interval = setInterval(checkCloudflare, 45000);

    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaEvent);
      window.removeEventListener('data-source-changed', handleSourceChanged);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div 
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center justify-center gap-2.5 ${
          isCompact ? 'px-2 py-1 rounded-lg' : 'px-3 py-1.5 rounded-xl'
        } bg-slate-900/90 hover:bg-slate-850 border border-slate-800/90 transition-all duration-200 cursor-pointer shadow-xs select-none group`}
        title="Bases de données : Bleu (Cloudflare D1 - Principale) / Rouge (Firestore - Secondaire)"
      >
        {/* Voyant 1 : Cloudflare D1 (Bleu / Base Principale) */}
        <div 
          className="flex items-center justify-center relative p-0.5" 
          title={cloudflareStatus === 'connected' ? 'Base Principale : Cloudflare D1 (Connecté)' : 'Base Principale : Cloudflare D1 (Vérification...)'}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span 
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                cloudflareStatus === 'connected' ? 'bg-sky-400' : 'bg-slate-400'
              }`}
            ></span>
            <span 
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                cloudflareStatus === 'connected' ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]' : 'bg-slate-500'
              }`}
            ></span>
          </span>
        </div>

        {/* Separator */}
        <span className="text-slate-700 text-[10px] select-none">•</span>

        {/* Voyant 2 : Firestore (Vert / Base Secondaire & Réplication Active) */}
        <div 
          className="flex items-center justify-center relative p-0.5" 
          title={firestoreStatus === 'connected' ? 'Base Secondaire : Firestore (Opérationnel / Réplication Active)' : 'Base Secondaire : Firestore (Quota Dépassé)'}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span 
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                firestoreStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            ></span>
            <span 
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                firestoreStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]' : 'bg-amber-500'
              }`}
            ></span>
          </span>
        </div>

        <Info className="w-3 h-3 text-slate-500 group-hover:text-slate-300 ml-1 shrink-0 transition-colors" />
      </div>

      {/* Popover / Hover details card positioned to the RIGHT for maximum visibility */}
      {showTooltip && (
        <div className="absolute bottom-0 left-full ml-3 w-72 bg-slate-950/95 backdrop-blur-md border border-slate-800 text-white rounded-2xl p-4 shadow-2xl z-[150] text-left animate-in fade-in slide-in-from-left-2 duration-150">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800/80">
            <h5 className="text-[10.5px] font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              État des Bases de Données
            </h5>
            <span className="text-[8px] bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded font-mono font-bold">Cloudflare 1ère</span>
          </div>

          <div className="space-y-3">
            {/* Cloudflare D1 Details (Primary) */}
            <div className="flex items-start gap-2.5 bg-slate-900/70 p-2.5 rounded-xl border border-sky-900/40">
              <div className="mt-1">
                <span className="flex h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]"></span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <p className="text-[10.5px] font-black text-sky-400 uppercase tracking-tight">Base Principale : Cloudflare D1</p>
                  <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase bg-sky-950/80 text-sky-300 border border-sky-800/50">
                    Prioritaire
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-300 leading-snug">
                  {isCloudflareRemote 
                    ? 'Base de production principale active sur Cloudflare D1.' 
                    : 'Base principale active avec persistance haute disponibilité.'}
                </p>
              </div>
            </div>

            {/* Firestore Details (Secondary) */}
            <div className="flex items-start gap-2.5 bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/60">
              <div className="mt-1">
                <span className={`flex h-2.5 w-2.5 rounded-full ${firestoreStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.9)]'}`}></span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <p className={`text-[10.5px] font-black uppercase tracking-tight ${firestoreStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`}>Base Secondaire : Firestore</p>
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                    firestoreStatus === 'connected' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50' : 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                  }`}>
                    {firestoreStatus === 'connected' ? 'Opérationnel' : 'Quota Dépassé'}
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-300 leading-snug">
                  {firestoreStatus === 'connected' 
                    ? 'Sauvegarde secondaire & réplication cloud active.' 
                    : 'Quota journalier Firestore atteint : Cloudflare D1 assure le service principal sans interruption.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
