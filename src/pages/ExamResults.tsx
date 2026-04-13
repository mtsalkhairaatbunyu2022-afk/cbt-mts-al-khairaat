import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Exam, ExamResult } from '../types';
import { ArrowLeft, Users, Trophy, TrendingUp, Search, Download, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function ExamResults() {
  const { user, loading: authLoading } = useAuth();
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const fetchData = async () => {
    if (!examId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const examSnap = await getDoc(doc(db, 'exams', examId));
      if (examSnap.exists()) {
        setExam({ id: examSnap.id, ...examSnap.data() } as Exam);
        
        const resultsQuery = query(
          collection(db, 'results'),
          where('examId', '==', examId)
        );
        let resultsSnap;
        try {
          resultsSnap = await getDocs(resultsQuery);
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.LIST, 'results');
          setError('Gagal mengambil data hasil ujian. Periksa koneksi atau izin akses Anda.');
          return;
        }
        const resultsList = resultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult));
        setResults(resultsList.sort((a, b) => b.score - a.score));
      } else {
        setError('Ujian tidak ditemukan.');
      }
    } catch (err: any) {
      console.error("Error fetching results:", err);
      setError('Terjadi kesalahan saat memuat data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user && !auth.currentUser) {
        const timer = setTimeout(() => fetchData(), 1000);
        return () => clearTimeout(timer);
      }
      fetchData();
    }
  }, [examId, user, authLoading]);

  const filteredResults = results.filter(r => 
    r.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.studentId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const averageScore = results.length > 0 
    ? (results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1) 
    : '0';

  const highestScore = results.length > 0 
    ? Math.max(...results.map(r => r.score)) 
    : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 animate-pulse">Memuat hasil ujian...</p>
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
          <h2 className="text-xl font-bold text-slate-900">Gagal Memuat Hasil</h2>
          <p className="text-slate-500 max-w-md">{error}</p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
        >
          <RefreshCw className="w-5 h-5" />
          <span>Coba Lagi</span>
        </button>
      </div>
    );
  }

  if (!exam) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Kembali</span>
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Cetak Laporan</span>
        </button>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <FileText className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Hasil Ujian: {exam.subject}</h1>
          <p className="text-slate-500 font-medium uppercase tracking-wider">
            Kelas {exam.class} • Smt {exam.semester} • {exam.academicYear}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-700">Total Peserta</h3>
          </div>
          <p className="text-4xl font-bold text-slate-900">{results.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Trophy className="w-5 h-5 text-yellow-600" />
            </div>
            <h3 className="font-semibold text-slate-700">Skor Tertinggi</h3>
          </div>
          <p className="text-4xl font-bold text-slate-900">{highestScore}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-700">Rata-rata Kelas</h3>
          </div>
          <p className="text-4xl font-bold text-slate-900">{averageScore}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-900">Peringkat Siswa</h2>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama siswa..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Peringkat</th>
                <th className="px-6 py-4">Nama Siswa</th>
                <th className="px-6 py-4">ID Siswa</th>
                <th className="px-6 py-4">Waktu Selesai</th>
                <th className="px-6 py-4 text-center">Pelanggaran</th>
                <th className="px-6 py-4 text-right">Skor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {filteredResults.map((result, index) => (
                  <motion.tr
                    key={result.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm",
                        index === 0 ? "bg-yellow-100 text-yellow-700" :
                        index === 1 ? "bg-slate-200 text-slate-700" :
                        index === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-slate-50 text-slate-500"
                      )}>
                        {index + 1}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{result.studentName}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {result.studentId}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(result.completedAt)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={cn(
                        "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold",
                        (result.violations || 0) > 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                      )}>
                        {result.violations || 0} kali
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={cn(
                        "inline-block px-4 py-1 rounded-xl font-black text-xl",
                        result.score >= 75 ? "text-green-600 bg-green-50" :
                        result.score >= 50 ? "text-yellow-600 bg-yellow-50" :
                        "text-red-600 bg-red-50"
                      )}>
                        {result.score}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filteredResults.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              Tidak ada data hasil ujian.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
