import { useState, useCallback } from 'react';

interface ValidationRules {
  [key: string]: (value: any, formData?: any) => string | null;
}

export function useFormValidation(rules: ValidationRules) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = useCallback((fieldName: string, value: any, formData?: any) => {
    const rule = rules[fieldName];
    if (!rule) return;

    const error = rule(value, formData);
    setErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));

    return error;
  }, [rules]);

  const validateAll = useCallback((formData: Record<string, any>) => {
    const newErrors: Record<string, string> = {};

    Object.keys(rules).forEach(fieldName => {
      const rule = rules[fieldName];
      const error = rule(formData[fieldName], formData);
      if (error) {
        newErrors[fieldName] = error;
      }
    });

    setErrors(newErrors);
    return newErrors;
  }, [rules]);

  const clearError = useCallback((fieldName: string) => {
    setErrors(prev => ({
      ...prev,
      [fieldName]: ''
    }));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  const hasErrors = Object.values(errors).some(error => error.length > 0);

  return {
    errors,
    validateField,
    validateAll,
    clearError,
    clearAllErrors,
    hasErrors
  };
}
