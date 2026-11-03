import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReferenceVideo } from './ReferenceVideo';

describe('ReferenceVideo (static render)', () => {
  it('offers a local file and wraps the 3D view, nothing else until a video is chosen', () => {
    const html = renderToStaticMarkup(
      <ReferenceVideo techniqueId="t1" stepIndex={0}>
        <div id="viewer" />
      </ReferenceVideo>,
    );
    expect(html).toContain('id="viewer"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="video/*"');
    expect(html).not.toContain('<video');
  });
});
