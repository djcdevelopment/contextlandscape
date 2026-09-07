export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="ui-read-error" role="alert"><p>{message}</p><button type="button" onClick={onRetry}>Try again</button></div>;
}
