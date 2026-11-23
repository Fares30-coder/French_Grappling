import { Link } from 'react-router';
import { ADSENSE_CLIENT } from '../features/ads/adsense';
import { HOST, LEGAL } from '../legal';
import { LegalValue } from '../ui/Todo';
import { PageHeader } from '../ui/text';
import { legalH2Class, legalPageClass, legalSectionClass } from './legal-notice';

export function PrivacyPage() {
  return (
    <main className={legalPageClass}>
      <PageHeader
        eyebrow="Tes données"
        title="Politique de confidentialité"
        lead="Tatamap collecte le strict minimum : pas de compte visiteur, pas de statistiques, pas de traceur de notre part."
      />
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Responsable du traitement</h2>
        <p className="m-0">
          <LegalValue value={LEGAL.name} label="nom de l'éditeur" /> (voir les{' '}
          <Link to="/mentions-legales" className="text-accent-bright">
            mentions légales
          </Link>
          ). Contact : <LegalValue value={LEGAL.email} label="adresse e-mail de contact" />.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Ce que le site enregistre</h2>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="text-ink">Journaux du serveur.</strong> Comme tout serveur web,
            l'hébergement conserve pour des raisons de sécurité et de dépannage l'adresse IP, la
            date et la page demandée, pendant une durée limitée (rotation automatique de quelques
            jours). Base légale : intérêt légitime (sécurité du service).
          </li>
          <li>
            <strong className="text-ink">Session d'administration.</strong> Seul l'éditeur se
            connecte au site. Pour cela, un cookie de session strictement nécessaire est déposé
            après connexion. Les visiteurs n'ont ni compte ni ce cookie.
          </li>
          <li>
            <strong className="text-ink">Aucun autre traceur.</strong> Pas d'outil de statistiques,
            pas de pixel publicitaire de notre part, pas de réseau social intégré.
          </li>
        </ul>
        <p className="m-0">
          Les techniques, positions et animations consultées sont des contenus publics : les lire ne
          crée aucune donnée à ton sujet.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Publicité (Google AdSense)</h2>
        <p className="m-0">
          {ADSENSE_CLIENT
            ? "Une colonne de publicité s'affiche à droite des pages sur ordinateur. Elle est fournie par Google AdSense."
            : "Une colonne de publicité peut s'afficher à droite des pages sur ordinateur. Elle est fournie par Google AdSense."}{' '}
          Google est alors destinataire de données de ta navigation (adresse IP, identifiants
          publicitaires, informations sur ton navigateur) et peut déposer ou lire des cookies pour
          choisir et mesurer les annonces. Ces traitements ne se font qu'avec ton accord : à ta
          première visite, le gestionnaire de consentement de Google (conforme au cadre TCF) te
          demande de les accepter ou de les refuser. Tu peux modifier ton choix à tout moment depuis
          ce même gestionnaire, et en savoir plus sur{' '}
          <a href="https://policies.google.com/technologies/ads" rel="noreferrer noopener">
            l'usage des données par Google
          </a>
          . Ces données peuvent être transférées hors de l'Union européenne, sous les garanties
          prévues par Google (clauses contractuelles types, cadre de protection des données).
        </p>
        <p className="m-0">
          Sans ton accord, les annonces ne sont pas personnalisées ; tu peux aussi les bloquer avec
          l'outil de ton choix sans que le site cesse de fonctionner.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Hébergement et durée de conservation</h2>
        <p className="m-0">
          Les données sont hébergées en France chez {HOST.name}. Le cookie de session
          d'administration expire après quelques heures d'inactivité. Les journaux sont effacés
          automatiquement au bout de quelques jours.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Tes droits</h2>
        <p className="m-0">
          Tu peux demander l'accès, la rectification ou l'effacement de tes données, t'opposer à
          leur traitement ou en demander la limitation en écrivant à{' '}
          <LegalValue value={LEGAL.email} label="adresse e-mail de contact" />. Si tu estimes que
          tes droits ne sont pas respectés, tu peux saisir la CNIL (
          <a href="https://www.cnil.fr" rel="noreferrer noopener">
            cnil.fr
          </a>
          ).
        </p>
      </section>
    </main>
  );
}
