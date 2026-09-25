import React from 'react';
import Link from 'next/link';
import { FEEDBACK_FORM_URL } from '@/src/constants/student-feedback';

export const StudentFeedbackFooter: React.FC = () => (
  <footer className="px-6 py-8 text-center border-t border-roman-terracotta/20 bg-white/70 backdrop-blur-sm">
    <Link
      href={FEEDBACK_FORM_URL}
      className="inline-flex items-center gap-2 text-sm font-medium text-roman-red hover:underline">
      Share your feedback
    </Link>
    <p className="mt-1 text-xs text-roman-stone">Help us improve Wake Forest Latin — it only takes a minute.</p>
  </footer>
);
