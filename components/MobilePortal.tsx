import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Database, PieChart, Calendar, Timer, 
  Briefcase, Battery, Settings2, Download, Settings, 
  BarChart3, ClipboardList, Layers,
  Search, ShieldCheck, HelpCircle, ArrowRight, Package
} from 'lucide-react';
import { DatabaseStatusIndicators } from './DatabaseStatusIndicators';
import { GFLogo } from './GFLogo';
import { isAllowedModule, UserRole } from '../types';

interface MobilePortalProps {
  role: string | null;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  dataCount: number;
  alertsCount: number;
  onOpenAlerts: () => void;
  onLogout?: () => void;
}

interface ModuleItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  category: 'donnees' | 'analyses' | 'technique' | 'systeme';
  minRole: 'User' | 'Manager' | 'Admin';
}

type CategoryType = 'all' | 'donnees' | 'analyses' | 'technique' | 'systeme';

const MODULES: ModuleItem[] = [
  {
    id: 'upload',
    label: 'Import Excel',
    description: "Importer de nouveaux fichiers de données d'interventions Excel.",
    icon: Database,
    colorClass: 'text-blue-500 bg-blue-500/10',
    bgClass: 'from-blue-50/50 to-white dark:from-blue-950/20 dark:to-slate-900',
    borderClass: 'border-blue-100 dark:border-blue-900/50',
    category: 'donnees',
    minRole: 'Admin'
  },
  {
    id: 'dashboard',
    label: 'Analyses Globales',
    description: 'Indicateurs clés, répartition des fiches et statistiques générales.',
    icon: PieChart,
    colorClass: 'text-indigo-500 bg-indigo-500/10',
    bgClass: 'from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-slate-900',
    borderClass: 'border-indigo-100 dark:border-indigo-900/50',
    category: 'analyses',
    minRole: 'User'
  },
  {
    id: 'rapport',
    label: "Rapport d'Activité",
    description: "Suivi hebdomadaire et mensuel de l'avancement des interventions.",
    icon: BarChart3,
    colorClass: 'text-violet-500 bg-violet-500/10',
    bgClass: 'from-violet-50/50 to-white dark:from-violet-950/20 dark:to-slate-900',
    borderClass: 'border-violet-100 dark:border-violet-900/50',
    category: 'analyses',
    minRole: 'User'
  },
  {
    id: 'data_pro',
    label: 'Data Pro',
    description: 'Explorateur fluide, grille interactive et recherche rapide.',
    icon: Layers,
    colorClass: 'text-indigo-500 bg-indigo-500/10',
    bgClass: 'from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-slate-900',
    borderClass: 'border-indigo-100 dark:border-indigo-900/50',
    category: 'donnees',
    minRole: 'User'
  },
  {
    id: 'daily',
    label: 'Daily Status',
    description: "Suivi de l'avancement quotidien des SWO par site.",
    icon: Calendar,
    colorClass: 'text-teal-500 bg-teal-500/10',
    bgClass: 'from-teal-50/50 to-white dark:from-teal-950/20 dark:to-slate-900',
    borderClass: 'border-teal-100 dark:border-teal-900/50',
    category: 'analyses',
    minRole: 'User'
  },
  {
    id: 'ttf',
    label: 'Analyse TTF',
    description: 'Calcul du Mean Time To Resolution par catégorie technique.',
    icon: Timer,
    colorClass: 'text-orange-500 bg-orange-500/10',
    bgClass: 'from-orange-50/50 to-white dark:from-orange-950/20 dark:to-slate-900',
    borderClass: 'border-orange-100 dark:border-orange-900/50',
    category: 'analyses',
    minRole: 'User'
  },
  {
    id: 'gm',
    label: 'Feuille GM',
    description: 'Planification et statut des actions de Maintenance Générale.',
    icon: Briefcase,
    colorClass: 'text-amber-500 bg-amber-500/10',
    bgClass: 'from-amber-50/50 to-white dark:from-amber-950/20 dark:to-slate-900',
    borderClass: 'border-amber-100 dark:border-amber-900/50',
    category: 'technique',
    minRole: 'Admin'
  },
  {
    id: 'tas',
    label: 'Analyse TAS',
    description: "Contrôle et audit des temps de présence d'accès aux sites.",
    icon: ClipboardList,
    colorClass: 'text-fuchsia-500 bg-fuchsia-500/10',
    bgClass: 'from-fuchsia-50/50 to-white dark:from-fuchsia-950/20 dark:to-slate-900',
    borderClass: 'border-fuchsia-100 dark:border-fuchsia-900/50',
    category: 'technique',
    minRole: 'User'
  },
  {
    id: 'battery',
    label: 'Parc Batteries',
    description: "Suivi d'usure et alertes de remplacement de batteries.",
    icon: Battery,
    colorClass: 'text-rose-500 bg-rose-500/10',
    bgClass: 'from-rose-50/50 to-white dark:from-rose-950/20 dark:to-slate-900',
    borderClass: 'border-rose-100 dark:border-rose-900/50',
    category: 'technique',
    minRole: 'User'
  },
  {
    id: 'belt',
    label: 'Audit Courroies',
    description: "Suivi d'usure et alertes de remplacement de courroies.",
    icon: Settings2,
    colorClass: 'text-pink-500 bg-pink-500/10',
    bgClass: 'from-pink-50/50 to-white dark:from-pink-950/20 dark:to-slate-900',
    borderClass: 'border-pink-100 dark:border-pink-900/50',
    category: 'technique',
    minRole: 'User'
  },
  {
    id: 'gmao',
    label: 'Stock & GMAO',
    description: "Suivi des pièces remplacées, consommations et calibrations.",
    icon: Package,
    colorClass: 'text-amber-500 bg-amber-500/10',
    bgClass: 'from-amber-50/50 to-white dark:from-amber-950/20 dark:to-slate-900',
    borderClass: 'border-amber-100 dark:border-amber-900/50',
    category: 'technique',
    minRole: 'Admin'
  },
  {
    id: 'export',
    label: "Pôle d'Exportation",
    description: 'Télécharger les données filtrées au format Excel ou PDF.',
    icon: Download,
    colorClass: 'text-stone-500 bg-stone-500/10',
    bgClass: 'from-stone-50/50 to-white dark:from-stone-950/20 dark:to-slate-900',
    borderClass: 'border-stone-100 dark:border-stone-900/50',
    category: 'systeme',
    minRole: 'User'
  },
  {
    id: 'guide',
    label: "Guide d'Utilisation",
    description: "Documentation complète sur l'application, les rôles et le fonctionnement des modules.",
    icon: HelpCircle,
    colorClass: 'text-sky-500 bg-sky-500/10',
    bgClass: 'from-sky-50/50 to-white dark:from-sky-950/20 dark:to-slate-900',
    borderClass: 'border-sky-100 dark:border-sky-900/50',
    category: 'systeme',
    minRole: 'User'
  },
  {
    id: 'settings',
    label: 'Paramètres',
    description: "Seuils d'alerte de maintenance et préférences du système.",
    icon: Settings,
    colorClass: 'text-red-500 bg-red-500/10',
    bgClass: 'from-red-50/50 to-white dark:from-red-950/20 dark:to-slate-900',
    borderClass: 'border-red-100 dark:border-red-900/50',
    category: 'systeme',
    minRole: 'User'
  }
];

