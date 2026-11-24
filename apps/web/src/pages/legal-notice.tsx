import { Link } from 'react-router';
import { HOST, LEGAL } from '../legal';
import { LegalValue } from '../ui/Todo';
import { PageHeader } from '../ui/text';

export const legalPageClass =
  'mx-auto flex max-w-[800px] flex-col gap-8 px-4 py-10 md:px-16 md:py-14';
export const legalSectionClass = 'flex flex-col gap-2 text-[16px] leading-relaxed text-ink-muted';
export const legalH2Class = 'm-0 text-xl font-bold text-ink';

export function LegalNoticePage() {
  return (
    <main className={legalPageClass}>
      <PageHeader eyebrow="Informations légales" title="Mentions légales" />
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Éditeur du site</h2>
        <p className="m-0">
          Le site Tatamap (tatamap.fr) est édité par{' '}
          <LegalValue value={LEGAL.name} label="nom de l'éditeur" />,{' '}
          <LegalValue value={LEGAL.status} label="statut, ex. micro-entrepreneur" />, immatriculé
          sous le numéro SIRET <LegalValue value={LEGAL.siret} label="SIRET" />.
        </p>
        <p className="m-0">
          Adresse : <LegalValue value={LEGAL.address} label="adresse de l'éditeur" />
        </p>
        <p className="m-0">
          Contact : <LegalValue value={LEGAL.email} label="adresse e-mail de contact" />
        </p>
        <p className="m-0">
          Directeur de la publication :{' '}
          <LegalValue value={LEGAL.director} label="directeur de la publication" />
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Hébergeur</h2>
        <p className="m-0">
          Le site est hébergé par {HOST.name}, {HOST.address} (
          <a href={HOST.website} rel="noreferrer noopener">
            cloudflare.com
          </a>
          ). Il est servi depuis le réseau mondial de l'hébergeur, au plus près du visiteur.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Propriété intellectuelle</h2>
        <p className="m-0">
          Les textes, les animations 3D, les poses et l'identité visuelle de Tatamap sont la
          propriété de l'éditeur. Toute reproduction sans autorisation écrite est interdite, sauf
          courte citation avec mention de la source.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Responsabilité</h2>
        <p className="m-0">
          Les techniques présentées sont pédagogiques. Le jiu-jitsu est un sport de contact :
          travaille-les avec un professeur qualifié, dans un cadre encadré, et arrête-toi au moindre
          signal de ton partenaire. L'éditeur ne peut être tenu responsable d'une blessure liée à
          leur pratique.
        </p>
      </section>
      <section className={legalSectionClass}>
        <h2 className={legalH2Class}>Données personnelles</h2>
        <p className="m-0">
          Voir la{' '}
          <Link to="/confidentialite" className="text-accent-bright">
            politique de confidentialité
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
