import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "../../types";

type MenuPosition = { top: number; left: number };

function MenuIcon({ type }: { type: "edit" | "key" | "activate" | "deactivate" | "delete" }) {
  if (type === "edit") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="m4 20 4.2-1 10.4-10.4a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "key") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 12h8m-3 0v3m-3-3v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "activate") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M20 7 10 17l-5-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "deactivate") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="m7 7 10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserActionsMenu({
  user,
  canEdit,
  canResetPassword,
  canChangeStatus,
  canDeleteForever,
  busy,
  onEdit,
  onResetPassword,
  onActivate,
  onDeactivate,
  onDeleteForever,
}: {
  user: User;
  canEdit: boolean;
  canResetPassword: boolean;
  canChangeStatus: boolean;
  canDeleteForever: boolean;
  busy: boolean;
  onEdit: () => void;
  onResetPassword: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDeleteForever: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inactive = user.active === false;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const itemCount =
      Number(canEdit) +
      Number(canResetPassword) +
      Number(canChangeStatus) +
      Number(canDeleteForever);
    const menuWidth = 192;
    const menuHeight = itemCount * 41 + 16;
    const gap = 4;
    const openUp = rect.bottom + gap + menuHeight > window.innerHeight - 8;
    setPosition({
      top: openUp ? Math.max(8, rect.top - gap - menuHeight) : rect.bottom + gap,
      left: Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8),
    });
  }, [canChangeStatus, canDeleteForever, canEdit, canResetPassword, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function closeMenu() {
      setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const menu =
    open && position
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for ${user.name}`}
            style={position}
            className="fixed z-[80] w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => run(onEdit)}
              >
                <MenuIcon type="edit" />
                Edit
              </button>
            )}
            {canResetPassword && (
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => run(onResetPassword)}
              >
                <MenuIcon type="key" />
                Reset password
              </button>
            )}
            {(canEdit || canResetPassword) && (canChangeStatus || canDeleteForever) && (
              <hr className="tb-menu-divider" />
            )}
            {canChangeStatus &&
              (inactive ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className="tb-menu-item text-emerald-700"
                  onClick={() => run(onActivate)}
                >
                  <MenuIcon type="activate" />
                  Activate user
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className="tb-menu-item-danger"
                  onClick={() => run(onDeactivate)}
                >
                  <MenuIcon type="deactivate" />
                  Deactivate user
                </button>
              ))}
            {canDeleteForever && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                className="tb-menu-item-danger"
                onClick={() => run(onDeleteForever)}
              >
                <MenuIcon type="delete" />
                Delete forever
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`tb-kebab-btn ${open ? "is-open" : ""}`}
        aria-label={`More actions for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {menu}
    </>
  );
}
