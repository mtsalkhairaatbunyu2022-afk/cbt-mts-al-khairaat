import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout to ensure loading is eventually set to false
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      if (firebaseUser) {
        try {
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setUser(data);
          } else {
            // Fallback for new users or if profile fetch fails
            const student = JSON.parse(localStorage.getItem('cbt_student') || 'null');
            const admin = JSON.parse(localStorage.getItem('cbt_admin') || 'null');
            
            if (student && (student.uid === firebaseUser.uid || firebaseUser.isAnonymous)) {
              setUser(student);
            } else if (admin && (admin.uid === firebaseUser.uid || firebaseUser.isAnonymous)) {
              setUser(admin);
            } else {
              // Create a temporary profile based on auth info
              const tempProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Siswa' : 'User'),
                role: firebaseUser.isAnonymous ? 'student' : 'admin',
                createdAt: new Date().toISOString(),
              };
              setUser(tempProfile);
            }
          }
        } catch (err) {
          // If Firestore fails, fallback to local storage or auth info
          const admin = JSON.parse(localStorage.getItem('cbt_admin') || 'null');
          const student = JSON.parse(localStorage.getItem('cbt_student') || 'null');
          if (admin) setUser(admin);
          else if (student) setUser(student);
        }
      } else {
        // Check local storage for sessions if Firebase Auth is not ready
        const admin = JSON.parse(localStorage.getItem('cbt_admin') || 'null');
        const student = JSON.parse(localStorage.getItem('cbt_student') || 'null');
        
        if (admin) {
          setUser(admin);
        } else if (student) {
          setUser(student);
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return { user, loading };
}
