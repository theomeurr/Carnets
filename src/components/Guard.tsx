import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Le filet.
 *
 * Sans lui, une erreur dans n'importe quel composant démonte l'arbre entier :
 * l'écran devient noir, et rien ne dit si les notes sont perdues — elles ne
 * le sont pas, elles sont sur le disque. On montre donc ce qui s'est passé,
 * ce que cela n'a pas touché, et de quoi repartir.
 *
 * Une classe, parce que React n'offre pas d'autre moyen d'intercepter une
 * erreur de rendu.
 */
export class Guard extends Component<{ children: ReactNode }, { failure: Error | null }> {
  state = { failure: null as Error | null }

  static getDerivedStateFromError(failure: Error) {
    return { failure }
  }

  componentDidCatch(failure: Error, info: ErrorInfo) {
    // Rien ne remonte nulle part — il n'y a pas de serveur à qui le dire. La
    // console reste le seul endroit où l'on puisse retrouver la trace.
    console.error('Folio s’est interrompu :', failure, info.componentStack)
  }

  render() {
    if (!this.state.failure) return this.props.children

    return (
      <div className="guard" role="alert">
        <div className="guard__sheet">
          <h1 className="guard__title">Folio s’est interrompu</h1>
          <p className="guard__lead">
            <strong>Vos notes sont intactes.</strong> Elles sont enregistrées sur cet appareil et
            n’ont pas été touchées par cette erreur. Recharger la page suffit à reprendre.
          </p>
          <button type="button" className="button is-primary" onClick={() => location.reload()}>
            Recharger
          </button>
          <p className="guard__detail">{this.state.failure.message}</p>
        </div>
      </div>
    )
  }
}
