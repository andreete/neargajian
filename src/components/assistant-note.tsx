import { SparkIcon } from './icons';

/** "Drafted by the payroll assistant from: …" with the maker's own words (one quote per message). */
export function AssistantNote({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  return (
    <div className="assistant-note" role="note" data-testid="assistant-note">
      <SparkIcon size={18} />
      <div>
        <strong>Drafted by the payroll assistant from:</strong>
        {lines.map((l, i) => <blockquote key={i}>“{l}”</blockquote>)}
        <span className="hint">The assistant only turned these words into a draft request. The app picked the recipients from the directory, and only the maker can submit the run.</span>
      </div>
    </div>
  );
}
