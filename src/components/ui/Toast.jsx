import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

const ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
}

function ToastItem({ toast, onDismiss }) {
  return (
    <div className={`toast ${toast.type}`} role="alert" aria-live="polite">
      <span className="toast-icon">{ICONS[toast.type] ?? 'ℹ'}</span>
      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">×</button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
    setToasts(prev => [...prev.slice(-4), { id, type, title, message }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
  }, [])

  const success = useCallback((title, message, duration) => show({ type: 'success', title, message, duration }), [show])
  const error   = useCallback((title, message, duration) => show({ type: 'error',   title, message, duration }), [show])
  const warning = useCallback((title, message, duration) => show({ type: 'warning', title, message, duration }), [show])
  const info    = useCallback((title, message, duration) => show({ type: 'info',    title, message, duration }), [show])

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info, dismiss }}>
      {children}
      <div className="toast-viewport" aria-label="Notifications">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Hook: call inside any component wrapped by ToastProvider */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
