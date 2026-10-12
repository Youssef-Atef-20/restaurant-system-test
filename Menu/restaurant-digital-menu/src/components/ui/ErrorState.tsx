interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="state-container" role="alert">
      <div className="state-icon error-icon" aria-hidden="true">!</div>
      <p className="state-message">{message}</p>
      <button className="retry-btn" onClick={onRetry} type="button">
        Try Again
      </button>
    </div>
  );
}
