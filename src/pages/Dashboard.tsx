import React from 'react';
import { useAuth } from '../hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { user: profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (profile?.role === 'admin') {
    return <AdminDashboard />;
  }

  return <StudentDashboard />;
}
