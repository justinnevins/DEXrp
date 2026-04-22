import { createContext, useContext, useState } from 'react';

type FormSubmissionContextType = {
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
};

const FormSubmissionContext = createContext<FormSubmissionContextType | undefined>(undefined);

export function FormSubmissionProvider({ children }: { children: React.ReactNode }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <FormSubmissionContext.Provider value={{ isSubmitting, setIsSubmitting }}>
      {children}
    </FormSubmissionContext.Provider>
  );
}

export function useFormSubmission() {
  const context = useContext(FormSubmissionContext);
  if (context === undefined) {
    throw new Error('useFormSubmission must be used within FormSubmissionProvider');
  }
  return context;
}
