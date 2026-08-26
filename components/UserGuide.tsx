import React, { useState } from 'react';
import { 
  BookOpen, ShieldCheck, Database, PieChart, BarChart3, Layers, 
  Calendar, Timer, Briefcase, ClipboardList, Battery, Settings2, 
  Package, Download, Settings, Search,
  HelpCircle, CheckCircle2, Sparkles, ArrowRight,
  Info, Cpu, Lightbulb
} from 'lucide-react';

interface UserGuideProps {
  userRole?: string | null;
  onNavigateTab?: (tabId: string) => void;
}

export const UserGuide: React.FC<UserGuideProps> = ({ userRole, onNavigateTab }) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'roles' | 'modules' | 'faq'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const currentRole = userRole || 'User';

  const roleBadges: Record<string, { label: string; color: string; desc: string }> = {
    Admin: {
      label: 'Administrateur (Admin)',
      color: 'bg-rose-500/10 text-rose-500 border-rose-500/20 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50',
      desc: 'Accès intégral à la plateforme, gestion des utilisateurs, validation des inscriptions, import de fichiers Excel bruts et paramètres d\'administration.'
    },
    Manager: {
      label: 'Manager',
      color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50',
      desc: 'Accès complet aux modules d\'analyse, rapports d\'activité, Data Pro, GMAO, exportation et paramètres (sauf le module d\'import Excel).'
    },
    FE: {
      label: 'Field Engineer (FE)',
      color: 'bg-sky-500/10 text-sky-500 border-sky-500/20 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/50',
      desc: 'Profil technique de terrain avec accès ciblé aux modules opérationnels : Daily Status, Parc Batteries, Audit Courroies et Guide d\'Utilisation.'
    },
    User: {
      label: 'Utilisateur (User)',
      color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50',
      desc: 'Profil de consultation terrain avec accès restreint aux modules opérationnels : Daily Status, Parc Batteries, Audit Courroies et Guide d\'Utilisation.'
    }
  };

  const moduleList = [
    {
      id: 'upload',
      title: 'Import Excel',
      icon: Database,
      iconBg: 'from-amber-500 to-orange-600',
      roles: ['Admin'],
      category: 'Administration',
      summary: 'Module réservé exclusivement aux administrateurs pour alimenter la base de données centrale.',
      details: 'Permet de charger les classeurs Excel (.xlsx, .xls) contenant les données brutes de maintenance, de vérifier la structure des colonnes, de détecter les anomalies et de mettre à jour Firestore & Cloudflare D1.'
    },
    {
      id: 'dashboard',
      title: 'Analyses Globales',
      icon: PieChart,
      iconBg: 'from-blue-600 to-indigo-700',
      roles: ['Admin', 'Manager'],
      category: 'Analytics',
      summary: 'Tableau de bord décisionnel synthétisant la performance globale des interventions.',
      details: 'Présente les indicateurs clés de performance (KPI), la répartition par statut SWO (Open/Closed), le découpage par région administrative, les cartes de chaleur et les alertes système.'
    },
    {
      id: 'rapport',
      title: "Rapport d'Activité",
      icon: BarChart3,
      iconBg: 'from-purple-600 to-pink-600',
      roles: ['Admin', 'Manager'],
      category: 'Analytics',
      summary: 'Génération de bilans d\'activité synthétiques périodiques.',
      details: 'Fournit une vue synthétique des travaux exécutés par équipes, des niveaux de service (SLA) et de l\'avancement des plans d\'action correctifs.'
    },
    {
      id: 'data_pro',
      title: 'Data Pro (Vue Fluid)',
      icon: Layers,
      iconBg: 'from-indigo-600 to-blue-700',
      roles: ['Admin', 'Manager'],
      category: 'Données',
      summary: 'Explorateur dynamique haute performance avec grille interactive.',
      details: 'Permet la recherche textuelle instantanée, le filtrage multi-critères, le tri de colonnes et la modification rapide de lignes par les utilisateurs habilités.'
    },
    {
      id: 'daily',
      title: 'Daily Status',
      icon: Calendar,
      iconBg: 'from-cyan-600 to-blue-600',
      roles: ['Admin', 'Manager', 'FE', 'User'],
      category: 'Opérationnel',
      summary: 'Suivi quotidien en temps réel des interventions et des opérations terrain.',
      details: 'Consulte l\'état d\'avancement jour par jour des fiches SWO, les actions des refuelleurs, la maintenance préventive (PM) et le statut des groupes électrogènes (DG).'
    },
    {
      id: 'ttf',
      title: 'Analyse TTF (Time-To-Fix)',
      icon: Timer,
      iconBg: 'from-rose-600 to-red-700',
      roles: ['Admin', 'Manager'],
      category: 'Performance',
      summary: 'Analyse des délais moyens de rétablissement et de résolution des pannes.',
      details: 'Mesure le temps d\'intervention et de clôture des tickets (TTF) par catégorie d\'équipement, région et intervenant pour identifier les retards et goulots d\'étranglement.'
    },
    {
      id: 'gm',
      title: 'Feuille GM (Matériel Stratégique)',
      icon: Briefcase,
      iconBg: 'from-violet-600 to-purple-700',
      roles: ['Admin', 'Manager'],
      category: 'Technique',
      summary: 'Gestion spécialisée des composants d\'énergie et de puissance.',
      details: 'Suivi détaillé des redresseurs, cartes de commande, disjoncteurs, fusibles et équipements de conversion d\'énergie sur les sites télécoms.'
    },
    {
      id: 'tas',
      title: 'Analyse TAS (Technical Audit Sheet)',
      icon: ClipboardList,
      iconBg: 'from-amber-600 to-yellow-600',
      roles: ['Admin', 'Manager'],
      category: 'Qualité',
      summary: 'Audit de conformité des fiches d\'accès et comptes-rendus d\'intervention.',
      details: 'Analyse la qualité des contrôles techniques exécutés sur le terrain et la validation des fiches TAS.'
    },
    {
      id: 'battery',
      title: 'Parc Batteries',
      icon: Battery,
      iconBg: 'from-emerald-500 to-green-700',
      roles: ['Admin', 'Manager', 'FE', 'User'],
      category: 'Opérationnel',
      summary: 'Suivi de la santé du parc d\'énergie secours (batteries).',
      details: 'Surveille l\'ancienneté des bancs de batteries, calcule le taux d\'usure en mois, signale les alertes de vétusté et planifie les opérations de remplacement (SWAP Batteries).'
    },
    {
      id: 'belt',
      title: 'Audit Courroies',
      icon: Settings2,
      iconBg: 'from-slate-600 to-slate-800',
      roles: ['Admin', 'Manager', 'FE', 'User'],
      category: 'Opérationnel',
      summary: 'Contrôle et prévention de l\'usure des courroies des groupes électrogènes.',
      details: 'Calcule l\'âge d\'utilisation des courroies de ventilateur/alternateur DG en jours, déclenche les alertes visuelles et planifie le SWAP Courroies.'
    },
    {
      id: 'gmao',
      title: 'Stock & GMAO',
      icon: Package,
      iconBg: 'from-amber-600 to-amber-700',
      roles: ['Admin'],
      category: 'Logistique',
      summary: 'Gestion de stock de pièces de rechange et consommables.',
      details: 'Suit les mouvements de stock de composants de remplacement, l\'inventaire des pièces critiques et le matériel en réserve.'
    },
    {
      id: 'export',
      title: "Pôle d'Exportation",
      icon: Download,
      iconBg: 'from-sky-500 to-indigo-600',
      roles: ['Admin', 'Manager'],
      category: 'Système',
      summary: 'Module d\'extraction de rapports au format Excel/CSV.',
      details: 'Permet d\'exporter l\'ensemble de la base ou un extrait filtré personnalisé avec sélection dynamique des colonnes.'
    },
    {
      id: 'settings',
      title: 'Paramètres du Système',
      icon: Settings,
      iconBg: 'from-red-600 to-rose-800',
      roles: ['Admin'],
      category: 'Système',
      summary: 'Configuration des seuils, gestion des comptes et surveillance des bases.',
      details: 'Regroupe la modification des seuils d\'alerte (batteries/courroies), l\'approbation des nouveaux comptes utilisateurs (Admin), la gestion du thème et le diagnostic de synchronisation Firestore / Cloudflare D1.'
    },
    {
      id: 'guide',
      title: "Guide d'Utilisation",
      icon: BookOpen,
      iconBg: 'from-indigo-600 to-violet-700',
      roles: ['Admin', 'Manager', 'FE', 'User'],
      category: 'Système',
      summary: 'Manuel interactif et documentation officielle de l\'application.',
      details: 'Explication détaillée des rôles, de l\'architecture applicative, des fonctionnalités et du rôle de chaque module.'
    }
  ];

  const filteredModules = moduleList.filter(m => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return m.title.toLowerCase().includes(query) || 
           m.summary.toLowerCase().includes(query) || 
           m.details.toLowerCase().includes(query) ||
           m.category.toLowerCase().includes(query);
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300 pb-20">
      
      {/* Banner Card Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-indigo-800/50">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Manuel & Documentation Officielle</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white uppercase font-display">
              Guide d'Utilisation <span className="text-indigo-400">GlobalFiles</span>
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200 leading-relaxed font-medium">
              Découvrez le fonctionnement complet de l'application Enterprise, la matrice des droits d'accès par rôle et la description détaillée de chaque module métier.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-2xl shrink-0 space-y-2 self-start md:self-auto min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 block">Votre Profil Connecté</span>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-300" />
              <span className="text-base font-black text-white">{roleBadges[currentRole]?.label || currentRole}</span>
            </div>
            <span className="text-[10px] text-indigo-200/80 block font-medium">
              {filteredModules.filter(m => m.roles.includes(currentRole)).length} modules accessibles
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveSection('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'overview'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Vue d'Ensemble</span>
        </button>

        <button
          onClick={() => setActiveSection('roles')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'roles'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Profils & Rôles (RBAC)</span>
        </button>

        <button
          onClick={() => setActiveSection('modules')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'modules'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Catalogue des Modules</span>
        </button>

        <button
          onClick={() => setActiveSection('faq')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'faq'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>FAQ & Astuces</span>
        </button>
      </div>

      {/* SECTION 1: OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                <Database className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Centralisation des Données</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                GlobalFiles Enterprise agrège les interventions de maintenance préventive et corrective (SWO, PM, DG, Aircon) dans un environnement synchronisé en temps réel.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Sécurité & Habilitations</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Le modèle d'habilitation restreint l'accès aux modules selon le rôle professionnel attribué (Admin, Manager, Field Engineer ou User).
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Lightbulb className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Recherche Rapide (Ctrl+K)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Utilisez la palette de commande rapide à tout moment via la touche <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono">Ctrl+K</kbd> pour rechercher un site, un N° SWO ou naviguer instantanément.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-500" />
              <span>Synthèse des Accès par Rôle Professionnel</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(roleBadges).map(([roleKey, roleInfo]) => {
                const isCurrent = roleKey === currentRole;
                return (
                  <div key={roleKey} className={`p-4 rounded-xl border transition-all ${isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-800 ring-2 ring-indigo-500/30' : 'bg-slate-50/50 dark:bg-slate-950/20 border-slate-200/60 dark:border-slate-800'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${roleInfo.color}`}>
                        {roleKey}
                      </span>
                      {isCurrent && <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded">Votre profil</span>}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                      {roleInfo.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: ROLES & RBAC MATRIX */}
      {activeSection === 'roles' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Matrice des Droits & Habilitations (RBAC)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Consultez en un coup d'œil les modules autorisés pour chaque profil utilisateur.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <th className="py-3 px-4 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Module Metier</th>
                    <th className="py-3 px-4 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider text-center">Admin</th>
                    <th className="py-3 px-4 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-center">Manager</th>
                    <th className="py-3 px-4 text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider text-center">FE (Field Eng.)</th>
                    <th className="py-3 px-4 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-center">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {moduleList.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${m.iconBg} text-white shrink-0`}>
                          <m.icon className="w-3.5 h-3.5" />
                        </div>
                        <span>{m.title}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.roles.includes('Manager') ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 font-bold">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.roles.includes('FE') ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 font-bold">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.roles.includes('User') ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 font-bold">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <span className="font-black uppercase tracking-wider block">Règles d'accès importantes :</span>
              <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                <li><strong>Import Excel (`upload`) :</strong> Réservé strictement au profil <strong>Admin</strong>. Le profil Manager n'a pas accès à ce module.</li>
                <li><strong>Profils FE & User :</strong> Ont accès aux modules d'intervention terrain (<strong>Daily Status</strong>, <strong>Parc Batteries</strong>, <strong>Audit Courroies</strong>) et au <strong>Guide d'Utilisation</strong>.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: CATALOGUE DES MODULES */}
      {activeSection === 'modules' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher un module (ex: Daily Status, Batteries, Import...)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-xs rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 shrink-0">
              {filteredModules.length} module(s) trouvé(s)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredModules.map((mod) => {
              const isAccessible = mod.roles.includes(currentRole);
              return (
                <div 
                  key={mod.id} 
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between transition-all ${
                    isAccessible 
                      ? 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800' 
                      : 'border-slate-200/40 dark:border-slate-800/40 opacity-75 bg-slate-50/50 dark:bg-slate-950/20'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${mod.iconBg} text-white shadow-sm shrink-0`}>
                          <mod.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">{mod.title}</h3>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{mod.category}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 justify-end">
                        {mod.roles.map(r => (
                          <span key={r} className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                      {mod.summary}
                    </p>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60">
                      {mod.details}
                    </p>
                  </div>

                  {isAccessible && onNavigateTab && (
                    <button
                      onClick={() => onNavigateTab(mod.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors pt-2 cursor-pointer"
                    >
                      <span>Accéder au module</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 4: FAQ & BONNES PRATIQUES */}
      {activeSection === 'faq' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-500" />
              <span>Foire Aux Questions (FAQ) & Bonnes Pratiques</span>
            </h2>

            <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="pt-3 space-y-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Comment obtenir un rôle ou modifier mes droits d'accès ?</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Toute demande de changement de rôle (passer de User/FE à Manager ou Admin) doit être formulée auprès de l'Administrateur système via la section <em>Paramètres du Système &gt; Validation Inscriptions</em>.
                </p>
              </div>

              <div className="pt-3 space-y-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Que faire si le quota Firestore de la base de données est dépassé ?</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  L'application dispose d'un mécanisme de basculement automatique (*Failover*) sur Cloudflare D1. Les données restent accessibles en lecture/écriture sans interruption de service.
                </p>
              </div>

              <div className="pt-3 space-y-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Comment utiliser le Mode Nuit ?</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Vous pouvez activer le Mode Nuit fixe ou le Mode Appareil (synchronisé avec votre système) depuis le panneau de configuration ou laisser la planification automatique activer le mode nuit entre 20h00 et 06h00.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
