import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import Database, { type Database as DatabaseType } from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const dbDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
export const backupDir = path.join(dbDir, "backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

export interface BackupItem {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  type: "daily_auto" | "manual_instant" | "external_import";
  stats: {
    transactionsCount: number;
    accountsCount: number;
    billsCount: number;
    checkingBalance: number;
  };
}

export interface ExternalBackupInspection {
  valid: boolean;
  filename: string;
  format: "tarball" | "sqlite" | "json";
  size: number;
  sizeFormatted: string;
  createdAt: string;
  stats: {
    transactionsCount: number;
    accountsCount: number;
    billsCount: number;
    checkingBalance: number;
  };
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Creates an atomic compressed tarball (.tar.gz) backup of the SQLite database
 */
export async function createTarballBackup(
  db: DatabaseType,
  type: "daily_auto" | "manual_instant" = "manual_instant"
): Promise<BackupItem> {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-");
  const tempDir = path.join(backupDir, `temp_${dateStr}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const tempDbPath = path.join(tempDir, "kawaii_budget.sqlite");
    
    // Safely snapshot the SQLite database without locking
    await db.backup(tempDbPath);

    // Compute live stats for snapshot verification
    let transactionsCount = 0;
    let accountsCount = 0;
    let billsCount = 0;
    let checkingBalance = 0;

    try {
      transactionsCount = (db.prepare("SELECT count(*) as count FROM transactions").get() as any)?.count || 0;
      accountsCount = (db.prepare("SELECT count(*) as count FROM accounts").get() as any)?.count || 0;
      billsCount = (db.prepare("SELECT count(*) as count FROM bills").get() as any)?.count || 0;
      checkingBalance = (db.prepare("SELECT balance FROM accounts WHERE id = 'acc_checking'").get() as any)?.balance || 0;
    } catch {
      // Fallback
    }

    const filename = `kawaii_budget_backup_${type === "daily_auto" ? "daily_" : "instant_"}${dateStr}.tar.gz`;
    const metadata = {
      filename,
      createdAt: now.toISOString(),
      type,
      version: "1.0",
      stats: {
        transactionsCount,
        accountsCount,
        billsCount,
        checkingBalance
      }
    };

    fs.writeFileSync(path.join(tempDir, "metadata.json"), JSON.stringify(metadata, null, 2));

    const tarballPath = path.join(backupDir, filename);
    execSync(`tar -czf "${tarballPath}" -C "${tempDir}" kawaii_budget.sqlite metadata.json`);

    const stats = fs.statSync(tarballPath);
    console.log(`🌸 [Backup] Successfully created ${type} tarball: ${filename} (${formatBytes(stats.size)})`);

    return {
      filename,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      createdAt: now.toISOString(),
      type,
      stats: metadata.stats
    };
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Lists all existing tarball backups with their metadata
 */
export async function listTarballBackups(): Promise<BackupItem[]> {
  if (!fs.existsSync(backupDir)) return [];

  const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".tar.gz"));
  const backups: BackupItem[] = [];

  for (const file of files) {
    const filePath = path.join(backupDir, file);
    try {
      const stats = fs.statSync(filePath);
      let metadata: any = null;

      try {
        // Read metadata.json directly from inside tarball
        const rawMeta = execSync(`tar -xzf "${filePath}" -O metadata.json`, { timeout: 3000 }).toString();
        metadata = JSON.parse(rawMeta);
      } catch {
        // Fallback if metadata extraction fails
        metadata = {
          filename: file,
          createdAt: stats.mtime.toISOString(),
          type: file.includes("daily") ? "daily_auto" : "manual_instant",
          stats: {
            transactionsCount: 0,
            accountsCount: 0,
            billsCount: 0,
            checkingBalance: 0
          }
        };
      }

      backups.push({
        filename: file,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        createdAt: metadata.createdAt || stats.mtime.toISOString(),
        type: metadata.type || (file.includes("daily") ? "daily_auto" : "manual_instant"),
        stats: metadata.stats || {
          transactionsCount: 0,
          accountsCount: 0,
          billsCount: 0,
          checkingBalance: 0
        }
      });
    } catch (err) {
      console.warn("Failed to process backup file:", file, err);
    }
  }

  // Sort descending by creation date (newest first)
  return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Restores the SQLite database from a selected tarball backup
 */
export async function restoreTarballBackup(
  filename: string,
  onDatabaseRestored: (newDbPath: string) => void
): Promise<{ success: boolean; message: string; metadata: any }> {
  const safeFilename = path.basename(filename);
  const tarballPath = path.join(backupDir, safeFilename);

  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Backup file "${safeFilename}" does not exist`);
  }

  const tempExtract = path.join(backupDir, `temp_restore_${Date.now()}`);
  fs.mkdirSync(tempExtract, { recursive: true });

  try {
    execSync(`tar -xzf "${tarballPath}" -C "${tempExtract}"`);
    const extractedDb = path.join(tempExtract, "kawaii_budget.sqlite");
    
    if (!fs.existsSync(extractedDb)) {
      throw new Error("Invalid backup tarball: kawaii_budget.sqlite not found inside archive");
    }

    let metadata: any = {};
    const metaFile = path.join(tempExtract, "metadata.json");
    if (fs.existsSync(metaFile)) {
      metadata = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    }

    const liveDbPath = path.join(dbDir, "kawaii_budget.sqlite");
    
    // Copy extracted database over live database
    onDatabaseRestored(extractedDb);

    console.log(`🌸 [Restore] Successfully restored database from ${safeFilename}`);
    return {
      success: true,
      message: `Database restored successfully from snapshot: ${safeFilename}`,
      metadata
    };
  } finally {
    if (fs.existsSync(tempExtract)) {
      fs.rmSync(tempExtract, { recursive: true, force: true });
    }
  }
}

/**
 * Searches directory tree for an SQLite database file
 */
function findSqliteFileInDir(dir: string): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // Priority 1: canonical kawaii_budget.sqlite
    for (const entry of entries) {
      if (entry.isFile() && entry.name === "kawaii_budget.sqlite") {
        return path.join(dir, entry.name);
      }
    }
    // Priority 2: any .sqlite, .db, .sqlite3 file
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".sqlite") || entry.name.endsWith(".db") || entry.name.endsWith(".sqlite3"))) {
        return path.join(dir, entry.name);
      }
    }
    // Priority 3: check subdirectories (excluding hidden)
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const sub = findSqliteFileInDir(path.join(dir, entry.name));
        if (sub) return sub;
      }
    }
    // Priority 4: magic bytes
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith(".")) {
        const full = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(full);
          if (stat.size >= 100) {
            const fd = fs.openSync(full, "r");
            const b = Buffer.alloc(16);
            fs.readSync(fd, b, 0, 16, 0);
            fs.closeSync(fd);
            if (b.toString("utf8", 0, 15) === "SQLite format 3") {
              return full;
            }
          }
        } catch {}
      }
    }
  } catch {}
  return null;
}

