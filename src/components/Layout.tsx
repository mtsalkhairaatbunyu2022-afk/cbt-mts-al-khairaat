import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { LogOut, User as UserIcon, BookOpen, LayoutDashboard, ClipboardList, Users, Menu, X as CloseIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Safety timeout to ensure loading is eventually set to false
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeout);
      setUser(user);
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            const student = JSON.parse(localStorage.getItem('cbt_student') || 'null');
            const admin = JSON.parse(localStorage.getItem('cbt_admin') || 'null');
            if (student && (student.uid === user.uid || user.isAnonymous)) {
              setProfile(student);
            } else if (admin && (admin.uid === user.uid || user.isAnonymous)) {
              setProfile(admin);
            } else {
              setProfile(null);
            }
          }
        } catch (err) {
          // Silent fail
        }
      } else {
        const student = JSON.parse(localStorage.getItem('cbt_student') || 'null');
        const admin = JSON.parse(localStorage.getItem('cbt_admin') || 'null');
        if (student) {
          setProfile(student);
        } else if (admin) {
          setProfile(admin);
        } else {
          setProfile(null);
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('cbt_student');
    localStorage.removeItem('cbt_admin');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {profile && (
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-8">
                <Link to="/" className="flex items-center space-x-2">
                  <div className="bg-blue-600 p-1.5 rounded-lg">
                    <ClipboardList className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xl font-bold text-slate-900 tracking-tight">CBT Pro</span>
                </Link>
                
                <div className="hidden md:flex items-center space-x-4">
                  <Link to="/" className="text-slate-600 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                  {profile?.role === 'admin' && (
                    <>
                      <Link to="/exams/create" className="text-slate-600 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1">
                        <BookOpen className="w-4 h-4" />
                        <span>Buat Ujian</span>
                      </Link>
                      <Link to="/students" className="text-slate-600 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1">
                        <Users className="w-4 h-4" />
                        <span>Siswa</span>
                      </Link>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 md:space-x-4">
                <div className="hidden sm:flex items-center space-x-3 px-3 py-1.5 bg-slate-100 rounded-full">
                  <UserIcon className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">{profile?.displayName || user?.email}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {profile?.role || 'User'}
                  </span>
                </div>
                
                <button
                  onClick={handleLogout}
                  className="hidden sm:block p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {isMobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden border-t border-slate-100 bg-white overflow-hidden"
              >
                <div className="px-4 py-4 space-y-2">
                  <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl mb-4 sm:hidden">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <UserIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{profile?.displayName || user?.email}</div>
                      <div className="text-[10px] uppercase font-bold text-blue-600">{profile?.role || 'User'}</div>
                    </div>
                  </div>

                  <Link 
                    to="/" 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center space-x-3 p-3 text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all font-bold"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                    <span>Dashboard</span>
                  </Link>
                  
                  {profile?.role === 'admin' && (
                    <>
                      <Link 
                        to="/exams/create" 
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center space-x-3 p-3 text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all font-bold"
                      >
                        <BookOpen className="w-5 h-5" />
                        <span>Buat Ujian</span>
                      </Link>
                      <Link 
                        to="/students" 
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center space-x-3 p-3 text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all font-bold"
                      >
                        <Users className="w-5 h-5" />
                        <span>Manajemen Siswa</span>
                      </Link>
                    </>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-3 p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all font-bold mt-4 border-t border-slate-100 pt-6"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Keluar Aplikasi</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      )}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} CBT Pro - Sistem Ujian Sekolah Profesional
        </div>
      </footer>
    </div>
  );
}
