import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Exam, Question, ExamResult } from '../types';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function TakeExam() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | string)[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60 * 60); // 60 minutes default
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setViolations(prev => prev + 1);
        setShowWarning(true);
      }
    };

    const handleBlur = () => {
      setViolations(prev => prev + 1);
      setShowWarning(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (violations >= 5) {
      alert('Anda telah keluar dari halaman ujian sebanyak 5 kali. Ujian akan dihentikan otomatis.');
      handleSubmit();
    }
  }, [violations]);

  useEffect(() => {
    const fetchData = async () => {
      if (!examId) return;
      
      try {
        const examSnap = await getDoc(doc(db, 'exams', examId));
        if (examSnap.exists()) {
          setExam({ id: examSnap.id, ...examSnap.data() } as Exam);
          
          const questionsSnap = await getDocs(collection(db, 'exams', examId, 'questions'));
          const questionsList = questionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
          setQuestions(questionsList);
          setAnswers(new Array(questionsList.length).fill(-1));
          setTimeLeft(questionsList.length * 2 * 60); // 2 minutes per question
        }
      } catch (error) {
        console.error("Error fetching exam:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [examId]);

  useEffect(() => {
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleSelectAnswer = (value: number | string) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = value;
    setAnswers(newAnswers);
  };

  const handleSubmit = async () => {
    if (!exam || submitting) return;
    
    const unansweredCount = answers.filter(a => a === -1).length;
    if (unansweredCount > 0 && timeLeft > 0) {
      if (!window.confirm(`Masih ada ${unansweredCount} soal yang belum dijawab. Yakin ingin mengakhiri ujian?`)) return;
    }

    setSubmitting(true);
    try {
      // Calculate score
      let correctCount = 0;
      let scorableCount = 0;
      
      questions.forEach((q, i) => {
        const studentAnswer = answers[i];
        const correctAnswer = q.correctAnswer;
        
        if (q.type === 'PG') {
          scorableCount++;
          if (studentAnswer === correctAnswer) correctCount++;
        } else if (q.type === 'ISIAN SINGKAT') {
          scorableCount++;
          if (String(studentAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
            correctCount++;
          }
        }
        // ESSAI is not automatically scored
      });

      const score = scorableCount > 0 ? Math.round((correctCount / scorableCount) * 100) : 0;
      const student = JSON.parse(localStorage.getItem('cbt_student') || 'null');
      const studentId = auth.currentUser?.uid || student?.uid;
      const studentName = auth.currentUser?.displayName || student?.displayName || 'Siswa';

      const resultData: Omit<ExamResult, 'id'> = {
        examId: exam.id,
        studentId: studentId || 'anonymous',
        studentName,
        score,
        answers,
        violations,
        completedAt: new Date().toISOString(),
      };

      // Update session status if deviceId exists
      const deviceId = localStorage.getItem('deviceId');
      if (deviceId) {
        try {
          const sessionRef = doc(db, 'sessions', deviceId);
          await updateDoc(sessionRef, {
            status: 'inactive',
            lastUpdate: serverTimestamp()
          });
        } catch (err) {
          console.warn("Failed to update session status on submit:", err);
        }
      }

      try {
        await addDoc(collection(db, 'results'), resultData);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.WRITE, 'results');
      }
      navigate('/');
    } catch (error) {
      console.error("Error submitting exam:", error);
      alert('Gagal mengirim jawaban. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-4 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900">Ujian Tidak Ditemukan</h1>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-600 font-bold hover:underline">Kembali ke Dashboard</button>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600 p-2 rounded-xl">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">{exam.subject}</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Kelas {exam.class} • Smt {exam.semester}</p>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className={cn(
              "flex items-center space-x-2 px-4 py-2 rounded-2xl font-mono font-bold text-lg transition-colors",
              timeLeft < 300 ? "bg-red-50 text-red-600 animate-pulse" : "bg-slate-100 text-slate-700"
            )}>
              <Clock className="w-5 h-5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Selesai'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-grow max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-8 p-4 md:p-8">
        {/* Main Question Area */}
        <div className="lg:col-span-3 space-y-6">
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-8 md:p-12">
              <div className="flex items-center space-x-3 mb-8">
                <span className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-xl font-black text-lg">
                  {currentQuestionIndex + 1}
                </span>
                <div className="h-px flex-grow bg-slate-100" />
              </div>

              <h2 className="text-xl md:text-2xl font-semibold text-slate-800 leading-relaxed mb-12">
                {currentQuestion.text}
              </h2>

              {currentQuestion.type === 'PG' && (
                <div className="grid grid-cols-1 gap-4">
                  {currentQuestion.options?.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectAnswer(index)}
                      className={cn(
                        "group flex items-center p-5 rounded-2xl border-2 text-left transition-all relative overflow-hidden",
                        answers[currentQuestionIndex] === index
                          ? "bg-blue-50 border-blue-600 shadow-lg shadow-blue-50"
                          : "bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 flex-shrink-0 rounded-xl font-bold flex items-center justify-center mr-4 transition-colors",
                        answers[currentQuestionIndex] === index
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600"
                      )}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span className={cn(
                        "text-lg font-medium transition-colors",
                        answers[currentQuestionIndex] === index ? "text-blue-900" : "text-slate-700"
                      )}>
                        {option}
                      </span>
                      {answers[currentQuestionIndex] === index && (
                        <motion.div
                          layoutId="active-indicator"
                          className="absolute right-6"
                        >
                          <CheckCircle2 className="w-6 h-6 text-blue-600" />
                        </motion.div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.type === 'ISIAN SINGKAT' && (
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Jawaban Anda</label>
                  <input
                    type="text"
                    value={answers[currentQuestionIndex] === -1 ? '' : answers[currentQuestionIndex] as string}
                    onChange={(e) => handleSelectAnswer(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all text-lg font-medium"
                    placeholder="Ketik jawaban di sini..."
                  />
                </div>
              )}

              {currentQuestion.type === 'ESSAI' && (
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Jawaban Anda</label>
                  <textarea
                    value={answers[currentQuestionIndex] === -1 ? '' : answers[currentQuestionIndex] as string}
                    onChange={(e) => handleSelectAnswer(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all text-lg font-medium min-h-[200px]"
                    placeholder="Tuliskan jawaban lengkap Anda di sini..."
                  />
                </div>
              )}
            </div>
          </motion.div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
              className="flex items-center space-x-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Sebelumnya</span>
            </button>
            
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Soal {currentQuestionIndex + 1} dari {questions.length}
            </div>

            <button
              onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentQuestionIndex === questions.length - 1}
              className="flex items-center space-x-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all disabled:opacity-30"
            >
              <span>Selanjutnya</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm sticky top-28">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">Navigasi Soal</h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={cn(
                    "w-full aspect-square flex items-center justify-center rounded-xl font-bold text-sm transition-all",
                    currentQuestionIndex === index
                      ? "bg-blue-600 text-white ring-4 ring-blue-100 shadow-lg"
                      : answers[index] !== -1
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-slate-400">Terjawab</span>
                <span className="text-green-600">{answers.filter(a => a !== -1).length}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(answers.filter(a => a !== -1).length / questions.length) * 100}%` }}
                  className="h-full bg-green-500"
                />
              </div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-slate-400">Belum Dijawab</span>
                <span className="text-slate-500">{answers.filter(a => a === -1).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Warning Modal */}
      <AnimatePresence>
        {showWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Peringatan!</h2>
                <p className="text-slate-600">
                  Anda terdeteksi meninggalkan halaman ujian. Harap tetap fokus pada halaman ini.
                </p>
                <p className="text-sm font-bold text-red-600 mt-4 uppercase tracking-wider">
                  Pelanggaran: {violations} / 5
                </p>
              </div>
              <button
                onClick={() => setShowWarning(false)}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                Saya Mengerti
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
