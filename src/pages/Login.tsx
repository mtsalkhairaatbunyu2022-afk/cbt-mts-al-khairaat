import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { LogIn, ShieldCheck, GraduationCap, AlertCircle, Eye, EyeOff, Loader2, Chrome } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously, updateProfile } from 'firebase/auth';

export default function Login() {
  const [activeTab, setActiveTab] = useState<'student' | 'teacher'>('student');
  const [studentId, setStudentId] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Clear any existing sessions to prevent conflicts
    try {
      await signOut(auth);
      localStorage.removeItem('cbt_admin');
      localStorage.removeItem('cbt_student');
    } catch (clearErr) {
      // Silent fail
    }

    const normalizedUsername = adminUsername.trim().toUpperCase().replace(/\s+/g, '');
    const trimmedPassword = password.trim();

    if (normalizedUsername === 'MTSBUNYU' && trimmedPassword === 'MTSBUNYU2026') {
      try {
        const adminEmail = 'admin@mtsbunyu.sch.id';
        const adminPassword = 'ADMIN_MTS_BUNYU_SECURE_2026'; // Internal secure password
        
        let firebaseUser;
        try {
          // Try to sign in with internal admin account
          const result = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
          firebaseUser = result.user;
        } catch (signInErr: any) {
          // If user doesn't exist, create it
          if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
            try {
              const result = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
              firebaseUser = result.user;
              await updateProfile(firebaseUser, { displayName: 'MTS BUNYU' });
            } catch (createErr) {
              console.error('Failed to create internal admin:', createErr);
              // Fallback to local only if creation fails
            }
          } else {
            throw signInErr;
          }
        }

        const adminProfile: UserProfile = {
          uid: firebaseUser?.uid || 'admin_mts_bunyu',
          email: adminEmail,
          displayName: 'MTS BUNYU',
          role: 'admin',
          createdAt: new Date().toISOString(),
          // Add secret key to profile so it's included in Firestore writes
          adminSecret: 'MTSBUNYU2026'
        } as any;

        // Sync to Firestore
        if (firebaseUser) {
          try {
            await setDoc(doc(db, 'users', firebaseUser.uid), adminProfile, { merge: true });
          } catch (fsErr) {
            console.warn('Firestore sync failed:', fsErr);
          }
        }

        localStorage.setItem('cbt_admin', JSON.stringify(adminProfile));
        navigate('/');
      } catch (err: any) {
        console.error('Admin login error:', err);
        // If it's just a configuration error, we can still proceed with local session
        // since our new firestore rules will look for the adminSecret in the data
        if (err.code === 'auth/operation-not-allowed') {
          const fallbackProfile: UserProfile = {
            uid: 'admin_mts_bunyu',
            email: 'admin@mtsbunyu.sch.id',
            displayName: 'MTS BUNYU',
            role: 'admin',
            createdAt: new Date().toISOString(),
            adminSecret: 'MTSBUNYU2026'
          } as any;
          localStorage.setItem('cbt_admin', JSON.stringify(fallbackProfile));
          navigate('/');
          return;
        }
        setError('Terjadi kesalahan saat login Admin. Pastikan koneksi internet stabil.');
      }
    } else {
      setError('Username atau Password Admin salah.');
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const adminProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Admin',
        role: 'admin',
        createdAt: new Date().toISOString(),
      };

      // Try to save profile, but it might fail if not the bootstrap admin
      try {
        await setDoc(doc(db, 'users', user.uid), adminProfile, { merge: true });
      } catch (fsErr) {
        // If it fails, we still set it in local storage, 
        // but firestore rules will block access if role isn't 'admin'
      }

      localStorage.setItem('cbt_admin', JSON.stringify(adminProfile));
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('Gagal login dengan Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Clear any existing sessions to prevent conflicts
    try {
      await signOut(auth);
      localStorage.removeItem('cbt_admin');
      localStorage.removeItem('cbt_student');
    } catch (clearErr) {
      // Silent fail
    }

    const trimmedStudentId = studentId.trim();

    try {
      const q = query(
        collection(db, 'users'),
        where('studentId', '==', trimmedStudentId),
        where('role', '==', 'student')
      );
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (fsErr: any) {
        if (fsErr.message?.includes('permission-denied')) {
          setError('Izin database ditolak. Pastikan sistem sudah dikonfigurasi dengan benar.');
        } else {
          setError('Gagal menghubungi server database.');
        }
        handleFirestoreError(fsErr, OperationType.LIST, 'users');
        return;
      }
      
      if (querySnapshot.empty) {
        setError('ID Siswa tidak terdaftar.');
      } else {
        const studentDoc = querySnapshot.docs[0];
        const studentData = studentDoc.data() as UserProfile;
        
        try {
          // Use a deterministic internal email for the student
          const studentEmail = `student_${trimmedStudentId}@mtsbunyu.sch.id`;
          const studentPassword = `PASS_${trimmedStudentId}_STUDENT`;
          
          let firebaseUser;
          try {
            const result = await signInWithEmailAndPassword(auth, studentEmail, studentPassword);
            firebaseUser = result.user;
          } catch (signInErr: any) {
            if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
              const result = await createUserWithEmailAndPassword(auth, studentEmail, studentPassword);
              firebaseUser = result.user;
              await updateProfile(firebaseUser, { displayName: studentData.displayName });
            } else {
              throw signInErr;
            }
          }
          
          const updatedStudentData = { ...studentData, uid: firebaseUser.uid };
          if (studentData.uid !== firebaseUser.uid) {
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), updatedStudentData);
            } catch (fsErr) {
              handleFirestoreError(fsErr, OperationType.WRITE, `users/${firebaseUser.uid}`);
            }
          }

          localStorage.setItem('cbt_student', JSON.stringify(updatedStudentData));
          navigate('/');
        } catch (authErr: any) {
          console.error('Student internal auth error:', authErr);
          // Fallback to local session if auth fails
          localStorage.setItem('cbt_student', JSON.stringify(studentData));
          navigate('/');
        }
      }
    } catch (err) {
      setError('Terjadi kesalahan saat login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200"
      >
        <div className="p-8 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-200">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CBT Bunyu</h1>
          <p className="text-slate-500 mt-2">Sistem Ujian Sekolah Profesional</p>
        </div>

        <div className="px-8 flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab('student')}
            className={cn(
              "flex-1 py-4 text-sm font-semibold transition-colors relative",
              activeTab === 'student' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Siswa
            {activeTab === 'student' && (
              <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('teacher')}
            className={cn(
              "flex-1 py-4 text-sm font-semibold transition-colors relative",
              activeTab === 'teacher' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Guru / Admin
            {activeTab === 'teacher' && (
              <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'student' ? (
              <motion.form
                key="student"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleStudentLogin}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">ID Siswa</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Masukkan ID Siswa"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center space-x-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <button
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      <span>Masuk sebagai Siswa</span>
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="teacher"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleAdminLogin}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Username Admin</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Masukkan Username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center space-x-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <button
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      <span>Masuk sebagai Admin</span>
                    </>
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-slate-500">Atau</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <Chrome className="w-5 h-5 text-red-500" />
                  <span>Masuk dengan Google</span>
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
