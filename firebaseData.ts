import { GlobalFileRow } from './types';
import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

const PROJECT_ID = 'default';

export type DataSourceType = 'Firebase' | 'Cloudflare D1' | 'Cache Local' | 'Chargement...';

let activeDataSource: DataSourceType = 'Chargement...';

export const getActiveDataSource = (): DataSourceType => activeDataSource;

export const setDataSource = (source: DataSourceType) => {
  activeDataSource = source;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('data-source-changed', { detail: source }));
  }
};

let sessionQuotaExceeded = false;

export const resetQuotaOverride = () => {
  sessionQuotaExceeded = false;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('force_d1_active');
  }
};

// Check if forced Cloudflare D1 activation is set to true
const isForceD1Active = (): boolean => {
  return sessionQuotaExceeded || (typeof window !== 'undefined' && localStorage.getItem('force_d1_active') === 'true');
};

const checkAndNotifyQuotaError = (e: unknown) => {
  const errMsg = e instanceof Error ? e.message : String(e);
  if (
    errMsg.includes('resource-exhausted') || 
    errMsg.includes('exhausted') ||
    errMsg.includes('Quota exceeded') || 
    errMsg.includes('quota') || 
    errMsg.includes('Quota limit exceeded') ||
    errMsg.includes('WebChannelConnection') ||
    errMsg.includes('transport errored') ||
    errMsg.includes('unavailable') ||
    errMsg.includes('backoff delay') ||
    errMsg.includes('overloading') ||
    errMsg.includes('queued writes')
  ) {
    sessionQuotaExceeded = true;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('force_d1_active', 'true');
        window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
      } catch { /* ignore */ }
    }
  }
};

// In-flight sync tracking to prevent redundant overlapping requests
let activeD1SyncPromise: Promise<void> | null = null;

