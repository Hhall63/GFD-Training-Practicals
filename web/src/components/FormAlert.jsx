function AlertIcon({ variant }) {
  if (variant === "success") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8.2l2 2L11 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // error / info: warning triangle
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path d="M8 1.5l6.5 11.5H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

export default function FormAlert({ variant, role = "alert", children }) {
  return (
    <div className={`form-alert form-alert--${variant}`} role={role}>
      <AlertIcon variant={variant} />
      <span>{children}</span>
    </div>
  );
}
