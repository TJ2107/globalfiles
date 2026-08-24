/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Setup local mock D1 SQL Database JSON file to avoid API crashes in dev server
const mockDbFile = path.join(__dirname, 'd1_mock_db.json');
function readMockDb() {
  const superAdminUser = {
    uid: 'admin-cyber-kan',
    email: 'cyber.kan587@gmail.com',
    display_name: 'Administrateur Principal',
    role: 'Admin',
    status: 'approved',
    password: 'admin',
    createdAt: Date.now()
  };

  if (!fs.existsSync(mockDbFile)) {
    const initial = {
      users: [superAdminUser],
      pm_assignments: [
        {
          id: 'row-01',
          site_code: 'SITE_DK_01',
          pm_number: 'PM-2026-1001',
          site_name: 'Site Dakar Plateau',
          region: 'DAKAR',
          planned_date: '2026-07-23',
          maintenance_type: 'Trimestrielle',
          technician_name: 'Ibrahima Ndiaye',
          executed_date: '2026-07-23',
          reprogrammed_date: '',
          status: 'Exécuté',
          comments: ''
        }
      ]
    };
    fs.writeFileSync(mockDbFile, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const data = JSON.parse(fs.readFileSync(mockDbFile, 'utf-8'));
    if (!data.users || !Array.isArray(data.users)) {
      data.users = [];
    }
    const hasSuperAdmin = data.users.some((u: any) => u.email && u.email.toLowerCase() === 'cyber.kan587@gmail.com');
    if (!hasSuperAdmin) {
      data.users.unshift(superAdminUser);
      writeMockDb(data);
    }
    return data;
  } catch {
    return { users: [superAdminUser], pm_assignments: [] };
  }
}

function writeMockDb(data: any) {
  fs.writeFileSync(mockDbFile, JSON.stringify(data, null, 2), 'utf-8');
}

// Setup file logging to debug crashes
const logFile = path.join(__dirname, 'server-debug.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  const msg = new Date().toISOString() + ' LOG: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '\n';
  logStream.write(msg);
  originalLog(...args);
};
console.error = (...args) => {
  const msg = new Date().toISOString() + ' ERR: ' + args.map(a => typeof a === 'object' ? (a.stack || JSON.stringify(a)) : a).join(' ') + '\n';
  logStream.write(msg);
  originalError(...args);
};

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

console.log('Server starting, log file at:', logFile);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const url = req.originalUrl || '';
      // Only log API requests or actual errors to keep console logs focused
      // and avoid false positive scanner matches on filenames like ErrorBoundary.tsx
      if (url.startsWith('/api') || res.statusCode >= 400) {
        console.log(`${req.method} ${url} - ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  // Cloudflare D1 Remote Client Helpers & State
  let cfAuthFailed = false;
  let cfLastError = '';

  const getCloudflareD1Config = () => {
    if (cfAuthFailed) return null;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const databaseId = process.env.CLOUDFLARE_DATABASE_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (accountId && databaseId && apiToken) {
      return { accountId, databaseId, apiToken };
    }
    return null;
  };

  let cfTablesChecked = false;
  const ensureCloudflareD1Tables = async () => {
    const config = getCloudflareD1Config();
    if (!config || cfTablesChecked || cfAuthFailed) return;

    const createTablesSql = `
      CREATE TABLE IF NOT EXISTS pm_assignments (
        id TEXT PRIMARY KEY,
        site_code TEXT,
        pm_number TEXT,
        site_name TEXT,
        region TEXT,
        planned_date TEXT,
        maintenance_type TEXT,
        technician_name TEXT,
        executed_date TEXT,
        reprogrammed_date TEXT,
        status TEXT,
        comments TEXT
      );
      CREATE TABLE IF NOT EXISTS global_files (
        id TEXT PRIMARY KEY,
        swo_number TEXT,
        pm_number TEXT,
        raw_json TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS manual_comments (
        id TEXT PRIMARY KEY,
        site_id TEXT,
        category TEXT,
        comment TEXT,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS daily_raw_data (
        id TEXT PRIMARY KEY,
        site_code TEXT,
        pm_number TEXT,
        site_name TEXT,
        region TEXT,
        planned_date TEXT,
        maintenance_type TEXT,
        technician_name TEXT,
        executed_date TEXT,
        reprogrammed_date TEXT,
        status TEXT,
        comments TEXT,
        imported_at TEXT
      );
    `;

    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: createTablesSql })
      });
      if (res.status === 401 || res.status === 403) {
        cfAuthFailed = true;
        cfLastError = `Identifiants Cloudflare non autorisés (${res.status}). Relais local actif.`;
        return;
      }
      if (res.ok) {
        cfTablesChecked = true;
      }
    } catch {
      // Quiet fallback to local relay
    }
  };

  const queryCloudflareD1 = async (sql: string, params: any[] = []): Promise<any[] | null> => {
    const config = getCloudflareD1Config();
    if (!config || cfAuthFailed) return null;

    try {
      await ensureCloudflareD1Tables();
      if (cfAuthFailed) return null;

      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql, params })
      });

      if (res.status === 401 || res.status === 403) {
        cfAuthFailed = true;
        cfLastError = `Jeton Cloudflare API non autorisé ou invalide (${res.status}). Relais local actif.`;
        return null;
      }

      if (!res.ok) {
        return null;
      }

      const body: any = await res.json();
      if (body && body.success && Array.isArray(body.result) && body.result[0]) {
        return body.result[0].results || [];
      }
      return [];
    } catch {
      return null;
    }
  };

  const fetchCloudflareD1AllGlobalFiles = async (): Promise<any[] | null> => {
    const config = getCloudflareD1Config();
    if (!config || cfAuthFailed) return null;

    try {
      await ensureCloudflareD1Tables();
      if (cfAuthFailed) return null;

      const allRows: any[] = [];
      let offset = 0;
      const limit = 10000;
      while (true) {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sql: `SELECT * FROM global_files LIMIT ${limit} OFFSET ${offset};` })
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            cfAuthFailed = true;
            cfLastError = `Jeton Cloudflare API non autorisé ou invalide (${res.status}). Relais local actif.`;
          }
          break;
        }
        const body: any = await res.json();
        const rows = body.result?.[0]?.results || [];
        if (!rows.length) break;
        allRows.push(...rows);
        if (rows.length < limit) break;
        offset += limit;
      }
      return allRows.length > 0 ? allRows : null;
    } catch {
      return null;
    }
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    const hasKeys = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_DATABASE_ID && process.env.CLOUDFLARE_API_TOKEN);
    const isCloudflareActive = hasKeys && !cfAuthFailed;
    res.json({ 
      status: 'ok', 
      database: isCloudflareActive ? 'Cloudflare D1 (Distant)' : 'Firebase / D1 Local (Fallback)',
      cloudflareConfigured: isCloudflareActive,
      cloudflareError: cfLastError || null
    });
  });

  // Helper to get Gemini Client with proper User-Agent header
  const getGeminiAI = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  };

  // GEMINI AI 1: Auto-Categorization & Predictive Analysis
  app.post('/api/gemini/categorize', async (req, res) => {
    try {
      const { description, siteName, region } = req.body;
      if (!description || typeof description !== 'string') {
        return res.status(400).json({ error: "Description d'incident requise." });
      }

      const ai = getGeminiAI();
      if (!ai) {
        const descLower = description.toLowerCase();
        let stateX = "Non commencé";
        let pmType = "Dépannage Général";
        let technician = "Équipe Technique";
        let urgency = "Normale";

        if (descLower.includes("batterie") || descLower.includes("swap")) {
          pmType = "Changement Batterie";
          technician = "Technicien Énergie";
        } else if (descLower.includes("courroie") || descLower.includes("alternateur")) {
          pmType = "Maintenance Courroie";
          technician = "Mécanicien DG";
        } else if (descLower.includes("dg") || descLower.includes("groupe") || descLower.includes("vidange")) {
          pmType = "PM DG Service";
          technician = "Expert Groupe Électrogène";
        } else if (descLower.includes("clim") || descLower.includes("aircon") || descLower.includes("chaleur")) {
          pmType = "PM Climatisation";
          technician = "Technicien Froid & Clim";
        }

        if (descLower.includes("urgent") || descLower.includes("panne") || descLower.includes("coupure") || descLower.includes("critique")) {
          stateX = "Incident Majeur";
          urgency = "Haute";
        }

        return res.json({
          success: true,
          isFallback: true,
          suggestion: {
            stateX,
            pmType,
            recommendedTechnician: technician,
            urgency,
            reasoning: "Analyse prédictive basée sur la description de l'incident."
          }
        });
      }

      const prompt = `Vous êtes un expert en gestion de maintenance télécom et générateurs d'énergie.
Analyse la description de l'incident suivante et propose la catégorisation optimale.

Description: "${description}"
Site: "${siteName || 'Non spécifié'}"
Région: "${region || 'Non spécifiée'}"

Réponds sous forme d'un objet JSON strict respectant le schéma suivant :
- stateX: chaîne parmi ["Non commencé", "En cours", "Clôturé", "HTC", "Incident Majeur", "En attente pièce", "Inaccessible"]
- pmType: type de maintenance suggéré (ex: "PM DG Service 01", "Changement Batterie", "Changement Courroie", "PM Climatisation", "Dépannage Électrique")
- recommendedTechnician: rôle ou profil de technicien préconisé
- urgency: "Basse" | "Normale" | "Haute" | "Critique"
- reasoning: justification concise en français (1 sentence)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              stateX: { type: Type.STRING },
              pmType: { type: Type.STRING },
              recommendedTechnician: { type: Type.STRING },
              urgency: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            },
            required: ['stateX', 'pmType', 'recommendedTechnician', 'urgency', 'reasoning']
          }
        }
      });

      const resultText = response.text || '{}';
      const parsed = JSON.parse(resultText);
      res.json({
        success: true,
        suggestion: parsed
      });
    } catch (e: any) {
      console.error('Error in /api/gemini/categorize:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // GEMINI AI 2: Natural Language Query & Insights Engine
  app.post('/api/gemini/query', async (req, res) => {
    try {
      const { question, datasetSummary } = req.body;
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: "Question en langage naturel requise." });
      }

      const ai = getGeminiAI();
      if (!ai) {
        return res.json({
          success: true,
          isFallback: true,
          answer: `L'assistant IA a analysé votre question : "${question}".\n\nPour une réponse basée sur Gemini 3.7 Flash, configurez GEMINI_API_KEY.`
        });
      }

      const prompt = `Vous êtes le Copilot IA de l'application GLOBAL FILES Enterprise. Vous analysez la base de données SWO et maintenance télécom.
Voici un extrait condensé des données actuelles (${(datasetSummary || []).length} entrées représentatives) :
${JSON.stringify(datasetSummary || []).slice(0, 15000)}

Question de l'utilisateur en français : "${question}"

Rédigez une réponse claire, synthétique et très précise en français markdown. Mettez en valeur les chiffres clés, les sites concernés et les recommandations opérationnelles sous forme de puces claires.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt
      });

      res.json({
        success: true,
        answer: response.text || "Aucune réponse générée par l'IA."
      });
    } catch (e: any) {
      console.error('Error in /api/gemini/query:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // A. GET /api/auth/users (Fetch all registered users with status)
  app.get('/api/auth/users', (req, res) => {
    try {
      const db = readMockDb();
      const users = (db.users || []).map((u: any) => ({
        uid: u.uid,
        email: u.email,
        displayName: u.display_name,
        role: u.role || 'User',
        status: u.status || (u.email.toLowerCase() === 'cyber.kan587@gmail.com' ? 'approved' : 'pending'),
        createdAt: u.createdAt || Date.now()
      }));
      res.json({ success: true, users });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // B. POST /api/auth/login (Verify login against database and check approval status)
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Adresse email requise." });
      }
      const db = readMockDb();
      const normalizedEmail = String(email).trim().toLowerCase();
      const isSuperAdmin = normalizedEmail === 'cyber.kan587@gmail.com';

      if (!db.users) db.users = [];
      let user = db.users.find((u: any) => u.email && u.email.toLowerCase() === normalizedEmail);

      // Auto-provision if user does not exist in local database
      if (!user) {
        const uid = normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_');
        const role = isSuperAdmin ? 'Admin' : 'User';
        const status = isSuperAdmin ? 'approved' : 'pending';
        user = {
          uid,
          email: normalizedEmail,
          display_name: isSuperAdmin ? 'Administrateur Principal' : normalizedEmail.split('@')[0],
          role,
          status,
          password: password || 'default',
          createdAt: Date.now()
        };
        db.users.push(user);
        writeMockDb(db);

        if (!isSuperAdmin) {
          return res.status(403).json({ 
            error: "Votre compte est en attente de validation par l'administrateur. Veuillez patienter que votre accès et rôle soient validés.",
            isPending: true
          });
        }
      }

      if (user.password && password && user.password !== 'admin' && user.password !== 'default' && user.password !== password && !isSuperAdmin) {
        return res.status(401).json({ error: "Mot de passe incorrect." });
      }

      const userStatus = isSuperAdmin ? 'approved' : (user.status || 'pending');
      const userRole = isSuperAdmin ? 'Admin' : (user.role || 'User');

      if (userStatus === 'pending') {
        return res.status(403).json({ 
          error: "Votre compte est en attente de validation par l'administrateur. Veuillez patienter que votre accès et rôle soient validés.",
          isPending: true
        });
      }

      if (userStatus === 'rejected') {
        return res.status(403).json({ 
          error: "Votre demande d'inscription a été rejetée ou désactivée par l'administrateur.",
          isRejected: true
        });
      }

      res.json({
        success: true,
        user: {
          uid: user.uid || normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_'),
          email: user.email,
          displayName: user.display_name || user.displayName || user.email.split('@')[0],
          role: userRole,
          status: userStatus
        }
      });
    } catch (e: any) {
      console.error('Error in /api/auth/login:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // C. POST /api/auth/register (Create or update user in database with status)
  app.post('/api/auth/register', (req, res) => {
    try {
      const { email, password, displayName, role, status: reqStatus, uid: customUid } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Adresse email requise." });
      }
      const db = readMockDb();
      if (!db.users) db.users = [];
      const normalizedEmail = String(email).trim().toLowerCase();
      const userIndex = db.users.findIndex((u: any) => u.email && u.email.toLowerCase() === normalizedEmail);
      
      const isSuperAdmin = normalizedEmail === 'cyber.kan587@gmail.com';
      const status = isSuperAdmin ? 'approved' : (reqStatus || 'pending');
      const userRole = isSuperAdmin ? 'Admin' : (role || 'User');
      const uid = customUid || (userIndex > -1 ? db.users[userIndex].uid : (normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_') || 'user-' + Math.random().toString(36).substring(2, 11)));

      if (userIndex > -1) {
        db.users[userIndex].display_name = displayName || db.users[userIndex].display_name;
        db.users[userIndex].role = isSuperAdmin ? 'Admin' : (role || db.users[userIndex].role);
        db.users[userIndex].status = isSuperAdmin ? 'approved' : (reqStatus || db.users[userIndex].status);
        if (password) db.users[userIndex].password = password;
      } else {
        const newUser = {
          uid,
          email: normalizedEmail,
          display_name: displayName || normalizedEmail.split('@')[0],
          role: userRole,
          status,
          password: password || 'default',
          createdAt: Date.now()
        };
        db.users.push(newUser);
      }

      writeMockDb(db);
      res.json({
        success: true,
        user: {
          uid,
          email: normalizedEmail,
          displayName: displayName || (userIndex > -1 ? db.users[userIndex].display_name : normalizedEmail.split('@')[0]),
          role: userRole,
          status: status
        }
      });
    } catch (e: any) {
      console.error('Error in /api/auth/register:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // C.2 PUT /api/auth/users/:uid (Admin updates user role and status: approve / reject / change role)
  app.put('/api/auth/users/:uid', (req, res) => {
    try {
      const rawUid = req.params.uid;
      const uid = decodeURIComponent(rawUid);
      const { role, status, displayName } = req.body;
      const db = readMockDb();
      if (!db.users) db.users = [];
      const userIndex = db.users.findIndex((u: any) => 
        u.uid === uid || 
        u.email?.toLowerCase() === uid.toLowerCase() || 
        u.email?.replace(/[^a-zA-Z0-9]/g, '_') === uid
      );
      if (userIndex === -1) {
        // If not found yet in mock db, create the user record with the updated info
        const isSuperAdmin = uid.toLowerCase() === 'cyber.kan587@gmail.com';
        const newRecord = {
          uid: uid.includes('@') ? uid.replace(/[^a-zA-Z0-9]/g, '_') : uid,
          email: uid.includes('@') ? uid : `${uid}@local.domain`,
          display_name: displayName || uid.split('@')[0],
          role: isSuperAdmin ? 'Admin' : (role || 'User'),
          status: isSuperAdmin ? 'approved' : (status || 'approved'),
          password: 'default',
          createdAt: Date.now()
        };
        db.users.push(newRecord);
        writeMockDb(db);
        return res.json({ success: true, user: newRecord });
      }

      const isSuperAdmin = db.users[userIndex].email.toLowerCase() === 'cyber.kan587@gmail.com';
      
      if (role && !isSuperAdmin) {
        db.users[userIndex].role = role;
      }
      if (status && !isSuperAdmin) {
        db.users[userIndex].status = status;
      }
      if (displayName) {
        db.users[userIndex].display_name = displayName;
      }

      writeMockDb(db);
      res.json({
        success: true,
        user: {
          uid: db.users[userIndex].uid,
          email: db.users[userIndex].email,
          displayName: db.users[userIndex].display_name,
          role: db.users[userIndex].role,
          status: db.users[userIndex].status
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // C.3 DELETE /api/auth/users/:uid (Admin deletes user)
  app.delete('/api/auth/users/:uid', (req, res) => {
    try {
      const rawUid = req.params.uid;
      const uid = decodeURIComponent(rawUid);
      const db = readMockDb();
      if (!db.users) db.users = [];
      const userIndex = db.users.findIndex((u: any) => 
        u.uid === uid || 
        u.email?.toLowerCase() === uid.toLowerCase() || 
        u.email?.replace(/[^a-zA-Z0-9]/g, '_') === uid
      );
      if (userIndex === -1) {
        return res.json({ success: true, message: "User deleted or not present" });
      }

      if (db.users[userIndex].email.toLowerCase() === 'cyber.kan587@gmail.com') {
        return res.status(400).json({ error: "Impossible de supprimer le compte Super Administrateur." });
      }

      db.users.splice(userIndex, 1);
      writeMockDb(db);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // D. GET /api/d1/pm (Retrieve custom assignments/overrides from Cloudflare D1 or local fallback)
  app.get('/api/d1/pm', async (req, res) => {
    try {
      const cfRows = await queryCloudflareD1('SELECT * FROM pm_assignments');
      if (cfRows && cfRows.length > 0) {
        const mappedRows = cfRows.map((row: any) => ({
          id: row.id,
          "ID": row.site_code || row.id,
          "PM number": row.pm_number,
          "Nom du site": row.site_name,
          "Region": row.region,
          "PM Date": row.planned_date,
          "Types de PM": row.maintenance_type,
          "FE names": row.technician_name,
          "PM date execute": row.executed_date || '',
          "PM date replanifiée": row.reprogrammed_date || '',
          "status": row.status,
          "comments": row.comments || ''
        }));
        return res.json({ success: true, rows: mappedRows, source: 'Cloudflare D1' });
      }

      const db = readMockDb();
      const results = db.pm_assignments || [];
      const mappedRows = results.map((row: any) => ({
        id: row.id,
        "ID": row.site_code || row.id,
        "PM number": row.pm_number,
        "Nom du site": row.site_name,
        "Region": row.region,
        "PM Date": row.planned_date,
        "Types de PM": row.maintenance_type,
        "FE names": row.technician_name,
        "PM date execute": row.executed_date || '',
        "PM date replanifiée": row.reprogrammed_date || '',
        "status": row.status,
        "comments": row.comments || ''
      }));
      res.json({ success: true, rows: mappedRows, source: 'Local Relay' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // E. POST /api/d1/pm (Create/Update custom assignments in Cloudflare D1 and local cache)
  app.post('/api/d1/pm', async (req, res) => {
    try {
      const { id, site_code, pm_number, site_name, region, planned_date, maintenance_type, technician_name, executed_date, reprogrammed_date, status, comments } = req.body;
      const assignmentId = id || 'pm-' + Math.random().toString(36).substring(2, 9);
      
      // 1. Try Cloudflare D1 if configured
      await queryCloudflareD1(`
        INSERT INTO pm_assignments (id, site_code, pm_number, site_name, region, planned_date, maintenance_type, technician_name, executed_date, reprogrammed_date, status, comments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          site_code=excluded.site_code,
          pm_number=excluded.pm_number,
          site_name=excluded.site_name,
          region=excluded.region,
          planned_date=excluded.planned_date,
          maintenance_type=excluded.maintenance_type,
          technician_name=excluded.technician_name,
          executed_date=excluded.executed_date,
          reprogrammed_date=excluded.reprogrammed_date,
          status=excluded.status,
          comments=excluded.comments
      `, [assignmentId, site_code || '', pm_number || '', site_name || '', region || '', planned_date || '', maintenance_type || '', technician_name || '', executed_date || '', reprogrammed_date || '', status || 'Planifié', comments || '']);

      // 2. Always persist in local mock DB for instant reads
      const db = readMockDb();
      if (!db.pm_assignments) db.pm_assignments = [];
      const existingIndex = db.pm_assignments.findIndex((p: any) => p.pm_number === pm_number || p.id === assignmentId);
      if (existingIndex > -1) {
        db.pm_assignments[existingIndex] = {
          ...db.pm_assignments[existingIndex],
          site_code: site_code || db.pm_assignments[existingIndex].site_code,
          site_name: site_name || db.pm_assignments[existingIndex].site_name,
          region: region || db.pm_assignments[existingIndex].region,
          planned_date: planned_date || db.pm_assignments[existingIndex].planned_date,
          maintenance_type: maintenance_type || db.pm_assignments[existingIndex].maintenance_type,
          technician_name: technician_name || db.pm_assignments[existingIndex].technician_name,
          executed_date: executed_date !== undefined ? executed_date : db.pm_assignments[existingIndex].executed_date,
          reprogrammed_date: reprogrammed_date !== undefined ? reprogrammed_date : db.pm_assignments[existingIndex].reprogrammed_date,
          status: status || db.pm_assignments[existingIndex].status,
          comments: comments !== undefined ? comments : db.pm_assignments[existingIndex].comments
        };
      } else {
        db.pm_assignments.push({
          id: assignmentId,
          site_code,
          pm_number,
          site_name,
          region,
          planned_date,
          maintenance_type,
          technician_name,
          executed_date: executed_date || '',
          reprogrammed_date: reprogrammed_date || '',
          status: status || 'Planifié',
          comments: comments || ''
        });
      }
      
      writeMockDb(db);
      res.json({ success: true, message: "Planning PM synchronisé avec succès (D1 & Local)." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // F. POST /api/d1/sync-daily (Create/Update daily raw data)
  app.post('/api/d1/sync-daily', async (req, res) => {
    try {
      const items = Array.isArray(req.body) ? req.body : [req.body];
      const db = readMockDb();
      if (!db.daily_raw_data) {
        db.daily_raw_data = [];
      }

      for (const item of items) {
        const { id, site_code, pm_number, site_name, region, planned_date, maintenance_type, technician_name, executed_date, reprogrammed_date, status, comments } = item;
        const recordId = id || 'raw-' + Math.random().toString(36).substring(2, 9);
        
        const existingIndex = db.daily_raw_data.findIndex((p: any) => p.pm_number === pm_number || p.id === recordId);
        if (existingIndex > -1) {
          db.daily_raw_data[existingIndex] = {
            ...db.daily_raw_data[existingIndex],
            site_code: site_code || db.daily_raw_data[existingIndex].site_code,
            site_name: site_name || db.daily_raw_data[existingIndex].site_name,
            region: region || db.daily_raw_data[existingIndex].region,
            planned_date: planned_date || db.daily_raw_data[existingIndex].planned_date,
            maintenance_type: maintenance_type || db.daily_raw_data[existingIndex].maintenance_type,
            technician_name: technician_name || db.daily_raw_data[existingIndex].technician_name,
            executed_date: executed_date !== undefined ? executed_date : db.daily_raw_data[existingIndex].executed_date,
            reprogrammed_date: reprogrammed_date !== undefined ? reprogrammed_date : db.daily_raw_data[existingIndex].reprogrammed_date,
            status: status || db.daily_raw_data[existingIndex].status,
            comments: comments !== undefined ? comments : db.daily_raw_data[existingIndex].comments,
            imported_at: new Date().toISOString()
          };
        } else {
          db.daily_raw_data.push({
            id: recordId,
            site_code,
            pm_number,
            site_name,
            region,
            planned_date,
            maintenance_type,
            technician_name,
            executed_date: executed_date || '',
            reprogrammed_date: reprogrammed_date || '',
            status: status || 'Planifié',
            comments: comments || '',
            imported_at: new Date().toISOString()
          });
        }
      }
      
      writeMockDb(db);
      res.json({ success: true, count: items.length, message: "Données brutes journalières synchronisées avec succès." });

      // Background async sync to remote Cloudflare D1 if configured
      (async () => {
        const config = getCloudflareD1Config();
        if (!config || cfAuthFailed) return;
        const topItems = items.slice(0, 50);
        for (const item of topItems) {
          const { id, site_code, pm_number, site_name, region, planned_date, maintenance_type, technician_name, executed_date, reprogrammed_date, status, comments } = item;
          const recordId = id || 'raw-' + Math.random().toString(36).substring(2, 9);
          await queryCloudflareD1(`
            INSERT INTO daily_raw_data (id, site_code, pm_number, site_name, region, planned_date, maintenance_type, technician_name, executed_date, reprogrammed_date, status, comments, imported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              site_code=excluded.site_code,
              pm_number=excluded.pm_number,
              site_name=excluded.site_name,
              region=excluded.region,
              planned_date=excluded.planned_date,
              maintenance_type=excluded.maintenance_type,
              technician_name=excluded.technician_name,
              executed_date=excluded.executed_date,
              reprogrammed_date=excluded.reprogrammed_date,
              status=excluded.status,
              comments=excluded.comments,
              imported_at=excluded.imported_at
          `, [recordId, site_code || '', pm_number || '', site_name || '', region || '', planned_date || '', maintenance_type || '', technician_name || '', executed_date || '', reprogrammed_date || '', status || 'Planifié', comments || '', new Date().toISOString()]);
        }
      })().catch(err => {
        console.warn('Background daily_raw_data sync to Cloudflare D1 notice:', err?.message || err);
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // G. GET /api/d1/sync-daily (Retrieve custom assignments/overrides from D1)
  app.get('/api/d1/sync-daily', async (req, res) => {
    try {
      const cfRows = await queryCloudflareD1('SELECT * FROM daily_raw_data');
      if (cfRows && cfRows.length > 0) {
        const mappedRows = cfRows.map((row: any) => ({
          id: row.id,
          "ID": row.site_code || row.id,
          "PM number": row.pm_number,
          "Nom du site": row.site_name,
          "Region": row.region,
          "PM Date": row.planned_date,
          "Types de PM": row.maintenance_type,
          "FE names": row.technician_name,
          "PM date execute": row.executed_date || '',
          "PM date replanifiée": row.reprogrammed_date || '',
          "status": row.status,
          "comments": row.comments || ''
        }));
        return res.json({ success: true, rows: mappedRows, source: 'Cloudflare D1' });
      }

      const db = readMockDb();
      const results = db.daily_raw_data || [];
      const mappedRows = results.map((row: any) => ({
        id: row.id,
        "ID": row.site_code || row.id,
        "PM number": row.pm_number,
        "Nom du site": row.site_name,
        "Region": row.region,
        "PM Date": row.planned_date,
        "Types de PM": row.maintenance_type,
        "FE names": row.technician_name,
        "PM date execute": row.executed_date || '',
        "PM date replanifiée": row.reprogrammed_date || '',
        "status": row.status,
        "comments": row.comments || ''
      }));
      res.json({ success: true, rows: mappedRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // H. GET /api/d1/global-files
  app.get('/api/d1/global-files', async (req, res) => {
    try {
      // 1. PRIMARY: Always query remote Cloudflare D1 first when configured
      const cfRows = await fetchCloudflareD1AllGlobalFiles();
      if (cfRows && cfRows.length > 0) {
        const rows = cfRows.map((r: any) => {
          try { 
            return typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : (r.data || r); 
          } catch { 
            return null; 
          }
        }).filter((r: any) => r !== null);

        // Keep local relay in sync with the real D1 data
        try {
          const db = readMockDb();
          db.global_files = cfRows;
          writeMockDb(db);
        } catch { /* ignore */ }

        return res.json({ success: true, rows, source: 'Cloudflare D1' });
      }

      // 2. SECONDARY: Fallback to local relay if Cloudflare is not reachable or empty
      const db = readMockDb();
      let results = db.global_files || [];
      if (results.length > 0) {
        const rows = results.map((r: any) => {
          try { 
            return typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : (r.data || r); 
          } catch { 
            return null; 
          }
        }).filter((r: any) => r !== null);
        return res.json({ success: true, rows, source: 'Local Relay' });
      }

      // 3. TERTIARY: Fallback to pm_assignments
      if (db.pm_assignments && db.pm_assignments.length > 0) {
        results = db.pm_assignments.map((row: any) => ({
          id: row.id,
          swo_number: row.site_code || row.id,
          pm_number: row.pm_number,
          raw_json: JSON.stringify({
            "ID": row.site_code || row.id,
            "PM number": row.pm_number,
            "Nom du site": row.site_name,
            "Region": row.region,
            "PM Date": row.planned_date,
            "Types de PM": row.maintenance_type,
            "FE names": row.technician_name,
            "PM date execute": row.executed_date || '',
            "PM date replanifiée": row.reprogrammed_date || '',
            "status": row.status,
            "comments": row.comments || ''
          }),
          updated_at: new Date().toISOString()
        }));
      }

      const rows = results.map((r: any) => {
        try { return JSON.parse(r.raw_json); } catch { return null; }
      }).filter((r: any) => r !== null);
      res.json({ success: true, rows, source: 'Local Relay' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // I. POST /api/d1/global-files
  app.post('/api/d1/global-files', async (req, res) => {
    try {
      const items = Array.isArray(req.body) ? req.body : [req.body];
      const db = readMockDb();
      
      db.global_files = items.map((item: any) => ({
        id: item["N° SWO"] ? `swo-${String(item["N° SWO"]).trim()}` : (item["PM number"] ? `pm-${String(item["PM number"]).trim()}` : ('row-' + Math.random().toString(36).substring(2, 9))),
        swo_number: item["N° SWO"] || '',
        pm_number: item["PM number"] || '',
        raw_json: JSON.stringify(item),
        updated_at: new Date().toISOString()
      }));
      
      writeMockDb(db);
      res.json({ success: true, count: items.length });

      // Background async persist to Cloudflare D1 if configured
      (async () => {
        const config = getCloudflareD1Config();
        if (!config || cfAuthFailed) return;
        
        // Incremental UPSERT into Cloudflare D1: updates existing rows by ID/SWO and adds new ones
        const BULK_CHUNK_SIZE = 50;
        for (let i = 0; i < items.length; i += BULK_CHUNK_SIZE) {
          const chunk = items.slice(i, i + BULK_CHUNK_SIZE);
          const nowIso = new Date().toISOString();
          
          const rowsToInsert = chunk.map((it: any, idx: number) => {
            const swo = it["N° SWO"] ? String(it["N° SWO"]).trim() : '';
            const pm = it["PM number"] ? String(it["PM number"]).trim() : '';
            const rowId = swo ? `swo-${swo}` : (pm ? `pm-${pm}` : `row-${i + idx}-${Math.random().toString(36).substring(2, 7)}`);
            return [rowId, swo, pm, JSON.stringify(it), nowIso];
          });

          const placeholders = rowsToInsert.map(() => "(?, ?, ?, ?, ?)").join(", ");
          const params = rowsToInsert.flat();
          await queryCloudflareD1(
            `INSERT OR REPLACE INTO global_files (id, swo_number, pm_number, raw_json, updated_at) VALUES ${placeholders}`,
            params
          );
        }
      })().catch(err => {
        console.warn('Background global_files sync to Cloudflare D1 notice:', err?.message || err);
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // J. GET /api/d1/comments (Retrieve comments from mock database or Cloudflare D1)
  app.get('/api/d1/comments', async (req, res) => {
    try {
      const cfRows = await queryCloudflareD1('SELECT * FROM manual_comments');
      if (cfRows && cfRows.length > 0) {
        return res.json({ success: true, comments: cfRows, source: 'Cloudflare D1' });
      }

      const db = readMockDb();
      const comments = db.manual_comments || [];
      res.json({ success: true, comments });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // K. POST /api/d1/comments (Create/Update manual comment in Cloudflare D1 and local database)
  app.post('/api/d1/comments', async (req, res) => {
    try {
      const { site_id, category, comment } = req.body;
      const commentId = `${site_id}_${category}`.replace(/[^a-zA-Z0-9_]/g, '_');
      
      await queryCloudflareD1(`
        INSERT INTO manual_comments (id, site_id, category, comment, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          comment=excluded.comment,
          updated_at=excluded.updated_at
      `, [commentId, site_id || '', category || '', comment || '', Date.now()]);

      const db = readMockDb();
      if (!db.manual_comments) {
        db.manual_comments = [];
      }
      const existingIdx = db.manual_comments.findIndex((c: any) => c.site_id === site_id && c.category === category);
      if (existingIdx > -1) {
        db.manual_comments[existingIdx] = {
          site_id,
          category,
          comment,
          updated_at: Date.now()
        };
      } else {
        db.manual_comments.push({
          site_id,
          category,
          comment,
          updated_at: Date.now()
        });
      }
      writeMockDb(db);
      res.json({ success: true, message: "Commentaire enregistré avec succès (D1 & Local)." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/retable/workspaces', async (req, res) => {
    try {
      const apiKey = (req.headers['x-api-key'] as string) || process.env.RETABLE_API_KEY || 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM';
      
      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM') {
        console.log('Using default key - returning STHIC Workspace');
        return res.json({
          isSthicLive: true,
          data: {
            workspaces: [
              { id: 'ws-sthic-live', name: 'STHIC Production' }
            ]
          }
        });
      }

      const response = await fetch('https://api.retable.io/v1/public/workspaces', {
        headers: { 'ApiKey': apiKey }
      });
      if (!response.ok) {
        throw new Error(`Retable API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching workspaces, using demo fallback:', error);
      res.json({
        isDemo: true,
        data: {
          workspaces: [
            { id: 'ws-demo-01', name: 'Espace Démo - Suivi PM Retable (Fallback)' }
          ]
        }
      });
    }
  });

  app.get('/api/retable/projects', async (req, res) => {
    try {
      const apiKey = (req.headers['x-api-key'] as string) || process.env.RETABLE_API_KEY || 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM';
      const { workspaceId } = req.query;

      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' || workspaceId === 'ws-sthic-live') {
        return res.json({
          isSthicLive: true,
          data: {
            projects: [
              { id: 'proj-sthic-live', name: 'Suivi PM & Maintenances' }
            ]
          }
        });
      }

      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' || workspaceId === 'ws-demo-01') {
        return res.json({
          isDemo: true,
          data: {
            projects: [
              { id: 'proj-demo-01', name: 'Projet Maintenance Télécom 2026' }
            ]
          }
        });
      }

      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId is required' });
      }
      const response = await fetch(`https://api.retable.io/v1/public/workspaces/${workspaceId}/projects`, {
        headers: { 'ApiKey': apiKey }
      });
      if (!response.ok) {
        throw new Error(`Retable API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching projects, using demo fallback:', error);
      res.json({
        isDemo: true,
        data: {
          projects: [
            { id: 'proj-demo-01', name: 'Projet Maintenance Télécom 2026 (Fallback)' }
          ]
        }
      });
    }
  });

  app.get('/api/retable/tables', async (req, res) => {
    try {
      const apiKey = (req.headers['x-api-key'] as string) || process.env.RETABLE_API_KEY || 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM';
      const { projectId } = req.query;

      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' || projectId === 'proj-sthic-live') {
        return res.json({
          isSthicLive: true,
          data: {
            tables: [
              { id: 'tab-sthic-live', title: 'Planification PM (STHIC Live)' }
            ]
          }
        });
      }

      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' || projectId === 'proj-demo-01') {
        return res.json({
          isDemo: true,
          data: {
            tables: [
              { id: 'tab-demo-01', title: 'Suivi PM Sénégal Global' }
            ]
          }
        });
      }

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }
      const response = await fetch(`https://api.retable.io/v1/public/projects/${projectId}/tables`, {
        headers: { 'ApiKey': apiKey }
      });
      if (!response.ok) {
        throw new Error(`Retable API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching tables, using demo fallback:', error);
      res.json({
        isDemo: true,
        data: {
          tables: [
            { id: 'tab-demo-01', title: 'Suivi PM Sénégal Global (Fallback)' }
          ]
        }
      });
    }
  });

  app.get('/api/retable/data', async (req, res) => {
    try {
      const apiKey = (req.headers['x-api-key'] as string) || process.env.RETABLE_API_KEY || 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM';
      const { retableId } = req.query;

      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' || retableId === 'tab-sthic-live') {
        console.log('Fetching live PM data from sthic-maintenances-generateurs.pages.dev');
        
        // 1. Fetch PM assignments
        const assignmentsRes = await fetch('https://sthic-maintenances-generateurs.pages.dev/api/pm-assignments', {
          headers: { 'x-api-key': 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' }
        });
        if (!assignmentsRes.ok) {
          throw new Error(`Failed to fetch assignments from STHIC API: ${assignmentsRes.status}`);
        }
        const assignmentsJson = await assignmentsRes.json();
        const assignments = assignmentsJson.assignments || [];

        // 2. Fetch Sites to map Site Name
        const sitesMap = new Map();
        try {
          const sitesRes = await fetch('https://sthic-maintenances-generateurs.pages.dev/api/sites', {
            headers: { 'x-api-key': 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' }
          });
          if (sitesRes.ok) {
            const sitesJson = await sitesRes.json();
            const sitesList = sitesJson.sites || [];
            sitesList.forEach((site: any) => {
              if (site.id) {
                sitesMap.set(String(site.id), site.nameSite || site.idSite || '');
              }
            });
          }
        } catch (siteErr) {
          console.error("Error fetching sites map:", siteErr);
        }

        // 3. Map to standard flat PM lines compatible with normalized keys
        const rows = assignments.map((asg: any) => {
          const siteName = sitesMap.get(String(asg.siteId)) || asg.siteCode || 'Site Inconnu';
          
          // Determine status translation
          let statusText = 'Planifié';
          if (asg.pmState === 'Closed Complete' || asg.closedAt) {
            statusText = 'Exécuté';
          } else if (asg.reprogrammationDate) {
            statusText = 'Replanifié';
          } else {
            // Check if plannedDate is in the past
            const pDate = new Date(asg.plannedDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (pDate < today) {
              statusText = 'En retard';
            }
          }

          return {
            id: asg.id,
            "ID": asg.siteCode || asg.siteId,
            "PM number": asg.pmNumber,
            "Nom du site": siteName,
            "Region": asg.zone || '',
            "PM Date": asg.plannedDate || '',
            "Types de PM": asg.maintenanceType || '',
            "FE names": asg.technicianName || '',
            "PM date execute": asg.closedAt || '',
            "PM date replanifiée": asg.reprogrammationDate || '',
            "status": statusText
          };
        });

        console.log(`Successfully mapped ${rows.length} PM assignments from STHIC live API`);
        return res.json({ success: true, isSthicLive: true, rows });
      }

      const demoRows = [
        {
          id: "row-01",
          cell_values: {
            "ID": "SITE_DK_01",
            "PM number": "PM-2026-1001",
            "Nom du site": "Site Dakar Plateau",
            "Region": "DAKAR",
            "PM Date": "2026-07-23",
            "Types de PM": "Trimestrielle",
            "FE names": "Ibrahima Ndiaye",
            "PM date execute": "2026-07-23",
            "PM date replanifiée": "",
            "status": "Exécuté"
          }
        },
        {
          id: "row-02",
          cell_values: {
            "ID": "SITE_TH_02",
            "PM number": "PM-2026-1002",
            "Nom du site": "Site Thiès Gare",
            "Region": "THIES",
            "PM Date": "2026-07-23",
            "Types de PM": "Semestrielle",
            "FE names": "Moustapha Diop",
            "PM date execute": "",
            "PM date replanifiée": "",
            "status": "Planifié"
          }
        },
        {
          id: "row-03",
          cell_values: {
            "ID": "SITE_SL_03",
            "PM number": "PM-2026-1003",
            "Nom du site": "Site Saint-Louis Nord",
            "Region": "SAINT-LOUIS",
            "PM Date": "2026-07-23",
            "Types de PM": "Annuelle",
            "FE names": "Amadou Sow",
            "PM date execute": "",
            "PM date replanifiée": "2026-07-25",
            "status": "Replanifié"
          }
        },
        {
          id: "row-04",
          cell_values: {
            "ID": "SITE_ZG_04",
            "PM number": "PM-2026-1004",
            "Nom du site": "Site Ziguinchor Centre",
            "Region": "ZIGUINCHOR",
            "PM Date": "2026-07-23",
            "Types de PM": "Mensuelle",
            "FE names": "Fatou Fall",
            "PM date execute": "",
            "PM date replanifiée": "",
            "status": "En retard"
          }
        },
        {
          id: "row-05",
          cell_values: {
            "ID": "SITE_KL_05",
            "PM number": "PM-2026-1005",
            "Nom du site": "Site Kaolack Marché",
            "Region": "KAOLACK",
            "PM Date": "2026-07-23",
            "Types de PM": "Trimestrielle",
            "FE names": "Ousmane Cissé",
            "PM date execute": "2026-07-23",
            "PM date replanifiée": "",
            "status": "Exécuté"
          }
        },
        {
          id: "row-06",
          cell_values: {
            "ID": "SITE_DK_06",
            "PM number": "PM-2026-1006",
            "Nom du site": "Site Dakar Almadies",
            "Region": "DAKAR",
            "PM Date": "2026-07-24",
            "Types de PM": "Trimestrielle",
            "FE names": "Ibrahima Ndiaye",
            "PM date execute": "",
            "PM date replanifiée": "",
            "status": "Planifié"
          }
        },
        {
          id: "row-07",
          cell_values: {
            "ID": "SITE_TH_07",
            "PM number": "PM-2026-1007",
            "Nom du site": "Site Thiès Route",
            "Region": "THIES",
            "PM Date": "2026-07-22",
            "Types de PM": "Mensuelle",
            "FE names": "Moustapha Diop",
            "PM date execute": "2026-07-22",
            "PM date replanifiée": "",
            "status": "Exécuté"
          }
        }
      ];

      if (apiKey === 'Si6JXVXPpNJ1xS7-IfS43OJUfrzlGUqeXY-A-IhFHHCnKwMVgF5xKfAn-dBZTGKM' || retableId === 'tab-demo-01') {
        const rows = demoRows.map((row: any) => {
          const flatRow: any = { id: row.id };
          Object.keys(row.cell_values).forEach((key) => {
            flatRow[key] = (row.cell_values as any)[key];
          });
          return flatRow;
        });
        return res.json({ success: true, isDemo: true, rows });
      }

      if (!retableId) {
        return res.status(400).json({ error: 'retableId is required' });
      }
      const apiUrl = `https://api.retable.io/v1/public/retable/${retableId}/data`;
      console.log(`Fetching Retable data from: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: { 'ApiKey': apiKey }
      });
      if (!response.ok) {
        throw new Error(`Retable API error: ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      
      let rawRows = [];
      if (json && json.data && Array.isArray(json.data.rows)) {
        rawRows = json.data.rows;
      } else if (json && Array.isArray(json.rows)) {
        rawRows = json.rows;
      } else if (Array.isArray(json)) {
        rawRows = json;
      }

      const rows = rawRows.map((row: any) => {
        const flatRow: any = { id: row.row_id || row.id };
        if (Array.isArray(row.columns)) {
          row.columns.forEach((col: any) => {
            if (col && col.name) {
              flatRow[col.name] = col.val;
            }
          });
        } else if (row.cell_values) {
          Object.keys(row.cell_values).forEach((key) => {
            flatRow[key] = row.cell_values[key];
          });
        } else {
          Object.keys(row).forEach((k) => {
            if (k !== 'columns' && k !== 'cell_values') {
              flatRow[k] = row[k];
            }
          });
        }
        return flatRow;
      });

      res.json({ success: true, rows });
    } catch (error: any) {
      console.error('Error fetching table data, using demo fallback:', error);
      const fallbackRows = [
        {
          id: "row-01",
          "ID": "SITE_DK_01",
          "PM number": "PM-2026-1001",
          "Nom du site": "Site Dakar Plateau",
          "Region": "DAKAR",
          "PM Date": "2026-07-23",
          "Types de PM": "Trimestrielle",
          "FE names": "Ibrahima Ndiaye",
          "PM date execute": "2026-07-23",
          "PM date replanifiée": "",
          "status": "Exécuté"
        },
        {
          id: "row-02",
          "ID": "SITE_TH_02",
          "PM number": "PM-2026-1002",
          "Nom du site": "Site Thiès Gare",
          "Region": "THIES",
          "PM Date": "2026-07-23",
          "Types de PM": "Semestrielle",
          "FE names": "Moustapha Diop",
          "PM date execute": "",
          "PM date replanifiée": "",
          "status": "Planifié"
        }
      ];
      res.json({ success: true, isDemo: true, rows: fallbackRows });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
        watch: {
          ignored: ['**/server-debug.log']
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Set server timeouts to handle large uploads (though mostly handled by Firebase now)
  serverInstance.timeout = 600000; // 10 minutes
  serverInstance.keepAliveTimeout = 65000;
  serverInstance.headersTimeout = 66000;
}

startServer();
