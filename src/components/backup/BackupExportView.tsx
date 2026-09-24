import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Download, 
  RotateCcw, 
  Server, 
  Archive, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Zap,
  UploadCloud,
  FileUp,
  FolderOpen,
  X,
  HardDrive
} from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
import { BackupItem, ExternalBackupInspection } from '../../types';

export const BackupExportView: React.FC = () => {
  const { refreshData, showToast, triggerConfetti } = useBudget();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupItem | null>(null);

  // External Restore States
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [externalMode, setExternalMode] = useState<'upload' | 'server'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serverPath, setServerPath] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<ExternalBackupInspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [stagedToken, setStagedToken] = useState<string | null>(null);
  const [stagedFilename, setStagedFilename] = useState<string | null>(null);
  const [isRestoringExternal, setIsRestoringExternal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetExternalState = () => {
    setSelectedFile(null);
    setServerPath('');
    setIsInspecting(false);
    setInspection(null);
    setInspectionError(null);
    setStagedToken(null);
    setStagedFilename(null);
    setIsRestoringExternal(false);
    setDragActive(false);
  };

  const handleOpenExternalModal = () => {
    resetExternalState();
    setShowExternalModal(true);
  };

  const handleCloseExternalModal = () => {
    if (isRestoringExternal) return;
    setShowExternalModal(false);
    resetExternalState();
  };

  const processExternalFile = async (file: File) => {
    try {
      setSelectedFile(file);
      setIsInspecting(true);
      setInspection(null);
      setInspectionError(null);
      setStagedToken(null);
      setStagedFilename(null);

      const res = await api.stageExternalBackup(file);
      setStagedToken(res.token);
      setStagedFilename(res.stageFilename);
      setInspection(res.inspection);
    } catch (err: any) {
      setInspectionError(err.message || 'Failed to inspect backup file');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processExternalFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExternalFile(e.dataTransfer.files[0]);
    }
  };

  const handleInspectServerPath = async () => {
    if (!serverPath.trim()) {
      setInspectionError('Please enter a server file path');
      return;
    }
    try {
      setIsInspecting(true);
      setInspection(null);
      setInspectionError(null);
      const res = await api.inspectServerPath(serverPath.trim());
      setInspection(res.inspection);
    } catch (err: any) {
      setInspectionError(err.message || 'Failed to inspect server path');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleConfirmExternalRestore = async () => {
    if (!inspection) return;

    try {
      setIsRestoringExternal(true);
      if (externalMode === 'upload') {
        if (!stagedToken || !stagedFilename) {
          throw new Error('Staging reference missing. Please select your file again.');
        }
        await api.confirmStageRestore(stagedToken, stagedFilename);
      } else {
        if (!serverPath.trim()) {
          throw new Error('Please enter a valid server file path.');
        }
        await api.restoreServerPath(serverPath.trim());
      }

      await refreshData();
      triggerConfetti();
      showToast('Database successfully restored from external backup! 🌸✨');
      handleCloseExternalModal();
      await fetchBackups();
    } catch (err: any) {
      setInspectionError(err.message || 'Failed to restore database');
      showToast(err.message || 'Error restoring database');
    } finally {
      setIsRestoringExternal(false);
    }
  };

  const fetchBackups = useCallback(async () => {
    try {
      setLoadingBackups(true);
      const list = await api.getBackupsList();
      setBackups(list);
    } catch {
      showToast('Error loading backup list');
    } finally {
      setLoadingBackups(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Instant Tarball Backup Creation
  const handleCreateInstantBackup = async () => {
    try {
      setCreatingBackup(true);
      const res = await api.createInstantBackup();
      if (res.success) {
        triggerConfetti();
        showToast('Instant database backup snapshot created! 🌸');
        await fetchBackups();
      }
    } catch {
      showToast('Error creating instant backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  // Restore Tarball Snapshot
  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;
    const filename = selectedBackupForRestore.filename;

    try {
      setRestoringFilename(filename);
      const res = await api.restoreBackupTarball(filename);
      if (res.success) {
        setSelectedBackupForRestore(null);
        await refreshData();
        triggerConfetti();
        showToast('Database successfully restored from snapshot! ✨');
        await fetchBackups();
      }
    } catch {
      showToast('Error restoring database from snapshot');
    } finally {
      setRestoringFilename(null);
    }
  };

  // Delete Tarball Snapshot
  const handleDeleteBackup = async (filename: string) => {
    if (confirm(`Delete backup file "${filename}"?`)) {
      try {
        await api.deleteBackupTarball(filename);
        showToast('Backup deleted successfully');
        await fetchBackups();
      } catch {
        showToast('Error deleting backup');
      }
    }
  };

  // Download Tarball (.tar.gz)
  const handleDownloadTarball = (filename: string) => {
    window.location.href = `/api/backup/download-tarball/${encodeURIComponent(filename)}`;
  };

  // Format Date Helper
  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Instant Backup Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
            <span>📦</span> Database Backups &amp; Snapshots
          </h2>
          <p className="text-xs text-rose-400 font-medium mt-1">
            Automated daily tarball backups, instant snapshot generation, and 1-click database restore
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchBackups}
            disabled={loadingBackups}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-[#faedf1] border border-[#ebd0d9] text-[#7d3c4c] rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            title="Refresh backups list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Restore External Backup Button */}
          <button
            onClick={handleOpenExternalModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#faedf1] border border-[#7d3c4c] text-[#7d3c4c] rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="Restore from a backup stored on your device, USB drive, or server"
          >
            <UploadCloud className="w-4 h-4 text-[#7d3c4c]" />
            <span>Restore External Backup...</span>
          </button>

          {/* Instant Backup Generation Button */}
          <button
            onClick={handleCreateInstantBackup}
            disabled={creatingBackup}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#7d3c4c] hover:bg-[#6a313f] text-white rounded-2xl text-xs font-bold shadow-md shadow-rose-900/20 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            {creatingBackup ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Compressing DB...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Create Instant Backup (.tar.gz)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Automated Daily Status Card */}
      <div className="bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] rounded-3xl p-6 text-white shadow-kawaii flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-white/20 backdrop-blur-xs text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full flex items-center gap-1.5 border border-white/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Automated Daily Scheduler Active
            </span>
            <span className="text-rose-200 text-xs font-mono font-bold">
              {backups.length} {backups.length === 1 ? 'snapshot' : 'snapshots'} stored
            </span>
          </div>
          <h3 className="text-lg font-extrabold font-cute flex items-center gap-2">
            <span>🛡️</span> Zero Data Loss Protection
          </h3>
          <p className="text-xs text-rose-100/90 max-w-xl">
            A compressed SQLite tarball (<code className="bg-black/20 px-1.5 py-0.5 rounded font-mono">.tar.gz</code>) is automatically generated every 24 hours and preserved on disk. You can also generate snapshots at any time before making budget adjustments.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-2xl p-3.5 text-center min-w-[160px] self-stretch md:self-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-200 block">Latest Backup</span>
          <span className="text-xs font-mono font-extrabold text-white block mt-0.5">
            {backups.length > 0 ? formatDateTime(backups[0].createdAt) : 'None yet'}
          </span>
          <span className="text-[10px] text-emerald-300 font-bold block mt-1">
            {backups.length > 0 ? `Size: ${backups[0].sizeFormatted}` : 'Ready'}
          </span>
        </div>
      </div>

      {/* Restore from External Backup Card */}
      <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700 shrink-0 shadow-2xs">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
              Restore from External Backup
            </h3>
            <p className="text-xs text-[#64748b] mt-0.5">
              Have a backup file on your computer, external drive, TrueNAS, or server? Restore from <code className="bg-[#fdf6f8] px-1.5 py-0.5 rounded font-mono text-[11px] text-[#7d3c4c] border border-[#ebd0d9]">.tar.gz</code>, <code className="bg-[#fdf6f8] px-1.5 py-0.5 rounded font-mono text-[11px] text-[#7d3c4c] border border-[#ebd0d9]">.sqlite</code>, or <code className="bg-[#fdf6f8] px-1.5 py-0.5 rounded font-mono text-[11px] text-[#7d3c4c] border border-[#ebd0d9]">.json</code>
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenExternalModal}
          className="px-5 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer active:scale-95 shadow-2xs"
        >
          <FolderOpen className="w-4 h-4 text-sky-600" />
          <span>Upload or Select Backup</span>
        </button>
      </div>

      {/* Backups List / Selection Table */}
      <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii space-y-4">
        <div className="flex items-center justify-between border-b border-[#e4e0e2] pb-3">
          <div className="flex items-center gap-2.5">
            <Archive className="w-5 h-5 text-[#7d3c4c]" />
            <div>
              <h3 className="text-base font-extrabold text-[#1f242e] font-cute">Available Database Backups</h3>
              <p className="text-xs text-[#64748b]">Select any snapshot to restore your database or download for offsite storage</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#7d3c4c] bg-[#fdf6f8] px-3 py-1 rounded-xl border border-[#ebd0d9]">
            {backups.length} Available
          </span>
        </div>

        {loadingBackups ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2 text-[#7d3c4c]">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="text-xs font-bold font-cute">Loading database backups...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-[#fdf6f8]/40 rounded-2xl border border-dashed border-[#ebd0d9]">
            <span className="text-3xl">🌸</span>
            <p className="text-xs font-bold text-[#7d3c4c]">No tarball backups found yet</p>
            <p className="text-[11px] text-[#64748b]">Click "Create Instant Backup (.tar.gz)" above to create your first snapshot!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#fdf6f8] text-[#7d3c4c] border-b border-[#ebd0d9] text-[11px] font-extrabold">
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Backup Date &amp; Time</th>
                  <th className="py-3 px-4">Snapshot Contents</th>
                  <th className="py-3 px-4">Archive Size</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50/60 font-medium">
                {backups.map((item, index) => {
                  const isDaily = item.type === 'daily_auto';
                  const isRestoringThis = restoringFilename === item.filename;

                  return (
                    <tr key={item.filename} className="hover:bg-[#fdf6f8]/50 transition-colors">
                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        {isDaily ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            <Clock className="w-2.5 h-2.5" />
                            Daily Auto
                          </span>
                        ) : item.type === 'external_import' ? (
                          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            <UploadCloud className="w-2.5 h-2.5" />
                            External
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            <Zap className="w-2.5 h-2.5" />
                            Instant
                          </span>
                        )}
                        {index === 0 && (
                          <span className="ml-1.5 text-[9px] bg-rose-100 text-[#7d3c4c] font-bold px-1.5 py-0.5 rounded">
                            Latest
                          </span>
                        )}
                      </td>

                      {/* Date & Filename */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#1f242e]">{formatDateTime(item.createdAt)}</div>
                        <div className="text-[10px] font-mono text-[#64748b] truncate max-w-xs">{item.filename}</div>
                      </td>

                      {/* Stats */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 font-mono text-[11px] text-[#52212e] flex-wrap">
                          <span className="bg-[#fdf6f8] px-2 py-0.5 rounded border border-[#ebd0d9]">
                            <strong>{item.stats?.transactionsCount || 0}</strong> txs
                          </span>
                          <span className="bg-[#fdf6f8] px-2 py-0.5 rounded border border-[#ebd0d9]">
                            <strong>{item.stats?.accountsCount || 0}</strong> accs
                          </span>
                          <span className="bg-[#fdf6f8] px-2 py-0.5 rounded border border-[#ebd0d9]">
                            Checking: <strong>{formatCurrency(item.stats?.checkingBalance || 0)}</strong>
                          </span>
                        </div>
                      </td>

                      {/* Size */}
                      <td className="py-3.5 px-4 font-mono font-bold text-[#1f242e]">
                        {item.sizeFormatted}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Restore Button */}
                          <button
                            onClick={() => setSelectedBackupForRestore(item)}
                            disabled={isRestoringThis}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#fdf6f8] hover:bg-[#f8d5db] text-[#7d3c4c] border border-[#ebd0d9] rounded-xl text-[11px] font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Restore database to this point in time"
                          >
                            <RotateCcw className={`w-3 h-3 ${isRestoringThis ? 'animate-spin' : ''}`} />
                            <span>{isRestoringThis ? 'Restoring...' : 'Restore'}</span>
                          </button>

                          {/* Download Button */}
                          <button
                            onClick={() => handleDownloadTarball(item.filename)}
                            className="p-1.5 bg-white hover:bg-[#faedf1] text-[#7d3c4c] border border-[#ebd0d9] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                            title="Download .tar.gz tarball archive"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteBackup(item.filename)}
                            className="p-1.5 bg-white hover:bg-rose-50 text-[#64748b] hover:text-rose-600 border border-[#ebd0d9] rounded-xl text-xs transition-all cursor-pointer"
                            title="Delete backup file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {selectedBackupForRestore && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#ebd0d9] shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-[#7d3c4c]">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center border border-rose-200 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold font-cute text-[#1f242e]">Confirm Database Restore</h3>
                <p className="text-xs text-rose-500 font-medium">Replaces current database with selected snapshot</p>
              </div>
            </div>

            <div className="bg-[#fdf6f8] p-4 rounded-2xl border border-[#ebd0d9] space-y-2 text-xs text-[#52212e]">
              <div className="flex justify-between">
                <span className="font-semibold text-[#64748b]">Snapshot Date:</span>
                <span className="font-bold font-mono">{formatDateTime(selectedBackupForRestore.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#64748b]">Type:</span>
                <span className="font-bold">{selectedBackupForRestore.type === 'daily_auto' ? 'Automated Daily' : 'Instant Snapshot'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#64748b]">Transactions:</span>
                <span className="font-bold font-mono">{selectedBackupForRestore.stats?.transactionsCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#64748b]">Checking Balance:</span>
                <span className="font-bold font-mono text-emerald-700">{formatCurrency(selectedBackupForRestore.stats?.checkingBalance || 0)}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                Your active SQLite database will be swapped with this snapshot. Any changes made after this backup date will be overwritten.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedBackupForRestore(null)}
                className="px-4 py-2 rounded-xl text-[#64748b] hover:bg-[#f8f7f6] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="px-5 py-2 rounded-xl bg-[#7d3c4c] text-white text-xs font-bold hover:bg-[#6a313f] shadow-md shadow-rose-900/20 cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Yes, Restore Snapshot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore from External Backup Modal */}
      {showExternalModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-[#ebd0d9] shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#ebd0d9] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 flex items-center justify-center border border-sky-200 text-sky-700 shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold font-cute text-[#1f242e]">
                    Restore from External Backup
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Restore database from a file on your computer, external storage, or server
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseExternalModal}
                disabled={isRestoringExternal}
                className="p-1.5 rounded-xl hover:bg-[#faedf1] text-[#64748b] hover:text-[#7d3c4c] transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="flex rounded-2xl bg-[#fdf6f8] p-1 border border-[#ebd0d9] text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setExternalMode('upload');
                  setInspection(null);
                  setInspectionError(null);
                }}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  externalMode === 'upload'
                    ? 'bg-white text-[#7d3c4c] shadow-xs'
                    : 'text-[#64748b] hover:text-[#1f242e]'
                }`}
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Upload from Computer</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setExternalMode('server');
                  setInspection(null);
                  setInspectionError(null);
                }}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  externalMode === 'server'
                    ? 'bg-white text-[#7d3c4c] shadow-xs'
                    : 'text-[#64748b] hover:text-[#1f242e]'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Server / Host Path</span>
              </button>
            </div>

            {/* Mode 1: File Upload */}
            {externalMode === 'upload' && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tar.gz,.tgz,.tar,.sqlite,.db,.sqlite3,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2.5 ${
                    dragActive
                      ? 'border-[#7d3c4c] bg-[#faedf1]/50 scale-[1.01]'
                      : 'border-[#ebd0d9] hover:border-[#7d3c4c] bg-[#fdf6f8]/40 hover:bg-[#fdf6f8]'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white border border-[#ebd0d9] flex items-center justify-center text-[#7d3c4c] shadow-xs">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1f242e]">
                      {selectedFile ? (
                        <span className="text-[#7d3c4c] font-mono">{selectedFile.name}</span>
                      ) : (
                        'Click to browse or drag & drop backup file'
                      )}
                    </div>
                    <p className="text-[11px] text-[#64748b] mt-0.5">
                      Supports <code className="bg-white px-1 py-0.5 rounded border border-[#ebd0d9] font-mono text-[#7d3c4c]">.tar.gz</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#ebd0d9] font-mono text-[#7d3c4c]">.sqlite</code>, <code className="bg-white px-1 py-0.5 rounded border border-[#ebd0d9] font-mono text-[#7d3c4c]">.db</code>, and <code className="bg-white px-1 py-0.5 rounded border border-[#ebd0d9] font-mono text-[#7d3c4c]">.json</code>
                    </p>
                  </div>
                  {selectedFile && (
                    <span className="text-[10px] text-[#7d3c4c] bg-rose-100 font-bold px-2.5 py-0.5 rounded-full">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Click to choose another file
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Mode 2: Server Path */}
            {externalMode === 'server' && (
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-[#1f242e]">
                  Absolute File Path on Server / Host:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverPath}
                    onChange={(e) => {
                      setServerPath(e.target.value);
                      setInspection(null);
                      setInspectionError(null);
                    }}
                    placeholder="/mnt/tank/backups/kawaii_backup.tar.gz"
                    className="flex-1 px-3.5 py-2 text-xs bg-[#fdf6f8] border border-[#ebd0d9] rounded-xl focus:outline-none focus:border-[#7d3c4c] font-mono text-[#1f242e]"
                  />
                  <button
                    type="button"
                    onClick={handleInspectServerPath}
                    disabled={isInspecting || !serverPath.trim()}
                    className="px-4 py-2 bg-[#7d3c4c] hover:bg-[#6a313f] text-white rounded-xl text-xs font-bold cursor-pointer transition-all disabled:opacity-50 shrink-0"
                  >
                    {isInspecting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Inspect'
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-[#64748b]">
                  Useful when self-hosting on Docker or TrueNAS SCALE with local or mounted file storage.
                </p>
              </div>
            )}

            {/* Inspecting Spinner */}
            {isInspecting && (
              <div className="p-4 bg-[#fdf6f8] rounded-2xl border border-[#ebd0d9] flex items-center justify-center gap-2 text-xs font-bold text-[#7d3c4c]">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Inspecting and validating backup file...</span>
              </div>
            )}

            {/* Inspection Error Message */}
            {inspectionError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-bold">Cannot restore from this file</div>
                  <div className="text-[11px] text-rose-700 mt-0.5">{inspectionError}</div>
                </div>
              </div>
            )}

            {/* Verified Inspection Card */}
            {inspection && inspection.valid && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="bg-[#fdf6f8] p-4 rounded-2xl border border-[#ebd0d9] space-y-2.5 text-xs text-[#52212e]">
                  <div className="flex items-center justify-between border-b border-[#ebd0d9] pb-2">
                    <span className="font-extrabold text-[#1f242e] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Verified Backup Structure</span>
                    </span>
                    <span className="font-mono uppercase text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {inspection.format}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-[#64748b] block">Snapshot Date:</span>
                      <span className="font-bold font-mono text-[#1f242e]">{formatDateTime(inspection.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-[#64748b] block">Archive Size:</span>
                      <span className="font-bold font-mono text-[#1f242e]">{inspection.sizeFormatted}</span>
                    </div>
                  </div>

                  <div className="pt-1.5 border-t border-[#ebd0d9] flex items-center gap-2 font-mono text-[11px] text-[#52212e] flex-wrap">
                    <span className="bg-white px-2 py-0.5 rounded border border-[#ebd0d9]">
                      <strong>{inspection.stats.transactionsCount}</strong> txs
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-[#ebd0d9]">
                      <strong>{inspection.stats.accountsCount}</strong> accs
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-[#ebd0d9]">
                      <strong>{inspection.stats.billsCount}</strong> bills
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-[#ebd0d9]">
                      Checking: <strong>{formatCurrency(inspection.stats.checkingBalance)}</strong>
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Your active database will be replaced with this backup. A permanent snapshot will also be archived in your Backups list.
                  </span>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#ebd0d9]">
              <button
                type="button"
                onClick={handleCloseExternalModal}
                disabled={isRestoringExternal}
                className="px-4 py-2 rounded-xl text-[#64748b] hover:bg-[#f8f7f6] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExternalRestore}
                disabled={!inspection || !inspection.valid || isRestoringExternal || isInspecting}
                className="px-5 py-2.5 rounded-xl bg-[#7d3c4c] text-white text-xs font-bold hover:bg-[#6a313f] shadow-md shadow-rose-900/20 cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRestoringExternal ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Yes, Restore from This Backup</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii space-y-4">
        <div className="flex items-center gap-3 border-b border-[#e4e0e2] pb-3">
          <Server className="w-6 h-6 text-[#f472b6]" />
          <div>
            <h3 className="text-base font-extrabold text-[#1f242e] font-cute">
              🐳 Docker &amp; TrueNAS SCALE Self-Hosting Guide
            </h3>
            <p className="text-xs text-rose-400 font-medium">Local-only configuration with persistent SQLite storage &amp; automatic tarball backups</p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-[#52212e]">
          <p>
            Your app includes a pre-configured <strong>`Dockerfile`</strong> and <strong>`docker-compose.yml`</strong>. Backups are stored in <code className="bg-rose-50 px-1 py-0.5 rounded font-mono">/data/backups</code>.
          </p>

          <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono text-xs space-y-2 overflow-x-auto">
            <div className="text-rose-300"># 1. Run locally with Docker Compose:</div>
            <div>docker compose up -d --build</div>
            <div className="text-[#64748b]"># Access web app at: http://localhost:3000</div>
          </div>

          <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono text-xs space-y-2 overflow-x-auto">
            <div className="text-rose-300"># 2. Deploying on TrueNAS SCALE (Custom App):</div>
            <div>- Image: Built locally or from local docker registry</div>
            <div>- Port Forwarding: Host Port 3000 &rarr; Container Port 3000</div>
            <div>- Storage Volume: Host Path `/mnt/tank/appdata/kawaii-budget` &rarr; Container `/data`</div>
          </div>
        </div>
      </div>
    </div>
  );
};