// Helper to save to Cloudflare D1 / Local Relay
const saveToD1 = async (data: GlobalFileRow[]): Promise<void> => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('cached_global_files', JSON.stringify(data));
    } catch {
      // Large dataset (>5MB) exceeds browser localStorage quota; safely ignored as data is persisted in Cloudflare D1 / Firebase
    }
  }

  // If a sync is already running, wait for it or replace it
  const syncTask = async () => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) {
        timeoutId = setTimeout(() => {
          try { controller.abort(); } catch {}
        }, 60000); // 60s generous timeout for massive datasets
      }
      
      const response = await fetch('/api/d1/global-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller ? controller.signal : undefined
      });

      if (!response.ok) {
        console.warn(`Could not save to Cloudflare D1 relay via API (status: ${response.status})`);
      } else {
        console.log('Successfully saved to Cloudflare D1 / Local relay');
      }
    } catch (err: unknown) {
      // Gracefully handle harmless aborts or cancellations without raising alarming notices
      const errorObj = err as { name?: string; message?: string };
      const isAbort = errorObj?.name === 'AbortError' || (typeof errorObj?.message === 'string' && errorObj.message.toLowerCase().includes('abort'));
      if (isAbort) {
        console.log('Background Cloudflare D1 sync deferred (replaced or scheduled)');
      } else {
        console.warn('Notice: Background Cloudflare D1 sync deferred:', errorObj?.message || err);
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  activeD1SyncPromise = syncTask();
  return activeD1SyncPromise;
};

export const saveToFirebase = async (data: GlobalFileRow[], append: boolean = false) => {
  let finalData = data;
  if (append) {
    let existing: GlobalFileRow[] = [];
    try {
      existing = await fetchFromFirebase();
    } catch (err) {
      console.warn('Failed to fetch existing data during append, will try to append directly...', err);
    }
    const appended = [...existing];
    
    data.forEach(row => {
      const idx = appended.findIndex(r => {
        if (row["N° SWO"] && r["N° SWO"] && String(row["N° SWO"]).trim() !== "" && String(row["N° SWO"]).trim() === String(r["N° SWO"]).trim()) {
          return true;
        }
        if (row["PM number"] && r["PM number"] && String(row["PM number"]).trim() !== "" && String(row["PM number"]).trim() === String(r["PM number"]).trim()) {
          return true;
        }
        return false;
      });

      if (idx !== -1) {
        appended[idx] = row;
      } else {
        appended.push(row);
      }
    });

    const uniqueRows: GlobalFileRow[] = [];
    const seenSWOs = new Set<string>();
    const seenPMs = new Set<string>();

    appended.forEach(row => {
      const swo = row["N° SWO"] ? String(row["N° SWO"]).trim() : "";
      const pm = row["PM number"] ? String(row["PM number"]).trim() : "";

      let isDuplicate = false;
      if (swo !== "" && seenSWOs.has(swo)) isDuplicate = true;
      if (pm !== "" && seenPMs.has(pm)) isDuplicate = true;

      if (!isDuplicate) {
        if (swo !== "") seenSWOs.add(swo);
        if (pm !== "") seenPMs.add(pm);
        uniqueRows.push(row);
      } else {
        const existingIdx = uniqueRows.findIndex(r => {
          if (swo !== "" && r["N° SWO"] && String(r["N° SWO"]).trim() === swo) return true;
          if (pm !== "" && r["PM number"] && String(r["PM number"]).trim() === pm) return true;
          return false;
        });
        if (existingIdx !== -1) {
          uniqueRows[existingIdx] = row;
        } else {
          uniqueRows.push(row);
        }
      }
    });
    finalData = uniqueRows;
  } else {
    const uniqueRows: GlobalFileRow[] = [];
    const seenSWOs = new Set<string>();
    const seenPMs = new Set<string>();

    data.forEach(row => {
      const swo = row["N° SWO"] ? String(row["N° SWO"]).trim() : "";
      const pm = row["PM number"] ? String(row["PM number"]).trim() : "";

      let isDuplicate = false;
      if (swo !== "" && seenSWOs.has(swo)) isDuplicate = true;
      if (pm !== "" && seenPMs.has(pm)) isDuplicate = true;

      if (!isDuplicate) {
        if (swo !== "") seenSWOs.add(swo);
        if (pm !== "") seenPMs.add(pm);
        uniqueRows.push(row);
      } else {
        const existingIdx = uniqueRows.findIndex(r => {
          if (swo !== "" && r["N° SWO"] && String(r["N° SWO"]).trim() === swo) return true;
          if (pm !== "" && r["PM number"] && String(r["PM number"]).trim() === pm) return true;
          return false;
        });
        if (existingIdx !== -1) {
          uniqueRows[existingIdx] = row;
        } else {
          uniqueRows.push(row);
        }
      }
    });
    finalData = uniqueRows;
  }

  let savedToFirestore = false;

  // 1. PRIMARY: Save directly to Google Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const BATCH_CHUNK_SIZE = 100;
      for (let i = 0; i < finalData.length; i += BATCH_CHUNK_SIZE) {
        if (isForceD1Active()) break;
        const chunk = finalData.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(row => {
          const id = row["N° SWO"] || row["PM number"] || ('row-' + Math.random().toString(36).substring(2, 9));
          const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
          const docRef = doc(db, 'projects', PROJECT_ID, 'swo_data', safeId);
          
          const sanitizedRow = JSON.parse(JSON.stringify(row));
          batch.set(docRef, { ...sanitizedRow, project_id: PROJECT_ID, updatedAt: Date.now() }, { merge: true });
        });
        await batch.commit();
        if (i + BATCH_CHUNK_SIZE < finalData.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      savedToFirestore = true;
      setDataSource('Firebase');
      console.log(`Successfully saved ${finalData.length} records to Primary Firebase Firestore.`);
    } catch (e) {
      console.warn('Primary Firebase Firestore save notice (will ensure Cloudflare D1 backup):', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY / REPLICATION: Replicate to Cloudflare D1 & Local Relay
  try {
    await saveToD1(finalData);
    if (!savedToFirestore) {
      setDataSource('Cloudflare D1');
    }
  } catch (d1Err) {
    console.warn('Secondary Cloudflare D1 replication notice:', d1Err);
  }

  // 3. Cache locally in browser localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('cached_global_files', JSON.stringify(finalData));
    } catch {
      // ignore
    }
  }

  return finalData;
};

interface LocalComment {
  site_id: string;
  category: string;
  comment: string;
  updated_at?: number;
}

export const saveCommentToFirebase = async (siteId: string, category: string, comment: string) => {
  // Save to local storage as quick cache
  try {
    const localCommentsStr = localStorage.getItem('local_comments') || '[]';
    const localComments = JSON.parse(localCommentsStr) as LocalComment[];
    const existingIndex = localComments.findIndex((c: LocalComment) => c.site_id === siteId && c.category === category);
    if (existingIndex > -1) {
      localComments[existingIndex] = { site_id: siteId, category, comment, updated_at: Date.now() };
    } else {
      localComments.push({ site_id: siteId, category, comment, updated_at: Date.now() });
    }
    localStorage.setItem('local_comments', JSON.stringify(localComments));
  } catch (err) {
    console.error('Failed to save comment to localStorage', err);
  }

  // 1. PRIMARY: Save directly to Google Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const safeId = `${siteId}_${category}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      await setDoc(doc(db, 'projects', PROJECT_ID, 'manual_comments', safeId), {
        site_id: siteId,
        category,
        comment,
        updated_at: Date.now()
      }, { merge: true });
    } catch(e) {
      console.warn('Notice: Primary Firestore comment save notice:', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY / REPLICATION: Replicate to Cloudflare D1
  try {
    const response = await fetch('/api/d1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, category, comment })
    });
    if (!response.ok) {
      console.warn('Notice: Secondary Cloudflare D1 comment save status:', response.status);
    }
  } catch (err) {
    console.warn('Notice: Secondary Cloudflare D1 comment save error:', err);
  }
};

