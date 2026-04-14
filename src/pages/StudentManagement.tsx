import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, setDoc, doc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile } from '../types';
import { UserPlus, GraduationCap, Key, Search, AlertCircle, CheckCircle2, Loader2, Upload, Printer, FileSpreadsheet, X, Trash2, Edit, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

import { useAuth } from '../hooks/useAuth';

export default function StudentManagement() {
  const { user, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'VII' | 'VIII' | 'IX'>('VII');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  
  const [newStudent, setNewStudent] = useState({
    displayName: '',
    studentId: '',
    class: 'VII',
  });

  const [editingStudent, setEditingStudent] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: '',
    studentId: '',
    class: 'VII',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      let snap;
      try {
        snap = await getDocs(q);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.LIST, 'users');
        setError('Gagal mengambil data siswa. Periksa koneksi atau izin akses Anda.');
        return;
      }
      const list = snap.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id
      } as UserProfile));
      setStudents(list);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError('Terjadi kesalahan saat memuat data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user && !auth.currentUser) {
        const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
          if (firebaseUser) {
            fetchStudents();
          }
        });
        return () => unsubscribe();
      }
      if (user && auth.currentUser) {
        fetchStudents();
      } else if (!user) {
        setLoading(false);
      }
    }
  }, [user, authLoading]);

  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if student ID already exists
      const q = query(collection(db, 'users'), where('studentId', '==', newStudent.studentId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError('ID Siswa sudah digunakan.');
        setAdding(false);
        return;
      }

      // Create a unique UID for the student (since they don't use Firebase Auth directly)
      const studentUid = `std_${Math.random().toString(36).substring(2, 15)}`;
      
      const studentData: UserProfile & { adminSecret?: string } = {
        uid: studentUid,
        email: `${newStudent.studentId}@cbt.local`,
        displayName: newStudent.displayName,
        role: 'student',
        studentId: newStudent.studentId,
        class: newStudent.class,
        createdAt: new Date().toISOString(),
        adminSecret: (user as any)?.adminSecret || 'MTSBUNYU2026'
      };

      await setDoc(doc(db, 'users', studentUid), studentData);
      
      setStudents([...students, studentData]);
      setNewStudent({ displayName: '', studentId: '', class: activeTab });
      setSuccess('Siswa berhasil ditambahkan.');
      setShowAddModal(false);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Gagal menambahkan siswa.');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteStudent = async (uid: string) => {
    setAdding(true);
    setError(null);

    try {
      await deleteDoc(doc(db, 'users', uid));
      setStudents(students.filter(s => s.uid !== uid));
      setSuccess('Siswa berhasil dihapus.');
      setStudentToDelete(null);
      setShowDeleteModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Delete error:", err);
      setError('Gagal menghapus siswa. Periksa izin akses Anda.');
    } finally {
      setAdding(false);
    }
  };

  const toggleSelectAll = () => {
    const allFilteredUids = filteredStudents.map(s => s.uid);
    const allSelected = allFilteredUids.length > 0 && allFilteredUids.every(uid => selectedIds[uid]);
    
    const newSelected = { ...selectedIds };
    if (allSelected) {
      allFilteredUids.forEach(uid => { delete newSelected[uid]; });
    } else {
      allFilteredUids.forEach(uid => { newSelected[uid] = true; });
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectStudent = (uid: string) => {
    setSelectedIds(prev => {
      const next = { ...prev };
      if (next[uid]) {
        delete next[uid];
      } else {
        next[uid] = true;
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds({});
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleDeleteSelected = async () => {
    const uidsToDelete = Object.keys(selectedIds).filter(uid => selectedIds[uid]);
    if (uidsToDelete.length === 0) return;
    
    setAdding(true);
    setError(null);

    try {
      const batchSize = 500;
      
      for (let i = 0; i < uidsToDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = uidsToDelete.slice(i, i + batchSize);
        chunk.forEach(uid => {
          batch.delete(doc(db, 'users', uid));
        });
        await batch.commit();
      }
      
      const deletedSet = new Set(uidsToDelete);
      setStudents(prev => prev.filter(s => !deletedSet.has(s.uid)));
      setSelectedIds({});
      setIsBulkDelete(false);
      setShowDeleteModal(false);
      setSuccess(`${uidsToDelete.length} siswa berhasil dihapus.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Bulk delete error:", err);
      setError('Gagal menghapus data terpilih. Periksa izin akses Anda.');
    } finally {
      setAdding(false);
    }
  };

  const openEditModal = (student: UserProfile) => {
    setEditingStudent(student);
    setEditForm({
      displayName: student.displayName,
      studentId: student.studentId || '',
      class: student.class || 'VII',
    });
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setAdding(true);
    setError(null);

    try {
      const updatedData = {
        ...editingStudent,
        displayName: editForm.displayName,
        studentId: editForm.studentId,
        class: editForm.class,
        email: `${editForm.studentId}@cbt.local`,
        adminSecret: (user as any)?.adminSecret || 'MTSBUNYU2026'
      };

      await setDoc(doc(db, 'users', editingStudent.uid), updatedData);
      
      setStudents(students.map(s => s.uid === editingStudent.uid ? updatedData : s));
      setEditingStudent(null);
      setSuccess('Data siswa berhasil diperbarui.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Gagal memperbarui data siswa.');
    } finally {
      setAdding(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          if (data.length === 0) {
            setError('File Excel kosong atau format tidak valid.');
            setAdding(false);
            return;
          }

          const batch = writeBatch(db);
          const newStudentsList: UserProfile[] = [];
          
          for (const row of data) {
            // Priority column detection based on user request: NOMOR, NAMA LENGKAP, NAMA
            const name = row['NAMA LENGKAP'] || row['NAMA'] || row['Nama Lengkap'] || row['Nama'] || row['nama'] || row['nama lengkap'] || 
                         row['NAMA SISWA'] || row['Nama Siswa'] || row['nama siswa'] || row['Name'] || row['name'] || row['Full Name'];
            
            if (!name) continue;

            let id = String(row['NOMOR'] || row['Nomor'] || row['nomor'] || row['NO'] || row['no'] ||
                            row['ID'] || row['id'] || row['Username'] || row['username'] || row['ID Siswa'] || row['id siswa'] || '').trim();
            
            if (!id || id === 'undefined' || id === '') {
              // Generate ID from name: first word + random 3 digits
              const firstWord = String(name).split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
              id = `${firstWord}${Math.floor(100 + Math.random() * 900)}`;
            }
            
            // Normalize Class
            let rawCls = String(row['KELAS'] || row['Kelas'] || row['kelas'] || row['Class'] || row['class'] || '').trim().toUpperCase();
            let cls = '';
            
            // Handle various class formats (Check VIII before VII because VIII contains VII)
            if (rawCls.includes('VIII') || rawCls === '8' || rawCls.includes('8')) cls = 'VIII';
            else if (rawCls.includes('VII') || rawCls === '7' || rawCls.includes('7')) cls = 'VII';
            else if (rawCls.includes('IX') || rawCls === '9' || rawCls.includes('9')) cls = 'IX';
            else cls = activeTab; // Fallback to current active tab if class not specified correctly

            const studentUid = `std_${Math.random().toString(36).substring(2, 15)}`;
            const studentData: UserProfile & { adminSecret?: string } = {
              uid: studentUid,
              email: `${id}@cbt.local`,
              displayName: name,
              role: 'student',
              studentId: id,
              class: cls,
              createdAt: new Date().toISOString(),
              adminSecret: (user as any)?.adminSecret || 'MTSBUNYU2026'
            };

            const studentRef = doc(db, 'users', studentUid);
            batch.set(studentRef, studentData);
            newStudentsList.push(studentData);
          }

          await batch.commit();
          
          if (newStudentsList.length > 0) {
            setStudents(prev => [...prev, ...newStudentsList]);
            setSuccess(`${newStudentsList.length} siswa berhasil diimpor.`);
          } else {
            setError('Tidak ada data siswa yang diimpor. Pastikan judul kolom sesuai (NOMOR, NAMA LENGKAP).');
          }
          
          if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
          setError('Gagal memproses file Excel. Pastikan format kolom benar (NOMOR, NAMA LENGKAP).');
        } finally {
          setAdding(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      setError('Gagal membaca file.');
      setAdding(false);
    }
  };

  const handlePrintCards = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const studentsToPrint = filteredStudents;

    const html = `
      <html>
        <head>
          <title>Kartu Login Siswa - MTs Al-Khairaat Bunyu</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
            .card { border: 2px solid #334155; padding: 15px; border-radius: 10px; position: relative; overflow: hidden; }
            .header { border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px; text-align: center; }
            .header h1 { margin: 0; font-size: 14px; color: #1e293b; }
            .header p { margin: 2px 0 0; font-size: 10px; color: #64748b; font-weight: bold; }
            .content { font-size: 12px; }
            .row { display: flex; margin-bottom: 5px; }
            .label { width: 80px; font-weight: bold; color: #475569; }
            .value { font-weight: bold; color: #0f172a; }
            .footer { margin-top: 10px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px dashed #e2e8f0; pt: 5px; }
            @media print {
              .no-print { display: none; }
              .card { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${studentsToPrint.map(s => `
              <div class="card">
                <div class="header">
                  <h1>KARTU LOGIN UJAN (CBT)</h1>
                  <p>MTs AL-KHAIRAAT BUNYU</p>
                </div>
                <div class="content">
                  <div class="row">
                    <div class="label">Nama</div>
                    <div class="value">: ${s.displayName}</div>
                  </div>
                  <div class="row">
                    <div class="label">Kelas</div>
                    <div class="value">: ${s.class}</div>
                  </div>
                  <div class="row">
                    <div class="label">Username</div>
                    <div class="value">: ${s.studentId}</div>
                  </div>
                </div>
                <div class="footer">
                  Simpan kartu ini dengan baik. Jangan berikan password kepada orang lain.
                </div>
              </div>
            `).join('')}
          </div>
          <script>
            window.onload = () => {
              window.print();
              // window.close();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         student.studentId?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const studentClass = student.class?.toUpperCase() || '';
    const matchesTab = studentClass === activeTab ||
                       (activeTab === 'VII' && (studentClass === '7' || studentClass === 'VII')) ||
                       (activeTab === 'VIII' && (studentClass === '8' || studentClass === 'VIII')) ||
                       (activeTab === 'IX' && (studentClass === '9' || studentClass === 'IX'));
                       
    return matchesSearch && matchesTab;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 animate-pulse font-medium">Memuat data siswa...</p>
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
          onClick={fetchStudents}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
        >
          <RefreshCw className="w-5 h-5" />
          <span>Coba Lagi</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 md:gap-8 min-h-[600px]">
        {/* Sidebar */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:sticky lg:top-24">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Menu Utama</h2>
              <h1 className="text-xl font-black text-slate-900">Daftar Siswa</h1>
            </div>
            
            <div className="p-2 space-y-1">
              {(['VII', 'VIII', 'IX'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold transition-all group",
                    activeTab === tab 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      activeTab === tab ? "bg-white/20" : "bg-slate-100 group-hover:bg-blue-50"
                    )}>
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <span>Kelas {tab}</span>
                  </div>
                  <div className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-black",
                    activeTab === tab ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    {students.filter(s => {
                      const sCls = s.class?.toUpperCase() || '';
                      if (tab === 'VII') return sCls === 'VII' || sCls === '7';
                      if (tab === 'VIII') return sCls === 'VIII' || sCls === '8';
                      if (tab === 'IX') return sCls === 'IX' || sCls === '9';
                      return false;
                    }).length}
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full py-3 bg-white border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-500 hover:text-blue-600 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Tambah Siswa Baru</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Preview Data: Kelas {activeTab}</h2>
              <p className="text-sm text-slate-500 font-medium">Menampilkan data siswa yang terdaftar di jenjang ini.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls, .csv"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={adding}
                className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                title="Impor Excel"
              >
                <Upload className="w-5 h-5" />
              </button>
              <button
                onClick={handlePrintCards}
                disabled={filteredStudents.length === 0}
                className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                title="Cetak Kartu"
              >
                <Printer className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama atau nomor..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {selectedCount > 0 && (
                <button
                  onClick={() => {
                    setIsBulkDelete(true);
                    setShowDeleteModal(true);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-red-700 transition-all flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus ({selectedCount})</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4 w-10">
                      <input 
                        type="checkbox"
                        checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedIds[s.uid])}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-4">Nomor</th>
                    <th className="px-6 py-4">Nama Lengkap</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((student) => (
                    <tr key={student.uid} className={cn(
                      "hover:bg-slate-50/80 transition-colors group",
                      selectedIds[student.uid] && "bg-blue-50/50"
                    )}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox"
                          checked={!!selectedIds[student.uid]}
                          onChange={() => toggleSelectStudent(student.uid)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {student.studentId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{student.displayName}</div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Siswa Kelas {student.class}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openEditModal(student)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setStudentToDelete(student.uid);
                              setIsBulkDelete(false);
                              setShowDeleteModal(true);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                            <Search className="w-8 h-8 text-slate-200" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-slate-900 font-bold">Tidak Ada Data</p>
                            <p className="text-slate-400 text-xs">Belum ada siswa yang terdaftar di kelas {activeTab}.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Student Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-black text-slate-900">Tambah Siswa Baru</h2>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddStudent} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Nama Lengkap</label>
                    <input
                      type="text"
                      value={newStudent.displayName}
                      onChange={(e) => setNewStudent({ ...newStudent, displayName: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                      placeholder="Nama Siswa"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">ID Siswa (Username)</label>
                    <input
                      type="text"
                      value={newStudent.studentId}
                      onChange={(e) => setNewStudent({ ...newStudent, studentId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-bold"
                      placeholder="Contoh: 2024001"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Kelas</label>
                    <select
                      value={newStudent.class}
                      onChange={(e) => setNewStudent({ ...newStudent, class: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                      required
                    >
                      <option value="VII">Kelas VII</option>
                      <option value="VIII">Kelas VIII</option>
                      <option value="IX">Kelas IX</option>
                    </select>
                  </div>

                  <button
                    disabled={adding}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center justify-center space-x-2 mt-4"
                  >
                    {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>SIMPAN DATA SISWA</span>}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingStudent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingStudent(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Edit Data Siswa</h2>
                  <button
                    onClick={() => setEditingStudent(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleUpdateStudent} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Nama Lengkap</label>
                    <input
                      type="text"
                      value={editForm.displayName}
                      onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">ID Siswa (Username)</label>
                    <input
                      type="text"
                      value={editForm.studentId}
                      onChange={(e) => setEditForm({ ...editForm, studentId: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Kelas</label>
                    <select
                      value={editForm.class}
                      onChange={(e) => setEditForm({ ...editForm, class: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      required
                    >
                      <option value="VII">Kelas VII</option>
                      <option value="VIII">Kelas VIII</option>
                      <option value="IX">Kelas IX</option>
                    </select>
                  </div>

                  <div className="pt-4 flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setEditingStudent(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={adding}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Simpan Perubahan</span>}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {isBulkDelete ? 'Hapus Semua Terpilih?' : 'Hapus Siswa?'}
              </h3>
              <p className="text-slate-500 mb-8">
                {isBulkDelete 
                  ? `Apakah Anda yakin ingin menghapus ${selectedCount} siswa yang dipilih?`
                  : 'Apakah Anda yakin ingin menghapus siswa ini?'}
                <br />
                <span className="text-red-600 font-bold">Tindakan ini tidak dapat dibatalkan.</span>
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={() => isBulkDelete ? handleDeleteSelected() : (studentToDelete && handleDeleteStudent(studentToDelete))}
                  disabled={adding}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50 flex items-center justify-center"
                >
                  {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Hapus'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
