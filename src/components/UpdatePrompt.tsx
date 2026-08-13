import { useRegisterSW } from 'virtual:pwa-register/react'
import { IconCheck, IconClose } from './Icons'

/**
 * L'invite de mise à jour. Une nouvelle version attend dans le service worker,
 * mais on ne recharge pas la page sans prévenir : quelqu'un peut être en train
 * d'écrire, ou avoir des notes déverrouillées que le rechargement refermerait.
 * On propose, l'utilisateur choisit son moment.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="update-prompt" role="status">
      <IconCheck className="update-prompt__icon" />
      <p className="update-prompt__text">Une nouvelle version de Folio est prête.</p>
      <button
        type="button"
        className="update-prompt__action"
        onClick={() => updateServiceWorker(true)}
      >
        Recharger
      </button>
      <button
        type="button"
        className="update-prompt__close"
        aria-label="Plus tard"
        title="Plus tard"
        onClick={() => setNeedRefresh(false)}
      >
        <IconClose />
      </button>
    </div>
  )
}
