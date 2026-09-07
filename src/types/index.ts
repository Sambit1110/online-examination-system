export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'admin';
  rollNumber?: string | null;
  department?: string;
}

export interface Option {
  option_id: string;
  question_id: string;
  option_text: string;
  is_correct?: number | boolean; // Only visible to admin!
}

export interface Question {
  question_id: string;
  exam_id: string | null;
  question_text: string;
  marks: number;
  question_type: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'active' | 'deactivated';
  options: Option[];
  selectedOptionId?: string | null;
  isMarkedForReview?: boolean;
  correctOptionId?: string | null;
  isCandidateCorrect?: boolean;
  // Present on the results-review payload (raw SQL column, not camelCased server-side)
  selected_option_id?: string | null;
}

export interface Examination {
  exam_id: string;
  title: string;
  description: string;
  duration_minutes: number;
  start_time: string;
  end_time: string;
  total_marks: number;
  pass_percentage: number;
  negative_marks_per_question: number;
  status: 'draft' | 'scheduled' | 'live' | 'completed' | 'released';
  results_released: number;
  question_count?: number;
  attempt_status?: 'in_progress' | 'submitted' | 'timed_out' | null;
  attempt_id?: string | null;
  result_id?: string | null;
  marks_obtained?: number | null;
  percentage?: number | null;
  result_status?: 'pass' | 'fail' | null;
  accessState?: 'live' | 'upcoming' | 'expired' | 'completed' | 'in_progress';
  canStart?: boolean;
  isReleased?: boolean;
}

export interface ExamAttempt {
  attempt_id: string;
  user_id: string;
  exam_id: string;
  start_time: string;
  time_remaining_seconds: number;
  status: 'in_progress' | 'submitted' | 'timed_out';
  submitted_at?: string;
}

// Live admin monitoring — GET /api/admin/live-attempts
export interface LiveAttempt {
  attemptId: string;
  studentName: string;
  rollNumber: string | null;
  examTitle: string;
  examId: string;
  elapsedSeconds: number;
  remainingSeconds: number;
  answeredCount: number;
  totalQuestions: number;
}

export interface Result {
  result_id: string;
  attempt_id: string;
  user_id: string;
  exam_id: string;
  marks_obtained: number;
  total_marks: number;
  percentage: number;
  status: 'pass' | 'fail';
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  evaluated_at: string;
  exam_title?: string;
  results_released?: number;
  pass_percentage?: number;
  duration_minutes?: number;
  student_name?: string;
  student_email?: string;
  roll_number?: string;
  department?: string;
}

// Exam-session integrity monitoring (tab/window focus signals only — no
// webcam/mic/screen capture). Structured client-side; bridged to the server
// via the existing audit log so it can later move to a dedicated table
// without changing this shape.
export type IntegrityEventType = 'tab_hidden' | 'tab_visible' | 'window_blur' | 'window_focus';

export interface IntegrityEvent {
  type: IntegrityEventType;
  timestamp: string; // ISO
  awayMs?: number; // populated on the "returned" event of a pair
}

export interface IntegritySummary {
  attemptId: string;
  examId: string;
  examTitle?: string;
  totalEvents: number;
  tabHiddenCount: number;
  windowBlurCount: number;
  totalAwayMs: number;
  events: IntegrityEvent[];
  generatedAt: string; // ISO
}

export interface AuditLog {
  log_id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  action: string;
  details: string;
  created_at: string;
}
