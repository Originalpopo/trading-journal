import { useEffect, useRef } from "react";

// Open modals, oldest first. Esc only closes the one on top.
const openModals: symbol[] = [];

// Closes the modal on Esc. Inputs that use Esc themselves should call preventDefault() on it.
export function useEscapeToClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol("modal");
    openModals.push(id);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (openModals[openModals.length - 1] !== id) return;
      e.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const idx = openModals.indexOf(id);
      if (idx >= 0) openModals.splice(idx, 1);
    };
  }, [isOpen]);
}
