import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Exam, ExamResult } from '../types';
import { BookOpen, Play, CheckCircle, Clock, Search, Key, AlertCircle, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, cn } from '../lib/utils';

import { useAuth } from '../hooks/useAuth';

export default function StudentDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Fetch active exams
      const examsQuery = query(
        collection(db, 'exams'),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc')
      );
      const examsSnap = await getDocs(examsQuery);
      const examsList = examsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(examsList);

      // Fetch student's results
      const studentId = auth.currentUser?.uid || user?.uid;
      
      if (studentId) {
        const resultsQuery = query(
          collection(db, 'results'),
          where('studentId', '==', studentId)
        );
        const resultsSnap = await getDocs(resultsQuery);
        const resultsList = resultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult));
        setResults(resultsList);
      }
    } catch (err: any) {
      console.error("Error fetching student data:", err);
      setError('Gagal memuat data ujian. Silakan coba lagi.');
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
  }, [user, authLoading]);

  const handleStartExam = (exam: Exam) => {
    const alreadyTaken = results.some(r => r.examId === exam.id);
    if (alreadyTaken) {
      alert('Anda sudah mengerjakan ujian ini.');
      return;
    }
    setSelectedExam(exam);
    setTokenInput('');
    setTokenError(null);
  };

  const verifyToken = () => {
    if (tokenInput.toUpperCase() === selectedExam?.token.toUpperCase()) {
      navigate(`/exams/${selectedExam.id}/take`);
    } else {
      setTokenError('Token yang Anda masukkan salah.');
    }
  };

  const filteredExams = exams.filter(exam => 
    exam.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    exam.class.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 animate-pulse">Memuat ujian...</p>
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
          <h2 className="text-xl font-bold text-slate-900">Gagal Memuat Data</h2>
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard Siswa</h1>
          <p className="text-slate-500">Pilih ujian yang tersedia dan kerjakan dengan teliti.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari mata pelajaran..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredExams.map((exam) => {
            const result = results.find(r => r.examId === exam.id);
            return (
              <motion.div
                key={exam.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group"
              >
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-2.5 bg-blue-50 rounded-xl">
                      <BookOpen className="w-6 h-6 text-blue-600" />
                    </div>
                    {result ? (
                      <div className="flex items-center space-x-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        <CheckCircle className="w-3 h-3" />
                        <span>Selesai</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        <Clock className="w-3 h-3" />
                        <span>Tersedia</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{exam.subject}</h3>
                    <p className="text-sm text-slate-500">Kelas {exam.class} • {exam.academicYear}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="text-xs text-slate-500">
                      <span className="block font-bold text-slate-700">{exam.questionCount}</span>
                      Jumlah Soal
                    </div>
                    <div className="text-xs text-slate-500">
                      <span className="block font-bold text-slate-700">{exam.semester === '1' ? 'Ganjil' : 'Genap'}</span>
                      Semester
                    </div>
                  </div>

                  {result ? (
                    <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                      <div className="text-sm text-slate-500">Skor Anda:</div>
                      <div className="text-2xl font-black text-blue-600">{result.score}</div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartExam(exam)}
                      className="w-full mt-4 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Mulai Ujian</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredExams.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
            <Search className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">Tidak ada ujian yang ditemukan.</p>
        </div>
      )}

      {/* Token Modal */}
      <AnimatePresence>
        {selectedExam && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedExam(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center">
                <button
                  onClick={() => setSelectedExam(null)}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-6">
                  <Key className="w-8 h-8 text-blue-600" />
                </div>
                
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Masukkan Token</h2>
                <p className="text-slate-500 mb-8">
                  Silakan masukkan token ujian untuk mata pelajaran <span className="font-bold text-slate-900">{selectedExam.subject}</span>.
                </p>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                    placeholder="TOKEN"
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-3xl font-black tracking-[0.5em] text-blue-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder:text-slate-300"
                    maxLength={6}
                    autoFocus
                  />

                  {tokenError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center space-x-2 text-red-600 text-sm font-medium"
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>{tokenError}</span>
                    </motion.div>
                  )}

                  <button
                    onClick={verifyToken}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Konfirmasi & Mulai
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
