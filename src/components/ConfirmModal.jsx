import { useEffect } from 'react'

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
      if (e.key === 'Enter') onConfirm?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div className="dashboard__modal-backdrop" onClick={onCancel}>
      <div
        className="dashboard__modal dashboard__modal--confirm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {title && <h3 className="dashboard__modal-title">{title}</h3>}
        {body && <p className="dashboard__modal-body">{body}</p>}
        <div className="dashboard__modal-actions">
          <button
            type="button"
            className="dashboard__btn dashboard__btn--ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`dashboard__btn${tone === 'destructive' ? ' dashboard__btn--destructive' : ''}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