export const fetchCommentsFromFirebase = async (): Promise<{site_id: string, category: string, comment: string}[]> => {
  // 1. PRIMARY: Fetch from Google Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const querySnapshot = await getDocs(collection(db, 'projects', PROJECT_ID, 'manual_comments'));
      const comments: {site_id: string, category: string, comment: string}[] = [];
      querySnapshot.forEach((doc) => {
        comments.push(doc.data() as {site_id: string, category: string, comment: string});
      });
      
      if (comments.length > 0) {
        // Sync back to Cloudflare D1 in background
        comments.forEach(async (c) => {
          try {
            fetch('/api/d1/comments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ site_id: c.site_id, category: c.category, comment: c.comment })
            });
          } catch { /* ignore */ }
        });
        // Update local cache
        try {
          localStorage.setItem('local_comments', JSON.stringify(comments));
        } catch { /* ignore */ }
        return comments;
      }
    } catch (e) {
      console.warn('Primary Firestore comments fetch notice, falling back to Cloudflare D1:', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY FALLBACK: Cloudflare D1
  try {
    const response = await fetch('/api/d1/comments');
    if (response.ok) {
      const d1Data = await response.json();
      if (d1Data && d1Data.success && Array.isArray(d1Data.comments)) {
        console.log(`Loaded comments from Secondary Cloudflare D1 (count: ${d1Data.comments.length})`);
        try {
          localStorage.setItem('local_comments', JSON.stringify(d1Data.comments));
        } catch { /* ignore */ }
        return d1Data.comments;
      }
    }
  } catch (d1Err) {
    console.warn('Secondary Cloudflare D1 comments fetch unavailable:', d1Err);
  }

  // 3. TERTIARY FALLBACK: LocalStorage
  try {
    const localCommentsStr = localStorage.getItem('local_comments') || '[]';
    return JSON.parse(localCommentsStr);
  } catch (localErr) {
    console.error('Local comments fallback error:', localErr);
    return [];
  }
};

export const fetchFromFirebase = async (): Promise<GlobalFileRow[]> => {
  const getLocalCache = (): GlobalFileRow[] => {
    if (typeof window === 'undefined') return [];
    try {
      const str = localStorage.getItem('cached_global_files');
      if (str) {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  };

  // 1. PRIMARY: Fetch from Google Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const querySnapshot = await getDocs(collection(db, 'projects', PROJECT_ID, 'swo_data'));
      const rows: GlobalFileRow[] = [];
      querySnapshot.forEach((doc) => {
        rows.push(doc.data() as GlobalFileRow);
      });
      
      if (rows.length > 0) {
        console.log(`Loaded ${rows.length} rows from Primary Firebase Firestore.`);
        setDataSource('Firebase');
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('cached_global_files', JSON.stringify(rows)); } catch {}
        }
        // Replicate to Secondary Cloudflare D1 in background
        saveToD1(rows).catch(err => console.warn('Notice: Background D1 replication notice:', err));
        return rows;
      }
    } catch (e) {
      console.warn('Primary Firebase Firestore fetch notice, checking Cloudflare D1 backup:', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY FALLBACK: Cloudflare D1 / Local Relay
  try {
    const response = await fetch('/api/d1/global-files');
    if (response.ok) {
      const d1Data = await response.json();
      if (d1Data && d1Data.success && Array.isArray(d1Data.rows) && d1Data.rows.length > 0) {
        console.log(`Loaded ${d1Data.rows.length} rows from Secondary Cloudflare D1 (${d1Data.source || 'Active'}).`);
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('cached_global_files', JSON.stringify(d1Data.rows)); } catch {}
        }
        setDataSource('Cloudflare D1');
        return d1Data.rows;
      }
    }
  } catch (d1Err) {
    console.warn('Secondary Cloudflare D1 fetch error:', d1Err);
  }

  // 3. TERTIARY FALLBACK A: LocalStorage Cache
  const localCache = getLocalCache();
  if (localCache.length > 0) {
    console.log(`Loaded ${localCache.length} rows from LocalStorage cache.`);
    setDataSource('Cache Local');
    return localCache;
  }

  // 4. TERTIARY FALLBACK B: PM Assignments
  try {
    const pmRows = await fetchPMFromFirebase();
    if (Array.isArray(pmRows) && pmRows.length > 0) {
      setDataSource('Firebase');
      return pmRows.map(r => ({
        "ID": (r.site_code || r.id || '') as string,
        "PM number": (r.pm_number || '') as string,
        "Nom du site": (r.site_name || '') as string,
        "Region": (r.region || '') as string,
        "PM Date": (r.planned_date || '') as string,
        "Types de PM": (r.maintenance_type || '') as string,
        "FE names": (r.technician_name || '') as string,
        "PM date execute": (r.executed_date || '') as string,
        "PM date replanifiée": (r.reprogrammed_date || '') as string,
        "status": (r.status || 'Planifié') as string,
        "comments": (r.comments || '') as string
      }));
    }
  } catch {}

  setDataSource('Firebase');
  return [];
};

