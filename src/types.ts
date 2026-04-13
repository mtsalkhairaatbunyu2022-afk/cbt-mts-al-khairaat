export type UserRole = 'admin' | 'student';
export type QuestionType = 'PG' | 'ISIAN SINGKAT' | 'ESSAI';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  studentId?: string; // For students
  class?: string; // For students
  createdAt: string;
}

export interface Exam {
  id: string;
  subject: string;
  topic: string;
  class: string;
  semester: string;
  academicYear: string;
  questionCount: number;
  questionType: QuestionType;
  token: string;
  createdBy: string;
  createdAt: string;
  status: 'active' | 'draft' | 'closed';
  externalUrl?: string; // For Google Forms or other external links
}

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: number | string; // Index of options for PG, string for ISIAN
  explanation?: string;
}

export interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  score: number;
  answers: (number | string)[]; // Array of selected option indices or text answers
  violations?: number;
  completedAt: string;
}