export const MobilePortal: React.FC<MobilePortalProps> = (props) => {
  const { role, onSelectTab, dataCount, alertsCount, onOpenAlerts } = props;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');

  const userRole = (role as UserRole) || 'User';
  const isAdmin = userRole === 'Admin';
  const isManager = userRole === 'Manager';
  const isFE = userRole === 'FE';

  const roleLabel = useMemo(() => {
    if (isAdmin) return { label: 'Administrateur', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
    if (isManager) return { label: 'Manager', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    if (isFE) return { label: 'Field Engineer (FE)', color: 'text-sky-500 bg-sky-500/10 border-sky-500/20' };
    return { label: 'Utilisateur', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  }, [isAdmin, isManager, isFE]);

  // Filter modules based on user role and query
  const filteredModules = useMemo(() => {
    return MODULES.filter(mod => {
      // Role check using centralized RBAC
      if (!isAllowedModule(userRole, mod.id)) return false;

      // Category check
      if (selectedCategory !== 'all' && mod.category !== selectedCategory) return false;

      // Search query check
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        return mod.label.toLowerCase().includes(query) || mod.description.toLowerCase().includes(query);
      }

      return true;
    });
  }, [userRole, selectedCategory, searchQuery]);

  const categories: { id: CategoryType; label: string }[] = [
    { id: 'all', label: 'Tous' },
    { id: 'donnees', label: 'Données' },
    { id: 'analyses', label: 'Analyses' },
    { id: 'technique', label: 'Technique' },
    { id: 'systeme', label: 'Système' }
  ];

  const getAccreditationBadge = (minRole: 'User' | 'Manager' | 'Admin') => {
    if (minRole === 'Admin') return { label: 'Admin', color: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40' };
    if (minRole === 'Manager') return { label: 'Manager', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40' };
    return { label: 'Tous', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40' };
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto pb-24">
      {/* Welcome & Accreditation summary banner */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-indigo-900/50">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/4 bottom-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shrink-0 flex items-center justify-center">
                <GFLogo className="w-full h-full" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Portail Applicatif</span>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Menu des Modules</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${roleLabel.color}`}>
                <ShieldCheck className="w-4 h-4" />
                <span>{roleLabel.label}</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-indigo-200 leading-relaxed font-medium">
            Accédez à l'ensemble des modules analytiques et opérationnels optimisés pour terminaux mobiles et tablettes selon vos niveaux d'accréditation.
          </p>

          <div className="grid grid-cols-2 gap-3 mt-2 pt-3 border-t border-indigo-900/50">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
              <span className="text-[10px] uppercase font-black tracking-wider text-indigo-300 block">Enregistrements</span>
              <span className="text-lg font-black text-white">{dataCount.toLocaleString()} lignes</span>
            </div>
            <button 
              onClick={onOpenAlerts}
              className={`text-left rounded-2xl p-3 border transition-all active:scale-95 ${
                alertsCount > 0 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                  : 'bg-white/5 border-white/5 text-emerald-300'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-black tracking-wider text-indigo-300 block">Alertes Actives</span>
                {alertsCount > 0 && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>}
              </div>
              <span className="text-lg font-black block mt-0.5">
                {alertsCount > 0 ? `${alertsCount} anomalies` : 'Aucune anomalie'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Section */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un module, un outil..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-xs font-semibold shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-slate-200 placeholder-slate-400 transition-all outline-none"
          />
        </div>

        {/* Categories Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 no-scrollbar -mx-4 px-4 scroll-smooth">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 duration-200 border ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Modules */}
      {filteredModules.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredModules.map((mod, index) => {
            const Icon = mod.icon;
            const badge = getAccreditationBadge(mod.minRole);
            return (
              <motion.div
                key={mod.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
                onClick={() => onSelectTab(mod.id)}
                className={`group flex flex-col p-5 bg-gradient-to-br ${mod.bgClass} border ${mod.borderClass} rounded-[2rem] shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] relative overflow-hidden`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-2xl ${mod.colorClass} flex items-center justify-center shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-1 rounded-lg border uppercase tracking-wider ${badge.color}`}>
                    Habilitation : {badge.label}
                  </span>
                </div>

                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {mod.label}
                </h3>
                
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium mb-4 flex-1">
                  {mod.description}
                </p>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100/60 dark:border-slate-800/60">
                  <span className="text-[10.5px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    Lancer le module
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transform group-hover:translate-x-1 transition-all" />
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4">
          <HelpCircle className="w-12 h-12 text-slate-300 dark:text-slate-700" />
          <div>
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 uppercase">Aucun module trouvé</h4>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
              Aucun module ne correspond à vos critères de recherche ou à votre niveau d'accréditation actuel.
            </p>
          </div>
        </div>
      )}

      {/* Footer avec voyants de statut de base de données et copyright */}
      <div className="mt-8 pt-6 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <DatabaseStatusIndicators className="w-full sm:w-auto" />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
          © 2026 Empreintes Tech.
        </p>
      </div>
    </div>
  );
};
