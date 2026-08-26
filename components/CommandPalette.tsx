import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Layout, Calendar, Timer, 
  Briefcase, Battery, Settings2, FileText, MapPin, 
  Sparkles, ArrowRight, X, Command, Sliders, Package
} from 'lucide-react';
import { GlobalFileRow, isAllowedModule, UserRole } from '../types';
import { useAuth } from './AuthProvider';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tabId: string) => void;
  data: GlobalFileRow[];
  onSelectSWO?: (swo: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Vue d\'Ensemble & Statuts x-Value', icon: Layout, desc: 'Indicateurs clés, distribution x-Value & Graphiques' },
  { id: 'data_pro', label: 'Data Pro (Vue Fluid)', icon: Layout, desc: 'Explorateur fluide, filtres rapides & grille' },
  { id: 'daily', label: 'Statut Quotidien', icon: Calendar, desc: 'Suivi journalier par date' },
  { id: 'ttf', label: 'Analyse TTF', icon: Timer, desc: 'Time To Fix & Performance SLA' },
  { id: 'gm', label: 'Feuille GM / Site', icon: FileText, desc: 'Analyse détaillée par site GM' },
  { id: 'tas', label: 'Analyse TAS', icon: Sliders, desc: 'Tickets & catégories TAS' },
  { id: 'battery', label: 'Suivi Batteries', icon: Battery, desc: 'Remplacement & santé batteries' },
  { id: 'belt', label: 'Suivi Courroies', icon: Briefcase, desc: 'Maintenance courroies' },
  { id: 'gmao', label: 'Stock & GMAO', icon: Package, desc: 'Gestion de stock, pièces remplacées & matériel' },
  { id: 'guide', label: 'Guide d\'Utilisation', icon: FileText, desc: 'Documentation & rôles de l\'application' },
  { id: 'rapport', label: 'Rapport d\'Activité Consolidé', icon: FileText, desc: 'Exportation de rapports consolidés' },
  { id: 'settings', label: 'Paramètres', icon: Settings2, desc: 'Configuration système & utilisateurs' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  data,
  onSelectSWO
}) => {
  const { role } = useAuth();
  const userRole = (role as UserRole) || 'User';
  const [query, setQuery] = useState('');

  // Handle Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by parent or state
          window.dispatchEvent(new CustomEvent('open-command-palette'));
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset query when palette opens
  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  // Filtered Nav Items based on Role and Query
  const filteredNav = useMemo(() => {
    const allowed = NAV_ITEMS.filter(item => isAllowedModule(userRole, item.id));
    if (!query.trim()) return allowed;
    const q = query.toLowerCase();
    return allowed.filter(item => 
      item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
    );
  }, [query, userRole]);

  // Filtered Records (SWO, Site, Intervenant)
  const filteredRecords = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    const results: { type: 'SWO' | 'Site' | 'FE'; title: string; subtitle: string; swo?: string; row: GlobalFileRow }[] = [];
    const seenSwo = new Set<string>();

    for (const row of data) {
      if (results.length >= 8) break;

      const swo = row["N° SWO"] ? String(row["N° SWO"]).trim() : '';
      const site = row["Nom du site"] || row["ID"] ? String(row["Nom du site"] || row["ID"]).trim() : '';
      const fe = row["Assigned to"] || row["Intervenant"] ? String(row["Assigned to"] || row["Intervenant"]).trim() : '';

      if (swo && swo.toLowerCase().includes(q) && !seenSwo.has(swo)) {
        seenSwo.add(swo);
        results.push({
          type: 'SWO',
          title: `SWO: ${swo}`,
          subtitle: `Site: ${site || 'Inconnu'} | Statut: ${row["TAS Status"] || row["x-Value"] || 'N/A'}`,
          swo,
          row
        });
      } else if (site && site.toLowerCase().includes(q)) {
        results.push({
          type: 'Site',
          title: `Site: ${site}`,
          subtitle: `SWO: ${swo || 'N/A'} | Intervenant: ${fe || 'Non assigné'}`,
          swo,
          row
        });
      }
    }
    return results;
  }, [query, data]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-start justify-center pt-16 sm:pt-24 px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col"
          id="command-palette-modal"
        >
          {/* Top Search Input */}
          <div className="flex items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800 gap-3 bg-slate-50/50 dark:bg-slate-900/50">
            <Search className="w-5 h-5 text-indigo-500 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un module, un N° SWO, un site..."
              className="w-full bg-transparent border-none text-slate-900 dark:text-slate-100 placeholder-slate-400 font-semibold text-base focus:outline-none focus:ring-0"
              autoFocus
            />
            {query && (
              <button 
                onClick={() => setQuery('')}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 px-2 py-1 bg-slate-200/60 dark:bg-slate-800 rounded-lg">
              <Command className="w-3 h-3" /> ESC
            </div>
          </div>

          {/* Search Content Results */}
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
            {/* Navigation Section */}
            {filteredNav.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Navigation Modules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
                  {filteredNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelectTab(item.id);
                          onClose();
                        }}
                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800/50 text-left transition-all group"
                      >
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 dark:text-slate-300 transition-colors shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                            {item.label}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate">
                            {item.desc}
                          </p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-indigo-500 transition-all shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Record Matches */}
            {filteredRecords.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Résultats SWO & Sites ({filteredRecords.length})
                </div>
                <div className="space-y-1.5 mt-1">
                  {filteredRecords.map((rec, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectTab('data');
                        if (rec.swo && onSelectSWO) {
                          onSelectSWO(rec.swo);
                        }
                        onClose();
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-100 dark:border-slate-800/80 hover:border-emerald-200 text-left transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
                          {rec.type === 'SWO' ? <FileText className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                            {rec.title}
                          </p>
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
                            {rec.subtitle}
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                        Ouvrir
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredNav.length === 0 && filteredRecords.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-black uppercase">Aucun résultat trouvé pour "{query}"</p>
                <p className="text-[11px] text-slate-400 mt-1">Essayez un nom de site, un numéro SWO ou un module.</p>
              </div>
            )}
          </div>

          {/* Footer Shortcuts */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Accès rapide intelligent
            </span>
            <span>Appuyez sur <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-mono">ESC</kbd> pour quitter</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
