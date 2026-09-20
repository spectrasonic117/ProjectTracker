import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** true → botón de confirmación en rojo (acción destructiva). */
  danger?: boolean;
  /** 'alert' oculta el botón de cancelar (p. ej. para mostrar un error). */
  mode?: 'confirm' | 'alert';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false);
      if (event.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/25 p-6 backdrop-blur-sm dark:bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) settle(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={options.title}
            className="pop-in w-full max-w-sm rounded-3xl border border-black/[.06] bg-white p-6 shadow-2xl dark:border-white/[.08] dark:bg-[#1c1c1e]"
          >
            <h3 className="text-[15px] font-semibold tracking-[-.01em]">{options.title}</h3>
            {options.message && (
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{options.message}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {options.mode !== 'alert' && (
                <button type="button" className="btn-ghost" onClick={() => settle(false)}>
                  Cancelar
                </button>
              )}
              <button
                type="button"
                autoFocus
                className={options.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
