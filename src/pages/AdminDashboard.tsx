import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Exam, ExamResult } from '../types';
import { Plus, BookOpen, Users, FileText, Trash2, ExternalLink, Calendar, Layers, Hash, Share2, Copy, Check, RefreshCw, AlertCircle, Link as LinkIcon, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, cn } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

import { useAuth } from '../hooks/useAuth';

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'VII' | 'VIII' | 'IX' | 'ALL'>('ALL');
  const [copied, setCopied] = useState(false);
  const [googleFormEntryId, setGoogleFormEntryId] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  const appUrl = window.location.origin;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Fetch Config
      const configRef = doc(db, 'config', 'global');
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        setGoogleFormEntryId(configSnap.data().googleFormEntryId || '');
      }

      const examsQuery = query(
        collection(db, 'exams'),
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      let examsSnap;
      try {
        examsSnap = await getDocs(examsQuery);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.LIST, 'exams');
        setError('Gagal mengambil data ujian. Periksa koneksi atau izin akses Anda.');
        return;
      }
      const examsList = examsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(examsList);

      const resultsQuery = query(collection(db, 'results'));
      let resultsSnap;
      try {
        resultsSnap = await getDocs(resultsQuery);
        const resultsList = resultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult));
        setResults(resultsList);
      } catch (fsErr) {
        // If results fail, we still show exams but log the error
        console.warn('Failed to fetch results, showing exams only:', fsErr);
        // We don't set a hard error here to allow the admin to at least see their exams
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError('Terjadi kesalahan saat memuat data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user && !auth.currentUser) {
        // Wait for Firebase Auth to catch up with the profile
        const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
          if (firebaseUser) {
            fetchData();
          }
        });
        return () => unsubscribe();
      }
      if (user && auth.currentUser) {
        fetchData();
      } else if (!user) {
        setLoading(false);
      }
    }
  }, [user, authLoading]);

  const handleDeleteExam = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus ujian ini? Semua soal dan hasil akan ikut terhapus.')) return;
    
    try {
      await deleteDoc(doc(db, 'exams', id));
      setExams(exams.filter(e => e.id !== id));
    } catch (error) {
      console.error("Error deleting exam:", error);
      alert('Gagal menghapus ujian.');
    }
  };

  const filteredExams = exams.filter(exam => {
    if (activeTab === 'ALL') return true;
    return exam.class.includes(activeTab);
  });

  const filteredResults = results.filter(result => {
    const exam = exams.find(e => e.id === result.examId);
    if (!exam) return false;
    if (activeTab === 'ALL') return true;
    return exam.class.includes(activeTab);
  });

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'config', 'global'), {
        googleFormEntryId: googleFormEntryId
      }, { merge: true });
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving config:", error);
      alert("Gagal menyimpan konfigurasi.");
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 animate-pulse">Memuat data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-6 text-center px-4">
        <div className="p-4 bg-red-50 rounded-full">
          <AlertCircle className="w-12 h-12 text-red-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">Waduh, Ada Masalah!</h2>
          <p className="text-slate-500 max-w-md">{error}</p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
        >
          <RefreshCw className="w-5 h-5" />
          <span>Coba Muat Ulang</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard Guru</h1>
          <p className="text-slate-500">Kelola ujian dan pantau hasil belajar siswa.</p>
        </div>
        <Link
          to="/exams/create"
          className="w-full md:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>Buat Ujian Baru</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-700">Total Ujian</h3>
          </div>
          <p className="text-4xl font-bold text-slate-900">{filteredExams.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-700">Siswa Mengerjakan</h3>
          </div>
          <p className="text-4xl font-bold text-slate-900">{filteredResults.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-slate-700">Rata-rata Skor</h3>
          </div>
          <p className="text-4xl font-bold text-slate-900">
            {filteredResults.length > 0 
              ? (filteredResults.reduce((acc, r) => acc + r.score, 0) / filteredResults.length).toFixed(1) 
              : '0'}
          </p>
        </div>
      </div>

      {/* Google Form Config */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-orange-50 rounded-lg">
            <FileText className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Otomatisasi Nama Google Form</h3>
            <p className="text-xs text-slate-500">Hubungkan nama pilihan siswa langsung ke Google Form.</p>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-end gap-4">
          <div className="flex-grow space-y-2">
            <label className="text-sm font-bold text-slate-700">Entry ID Nama (Google Form)</label>
            <div className="relative">
              <input
                type="text"
                value={googleFormEntryId}
                onChange={(e) => setGoogleFormEntryId(e.target.value)}
                placeholder="Contoh: 123456789"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-10"
              />
              {googleFormEntryId && (
                <button
                  onClick={() => setGoogleFormEntryId('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="w-full md:w-auto px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {savingConfig ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : configSuccess ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <span>Simpan Konfigurasi</span>
            )}
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
          <strong>Cara mencari Entry ID:</strong> Buka Google Form Anda {'>'} Klik titik tiga {'>'} Dapatkan link yang terisi otomatis {'>'} Ketik nama sembarang {'>'} Klik Dapatkan Link {'>'} Salin linknya {'>'} Cari angka setelah <code className="bg-slate-200 px-1 rounded">entry.</code> di link tersebut.
        </p>
      </div>

      {/* Share Section */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-blue-200 overflow-hidden relative">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 opacity-10">
          <Share2 className="w-64 h-64" />
        </div>
        
        <div className="relative flex flex-col md:flex-row items-center gap-8">
          <div className="bg-white p-3 rounded-2xl shadow-inner shrink-0">
            <QRCodeSVG value={appUrl} size={140} />
          </div>
          
          <div className="flex-grow space-y-4 text-center md:text-left">
            <div>
              <h2 className="text-2xl font-bold">Bagikan Aplikasi ke Siswa</h2>
              <p className="text-blue-100 mt-1">Siswa dapat mengakses ujian melalui link atau scan QR Code di bawah ini.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-grow bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 font-mono text-sm truncate w-full">
                {appUrl}
              </div>
              <button
                onClick={handleCopyUrl}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-all shrink-0"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900">Daftar Ujian</h2>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {activeTab === 'ALL' ? 'Semua Jenjang' : `Kelas ${activeTab}`}
            </span>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
            {(['ALL', 'VII', 'VIII', 'IX'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                  activeTab === tab 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {tab === 'ALL' ? 'Semua' : tab}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Mata Pelajaran / Materi</th>
                <th className="px-6 py-4">Kelas / Semester</th>
                <th className="px-6 py-4">Jenis / Soal</th>
                <th className="px-6 py-4">Token</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Dibuat</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {filteredExams.map((exam) => (
                  <motion.tr
                    key={exam.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{exam.subject}</div>
                      <div className="text-xs text-slate-500">{exam.topic || exam.academicYear}</div>
                      {exam.externalUrl && (
                        <div className="mt-1 inline-flex items-center space-x-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase">
                          <LinkIcon className="w-2.5 h-2.5" />
                          <span>Link Eksternal</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2 text-sm text-slate-600">
                        <Layers className="w-3.5 h-3.5" />
                        <span>Kelas {exam.class}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-slate-600">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Smt {exam.semester}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-blue-600 mb-1">{exam.questionType || 'PG'}</div>
                      <div className="flex items-center space-x-1.5 text-sm font-medium text-slate-700">
                        <Hash className="w-3.5 h-3.5 text-slate-400" />
                        <span>{exam.questionCount}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="px-2 py-1 bg-slate-100 text-blue-600 rounded font-mono text-sm font-bold">
                        {exam.token}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        exam.status === 'active' ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {exam.status === 'active' ? 'Aktif' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(exam.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          to={`/exams/${exam.id}/results`}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Lihat Hasil"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </Link>
                        <button
                          onClick={() => handleDeleteExam(exam.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {exams.length === 0 && (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
                <BookOpen className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-slate-500">Belum ada ujian yang dibuat.</p>
              <Link to="/exams/create" className="text-blue-600 font-semibold hover:underline mt-2 inline-block">
                Buat ujian pertama Anda
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
