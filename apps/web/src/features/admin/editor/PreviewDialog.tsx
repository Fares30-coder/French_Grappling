import { TechniqueView } from '../../techniques/TechniqueView';
import { Dialog } from '../Dialog';
import type { PreviewResult } from './to-preview';

/** The public page, rendered from the editor state (saved or not). */
export function PreviewDialog({ result, onClose }: { result: PreviewResult; onClose: () => void }) {
  return (
    <Dialog title="Aperçu de la page publique" onClose={onClose} wide>
      {result.ok ? (
        <TechniqueView technique={result.technique} />
      ) : (
        <p role="alert" className="text-slate-800">
          Aperçu impossible : {result.reason}
        </p>
      )}
    </Dialog>
  );
}