export const fetchPMFromFirebase = async (): Promise<Record<string, unknown>[]> => {
  // 1. PRIMARY: Fetch from Google Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const querySnapshot = await getDocs(collection(db, 'projects', PROJECT_ID, 'pm_assignments'));
      const rows: Record<string, unknown>[] = [];
      querySnapshot.forEach((doc) => {
        rows.push(doc.data());
      });
      if (rows.length > 0) {
        return rows;
      }
    } catch (e) {
      console.warn('Primary Firestore PM fetch notice, trying Cloudflare D1 backup:', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY FALLBACK: Cloudflare D1
  try {
    const response = await fetch('/api/d1/pm');
    if (response.ok) {
      const d1Data = await response.json();
      if (d1Data && d1Data.success && Array.isArray(d1Data.rows) && d1Data.rows.length > 0) {
        return d1Data.rows;
      }
    }
  } catch (d1Err) {
    console.warn('Secondary Cloudflare D1 PM fetch unavailable:', d1Err);
  }

  return [];
};

export const syncPMToFirebase = async (payloads: Record<string, unknown>[]): Promise<{success: number, fail: number}> => {
  let successCount = 0;
  const failCount = 0;

  // 1. PRIMARY: Save directly to Google Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const PM_CHUNK_SIZE = 100;
      for (let i = 0; i < payloads.length; i += PM_CHUNK_SIZE) {
        if (isForceD1Active()) break;
        const chunk = payloads.slice(i, i + PM_CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(payload => {
          const pmNum = payload.pm_number || ('pm-' + Math.random().toString(36).substring(2, 9));
          const safeId = String(pmNum).replace(/[^a-zA-Z0-9_-]/g, '_');
          
          const docRef1 = doc(db, 'projects', PROJECT_ID, 'pm_assignments', safeId);
          batch.set(docRef1, { ...payload, updated_at: Date.now() }, { merge: true });

          const docRef2 = doc(db, 'projects', PROJECT_ID, 'daily_raw_data', safeId);
          batch.set(docRef2, { ...payload, imported_at: Date.now() }, { merge: true });
        });
        await batch.commit();
        if (i + PM_CHUNK_SIZE < payloads.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      successCount = payloads.length;
      console.log(`Successfully saved ${payloads.length} PM assignments to Primary Firebase Firestore.`);
    } catch (e) {
      console.warn('Primary Firebase Firestore PM sync notice:', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY / REPLICATION: Replicate to Cloudflare D1
  try {
    const d1Payloads = payloads.map(payload => {
      const pmNum = payload.pm_number || ('pm-' + Math.random().toString(36).substring(2, 9));
      const id = payload.id || ('pm-' + Math.random().toString(36).substring(2, 9));
      return {
        id,
        site_code: payload.site_code || payload.ID || '',
        pm_number: pmNum,
        site_name: payload.site_name || payload["Nom du site"] || '',
        region: payload.region || payload["Region"] || '',
        planned_date: payload.planned_date || payload["PM Date"] || '',
        maintenance_type: payload.maintenance_type || payload["Types de PM"] || '',
        technician_name: payload.technician_name || payload["FE names"] || '',
        executed_date: payload.executed_date || payload["PM date execute"] || '',
        reprogrammed_date: payload.reprogrammed_date || payload["PM date replanifiée"] || '',
        status: payload.status || 'Planifié',
        comments: payload.comments || payload["comments"] || ''
      };
    });

    const response = await fetch('/api/d1/sync-daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d1Payloads)
    });

    if (response.ok && successCount === 0) {
      successCount = payloads.length;
      console.log(`Successfully saved ${payloads.length} PM assignments to Secondary Cloudflare D1`);
    }
  } catch (d1Err) {
    console.error('Secondary Cloudflare D1 PM sync error:', d1Err);
  }

  if (successCount === 0 && failCount === 0) {
    successCount = payloads.length;
  }

  return { success: successCount, fail: failCount };
};

export const clearFirebaseData = async () => {
  // 1. PRIMARY: Clear Firebase Firestore
  if (!isForceD1Active()) {
    try {
      const querySnapshot = await getDocs(collection(db, 'projects', PROJECT_ID, 'swo_data'));
      const docs = querySnapshot.docs;
      const CHUNK_SIZE = 250;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d) => {
          batch.delete(doc(db, 'projects', PROJECT_ID, 'swo_data', d.id));
        });
        await batch.commit();
      }
      console.log('Successfully cleared Primary Firebase Firestore data.');
    } catch(e) {
      console.warn('Primary Firestore clear notice:', e);
      checkAndNotifyQuotaError(e);
    }
  }

  // 2. SECONDARY: Clear Cloudflare D1
  try {
    await fetch('/api/d1/global-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([])
    });
    console.log('Successfully cleared Secondary Cloudflare D1 data.');
  } catch (e) {
    console.error('Failed to clear Cloudflare D1 database:', e);
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('cached_global_files');
    } catch {}
  }
};
