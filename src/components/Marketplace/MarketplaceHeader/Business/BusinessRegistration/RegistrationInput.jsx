import { forwardRef } from "react";

const RegistrationInput = forwardRef(function RegistrationInput({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={`kt-registration-input h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${className}`}
    />
  );
});

export default RegistrationInput;
