import { useFormSubmission as useFormSubmissionContext } from '@/contexts/form-submission-context';

export function useFormSubmission() {
  return useFormSubmissionContext();
}
