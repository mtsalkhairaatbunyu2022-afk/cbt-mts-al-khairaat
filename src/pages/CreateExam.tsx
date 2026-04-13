import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { GoogleGenAI, Type } from '@google/genai';
import { Exam, Question, QuestionType } from '../types';
import { Sparkles, Save, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Trash2, Plus, FileUp, FileText, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import mammoth from 'mammoth';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SUBJECTS = [
  { category: 'Agama Islam', items: ['Al-Qur\'an Hadits', 'Akidah Akhlak', 'Fikih', 'SKI', 'Bahasa Arab', 'Pendidikan Agama Islam'] },
  { category: 'Umum', items: ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA Terpadu', 'IPS Terpadu', 'PKn', 'PJOK', 'Seni Budaya', 'Prakarya', 'Informatika'] }
];

import { useAuth } from '../hooks/useAuth';

export default function CreateExam() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    subject: '',
    topic: '',
    class: '',
    semester: '1',
    academicYear: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
    questionCount: undefined as number | undefined,
    questionType: 'PG' as QuestionType,
    token: '',
    externalUrl: '',
  });

  const [questions, setQuestions] = useState<Partial<Question>[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const safeJsonParse = (str: string) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      // Try to fix truncated JSON
      let fixed = str.trim();
      
      // If it ends with a comma, remove it
      if (fixed.endsWith(',')) fixed = fixed.slice(0, -1);
      
      // Count open/close brackets
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      
      // If inside a string, close it
      const quoteCount = (fixed.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) fixed += '"';
      
      // Close open structures
      for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
      for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
      
      try {
        return JSON.parse(fixed);
      } catch (innerError) {
        console.error('Failed to parse even after fixing:', fixed);
        throw e; // Throw original error if fix fails
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!formData.subject || !formData.class || !formData.questionCount) {
      setError('Harap isi Mata Pelajaran, Kelas, dan Jumlah Soal terlebih dahulu.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    setGenerationTime(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setGenerationTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      let contentPart: any;

      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });
        const base64 = await base64Promise;
        contentPart = {
          inlineData: {
            data: base64,
            mimeType: 'application/pdf'
          }
        };
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        contentPart = {
          text: `Berikut adalah teks dari file Word: \n\n${result.value}`
        };
      } else {
        throw new Error('Format file tidak didukung. Gunakan PDF atau Word (.docx).');
      }

      const model = "gemini-3-flash-preview";
      let prompt = `Berdasarkan dokumen yang diberikan, buatkan TEPAT ${formData.questionCount} soal ${formData.questionType} untuk ujian ${formData.subject} materi ${formData.topic} kelas ${formData.class}. `;
      
      if (formData.questionType === 'PG') {
        prompt += `Pastikan jumlah soal yang dihasilkan adalah ${formData.questionCount}. Kembalikan respon dalam format JSON sebagai array objek dengan struktur:
        [
          {
            "text": "Teks pertanyaan di sini?",
            "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
            "correctAnswer": 0, // index opsi yang benar (0-3)
            "explanation": "Penjelasan sangat singkat"
          }
        ]`;
      } else if (formData.questionType === 'ISIAN SINGKAT') {
        prompt += `Pastikan jumlah soal yang dihasilkan adalah ${formData.questionCount}. Kembalikan respon dalam format JSON sebagai array objek dengan struktur:
        [
          {
            "text": "Teks pertanyaan di sini?",
            "correctAnswer": "Jawaban singkat yang benar",
            "explanation": "Penjelasan sangat singkat"
          }
        ]`;
      } else {
        prompt += `Pastikan jumlah soal yang dihasilkan adalah ${formData.questionCount}. Kembalikan respon dalam format JSON sebagai array objek dengan struktur:
        [
          {
            "text": "Teks pertanyaan esai di sini?",
            "explanation": "Kunci jawaban singkat"
          }
        ]`;
      }

      const response = await genAI.models.generateContent({
        model,
        contents: {
          parts: [
            contentPart,
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["text"],
            },
          },
        },
      });

      const generatedQuestions = safeJsonParse(response.text || '[]').map((q: any) => ({
        ...q,
        type: formData.questionType,
        correctAnswer: formData.questionType === 'PG' ? Number(q.correctAnswer) : q.correctAnswer
      }));
      
      setQuestions(prev => [...prev, ...generatedQuestions]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memproses file. Pastikan file tidak rusak dan coba lagi.');
    } finally {
      clearInterval(timer);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateAI = async () => {
    if (!formData.subject || !formData.class || !formData.questionCount) {
      setError('Harap isi Mata Pelajaran, Kelas, dan Jumlah Soal terlebih dahulu.');
      return;
    }

    setGenerating(true);
    setError(null);
    setGenerationTime(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setGenerationTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    let attempts = 0;
    const maxAttempts = 2;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        const model = "gemini-3-flash-preview";
        let prompt = `Buatkan TEPAT ${formData.questionCount} soal ${formData.questionType} untuk ujian ${formData.subject} materi ${formData.topic} kelas ${formData.class}, semester ${formData.semester}, tahun ajaran ${formData.academicYear}. `;
        
        if (formData.questionType === 'PG') {
          prompt += `Pastikan jumlah soal yang dihasilkan adalah ${formData.questionCount}. Kembalikan respon dalam format JSON sebagai array objek dengan struktur:
          [
            {
              "text": "Teks pertanyaan di sini?",
              "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
              "correctAnswer": 0, // index opsi yang benar (0-3)
              "explanation": "Penjelasan sangat singkat"
            }
          ]`;
        } else if (formData.questionType === 'ISIAN SINGKAT') {
          prompt += `Pastikan jumlah soal yang dihasilkan adalah ${formData.questionCount}. Kembalikan respon dalam format JSON sebagai array objek dengan struktur:
          [
            {
              "text": "Teks pertanyaan di sini?",
              "correctAnswer": "Jawaban singkat yang benar",
              "explanation": "Penjelasan sangat singkat"
            }
          ]`;
        } else {
          prompt += `Pastikan jumlah soal yang dihasilkan adalah ${formData.questionCount}. Kembalikan respon dalam format JSON sebagai array objek dengan struktur:
          [
            {
              "text": "Teks pertanyaan esai di sini?",
              "explanation": "Kunci jawaban singkat"
            }
          ]`;
        }

        prompt += `\nPastikan soal menantang dan relevan dengan kurikulum sekolah di Indonesia. Gunakan Bahasa Indonesia yang baik dan benar.`;

        const response = await genAI.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ["text"],
              },
            },
          },
        });

        const generatedQuestions = safeJsonParse(response.text || '[]').map((q: any) => ({
          ...q,
          type: formData.questionType,
          correctAnswer: formData.questionType === 'PG' ? Number(q.correctAnswer) : q.correctAnswer
        }));
        
        if (generatedQuestions.length > 0) {
          setQuestions(prev => [...prev, ...generatedQuestions]);
          success = true;
        } else {
          throw new Error('AI tidak menghasilkan soal.');
        }
      } catch (err: any) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error('AI Generation Error:', err);
          if (err.message?.includes('Rpc failed') || err.message?.includes('500')) {
            setError('Gagal menghubungi AI (Server Error). Silakan coba lagi dalam beberapa saat.');
          } else {
            setError(err.message || 'Gagal menghasilkan soal otomatis.');
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    clearInterval(timer);
    setGenerating(false);
  };

  const handleCancelGenerate = () => {
    setGenerating(false);
    setError('Generasi soal dibatalkan oleh pengguna.');
  };

  const handleSaveExam = async () => {
    if (questions.length === 0 && !formData.externalUrl) {
      setError('Harap buat soal atau masukkan link Google Form terlebih dahulu.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const examData: Omit<Exam, 'id'> = {
        ...formData,
        questionCount: formData.externalUrl ? 0 : (formData.questionCount || questions.length),
        createdBy: user?.uid || '',
        createdAt: new Date().toISOString(),
        status: 'active',
        adminSecret: (user as any)?.adminSecret || 'MTSBUNYU2026'
      } as any;

      const examRef = await addDoc(collection(db, 'exams'), examData);
      
      if (!formData.externalUrl) {
        // Batch write questions only if not an external link
        const batch = writeBatch(db);
        questions.forEach((q) => {
          const qRef = doc(collection(db, 'exams', examRef.id, 'questions'));
          batch.set(qRef, { 
            ...q, 
            examId: examRef.id, 
            type: formData.questionType,
            adminSecret: (user as any)?.adminSecret || 'MTSBUNYU2026'
          });
        });
        await batch.commit();
      }
      
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('Gagal menyimpan ujian. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const addManualQuestion = () => {
    setQuestions([...questions, {
      type: formData.questionType,
      text: '',
      options: formData.questionType === 'PG' ? ['', '', '', ''] : undefined,
      correctAnswer: formData.questionType === 'PG' ? 0 : '',
      explanation: ''
    }]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setQuestions(newQuestions);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...questions];
    const options = [...(newQuestions[qIndex].options || [])];
    options[oIndex] = value;
    newQuestions[qIndex] = { ...newQuestions[qIndex], options };
    setQuestions(newQuestions);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Kembali</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Buat Ujian Baru</h1>
        <div className="w-20" /> {/* Spacer */}
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Mata Pelajaran</label>
            <select
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="">Pilih Mapel</option>
              {SUBJECTS.map((cat) => (
                <optgroup key={cat.category} label={cat.category}>
                  {cat.items.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Materi</label>
            <input
              type="text"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Contoh: Aljabar Linear"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Kelas</label>
            <select
              value={formData.class}
              onChange={(e) => setFormData({ ...formData, class: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="">Pilih Kelas</option>
              <option value="VII">Kelas VII</option>
              <option value="VIII">Kelas VIII</option>
              <option value="IX">Kelas IX</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Jenis Soal</label>
            <select
              value={formData.questionType}
              onChange={(e) => setFormData({ ...formData, questionType: e.target.value as QuestionType })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="PG">Pilihan Ganda (PG)</option>
              <option value="ISIAN SINGKAT">Isian Singkat</option>
              <option value="ESSAI">Essai</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Semester</label>
            <select
              value={formData.semester}
              onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="1">Ganjil (1)</option>
              <option value="2">Genap (2)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Tahun Ajaran</label>
            <input
              type="text"
              value={formData.academicYear}
              onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Jumlah Soal</label>
            <input
              type="number"
              value={formData.questionCount || ''}
              onChange={(e) => setFormData({ ...formData, questionCount: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Masukkan jumlah soal"
              min="1"
              max="50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Token Ujian</label>
            <input
              type="text"
              value={formData.token}
              onChange={(e) => setFormData({ ...formData, token: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-bold"
              placeholder="Contoh: ABCDEF"
              maxLength={6}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-bold text-blue-600">Link Google Form (Opsional)</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="url"
                value={formData.externalUrl}
                onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
                className="w-full pl-12 pr-12 py-2.5 bg-blue-50/50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="https://docs.google.com/forms/d/e/..."
              />
              {formData.externalUrl && (
                <button
                  onClick={() => setFormData({ ...formData, externalUrl: '' })}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500 italic">Jika diisi, siswa akan diarahkan ke link ini saat memasukkan token.</p>
          </div>
        </div>

        {!formData.externalUrl && (
          <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleGenerateAI}
            disabled={generating || uploading || saving}
            className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Menghasilkan ({generationTime}s)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Buat Soal Otomatis (AI)</span>
              </>
            )}
          </button>

          <div className="relative flex-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.docx"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={generating || uploading || saving}
              className="w-full inline-flex items-center justify-center space-x-2 px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span>Memproses ({generationTime}s)...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-5 h-5 text-blue-600" />
                  <span>Upload Soal (Word/PDF)</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={addManualQuestion}
            disabled={generating || uploading || saving}
            className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            <span>Tambah Soal Manual</span>
          </button>
        </div>
        )}

        {generating && (
          <div className="flex justify-center">
            <button
              onClick={handleCancelGenerate}
              className="px-6 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all border border-red-100 text-sm"
            >
              Batalkan Generasi
            </button>
          </div>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">{error}</p>
            {error.includes('AI') && (
              <button
                onClick={handleGenerateAI}
                className="mt-2 text-xs font-bold underline hover:text-red-800 transition-colors flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Coba Lagi Sekarang
              </button>
            )}
          </div>
        </motion.div>
      )}

      {!formData.externalUrl && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
              <FileText className="w-6 h-6 text-blue-600" />
              <span>Daftar Soal ({questions.length})</span>
            </h2>
            {questions.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Hapus semua soal yang sudah dibuat?')) {
                    setQuestions([]);
                  }
                }}
                className="text-sm text-red-600 font-medium hover:underline flex items-center space-x-1"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Semua</span>
              </button>
            )}
          </div>

          <AnimatePresence>
            {questions.map((q, qIndex) => (
              <motion.div
                key={qIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative group"
              >
                <button
                  onClick={() => removeQuestion(qIndex)}
                  className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <div className="flex items-center space-x-3 mb-6">
                  <span className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-lg font-bold text-sm">
                    {qIndex + 1}
                  </span>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900">Pertanyaan</h3>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                      {q.type}
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  <textarea
                    value={q.text}
                    onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]"
                    placeholder="Ketik pertanyaan di sini..."
                  />

                  {q.type === 'PG' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {q.options?.map((opt, oIndex) => (
                        <div key={oIndex} className="flex items-center space-x-3">
                          <button
                            onClick={() => updateQuestion(qIndex, 'correctAnswer', oIndex)}
                            className={cn(
                              "w-10 h-10 flex-shrink-0 rounded-lg font-bold flex items-center justify-center transition-all border-2",
                              q.correctAnswer === oIndex
                                ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-100"
                                : "bg-white border-slate-200 text-slate-400 hover:border-blue-300"
                            )}
                          >
                            {String.fromCharCode(65 + oIndex)}
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                            className="flex-grow px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder={`Opsi ${String.fromCharCode(65 + oIndex)}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === 'ISIAN SINGKAT' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Jawaban Benar</label>
                      <input
                        type="text"
                        value={q.correctAnswer as string || ''}
                        onChange={(e) => updateQuestion(qIndex, 'correctAnswer', e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Masukkan jawaban singkat..."
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {q.type === 'ESSAI' ? 'Kunci Jawaban / Poin Penilaian' : 'Penjelasan (Opsional)'}
                    </label>
                    <textarea
                      value={q.explanation || ''}
                      onChange={(e) => updateQuestion(qIndex, 'explanation', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm min-h-[80px]"
                      placeholder={q.type === 'ESSAI' ? "Masukkan poin-poin jawaban..." : "Kenapa jawaban ini benar?"}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {!formData.externalUrl && questions.length > 0 && (
        <div className="fixed bottom-8 left-0 right-0 px-4 flex justify-center z-40">
          <button
            onClick={handleSaveExam}
            disabled={saving}
            className="flex items-center space-x-2 px-8 py-4 bg-green-600 text-white rounded-2xl font-bold shadow-2xl shadow-green-200 hover:bg-green-700 hover:scale-105 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Menyimpan Ujian...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                <span>Simpan & Aktifkan Ujian</span>
              </>
            )}
          </button>
        </div>
      )}

      {formData.externalUrl && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleSaveExam}
            disabled={saving}
            className="flex items-center space-x-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-105 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Menyimpan Link...</span>
              </>
            ) : (
              <>
                <Save className="w-6 h-6" />
                <span>Simpan & Aktifkan Link Ujian</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
