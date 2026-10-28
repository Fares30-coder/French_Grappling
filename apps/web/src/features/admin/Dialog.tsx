import { type ReactNode, useEffect, useRef } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider dialog (preview). */
  wide?: boolean;
};

/** Modal on top of the native <dialog>: focus trap, Escape and backdrop come from the browser. */
export function Dialog({ title, onClose, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      className={`m-auto rounded-lg p-0 backdrop:bg-black/40 ${
        wide ? 'h-[92vh] w-[min(1100px,96vw)]' : 'w-[min(32rem,94vw)]'
      }`}
    >
      <div className="flex h-full flex-col p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Fermer"
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
            onClick={() => ref.current?.close()}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </dialog>
  );
}
