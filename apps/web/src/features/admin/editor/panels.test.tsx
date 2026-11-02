import { STARTER_POSE } from '@tatamap/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EditorTechnique } from './editor-state';
import { JointPanel } from './JointPanel';
import { MetaForm } from './MetaForm';
import { StepsPanel } from './StepsPanel';

const technique: EditorTechnique = {
  slug: 'ciseau-test',
  name: 'Ciseau de test',
  category: 'submission',
  level: 'beginner',
  gi: 'both',
  startPositionId: 'p1',
  endPositionId: null,
  keyPoints: ['Un point'],
  commonMistakes: [],
  tagIds: [],
  steps: [
    { title: 'Départ', text: '', transitionMs: 1300, pose: STARTER_POSE },
    { title: 'Fin', text: 'x', transitionMs: 1300, pose: STARTER_POSE },
  ],
  chains: [],
};

describe('editor panels (static render)', () => {
  it('MetaForm: the slug is disabled and explained when published; arrival disabled for a submission', () => {
    const html = renderToStaticMarkup(
      <MetaForm
        technique={technique}
        positions={[{ id: 'p1', slug: 'garde', name: 'Garde', description: '', role: 'bottom' }]}
        published
        errors={{ name: 'Obligatoire.' }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('Figé tant que la technique est publiée');
    expect(html).toContain('disabled="" value="ciseau-test"');
    expect(html).toContain('Une soumission n&#x27;a pas de position d&#x27;arrivée.');
    expect(html).toContain('Obligatoire.');
    expect(html).toContain('Un point');
  });

  it('StepsPanel: lists the steps, selects the current one and forbids removing the last', () => {
    const html = renderToStaticMarkup(
      <StepsPanel steps={technique.steps} stepIndex={1} errors={{}} dispatch={() => undefined} />,
    );
    expect(html).toContain('1. Départ');
    expect(html).toContain('2. Fin');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('Titre de l&#x27;étape 2');
    const single = renderToStaticMarkup(
      <StepsPanel
        steps={technique.steps.slice(0, 1)}
        stepIndex={0}
        errors={{}}
        dispatch={() => undefined}
      />,
    );
    expect(single).toContain('aria-label="Supprimer l&#x27;étape 1" disabled=""');
  });

  it('JointPanel: offers the hand states for a selected hand only, the current one pressed', () => {
    const props = {
      position: [0, 50, 0] as const,
      onSelect: () => undefined,
      onMove: () => undefined,
    };
    const hand = renderToStaticMarkup(
      <JointPanel
        {...props}
        position={[0, 50, 0]}
        selected={{ fighter: 'me', joint: 'handR' }}
        handState="push"
        onHandState={() => undefined}
      />,
    );
    expect(hand).toContain('Main à cette étape');
    expect(hand).toMatch(/aria-pressed="true"[^>]*>Pousse</);
    expect(hand).toMatch(/aria-pressed="false"[^>]*>Auto</);
    const knee = renderToStaticMarkup(
      <JointPanel
        {...props}
        position={[0, 50, 0]}
        selected={{ fighter: 'me', joint: 'kneeL' }}
        onHandState={() => undefined}
      />,
    );
    expect(knee).not.toContain('Main à cette étape');
  });
});
