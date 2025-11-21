export interface KnowledgeBaseEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface SecurityQuestion {
  id: string;
  text: string;
  category: string | null;
  created_at: string;
}

export interface GeneratedAnswer {
  id: string;
  question_id: string;
  question_text: string;
  answer_text: string;
  category: string | null;
  created_at: string;
}