/**
 * Safely extracts summary stats from an SQLite database
 */
function getSqliteStats(sqlitePath: string): { transactionsCount: number; accountsCount: number; billsCount: number; checkingBalance: number } {
  const stats = {
    transactionsCount: 0,
    accountsCount: 0,
    billsCount: 0,
    checkingBalance: 0,
  };
  try {
    const testDb = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    try {
      stats.transactionsCount = (testDb.prepare("SELECT count(*) as c FROM transactions").get() as any)?.c || 0;
    } catch {}
    try {
      stats.accountsCount = (testDb.prepare("SELECT count(*) as c FROM accounts").get() as any)?.c || 0;
    } catch {}
    try {
      stats.billsCount = (testDb.prepare("SELECT count(*) as c FROM bills").get() as any)?.c || 0;
    } catch {}
    try {
      stats.checkingBalance = (testDb.prepare("SELECT balance FROM accounts WHERE id = 'acc_checking'").get() as any)?.balance || 0;
    } catch {}
    testDb.close();
  } catch (err) {
    console.warn("Could not query stats from SQLite DB:", err);
  }
  return stats;
}

/**
 * Inspects any external backup file (.tar.gz, .sqlite, .db, .json)
 */
export function inspectExternalFile(
  filePath: string,
  originalFilename: string
): ExternalBackupInspection {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error("The backup file is empty (0 bytes)");
  }

  const lowerName = originalFilename.toLowerCase();
  let isTarball = lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz") || lowerName.endsWith(".tar");
  let isSqlite = lowerName.endsWith(".sqlite") || lowerName.endsWith(".db") || lowerName.endsWith(".sqlite3");
  let isJson = lowerName.endsWith(".json");

  // Check magic bytes
  try {
    const fd = fs.openSync(filePath, "r");
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);

    if (headerBuf[0] === 0x1f && headerBuf[1] === 0x8b) {
      isTarball = true;
    } else if (headerBuf.toString("utf8", 0, 15) === "SQLite format 3") {
      isSqlite = true;
    } else if (headerBuf[0] === 0x7b /* '{' */) {
      isJson = true;
    }
  } catch {}

  if (!isTarball && !isSqlite && !isJson) {
    throw new Error("Unsupported file format. Please upload a .tar.gz, .sqlite, .db, or .json backup file.");
  }

  const format: "tarball" | "sqlite" | "json" = isTarball ? "tarball" : isSqlite ? "sqlite" : "json";
  let stats = {
    transactionsCount: 0,
    accountsCount: 0,
    billsCount: 0,
    checkingBalance: 0,
  };
  let createdAt = stat.mtime.toISOString();

  if (format === "tarball") {
    const tempInspectDir = path.join(backupDir, `inspect_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempInspectDir, { recursive: true });

    try {
      execSync(`tar -xf "${filePath}" -C "${tempInspectDir}"`);
      const foundDb = findSqliteFileInDir(tempInspectDir);
      if (!foundDb) {
        throw new Error("Invalid archive: No SQLite database found inside the tarball.");
      }

      // Try reading metadata.json
      const metaPath = path.join(tempInspectDir, "metadata.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          if (meta.createdAt) createdAt = meta.createdAt;
          if (meta.stats) {
            stats = {
              transactionsCount: meta.stats.transactionsCount || 0,
              accountsCount: meta.stats.accountsCount || 0,
              billsCount: meta.stats.billsCount || 0,
              checkingBalance: meta.stats.checkingBalance || 0,
            };
          }
        } catch {}
      }

      if (stats.transactionsCount === 0 && stats.accountsCount === 0) {
        stats = getSqliteStats(foundDb);
      }
    } finally {
      if (fs.existsSync(tempInspectDir)) {
        fs.rmSync(tempInspectDir, { recursive: true, force: true });
      }
    }
  } else if (format === "sqlite") {
    stats = getSqliteStats(filePath);
  } else if (format === "json") {
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      stats.transactionsCount = Array.isArray(content.transactions) ? content.transactions.length : 0;
      stats.accountsCount = Array.isArray(content.accounts) ? content.accounts.length : 0;
      stats.billsCount = Array.isArray(content.bills) ? content.bills.length : 0;
      const checkingAcc = content.accounts?.find((a: any) => a.id === "acc_checking");
      stats.checkingBalance = checkingAcc?.balance || 0;
    } catch (e: any) {
      throw new Error(`Invalid JSON backup: ${e.message}`);
    }
  }

  return {
    valid: true,
    filename: originalFilename,
    format,
    size: stat.size,
    sizeFormatted: formatBytes(stat.size),
    createdAt,
    stats,
  };
}

/**
 * Restores the live database from an external backup file and archives it into the backups folder
 */
export async function restoreFromExternalFile(
  sourceFilePath: string,
  originalFilename: string,
  onDatabaseRestored: (newDbPath: string) => void,
  importJsonHandler?: (jsonData: any) => void
): Promise<{ success: boolean; message: string; metadata: any; backupFilename?: string }> {
  const inspection = inspectExternalFile(sourceFilePath, originalFilename);
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");

  if (inspection.format === "tarball") {
    const tempExtract = path.join(backupDir, `temp_restore_${Date.now()}`);
    fs.mkdirSync(tempExtract, { recursive: true });

    try {
      execSync(`tar -xf "${sourceFilePath}" -C "${tempExtract}"`);
      const extractedDb = findSqliteFileInDir(tempExtract);
      if (!extractedDb) {
        throw new Error("Invalid backup tarball: SQLite database file not found inside archive.");
      }

      // Normalize extracted database to kawaii_budget.sqlite in a clean folder for permanent archiving
      const tempPack = path.join(backupDir, `temp_pack_${Date.now()}`);
      fs.mkdirSync(tempPack, { recursive: true });

      try {
        const canonicalDbPath = path.join(tempPack, "kawaii_budget.sqlite");
        fs.copyFileSync(extractedDb, canonicalDbPath);

        const cleanBase = path.basename(originalFilename).replace(/\.(tar\.gz|tgz|tar)$/i, "");
        const safeBackupName = `kawaii_budget_backup_imported_${dateStr}_${cleanBase}.tar.gz`;

        const metadata = {
          filename: safeBackupName,
          originalFilename,
          createdAt: inspection.createdAt,
          type: "external_import",
          version: "1.0",
          stats: inspection.stats,
        };
        fs.writeFileSync(path.join(tempPack, "metadata.json"), JSON.stringify(metadata, null, 2));

        const finalTarPath = path.join(backupDir, safeBackupName);
        execSync(`tar -czf "${finalTarPath}" -C "${tempPack}" kawaii_budget.sqlite metadata.json`);

        // Restore live database
        onDatabaseRestored(canonicalDbPath);

        console.log(`🌸 [Restore] Successfully restored database from external tarball: ${originalFilename}`);
        return {
          success: true,
          message: `Database successfully restored from external backup "${originalFilename}"!`,
          metadata,
          backupFilename: safeBackupName,
        };
      } finally {
        if (fs.existsSync(tempPack)) {
          fs.rmSync(tempPack, { recursive: true, force: true });
        }
      }
    } finally {
      if (fs.existsSync(tempExtract)) {
        fs.rmSync(tempExtract, { recursive: true, force: true });
      }
    }
  } else if (inspection.format === "sqlite") {
    const tempPack = path.join(backupDir, `temp_pack_${Date.now()}`);
    fs.mkdirSync(tempPack, { recursive: true });

    try {
      const canonicalDbPath = path.join(tempPack, "kawaii_budget.sqlite");
      fs.copyFileSync(sourceFilePath, canonicalDbPath);

      const cleanBase = path.basename(originalFilename).replace(/\.(sqlite|db|sqlite3)$/i, "");
      const safeBackupName = `kawaii_budget_backup_imported_${dateStr}_${cleanBase}.tar.gz`;

      const metadata = {
        filename: safeBackupName,
        originalFilename,
        createdAt: new Date().toISOString(),
        type: "external_import",
        version: "1.0",
        stats: inspection.stats,
      };
      fs.writeFileSync(path.join(tempPack, "metadata.json"), JSON.stringify(metadata, null, 2));

      const finalTarPath = path.join(backupDir, safeBackupName);
      execSync(`tar -czf "${finalTarPath}" -C "${tempPack}" kawaii_budget.sqlite metadata.json`);

      // Restore live database
      onDatabaseRestored(canonicalDbPath);

      console.log(`🌸 [Restore] Successfully restored database from SQLite file: ${originalFilename}`);
      return {
        success: true,
        message: `Database successfully restored from external SQLite database "${originalFilename}"!`,
        metadata,
        backupFilename: safeBackupName,
      };
    } finally {
      if (fs.existsSync(tempPack)) {
        fs.rmSync(tempPack, { recursive: true, force: true });
      }
    }
  } else if (inspection.format === "json") {
    if (!importJsonHandler) {
      throw new Error("JSON import handler not available");
    }
    const jsonData = JSON.parse(fs.readFileSync(sourceFilePath, "utf8"));
    importJsonHandler(jsonData);

    return {
      success: true,
      message: `Database successfully restored from JSON backup "${originalFilename}"!`,
      metadata: { stats: inspection.stats, createdAt: new Date().toISOString() },
    };
  }

  throw new Error("Unsupported backup format");
}

/**
 * Cleans up old staging files left by interrupted uploads
 */
export function cleanupStagingFiles(): void {
  try {
    if (!fs.existsSync(backupDir)) return;
    const now = Date.now();
    const files = fs.readdirSync(backupDir);
    for (const f of files) {
      if (f.startsWith(".stage_")) {
        const full = path.join(backupDir, f);
        try {
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > 10 * 60 * 1000) {
            fs.unlinkSync(full);
          }
        } catch {}
      }
    }
  } catch {}
}

/**
 * Deletes a tarball backup
 */
export function deleteTarballBackup(filename: string): boolean {
  const safeFilename = path.basename(filename);
  const tarballPath = path.join(backupDir, safeFilename);
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
    return true;
  }
  return false;
}

/**
 * Gets absolute path for download
 */
export function getTarballPath(filename: string): string | null {
  const safeFilename = path.basename(filename);
  const tarballPath = path.join(backupDir, safeFilename);
  if (fs.existsSync(tarballPath)) {
    return tarballPath;
  }
  return null;
}

/**
 * Starts the daily automated backup scheduler
 */
export function initDailyBackupScheduler(
  getDb: () => DatabaseType
): void {
  console.log("🌸 [Backup Scheduler] Initializing automated daily tarball backup service...");

  // 1. Run an immediate check on startup: if no backup exists for today, create one!
  const checkAndRunDailyBackup = async () => {
    try {
      const todayPrefix = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const existingBackups = await listTarballBackups();
      const hasTodayBackup = existingBackups.some(b => 
        b.type === "daily_auto" && b.createdAt.startsWith(todayPrefix)
      );

      if (!hasTodayBackup) {
        console.log(`🌸 [Backup Scheduler] No automated backup found for today (${todayPrefix}). Creating daily snapshot...`);
        await createTarballBackup(getDb(), "daily_auto");
      } else {
        console.log(`🌸 [Backup Scheduler] Daily snapshot for today (${todayPrefix}) already exists.`);
      }

      // Cleanup: retain last 45 backups
      if (existingBackups.length > 45) {
        const toDelete = existingBackups.slice(45);
        for (const b of toDelete) {
          deleteTarballBackup(b.filename);
        }
        console.log(`🌸 [Backup Scheduler] Cleaned up ${toDelete.length} old backups.`);
      }
    } catch (err) {
      console.error("❌ [Backup Scheduler] Error running daily backup check:", err);
    }
  };

  // Run on startup
  setTimeout(checkAndRunDailyBackup, 2000);

  // Check every hour (3600000 ms) so when a new day arrives, it creates the daily backup automatically
  setInterval(checkAndRunDailyBackup, 60 * 60 * 1000);
}
